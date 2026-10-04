from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.models import CorrectiveAction, Incident, PreventiveAction, User
from app.models.enums import IncidentStatus, Severity
from app.schemas.reports import (
    ActivityItem, AssignIn, BoardCard, IncidentCategory, IncidentCreate, IncidentOut, IncidentPage, StatusChange,
)
from app.services import audit, reports, workflow
from app.services.actions import state as action_state
from app.services.uploads import UploadRejected, read_uploads, read_voice
from app.utils.forms import field_error, parse_json_field
from app.utils.rate_limit import per_user_limit, report_limiter

router = APIRouter(prefix="/incidents", tags=["Incidents"])


@router.post("", response_model=IncidentOut, status_code=201,
             summary="Report an incident (multipart: `payload` JSON + up to 3 `photos`)")
def create_incident(
    request: Request,
    payload: str = Form(..., description="IncidentCreate as JSON"),
    photos: list[UploadFile] | None = File(None, description="JPEG, PNG or WebP, max 3"),
    voice: UploadFile | None = File(None, description="Optional voice note (WebM, Ogg, MP4/M4A, WAV or MP3)"),
    user: User = Depends(per_user_limit(report_limiter)),
    db: Session = Depends(get_db),
):
    body = parse_json_field(IncidentCreate, payload)
    try:
        images = read_uploads(photos)
    except UploadRejected as e:
        raise field_error("photos", str(e))
    try:
        audio = read_voice(voice)
    except UploadRejected as e:
        raise field_error("voice", str(e))
    try:
        incident = reports.create_incident(db, body, user, images, audio)
    except reports.ReportError as e:
        raise field_error(e.field, str(e))
    audit.record(db, "incident.create", user_id=user.id, entity_type="incident", entity_id=incident.id,
                 details={"severity": body.severity.value, "photos": len(images)}, request=request)
    db.commit()
    return reports.incident_out(incident, user)


@router.get("", response_model=IncidentPage,
            summary="Incidents you may see: your own (worker), your department (supervisor) or all (admin)")
def list_incidents(
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=100, description="Search reference, title or description"),
    status_: IncidentStatus | None = Query(None, alias="status"), severity: Severity | None = None,
    department_id: int | None = None, category: IncidentCategory | None = None,
    date_from: date | None = Query(None, description="Occurred on or after this day"),
    date_to: date | None = Query(None, description="Occurred on or before this day"),
    assigned_to_me: bool = Query(False, description="Only incidents you are investigating"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    stmt = reports.visible(select(Incident), Incident, user)
    if department_id:
        stmt = stmt.where(Incident.department_id == department_id)
    if category:
        stmt = stmt.where(Incident.category == category)
    if assigned_to_me:
        stmt = stmt.where(Incident.investigator_id == user.id)
    stmt = reports.date_window(stmt, Incident.occurred_at, date_from, date_to)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Incident.reference).like(like), func.lower(Incident.title).like(like),
                              func.lower(Incident.description).like(like)))
    if status_:
        stmt = stmt.where(Incident.status == status_)
    if severity:
        stmt = stmt.where(Incident.severity == severity)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(reports.with_relations(stmt, Incident).order_by(Incident.created_at.desc(), Incident.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return IncidentPage(items=[reports.incident_summary(i) for i in rows], total=total, page=page,
                        page_size=page_size, scope=reports.scope_of(user))


@router.get("/board", response_model=list[BoardCard],
            summary="Open incidents (and the last 30 days' closed ones) as cards for the workflow board. Staff only.")
def board(user: User = Depends(require_staff), db: Session = Depends(get_db), department_id: int | None = None):
    now = datetime.now(timezone.utc)
    stmt = reports.with_relations(reports.visible(select(Incident), Incident, user), Incident).where(
        or_(Incident.status != IncidentStatus.closed, Incident.closed_at >= now - timedelta(days=30)))
    if department_id:
        stmt = stmt.where(Incident.department_id == department_id)
    rows = db.scalars(stmt.order_by(Incident.created_at.desc())).all()
    ids = [i.id for i in rows]
    acts = []
    if ids:
        for model in (CorrectiveAction, PreventiveAction):
            acts += db.scalars(select(model).where(model.incident_id.in_(ids))).all()
    cards = []
    for i in rows:
        mine = [a for a in acts if a.incident_id == i.id]
        created = i.created_at if i.created_at.tzinfo else i.created_at.replace(tzinfo=timezone.utc)
        cards.append(BoardCard(
            id=i.id, reference=i.reference, title=i.title, severity=i.severity, status=i.status,
            injury_occurred=i.injury_occurred, department=i.department.name if i.department else None,
            investigator=i.investigator.full_name if i.investigator else None,
            days_open=(now - created).days,
            actions_open=sum(action_state(a) != "completed" for a in mine),
            actions_overdue=sum(action_state(a) == "overdue" for a in mine),
        ))
    return cards


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incident = db.get(Incident, incident_id)
    # 404 rather than 403 for reports outside your scope, so IDs can't be probed.
    if incident is None or not reports.can_see(incident, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return reports.incident_out(incident, user)


def _visible_incident(db: Session, incident_id: int, user: User) -> Incident:
    incident = db.get(Incident, incident_id)
    if incident is None or not reports.can_see(incident, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return incident


@router.post("/{incident_id}/status", response_model=IncidentOut,
             summary="Move the incident to its next workflow stage (department supervisor or admin)")
def change_status(incident_id: int, body: StatusChange, request: Request, user: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    incident = _visible_incident(db, incident_id, user)
    try:
        new = IncidentStatus(body.status)
    except ValueError:
        raise field_error("status", "Unknown status")
    try:
        workflow.change_incident_status(db, incident, new, body.note, user, request)
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this department's supervisor or an admin can do this.")
    except workflow.WorkflowError as e:
        raise field_error("note" if "note" in str(e) else "status", str(e))
    db.commit()
    db.refresh(incident)
    return reports.incident_out(incident, user)


@router.get("/{incident_id}/activity", response_model=list[ActivityItem], summary="History of the incident")
def activity(incident_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _visible_incident(db, incident_id, user)
    return workflow.activity(db, "incident", incident_id)


@router.post("/{incident_id}/assign", response_model=IncidentOut, summary="Assign an investigator")
def assign(incident_id: int, body: AssignIn, request: Request, user: User = Depends(require_staff),
           db: Session = Depends(get_db)):
    incident = _visible_incident(db, incident_id, user)
    try:
        workflow.assign_incident(db, incident, body.investigator_id, user, request)
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this department's supervisor or an admin can do this.")
    except workflow.WorkflowError as e:
        raise field_error("investigator_id", str(e))
    db.commit()
    db.refresh(incident)
    return reports.incident_out(incident, user)
