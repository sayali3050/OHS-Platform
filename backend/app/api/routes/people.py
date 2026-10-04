"""Profiles and the people each role manages: admins add supervisors (and workers), supervisors add workers."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_staff
from app.auth.security import hash_password
from app.database.session import get_db
from app.models import Department, EmergencyEvent, Hazard, HealthCheck, Incident, Role, User, WorkHistory
from app.models.enums import RoleName
from app.schemas.people import (
    HealthCheckIn, HealthCheckOut, PersonCreate, PersonPage, PersonRecords, PersonSummary, ProfileOut, ProfileUpdate,
    TemporaryPassword, WorkHistoryIn, WorkHistoryOut,
)
from app.services import audit, people, reports
from app.services.users import DuplicateUserError, create_user
from app.utils.forms import field_error

router = APIRouter(prefix="/people", tags=["People & profiles"])


def _visible(db: Session, user_id: int, viewer: User) -> User:
    target = db.get(User, user_id)
    if target is None or not people.can_view(viewer, target):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    return target


def _managed(db: Session, user_id: int, viewer: User) -> User:
    target = _visible(db, user_id, viewer)
    if not people.can_manage(viewer, target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin or this person's supervisor can do this.")
    return target


@router.get("", response_model=PersonPage,
            summary="People you manage: everyone (admin) or the workers in your department (supervisor)")
def list_people(
    viewer: User = Depends(require_staff), db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=100), role: RoleName | None = None, department_id: int | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    stmt = select(User).join(Role)
    if viewer.role.name == RoleName.supervisor:
        stmt = stmt.where(Role.name == RoleName.worker, User.department_id == viewer.department_id)
    else:
        if role:
            stmt = stmt.where(Role.name == role)
        if department_id:
            stmt = stmt.where(User.department_id == department_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like),
                              func.lower(User.employee_id).like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.full_name).offset((page - 1) * page_size).limit(page_size)).unique().all()
    checks = people.latest_checks(db, [u.id for u in rows])
    items = [PersonSummary(
        id=u.id, full_name=u.full_name, employee_id=u.employee_id, email=u.email, role=u.role.name,
        department=u.department.name if u.department else None, designation=people.designation(u), phone=u.phone,
        shift=u.worker_profile.shift if u.worker_profile else None, is_active=u.is_active,
        last_check_result=checks[u.id].result if u.id in checks else None,
        next_check_due=checks[u.id].next_due_on if u.id in checks else None,
    ) for u in rows]
    return PersonPage(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ProfileOut, status_code=201,
             summary="Add a person: admins add supervisors or workers, supervisors add workers to their department")
def add_person(body: PersonCreate, request: Request, viewer: User = Depends(require_staff),
               db: Session = Depends(get_db)):
    if viewer.role.name == RoleName.supervisor:
        if body.role != "worker":
            raise field_error("role", "Supervisors can add workers only. Ask an admin to add a supervisor.")
        if viewer.department_id is None:
            raise field_error("department_id", "You have no department yet. Ask an admin to set one first.")
        department_id = viewer.department_id
    else:
        department_id = body.department_id
        if department_id is None:
            raise field_error("department_id", "Choose a department")
    try:
        user = create_user(db, full_name=body.full_name, email=str(body.email), password=body.password,
                           employee_id=body.employee_id, role=RoleName(body.role), department_id=department_id,
                           phone=body.phone or None, preferred_language=body.preferred_language)
    except DuplicateUserError as e:
        raise field_error("employee_id" if "employee" in str(e) else "email", str(e))
    except ValueError as e:
        raise field_error("department_id", str(e))
    user.designation = body.designation
    user.date_of_joining = body.date_of_joining
    user.must_change_password = True  # the manager chose it; the person picks their own at first sign-in
    if user.worker_profile is not None:
        if body.shift:
            user.worker_profile.shift = body.shift
        if body.role == "worker":
            # A supervisor's new worker reports to them; an admin's goes to the department's first supervisor.
            user.worker_profile.supervisor_id = viewer.id if viewer.role.name == RoleName.supervisor else db.scalar(
                select(User.id).join(Role).where(Role.name == RoleName.supervisor, User.department_id == department_id,
                                                 User.is_active.is_(True)).order_by(User.id).limit(1))
    db.flush()
    audit.record(db, "person.create", user_id=viewer.id, entity_type="user", entity_id=user.id,
                 details={"role": body.role, "department_id": department_id}, request=request)
    db.commit()
    db.refresh(user)
    return people.profile_out(db, user, viewer)


@router.get("/me", response_model=ProfileOut, summary="Your own full profile")
def my_profile(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return people.profile_out(db, viewer, viewer)


@router.get("/{user_id}", response_model=ProfileOut)
def get_profile(user_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return people.profile_out(db, _visible(db, user_id, viewer), viewer)


@router.patch("/{user_id}", response_model=ProfileOut,
              summary="Update a profile. Personal details: the person or a manager. Work details: managers only.")
def update_profile(user_id: int, body: ProfileUpdate, request: Request, viewer: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    changes = body.model_dump(exclude_unset=True)
    refused = set(changes) - people.allowed_fields(viewer, target)
    if refused:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"You can't change: {', '.join(sorted(refused))}. Ask an admin or the person's supervisor.")
    if "full_name" in changes and not changes["full_name"]:
        raise field_error("full_name", "Enter a name")
    if "preferred_language" in changes and changes["preferred_language"] is None:
        changes.pop("preferred_language")
    if changes.get("department_id") is not None and db.get(Department, changes["department_id"]) is None:
        raise field_error("department_id", "Department not found")
    wp = target.worker_profile
    if "supervisor_id" in changes:
        sup_id = changes.pop("supervisor_id")
        if sup_id is not None:
            sup = db.get(User, sup_id)
            if sup is None or sup.role.name not in (RoleName.supervisor, RoleName.admin):
                raise field_error("supervisor_id", "Choose a supervisor from the list")
        if wp is not None:
            wp.supervisor_id = sup_id
    if "shift" in changes:
        shift = changes.pop("shift")
        if wp is not None and shift is not None:
            wp.shift = shift
    for k, v in changes.items():
        setattr(target, k, v.strip() if isinstance(v, str) else v)
    audit.record(db, "profile.update", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 details={"fields": sorted(body.model_dump(exclude_unset=True))}, request=request)
    db.commit()
    db.refresh(target)
    return people.profile_out(db, target, viewer)


# --- health checks ----------------------------------------------------------------------------------------------

def _check_out(db: Session, c: HealthCheck) -> HealthCheckOut:
    by = db.get(User, c.recorded_by) if c.recorded_by else None
    return HealthCheckOut.model_validate(c).model_copy(update={"recorded_by_name": by.full_name if by else None})


@router.get("/{user_id}/health-checks", response_model=list[HealthCheckOut], summary="Health check history, newest first")
def health_checks(user_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    rows = db.scalars(select(HealthCheck).where(HealthCheck.user_id == target.id)
                      .order_by(HealthCheck.checked_on.desc(), HealthCheck.id.desc())).all()
    return [_check_out(db, c) for c in rows]


@router.post("/{user_id}/health-checks", response_model=HealthCheckOut, status_code=201,
             summary="Record a health check (admins, or the worker's supervisor)")
def add_health_check(user_id: int, body: HealthCheckIn, request: Request, viewer: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    target = _managed(db, user_id, viewer)
    if body.next_due_on and body.next_due_on <= body.checked_on:
        raise field_error("next_due_on", "The next check must be after this one")
    check = HealthCheck(user_id=target.id, recorded_by=viewer.id, **body.model_dump())
    db.add(check)
    db.flush()
    audit.record(db, "health_check.create", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 details={"type": body.check_type, "result": body.result.value}, request=request)
    db.commit()
    return _check_out(db, check)


@router.delete("/{user_id}/health-checks/{check_id}", status_code=204)
def delete_health_check(user_id: int, check_id: int, request: Request, viewer: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    target = _managed(db, user_id, viewer)
    check = db.get(HealthCheck, check_id)
    if check is None or check.user_id != target.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Health check not found")
    db.delete(check)
    audit.record(db, "health_check.delete", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 details={"check_id": check_id}, request=request)
    db.commit()


# --- work history -----------------------------------------------------------------------------------------------

@router.get("/{user_id}/work-history", response_model=list[WorkHistoryOut])
def work_history(user_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    return db.scalars(select(WorkHistory).where(WorkHistory.user_id == target.id)
                      .order_by(WorkHistory.from_date.desc().nulls_last(), WorkHistory.id.desc())).all()


@router.post("/{user_id}/work-history", response_model=WorkHistoryOut, status_code=201,
             summary="Add previous employment (the person themselves or a manager)")
def add_work_history(user_id: int, body: WorkHistoryIn, request: Request, viewer: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    if body.from_date and body.to_date and body.to_date < body.from_date:
        raise field_error("to_date", "The end date must be after the start date")
    row = WorkHistory(user_id=target.id, **body.model_dump())
    db.add(row)
    db.flush()
    audit.record(db, "work_history.create", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 request=request)
    db.commit()
    return row


@router.delete("/{user_id}/work-history/{row_id}", status_code=204)
def delete_work_history(user_id: int, row_id: int, request: Request, viewer: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    row = db.get(WorkHistory, row_id)
    if row is None or row.user_id != target.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    db.delete(row)
    audit.record(db, "work_history.delete", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 request=request)
    db.commit()


# --- previous records -------------------------------------------------------------------------------------------

@router.get("/{user_id}/records", response_model=PersonRecords,
            summary="Reports they made, PPE issued, training and emergencies raised")
def records(user_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = _visible(db, user_id, viewer)
    incidents = db.scalars(reports.with_relations(select(Incident), Incident).where(Incident.reporter_id == target.id)
                           .order_by(Incident.created_at.desc()).limit(50)).all()
    hazards = db.scalars(reports.with_relations(select(Hazard), Hazard).where(Hazard.reporter_id == target.id)
                         .order_by(Hazard.created_at.desc()).limit(50)).all()
    ppe, training = people.ppe_and_training(db, target)
    return PersonRecords(
        incidents=[reports.incident_summary(i) for i in incidents], hazards=[reports.hazard_summary(h) for h in hazards],
        ppe=ppe, training=training,
        emergencies_raised=db.scalar(select(func.count(EmergencyEvent.id)).where(EmergencyEvent.user_id == target.id)),
    )


_TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i: easy to read out or copy from a screen


def _temporary_password() -> str:
    while True:
        pw = "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(10))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return f"{pw[:5]}-{pw[5:]}"


@router.post("/{user_id}/reset-password", response_model=TemporaryPassword,
             summary="Give someone you manage a temporary password (for people without email). Shown once.")
def reset_password(user_id: int, request: Request, viewer: User = Depends(require_staff),
                   db: Session = Depends(get_db)):
    target = _managed(db, user_id, viewer)
    if target.id == viewer.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use Change password on your own profile instead.")
    temp = _temporary_password()
    target.password_hash = hash_password(temp)
    target.must_change_password = True
    audit.record(db, "person.password_reset", user_id=viewer.id, entity_type="user", entity_id=target.id,
                 request=request)
    db.commit()
    return TemporaryPassword(temporary_password=temp)
