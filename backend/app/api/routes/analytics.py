"""Analytics for supervisors and admins: trends, heatmap, monthly report, copilot and CSV export."""
import csv
import io
import re
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service as ai
from app.api.routes.ai import ai_limiter
from app.auth.deps import require_staff
from app.database.session import get_db
from app.models import CorrectiveAction, Hazard, Incident, PreventiveAction, RiskAssessment, User
from app.models.enums import RoleName
from app.services import analytics, audit, reports
from app.services.actions import state as action_state
from app.utils.rate_limit import per_user_limit

router = APIRouter(prefix="/analytics", tags=["Analytics & reports"])


@router.get("/trends", response_model=list[dict], summary="Rising categories, departments and locations (30 vs previous 30 days)")
def trends(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    return analytics.trends(db, user)


@router.get("/heatmap", response_model=list[dict], summary="Severity-weighted reports per location (last 90 days)")
def heatmap(user: User = Depends(require_staff), db: Session = Depends(get_db), days: int = Query(90, ge=7, le=365)):
    return analytics.heatmap(db, user, days)


@router.get("/monthly", response_model=dict, summary="Monthly report: figures from the database plus a written summary")
def monthly(user: User = Depends(per_user_limit(ai_limiter)), db: Session = Depends(get_db),
            month: str = Query(default_factory=lambda: date.today().strftime("%Y-%m"), pattern=r"^\d{4}-(0[1-9]|1[0-2])$")):
    if user.role.name not in (RoleName.supervisor, RoleName.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only supervisors and admins can see reports.")
    data = analytics.monthly(db, user, month)
    summary, demo = ai.monthly_summary(data, user.preferred_language)
    scope = "all" if user.role.name == RoleName.admin else (user.department.name if user.department else "—")
    return {**data, "summary": summary, "demo_mode": demo, "scope": scope,
            "generated_at": datetime.now(timezone.utc).isoformat()}


class CopilotIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@router.post("/copilot", response_model=dict,
             summary="Ask about your data. Numbers come from fixed queries (listed as sources); AI only explains them.")
def copilot(body: CopilotIn, user: User = Depends(per_user_limit(ai_limiter)), db: Session = Depends(get_db)):
    if user.role.name not in (RoleName.supervisor, RoleName.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only supervisors and admins can use the copilot.")
    intent = analytics.detect_intent(body.question)
    facts, sources = analytics.copilot_facts(db, user, intent) if intent else ([], [])
    answer, demo = ai.copilot_answer(body.question, intent, facts, user.preferred_language)
    return {"answer": answer, "intent": intent, "facts": facts, "sources": sources, "demo_mode": demo}


# --- CSV export ---------------------------------------------------------------------------------------------------

def _csv(rows: list[list], header: list[str], name: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("﻿")  # BOM, so Excel opens Hindi/Marathi text correctly
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        # Neutralise spreadsheet formulas in user text (CSV injection).
        w.writerow(["'" + v if isinstance(v, str) and re.match(r"^[=+\-@\t\r]", v) else v for v in r])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/export/{kind}.csv", summary="Download incidents, hazards, actions or risks as CSV (your scope, optional date range)")
def export(kind: Literal["incidents", "hazards", "actions", "risks"], user: User = Depends(require_staff),
           db: Session = Depends(get_db), date_from: date | None = None, date_to: date | None = None):
    stamp = date.today().isoformat()
    audit.record(db, "export.csv", user_id=user.id, details={"kind": kind, "from": str(date_from), "to": str(date_to)})
    db.commit()
    if kind == "incidents":
        stmt = reports.date_window(reports.with_relations(reports.visible(select(Incident), Incident, user), Incident),
                                   Incident.occurred_at, date_from, date_to)
        rows = [[i.reference, i.occurred_at.isoformat(), i.title, i.category, i.severity.value, i.status.value,
                 i.department.name if i.department else "", i.location.name if i.location else "", "yes" if i.injury_occurred else "no",
                 i.reporter.full_name if i.reporter else "", i.investigator.full_name if i.investigator else "", i.root_cause or ""]
                for i in db.scalars(stmt.order_by(Incident.occurred_at))]
        return _csv(rows, ["reference", "occurred_at", "title", "category", "severity", "status", "department", "location",
                           "injury", "reporter", "investigator", "root_cause"], f"incidents-{stamp}.csv")
    if kind == "hazards":
        stmt = reports.date_window(reports.with_relations(reports.visible(select(Hazard), Hazard, user), Hazard),
                                   Hazard.created_at, date_from, date_to)
        rows = [[h.reference, h.created_at.isoformat(), h.category.value, h.severity.value, h.status.value,
                 h.department.name if h.department else "", h.location.name if h.location else "",
                 "anonymous" if h.is_anonymous else (h.reporter.full_name if h.reporter else ""), h.description]
                for h in db.scalars(stmt.order_by(Hazard.created_at))]
        return _csv(rows, ["reference", "reported_at", "category", "severity", "status", "department", "location", "reporter",
                           "description"], f"hazards-{stamp}.csv")
    if kind == "actions":
        inc = {i.id: i.reference for i in db.scalars(reports.visible(select(Incident), Incident, user))}
        haz = {h.id: h.reference for h in db.scalars(reports.visible(select(Hazard), Hazard, user))}
        names = {u.id: u.full_name for u in db.scalars(select(User))}
        rows = []
        for model, kind_ in ((CorrectiveAction, "corrective"), (PreventiveAction, "preventive")):
            for a in db.scalars(select(model)):
                ref = inc.get(a.incident_id) or haz.get(a.hazard_id)
                if ref is None or (date_from and a.due_date < date_from) or (date_to and a.due_date > date_to):
                    continue
                rows.append([ref, kind_, a.description, a.control_level.value if a.control_level else "",
                             names.get(a.responsible_id, ""), a.due_date.isoformat(), action_state(a),
                             a.completed_at.isoformat() if a.completed_at else "", a.completion_note or ""])
        return _csv(sorted(rows, key=lambda r: r[5]), ["report", "type", "description", "control_level", "responsible", "due_date",
                                                       "state", "completed_at", "completion_note"], f"actions-{stamp}.csv")
    stmt = select(RiskAssessment)
    if user.role.name != RoleName.admin:
        stmt = stmt.where(RiskAssessment.department_id == user.department_id)
    rows = [[r.title, r.likelihood, r.severity_score, r.risk_score, r.risk_level.value, r.exposure_frequency or "",
             r.existing_controls or "", "; ".join(f"{c['level']}: {c['measure']}" for c in r.recommended_controls or []),
             r.review_due.isoformat() if r.review_due else ""]
            for r in db.scalars(stmt.order_by(RiskAssessment.risk_score.desc()))]
    return _csv(rows, ["title", "likelihood", "severity", "score", "level", "exposure", "existing_controls", "planned_controls",
                       "review_due"], f"risk-register-{stamp}.csv")
