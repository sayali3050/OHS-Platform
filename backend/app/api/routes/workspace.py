"""Everything around a report: locations, evidence files, notifications, the worker and admin dashboards."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import get_current_user, require_roles, require_staff
from app.database.session import get_db
from app.models import Attachment, Department, Notification, User
from app.models.enums import RoleName
from app.schemas.dashboard import (
    AdminDashboard, NotificationList, NotificationOut, SupervisorDashboard, WorkerDashboard,
)
from app.schemas.reports import DepartmentWithLocations, PersonRef
from app.services import admin_dashboard, dashboard, reports, supervisor_dashboard, workflow
from app.services.uploads import path_for

router = APIRouter()


@router.get("/locations", response_model=list[DepartmentWithLocations], tags=["Reference data"],
            summary="Departments and their locations, for location pickers")
def locations(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Department).options(selectinload(Department.locations)).order_by(Department.name)).all()


@router.get("/attachments/{attachment_id}", tags=["Incidents"], response_class=FileResponse,
            summary="Download report evidence (same visibility rules as the report)")
def attachment(attachment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    att = db.get(Attachment, attachment_id)
    if att is None or not reports.can_see_attachment(db, att, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    try:
        path = path_for(att)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return FileResponse(path, media_type=att.content_type, filename=att.original_filename,
                        content_disposition_type="inline",
                        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


# --- notifications ----------------------------------------------------------------------------------------------

def _unread(db: Session, user: User) -> int:
    return db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                               Notification.read_at.is_(None)))


@router.get("/notifications", response_model=NotificationList, tags=["Notifications"])
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db),
                       unread_only: bool = False, limit: int = Query(20, ge=1, le=100)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)).all()
    return NotificationList(items=[NotificationOut.model_validate(n) for n in rows], unread=_unread(db, user))


@router.get("/notifications/unread-count", tags=["Notifications"], summary="Cheap poll for the header bell")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"unread": _unread(db, user)}


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut, tags=["Notifications"])
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
    return NotificationOut.model_validate(n)


@router.post("/notifications/read-all", tags=["Notifications"])
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                        .values(read_at=datetime.now(timezone.utc)))
    db.commit()
    return {"marked": result.rowcount}


# --- staff -------------------------------------------------------------------------------------------------------

@router.get("/staff", response_model=list[PersonRef], tags=["Reference data"],
            summary="People who can investigate reports in a department (its supervisors and all admins)")
def staff(department_id: int | None = None, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    return [PersonRef(id=u.id, full_name=u.full_name) for u in workflow.eligible_investigators(db, department_id)]


# --- dashboards -------------------------------------------------------------------------------------------------

@router.get("/dashboard/worker", response_model=WorkerDashboard, tags=["Dashboards"],
            summary="Safety score with its breakdown, PPE and training status, and your recent reports")
def worker_dashboard(user: User = Depends(require_roles(RoleName.worker)), db: Session = Depends(get_db)):
    return dashboard.worker_dashboard(db, user)


@router.get("/dashboard/admin", response_model=AdminDashboard, tags=["Dashboards"],
            summary="Organisation-wide safety overview: trends, departments, compliance, health checks, emergencies")
def admin_overview(_: User = Depends(require_roles(RoleName.admin)), db: Session = Depends(get_db)):
    return admin_dashboard.build(db)


@router.get("/dashboard/supervisor", response_model=SupervisorDashboard, tags=["Dashboards"],
            summary="Workflow numbers for your department (supervisor) or everything (admin)")
def supervisor_overview(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    return supervisor_dashboard.build(db, user)
