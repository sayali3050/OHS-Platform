from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import Language, RoleName


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    employee_id: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9\-]+$")
    department_id: int
    role: RoleName = RoleName.worker
    phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9+\-\s()]*$")
    preferred_language: Language = Language.en

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter and one number")
        return v

    @field_validator("role")
    @classmethod
    def no_self_admin(cls, v: RoleName) -> RoleName:
        if v == RoleName.admin:
            raise ValueError("Admin accounts can only be created by an existing administrator")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    full_name: str
    employee_id: str
    phone: str | None
    preferred_language: Language
    role: RoleName
    department: DepartmentOut | None
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RegisterResponse(BaseModel):
    user: UserOut
    requires_approval: bool
    message: str


def user_out(user) -> UserOut:
    """User.role is a Role row; the API exposes just its name."""
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name, employee_id=user.employee_id, phone=user.phone,
        preferred_language=user.preferred_language, role=user.role.name,
        department=DepartmentOut.model_validate(user.department) if user.department else None,
        is_active=user.is_active,
    )
