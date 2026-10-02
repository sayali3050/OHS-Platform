from pydantic import BaseModel, Field

from app.models.enums import Language, RoleName
from app.schemas.auth import UserOut


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    preferred_language: Language | None = None


class AdminUserUpdate(UserUpdate):
    role: RoleName | None = None
    department_id: int | None = None
    is_active: bool | None = None


class AdminUserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=128)
    employee_id: str = Field(min_length=2, max_length=32)
    department_id: int | None = None
    role: RoleName
    phone: str | None = None
    preferred_language: Language = Language.en


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class UserPage(Page[UserOut]):
    pass
