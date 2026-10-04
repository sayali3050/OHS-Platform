from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.database.session import get_db
from app.models import User
from app.models.enums import RoleName

bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Your session has expired or is invalid. Sign in again.",
    headers={"WWW-Authenticate": "Bearer"},
)


# What someone with a temporary password may still do: see who they are, change it, sign out, and never be
# locked out of an emergency (raise or answer the alarm, see numbers).
_ALLOWED_BEFORE_CHANGE = ("/api/auth/me", "/api/auth/change-password", "/api/auth/logout", "/api/emergency",
                          "/api/notifications")


def get_current_user(
    request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise _UNAUTHORIZED
    try:
        payload = decode_token(creds.credentials)
    except jwt.PyJWTError:
        raise _UNAUTHORIZED
    if payload.get("type") != "access":
        raise _UNAUTHORIZED
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise _UNAUTHORIZED
    if user.must_change_password and not request.url.path.startswith(_ALLOWED_BEFORE_CHANGE):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Choose your own password first.")
    return user


def require_roles(*roles: RoleName) -> Callable[[User], User]:
    """Route guard: `user = Depends(require_roles(RoleName.admin))`. Admin is not implicitly allowed."""
    allowed = set(roles)

    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role.name not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission to do this.")
        return user

    return guard


require_admin = require_roles(RoleName.admin)
require_staff = require_roles(RoleName.supervisor, RoleName.admin)
