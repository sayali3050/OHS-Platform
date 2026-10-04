"""Phase 3: corrective and preventive actions, the incident board, filters, search, audit log, supervisor KPIs."""
from datetime import date, timedelta

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import CorrectiveAction, User
from tests.conftest import token_for
from tests.test_ai_workflow import latest_note, new_hazard, new_incident

SOON = (date.today() + timedelta(days=5)).isoformat()


def uid(email):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


def action(client, h, **over):
    r = client.post("/api/actions", json={"description": "Fit a guard to the conveyor nip point", "due_date": SOON,
                                          **over}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_supervisor_gives_an_action_and_the_worker_completes_it(client, worker_h, supervisor_h):
    inc = new_incident(client, worker_h)
    worker = uid("worker@demo.com")
    a = action(client, supervisor_h, incident_id=inc["id"], responsible_id=worker, priority="high",
               control_level="engineering")
    assert a["state"] == "pending" and a["responsible"]["id"] == worker and a["report"]["reference"] == inc["reference"]
    assert latest_note("worker@demo.com").kind == "action_assigned"

    mine = client.get("/api/actions?scope=mine", headers=worker_h).json()
    item = next(x for x in mine["items"] if x["id"] == a["id"])
    assert item["can_progress"] and not item["can_edit"]

    # The responsible worker can report progress but not change the due date.
    assert client.patch(f"/api/actions/corrective/{a['id']}", json={"due_date": SOON}, headers=worker_h).status_code == 403
    no_note = client.patch(f"/api/actions/corrective/{a['id']}", json={"state": "completed"}, headers=worker_h)
    assert no_note.status_code == 422 and "completion_note" in no_note.json()["fields"]
    done = client.patch(f"/api/actions/corrective/{a['id']}", json={"state": "completed", "completion_note": "Guard fitted"},
                        headers=worker_h)
    assert done.status_code == 200 and done.json()["state"] == "completed" and done.json()["completed_at"]
    assert latest_note("supervisor@demo.com").kind == "action_completed"


def test_overdue_is_derived_from_the_due_date(client, worker_h, supervisor_h):
    inc = new_incident(client, worker_h)
    a = action(client, supervisor_h, incident_id=inc["id"])
    with SessionLocal() as db:  # simulate time passing
        db.get(CorrectiveAction, a["id"]).due_date = date.today() - timedelta(days=3)
        db.commit()
    team = client.get("/api/actions?scope=team&state=overdue", headers=supervisor_h).json()
    assert any(x["id"] == a["id"] and x["state"] == "overdue" for x in team["items"])
    assert team["counts"]["overdue"] >= 1


def test_actions_respect_report_visibility(client, worker_h, supervisor_h):
    inc = new_incident(client, worker_h)
    other_sup = token_for(client, "supervisor.fab@demo.com")
    assert client.post("/api/actions", json={"incident_id": inc["id"], "description": "Not my department",
                                             "due_date": SOON}, headers=other_sup).status_code == 404
    assert client.post("/api/actions", json={"incident_id": inc["id"], "description": "Workers can't add actions",
                                             "due_date": SOON}, headers=worker_h).status_code == 404
    past = client.post("/api/actions", json={"incident_id": inc["id"], "description": "Due date in the past",
                                             "due_date": "2020-01-01"}, headers=supervisor_h)
    assert past.status_code == 422 and "due_date" in past.json()["fields"]
    outsider = uid("worker02@demo.com")  # another department, not staff
    bad = client.post("/api/actions", json={"incident_id": inc["id"], "description": "Someone from elsewhere",
                                            "due_date": SOON, "responsible_id": outsider}, headers=supervisor_h)
    assert bad.status_code == 422 and "responsible_id" in bad.json()["fields"]
    people = client.get(f"/api/actions/people?incident_id={inc['id']}", headers=supervisor_h).json()
    assert uid("worker@demo.com") in {p["id"] for p in people} and outsider not in {p["id"] for p in people}


def test_hazard_cant_be_controlled_with_open_actions(client, worker_h, supervisor_h):
    hz = new_hazard(client, worker_h)
    client.post(f"/api/hazards/{hz['id']}/status", json={"status": "in_review"}, headers=supervisor_h)
    a = action(client, supervisor_h, hazard_id=hz["id"], kind="preventive")
    r = client.post(f"/api/hazards/{hz['id']}/status", json={"status": "controlled", "note": "Cleaned"}, headers=supervisor_h)
    assert r.status_code == 422 and "open actions" in r.json()["fields"]["status"]
    client.patch(f"/api/actions/preventive/{a['id']}", json={"state": "completed", "completion_note": "Drip tray fitted"},
                 headers=supervisor_h)
    ok = client.post(f"/api/hazards/{hz['id']}/status", json={"status": "controlled", "note": "Cleaned"}, headers=supervisor_h)
    assert ok.status_code == 200
    # The reporter can see the action but only managers remove it.
    assert client.delete(f"/api/actions/preventive/{a['id']}", headers=worker_h).status_code == 403


def test_board_shows_cards_with_action_counts(client, worker_h, supervisor_h, admin_h):
    inc = new_incident(client, worker_h)
    action(client, supervisor_h, incident_id=inc["id"])
    cards = client.get("/api/incidents/board", headers=supervisor_h).json()
    card = next(c for c in cards if c["id"] == inc["id"])
    assert card["status"] == "reported" and card["actions_open"] == 1 and card["days_open"] == 0
    assert all(c["department"] == "Warehouse & Logistics" for c in cards)  # supervisor sees their department only
    assert len(client.get("/api/incidents/board", headers=admin_h).json()) > len(cards)
    assert client.get("/api/incidents/board", headers=worker_h).status_code == 403


def test_report_filters(client, supervisor_h, admin_h):
    me = uid("supervisor@demo.com")
    mine = client.get("/api/incidents?assigned_to_me=true&page_size=100", headers=supervisor_h).json()
    with SessionLocal() as db:
        from app.models import Incident
        assert all(db.get(Incident, i["id"]).investigator_id == me for i in mine["items"])
    depts = client.get("/api/departments", headers=admin_h).json()
    fab = next(d for d in depts if d["code"] == "FAB")["id"]
    by_dept = client.get(f"/api/incidents?department_id={fab}&page_size=100", headers=admin_h).json()
    assert by_dept["total"] > 0 and all(i["department"]["id"] == fab for i in by_dept["items"])
    recent = client.get(f"/api/hazards?date_from={(date.today() - timedelta(days=7)).isoformat()}&page_size=100",
                        headers=admin_h).json()
    assert all(h["created_at"][:10] >= (date.today() - timedelta(days=7)).isoformat() for h in recent["items"])
    assert client.get("/api/incidents?category=burn", headers=admin_h).status_code == 200


def test_global_search_is_scoped(client, worker_h, supervisor_h, admin_h):
    inc = new_incident(client, worker_h, title="Zebra crossing paint worn away")
    assert any(i["id"] == inc["id"] for i in client.get("/api/search?q=zebra", headers=worker_h).json()["incidents"])
    assert client.get("/api/search?q=worker", headers=worker_h).json()["people"] == []  # workers don't search people
    sup = client.get("/api/search?q=WRK-0", headers=supervisor_h).json()["people"]
    assert sup and all(p["department"] == "Warehouse & Logistics" for p in sup)
    assert client.get("/api/search?q=fabric", headers=admin_h).json()["departments"][0]["code"] == "FAB"
    other = token_for(client, "worker07@demo.com")
    assert client.get("/api/search?q=zebra", headers=other).json()["incidents"] == []


def test_audit_log_viewer(client, admin_h, supervisor_h):
    page = client.get("/api/audit?action=login&page_size=5", headers=admin_h).json()
    assert page["total"] > 0 and all(e["action"] == "login" for e in page["items"]) and page["items"][0]["actor"]
    prefixed = client.get("/api/audit?action=incident.", headers=admin_h).json()
    assert all(e["action"].startswith("incident.") for e in prefixed["items"])
    assert "login" in client.get("/api/audit/actions", headers=admin_h).json()
    assert client.get("/api/audit", headers=supervisor_h).status_code == 403


def test_supervisor_kpis(client, supervisor_h, worker_h):
    d = client.get("/api/dashboard/supervisor", headers=supervisor_h).json()
    assert d["scope"] == "department" and set(d["incidents_by_status"]) >= {"reported", "closed"}
    assert d["avg_days_to_close"] is not None and d["actions_overdue"] >= 0
    assert client.get("/api/dashboard/supervisor", headers=worker_h).status_code == 403


# --- Phase 4: 5 Whys root cause ---------------------------------------------------------------------------------

def test_root_cause_suggestion_is_validated_and_saved_only_when_confirmed(client, worker_h, supervisor_h):
    from app.ai.schemas import RootCauseAnalysis
    inc = new_incident(client, worker_h, category="caught_in_machinery", title="Glove pulled into conveyor roller",
                       description="My glove was caught by the roller while I cleared a jam. The guard was open.")
    assert client.post(f"/api/incidents/{inc['id']}/root-cause/suggest", headers=worker_h).status_code == 403
    r = client.post(f"/api/incidents/{inc['id']}/root-cause/suggest", headers=supervisor_h)
    assert r.status_code == 200
    s = r.json()["root_cause_suggestion"]
    RootCauseAnalysis.model_validate(s)  # same schema the live model must satisfy
    assert s["demo_mode"] is True and 3 <= len(s["whys"]) <= 5 and "interlock" in s["root_cause"]
    assert "Glove pulled into conveyor roller" in s["whys"][0]["question"]
    assert s["suggested_actions"][0]["control_level"] in ("elimination", "substitution", "engineering")
    assert r.json()["root_cause"] is None  # nothing is decided by the AI
    # The reporter sees the confirmed root cause, never the raw suggestion.
    assert client.get(f"/api/incidents/{inc['id']}", headers=worker_h).json()["root_cause_suggestion"] is None
    saved = client.put(f"/api/incidents/{inc['id']}/root-cause",
                       json={"root_cause": "Guard had no interlock and jams were cleared with the roller running."},
                       headers=supervisor_h)
    assert saved.status_code == 200 and saved.json()["root_cause"].startswith("Guard had no interlock")
    assert client.get(f"/api/incidents/{inc['id']}", headers=worker_h).json()["root_cause"].startswith("Guard")


def test_root_cause_schema_rejects_short_chains():
    import pytest
    from pydantic import ValidationError
    from app.ai.schemas import RootCauseAnalysis
    with pytest.raises(ValidationError):
        RootCauseAnalysis.model_validate({"whys": [{"question": "Why?", "answer": "Because."}], "root_cause": "x",
                                          "contributing_factors": [], "suggested_actions": [], "confidence": "low"})


def test_every_category_has_a_demo_chain():
    from app.ai.root_cause_demo import CHAINS
    from app.schemas.reports import INCIDENT_CATEGORIES
    assert set(INCIDENT_CATEGORIES) <= set(CHAINS)
