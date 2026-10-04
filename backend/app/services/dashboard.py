"""Worker dashboard and an explainable safety score.

The score is a weighted average of compliance components, each a plain percentage a worker can check:
  PPE         share of assigned PPE that is in date and passed its last inspection
  Training    share of mandatory courses with a current certificate
  Checklists  share of the last 7 days (before today) on which the person completed a daily checklist
A component with nothing to measure (e.g. no PPE assigned) is left out and the weights are re-normalised,
rather than counted as 0% or 100%. The three components weigh the same.
"""
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ChecklistResult, Hazard, Incident, PPEAssignment, SafetyChecklist, TrainingCourse, TrainingProgress, User,
)
from app.models.enums import HazardStatus, IncidentStatus
from app.services.reports import hazard_summary, incident_summary, with_relations

WEIGHTS = {"ppe": 1.0, "training": 1.0, "checklists": 1.0}
CHECKLIST_DAYS = 7
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


def _checklists(db: Session, user: User, today: date) -> tuple[dict, int | None]:
    """Days in the last week (not counting today, which isn't over) with at least one daily checklist completed."""
    has_daily = db.scalar(select(func.count(SafetyChecklist.id)).where(
        SafetyChecklist.is_active.is_(True), SafetyChecklist.frequency == "daily",
        or_(SafetyChecklist.department_id.is_(None), SafetyChecklist.department_id == user.department_id)))
    if not has_daily:
        return {"done_days": 0, "days": CHECKLIST_DAYS}, None
    start = today - timedelta(days=CHECKLIST_DAYS)
    times = db.scalars(select(ChecklistResult.completed_at).join(SafetyChecklist).where(
        ChecklistResult.user_id == user.id, SafetyChecklist.frequency == "daily")).all()
    days = {t.date() for t in times}
    done = sum(1 for d in days if start <= d < today)
    return {"done_days": done, "days": CHECKLIST_DAYS}, round(100 * done / CHECKLIST_DAYS)


def _explain(key: str, items) -> str:
    if key == "checklists":
        return f"Daily checklist completed on {items['done_days']} of the last {items['days']} days."
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
    checklist_info, checklist_pct = _checklists(db, user, today)
    parts = [("ppe", "PPE compliance", ppe_pct, ppe_items), ("training", "Mandatory training", training_pct, training_items),
             ("checklists", "Daily checklists", checklist_pct, checklist_info)]
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
        "ppe": ppe_items, "training": training_items, "checklists": checklist_info,
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
