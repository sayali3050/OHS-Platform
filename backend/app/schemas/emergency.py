from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import EmergencyType, RoleName


class EmergencyContact(BaseModel):
    label: str
    phone: str
    kind: Literal["site", "supervisor", "public"]


class EmergencyGuide(BaseModel):
    type: EmergencyType
    label: str
    steps: list[str]


class EmergencyInfo(BaseModel):
    first_step: str
    contacts: list[EmergencyContact]
    contacts_configured: bool  # site numbers set up (public services are always listed)
    guides: list[EmergencyGuide]


class EmergencyAlertIn(BaseModel):
    emergency_type: EmergencyType
    location_id: int | None = None
    notes: str | None = Field(default=None, max_length=500)


class EmergencyAlertOut(BaseModel):
    id: int
    notified: int
    message: str


class RollCallCounts(BaseModel):
    safe: int
    need_help: int
    no_answer: int
    total: int


class ActiveEmergency(BaseModel):
    id: int
    type: EmergencyType
    label: str
    steps: list[str]
    where: str
    raised_by: str | None
    raised_by_me: bool
    notes: str | None
    created_at: datetime
    my_response: Literal["safe", "need_help"] | None
    can_resolve: bool
    incident_id: int | None          # staff only: the follow-up incident
    counts: RollCallCounts | None    # staff only


class RespondIn(BaseModel):
    status: Literal["safe", "need_help"]


class ResolveIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class RollCallPerson(BaseModel):
    id: int
    full_name: str
    role: RoleName
    phone: str | None
    department: str | None
    status: Literal["safe", "need_help"] | None
    responded_at: datetime | None


class RollCall(BaseModel):
    event: ActiveEmergency
    people: list[RollCallPerson]


class SiteContactIn(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=3, max_length=32, pattern=r"^[0-9+\-\s()]+$")


class SiteContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str
    phone: str
