"""Corrective and preventive actions (CAPA)."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database.session import get_db
from app.models import Hazard, Incident, User
from app.models.enums import RoleName
from app.schemas.actions import ActionCreate, ActionKind, ActionOut, ActionPage, ActionUpdate
from app.schemas.reports import PersonRef
from app.services import actions as capa
from app.services import audit
from app.utils.forms import field_error

router = APIRouter(prefix="/actions", tags=["Corrective & preventive actions"])

MANAGER_ONLY = {"description", "control_level", "responsible_id", "due_date", "priority"}


def _parent(db: Session, incident_id: int | None, hazard_id: int | None):
    return db.get(Incident, incident_id) if incident_id else db.get(Hazard, hazard_id)


def _check_responsible(db: Session, responsible_id: int | None, parent) -> None:
    """The person must be active and either work in the report's department or be a supervisor/admin."""
    if responsible_id is None:
        return
    who = db.get(User, responsible_id)
    if who is None or not who.is_active or not (
            who.role.name in (RoleName.supervisor, RoleName.admin) or who.department_id == parent.department_id):
        raise field_error("responsible_id", "Choose someone from this department, a supervisor or an admin")


def _get(db: Session, kind: ActionKind, action_id: int, user: User):
    action = db.get(capa.MODELS[kind], action_id)
    parent = capa.parent_of(db, action) if action else None
    if action is None or not capa.can_view(action, parent, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    return action, parent


@router.get("", response_model=ActionPage,
            summary="Actions you're responsible for (mine), or every action on reports you can see (team)")
def list_actions(
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
    scope: Literal["mine", "team"] = "mine",
    state: Literal["open", "overdue", "completed", "all"] = "open",
    incident_id: int | None = None, hazard_id: int | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
):
    rows = []
    for model in capa.MODELS.values():
        stmt = select(model)
        if incident_id:
            stmt = stmt.where(model.incident_id == incident_id)
        if hazard_id:
            stmt = stmt.where(model.hazard_id == hazard_id)
        if scope == "mine" and not (incident_id or hazard_id):
            stmt = stmt.where(model.responsible_id == user.id)
        rows += db.scalars(stmt).all()
    parents: dict[tuple[str, int], object] = {}

    def parent(a):
        key = ("i", a.incident_id) if a.incident_id else ("h", a.hazard_id)
        if key not in parents:
            parents[key] = capa.parent_of(db, a)
        return parents[key]
    visible = [a for a in rows if capa.can_view(a, parent(a), user)]
    states = {id(a): capa.state(a) for a in visible}
    counts = {"open": sum(s != "completed" for s in states.values()),
              "overdue": sum(s == "overdue" for s in states.values()),
              "completed": sum(s == "completed" for s in states.values())}
    keep = {"open": lambda s: s != "completed", "overdue": lambda s: s == "overdue",
            "completed": lambda s: s == "completed", "all": lambda s: True}[state]
    chosen = [a for a in visible if keep(states[id(a)])]
    # Overdue first, then soonest due; completed ones newest first.
    chosen.sort(key=lambda a: (states[id(a)] == "completed", states[id(a)] != "overdue",
                               a.due_date if states[id(a)] != "completed" else date.max, -a.id))
    window = chosen[(page - 1) * page_size: page * page_size]
    return ActionPage(items=[capa.out(db, a, user, parent(a)) for a in window], total=len(chosen), page=page,
                      page_size=page_size, counts=counts)


@router.get("/people", response_model=list[PersonRef],
            summary="Who an action on this report can be given to: its department's people, supervisors and admins")
def assignable(incident_id: int | None = None, hazard_id: int | None = None, user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    parent = _parent(db, incident_id, hazard_id)
    if parent is None or not capa.can_manage(parent, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    from app.models import Role
    people = db.scalars(select(User).join(Role).where(User.is_active.is_(True)).order_by(User.full_name)).unique().all()
    return [PersonRef(id=u.id, full_name=u.full_name) for u in people
            if u.department_id == parent.department_id or u.role.name in (RoleName.supervisor, RoleName.admin)]


@router.post("", response_model=ActionOut, status_code=201, summary="Add an action to a report (its managers)")
def create_action(body: ActionCreate, request: Request, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    parent = _parent(db, body.incident_id, body.hazard_id)
    if parent is None or not capa.can_manage(parent, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if body.due_date < date.today():
        raise field_error("due_date", "The due date can't be in the past")
    _check_responsible(db, body.responsible_id, parent)
    action = capa.MODELS[body.kind](**body.model_dump(exclude={"kind"}), created_by=user.id)
    db.add(action)
    db.flush()
    capa.tell_responsible(db, action, parent, user)
    audit.record(db, "action.create", user_id=user.id, entity_type=f"{body.kind}_action", entity_id=action.id,
                 details={"report": parent.reference, "due": body.due_date.isoformat()}, request=request)
    db.commit()
    db.refresh(action)
    return capa.out(db, action, user, parent)


@router.patch("/{kind}/{action_id}", response_model=ActionOut,
              summary="Update an action. The responsible person can only change progress and the completion note.")
def update_action(kind: ActionKind, action_id: int, body: ActionUpdate, request: Request,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    action, parent = _get(db, kind, action_id, user)
    changes = body.model_dump(exclude_unset=True)
    manager = capa.can_manage(parent, user)
    if not capa.can_progress(action, parent, user) or (set(changes) & MANAGER_ONLY and not manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this report's supervisor or an admin can change that.")
    if "responsible_id" in changes:
        _check_responsible(db, changes["responsible_id"], parent)
    if changes.get("due_date") and changes["due_date"] < date.today() and changes["due_date"] != action.due_date:
        raise field_error("due_date", "The due date can't be in the past")
    new_state = changes.pop("state", None)
    note = (changes.pop("completion_note", None) or "").strip() or None
    if new_state == "completed" and not note:
        raise field_error("completion_note", "Say briefly what was done")
    was_completed = capa.state(action) == "completed"
    old_responsible = action.responsible_id
    for k, v in changes.items():
        setattr(action, k, v)
    if new_state:
        capa.set_progress(action, new_state, note)
    db.flush()
    if action.responsible_id != old_responsible:
        capa.tell_responsible(db, action, parent, user)
    if new_state == "completed" and not was_completed:
        capa.tell_managers_done(db, action, parent, user)
    audit.record(db, "action.update", user_id=user.id, entity_type=f"{kind}_action", entity_id=action.id,
                 details={"fields": sorted(body.model_dump(exclude_unset=True)), "state": new_state, "note": note},
                 request=request)
    db.commit()
    db.refresh(action)
    return capa.out(db, action, user, parent)


@router.delete("/{kind}/{action_id}", status_code=204, summary="Remove an action (the report's managers)")
def delete_action(kind: ActionKind, action_id: int, request: Request, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    action, parent = _get(db, kind, action_id, user)
    if not capa.can_manage(parent, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only this report's supervisor or an admin can remove actions.")
    db.delete(action)
    audit.record(db, "action.delete", user_id=user.id, entity_type=f"{kind}_action", entity_id=action_id,
                 details={"report": parent.reference}, request=request)
    db.commit()
