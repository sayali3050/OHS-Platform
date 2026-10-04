"""Phase 5: risk register, ergonomics, drudgery and fatigue check-ins. Scores are deterministic and unit-tested."""
import pytest

from app.services.ergonomics import fatigued, risk_level, score_drudgery, score_ergonomics
from tests.conftest import token_for


# --- pure scoring -----------------------------------------------------------------------------------------------

@pytest.mark.parametrize("score,level", [(1, "low"), (4, "low"), (5, "moderate"), (9, "moderate"), (10, "high"),
                                         (16, "high"), (20, "critical"), (25, "critical")])
def test_risk_bands(score, level):
    assert risk_level(score) == level


def test_drudgery_extremes_and_weights():
    assert score_drudgery({f: 1 for f in ("repetition", "load", "duration", "posture", "frequency", "vibration", "recovery")})[:2] == (0, "low")
    assert score_drudgery({f: 5 for f in ("repetition", "load", "duration", "posture", "frequency", "vibration", "recovery")})[:2] == (100, "high")
    mid = {f: 3 for f in ("repetition", "load", "duration", "posture", "frequency", "vibration", "recovery")}
    assert score_drudgery(mid)[0] == 50
    # Load weighs more than vibration, so raising it moves the score further.
    assert score_drudgery({**mid, "load": 5})[0] > score_drudgery({**mid, "vibration": 5})[0]
    assert score_drudgery({**mid, "load": 5, "posture": 4})[2] == ["load", "posture"]


ERGO = dict(hours_per_day=8, lifts_per_hour=0, heaviest_kg=0, postures=[], repetitive_hand=False,
            vibration_tools=False, pushing_pulling=False, discomfort_areas=[], discomfort_level=0)


def test_ergonomics_rules():
    assert score_ergonomics(ERGO)[2] == "low" and score_ergonomics(ERGO)[1] == ["keep_going"]
    factors, recs, level, points = score_ergonomics({**ERGO, "heaviest_kg": 30, "lifts_per_hour": 40,
                                                     "postures": ["bending", "twisting"], "discomfort_level": 8})
    assert level == "critical" and points == 3 + 2 + 2 + 2 + 3
    assert recs[0] == "see_health" and "task_review" in recs  # discomfort always goes to a person first


def test_fatigue_flag():
    assert fatigued("very_tired", 4, 2) and fatigued("normal", 1, 2) and fatigued("normal", 4, 4)
    assert not fatigued("tired", 3, 3)


# --- risk register API ------------------------------------------------------------------------------------------

RISK = {"title": "Forklift reversing near the dock door", "likelihood": 4, "severity_score": 5, "affected_workers": 6,
        "exposure_frequency": "daily", "recommended_controls": [{"level": "engineering", "measure": "Fit a reversing camera"}]}


def test_supervisor_assesses_a_risk_and_the_score_is_computed(client, supervisor_h, worker_h):
    r = client.post("/api/risk-assessments", json={**RISK, "risk_score": 1}, headers=supervisor_h)  # client score ignored
    assert r.status_code == 201, r.text
    ra = r.json()
    assert ra["risk_score"] == 20 and ra["risk_level"] == "critical" and ra["department"]["name"] == "Warehouse & Logistics"
    upd = client.put(f"/api/risk-assessments/{ra['id']}", json={**RISK, "likelihood": 2}, headers=supervisor_h).json()
    assert upd["risk_score"] == 10 and upd["risk_level"] == "high"
    explained = client.post(f"/api/risk-assessments/{ra['id']}/explain", headers=supervisor_h).json()
    assert "10 of 25" in explained["ai_explanation"] or "10" in explained["ai_explanation"]
    # Workers can read their department's register but not change it.
    assert any(x["id"] == ra["id"] and not x["can_edit"] for x in client.get("/api/risk-assessments", headers=worker_h).json())
    assert client.post("/api/risk-assessments", json=RISK, headers=worker_h).status_code == 403
    assert client.post("/api/risk-assessments", json={**RISK, "likelihood": 6}, headers=supervisor_h).status_code == 422


