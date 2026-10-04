"""Configurable safety checklists. A "No" answer suggests reporting a hazard, and the supervisor is told."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.i18n import t
from app.models import ChecklistResult, Location, SafetyChecklist, User
from app.models.enums import NotificationPriority, RoleName
from app.services import audit, notifications
from app.utils.forms import field_error

router = APIRouter(prefix="/checklists", tags=["Checklists"])


def _period_start(frequency: str, today: date) -> date:
    return today - timedelta(days=today.weekday()) if frequency == "weekly" else today


def _visible(stmt, user: User):
    if user.role.name == RoleName.admin:
        return stmt
    return stmt.where(or_(SafetyChecklist.department_id.is_(None), SafetyChecklist.department_id == user.department_id))


class ItemIn(BaseModel):
    text: str = Field(min_length=3, max_length=200)


class ChecklistIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    frequency: Literal["daily", "weekly"] = "daily"
    department_id: int | None = None
    items: list[ItemIn] = Field(min_length=1, max_length=30)
    is_active: bool = True


class ChecklistOut(BaseModel):
    id: int
    title: str
    frequency: str
    department_id: int | None
    items: list[dict]
    is_active: bool
    done_this_period: bool
    last_done: str | None
    can_edit: bool


def _can_edit(user: User, department_id: int | None) -> bool:
    return user.role.name == RoleName.admin or (user.role.name == RoleName.supervisor and department_id == user.department_id
                                                 and department_id is not None)


def _out(db: Session, c: SafetyChecklist, user: User) -> ChecklistOut:
    last = db.scalar(select(ChecklistResult.completed_at).where(ChecklistResult.checklist_id == c.id,
                                                                ChecklistResult.user_id == user.id)
                     .order_by(ChecklistResult.completed_at.desc()).limit(1))
    start = _period_start(c.frequency, date.today())
    done = bool(last and (last if last.tzinfo else last.replace(tzinfo=timezone.utc)).date() >= start)
    return ChecklistOut(id=c.id, title=c.title, frequency=c.frequency, department_id=c.department_id, items=c.items,
                        is_active=c.is_active, done_this_period=done, last_done=last.isoformat() if last else None,
                        can_edit=_can_edit(user, c.department_id))


@router.get("", response_model=list[ChecklistOut], summary="Checklists for your area, with whether you've done them this period")
def list_checklists(user: User = Depends(get_current_user), db: Session = Depends(get_db), include_inactive: bool = False):
    stmt = _visible(select(SafetyChecklist), user)
    if not include_inactive:
        stmt = stmt.where(SafetyChecklist.is_active.is_(True))
    return [_out(db, c, user) for c in db.scalars(stmt.order_by(SafetyChecklist.frequency, SafetyChecklist.title))]


def _items(items: list[ItemIn]) -> list[dict]:
    return [{"id": i + 1, "text": it.text.strip()} for i, it in enumerate(items)]


@router.post("", response_model=ChecklistOut, status_code=201, summary="Create a checklist (supervisors for their area, admins anywhere)")
def create(body: ChecklistIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    dept = body.department_id if user.role.name == RoleName.admin else user.department_id
    if not _can_edit(user, dept) and not (user.role.name == RoleName.admin and dept is None):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only create checklists for your own department.")
    c = SafetyChecklist(title=body.title.strip(), frequency=body.frequency, department_id=dept, items=_items(body.items),
                        is_active=body.is_active)
    db.add(c)
    db.flush()
    audit.record(db, "checklist.create", user_id=user.id, entity_type="checklist", entity_id=c.id, request=request)
    db.commit()
    return _out(db, c, user)


@router.put("/{checklist_id}", response_model=ChecklistOut, summary="Edit or switch off a checklist")
def update(checklist_id: int, body: ChecklistIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    c = db.get(SafetyChecklist, checklist_id)
    if c is None or not (_can_edit(user, c.department_id) or user.role.name == RoleName.admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checklist not found")
    c.title, c.frequency, c.items, c.is_active = body.title.strip(), body.frequency, _items(body.items), body.is_active
    audit.record(db, "checklist.update", user_id=user.id, entity_type="checklist", entity_id=c.id, request=request)
    db.commit()
    return _out(db, c, user)


class Answer(BaseModel):
    item_id: int
    answer: Literal["yes", "no", "na"]
    note: str | None = Field(default=None, max_length=300)


class ResultIn(BaseModel):
    location_id: int | None = None
    answers: list[Answer]

    @field_validator("answers")
    @classmethod
    def unique_items(cls, v: list[Answer]) -> list[Answer]:
        if len({a.item_id for a in v}) != len(v):
            raise ValueError("Answer each item once")
        return v


class ResultOut(BaseModel):
    id: int
    checklist_id: int
    checklist: str
    user: dict
    location: str | None
    completed_at: str
    failed_items: int
    answers: list[dict]  # with the item text
    hazard_prompts: list[str]  # "No" items worded for a hazard report


def _result_out(db: Session, r: ChecklistResult, c: SafetyChecklist) -> ResultOut:
    texts = {i["id"]: i["text"] for i in c.items}
    u = db.get(User, r.user_id)
    loc = db.get(Location, r.location_id) if r.location_id else None
    answers = [{**a, "text": texts.get(a["item_id"], "?")} for a in r.answers]
    return ResultOut(id=r.id, checklist_id=c.id, checklist=c.title, user={"id": u.id, "full_name": u.full_name},
                     location=loc.name if loc else None, completed_at=r.completed_at.isoformat(), failed_items=r.failed_items,
                     answers=answers,
                     hazard_prompts=[f"{a['text']}: no{(' (' + a['note'] + ')') if a.get('note') else ''}" for a in answers if a["answer"] == "no"])


@router.post("/{checklist_id}/results", response_model=ResultOut, status_code=201, summary="Complete a checklist")
def complete(checklist_id: int, body: ResultIn, request: Request, user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    c = db.scalar(_visible(select(SafetyChecklist).where(SafetyChecklist.id == checklist_id, SafetyChecklist.is_active.is_(True)), user))
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checklist not found")
    if {a.item_id for a in body.answers} != {i["id"] for i in c.items}:
        raise field_error("answers", "Answer every item")
    if body.location_id and db.get(Location, body.location_id) is None:
        raise field_error("location_id", "Choose a location from the list")
    failed = sum(a.answer == "no" for a in body.answers)
    r = ChecklistResult(checklist_id=c.id, user_id=user.id, location_id=body.location_id,
                        answers=[a.model_dump() for a in body.answers], failed_items=failed,
                        completed_at=datetime.now(timezone.utc))
    db.add(r)
    db.flush()
    if failed:
        recipients = notifications.safety_team(db, department_id=user.department_id, include_admins=False, reporter=user)
        notifications.notify_each(db, recipients, kind="checklist_failed", link="/app/checklists", priority=NotificationPriority.warning,
                                  render=lambda lg: (t(lg, "note.checklist.title", title=c.title, n=failed),
                                                     t(lg, "note.checklist.body", name=user.full_name)))
    audit.record(db, "checklist.complete", user_id=user.id, entity_type="checklist", entity_id=c.id,
                 details={"failed": failed}, request=request)
    db.commit()
    db.refresh(r)
    return _result_out(db, r, c)


@router.get("/results", response_model=list[ResultOut],
            summary="Recent results: yours, or (staff) your area's, with failed items first")
def results(user: User = Depends(get_current_user), db: Session = Depends(get_db), days: int = Query(14, ge=1, le=90),
            failed_only: bool = False):
    since = datetime.combine(date.today() - timedelta(days=days - 1), time.min, tzinfo=timezone.utc)
    stmt = select(ChecklistResult, SafetyChecklist).join(SafetyChecklist, SafetyChecklist.id == ChecklistResult.checklist_id) \
        .join(User, User.id == ChecklistResult.user_id).where(ChecklistResult.completed_at >= since)
    if user.role.name == RoleName.worker:
        stmt = stmt.where(ChecklistResult.user_id == user.id)
    elif user.role.name == RoleName.supervisor:
        stmt = stmt.where(User.department_id == user.department_id)
    if failed_only:
        stmt = stmt.where(ChecklistResult.failed_items > 0)
    rows = db.execute(stmt.order_by(ChecklistResult.completed_at.desc()).limit(200)).all()
    return [_result_out(db, r, c) for r, c in rows]
