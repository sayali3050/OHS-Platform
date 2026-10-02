from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class PPEItem(Base):
    __tablename__ = "ppe_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)  # Helmet, Safety shoes, ...
    replacement_interval_days: Mapped[int] = mapped_column(Integer, default=365)
    description: Mapped[str | None] = mapped_column(String(255))


class PPEAssignment(TimestampMixin, Base):
    __tablename__ = "ppe_assignments"
    __table_args__ = (UniqueConstraint("worker_id", "ppe_item_id", name="uq_ppe_assignment_worker_item"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id", ondelete="CASCADE"), index=True)
    ppe_item_id: Mapped[int] = mapped_column(ForeignKey("ppe_items.id", ondelete="CASCADE"), index=True)
    issued_on: Mapped[date] = mapped_column(Date, nullable=False)
    replace_by: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    inspection_status: Mapped[str] = mapped_column(String(24), default="ok")  # ok | damaged | missing
    last_inspected_on: Mapped[date | None] = mapped_column(Date)
    ppe_item: Mapped[PPEItem] = relationship(lazy="joined")
