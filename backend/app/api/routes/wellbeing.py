"""Ergonomics questionnaire, drudgery scoring and the daily fatigue check-in."""
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.models import Department, DrudgeryAssessment, ErgonomicAssessment, Role, User, WellbeingCheckin
from app.models.enums import NotificationPriority, RiskLevel, RoleName
from app.i18n import t
from app.services import audit, notifications
from app.services.ergonomics import (
    BODY_AREAS, DRUDGERY_FACTORS, POSTURES, drudgery_weights, fatigued, score_drudgery, score_ergonomics,
)
from app.utils.forms import field_error

router = APIRouter(tags=["Ergonomics, drudgery & wellbeing"])


def _in_scope(viewer: User, department_id: int | None) -> bool:
    return viewer.role.name == RoleName.admin or (department_id is not None and department_id == viewer.department_id)


# --- ergonomics -------------------------------------------------------------------------------------------------

class ErgonomicsIn(BaseModel):
    task_description: str | None = Field(default=None, max_length=500)
    hours_per_day: int = Field(ge=1, le=16)
    lifts_per_hour: int = Field(ge=0, le=500)
    heaviest_kg: int = Field(ge=0, le=200)
    postures: list[str] = Field(default_factory=list)
    repetitive_hand: bool = False
    vibration_tools: bool = False
    pushing_pulling: bool = False
    discomfort_areas: list[str] = Field(default_factory=list)
    discomfort_level: int = Field(ge=0, le=10)

    @field_validator("postures")
    @classmethod
    def known_postures(cls, v: list[str]) -> list[str]:
        if set(v) - set(POSTURES):
            raise ValueError("Unknown posture")
        return sorted(set(v))

    @field_validator("discomfort_areas")
    @classmethod
    def known_areas(cls, v: list[str]) -> list[str]:
        if set(v) - set(BODY_AREAS):
            raise ValueError("Unknown body area")
        return sorted(set(v))


class ErgonomicsOut(BaseModel):
    id: int
    user: dict
    task_description: str | None
    answers: dict
    risk_factors: list[str]
    recommendations: list[str]
    risk_level: RiskLevel
    created_at: str


def _ergo_out(db: Session, e: ErgonomicAssessment) -> ErgonomicsOut:
    u = db.get(User, e.user_id)
    return ErgonomicsOut(id=e.id, user={"id": u.id, "full_name": u.full_name, "department": u.department.name if u.department else None},
                         task_description=e.task_description, answers=e.answers, risk_factors=e.risk_factors or [],
                         recommendations=e.recommendations or [], risk_level=e.risk_level, created_at=e.created_at.isoformat())


@router.post("/ergonomics", response_model=ErgonomicsOut, status_code=201,
             summary="Answer the ergonomics questionnaire; the result is scored by fixed rules (not medical advice)")
