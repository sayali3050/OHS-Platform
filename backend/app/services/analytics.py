"""Analytics over real records: trend signals, a location heatmap, the monthly report and the supervisor copilot.

Every number is computed here by a plain, tested query. The AI (or the demo template) only writes sentences around
numbers it is given; it never counts anything. Each result lists the queries ("sources") it came from.
"""
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ChecklistResult, CorrectiveAction, Department, EmergencyEvent, Hazard, Incident, Location, PreventiveAction,
    TrainingCourse, TrainingProgress, User,
)
from app.models.enums import IncidentStatus, RoleName, Severity
from app.services import reports
from app.services.actions import state as action_state

SEVERITY_WEIGHT = {Severity.low: 1, Severity.medium: 2, Severity.high: 3, Severity.critical: 5}
RISING_MIN = 3        # at least this many in the recent window...
RISING_FACTOR = 1.5   # ...and at least 1.5x the previous window...
RISING_STEP = 2       # ...and at least 2 more, so 1 -> 2 isn't "rising"


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _scoped(db: Session, user: User):
    """Incidents and hazards the user may see (department for supervisors, everything for admins)."""
    incidents = db.scalars(reports.visible(select(Incident), Incident, user)).all()
    hazards = db.scalars(reports.visible(select(Hazard), Hazard, user)).all()
    return incidents, hazards


def _when(r) -> datetime:
    return _aware(r.occurred_at if isinstance(r, Incident) else r.created_at)


def _category(r) -> str:
    return f"incident:{r.category or 'other'}" if isinstance(r, Incident) else f"hazard:{r.category.value}"


# --- trends -------------------------------------------------------------------------------------------------------

def trends(db: Session, user: User, now: datetime | None = None, days: int = 30) -> list[dict]:
    """Rising categories, departments and locations: last `days` vs the `days` before."""
    now = now or datetime.now(timezone.utc)
    recent_from, prev_from = now - timedelta(days=days), now - timedelta(days=2 * days)
    incidents, hazards = _scoped(db, user)
    rows = [*incidents, *hazards]
    depts = {d.id: d.name for d in db.scalars(select(Department))}
    locs = {loc.id: loc.name for loc in db.scalars(select(Location))}
    signals = []
    for kind, key_of, label_of in (
        ("category", _category, lambda k: k),
        ("department", lambda r: r.department_id, lambda k: depts.get(k, "?")),
        ("location", lambda r: r.location_id, lambda k: locs.get(k, "?")),
    ):
        recent = Counter(key_of(r) for r in rows if _when(r) > recent_from and key_of(r) is not None)
        before = Counter(key_of(r) for r in rows if prev_from < _when(r) <= recent_from and key_of(r) is not None)
        weight = Counter()
        for r in rows:
            if _when(r) > recent_from and key_of(r) is not None:
                weight[key_of(r)] += SEVERITY_WEIGHT[r.severity]
        for key, n in recent.items():
            prev = before.get(key, 0)
            if n >= RISING_MIN and n >= RISING_FACTOR * prev and n - prev >= RISING_STEP:
                signals.append({"kind": kind, "key": str(key), "label": label_of(key), "current": n, "previous": prev,
                                "change_pct": None if prev == 0 else round(100 * (n - prev) / prev),
                                "severity_weight": weight[key]})
    return sorted(signals, key=lambda s: (-s["severity_weight"], -s["current"]))


# --- heatmap ------------------------------------------------------------------------------------------------------

