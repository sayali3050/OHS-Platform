from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.models import Hazard, User
from app.models.enums import HazardCategory, HazardStatus, Severity
from app.schemas.reports import ActivityItem, HazardCreate, HazardOut, HazardPage, StatusChange
from app.services import audit, reports, workflow
from app.services.uploads import UploadRejected, read_uploads, read_voice
from app.utils.forms import field_error, parse_json_field
from app.utils.rate_limit import per_user_limit, report_limiter

router = APIRouter(prefix="/hazards", tags=["Hazards"])


@router.post("", response_model=HazardOut, status_code=201,
             summary="Report a hazard (multipart: `payload` JSON + up to 3 `photos`). Can be anonymous.")
def create_hazard(
    request: Request,
    payload: str = Form(..., description="HazardCreate as JSON"),
    photos: list[UploadFile] | None = File(None, description="JPEG, PNG or WebP, max 3"),
    voice: UploadFile | None = File(None, description="Optional voice note (WebM, Ogg, MP4/M4A, WAV or MP3)"),
    user: User = Depends(per_user_limit(report_limiter)),
    db: Session = Depends(get_db),
):
    body = parse_json_field(HazardCreate, payload)
    try:
        images = read_uploads(photos)
    except UploadRejected as e:
        raise field_error("photos", str(e))
    try:
        audio = read_voice(voice)
    except UploadRejected as e:
        raise field_error("voice", str(e))
    try:
        hazard = reports.create_hazard(db, body, user, images, audio)
    except reports.ReportError as e:
        raise field_error(e.field, str(e))
    # Anonymous reports leave no user ID or IP address in the audit trail either.
    audit.record(db, "hazard.create", user_id=None if body.is_anonymous else user.id, entity_type="hazard",
                 entity_id=hazard.id, details={"severity": body.severity.value, "anonymous": body.is_anonymous},
                 request=None if body.is_anonymous else request)
    db.commit()
    return reports.hazard_out(hazard, user)


@router.get("", response_model=HazardPage,
            summary="Hazards you may see: your own named reports (worker), your department (supervisor) or all (admin)")
def list_hazards(
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=100, description="Search reference or description"),
    status_: HazardStatus | None = Query(None, alias="status"), severity: Severity | None = None,
    category: HazardCategory | None = None, department_id: int | None = None,
    date_from: date | None = Query(None, description="Reported on or after this day"),
    date_to: date | None = Query(None, description="Reported on or before this day"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    stmt = reports.visible(select(Hazard), Hazard, user)
    if department_id:
        stmt = stmt.where(Hazard.department_id == department_id)
    stmt = reports.date_window(stmt, Hazard.created_at, date_from, date_to)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Hazard.reference).like(like), func.lower(Hazard.description).like(like)))
    if status_:
        stmt = stmt.where(Hazard.status == status_)
    if severity:
        stmt = stmt.where(Hazard.severity == severity)
    if category:
        stmt = stmt.where(Hazard.category == category)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(reports.with_relations(stmt, Hazard).order_by(Hazard.created_at.desc(), Hazard.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return HazardPage(items=[reports.hazard_summary(h) for h in rows], total=total, page=page,
                      page_size=page_size, scope=reports.scope_of(user))


@router.get("/{hazard_id}", response_model=HazardOut)
def get_hazard(hazard_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hazard = db.get(Hazard, hazard_id)
    if hazard is None or not reports.can_see(hazard, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hazard not found")
    return reports.hazard_out(hazard, user)


def _visible_hazard(db: Session, hazard_id: int, user: User) -> Hazard:
    hazard = db.get(Hazard, hazard_id)
    if hazard is None or not reports.can_see(hazard, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hazard not found")
    return hazard


@router.post("/{hazard_id}/status", response_model=HazardOut,
             summary="Move the hazard to its next workflow stage (department supervisor or admin)")
def change_status(hazard_id: int, body: StatusChange, request: Request, user: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    hazard = _visible_hazard(db, hazard_id, user)
    try:
        new = HazardStatus(body.status)
    except ValueError:
        raise field_error("status", "Unknown status")
    try:
        workflow.change_hazard_status(db, hazard, new, body.note, user, request)
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this department's supervisor or an admin can do this.")
    except workflow.WorkflowError as e:
        raise field_error("note" if "note" in str(e) else "status", str(e))
    db.commit()
    db.refresh(hazard)
    return reports.hazard_out(hazard, user)


@router.get("/{hazard_id}/activity", response_model=list[ActivityItem], summary="History of the hazard")
def activity(hazard_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _visible_hazard(db, hazard_id, user)
    return workflow.activity(db, "hazard", hazard_id)
