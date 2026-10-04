"""Emergency mode: fixed general guidance, real contacts only, a site-wide alarm and a roll call.

The guidance is deliberately general (raise the alarm, get clear, call for trained help). It never gives
medical treatment instructions, and no phone number appears unless it is an official public number, configured
by an admin, or stored on a real user. All text comes from app.i18n, so everyone reads it in their own language.

Raising an alert:
  1. sounds the alarm for every active person (the app polls /emergency/active and shows a full-screen siren),
  2. asks each of them to answer "I'm safe" or "I need help" (the roll call supervisors and admins watch),
  3. opens a critical incident, so the cause is investigated and corrective actions stop it happening again.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.i18n import MESSAGES, t
from app.models import (
    EmergencyContact, EmergencyEvent, EmergencyResponse, Incident, Location, Role, User,
)
from app.models.enums import EmergencyType, IncidentStatus, Language, NotificationPriority, RoleName, Severity
from app.services import notifications
from app.services.reports import next_reference

settings = get_settings()

ACTIVE_FOR = timedelta(hours=12)  # an alarm nobody closes stops sounding after this, so it can't ring for ever
STAFF = (RoleName.supervisor, RoleName.admin)

# Emergency type -> incident category, so the follow-up incident lands in the right place in reports.
_CATEGORY = {
    EmergencyType.fire: "burn", EmergencyType.medical: "other", EmergencyType.chemical_spill: "chemical_exposure",
    EmergencyType.machinery: "caught_in_machinery", EmergencyType.electrical: "electrical",
    EmergencyType.other: "other",
}


def guides(lang: Language) -> list[dict]:
    return [{"type": e, "label": t(lang, f"emergency.{e.value}.label"), "steps": t(lang, f"emergency.{e.value}.steps")}
            for e in EmergencyType]


def site_contacts(db: Session) -> list[tuple[str, str]]:
    """Configured site numbers: EMERGENCY_CONTACTS first, then the ones admins added in the app."""
    stored = db.scalars(select(EmergencyContact).order_by(EmergencyContact.sort_order, EmergencyContact.id)).all()
    return list(settings.emergency_contacts) + [(c.label, c.phone) for c in stored]


def contacts_for(db: Session, user: User, lang: Language) -> list[dict]:
    out = [{"label": label, "phone": phone, "kind": "site"} for label, phone in site_contacts(db)]
    sup = None
    if user.worker_profile and user.worker_profile.supervisor_id:
        sup = db.get(User, user.worker_profile.supervisor_id)
    if sup is not None and sup.is_active and sup.phone:
        out.append({"label": t(lang, "emergency.supervisor_contact", name=sup.full_name), "phone": sup.phone,
                    "kind": "supervisor"})
    for service, number in settings.public_emergency_numbers:
        key = f"emergency.public.{service}"
        out.append({"label": t(lang, key) if key in MESSAGES[Language.en] else service, "phone": number,
                    "kind": "public"})
    return out


def _everyone(db: Session) -> set[int]:
    return set(db.scalars(select(User.id).where(User.is_active.is_(True))))


def _where(db: Session, lang: Language, event: EmergencyEvent, raised_by: User | None) -> str:
    loc = db.get(Location, event.location_id) if event.location_id else None
    if loc is not None:
        return loc.name
    if raised_by is not None and raised_by.department is not None:
        return raised_by.department.name
    return t(lang, "note.no_location")


def raise_alert(db: Session, user: User, emergency_type: EmergencyType, location_id: int | None,
                notes: str | None) -> tuple[EmergencyEvent, int]:
    loc = db.get(Location, location_id) if location_id else None
    if location_id and loc is None:
        raise ValueError("Choose a location from the list")
    now = datetime.now(timezone.utc)
    department_id = loc.department_id if loc else user.department_id

    # A critical incident, so the emergency goes through investigation and corrective action like any report.
    incident = Incident(
        reference=next_reference(db, Incident, "INC", now.year),
        title=t(Language.en, "emergency.incident_title", type=t(Language.en, f"emergency.{emergency_type.value}.label")),
        description=t(Language.en, "emergency.incident_body", name=user.full_name) + (f"\n\n{notes}" if notes else ""),
        category=_CATEGORY[emergency_type], severity=Severity.critical, status=IncidentStatus.reported,
        occurred_at=now, reporter_id=user.id, department_id=department_id, location_id=loc.id if loc else None,
        original_language=Language.en,
    )
    db.add(incident)
    db.flush()
    event = EmergencyEvent(user_id=user.id, emergency_type=emergency_type, location_id=loc.id if loc else None,
                           notes=notes, incident_id=incident.id)
    db.add(event)
    db.flush()

    def render(lg: Language) -> tuple[str, str]:
        where = loc.name if loc else (user.department.name if user.department else t(lg, "note.no_location"))
        phone = t(lg, "note.emergency.phone", phone=user.phone) if user.phone else ""
        body = t(lg, "note.alarm.body", name=user.full_name, phone=phone)
        if notes:
            body += t(lg, "note.emergency.notes", notes=notes)
        return t(lg, "note.emergency.title", type=t(lg, f"emergency.{emergency_type.value}.label"), where=where), body

    # Everyone hears the alarm, not just the safety team: the point is to get people clear.
    recipients = _everyone(db) - {user.id}
    notified = notifications.notify_each(db, recipients, kind="emergency_alert", link="/app/emergency",
                                         priority=NotificationPriority.critical, render=render)
    return event, notified


def alert_message(lang: Language, notified: int) -> str:
    return t(lang, "emergency.alert_sent_one") if notified == 1 else t(lang, "emergency.alert_sent", count=notified)


# --- the alarm and the roll call --------------------------------------------------------------------------------

def is_active(event: EmergencyEvent, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    created = event.created_at if event.created_at.tzinfo else event.created_at.replace(tzinfo=timezone.utc)
    return event.resolved_at is None and created > now - ACTIVE_FOR


def active_events(db: Session) -> list[EmergencyEvent]:
    since = datetime.now(timezone.utc) - ACTIVE_FOR
    return list(db.scalars(select(EmergencyEvent).where(EmergencyEvent.resolved_at.is_(None),
                                                        EmergencyEvent.created_at > since)
                           .order_by(EmergencyEvent.created_at.desc())))


def counts(db: Session, event: EmergencyEvent) -> dict:
    rows = dict(db.execute(select(EmergencyResponse.status, func.count()).where(EmergencyResponse.event_id == event.id)
                           .group_by(EmergencyResponse.status)).all())
    total = len(_everyone(db))
    safe, need_help = rows.get("safe", 0), rows.get("need_help", 0)
    return {"safe": safe, "need_help": need_help, "no_answer": max(0, total - safe - need_help), "total": total}


def describe(db: Session, event: EmergencyEvent, viewer: User, lang: Language) -> dict:
    raised_by = db.get(User, event.user_id) if event.user_id else None
    mine = db.scalar(select(EmergencyResponse.status).where(EmergencyResponse.event_id == event.id,
                                                            EmergencyResponse.user_id == viewer.id))
    staff = viewer.role.name in STAFF
    return {
        "id": event.id, "type": event.emergency_type, "label": t(lang, f"emergency.{event.emergency_type.value}.label"),
        "steps": t(lang, f"emergency.{event.emergency_type.value}.steps"),
        "where": _where(db, lang, event, raised_by), "raised_by": raised_by.full_name if raised_by else None,
        "raised_by_me": raised_by is not None and raised_by.id == viewer.id,
        "notes": event.notes, "created_at": event.created_at, "my_response": mine,
        "can_resolve": staff, "incident_id": event.incident_id if staff else None,
        "counts": counts(db, event) if staff else None,
    }


def respond(db: Session, event: EmergencyEvent, user: User, status: str) -> None:
    existing = db.scalar(select(EmergencyResponse).where(EmergencyResponse.event_id == event.id,
                                                         EmergencyResponse.user_id == user.id))
    previous = existing.status if existing else None
    now = datetime.now(timezone.utc)
    if existing is None:
        db.add(EmergencyResponse(event_id=event.id, user_id=user.id, status=status, responded_at=now))
    else:
        existing.status, existing.responded_at = status, now
    db.flush()
    if status != "need_help" or previous == "need_help":
        return  # only a new call for help alerts people; pressing it twice doesn't send it twice
    # Someone needs help: their supervisor, their department's supervisors and every admin hear it at once.
    recipients = notifications.safety_team(db, department_id=user.department_id, include_admins=True, reporter=user)

    def render(lg: Language) -> tuple[str, str]:
        phone = t(lg, "note.emergency.phone", phone=user.phone) if user.phone else ""
        where = user.department.name if user.department else t(lg, "note.no_location")
        return (t(lg, "note.need_help.title", name=user.full_name, type=t(lg, f"emergency.{event.emergency_type.value}.label")),
                t(lg, "note.need_help.body", phone=phone, where=where))

    notifications.notify_each(db, recipients, kind="emergency_need_help", link="/app/emergency",
                              priority=NotificationPriority.critical, render=render)
    db.flush()


def resolve(db: Session, event: EmergencyEvent, actor: User, note: str | None) -> None:
    event.resolved_at = datetime.now(timezone.utc)
    event.acknowledged_by = actor.id
    event.resolution_note = note

    def render(lg: Language) -> tuple[str, str]:
        label = t(lg, f"emergency.{event.emergency_type.value}.label")
        body = t(lg, "note.resolved.body_note", name=actor.full_name, note=note) if note \
            else t(lg, "note.resolved.body", name=actor.full_name)
        return t(lg, "note.resolved.title", type=label), body

    notifications.notify_each(db, _everyone(db) - {actor.id}, kind="emergency_resolved", link="/app/emergency",
                              priority=NotificationPriority.warning, render=render)
    db.flush()


def roll_call(db: Session, event: EmergencyEvent) -> list[dict]:
    """Everyone and their answer, people who need help first, then those who haven't answered."""
    answers = {r.user_id: r for r in db.scalars(select(EmergencyResponse).where(EmergencyResponse.event_id == event.id))}
    people = db.scalars(select(User).join(Role).where(User.is_active.is_(True))).unique().all()
    order = {"need_help": 0, None: 1, "safe": 2}
    rows = [{"id": u.id, "full_name": u.full_name, "role": u.role.name, "phone": u.phone,
             "department": u.department.name if u.department else None,
             "status": answers[u.id].status if u.id in answers else None,
             "responded_at": answers[u.id].responded_at if u.id in answers else None} for u in people]
    return sorted(rows, key=lambda r: (order[r["status"]], r["department"] or "", r["full_name"]))
