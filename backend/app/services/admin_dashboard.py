"""Organisation-wide overview for admins. Every number is a plain count or percentage over real records, so each one
can be traced back to the reports, PPE, training and health-check lists it came from."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    CorrectiveAction, Department, EmergencyEvent, Hazard, HealthCheck, Incident, PPEAssignment, Role, TrainingCourse,
    TrainingProgress, User, Worker,
)
from app.models.enums import ActionStatus, HazardStatus, HealthCheckResult, IncidentStatus, RoleName, Severity
from app.services import emergency

OPEN_HAZARD = (HazardStatus.open, HazardStatus.in_review)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _month_starts(today: date, n: int) -> list[date]:
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(date(y, m, 1))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return list(reversed(out))


def demo_data_present(db: Session) -> bool:
    return bool(db.scalar(select(exists().where(User.email.like("%@demo.com")))))


def build(db: Session) -> dict:
    today = date.today()
    now = datetime.now(timezone.utc)
    incidents = db.scalars(select(Incident)).all()
    hazards = db.scalars(select(Hazard)).all()
    departments = db.scalars(select(Department).order_by(Department.name)).all()
    workers = db.execute(select(User.id, User.department_id).join(Role)
                         .where(Role.name == RoleName.worker, User.is_active.is_(True))).all()

    # --- headline numbers ---
    open_inc = [i for i in incidents if i.status != IncidentStatus.closed]
    open_haz = [h for h in hazards if h.status in OPEN_HAZARD]
    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    injuries = sorted((_aware(i.occurred_at) for i in incidents if i.injury_occurred), reverse=True)
    overdue_actions = db.scalar(select(func.count(CorrectiveAction.id)).where(
        CorrectiveAction.status != ActionStatus.completed, CorrectiveAction.due_date < today)) or 0
    kpis = {
        "open_incidents": len(open_inc),
        "open_hazards": len(open_haz),
        "critical_open": sum(r.severity == Severity.critical for r in open_inc + open_haz),
        "incidents_this_month": sum(_aware(i.occurred_at).date() >= month_start for i in incidents),
        "incidents_last_month": sum(last_month_start <= _aware(i.occurred_at).date() < month_start for i in incidents),
        "injuries_90d": sum(d > now - timedelta(days=90) for d in injuries),
        "days_since_injury": (now - injuries[0]).days if injuries else None,
        "overdue_actions": overdue_actions,
        "anonymous_hazards_90d": sum(h.is_anonymous and _aware(h.created_at) > now - timedelta(days=90) for h in hazards),
    }

    # --- six-month trend ---
    months = _month_starts(today, 6)

    def bucket(d: datetime) -> date | None:
        d = _aware(d).date().replace(day=1)
        return d if d in months else None
    inc_by = Counter(bucket(i.occurred_at) for i in incidents)
    haz_by = Counter(bucket(h.created_at) for h in hazards)
    inj_by = Counter(bucket(i.occurred_at) for i in incidents if i.injury_occurred)
    trend = [{"month": m.isoformat()[:7], "incidents": inc_by[m], "hazards": haz_by[m], "injuries": inj_by[m]}
             for m in months]

    # --- what's open, by severity; what's being reported, by category ---
    open_by_severity = Counter(r.severity.value for r in open_inc + open_haz)
    since = now - timedelta(days=180)
    categories = Counter(h.category.value for h in hazards if _aware(h.created_at) > since).most_common(6)

    # --- compliance: PPE in date and intact; mandatory courses current ---
    ppe_rows = db.execute(select(PPEAssignment.replace_by, PPEAssignment.inspection_status, User.department_id)
                          .join(Worker, Worker.id == PPEAssignment.worker_id).join(User, User.id == Worker.user_id)
                          .where(User.is_active.is_(True))).all()

    def ppe_state(replace_by: date, inspection: str) -> str:
        if inspection != "ok":
            return "damaged"
        if replace_by < today:
            return "overdue"
        return "due_soon" if replace_by <= today + timedelta(days=30) else "ok"
    ppe_states = [(ppe_state(r, s), d) for r, s, d in ppe_rows]
    ppe_counts = Counter(s for s, _ in ppe_states)

    mandatory = set(db.scalars(select(TrainingCourse.id).where(TrainingCourse.is_mandatory.is_(True))))
    current = {(p.user_id, p.course_id) for p in db.scalars(select(TrainingProgress).where(
        TrainingProgress.certified_on.is_not(None))) if p.expires_on is None or p.expires_on >= today}
    worker_ids = {w for w, _ in workers}
    training_pairs = [(w, c) for w in worker_ids for c in mandatory]
    training_ok = sum(p in current for p in training_pairs)

    def pct(ok: int, total: int) -> int | None:
        return round(100 * ok / total) if total else None

    # --- per department ---
    dept_rows = []
    for d in departments:
        d_workers = {w for w, dep in workers if dep == d.id}
        d_ppe = [s for s, dep in ppe_states if dep == d.id]
        d_pairs = [(w, c) for w in d_workers for c in mandatory]
        dept_rows.append({
            "id": d.id, "name": d.name, "code": d.code, "risk_level": d.risk_level, "workers": len(d_workers),
            "open_incidents": sum(i.department_id == d.id for i in open_inc),
            "open_hazards": sum(h.department_id == d.id for h in open_haz),
            "incidents_90d": sum(i.department_id == d.id and _aware(i.occurred_at) > now - timedelta(days=90)
                                 for i in incidents),
            "ppe_compliance": pct(sum(s in ("ok", "due_soon") for s in d_ppe), len(d_ppe)),
            "training_compliance": pct(sum(p in current for p in d_pairs), len(d_pairs)),
        })

    # --- health checks: latest per person decides fitness; next_due_on decides what's coming up ---
    checks = db.scalars(select(HealthCheck).order_by(HealthCheck.user_id, HealthCheck.checked_on.desc())).all()
    latest: dict[int, HealthCheck] = {}
    for c in checks:
        latest.setdefault(c.user_id, c)
    health = {
        "overdue": sum(c.next_due_on is not None and c.next_due_on < today for c in latest.values()),
        "due_30d": sum(c.next_due_on is not None and today <= c.next_due_on <= today + timedelta(days=30)
                       for c in latest.values()),
        "restricted": sum(c.result != HealthCheckResult.fit for c in latest.values()),
        "never_checked": len(worker_ids - set(latest)),
    }

    # --- emergencies ---
    active = []
    for e in emergency.active_events(db):
        raised_by = db.get(User, e.user_id) if e.user_id else None
        active.append({"id": e.id, "type": e.emergency_type.value, "created_at": e.created_at,
                       "raised_by": raised_by.full_name if raised_by else None, **emergency.counts(db, e)})
    recent = db.scalars(select(EmergencyEvent).order_by(EmergencyEvent.created_at.desc()).limit(5)).all()

    settings = get_settings()
    return {
        "kpis": kpis, "trend": trend,
        "open_by_severity": {s.value: open_by_severity.get(s.value, 0) for s in Severity},
        "hazard_categories": [{"category": c, "count": n} for c, n in categories],
        "ppe": {"ok": ppe_counts["ok"], "due_soon": ppe_counts["due_soon"], "overdue": ppe_counts["overdue"],
                "damaged": ppe_counts["damaged"], "compliance": pct(ppe_counts["ok"] + ppe_counts["due_soon"],
                                                                    len(ppe_states))},
        "training": {"compliance": pct(training_ok, len(training_pairs)), "gaps": len(training_pairs) - training_ok},
        "departments": dept_rows, "health": health,
        "emergencies": {
            "active": active,
            "recent": [{"id": e.id, "type": e.emergency_type.value, "created_at": e.created_at,
                        "resolved_at": e.resolved_at, "incident_id": e.incident_id} for e in recent],
        },
        "system": {"ai_mode": "demo" if settings.ai_demo_mode else "live",
                   "ai_model": None if settings.ai_demo_mode else settings.openai_model,
                   "demo_data": demo_data_present(db)},
    }
