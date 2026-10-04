"""Department profiles: what each area does, its risks, required PPE, emergency points, people and live numbers."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_admin
from app.database.session import get_db
from app.models import Department, Hazard, Incident, Location, Role, User
from app.models.enums import HazardStatus, IncidentStatus, RoleName
from app.schemas.reports import PersonRef, PlaceRef
from app.services import audit
from app.utils.forms import field_error

router = APIRouter(prefix="/departments", tags=["Departments"])

RiskLevel = Literal["low", "moderate", "high", "critical"]


class DepartmentProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    head_id: int | None = None
    building: str | None = Field(default=None, max_length=120)
    shift_pattern: str | None = Field(default=None, max_length=120)
    working_hours: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9+\-\s()]*$")
    risk_level: RiskLevel | None = None
    main_activities: str | None = Field(default=None, max_length=2000)
    machinery: str | None = Field(default=None, max_length=2000)
    key_hazards: list[str] | None = Field(default=None, max_length=20)
    required_ppe: list[str] | None = Field(default=None, max_length=20)
    assembly_point: str | None = Field(default=None, max_length=200)
    first_aid_point: str | None = Field(default=None, max_length=200)
    fire_equipment: str | None = Field(default=None, max_length=300)


class DepartmentCreate(DepartmentProfileIn):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=16, pattern=r"^[A-Za-z0-9]+$")
    locations: list[str] = Field(default_factory=list, max_length=30)


class DepartmentStats(BaseModel):
    workers: int
    supervisors: int
    open_incidents: int
    open_hazards: int
    incidents_90d: int


class DepartmentCard(BaseModel):
    id: int
    name: str
    code: str
    description: str | None
    risk_level: str | None
    building: str | None
    head: PersonRef | None
    stats: DepartmentStats


class DepartmentProfile(DepartmentCard):
    shift_pattern: str | None
    working_hours: str | None
    contact_phone: str | None
    main_activities: str | None
    machinery: str | None
    key_hazards: list[str]
    required_ppe: list[str]
    assembly_point: str | None
    first_aid_point: str | None
    fire_equipment: str | None
    locations: list[PlaceRef]
    supervisors: list[PersonRef]
    can_edit: bool


def _stats(db: Session, d: Department) -> DepartmentStats:
    def people(role: RoleName) -> int:
        return db.scalar(select(func.count(User.id)).join(Role).where(
            Role.name == role, User.department_id == d.id, User.is_active.is_(True))) or 0
    since = datetime.now(timezone.utc) - timedelta(days=90)
    return DepartmentStats(
        workers=people(RoleName.worker), supervisors=people(RoleName.supervisor),
        open_incidents=db.scalar(select(func.count(Incident.id)).where(
            Incident.department_id == d.id, Incident.status != IncidentStatus.closed)) or 0,
        open_hazards=db.scalar(select(func.count(Hazard.id)).where(
            Hazard.department_id == d.id, Hazard.status.in_([HazardStatus.open, HazardStatus.in_review]))) or 0,
        incidents_90d=db.scalar(select(func.count(Incident.id)).where(
            Incident.department_id == d.id, Incident.occurred_at >= since)) or 0,
    )


def _card(db: Session, d: Department) -> dict:
    return {"id": d.id, "name": d.name, "code": d.code, "description": d.description, "risk_level": d.risk_level,
            "building": d.building, "head": {"id": d.head.id, "full_name": d.head.full_name} if d.head else None,
            "stats": _stats(db, d)}


def _profile(db: Session, d: Department, viewer: User) -> dict:
    sups = db.scalars(select(User).join(Role).where(Role.name == RoleName.supervisor, User.department_id == d.id,
                                                    User.is_active.is_(True)).order_by(User.full_name)).unique().all()
    return {
        **_card(db, d),
        **{f: getattr(d, f) for f in ("shift_pattern", "working_hours", "contact_phone", "main_activities",
                                      "machinery", "assembly_point", "first_aid_point", "fire_equipment")},
        "key_hazards": d.key_hazards or [], "required_ppe": d.required_ppe or [],
        "locations": [{"id": loc.id, "name": loc.name} for loc in sorted(d.locations, key=lambda x: (x.grid_x, x.id))],
        "supervisors": [{"id": u.id, "full_name": u.full_name} for u in sups],
        "can_edit": viewer.role.name == RoleName.admin,
    }


def _get(db: Session, department_id: int) -> Department:
    d = db.get(Department, department_id)
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    return d


def _check_head(db: Session, head_id: int | None) -> None:
    if head_id is not None:
        head = db.get(User, head_id)
        if head is None or head.role.name not in (RoleName.supervisor, RoleName.admin):
            raise field_error("head_id", "The head must be a supervisor or an admin")


def _clean_list(items: list[str] | None) -> list[str] | None:
    return None if items is None else [s.strip()[:120] for s in items if s and s.strip()]


@router.get("", response_model=list[DepartmentCard], summary="All departments with headline numbers")
def list_departments(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_card(db, d) for d in db.scalars(select(Department).order_by(Department.name))]


@router.get("/{department_id}", response_model=DepartmentProfile, summary="A department's full profile")
def department(department_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _profile(db, _get(db, department_id), viewer)


@router.patch("/{department_id}", response_model=DepartmentProfile, summary="Update a department profile (admins)")
def update_department(department_id: int, body: DepartmentProfileIn, request: Request,
                      admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = _get(db, department_id)
    changes = body.model_dump(exclude_unset=True)
    _check_head(db, changes.get("head_id"))
    if changes.get("name") and db.scalar(select(Department.id).where(Department.name == changes["name"],
                                                                     Department.id != d.id)):
        raise field_error("name", "Another department already has this name")
    for key in ("key_hazards", "required_ppe"):
        if key in changes:
            changes[key] = _clean_list(changes[key])
    for k, v in changes.items():
        setattr(d, k, (v.strip() or None) if isinstance(v, str) else v)
    audit.record(db, "department.update", user_id=admin.id, entity_type="department", entity_id=d.id,
                 details={"fields": sorted(changes)}, request=request)
    db.commit()
    db.refresh(d)
    return _profile(db, d, admin)


@router.post("", response_model=DepartmentProfile, status_code=201, summary="Add a department (admins)")
def create_department(body: DepartmentCreate, request: Request, admin: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    code = body.code.upper()
    if db.scalar(select(Department.id).where((Department.code == code) | (Department.name == body.name))):
        raise field_error("code", "A department with this name or code already exists")
    _check_head(db, body.head_id)
    data = body.model_dump(exclude={"code", "locations"})
    for key in ("key_hazards", "required_ppe"):
        data[key] = _clean_list(data[key])
    d = Department(code=code, **data)
    d.locations = [Location(name=n.strip()[:120], grid_x=i) for i, n in enumerate(body.locations) if n.strip()]
    db.add(d)
    db.flush()
    audit.record(db, "department.create", user_id=admin.id, entity_type="department", entity_id=d.id,
                 details={"code": code}, request=request)
    db.commit()
    db.refresh(d)
    return _profile(db, d, admin)
