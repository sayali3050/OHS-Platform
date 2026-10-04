from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.database.session import get_db
from app.models import Department, Role, User
from app.models.enums import RoleName
from app.schemas.auth import UserOut, user_out
from app.schemas.users import AdminUserCreate, AdminUserUpdate, UserPage
from app.services import audit
from app.services.users import DuplicateUserError, create_user, get_role

router = APIRouter(prefix="/users", tags=["Users (admin)"])


@router.get("", response_model=UserPage)
def list_users(
    db: Session = Depends(get_db), _: User = Depends(require_admin),
    q: str | None = Query(None, max_length=100, description="Search name, email or employee ID"),
    role: RoleName | None = None, department_id: int | None = None, is_active: bool | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    stmt = select(User)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), User.email.like(like),
                              func.lower(User.employee_id).like(like)))
    if role:
        stmt = stmt.join(Role).where(Role.name == role)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.full_name).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return UserPage(items=[user_out(u) for u in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=UserOut, status_code=201)
def create(body: AdminUserCreate, request: Request, db: Session = Depends(get_db),
           admin: User = Depends(require_admin)):
    try:
        user = create_user(db, **body.model_dump())
        user.must_change_password = True  # chosen by the admin; the person picks their own at first sign-in
    except DuplicateUserError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    audit.record(db, "user.create", user_id=admin.id, entity_type="user", entity_id=user.id,
                 details={"role": body.role.value}, request=request)
    db.commit()
    return user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update(user_id: int, body: AdminUserUpdate, request: Request, db: Session = Depends(get_db),
           admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    changes = body.model_dump(exclude_unset=True)
    if user.id == admin.id and (changes.get("is_active") is False or changes.get("role", RoleName.admin) != RoleName.admin):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't deactivate or demote your own account.")
    if "department_id" in changes and changes["department_id"] is not None and db.get(Department, changes["department_id"]) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Department not found")
    if "role" in changes:
        user.role = get_role(db, changes.pop("role"))
    for k, v in changes.items():
        setattr(user, k, v)
    audit.record(db, "user.update", user_id=admin.id, entity_type="user", entity_id=user.id,
                 details={"fields": sorted(body.model_dump(exclude_unset=True))}, request=request)
    db.commit()
    db.refresh(user)
    return user_out(user)
