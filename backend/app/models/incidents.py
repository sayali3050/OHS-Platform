from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin
from app.models._types import enum_col
from app.models.enums import (
    ActionStatus, ControlLevel, HazardCategory, HazardStatus, IncidentStatus, Language, Priority, RiskLevel, Severity,
)


class Incident(TimestampMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (Index("ix_incidents_dept_occurred", "department_id", "occurred_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # e.g. INC-2026-0042
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    original_language: Mapped[Language] = mapped_column(enum_col(Language), default=Language.en)
    original_description: Mapped[str | None] = mapped_column(Text)  # worker's words before translation
    category: Mapped[str | None] = mapped_column(String(64), index=True)  # slip_fall, struck_by, ...
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), index=True)
    people_involved: Mapped[str | None] = mapped_column(String(500))
    injury_occurred: Mapped[bool] = mapped_column(Boolean, default=False)
    injury_details: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[Severity] = mapped_column(enum_col(Severity), index=True, nullable=False)
    status: Mapped[IncidentStatus] = mapped_column(
        enum_col(IncidentStatus), default=IncidentStatus.reported, index=True, nullable=False
    )
    investigator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    root_cause: Mapped[str | None] = mapped_column(Text)
    ai_analysis: Mapped[dict | None] = mapped_column(JSON)  # validated structured AI output, kept for audit
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    reporter = relationship("User", foreign_keys=[reporter_id])
    investigator = relationship("User", foreign_keys=[investigator_id])


class Hazard(TimestampMixin, Base):
    __tablename__ = "hazards"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    category: Mapped[HazardCategory] = mapped_column(enum_col(HazardCategory), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    original_language: Mapped[Language] = mapped_column(enum_col(Language), default=Language.en)
    original_description: Mapped[str | None] = mapped_column(Text)
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)  # reporter_id kept NULL when anonymous
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"), index=True)
    severity: Mapped[Severity] = mapped_column(enum_col(Severity), index=True, nullable=False)
    priority: Mapped[Priority] = mapped_column(enum_col(Priority), default=Priority.medium)
    status: Mapped[HazardStatus] = mapped_column(enum_col(HazardStatus), default=HazardStatus.open, index=True)
    ai_analysis: Mapped[dict | None] = mapped_column(JSON)


class Attachment(TimestampMixin, Base):
    """Uploaded evidence. Files live under an opaque storage key, never a user-supplied path."""
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    hazard_id: Mapped[int | None] = mapped_column(ForeignKey("hazards.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    storage_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)


class RiskAssessment(TimestampMixin, Base):
    __tablename__ = "risk_assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    hazard_id: Mapped[int | None] = mapped_column(ForeignKey("hazards.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    likelihood: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    severity_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    risk_score: Mapped[int] = mapped_column(Integer, index=True, nullable=False)  # likelihood * severity
    risk_level: Mapped[RiskLevel] = mapped_column(enum_col(RiskLevel), index=True, nullable=False)
    affected_workers: Mapped[int] = mapped_column(Integer, default=0)
    exposure_frequency: Mapped[str | None] = mapped_column(String(64))
    existing_controls: Mapped[str | None] = mapped_column(Text)
    recommended_controls: Mapped[list | None] = mapped_column(JSON)  # [{level: ControlLevel, measure: str}]
    ai_explanation: Mapped[str | None] = mapped_column(Text)
    assessed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class CorrectiveAction(TimestampMixin, Base):
    __tablename__ = "corrective_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    hazard_id: Mapped[int | None] = mapped_column(ForeignKey("hazards.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    control_level: Mapped[ControlLevel | None] = mapped_column(enum_col(ControlLevel))
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    priority: Mapped[Priority] = mapped_column(enum_col(Priority), default=Priority.medium)
    status: Mapped[ActionStatus] = mapped_column(enum_col(ActionStatus), default=ActionStatus.pending, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_notes: Mapped[str | None] = mapped_column(Text)


class PreventiveAction(TimestampMixin, Base):
    __tablename__ = "preventive_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    hazard_id: Mapped[int | None] = mapped_column(ForeignKey("hazards.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    control_level: Mapped[ControlLevel | None] = mapped_column(enum_col(ControlLevel))
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    priority: Mapped[Priority] = mapped_column(enum_col(Priority), default=Priority.medium)
    status: Mapped[ActionStatus] = mapped_column(enum_col(ActionStatus), default=ActionStatus.pending, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
