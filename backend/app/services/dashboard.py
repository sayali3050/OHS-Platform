"""Worker dashboard and an explainable safety score.

The score is a weighted average of compliance components, each a plain percentage a worker can check:
  PPE       share of assigned PPE that is in date and passed its last inspection
  Training  share of mandatory courses with a current certificate
A component with nothing to measure (e.g. no PPE assigned) is left out and the weights are re-normalised,
rather than counted as 0% or 100%. Phase 6 adds checklist completion as a third component.
"""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Hazard, Incident, PPEAssignment, TrainingCourse, TrainingProgress, User
from app.models.enums import HazardStatus, IncidentStatus
from app.services.reports import hazard_summary, incident_summary, with_relations

WEIGHTS = {"ppe": 0.5, "training": 0.5}
DUE_SOON_DAYS = 30


def _ppe(db: Session, user: User, today: date) -> tuple[list[dict], int | None]:
    if user.worker_profile is None:
        return [], None
    rows = db.scalars(select(PPEAssignment).where(PPEAssignment.worker_id == user.worker_profile.id)).all()
    items = []
    for a in sorted(rows, key=lambda r: r.replace_by):
        if a.inspection_status != "ok":
            status = a.inspection_status  # damaged | missing
        elif a.replace_by < today:
            status = "overdue"
        elif a.replace_by <= today + timedelta(days=DUE_SOON_DAYS):
            status = "due_soon"
        else:
            status = "ok"
        items.append({"name": a.ppe_item.name, "issued_on": a.issued_on, "replace_by": a.replace_by,
                      "status": status, "compliant": status in ("ok", "due_soon")})
    if not items:
        return [], None
    return items, round(100 * sum(i["compliant"] for i in items) / len(items))


def _training(db: Session, user: User, today: date) -> tuple[list[dict], int | None]:
    courses = db.scalars(select(TrainingCourse).order_by(TrainingCourse.is_mandatory.desc(), TrainingCourse.title)).all()
    progress = {p.course_id: p for p in db.scalars(select(TrainingProgress).where(TrainingProgress.user_id == user.id))}
    items = []
    for c in courses:
        p = progress.get(c.id)
        if p is None or (p.completion_pct == 0 and p.certified_on is None):
            status = "not_started"
        elif p.certified_on is None:
            status = "in_progress"
        elif p.expires_on and p.expires_on < today:
            status = "expired"
        elif p.expires_on and p.expires_on <= today + timedelta(days=DUE_SOON_DAYS):
            status = "expiring"
        else:
            status = "valid"
        if not c.is_mandatory and status == "not_started":
            continue  # optional courses only appear once started
        items.append({"course_id": c.id, "title": c.title, "category": c.category, "mandatory": c.is_mandatory,
                      "status": status, "completion_pct": p.completion_pct if p else 0,
                      "expires_on": p.expires_on if p else None, "current": status in ("valid", "expiring")})
    mandatory = [i for i in items if i["mandatory"]]
    if not mandatory:
        return items, None
    return items, round(100 * sum(i["current"] for i in mandatory) / len(mandatory))


def _explain(key: str, items: list[dict]) -> str:
    if key == "ppe":
        bad = [i for i in items if not i["compliant"]]
        if not bad:
            return f"All {len(items)} PPE items are in date and in good condition."
        names = ", ".join(f"{i['name'].lower()} ({i['status'].replace('_', ' ')})" for i in bad)
        return f"{len(items) - len(bad)} of {len(items)} PPE items are compliant. Needs attention: {names}."
    mandatory = [i for i in items if i["mandatory"]]
    bad = [i for i in mandatory if not i["current"]]
    if not bad:
        return f"All {len(mandatory)} mandatory courses are current."
    names = ", ".join(f"{i['title']} ({i['status'].replace('_', ' ')})" for i in bad)
    return f"{len(mandatory) - len(bad)} of {len(mandatory)} mandatory courses are current. Missing: {names}."


def safety_score(db: Session, user: User, today: date | None = None) -> dict:
    today = today or date.today()
    ppe_items, ppe_pct = _ppe(db, user, today)
    training_items, training_pct = _training(db, user, today)
    parts = [("ppe", "PPE compliance", ppe_pct, ppe_items), ("training", "Mandatory training", training_pct, training_items)]
    measured = [(k, label, pct, items) for k, label, pct, items in parts if pct is not None]
    total_w = sum(WEIGHTS[k] for k, *_ in measured)
    components = [{
        "key": k, "label": label, "score": pct, "weight": round(WEIGHTS[k] / total_w, 2),
        "explanation": _explain(k, items),
    } for k, label, pct, items in measured]
    score = round(sum(WEIGHTS[k] / total_w * pct for k, _, pct, _ in measured)) if measured else None
    band = None if score is None else "good" if score >= 85 else "fair" if score >= 60 else "needs_attention"
    return {
        "score": score, "band": band, "components": components,
        "method": "Weighted average of the components below. Each is a simple percentage you can check in the "
                  "lists on this page.",
        "ppe": ppe_items, "training": training_items,
    }


def worker_dashboard(db: Session, user: User) -> dict:
    data = safety_score(db, user)
    open_incidents = db.scalar(select(func.count(Incident.id)).where(
        Incident.reporter_id == user.id, Incident.status != IncidentStatus.closed))
    open_hazards = db.scalar(select(func.count(Hazard.id)).where(
        Hazard.reporter_id == user.id, Hazard.status.notin_([HazardStatus.closed, HazardStatus.controlled])))
    incidents = db.scalars(with_relations(select(Incident), Incident).where(Incident.reporter_id == user.id)
                           .order_by(Incident.created_at.desc()).limit(5)).all()
    hazards = db.scalars(with_relations(select(Hazard), Hazard).where(Hazard.reporter_id == user.id)
                         .order_by(Hazard.created_at.desc()).limit(5)).all()
    recent = sorted(
        [{"kind": "incident", **incident_summary(i).model_dump()} for i in incidents]
        + [{"kind": "hazard", **hazard_summary(h).model_dump()} for h in hazards],
        key=lambda r: r["created_at"], reverse=True,
    )[:5]
    data["reports"] = {"open_incidents": open_incidents, "open_hazards": open_hazards, "recent": recent}
    return data
