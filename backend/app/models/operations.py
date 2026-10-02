"""Checklists, ergonomics/drudgery, wellbeing, emergencies, notifications, feedback."""
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin
from app.models._types import enum_col
from app.models.enums import EmergencyType, NotificationPriority, RiskLevel


class SafetyChecklist(TimestampMixin, Base):
    __tablename__ = "safety_checklists"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    frequency: Mapped[str] = mapped_column(String(16), default="daily")
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    items: Mapped[list] = mapped_column(JSON, nullable=False)  # [{id, text}]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ChecklistResult(TimestampMixin, Base):
    __tablename__ = "checklist_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    checklist_id: Mapped[int] = mapped_column(ForeignKey("safety_checklists.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    answers: Mapped[list] = mapped_column(JSON, nullable=False)  # [{item_id, answer: yes|no|na, note}]
    failed_items: Mapped[int] = mapped_column(Integer, default=0, index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class ErgonomicAssessment(TimestampMixin, Base):
    """Worker questionnaire (section 22). Stores answers + non-medical risk summary."""
    __tablename__ = "ergonomic_assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_description: Mapped[str | None] = mapped_column(Text)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False)
    risk_factors: Mapped[list | None] = mapped_column(JSON)
    recommendations: Mapped[list | None] = mapped_column(JSON)
    risk_level: Mapped[RiskLevel] = mapped_column(enum_col(RiskLevel), index=True, nullable=False)


class DrudgeryAssessment(TimestampMixin, Base):
    """Configurable factor scoring (section 21): each factor 1..5, weighted to a 0..100 score."""
    __tablename__ = "drudgery_assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    task_name: Mapped[str] = mapped_column(String(200), nullable=False)
    factors: Mapped[dict] = mapped_column(JSON, nullable=False)  # repetition, load, duration, posture, ...
    score: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    level: Mapped[str] = mapped_column(String(16), index=True, nullable=False)  # low | moderate | high
    interventions: Mapped[list | None] = mapped_column(JSON)


class WellbeingCheckin(TimestampMixin, Base):
    __tablename__ = "wellbeing_checkins"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    checkin_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    feeling: Mapped[str] = mapped_column(String(16), nullable=False)  # energized | normal | tired | very_tired
    sleep_quality: Mapped[int] = mapped_column(Integer)  # 1..5
    workload: Mapped[int] = mapped_column(Integer)
    physical_fatigue: Mapped[int] = mapped_column(Integer)
    mental_workload: Mapped[int] = mapped_column(Integer)
    support_requested: Mapped[bool] = mapped_column(Boolean, default=False)


class EmergencyEvent(TimestampMixin, Base):
    __tablename__ = "emergency_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    emergency_type: Mapped[EmergencyType] = mapped_column(enum_col(EmergencyType), nullable=False)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"))
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(48), nullable=False)  # incident_update, ppe_replacement, ...
    priority: Mapped[NotificationPriority] = mapped_column(
        enum_col(NotificationPriority), default=NotificationPriority.info, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255))  # in-app route, e.g. /incidents/12
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class WorkerFeedback(TimestampMixin, Base):
    __tablename__ = "worker_feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))  # NULL if anonymous
    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # suggestion | improvement | feedback
    body: Mapped[str] = mapped_column(Text, nullable=False)
    ai_category: Mapped[str | None] = mapped_column(String(32), index=True)