def submit_ergonomics(body: ErgonomicsIn, request: Request, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    answers = body.model_dump(exclude={"task_description"})
    factors, recs, level, _ = score_ergonomics(answers)
    e = ErgonomicAssessment(user_id=user.id, task_description=body.task_description, answers=answers,
                            risk_factors=factors, recommendations=recs, risk_level=RiskLevel(level))
    db.add(e)
    db.flush()
    if level in ("high", "critical"):
        sup = user.worker_profile.supervisor_id if user.worker_profile else None
        if sup:
            notifications.notify_each(db, [sup], kind="ergonomics_high", link="/app/workload",
                                      priority=NotificationPriority.warning,
                                      render=lambda lg: (t(lg, "note.ergo.title", name=user.full_name,
                                                           level=t(lg, f"risk.level.{level}")),
                                                         t(lg, "note.ergo.body")))
    audit.record(db, "ergonomics.submit", user_id=user.id, entity_type="ergonomic_assessment", entity_id=e.id,
                 details={"level": level}, request=request)
    db.commit()
    db.refresh(e)
    return _ergo_out(db, e)


@router.get("/ergonomics", response_model=list[ErgonomicsOut],
            summary="Your own questionnaires, or (staff) your department's, highest risk first")
def list_ergonomics(scope: Literal["mine", "team"] = "mine", user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    stmt = select(ErgonomicAssessment)
    if scope == "mine" or user.role.name == RoleName.worker:
        stmt = stmt.where(ErgonomicAssessment.user_id == user.id)
    elif user.role.name == RoleName.supervisor:
        stmt = stmt.join(User, User.id == ErgonomicAssessment.user_id).where(User.department_id == user.department_id)
    rows = db.scalars(stmt.order_by(ErgonomicAssessment.created_at.desc()).limit(200)).all()
    order = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
    if scope == "team":
        rows = sorted(rows, key=lambda e: order[e.risk_level.value])
    return [_ergo_out(db, e) for e in rows]


# --- drudgery ---------------------------------------------------------------------------------------------------

class DrudgeryIn(BaseModel):
    user_id: int
    task_name: str = Field(min_length=3, max_length=200)
    factors: dict[str, int]

    @field_validator("factors")
    @classmethod
    def seven_factors(cls, v: dict[str, int]) -> dict[str, int]:
        if set(v) != set(DRUDGERY_FACTORS) or any(not 1 <= n <= 5 for n in v.values()):
            raise ValueError("Score each of the seven factors from 1 to 5")
        return v


class DrudgeryOut(BaseModel):
    id: int
    worker: dict
    department: str | None
    task_name: str
    factors: dict[str, int]
    score: int
    level: str
    interventions: list[str]
    assessed_by: str | None
    created_at: str


def _drud_out(db: Session, d: DrudgeryAssessment) -> DrudgeryOut:
    w = db.get(User, d.user_id)
    dept = db.get(Department, d.department_id) if d.department_id else None
    by = db.get(User, d.assessed_by) if d.assessed_by else None
    return DrudgeryOut(id=d.id, worker={"id": w.id, "full_name": w.full_name}, department=dept.name if dept else None,
                       task_name=d.task_name, factors=d.factors, score=d.score, level=d.level,
                       interventions=d.interventions or [], assessed_by=by.full_name if by else None,
                       created_at=d.created_at.isoformat())


@router.get("/drudgery/weights", response_model=dict[str, float], summary="Factor weights used for the score")
def weights(_: User = Depends(get_current_user)):
    return drudgery_weights()


@router.post("/drudgery", response_model=DrudgeryOut, status_code=201,
             summary="Score a worker's task on seven drudgery factors (supervisors and admins)")
def assess_drudgery(body: DrudgeryIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    worker = db.get(User, body.user_id)
    if worker is None or not _in_scope(user, worker.department_id):
        raise field_error("user_id", "Choose a worker from your department")
    score, level, worst = score_drudgery(body.factors)
    d = DrudgeryAssessment(user_id=worker.id, department_id=worker.department_id, task_name=body.task_name.strip(),
                           factors=body.factors, score=score, level=level, interventions=worst, assessed_by=user.id)
    db.add(d)
    db.flush()
    audit.record(db, "drudgery.assess", user_id=user.id, entity_type="drudgery_assessment", entity_id=d.id,
                 details={"score": score, "worker": worker.id}, request=request)
    db.commit()
    db.refresh(d)
    return _drud_out(db, d)


@router.get("/drudgery", response_model=list[DrudgeryOut], summary="Drudgery scores: yours, or your department's (staff)")
def list_drudgery(user: User = Depends(get_current_user), db: Session = Depends(get_db),
                  department_id: int | None = None):
    stmt = select(DrudgeryAssessment)
    if user.role.name == RoleName.worker:
        stmt = stmt.where(DrudgeryAssessment.user_id == user.id)
    elif user.role.name == RoleName.supervisor:
        stmt = stmt.where(DrudgeryAssessment.department_id == user.department_id)
    elif department_id:
        stmt = stmt.where(DrudgeryAssessment.department_id == department_id)
    rows = db.scalars(stmt.order_by(DrudgeryAssessment.score.desc(), DrudgeryAssessment.created_at.desc()).limit(300)).all()
    return [_drud_out(db, d) for d in rows]


@router.delete("/drudgery/{assessment_id}", status_code=204)
def delete_drudgery(assessment_id: int, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    d = db.get(DrudgeryAssessment, assessment_id)
    if d is None or not _in_scope(user, d.department_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found")
    db.delete(d)
    audit.record(db, "drudgery.delete", user_id=user.id, entity_type="drudgery_assessment", entity_id=assessment_id,
                 request=request)
    db.commit()


# --- daily check-in ---------------------------------------------------------------------------------------------

class CheckinIn(BaseModel):
    feeling: Literal["energized", "normal", "tired", "very_tired"]
    sleep_quality: int = Field(ge=1, le=5)
    workload: int = Field(ge=1, le=5)
    physical_fatigue: int = Field(ge=1, le=5)
    mental_workload: int = Field(ge=1, le=5)
    support_requested: bool = False


class CheckinOut(CheckinIn):
    checkin_date: date
    fatigued: bool


def _checkin_out(c: WellbeingCheckin) -> CheckinOut:
    return CheckinOut(feeling=c.feeling, sleep_quality=c.sleep_quality, workload=c.workload,
                      physical_fatigue=c.physical_fatigue, mental_workload=c.mental_workload,
                      support_requested=c.support_requested, checkin_date=c.checkin_date,
                      fatigued=fatigued(c.feeling, c.sleep_quality, c.physical_fatigue))


@router.put("/wellbeing/today", response_model=CheckinOut,
            summary="Today's check-in (one per day; sending again updates it)")
def checkin(body: CheckinIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    c = db.scalar(select(WellbeingCheckin).where(WellbeingCheckin.user_id == user.id, WellbeingCheckin.checkin_date == today))
    newly_asked = body.support_requested and not (c and c.support_requested)
    if c is None:
        c = WellbeingCheckin(user_id=user.id, checkin_date=today)
        db.add(c)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.flush()
    if newly_asked:
        # Asking for support is the one thing that names the person: that's the point of asking.
        recipients = notifications.safety_team(db, department_id=user.department_id, include_admins=False, reporter=user)
        notifications.notify_each(db, recipients, kind="wellbeing_support", link="/app/workload",
                                  priority=NotificationPriority.warning,
                                  render=lambda lg: (t(lg, "note.support.title", name=user.full_name),
                                                     t(lg, "note.support.body")))
    db.commit()
    db.refresh(c)
    return _checkin_out(c)


@router.get("/wellbeing/mine", response_model=list[CheckinOut], summary="Your last 14 check-ins")
def my_checkins(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(WellbeingCheckin).where(WellbeingCheckin.user_id == user.id,
                                                     WellbeingCheckin.checkin_date >= date.today() - timedelta(days=13))
                      .order_by(WellbeingCheckin.checkin_date.desc())).all()
    return [_checkin_out(c) for c in rows]


class TeamDay(BaseModel):
    day: date
    checkins: int
    fatigued: int
    avg_physical_fatigue: float | None
    avg_workload: float | None


class TeamWellbeing(BaseModel):
    people: int
    days: list[TeamDay]
    feelings_7d: dict[str, int]
    support_requests: list[dict]  # named on purpose: these people asked to be contacted
    repeatedly_fatigued: int      # a count only; individual answers stay private


@router.get("/wellbeing/team", response_model=TeamWellbeing,
            summary="Your department's check-ins as totals (staff). Only people who asked for support are named.")
def team_wellbeing(user: User = Depends(require_staff), db: Session = Depends(get_db),
                   days: int = Query(7, ge=1, le=31)):
    since = date.today() - timedelta(days=days - 1)
    stmt = select(WellbeingCheckin, User).join(User, User.id == WellbeingCheckin.user_id).where(
        WellbeingCheckin.checkin_date >= since)
    if user.role.name == RoleName.supervisor:
        stmt = stmt.where(User.department_id == user.department_id)
    rows = db.execute(stmt).all()
    people_stmt = select(User.id).join(Role).where(Role.name == RoleName.worker, User.is_active.is_(True))
    if user.role.name == RoleName.supervisor:
        people_stmt = people_stmt.where(User.department_id == user.department_id)
    per_day = []
    for i in range(days):
        d = since + timedelta(days=i)
        today_rows = [c for c, _ in rows if c.checkin_date == d]
        n = len(today_rows)
        per_day.append(TeamDay(
            day=d, checkins=n, fatigued=sum(fatigued(c.feeling, c.sleep_quality, c.physical_fatigue) for c in today_rows),
            avg_physical_fatigue=round(sum(c.physical_fatigue for c in today_rows) / n, 1) if n else None,
            avg_workload=round(sum(c.workload for c in today_rows) / n, 1) if n else None))
    feelings = {f: sum(c.feeling == f for c, _ in rows) for f in ("energized", "normal", "tired", "very_tired")}
    tired_days: dict[int, int] = {}
    for c, _ in rows:
        if fatigued(c.feeling, c.sleep_quality, c.physical_fatigue):
            tired_days[c.user_id] = tired_days.get(c.user_id, 0) + 1
    support = sorted({(u.id, u.full_name, c.checkin_date) for c, u in rows if c.support_requested}, key=lambda x: x[2], reverse=True)
    return TeamWellbeing(
        people=len(db.scalars(people_stmt).all()), days=per_day, feelings_7d=feelings,
        support_requests=[{"id": i, "full_name": n, "day": d.isoformat()} for i, n, d in support],
        repeatedly_fatigued=sum(1 for n in tired_days.values() if n >= 3),
    )
