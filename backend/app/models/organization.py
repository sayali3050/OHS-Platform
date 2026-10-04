from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin
from app.models._types import enum_col
from app.models.enums import HealthCheckResult, Language, RoleName, Shift


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[RoleName] = mapped_column(enum_col(RoleName), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


class Department(TimestampMixin, Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    # Department profile: what the area does, its main risks and where to go in an emergency.
    head_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL", use_alter=True))
    building: Mapped[str | None] = mapped_column(String(120))
    shift_pattern: Mapped[str | None] = mapped_column(String(120))
    working_hours: Mapped[str | None] = mapped_column(String(120))
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    risk_level: Mapped[str | None] = mapped_column(String(16))  # low | moderate | high | critical (RiskLevel)
    main_activities: Mapped[str | None] = mapped_column(Text)
    machinery: Mapped[str | None] = mapped_column(Text)
    key_hazards: Mapped[list | None] = mapped_column(JSON)    # ["Forklift traffic", ...]
    required_ppe: Mapped[list | None] = mapped_column(JSON)   # PPE item names
    assembly_point: Mapped[str | None] = mapped_column(String(200))
    first_aid_point: Mapped[str | None] = mapped_column(String(200))
    fire_equipment: Mapped[str | None] = mapped_column(String(300))

    locations: Mapped[list["Location"]] = relationship(back_populates="department", cascade="all, delete-orphan")
    head: Mapped["User | None"] = relationship(foreign_keys=[head_id], post_update=True)


class Location(Base):
    """A physical zone inside a department; the unit of the safety heatmap."""
    __tablename__ = "locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    grid_x: Mapped[int] = mapped_column(Integer, default=0)  # layout position for heatmap rendering
    grid_y: Mapped[int] = mapped_column(Integer, default=0)
    department: Mapped[Department] = relationship(back_populates="locations")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    preferred_language: Mapped[Language] = mapped_column(enum_col(Language), default=Language.en, nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Personal and employment details shown on the profile.
    designation: Mapped[str | None] = mapped_column(String(120))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(24))
    blood_group: Mapped[str | None] = mapped_column(String(8))
    address: Mapped[str | None] = mapped_column(String(300))
    date_of_joining: Mapped[date | None] = mapped_column(Date)
    qualification: Mapped[str | None] = mapped_column(String(200))
    experience_years: Mapped[int | None] = mapped_column(Integer)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120))
    emergency_contact_relation: Mapped[str | None] = mapped_column(String(60))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32))
    medical_notes: Mapped[str | None] = mapped_column(Text)  # allergies or conditions a first-aider should know

    role: Mapped[Role] = relationship(lazy="joined")
    department: Mapped[Department | None] = relationship(lazy="joined", foreign_keys=[department_id])
    worker_profile: Mapped["Worker | None"] = relationship(
        back_populates="user", uselist=False, foreign_keys="Worker.user_id", cascade="all, delete-orphan"
    )

    @property
    def role_name(self) -> RoleName:
        return self.role.name


class Worker(TimestampMixin, Base):
    """Operational profile for users on the shop floor (workers and supervisors)."""
    __tablename__ = "workers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    supervisor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    job_title: Mapped[str | None] = mapped_column(String(120))
    shift: Mapped[Shift] = mapped_column(enum_col(Shift), default=Shift.morning, nullable=False)
    primary_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    safety_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    user: Mapped[User] = relationship(back_populates="worker_profile", foreign_keys=[user_id])
    supervisor: Mapped[User | None] = relationship(foreign_keys=[supervisor_id])


class HealthCheck(TimestampMixin, Base):
    """Occupational health examination: pre-employment, periodic, return to work, hearing, vision, lung function."""
    __tablename__ = "health_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    check_type: Mapped[str] = mapped_column(String(40), nullable=False)
    checked_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    result: Mapped[HealthCheckResult] = mapped_column(enum_col(HealthCheckResult), nullable=False)
    blood_pressure: Mapped[str | None] = mapped_column(String(16))
    pulse: Mapped[int | None] = mapped_column(Integer)
    vision: Mapped[str | None] = mapped_column(String(40))
    hearing: Mapped[str | None] = mapped_column(String(40))
    examiner: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    next_due_on: Mapped[date | None] = mapped_column(Date, index=True)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class WorkHistory(TimestampMixin, Base):
    """Previous employment, so earlier experience with machines and hazards is on record."""
    __tablename__ = "work_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    employer: Mapped[str] = mapped_column(String(160), nullable=False)
    role_title: Mapped[str] = mapped_column(String(120), nullable=False)
    from_date: Mapped[date | None] = mapped_column(Date)
    to_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(500))
