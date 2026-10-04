"""Corrective and preventive actions (CAPA): who does what, by when, and whether it's done.

  - corrective actions fix the cause of this report; preventive actions stop it happening elsewhere;
  - the report's managers (its department's supervisors, or admins) create, edit and delete actions;
  - the responsible person, or a manager, marks progress and completes them with a short note;
  - "overdue" is never stored: an action is overdue when it isn't complete and its due date has passed;
  - an incident can't go to verification until it has at least one corrective action and all of them are done,
    and a hazard can't be marked controlled while any of its actions are still open.
"""
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import t
from app.models import CorrectiveAction, Hazard, Incident, PreventiveAction, User
from app.models.enums import ActionStatus, NotificationPriority
from app.services import notifications, reports, workflow

MODELS = {"corrective": CorrectiveAction, "preventive": PreventiveAction}


def kind_of(action) -> str:
    return "corrective" if isinstance(action, CorrectiveAction) else "preventive"


def state(action, today: date | None = None) -> str:
    """pending | in_progress | completed | overdue (derived, never stored)."""
    if action.status == ActionStatus.completed:
        return "completed"
    if action.due_date < (today or date.today()):
        return "overdue"
    return "pending" if action.status == ActionStatus.pending else "in_progress"


def parent_of(db: Session, action) -> Incident | Hazard | None:
    return db.get(Incident, action.incident_id) if action.incident_id else db.get(Hazard, action.hazard_id)


def can_view(action, parent, user: User) -> bool:
    return action.responsible_id == user.id or (parent is not None and reports.can_see(parent, user))


def can_manage(parent, user: User) -> bool:
    return parent is not None and workflow.can_manage(parent, user)


def can_progress(action, parent, user: User) -> bool:
    return action.responsible_id == user.id or can_manage(parent, user)


def open_actions(db: Session, parent) -> list:
    col = "incident_id" if isinstance(parent, Incident) else "hazard_id"
    out = []
    for model in MODELS.values():
        out += db.scalars(select(model).where(getattr(model, col) == parent.id,
                                              model.status != ActionStatus.completed)).all()
    return out


def corrective_for(db: Session, parent) -> list[CorrectiveAction]:
    col = CorrectiveAction.incident_id if isinstance(parent, Incident) else CorrectiveAction.hazard_id
    return list(db.scalars(select(CorrectiveAction).where(col == parent.id)))


def out(db: Session, action, viewer: User, parent=None) -> dict:
    parent = parent if parent is not None else parent_of(db, action)
    who = db.get(User, action.responsible_id) if action.responsible_id else None
    is_incident = isinstance(parent, Incident)
    return {
        "id": action.id, "kind": kind_of(action), "description": action.description,
        "control_level": action.control_level, "priority": action.priority, "due_date": action.due_date,
        "state": state(action), "completed_at": action.completed_at, "completion_note": action.completion_note,
        "responsible": {"id": who.id, "full_name": who.full_name} if who else None,
        "report": {
            "kind": "incident" if is_incident else "hazard", "id": parent.id, "reference": parent.reference,
            "title": parent.title if is_incident else parent.category.value,
            "department_id": parent.department_id,
        } if parent is not None else None,
        "can_edit": can_manage(parent, viewer), "can_progress": can_progress(action, parent, viewer),
        "created_at": action.created_at,
    }


def _report_link(parent) -> str:
    return f"/app/reports/{'incidents' if isinstance(parent, Incident) else 'hazards'}/{parent.id}"


def tell_responsible(db: Session, action, parent, actor: User) -> None:
    if not action.responsible_id or action.responsible_id == actor.id:
        return
    notifications.notify_each(
        db, [action.responsible_id], kind="action_assigned", link="/app/actions",
        priority=NotificationPriority.warning,
        render=lambda lg: (t(lg, "note.action_assigned.title", reference=parent.reference),
                           t(lg, "note.action_assigned.body", description=action.description[:200],
                             due=action.due_date.strftime("%d %b %Y"), name=actor.full_name)),
    )


def tell_managers_done(db: Session, action, parent, actor: User) -> None:
    recipients = notifications.safety_team(db, department_id=parent.department_id, include_admins=False)
    recipients.discard(actor.id)
    note = action.completion_note
    notifications.notify_each(
        db, recipients, kind="action_completed", link=_report_link(parent),
        render=lambda lg: (t(lg, "note.action_done.title", reference=parent.reference),
                           t(lg, "note.action_done.body_note", name=actor.full_name, note=note) if note
                           else t(lg, "note.action_done.body", name=actor.full_name)),
    )


def set_progress(action, new_state: str, note: str | None) -> None:
    if new_state == "completed":
        action.status = ActionStatus.completed
        action.completed_at = datetime.now(timezone.utc)
        action.completion_note = note
    else:
        action.status = ActionStatus.in_progress if new_state == "in_progress" else ActionStatus.pending
        action.completed_at = None

