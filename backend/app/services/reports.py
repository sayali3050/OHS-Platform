"""Incident and hazard reporting: creation, visibility rules, notifications.

Visibility: workers see what they reported, supervisors see their department, admins see everything.
The same rule backs list, detail and attachment downloads, so a guessed ID never leaks a report.
"""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Attachment, Hazard, Incident, Location, User
from app.ai import service as ai
from app.i18n import t
from app.models.enums import Language, NotificationPriority, Priority, RoleName, Severity
from app.schemas.reports import (
    AttachmentOut, HazardCreate, HazardOut, HazardSummary, IncidentCreate, IncidentOut, IncidentSummary, PersonRef,
    PlaceRef,
)
from app.services import notifications
from app.services.uploads import CleanAudio, CleanImage, store, store_audio
from app.utils.langdetect import detect_language

SERIOUS = {Severity.high, Severity.critical}
_PRIORITY_FOR = {Severity.low: Priority.low, Severity.medium: Priority.medium, Severity.high: Priority.high,
                 Severity.critical: Priority.urgent}


class ReportError(ValueError):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field


# --- visibility -------------------------------------------------------------------------------------------------

def scope_of(user: User) -> str:
    return {RoleName.admin: "all", RoleName.supervisor: "department"}.get(user.role.name, "own")


def visible(stmt: Select, model, user: User) -> Select:
    scope = scope_of(user)
    if scope == "all":
        return stmt
    if scope == "department":
        # A supervisor without a department sees nothing rather than everything.
        return stmt.where(model.department_id == user.department_id) if user.department_id else stmt.where(False)
    return stmt.where(model.reporter_id == user.id)


def can_see(report, user: User) -> bool:
    scope = scope_of(user)
    if scope == "all":
        return True
    if scope == "department":
        return user.department_id is not None and report.department_id == user.department_id
    return report.reporter_id is not None and report.reporter_id == user.id


def can_see_attachment(db: Session, att: Attachment, user: User) -> bool:
    parent = db.get(Incident, att.incident_id) if att.incident_id else db.get(Hazard, att.hazard_id)
    return parent is not None and can_see(parent, user)


# --- helpers ----------------------------------------------------------------------------------------------------

