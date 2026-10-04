"""Risk register: likelihood x severity on a 5x5 matrix, controls by the hierarchy, an AI explanation of the result."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import service as ai
from app.api.routes.ai import ai_limiter
from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.models import Department, Hazard, Location, RiskAssessment, User
from app.models.enums import ControlLevel, RiskLevel, RoleName
from app.schemas.reports import PersonRef, PlaceRef
from app.services import audit
from app.services.ergonomics import risk_level
from app.utils.forms import field_error
from app.utils.rate_limit import per_user_limit

router = APIRouter(prefix="/risk-assessments", tags=["Risk register"])


class Control(BaseModel):
    level: ControlLevel
    measure: str = Field(min_length=3, max_length=300)


class RiskIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    hazard_id: int | None = None
    department_id: int | None = None
    location_id: int | None = None
    likelihood: int = Field(ge=1, le=5)
    severity_score: int = Field(ge=1, le=5)
    affected_workers: int = Field(default=0, ge=0, le=10000)
    exposure_frequency: str | None = Field(default=None, pattern="^(rarely|monthly|weekly|daily|continuous)$")
    existing_controls: str | None = Field(default=None, max_length=2000)
    recommended_controls: list[Control] = Field(default_factory=list, max_length=10)
    review_due: date | None = None


class RiskOut(BaseModel):
    id: int
    title: str
    hazard: dict | None
    department: PlaceRef | None
    location: PlaceRef | None
    likelihood: int
    severity_score: int
    risk_score: int
    risk_level: RiskLevel
    affected_workers: int
    exposure_frequency: str | None
    existing_controls: str | None
    recommended_controls: list[Control]
    ai_explanation: str | None
    assessed_by: PersonRef | None
    review_due: date | None
    review_overdue: bool
    created_at: str
    updated_at: str
    can_edit: bool


def _can_edit(user: User, department_id: int | None) -> bool:
    if user.role.name == RoleName.admin:
        return True
    return user.role.name == RoleName.supervisor and department_id is not None and department_id == user.department_id


def _visible(stmt, user: User):
    """Admins see everything; everyone else sees their own department's register."""
    if user.role.name == RoleName.admin:
        return stmt
    return stmt.where(RiskAssessment.department_id == user.department_id) if user.department_id else stmt.where(False)


def _out(db: Session, r: RiskAssessment, user: User) -> RiskOut:
    dept = db.get(Department, r.department_id) if r.department_id else None
    loc = db.get(Location, r.location_id) if r.location_id else None
    hz = db.get(Hazard, r.hazard_id) if r.hazard_id else None
    who = db.get(User, r.assessed_by) if r.assessed_by else None
    return RiskOut(
        id=r.id, title=r.title, hazard={"id": hz.id, "reference": hz.reference} if hz else None,
        department=PlaceRef(id=dept.id, name=dept.name) if dept else None,
        location=PlaceRef(id=loc.id, name=loc.name) if loc else None,
        likelihood=r.likelihood, severity_score=r.severity_score, risk_score=r.risk_score, risk_level=r.risk_level,
        affected_workers=r.affected_workers or 0, exposure_frequency=r.exposure_frequency,
        existing_controls=r.existing_controls, recommended_controls=r.recommended_controls or [],
        ai_explanation=r.ai_explanation, assessed_by=PersonRef(id=who.id, full_name=who.full_name) if who else None,
        review_due=r.review_due, review_overdue=bool(r.review_due and r.review_due < date.today()),
        created_at=r.created_at.isoformat(), updated_at=r.updated_at.isoformat(),
        can_edit=_can_edit(user, r.department_id),
    )


def _get(db: Session, risk_id: int, user: User) -> RiskAssessment:
    r = db.scalar(_visible(select(RiskAssessment).where(RiskAssessment.id == risk_id), user))
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk assessment not found")
    return r


