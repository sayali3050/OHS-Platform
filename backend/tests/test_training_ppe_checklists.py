"""Phase 6: training and quizzes, certificates, AI quiz drafts, PPE issue/inspection, checklists."""
from datetime import date, timedelta

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import TrainingCourse, User
from tests.conftest import token_for


def uid(email):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


def course_id(title):
    with SessionLocal() as db:
        return db.scalar(select(TrainingCourse.id).where(TrainingCourse.title == title))


def test_courses_have_material_and_a_quiz_without_answers(client, worker_h):
    cards = client.get("/api/training/courses", headers=worker_h).json()
    assert cards[0]["mandatory"] and all(c["quizzes"] >= 1 for c in cards)
    detail = client.get(f"/api/training/courses/{course_id('Fire Safety Essentials')}", headers=worker_h).json()
    assert "Raise the alarm" in detail["content"] and len(detail["quiz"]["questions"]) == 5
    assert "correct_index" not in detail["quiz"]["questions"][0]  # answers never reach the browser before marking


def test_failing_then_passing_a_quiz_certifies(client):
    h = token_for(client, "worker15@demo.com")
    cid = course_id("Machine Guarding and Lockout")
    quiz = client.get(f"/api/training/courses/{cid}", headers=h).json()["quiz"]
    assert client.post(f"/api/training/courses/{cid}/read", headers=h).json()["completion_pct"] >= 50
    wrong = client.post(f"/api/training/quizzes/{quiz['id']}/attempt", json={"answers": [3, 0, 0, 0, 0]}, headers=h).json()
    assert not wrong["passed"] and wrong["certified_on"] is None and wrong["results"][0]["explanation"]
    right = client.post(f"/api/training/quizzes/{quiz['id']}/attempt", json={"answers": [1, 1, 1, 1, 1]}, headers=h).json()
    assert right["score"] == 100 and right["passed"] and right["expires_on"] == (date.today() + timedelta(days=365)).isoformat()
    cert = client.get(f"/api/training/courses/{cid}/certificate", headers=h).json()
    assert cert["valid"] and cert["number"].startswith(f"SO-{date.today().year}-")
    assert client.post(f"/api/training/quizzes/{quiz['id']}/attempt", json={"answers": [1]}, headers=h).status_code == 422


def test_certificate_privacy(client, supervisor_h):
    other = token_for(client, "worker07@demo.com")  # Assembly, not this supervisor's
    cid = course_id("Fire Safety Essentials")
    assert client.get(f"/api/training/courses/{cid}/certificate?user_id={uid('worker07@demo.com')}", headers=supervisor_h).status_code == 404
    mine = client.get(f"/api/training/courses/{cid}/certificate?user_id={uid('worker@demo.com')}", headers=supervisor_h)
    assert mine.status_code == 200 and mine.json()["name"] == "Demo Worker"
    assert client.get("/api/training/compliance", headers=other).status_code == 403


def test_compliance_matrix(client, supervisor_h):
    c = client.get("/api/training/compliance", headers=supervisor_h).json()
    assert c["courses"] and c["rows"] and all(r["department"] == "Warehouse & Logistics" for r in c["rows"])
    assert set(c["rows"][0]["statuses"]) == {str(x["id"]) for x in c["courses"]}


def test_ai_quiz_draft_is_validated_and_saved_after_review(client, supervisor_h, worker_h):
    cid = course_id("Safe Lifting and Posture")
    assert client.post("/api/training/quizzes/generate", json={"course_id": cid}, headers=worker_h).status_code == 403
    draft = client.post("/api/training/quizzes/generate", json={"course_id": cid, "count": 4, "topic": "trolley"},
                        headers=supervisor_h).json()
    assert draft["demo_mode"] and 3 <= len(draft["questions"]) <= 4
    bad = [{**draft["questions"][0], "correct_index": 9}] * 3
    assert client.post("/api/training/quizzes", json={"course_id": cid, "title": "Bad quiz", "questions": bad},
                       headers=supervisor_h).status_code == 422
    saved = client.post("/api/training/quizzes", json={"course_id": cid, "title": "Lifting refresher", "ai_generated": True,
                                                       "questions": draft["questions"]}, headers=supervisor_h)
    assert saved.status_code == 201
    assert client.get(f"/api/training/courses/{cid}", headers=worker_h).json()["quiz"]["title"] == "Lifting refresher"