def next_reference(db: Session, model, prefix: str, year: int) -> str:
    stem = f"{prefix}-{year}-"
    last = db.scalar(select(func.max(model.reference)).where(model.reference.like(f"{stem}%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{stem}{n:04d}"


def _location(db: Session, location_id: int | None) -> Location | None:
    if location_id is None:
        return None
    loc = db.get(Location, location_id)
    if loc is None:
        raise ReportError("location_id", "Choose a location from the list")
    return loc


def _place(obj) -> PlaceRef | None:
    return PlaceRef(id=obj.id, name=obj.name) if obj is not None else None


def _person(u: User | None) -> PersonRef | None:
    return PersonRef(id=u.id, full_name=u.full_name) if u is not None else None


def with_relations(stmt: Select, model) -> Select:
    opts = [selectinload(model.reporter), selectinload(model.department), selectinload(model.location)]
    if model is Incident:
        opts.append(selectinload(Incident.investigator))
    return stmt.options(*opts)


# --- serialisation ----------------------------------------------------------------------------------------------

def incident_summary(i: Incident) -> IncidentSummary:
    return IncidentSummary(
        id=i.id, reference=i.reference, title=i.title, category=i.category, severity=i.severity, status=i.status,
        occurred_at=i.occurred_at, created_at=i.created_at, injury_occurred=i.injury_occurred,
        department=_place(i.department), location=_place(i.location), reporter=_person(i.reporter),
    )


def incident_out(i: Incident, viewer: User | None = None) -> IncidentOut:
    from app.services.workflow import allowed_next, can_manage
    return IncidentOut(
        **incident_summary(i).model_dump(), description=i.description, original_language=i.original_language,
        original_description=i.original_description, injury_details=i.injury_details,
        people_involved=i.people_involved, investigator=_person(i.investigator),
        attachments=[AttachmentOut.model_validate(a) for a in i.attachments],
        can_manage=bool(viewer and can_manage(i, viewer)), allowed_transitions=allowed_next(i, viewer) if viewer else [],
    )


def hazard_summary(h: Hazard) -> HazardSummary:
    return HazardSummary(
        id=h.id, reference=h.reference, category=h.category, description=h.description, severity=h.severity,
        priority=h.priority, status=h.status, is_anonymous=h.is_anonymous, created_at=h.created_at,
        department=_place(h.department), location=_place(h.location),
        reporter=None if h.is_anonymous else _person(h.reporter),
    )


def hazard_out(h: Hazard, viewer: User | None = None) -> HazardOut:
    from app.services.workflow import allowed_next, can_manage
    return HazardOut(**hazard_summary(h).model_dump(), original_language=h.original_language,
                     original_description=h.original_description,
                     attachments=[AttachmentOut.model_validate(a) for a in h.attachments],
                     can_manage=bool(viewer and can_manage(h, viewer)),
                     allowed_transitions=allowed_next(h, viewer) if viewer else [])


# --- creation ---------------------------------------------------------------------------------------------------

def _english(text: str, lang: Language) -> tuple[str, str | None]:
    """(text to store as `description`, original wording). Non-English reports are translated when live AI is on;
    the worker's own words are always kept. In Demo AI mode the text is stored exactly as written."""
    if lang == Language.en:
        return text, None
    translated = ai.translate_to_english(text, lang)
    return (translated, text) if translated else (text, None)


def _where(lang: Language, loc: Location | None) -> str:
    return t(lang, "note.where", place=loc.name) if loc else ""


def _priority(severity: Severity, urgent: bool = False) -> NotificationPriority:
    if severity == Severity.critical or urgent:
        return NotificationPriority.critical
    return NotificationPriority.warning if severity in SERIOUS else NotificationPriority.info


def written_in(text: str, stated: Language | None, person: User) -> Language:
    """Nobody is asked which language they wrote in: it is read from the text, then whatever the client said,
    then the person's preferred language."""
    return detect_language(text) or stated or person.preferred_language


def create_incident(db: Session, body: IncidentCreate, reporter: User, photos: list[CleanImage],
                    voice: CleanAudio | None = None) -> Incident:
    loc = _location(db, body.location_id)
    lang = written_in(f"{body.title}\n{body.description}", body.original_language, reporter)
    description, original = _english(body.description, lang)
    incident = Incident(
        reference=next_reference(db, Incident, "INC", datetime.now(timezone.utc).year),
        title=body.title, description=description, original_description=original, category=body.category,
        severity=body.severity, occurred_at=body.occurred_at, location_id=loc.id if loc else None,
        department_id=loc.department_id if loc else reporter.department_id,
        injury_occurred=body.injury_occurred, injury_details=body.injury_details,
        people_involved=body.people_involved, reporter_id=reporter.id, original_language=lang,
    )
    db.add(incident)
    db.flush()
    for p in photos:
        db.add(store(p, incident_id=incident.id, uploaded_by=reporter.id))
    if voice is not None:
        db.add(store_audio(voice, incident_id=incident.id, uploaded_by=reporter.id))

    link = f"/app/reports/incidents/{incident.id}"
    serious = body.severity in SERIOUS or body.injury_occurred
    notifications.notify_each(
        db, notifications.safety_team(db, department_id=incident.department_id, include_admins=serious,
                                      reporter=reporter),
        kind="incident_reported", link=link, priority=_priority(body.severity, body.injury_occurred),
        render=lambda lg: (
            t(lg, "note.incident_reported.title", severity=t(lg, f"severity.{body.severity.value}"),
              where=_where(lg, loc), title=body.title),
            t(lg, "note.incident_reported.body", reference=incident.reference, name=reporter.full_name)
            + (" " + t(lg, "note.injury") if body.injury_occurred else ""),
        ),
    )
    notifications.notify_each(
        db, [reporter.id], kind="report_received", link=link,
        render=lambda lg: (t(lg, "note.received_incident.title", reference=incident.reference),
                           t(lg, "note.received_incident.body")),
    )
    db.flush()
    db.refresh(incident)
    return incident


def create_hazard(db: Session, body: HazardCreate, reporter: User, photos: list[CleanImage],
                  voice: CleanAudio | None = None) -> Hazard:
    loc = _location(db, body.location_id)
    anonymous = body.is_anonymous
    lang = written_in(body.description, body.original_language, reporter)
    description, original = _english(body.description, lang)
    hazard = Hazard(
        reference=next_reference(db, Hazard, "HAZ", datetime.now(timezone.utc).year),
        category=body.category, description=description, original_description=original, severity=body.severity,
        priority=_PRIORITY_FOR[body.severity], location_id=loc.id if loc else None,
        department_id=loc.department_id if loc else reporter.department_id,
        # Anonymous means no identity stored anywhere: not on the hazard, the photos, the audit log or notifications.
        reporter_id=None if anonymous else reporter.id, is_anonymous=anonymous, original_language=lang,
    )
    db.add(hazard)
    db.flush()
    for p in photos:
        db.add(store(p, hazard_id=hazard.id, uploaded_by=None if anonymous else reporter.id))
    if voice is not None:
        db.add(store_audio(voice, hazard_id=hazard.id, uploaded_by=None if anonymous else reporter.id))

    link = f"/app/reports/hazards/{hazard.id}"
    notifications.notify_each(
        db, notifications.safety_team(db, department_id=hazard.department_id, include_admins=body.severity in SERIOUS,
                                      reporter=None if anonymous else reporter),
        kind="hazard_reported", link=link, priority=_priority(body.severity),
        render=lambda lg: (
            t(lg, "note.hazard_reported.title", severity=t(lg, f"severity.{body.severity.value}"),
              where=_where(lg, loc), category=t(lg, f"hazard.{body.category.value}")),
            t(lg, "note.hazard_reported.anonymous", reference=hazard.reference) if anonymous
            else t(lg, "note.hazard_reported.body", reference=hazard.reference, name=reporter.full_name),
        ),
    )
    if not anonymous:
        notifications.notify_each(
            db, [reporter.id], kind="report_received", link=link,
            render=lambda lg: (t(lg, "note.received_hazard.title", reference=hazard.reference),
                               t(lg, "note.received_hazard.body")),
        )
    db.flush()
    db.refresh(hazard)
    return hazard

def date_window(stmt: Select, column, date_from: date | None, date_to: date | None) -> Select:
    """Inclusive calendar-day window on a timestamp column."""
    if date_from:
        stmt = stmt.where(column >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(column < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    return stmt
