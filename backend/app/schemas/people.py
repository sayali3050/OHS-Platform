from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import HealthCheckResult, Language, RoleName, Shift
from app.schemas.auth import DepartmentOut
from app.schemas.dashboard import PPEStatus, TrainingStatus
from app.schemas.reports import HazardSummary, IncidentSummary, PersonRef, PlaceRef

Phone = Field(default=None, max_length=32, pattern=r"^[0-9+\-\s()]*$")
BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")


class PersonalDetails(BaseModel):
    """What anyone may change about themselves."""
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Phone
    preferred_language: Language | None = None
    date_of_birth: date | None = None
    gender: Literal["female", "male", "other", "prefer_not_to_say"] | None = None
    blood_group: str | None = None
    address: str | None = Field(default=None, max_length=300)
    qualification: str | None = Field(default=None, max_length=200)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_relation: str | None = Field(default=None, max_length=60)
    emergency_contact_phone: str | None = Phone
    medical_notes: str | None = Field(default=None, max_length=1000)

    @field_validator("blood_group")
    @classmethod
    def known_blood_group(cls, v: str | None) -> str | None:
        if v and v not in BLOOD_GROUPS:
            raise ValueError("Choose a blood group from the list")
        return v or None

    @field_validator("date_of_birth")
    @classmethod
    def plausible_birth(cls, v: date | None) -> date | None:
        if v and not (date(1940, 1, 1) <= v <= date.today()):
            raise ValueError("Enter a real date of birth")
        return v


class WorkDetails(BaseModel):
    """Employment details only a manager (admin, or the worker's supervisor) may change."""
    designation: str | None = Field(default=None, max_length=120)
    date_of_joining: date | None = None
    experience_years: int | None = Field(default=None, ge=0, le=60)
    shift: Shift | None = None
    is_active: bool | None = None


class ProfileUpdate(PersonalDetails, WorkDetails):
    department_id: int | None = None  # admins only
    supervisor_id: int | None = None  # admins only


class ProfileOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    employee_id: str
    phone: str | None
    preferred_language: Language
    role: RoleName
    department: DepartmentOut | None
    is_active: bool
    designation: str | None
    date_of_birth: date | None
    gender: str | None
    blood_group: str | None
    address: str | None
    date_of_joining: date | None
    qualification: str | None
    experience_years: int | None
    emergency_contact_name: str | None
    emergency_contact_relation: str | None
    emergency_contact_phone: str | None
    medical_notes: str | None
    shift: Shift | None
    supervisor: PersonRef | None
    primary_location: PlaceRef | None
    last_login_at: datetime | None
    created_at: datetime
    # What the viewer may do on this profile.
    is_me: bool
    can_edit_work: bool
    can_manage_health: bool


class PersonCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    employee_id: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9\-]+$")
    password: str = Field(min_length=8, max_length=128)
    role: Literal["worker", "supervisor"] = "worker"
    department_id: int | None = None  # supervisors always add people to their own department
    phone: str | None = Phone
    preferred_language: Language = Language.en
    designation: str | None = Field(default=None, max_length=120)
    date_of_joining: date | None = None
    shift: Shift | None = None

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class PersonSummary(BaseModel):
    id: int
    full_name: str
    employee_id: str
    email: str
    role: RoleName
    department: str | None
    designation: str | None
    phone: str | None
    shift: Shift | None
    is_active: bool
    last_check_result: HealthCheckResult | None
    next_check_due: date | None


class PersonPage(BaseModel):
    items: list[PersonSummary]
    total: int
    page: int
    page_size: int


class HealthCheckIn(BaseModel):
    check_type: Literal["pre_employment", "periodic", "return_to_work", "hearing", "vision", "lung_function",
                        "blood_test", "other"]
    checked_on: date
    result: HealthCheckResult
    blood_pressure: str | None = Field(default=None, max_length=16, pattern=r"^\d{2,3}/\d{2,3}$")
    pulse: int | None = Field(default=None, ge=20, le=250)
    vision: str | None = Field(default=None, max_length=40)
    hearing: str | None = Field(default=None, max_length=40)
    examiner: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    next_due_on: date | None = None

    @field_validator("checked_on")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("A check can't be recorded for a future date")
        return v


class HealthCheckOut(HealthCheckIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    recorded_by_name: str | None = None
    created_at: datetime


class WorkHistoryIn(BaseModel):
    employer: str = Field(min_length=2, max_length=160)
    role_title: str = Field(min_length=2, max_length=120)
    from_date: date | None = None
    to_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)


class WorkHistoryOut(WorkHistoryIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class PersonRecords(BaseModel):
    incidents: list[IncidentSummary]
    hazards: list[HazardSummary]  # named reports only; anonymous ones are never linked to a person
    ppe: list[PPEStatus]
    training: list[TrainingStatus]
    emergencies_raised: int