def test_ppe_issue_inspect_and_report(client, supervisor_h, worker_h):
    from tests.test_ai_workflow import latest_note
    mine = client.get("/api/ppe/assignments", headers=worker_h).json()
    assert mine and {a["worker"]["full_name"] for a in mine} == {"Demo Worker"}
    gloves = next(a for a in mine if a["item"]["name"] == "Gloves")
    assert gloves["state"] == "overdue" and not gloves["can_manage"]
    r = client.post(f"/api/ppe/assignments/{gloves['id']}/report", json={"problem": "damaged"}, headers=worker_h)
    assert r.json()["state"] == "damaged" and latest_note("supervisor@demo.com").kind == "ppe_problem"
    items = {i["name"]: i["id"] for i in client.get("/api/ppe/items", headers=worker_h).json()}
    fresh = client.post("/api/ppe/issue", json={"user_id": uid("worker@demo.com"), "ppe_item_id": items["Gloves"]},
                        headers=supervisor_h).json()
    assert fresh["state"] == "ok" and fresh["issued_on"] == date.today().isoformat()
    assert client.post("/api/ppe/issue", json={"user_id": uid("worker02@demo.com"), "ppe_item_id": items["Gloves"]},
                       headers=supervisor_h).status_code == 422
    assert client.post(f"/api/ppe/assignments/{gloves['id']}/inspect", json={"inspection_status": "missing"},
                       headers=worker_h).status_code == 403
    summary = client.get("/api/ppe/summary", headers=supervisor_h).json()
    assert any(s["item"] == "Gloves" for s in summary)
    # Put the demo worker's overdue gloves back: other tests rely on that story.
    from app.models import PPEAssignment
    with SessionLocal() as db:
        a = db.get(PPEAssignment, gloves["id"])
        a.issued_on, a.replace_by, a.inspection_status = date.fromisoformat(gloves["issued_on"]), date.fromisoformat(gloves["replace_by"]), "ok"
        db.commit()


def test_checklist_no_answers_suggest_hazard_and_tell_supervisor(client, worker_h, supervisor_h):
    from tests.test_ai_workflow import latest_note
    lists = client.get("/api/checklists", headers=worker_h).json()
    walk = next(c for c in lists if c["title"] == "Pre-shift safety walk")
    assert {c["title"] for c in lists} >= {"Pre-shift safety walk", "Forklift pre-use check"}
    assert "Welding bay check" not in {c["title"] for c in lists}  # another department's
    answers = [{"item_id": i["id"], "answer": "yes"} for i in walk["items"]]
    answers[1] = {"item_id": walk["items"][1]["id"], "answer": "no", "note": "oil by dock 2"}
    assert client.post(f"/api/checklists/{walk['id']}/results", json={"answers": answers[:2]}, headers=worker_h).status_code == 422
    r = client.post(f"/api/checklists/{walk['id']}/results", json={"answers": answers}, headers=worker_h).json()
    assert r["failed_items"] == 1 and "oil by dock 2" in r["hazard_prompts"][0]
    assert latest_note("supervisor@demo.com").kind == "checklist_failed"
    assert next(c for c in client.get("/api/checklists", headers=worker_h).json() if c["id"] == walk["id"])["done_this_period"]
    failed = client.get("/api/checklists/results?failed_only=true", headers=supervisor_h).json()
    assert any(x["id"] == r["id"] for x in failed)


def test_supervisor_creates_department_checklist(client, supervisor_h, worker_h):
    r = client.post("/api/checklists", json={"title": "Dock door check", "items": [{"text": "Door seals intact"}],
                                             "department_id": 999}, headers=supervisor_h)
    assert r.status_code == 201 and r.json()["can_edit"]
    assert client.post("/api/checklists", json={"title": "Nope", "items": [{"text": "xxx"}]}, headers=worker_h).status_code == 403


