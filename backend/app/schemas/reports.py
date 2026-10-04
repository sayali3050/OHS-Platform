from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.models.enums import HazardCategory, HazardStatus, IncidentStatus, Language, Priority, Severity
from app.schemas.users import Page

# Free-text column in the schema; the API restricts it to this list so reports can be grouped reliably.
INCIDENT_CATEGORIES = (
    "near_miss", "slip_trip_fall", "fall_from_height", "struck_by", "caught_in_machinery", "manual_handling",
    "cut_laceration", "burn", "chemical_exposure", "electrical", "vehicle", "other",
)
IncidentCategory = Literal[
    "near_miss", "slip_trip_fall", "fall_from_height", "struck_by", "caught_in_machinery", "manual_handling",
    "cut_laceration", "burn", "chemical_exposure", "electrical", "vehicle", "other",
]


def _clean(v):
    """Trim text; whitespace-only optional fields become null."""
    if isinstance(v, str):
        return v.strip() or None
    return v


class IncidentCreate(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    category: IncidentCategory
    severity: Severity
    occurred_at: datetime
    location_id: int | None = None
    injury_occurred: bool = False
    injury_details: str | None = Field(default=None, max_length=2000, validate_default=True)
    people_involved: str | None = Field(default=None, max_length=500)
    original_language: Language | None = None

    @field_validator("title", "description", "injury_details", "people_involved", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)

    @field_validator("occurred_at")
    @classmethod
    def not_in_future(cls, v: datetime) -> datetime:
        v = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if v > now + timedelta(minutes=5):  # small allowance for phone clocks
            raise ValueError("The time can't be in the future")
        if v < now - timedelta(days=365):
            raise ValueError("Report incidents from the last 12 months")
        return v

    @field_validator("injury_details")
    @classmethod
    def injury_needs_details(cls, v: str | None, info: ValidationInfo) -> str | None:
        if not info.data.get("injury_occurred"):
            return None
        if not v:
            raise ValueError("Describe the injury, even briefly")
        return v


class HazardCreate(BaseModel):
    category: HazardCategory
    description: str = Field(min_length=10, max_length=5000)
    severity: Severity
    location_id: int | None = None
    is_anonymous: bool = False
    original_language: Language | None = None

    @field_validator("description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)


class PersonRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class PlaceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    original_filename: str
    content_type: str
    size_bytes: int


class IncidentSummary(BaseModel):
    id: int
    reference: str
    title: str
    category: str | None
    severity: Severity
    status: IncidentStatus
    occurred_at: datetime
    created_at: datetime
    injury_occurred: bool
    department: PlaceRef | None
    location: PlaceRef | None
    reporter: PersonRef | None


class IncidentOut(IncidentSummary):
    description: str
    original_language: Language
    original_description: str | None  # the reporter's own words when `description` is a translation
    can_manage: bool = False          # true when the viewer may assign / change status
    allowed_transitions: list[IncidentStatus] = []
    injury_details: str | None
    people_involved: str | None
    investigator: PersonRef | None
    attachments: list[AttachmentOut]


class HazardSummary(BaseModel):
    id: int
    reference: str
    category: HazardCategory
    description: str
    severity: Severity
    priority: Priority
    status: HazardStatus
    is_anonymous: bool
    created_at: datetime
    department: PlaceRef | None
    location: PlaceRef | None
    reporter: PersonRef | None  # always None for anonymous reports: no identity is stored


class HazardOut(HazardSummary):
    original_language: Language
    original_description: str | None
    attachments: list[AttachmentOut]
    can_manage: bool = False
    allowed_transitions: list[HazardStatus] = []


class StatusChange(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)


class AssignIn(BaseModel):
    investigator_id: int


class ActivityItem(BaseModel):
    id: int
    action: str
    actor: str | None
    at: datetime
    from_status: str | None
    to_status: str | None
    note: str | None
    investigator: str | None


class IncidentPage(Page[IncidentSummary]):
    scope: Literal["own", "department", "all"]


class HazardPage(Page[HazardSummary]):
    scope: Literal["own", "department", "all"]


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class DepartmentWithLocations(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str
    locations: list[LocationOut]


class BoardCard(BaseModel):
    """One incident on the workflow board."""
    id: int
    reference: str
    title: str
    severity: Severity
    status: IncidentStatus
    injury_occurred: bool
    department: str | None
    investigator: str | None
    days_open: int
    actions_open: int
    actions_overdue: int
