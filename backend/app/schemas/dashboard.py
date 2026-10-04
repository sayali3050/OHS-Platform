from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import NotificationPriority
from app.schemas.reports import HazardSummary, IncidentSummary


class ScoreComponent(BaseModel):
    key: Literal["ppe", "training", "checklists"]
    label: str
    score: int
    weight: float
    explanation: str


class PPEStatus(BaseModel):
    name: str
    issued_on: date
    replace_by: date
    status: Literal["ok", "due_soon", "overdue", "damaged", "missing"]
    compliant: bool


class TrainingStatus(BaseModel):
    course_id: int
    title: str
    category: str
    mandatory: bool
    status: Literal["valid", "expiring", "expired", "in_progress", "not_started"]
    completion_pct: int
    expires_on: date | None
    current: bool


class RecentIncident(IncidentSummary):
    kind: Literal["incident"]


class RecentHazard(HazardSummary):
    kind: Literal["hazard"]


class ReportCounts(BaseModel):
    open_incidents: int
    open_hazards: int
    recent: list[Annotated[RecentIncident | RecentHazard, Field(discriminator="kind")]]


class WorkerDashboard(BaseModel):
    score: int | None
    band: Literal["good", "fair", "needs_attention"] | None
    method: str
    components: list[ScoreComponent]
    ppe: list[PPEStatus]
    training: list[TrainingStatus]
    checklists: dict[str, int]
    reports: ReportCounts


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    priority: NotificationPriority
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


# --- admin overview ---------------------------------------------------------------------------------------------

class AdminKpis(BaseModel):
    open_incidents: int
    open_hazards: int
    critical_open: int
    incidents_this_month: int
    incidents_last_month: int
    injuries_90d: int
    days_since_injury: int | None
    overdue_actions: int
    anonymous_hazards_90d: int


class TrendPoint(BaseModel):
    month: str  # YYYY-MM
    incidents: int
    hazards: int
    injuries: int


class CategoryCount(BaseModel):
    category: str
    count: int


class DepartmentStat(BaseModel):
    id: int
    name: str
    code: str
    risk_level: str | None
    workers: int
    open_incidents: int
    open_hazards: int
    incidents_90d: int
    ppe_compliance: int | None
    training_compliance: int | None


class PPESummary(BaseModel):
    ok: int
    due_soon: int
    overdue: int
    damaged: int
    compliance: int | None


class TrainingSummary(BaseModel):
    compliance: int | None
    gaps: int


class HealthSummary(BaseModel):
    overdue: int
    due_30d: int
    restricted: int
    never_checked: int


class ActiveEmergencySummary(BaseModel):
    id: int
    type: str
    created_at: datetime
    raised_by: str | None
    safe: int
    need_help: int
    no_answer: int
    total: int


class RecentEmergency(BaseModel):
    id: int
    type: str
    created_at: datetime
    resolved_at: datetime | None
    incident_id: int | None


class EmergencySummary(BaseModel):
    active: list[ActiveEmergencySummary]
    recent: list[RecentEmergency]


class SystemSummary(BaseModel):
    ai_mode: Literal["demo", "live"]
    ai_model: str | None
    demo_data: bool


class AdminDashboard(BaseModel):
    kpis: AdminKpis
    trend: list[TrendPoint]
    open_by_severity: dict[str, int]
    hazard_categories: list[CategoryCount]
    ppe: PPESummary
    training: TrainingSummary
    departments: list[DepartmentStat]
    health: HealthSummary
    emergencies: EmergencySummary
    system: SystemSummary


class SupervisorDashboard(BaseModel):
    scope: Literal["department", "all"]
    incidents_by_status: dict[str, int]
    hazards_by_status: dict[str, int]
    unassigned_over_24h: int
    actions_overdue: int
    actions_due_7d: int
    my_open_actions: int
    closed_30d: int
    avg_days_to_close: float | None  # incidents closed in the last 90 days
    injuries_30d: int
