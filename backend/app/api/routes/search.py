"""One search box for the whole app. Every result list applies the same visibility rules as its own page."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database.session import get_db
from app.models import Department, Hazard, Incident, Role, User
from app.models.enums import RoleName
from app.schemas.reports import HazardSummary, IncidentSummary
from app.services import people, reports

router = APIRouter(prefix="/search", tags=["Search"])
LIMIT = 6


class PersonHit(BaseModel):
    id: int
    full_name: str
    employee_id: str
    role: RoleName
    department: str | None


class DepartmentHit(BaseModel):
    id: int
    name: str
    code: str


class SearchResults(BaseModel):
    incidents: list[IncidentSummary]
    hazards: list[HazardSummary]
    people: list[PersonHit]
    departments: list[DepartmentHit]


@router.get("", response_model=SearchResults, summary="Search reports, people and departments you're allowed to see")
def search(q: str = Query(min_length=2, max_length=100), user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    like = f"%{q.strip().lower()}%"
    incidents = db.scalars(reports.with_relations(reports.visible(select(Incident), Incident, user), Incident).where(
        or_(func.lower(Incident.reference).like(like), func.lower(Incident.title).like(like),
            func.lower(Incident.description).like(like))).order_by(Incident.created_at.desc()).limit(LIMIT)).all()
    hazards = db.scalars(reports.with_relations(reports.visible(select(Hazard), Hazard, user), Hazard).where(
        or_(func.lower(Hazard.reference).like(like), func.lower(Hazard.description).like(like),
            func.lower(Hazard.category).like(like))).order_by(Hazard.created_at.desc()).limit(LIMIT)).all()

    found_people: list[User] = []
    if user.role.name in (RoleName.supervisor, RoleName.admin):
        stmt = select(User).join(Role).where(or_(func.lower(User.full_name).like(like),
                                                 func.lower(User.employee_id).like(like),
                                                 func.lower(User.email).like(like))).order_by(User.full_name)
        found_people = [u for u in db.scalars(stmt.limit(50)).unique() if people.can_view(user, u)][:LIMIT]

    depts = db.scalars(select(Department).where(or_(func.lower(Department.name).like(like),
                                                    func.lower(Department.code).like(like))).limit(LIMIT)).all()
    return SearchResults(
        incidents=[reports.incident_summary(i) for i in incidents],
        hazards=[reports.hazard_summary(h) for h in hazards],
        people=[PersonHit(id=u.id, full_name=u.full_name, employee_id=u.employee_id, role=u.role.name,
                          department=u.department.name if u.department else None) for u in found_people],
        departments=[DepartmentHit(id=d.id, name=d.name, code=d.code) for d in depts],
    )
