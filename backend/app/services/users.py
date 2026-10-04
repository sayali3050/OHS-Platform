from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import Department, Role, User, Worker
from app.models.enums import Language, RoleName


class DuplicateUserError(ValueError):
    pass


def password_problem(pw: str) -> str | None:
    """The one password rule, shared by registration, resets, changes and the first admin."""
    if len(pw) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isdigit() for c in pw) or not any(c.isalpha() for c in pw):
        return "Password must contain at least one letter and one number"
    return None


def get_role(db: Session, name: RoleName) -> Role:
    role = db.scalar(select(Role).where(Role.name == name))
    if role is None:
        raise RuntimeError(f"Role {name} is missing; run the seed script")
    return role


def create_user(
    db: Session, *, full_name: str, email: str, password: str, employee_id: str, role: RoleName,
    department_id: int | None, phone: str | None = None, preferred_language: Language = Language.en,
    is_active: bool = True,
) -> User:
    email = email.lower().strip()
    if db.scalar(select(User.id).where(User.email == email)):
        raise DuplicateUserError("An account with this email already exists")
    if db.scalar(select(User.id).where(User.employee_id == employee_id)):
        raise DuplicateUserError("This employee ID is already registered")
    if department_id is not None and db.get(Department, department_id) is None:
        raise ValueError("Department not found")

    user = User(
        full_name=full_name, email=email, password_hash=hash_password(password), employee_id=employee_id,
        role=get_role(db, role), department_id=department_id, phone=phone,
        preferred_language=preferred_language, is_active=is_active,
    )
    if role in (RoleName.worker, RoleName.supervisor):
        user.worker_profile = Worker()
    db.add(user)
    db.flush()
    return user
