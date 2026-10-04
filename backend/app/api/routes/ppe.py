"""PPE: what's issued to whom, when it must be replaced, inspections, and workers reporting damage."""
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.database.session import get_db
from app.i18n import t
from app.models import PPEAssignment, PPEItem, Role, User, Worker
from app.models.enums import NotificationPriority, RoleName
from app.services import audit, notifications
from app.services.dashboard import DUE_SOON_DAYS
from app.services.people import can_manage
from app.utils.forms import field_error

router = APIRouter(prefix="/ppe", tags=["PPE"])


def ppe_state(a: PPEAssignment, today: date | None = None) -> str:
    today = today or date.today()
    if a.inspection_status != "ok":
        return a.inspection_status  # damaged | missing
    if a.replace_by < today:
        return "overdue"
    return "due_soon" if a.replace_by <= today + timedelta(days=DUE_SOON_DAYS) else "ok"


class ItemOut(BaseModel):
    id: int
    name: str
    replacement_interval_days: int


class AssignmentOut(BaseModel):
    id: int
    worker: dict
    item: ItemOut
    issued_on: date
    replace_by: date
    last_inspected_on: date | None
    state: str
    can_manage: bool


def _out(db: Session, a: PPEAssignment, viewer: User) -> AssignmentOut:
    w = db.get(Worker, a.worker_id)
    u = w.user
    return AssignmentOut(id=a.id, worker={"id": u.id, "full_name": u.full_name, "department": u.department.name if u.department else None},
                         item=ItemOut.model_validate(a.ppe_item, from_attributes=True), issued_on=a.issued_on, replace_by=a.replace_by,
                         last_inspected_on=a.last_inspected_on, state=ppe_state(a), can_manage=can_manage(viewer, u))


@router.get("/items", response_model=list[ItemOut])
def items(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [ItemOut.model_validate(i, from_attributes=True) for i in db.scalars(select(PPEItem).order_by(PPEItem.name))]


@router.get("/assignments", response_model=list[AssignmentOut],
            summary="PPE issued: your own (worker), your department (supervisor) or everyone (admin); problems first")
def assignments(user: User = Depends(get_current_user), db: Session = Depends(get_db), user_id: int | None = None):
    stmt = select(PPEAssignment).join(Worker, Worker.id == PPEAssignment.worker_id).join(User, User.id == Worker.user_id)
    if user.role.name == RoleName.worker:
        stmt = stmt.where(User.id == user.id)
    elif user.role.name == RoleName.supervisor:
        stmt = stmt.where(User.department_id == user.department_id)
    if user_id:
        stmt = stmt.where(User.id == user_id)
    rows = db.scalars(stmt).all()
    order = {"missing": 0, "damaged": 1, "overdue": 2, "due_soon": 3, "ok": 4}
    rows = sorted(rows, key=lambda a: (order[ppe_state(a)], a.replace_by))
    return [_out(db, a, user) for a in rows]


class IssueIn(BaseModel):
    user_id: int
    ppe_item_id: int


@router.post("/issue", response_model=AssignmentOut, summary="Issue or replace an item (a fresh one, inspected today)")
def issue(body: IssueIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    target = db.get(User, body.user_id)
    item = db.get(PPEItem, body.ppe_item_id)
    if target is None or not can_manage(user, target) or target.worker_profile is None:
        raise field_error("user_id", "Choose a worker you manage")
    if item is None:
        raise field_error("ppe_item_id", "Choose an item")
    a = db.scalar(select(PPEAssignment).where(PPEAssignment.worker_id == target.worker_profile.id,
                                              PPEAssignment.ppe_item_id == item.id))
    today = date.today()
    if a is None:
        a = PPEAssignment(worker_id=target.worker_profile.id, ppe_item_id=item.id)
        db.add(a)
    a.issued_on, a.replace_by = today, today + timedelta(days=item.replacement_interval_days)
    a.inspection_status, a.last_inspected_on = "ok", today
    db.flush()
    audit.record(db, "ppe.issue", user_id=user.id, entity_type="ppe_assignment", entity_id=a.id,
                 details={"worker": target.id, "item": item.name}, request=request)
    db.commit()
    db.refresh(a)
    return _out(db, a, user)


class InspectIn(BaseModel):
    inspection_status: Literal["ok", "damaged", "missing"]


@router.post("/assignments/{assignment_id}/inspect", response_model=AssignmentOut, summary="Record an inspection")
def inspect(assignment_id: int, body: InspectIn, request: Request, user: User = Depends(require_staff),
            db: Session = Depends(get_db)):
    a = db.get(PPEAssignment, assignment_id)
    if a is None or not can_manage(user, db.get(Worker, a.worker_id).user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    a.inspection_status, a.last_inspected_on = body.inspection_status, date.today()
    audit.record(db, "ppe.inspect", user_id=user.id, entity_type="ppe_assignment", entity_id=a.id,
                 details={"status": body.inspection_status}, request=request)
    db.commit()
    db.refresh(a)
    return _out(db, a, user)


class ReportIn(BaseModel):
    problem: Literal["damaged", "missing"]


@router.post("/assignments/{assignment_id}/report", response_model=AssignmentOut,
             summary="A worker reports their own item damaged or missing; their supervisor is told")
def report(assignment_id: int, body: ReportIn, request: Request, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    a = db.get(PPEAssignment, assignment_id)
    if a is None or user.worker_profile is None or a.worker_id != user.worker_profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    a.inspection_status = body.problem
    item = a.ppe_item.name
    recipients = notifications.safety_team(db, department_id=user.department_id, include_admins=False, reporter=user)
    notifications.notify_each(db, recipients, kind="ppe_problem", link="/app/ppe", priority=NotificationPriority.warning,
                              render=lambda lg: (t(lg, "note.ppe.title", name=user.full_name, item=item),
                                                 t(lg, f"note.ppe.{body.problem}")))
    audit.record(db, "ppe.report", user_id=user.id, entity_type="ppe_assignment", entity_id=a.id,
                 details={"problem": body.problem}, request=request)
    db.commit()
    db.refresh(a)
    return _out(db, a, user)


class ItemSummary(BaseModel):
    item: str
    issued: int
    ok: int
    due_soon: int
    overdue: int
    damaged_or_missing: int


@router.get("/summary", response_model=list[ItemSummary], summary="Per item: how many are fine, due or a problem (staff)")
def summary(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = assignments(user=user, db=db, user_id=None)
    out: dict[str, dict] = {}
    for r in rows:
        s = out.setdefault(r.item.name, {"item": r.item.name, "issued": 0, "ok": 0, "due_soon": 0, "overdue": 0, "damaged_or_missing": 0})
        s["issued"] += 1
        s["damaged_or_missing" if r.state in ("damaged", "missing") else r.state] += 1
    return [ItemSummary(**v) for v in sorted(out.values(), key=lambda v: -(v["overdue"] + v["damaged_or_missing"]))]


@router.get("/workers", response_model=list[dict], summary="Workers you can issue PPE to")
def workers(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    stmt = select(User).join(Role).where(Role.name == RoleName.worker, User.is_active.is_(True))
    if user.role.name == RoleName.supervisor:
        stmt = stmt.where(User.department_id == user.department_id)
    return [{"id": u.id, "full_name": u.full_name, "department": u.department.name if u.department else None}
            for u in db.scalars(stmt.order_by(User.full_name)).unique()]
