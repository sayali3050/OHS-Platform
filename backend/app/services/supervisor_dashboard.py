"""Workflow numbers for a supervisor's department (or everything, for an admin): what's waiting, what's late."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CorrectiveAction, Hazard, Incident, PreventiveAction, User
from app.models.enums import HazardStatus, IncidentStatus
from app.services import reports
from app.services.actions import parent_of, state


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def build(db: Session, user: User) -> dict:
    now, today = datetime.now(timezone.utc), date.today()
    incidents = db.scalars(reports.visible(select(Incident), Incident, user)).all()
    hazards = db.scalars(reports.visible(select(Hazard), Hazard, user)).all()
    inc_ids, haz_ids = {i.id for i in incidents}, {h.id for h in hazards}
    actions = [a for model in (CorrectiveAction, PreventiveAction) for a in db.scalars(select(model))
               if (a.incident_id in inc_ids) or (a.hazard_id in haz_ids)]
    states = [state(a, today) for a in actions]
    closed_recent = [i for i in incidents if i.closed_at and _aware(i.closed_at) > now - timedelta(days=90)]
    durations = [(_aware(i.closed_at) - _aware(i.created_at)).days for i in closed_recent]
    mine = [a for model in (CorrectiveAction, PreventiveAction)
            for a in db.scalars(select(model).where(model.responsible_id == user.id))]
    return {
        "scope": reports.scope_of(user),
        "incidents_by_status": {s.value: sum(i.status == s for i in incidents) for s in IncidentStatus},
        "hazards_by_status": {s.value: sum(h.status == s for h in hazards) for s in HazardStatus},
        "unassigned_over_24h": sum(i.status == IncidentStatus.reported and _aware(i.created_at) < now - timedelta(hours=24)
                                   for i in incidents),
        "actions_overdue": states.count("overdue"),
        "actions_due_7d": sum(s in ("pending", "in_progress") and a.due_date <= today + timedelta(days=7)
                              for a, s in zip(actions, states)),
        "my_open_actions": sum(state(a, today) != "completed" and parent_of(db, a) is not None for a in mine),
        "closed_30d": sum(_aware(i.closed_at) > now - timedelta(days=30) for i in closed_recent),
        "avg_days_to_close": round(sum(durations) / len(durations), 1) if durations else None,
        "injuries_30d": sum(i.injury_occurred and _aware(i.occurred_at) > now - timedelta(days=30) for i in incidents),
    }