def heatmap(db: Session, user: User, days: int = 90) -> list[dict]:
    """Per department, its locations on their layout grid with severity-weighted report counts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    incidents, hazards = _scoped(db, user)
    weight, inc, haz = Counter(), Counter(), Counter()
    for r in [*incidents, *hazards]:
        if r.location_id and _when(r) > since:
            weight[r.location_id] += SEVERITY_WEIGHT[r.severity]
            (inc if isinstance(r, Incident) else haz)[r.location_id] += 1
    depts = db.scalars(select(Department).order_by(Department.name)).all()
    if user.role.name != RoleName.admin:
        depts = [d for d in depts if d.id == user.department_id]
    return [{"department": {"id": d.id, "name": d.name},
             "locations": [{"id": loc.id, "name": loc.name, "x": loc.grid_x, "y": loc.grid_y, "incidents": inc[loc.id],
                            "hazards": haz[loc.id], "weight": weight[loc.id]}
                           for loc in sorted(d.locations, key=lambda x: (x.grid_y, x.grid_x))]} for d in depts]


# --- monthly report -----------------------------------------------------------------------------------------------

def month_bounds(month: str) -> tuple[datetime, datetime]:
    y, m = (int(x) for x in month.split("-"))
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=timezone.utc)
    return start, end


def monthly(db: Session, user: User, month: str) -> dict:
    start, end = month_bounds(month)
    prev_start, _ = month_bounds(f"{(start - timedelta(days=1)).year}-{(start - timedelta(days=1)).month:02d}")
    incidents, hazards = _scoped(db, user)
    inc = [i for i in incidents if start <= _when(i) < end]
    haz = [h for h in hazards if start <= _when(h) < end]
    prev_inc = [i for i in incidents if prev_start <= _when(i) < start]
    depts = {d.id: d.name for d in db.scalars(select(Department))}
    by_dept = Counter(depts.get(r.department_id, "—") for r in [*inc, *haz])
    cats = Counter(_category(r) for r in [*inc, *haz]).most_common(5)
    inc_ids, haz_ids = {i.id for i in incidents}, {h.id for h in hazards}
    acts = [a for model in (CorrectiveAction, PreventiveAction) for a in db.scalars(select(model))
            if a.incident_id in inc_ids or a.hazard_id in haz_ids]
    created = [a for a in acts if start <= _aware(a.created_at) < end]
    completed = [a for a in acts if a.completed_at and start <= _aware(a.completed_at) < end]
    overdue_now = [a for a in acts if action_state(a) == "overdue"]
    closed = [i for i in inc if i.status == IncidentStatus.closed]
    # Training and checklists for the same people.
    people = db.scalars(select(User).where(User.is_active.is_(True))).all()
    if user.role.name != RoleName.admin:
        people = [p for p in people if p.department_id == user.department_id]
    ids = {p.id for p in people}
    mandatory = set(db.scalars(select(TrainingCourse.id).where(TrainingCourse.is_mandatory.is_(True))))
    month_end = (end - timedelta(days=1)).date()
    current = {(p.user_id, p.course_id) for p in db.scalars(select(TrainingProgress).where(TrainingProgress.certified_on.is_not(None)))
               if p.user_id in ids and p.certified_on <= month_end and (p.expires_on is None or p.expires_on >= month_end)}
    workers = [p.id for p in people if p.role.name == RoleName.worker]
    pairs = [(w, c) for w in workers for c in mandatory]
    checks = [c for c in db.scalars(select(ChecklistResult).where(ChecklistResult.completed_at >= start, ChecklistResult.completed_at < end))
              if c.user_id in ids]
    emergencies = [e for e in db.scalars(select(EmergencyEvent).where(EmergencyEvent.created_at >= start, EmergencyEvent.created_at < end))
                   if user.role.name == RoleName.admin or e.user_id in ids]
    return {
        "month": month,
        "incidents": len(inc), "incidents_prev": len(prev_inc), "hazards": len(haz),
        "injuries": sum(i.injury_occurred for i in inc), "anonymous_hazards": sum(h.is_anonymous for h in haz),
        "by_severity": {s.value: sum(r.severity == s for r in [*inc, *haz]) for s in Severity},
        "by_department": [{"name": k, "count": v} for k, v in by_dept.most_common()],
        "top_categories": [{"category": k, "count": v} for k, v in cats],
        "actions_created": len(created), "actions_completed": len(completed), "actions_overdue_now": len(overdue_now),
        "incidents_closed": len(closed),
        "training_compliance": round(100 * len([x for x in pairs if x in current]) / len(pairs)) if pairs else None,
        "checklists_completed": len(checks), "checklist_items_failed": sum(c.failed_items for c in checks),
        "emergencies": len(emergencies),
        "sources": ["incidents (occurred in month, your scope)", "hazards (reported in month)", "corrective/preventive actions",
                    "training_progress (mandatory courses current at month end)", "checklist_results", "emergency_events"],
    }


# --- supervisor copilot -------------------------------------------------------------------------------------------

INTENTS: dict[str, list[str]] = {
    "overdue_actions": ["overdue", "late", "action", "capa", "behind", "बाकी काम", "समय निकल", "मुदत", "überfällig", "maßnahme"],
    "top_hazards": ["hazard", "most common", "top", "frequent", "खतरे", "धोके", "gefahr", "häufig"],
    "departments": ["department", "which area", "worst", "compare", "विभाग", "abteilung", "bereich"],
    "injuries": ["injur", "hurt", "accident", "lost time", "चोट", "दुखापत", "verletz", "unfall"],
    "open_incidents": ["open", "waiting", "unassigned", "backlog", "pending", "खुली", "उघड", "offen", "wartet"],
    "training": ["training", "course", "certificate", "expired", "ट्रेनिंग", "प्रशिक्षण", "schulung", "zertifikat"],
    "ppe": ["ppe", "helmet", "gloves", "equipment", "damaged", "उपकरण", "साधन", "psa", "ausrüstung"],
    "trends": ["trend", "rising", "increase", "going up", "more than last", "बढ़", "वाढ", "steig", "anstieg", "zunahme"],
}


def detect_intent(question: str) -> str | None:
    q = question.lower()
    scores = {k: sum(w in q for w in words) for k, words in INTENTS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] else None


def copilot_facts(db: Session, user: User, intent: str) -> tuple[list[dict], list[str]]:
    """(facts as label/value rows, the queries they came from). Scoped to what the user may see."""
    from app.api.routes.ppe import ppe_state
    from app.models import PPEAssignment, Worker
    incidents, hazards = _scoped(db, user)
    since = datetime.now(timezone.utc) - timedelta(days=90)
    if intent == "overdue_actions":
        inc_ids, haz_ids = {i.id for i in incidents}, {h.id for h in hazards}
        refs = {**{("i", i.id): i.reference for i in incidents}, **{("h", h.id): h.reference for h in hazards}}
        acts = [a for m in (CorrectiveAction, PreventiveAction) for a in db.scalars(select(m))
                if (a.incident_id in inc_ids or a.hazard_id in haz_ids) and action_state(a) == "overdue"]
        acts.sort(key=lambda a: a.due_date)
        rows = [{"label": refs.get(("i", a.incident_id) if a.incident_id else ("h", a.hazard_id), "?"),
                 "value": f"{a.description[:80]} (due {a.due_date.isoformat()}, {(date.today() - a.due_date).days} days late)"} for a in acts[:8]]
        return [{"label": "total", "value": len(acts)}, *rows], ["corrective_actions + preventive_actions where not completed and due_date < today"]
    if intent == "top_hazards":
        c = Counter(h.category.value for h in hazards if _aware(h.created_at) > since).most_common(5)
        return [{"label": k, "value": v} for k, v in c], ["hazards reported in the last 90 days, grouped by category"]
    if intent == "departments":
        depts = {d.id: d.name for d in db.scalars(select(Department))}
        c = Counter()
        for r in [*incidents, *hazards]:
            if _when(r) > since:
                c[depts.get(r.department_id, "—")] += SEVERITY_WEIGHT[r.severity]
        return [{"label": k, "value": v} for k, v in c.most_common()], ["incidents + hazards in 90 days, severity-weighted (low 1 … critical 5) per department"]
    if intent == "injuries":
        inj = sorted((i for i in incidents if i.injury_occurred and _when(i) > since), key=_when, reverse=True)
        return ([{"label": "total", "value": len(inj)}, *({"label": i.reference, "value": f"{i.title} ({_when(i).date().isoformat()})"} for i in inj[:6])],
                ["incidents with injury_occurred in the last 90 days"])
    if intent == "open_incidents":
        open_ = [i for i in incidents if i.status != IncidentStatus.closed]
        by = Counter(i.status.value for i in open_)
        stale = [i for i in open_ if i.status == IncidentStatus.reported and _aware(i.created_at) < datetime.now(timezone.utc) - timedelta(hours=24)]
        return ([{"label": s, "value": n} for s, n in by.items()] + [{"label": "unassigned over 24 h", "value": len(stale)}],
                ["incidents not closed, grouped by status"])
    if intent == "training":
        from app.api.routes.training import compliance
        data = compliance(user=user, db=db)
        worst = [r for r in data.rows if r.compliance is not None and r.compliance < 100][:8]
        return ([{"label": "workers below 100%", "value": len([r for r in data.rows if r.compliance is not None and r.compliance < 100])},
                 *({"label": r.full_name, "value": f"{r.compliance}%"} for r in worst)], ["training_progress for mandatory courses"])
    if intent == "ppe":
        stmt = select(PPEAssignment).join(Worker, Worker.id == PPEAssignment.worker_id).join(User, User.id == Worker.user_id)
        if user.role.name != RoleName.admin:
            stmt = stmt.where(User.department_id == user.department_id)
        states = Counter(ppe_state(a) for a in db.scalars(stmt))
        return [{"label": k, "value": v} for k, v in states.items()], ["ppe_assignments by state (overdue = past replace-by date)"]
    if intent == "trends":
        s = trends(db, user)
        return ([{"label": f"{x['kind']}: {x['label']}", "value": f"{x['previous']} → {x['current']}"} for x in s[:8]]
                or [{"label": "rising signals", "value": 0}], ["reports in the last 30 days vs the 30 before"])
    return [], []
