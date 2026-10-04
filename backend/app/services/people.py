"""Profiles: who may see and change whose details.

  - everyone sees and edits their own personal details;
  - admins see and manage everyone (supervisors and workers are created from their profile page);
  - supervisors see and manage the workers in their own department, and add new workers to it.
Health checks are recorded by managers only. Work history can be added by the person or a manager.
Someone outside these rules gets 404, as for reports, so profile IDs can't be probed.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HealthCheck, Location, User
from app.models.enums import RoleName
from app.services.dashboard import _ppe, _training

PERSONAL = {"full_name", "phone", "preferred_language", "date_of_birth", "gender", "blood_group", "address",
            "qualification", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone",
            "medical_notes"}
WORK = {"designation", "date_of_joining", "experience_years", "shift", "is_active"}
ADMIN_ONLY = {"department_id", "supervisor_id"}


def can_manage(viewer: User, target: User) -> bool:
    if viewer.role.name == RoleName.admin:
        return True
    return (viewer.role.name == RoleName.supervisor and target.role.name == RoleName.worker
            and target.department_id is not None and target.department_id == viewer.department_id)


def can_view(viewer: User, target: User) -> bool:
    return viewer.id == target.id or can_manage(viewer, target)


def allowed_fields(viewer: User, target: User) -> set[str]:
    fields = set()
    if viewer.id == target.id or can_manage(viewer, target):
        fields |= PERSONAL
    if can_manage(viewer, target):
        fields |= WORK
    if viewer.role.name == RoleName.admin:
        fields |= ADMIN_ONLY
    if viewer.id == target.id:
        fields.discard("is_active")  # nobody switches their own account off
    return fields


def designation(user: User) -> str | None:
    return user.designation or (user.worker_profile.job_title if user.worker_profile else None)


def profile_out(db: Session, user: User, viewer: User) -> dict:
    wp = user.worker_profile
    sup = db.get(User, wp.supervisor_id) if wp and wp.supervisor_id else None
    loc = db.get(Location, wp.primary_location_id) if wp and wp.primary_location_id else None
    manager = can_manage(viewer, user)
    return {
        **{f: getattr(user, f) for f in (
            "id", "email", "full_name", "employee_id", "phone", "preferred_language", "is_active", "date_of_birth",
            "gender", "blood_group", "address", "date_of_joining", "qualification", "experience_years",
            "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone", "medical_notes",
            "last_login_at", "created_at")},
        "role": user.role.name, "department": user.department, "designation": designation(user),
        "shift": wp.shift if wp else None,
        "supervisor": {"id": sup.id, "full_name": sup.full_name} if sup else None,
        "primary_location": {"id": loc.id, "name": loc.name} if loc else None,
        "is_me": viewer.id == user.id, "can_edit_work": manager, "can_manage_health": manager,
    }


def latest_checks(db: Session, user_ids: list[int]) -> dict[int, HealthCheck]:
    if not user_ids:
        return {}
    out: dict[int, HealthCheck] = {}
    for c in db.scalars(select(HealthCheck).where(HealthCheck.user_id.in_(user_ids))
                        .order_by(HealthCheck.user_id, HealthCheck.checked_on.desc(), HealthCheck.id.desc())):
        out.setdefault(c.user_id, c)
    return out


def ppe_and_training(db: Session, user: User) -> tuple[list[dict], list[dict]]:
    today = date.today()
    return _ppe(db, user, today)[0], _training(db, user, today)[0]
