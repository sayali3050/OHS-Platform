"""Moving reports through their workflow. Transitions are enforced here, not just hidden in the UI.

Incident: reported → assigned → investigating → corrective_action → verification → closed
          (verification can go back to corrective_action if the fix didn't work)
Hazard:   open → in_review → controlled → closed   (controlled can go back to in_review)

Only staff responsible for the report may act on it: admins anywhere, supervisors in their own department.
CAPA gates: an incident reaches verification only with at least one corrective action, all completed; a hazard
can't be marked controlled while any of its actions are open.
Every change is audit-logged with its note, and that log is the report's activity history.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import t
from app.models import AuditLog, Hazard, Incident, User
from app.models.enums import HazardStatus, IncidentStatus, NotificationPriority, RoleName
from app.services import audit, notifications

INCIDENT_NEXT: dict[IncidentStatus, list[IncidentStatus]] = {
    IncidentStatus.reported: [IncidentStatus.assigned],
    IncidentStatus.assigned: [IncidentStatus.investigating],
    IncidentStatus.investigating: [IncidentStatus.corrective_action],
    IncidentStatus.corrective_action: [IncidentStatus.verification],
    IncidentStatus.verification: [IncidentStatus.closed, IncidentStatus.corrective_action],
    IncidentStatus.closed: [],
}
HAZARD_NEXT: dict[HazardStatus, list[HazardStatus]] = {
    HazardStatus.open: [HazardStatus.in_review],
    HazardStatus.in_review: [HazardStatus.controlled],
    HazardStatus.controlled: [HazardStatus.closed, HazardStatus.in_review],
    HazardStatus.closed: [],
}


class WorkflowError(ValueError):
    pass


def can_manage(report, user: User) -> bool:
    if user.role.name == RoleName.admin:
        return True
    return (user.role.name == RoleName.supervisor and user.department_id is not None
            and report.department_id == user.department_id)


def allowed_next(report, user: User) -> list[str]:
    if not can_manage(report, user):
        return []
    table = INCIDENT_NEXT if isinstance(report, Incident) else HAZARD_NEXT
    return [s.value for s in table[report.status]]


def eligible_investigators(db: Session, department_id: int | None) -> list[User]:
    """Active admins, plus active supervisors of the report's department."""
    from app.models import Role
    users = db.scalars(select(User).join(Role).where(User.is_active.is_(True),
                                                      Role.name.in_([RoleName.supervisor, RoleName.admin]))
                       .order_by(User.full_name)).unique().all()
    return [u for u in users if u.role.name == RoleName.admin or u.department_id == department_id]


def _tell_reporter(db: Session, report, actor: User, status_key: str, note: str | None, link: str) -> None:
    if report.reporter_id is None or report.reporter_id == actor.id:
        return  # anonymous hazards have no one to tell; don't notify people about their own actions
    notifications.notify_each(
        db, [report.reporter_id], kind="status_changed", link=link,
        priority=NotificationPriority.info,
        render=lambda lg: (
            t(lg, "note.status.title", reference=report.reference, status=t(lg, status_key)),
            t(lg, "note.status.body_note", name=actor.full_name, note=note) if note
            else t(lg, "note.status.body", name=actor.full_name),
        ),
    )


def assign_incident(db: Session, incident: Incident, investigator_id: int, actor: User, request=None) -> Incident:
    if not can_manage(incident, actor):
        raise PermissionError
    if incident.status == IncidentStatus.closed:
        raise WorkflowError("A closed incident can't be reassigned")
    investigator = db.get(User, investigator_id)
    if investigator is None or investigator not in eligible_investigators(db, incident.department_id):
        raise WorkflowError("Choose a supervisor from this department or an administrator")
    previous = incident.status
    incident.investigator_id = investigator.id
    if incident.status == IncidentStatus.reported:
        incident.status = IncidentStatus.assigned
    audit.record(db, "incident.assign", user_id=actor.id, entity_type="incident", entity_id=incident.id,
                 details={"investigator": investigator.full_name, "from": previous.value, "to": incident.status.value},
                 request=request)
    link = f"/app/reports/incidents/{incident.id}"
    if investigator.id != actor.id:
        notifications.notify_each(
            db, [investigator.id], kind="assigned", link=link, priority=NotificationPriority.warning,
            render=lambda lg: (t(lg, "note.assigned.title", reference=incident.reference),
                               t(lg, "note.assigned.body", title=incident.title, name=actor.full_name)),
        )
    if previous != incident.status:
        _tell_reporter(db, incident, actor, f"incident_status.{incident.status.value}", None, link)
    return incident


def change_incident_status(db: Session, incident: Incident, new: IncidentStatus, note: str | None, actor: User,
                           request=None) -> Incident:
    if not can_manage(incident, actor):
        raise PermissionError
    if new not in INCIDENT_NEXT[incident.status]:
        raise WorkflowError(f"An incident that is '{incident.status.value}' can't move to '{new.value}'")
    if new == IncidentStatus.closed and not note:
        raise WorkflowError("Add a short closing note: what was done and how it was checked")
    if new == IncidentStatus.verification:
        from app.services.actions import corrective_for
        fixes = corrective_for(db, incident)
        if not fixes:
            raise WorkflowError("Add at least one corrective action before verification")
        if any(a.status.value != "completed" for a in fixes):
            raise WorkflowError("Complete every corrective action before verification")
    previous = incident.status
    if new == IncidentStatus.assigned and incident.investigator_id is None:
        incident.investigator_id = actor.id
    incident.status = new
    incident.closed_at = datetime.now(timezone.utc) if new == IncidentStatus.closed else None
    audit.record(db, "incident.status", user_id=actor.id, entity_type="incident", entity_id=incident.id,
                 details={"from": previous.value, "to": new.value, "note": note}, request=request)
    _tell_reporter(db, incident, actor, f"incident_status.{new.value}", note, f"/app/reports/incidents/{incident.id}")
    return incident


def change_hazard_status(db: Session, hazard: Hazard, new: HazardStatus, note: str | None, actor: User,
                         request=None) -> Hazard:
    if not can_manage(hazard, actor):
        raise PermissionError
    if new not in HAZARD_NEXT[hazard.status]:
        raise WorkflowError(f"A hazard that is '{hazard.status.value}' can't move to '{new.value}'")
    if new in (HazardStatus.controlled, HazardStatus.closed) and not note:
        raise WorkflowError("Add a short note saying what was done about the hazard")
    if new == HazardStatus.controlled:
        from app.services.actions import open_actions
        if open_actions(db, hazard):
            raise WorkflowError("Complete the open actions on this hazard before marking it controlled")
    previous = hazard.status
    hazard.status = new
    audit.record(db, "hazard.status", user_id=actor.id, entity_type="hazard", entity_id=hazard.id,
                 details={"from": previous.value, "to": new.value, "note": note}, request=request)
    _tell_reporter(db, hazard, actor, f"hazard_status.{new.value}", note, f"/app/reports/hazards/{hazard.id}")
    return hazard


def activity(db: Session, entity_type: str, entity_id: int) -> list[dict]:
    rows = db.execute(
        select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at, AuditLog.id)
    ).all()
    out = []
    for log, name in rows:
        d = log.details or {}
        out.append({"id": log.id, "action": log.action.split(".", 1)[-1], "actor": name, "at": log.created_at,
                    "from_status": d.get("from"), "to_status": d.get("to"), "note": d.get("note"),
                    "investigator": d.get("investigator")})
    return out
