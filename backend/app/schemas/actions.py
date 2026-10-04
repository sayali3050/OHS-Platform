from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import ControlLevel, Priority
from app.schemas.reports import PersonRef

ActionKind = Literal["corrective", "preventive"]
ActionState = Literal["pending", "in_progress", "completed", "overdue"]


class ActionCreate(BaseModel):
    kind: ActionKind = "corrective"
    incident_id: int | None = None
    hazard_id: int | None = None
    description: str = Field(min_length=5, max_length=2000)
    control_level: ControlLevel | None = None
    responsible_id: int | None = None
    due_date: date
    priority: Priority = Priority.medium

    @field_validator("description", mode="before")
    @classmethod
    def strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def one_report(self):
        if (self.incident_id is None) == (self.hazard_id is None):
            raise ValueError("Link the action to exactly one incident or hazard")
        return self


class ActionUpdate(BaseModel):
    """Managers may change anything; the responsible person may only change state and completion_note."""
    description: str | None = Field(default=None, min_length=5, max_length=2000)
    control_level: ControlLevel | None = None
    responsible_id: int | None = None
    due_date: date | None = None
    priority: Priority | None = None
    state: Literal["pending", "in_progress", "completed"] | None = None
    completion_note: str | None = Field(default=None, max_length=1000)


class ActionReport(BaseModel):
    kind: Literal["incident", "hazard"]
    id: int
    reference: str
    title: str
    department_id: int | None


class ActionOut(BaseModel):
    id: int
    kind: ActionKind
    description: str
    control_level: ControlLevel | None
    priority: Priority
    due_date: date
    state: ActionState
    completed_at: datetime | None
    completion_note: str | None
    responsible: PersonRef | None
    report: ActionReport | None
    can_edit: bool
    can_progress: bool
    created_at: datetime


class ActionPage(BaseModel):
    items: list[ActionOut]
    total: int
    page: int
    page_size: int
    counts: dict[str, int]  # open / overdue / completed within the same scope, for the tabs