def test_risk_register_is_scoped_and_matrix_adds_up(client, supervisor_h, admin_h):
    other = token_for(client, "supervisor.fab@demo.com")
    mine = client.get("/api/risk-assessments", headers=supervisor_h).json()
    assert mine and all(r["department"]["name"] == "Warehouse & Logistics" for r in mine)
    assert all(r["department"]["name"] != "Warehouse & Logistics" for r in client.get("/api/risk-assessments", headers=other).json())
    m = client.get("/api/risk-assessments/matrix", headers=admin_h).json()
    assert len(m) == 5 and all(len(row) == 5 for row in m)
    assert sum(map(sum, m)) == len(client.get("/api/risk-assessments", headers=admin_h).json())
    ra = mine[0]
    assert client.put(f"/api/risk-assessments/{ra['id']}", json=RISK, headers=other).status_code == 404


# --- ergonomics, drudgery, check-in -----------------------------------------------------------------------------

def test_ergonomics_questionnaire_flags_high_risk_to_supervisor(client, worker_h, supervisor_h):
    from tests.test_ai_workflow import latest_note
    r = client.post("/api/ergonomics", json={**ERGO, "heaviest_kg": 30, "lifts_per_hour": 50, "postures": ["bending", "overhead"],
                                             "discomfort_areas": ["lower_back", "shoulders"], "discomfort_level": 7}, headers=worker_h)
    assert r.status_code == 201 and r.json()["risk_level"] in ("high", "critical")
    assert latest_note("supervisor@demo.com").kind == "ergonomics_high"
    assert client.post("/api/ergonomics", json={**ERGO, "postures": ["handstand"]}, headers=worker_h).status_code == 422
    team = client.get("/api/ergonomics?scope=team", headers=supervisor_h).json()
    assert team and all(e["user"]["department"] == "Warehouse & Logistics" for e in team)


def test_drudgery_weight_override_is_merged_and_checked():
    from pydantic import ValidationError

    from app.core.config import Settings
    w = Settings(drudgery_weights={"load": 0.5}).drudgery_weights
    assert w["load"] == 0.5 and w["posture"] == 0.2 and len(w) == 7  # unnamed factors keep their defaults
    for bad in ({"noise": 1}, {"load": -1}):
        with pytest.raises(ValidationError):
            Settings(drudgery_weights=bad)


def test_drudgery_assessment(client, supervisor_h, worker_h):
    from sqlalchemy import select
    from app.database.session import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        worker = db.scalar(select(User).where(User.email == "worker@demo.com")).id
        outsider = db.scalar(select(User).where(User.email == "worker02@demo.com")).id
    factors = {"repetition": 4, "load": 5, "duration": 3, "posture": 4, "frequency": 3, "vibration": 1, "recovery": 2}
    r = client.post("/api/drudgery", json={"user_id": worker, "task_name": "Unloading sacks", "factors": factors},
                    headers=supervisor_h)
    assert r.status_code == 201 and r.json()["score"] == score_drudgery(factors)[0] and r.json()["interventions"][0] == "load"
    assert client.post("/api/drudgery", json={"user_id": outsider, "task_name": "x task", "factors": factors},
                       headers=supervisor_h).status_code == 422
    assert client.post("/api/drudgery", json={"user_id": worker, "task_name": "Missing factors", "factors": {"load": 3}},
                       headers=supervisor_h).status_code == 422
    assert all(d["worker"]["id"] == worker for d in client.get("/api/drudgery", headers=worker_h).json())


def test_daily_checkin_is_one_per_day_and_team_view_is_aggregate(client, worker_h, supervisor_h):
    body = {"feeling": "very_tired", "sleep_quality": 2, "workload": 5, "physical_fatigue": 5, "mental_workload": 3,
            "support_requested": True}
    first = client.put("/api/wellbeing/today", json=body, headers=worker_h).json()
    second = client.put("/api/wellbeing/today", json={**body, "feeling": "tired"}, headers=worker_h).json()
    assert first["fatigued"] and second["feeling"] == "tired" and second["checkin_date"] == first["checkin_date"]
    mine = client.get("/api/wellbeing/mine", headers=worker_h).json()
    assert sum(c["checkin_date"] == first["checkin_date"] for c in mine) == 1
    team = client.get("/api/wellbeing/team", headers=supervisor_h).json()
    assert len(team["days"]) == 7 and team["people"] > 0
    assert any(s["full_name"] == "Demo Worker" for s in team["support_requests"])  # named only because they asked
    assert client.get("/api/wellbeing/team", headers=worker_h).status_code == 403
