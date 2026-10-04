import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import create_access_token, decode_token, hash_password, verify_password
from app.core.config import get_settings
from app.database.session import get_db
from app.models import Department, User
from app.models.enums import RoleName
from app.schemas.auth import (
    ChangePasswordRequest, DepartmentOut, ForgotPasswordRequest, LoginRequest, RegisterRequest, RegisterResponse,
    ResetPasswordRequest, TokenResponse, UserOut, user_out,
)
from app.schemas.users import UserUpdate
from app.services import audit, mailer
from app.services.users import DuplicateUserError, create_user
from app.utils.forms import field_error
from app.utils.rate_limit import login_limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])
log = logging.getLogger(__name__)
settings = get_settings()


@router.get("/departments", response_model=list[DepartmentOut], summary="Departments for the registration form")
def registration_departments(db: Session = Depends(get_db)):
    return db.scalars(select(Department).order_by(Department.name)).all()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    if not login_limiter.hit(f"login:{ip}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many sign-in attempts. Wait a minute.")

    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        audit.record(db, "login.failed", details={"email": body.email.lower()}, request=request)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is waiting for administrator approval.")

    token, expires_in = create_access_token(str(user.id), user.role.name.value, remember=body.remember_me)
    user.last_login_at = datetime.now(timezone.utc)
    audit.record(db, "login", user_id=user.id, request=request)
    db.commit()
    return TokenResponse(access_token=token, expires_in=expires_in, user=user_out(user))


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # Workers are active immediately; supervisor accounts wait for an admin to approve them.
    needs_approval = body.role == RoleName.supervisor
    try:
        user = create_user(
            db, full_name=body.full_name, email=body.email, password=body.password, employee_id=body.employee_id,
            role=body.role, department_id=body.department_id, phone=body.phone,
            preferred_language=body.preferred_language, is_active=not needs_approval,
        )
    except DuplicateUserError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    audit.record(db, "user.register", user_id=user.id, entity_type="user", entity_id=user.id,
                 details={"role": body.role.value}, request=request)
    db.commit()
    msg = ("Account created. An administrator must approve supervisor access before you can sign in."
           if needs_approval else "Account created. You can sign in now.")
    return RegisterResponse(user=user_out(user), requires_approval=needs_approval, message=msg)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, request: Request, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(user, k, v)
    audit.record(db, "user.update_self", user_id=user.id, entity_type="user", entity_id=user.id,
                 details={"fields": sorted(changes)}, request=request)
    db.commit()
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Tokens are stateless; the client discards it. We still record the event for the audit trail.
    audit.record(db, "logout", user_id=user.id, request=request)
    db.commit()


def _reset_fingerprint(user: User) -> str:
    # Binding the token to the current hash makes it single-use: it dies once the password changes.
    return user.password_hash[-12:]


@router.post("/change-password", status_code=204, summary="Change your own password (needs the current one)")
def change_password(body: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not login_limiter.hit(f"change-password:{user.id}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Wait a minute.")
    if not verify_password(body.current_password, user.password_hash):
        raise field_error("current_password", "Your current password is not correct.")
    if body.new_password == body.current_password:
        raise field_error("new_password", "Choose a password different from the current one.")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    audit.record(db, "user.password_change", user_id=user.id, entity_type="user", entity_id=user.id, request=request)
    db.commit()


@router.post("/forgot-password", status_code=202)
def forgot_password(body: ForgotPasswordRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {"sub": str(user.id), "type": "reset", "fp": _reset_fingerprint(user), "iat": now,
             "exp": now + timedelta(minutes=30)},
            settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
        )
        link = f"{settings.app_url.rstrip('/')}/reset-password?token={token}"
        if mailer.enabled():
            # Sent after the response, so the reply takes the same time whether or not the account exists.
            background.add_task(mailer.send, user.email, "Reset your SafeOps password",
                                f"Hello {user.full_name},\n\nUse this link within 30 minutes to choose a new password:\n"
                                f"{link}\n\nIf you didn't ask for this, ignore this email; your password is unchanged.")
        else:
            # No mail server configured: the link goes to the API log, where an administrator can find it.
            log.warning("Password reset link for %s: %s", user.email, link)
    # Same response whether or not the account exists, so emails can't be enumerated.
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=204)
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired.")
    user = db.get(User, int(payload.get("sub", 0)))
    if payload.get("type") != "reset" or user is None or payload.get("fp") != _reset_fingerprint(user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired.")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    audit.record(db, "user.password_reset", user_id=user.id, request=request)
    db.commit()