def _apply(db: Session, r: RiskAssessment, body: RiskIn, user: User) -> None:
    if body.location_id:
        loc = db.get(Location, body.location_id)
        if loc is None:
            raise field_error("location_id", "Choose a location from the list")
        body.department_id = loc.department_id
    if body.hazard_id:
        hz = db.get(Hazard, body.hazard_id)
        if hz is None:
            raise field_error("hazard_id", "Hazard not found")
        body.department_id = body.department_id or hz.department_id
    if user.role.name == RoleName.supervisor:
        body.department_id = body.department_id or user.department_id
    if not _can_edit(user, body.department_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only assess risks in your own department.")
    for k, v in body.model_dump(exclude={"recommended_controls"}).items():
        setattr(r, k, v)
    r.recommended_controls = [c.model_dump(mode="json") for c in body.recommended_controls]
    r.risk_score = body.likelihood * body.severity_score  # always computed here, never sent by the client
    r.risk_level = RiskLevel(risk_level(r.risk_score))


@router.get("", response_model=list[RiskOut], summary="The risk register you can see, highest risk first")
def list_risks(user: User = Depends(get_current_user), db: Session = Depends(get_db),
               level: RiskLevel | None = None, department_id: int | None = None,
               likelihood: int | None = Query(None, ge=1, le=5), severity: int | None = Query(None, ge=1, le=5)):
    stmt = _visible(select(RiskAssessment), user)
    if level:
        stmt = stmt.where(RiskAssessment.risk_level == level)
    if department_id:
        stmt = stmt.where(RiskAssessment.department_id == department_id)
    if likelihood:
        stmt = stmt.where(RiskAssessment.likelihood == likelihood)
    if severity:
        stmt = stmt.where(RiskAssessment.severity_score == severity)
    rows = db.scalars(stmt.order_by(RiskAssessment.risk_score.desc(), RiskAssessment.updated_at.desc())).all()
    return [_out(db, r, user) for r in rows]


@router.get("/matrix", response_model=list[list[int]],
            summary="Counts on the 5x5 matrix: rows are severity 5..1, columns likelihood 1..5")
def matrix(user: User = Depends(get_current_user), db: Session = Depends(get_db), department_id: int | None = None):
    stmt = _visible(select(RiskAssessment.likelihood, RiskAssessment.severity_score, func.count()), user)
    if department_id:
        stmt = stmt.where(RiskAssessment.department_id == department_id)
    counts = {(lk, sv): n for lk, sv, n in db.execute(stmt.group_by(RiskAssessment.likelihood, RiskAssessment.severity_score))}
    return [[counts.get((lk, sv), 0) for lk in range(1, 6)] for sv in range(5, 0, -1)]


@router.post("", response_model=RiskOut, status_code=201, summary="Add a risk assessment (supervisors and admins)")
def create_risk(body: RiskIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    r = RiskAssessment(assessed_by=user.id)
    _apply(db, r, body, user)
    db.add(r)
    db.flush()
    audit.record(db, "risk.create", user_id=user.id, entity_type="risk_assessment", entity_id=r.id,
                 details={"score": r.risk_score}, request=request)
    db.commit()
    db.refresh(r)
    return _out(db, r, user)


@router.put("/{risk_id}", response_model=RiskOut, summary="Update a risk assessment; the score is recalculated")
def update_risk(risk_id: int, body: RiskIn, request: Request, user: User = Depends(require_staff),
                db: Session = Depends(get_db)):
    r = _get(db, risk_id, user)
    if not _can_edit(user, r.department_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit risks in your own department.")
    before = r.risk_score
    _apply(db, r, body, user)
    r.assessed_by = user.id
    if r.risk_score != before:
        r.ai_explanation = None  # the old explanation no longer matches the numbers
    audit.record(db, "risk.update", user_id=user.id, entity_type="risk_assessment", entity_id=r.id,
                 details={"from": before, "to": r.risk_score}, request=request)
    db.commit()
    db.refresh(r)
    return _out(db, r, user)


@router.delete("/{risk_id}", status_code=204)
def delete_risk(risk_id: int, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    r = _get(db, risk_id, user)
    if not _can_edit(user, r.department_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only remove risks in your own department.")
    db.delete(r)
    audit.record(db, "risk.delete", user_id=user.id, entity_type="risk_assessment", entity_id=risk_id, request=request)
    db.commit()


@router.post("/{risk_id}/explain", response_model=RiskOut, summary="AI explanation of the (already calculated) result")
def explain(risk_id: int, user: User = Depends(per_user_limit(ai_limiter)), db: Session = Depends(get_db)):
    r = _get(db, risk_id, user)
    r.ai_explanation, _ = ai.explain_risk(r, user.preferred_language)
    db.commit()
    db.refresh(r)
    return _out(db, r, user)