# --- Phase 7: analytics -------------------------------------------------------------------------------------------

def test_trend_rule_flags_only_real_increases():
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from app.services import analytics
    from app.models import Incident
    from app.models.enums import Severity
    now = datetime(2026, 6, 30, tzinfo=timezone.utc)

    def inc(days_ago, cat="burn", dept=1):
        i = Incident(category=cat, severity=Severity.high, department_id=dept, location_id=None)
        i.occurred_at = now - timedelta(days=days_ago)
        return i
    rows = [inc(d) for d in (1, 2, 3, 5)] + [inc(40)] + [inc(2, "cut_laceration"), inc(45, "cut_laceration"), inc(50, "cut_laceration")]
    import app.services.analytics as mod
    orig = mod._scoped
    mod._scoped = lambda db, user: (rows, [])
    try:
        class DB:
            def scalars(self, _):
                return []
        signals = analytics.trends(DB(), SimpleNamespace(), now=now)
    finally:
        mod._scoped = orig
    cats = {s["key"]: s for s in signals if s["kind"] == "category"}
    assert cats["incident:burn"]["current"] == 4 and cats["incident:burn"]["previous"] == 1
    assert "incident:cut_laceration" not in cats  # fell, not rose


def test_heatmap_monthly_and_scope(client, supervisor_h, admin_h, worker_h):
    hm = client.get("/api/analytics/heatmap", headers=supervisor_h).json()
    assert len(hm) == 1 and hm[0]["department"]["name"] == "Warehouse & Logistics" and hm[0]["locations"]
    assert len(client.get("/api/analytics/heatmap", headers=admin_h).json()) >= 6
    from datetime import date
    m = client.get(f"/api/analytics/monthly?month={date.today().strftime('%Y-%m')}", headers=admin_h).json()
    assert m["demo_mode"] and str(m["incidents"]) in m["summary"] and m["sources"]
    assert client.get("/api/analytics/monthly?month=2026-13", headers=admin_h).status_code == 422
    assert client.get("/api/analytics/trends", headers=worker_h).status_code == 403


def test_copilot_answers_from_queries(client, supervisor_h):
    r = client.post("/api/analytics/copilot", json={"question": "Which actions are overdue?"}, headers=supervisor_h).json()
    assert r["intent"] == "overdue_actions" and r["facts"][0]["label"] == "total" and r["sources"]
    assert client.post("/api/analytics/copilot", json={"question": "कौन से खतरे सबसे ज़्यादा हैं?"}, headers=supervisor_h).json()["intent"] == "top_hazards"
    unknown = client.post("/api/analytics/copilot", json={"question": "What's for lunch?"}, headers=supervisor_h).json()
    assert unknown["intent"] is None and unknown["facts"] == []


def test_csv_export_is_scoped_and_safe(client, supervisor_h, worker_h):
    r = client.get("/api/analytics/export/incidents.csv", headers=supervisor_h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.content.decode("utf-8-sig").splitlines()
    assert lines[0].startswith("reference,occurred_at") and all("Warehouse" in l for l in lines[1:] if l)
    for kind in ("hazards", "actions", "risks"):
        assert client.get(f"/api/analytics/export/{kind}.csv", headers=supervisor_h).status_code == 200
    assert client.get("/api/analytics/export/incidents.csv", headers=worker_h).status_code == 403
    # A description that starts like a spreadsheet formula is exported as plain text.
    import json
    client.post("/api/hazards", data={"payload": json.dumps({"category": "other", "severity": "low",
                                                              "description": "=HYPERLINK(\"http://x\") cable by door"})}, headers=worker_h)
    out = client.get("/api/analytics/export/hazards.csv", headers=supervisor_h).content.decode("utf-8-sig")
    assert "'=HYPERLINK" in out and ",=HYPERLINK" not in out
