"""Audit log viewer for admins: who did what, when, from where. Read-only; entries are never edited or deleted."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.database.session import get_db
from app.models import AuditLog, User

router = APIRouter(prefix="/audit", tags=["Audit log (admin)"])


class AuditEntry(BaseModel):
    id: int
    at: datetime
    action: str
    actor_id: int | None
    actor: str | None
    entity_type: str | None
    entity_id: int | None
    details: dict | None
    ip_address: str | None


class AuditPage(BaseModel):
    items: list[AuditEntry]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditPage, summary="Search the audit log")
def audit_log(
    _: User = Depends(require_admin), db: Session = Depends(get_db),
    action: str | None = Query(None, max_length=48, description="Exact action, or a prefix such as 'incident.'"),
    actor_id: int | None = None, entity_type: str | None = Query(None, max_length=48), entity_id: int | None = None,
    q: str | None = Query(None, max_length=100, description="Search the actor's name or email"),
    date_from: date | None = None, date_to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
):
    stmt = select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.user_id)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%") if action.endswith(".") else AuditLog.action == action)
    if actor_id:
        stmt = stmt.where(AuditLog.user_id == actor_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like)))
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return AuditPage(items=[AuditEntry(id=a.id, at=a.created_at, action=a.action, actor_id=a.user_id, actor=name,
                                       entity_type=a.entity_type, entity_id=a.entity_id, details=a.details,
                                       ip_address=a.ip_address) for a, name in rows],
                     total=total, page=page, page_size=page_size)


@router.get("/actions", response_model=list[str], summary="Action names that appear in the log, for the filter")
def actions(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return list(db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action)))
