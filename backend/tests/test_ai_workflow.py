import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.ai import guardrails
from app.ai.provider import AIError
from app.ai.schemas import HazardSuggestion, Translation
from app.database.session import SessionLocal
from app.i18n import MESSAGES
from app.models import AuditLog, Hazard, Incident, Notification, User
from app.models.enums import HazardCategory, Language, Severity
from tests.conftest import token_for


def new_incident(client, h, **over):
    body = {"title": "Box fell from the second shelf", "description": "A box slid off the racking during picking.",
            "category": "struck_by", "severity": "medium",
            "occurred_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(), **over}
    r = client.post("/api/incidents", data={"payload": json.dumps(body)}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def new_hazard(client, h, **over):
    body = {"category": "slippery_floor", "description": "Oil on the floor by the dock door.", "severity": "medium", **over}
    r = client.post("/api/hazards", data={"payload": json.dumps(body)}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def uid(email):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


def latest_note(email):
    with SessionLocal() as db:
        return db.scalars(select(Notification).where(Notification.user_id == uid(email))
                          .order_by(Notification.id.desc())).first()


# --- translations -----------------------------------------------------------------------------------------------

def test_every_language_has_every_server_message():
    english = set(MESSAGES[Language.en])
    for lang, messages in MESSAGES.items():
        assert set(messages) == english, f"{lang.value} is missing {sorted(english - set(messages))}"
        for key, text in messages.items():
            if isinstance(text, list):
                assert len(text) == len(MESSAGES[Language.en][key]), f"{lang.value}:{key} step count differs"


def test_notifications_arrive_in_each_recipients_language(client, worker_h):
    # The demo worker prefers Hindi; their supervisor reads English.
    inc = new_incident(client, worker_h)
    assert "मिल गई" in latest_note("worker@demo.com").title
    assert latest_note("supervisor@demo.com").title.startswith("Medium incident reported")
    assert inc["reference"] in latest_note("supervisor@demo.com").body


# --- AI: SafeAssist ---------------------------------------------------------------------------------------------

def test_ai_status_is_demo_without_key(client, worker_h):
    assert client.get("/api/ai/status", headers=worker_h).json()["mode"] == "demo"


def test_assist_answers_in_requested_language_and_keeps_history(client, worker_h):
    r = client.post("/api/ai/assist", json={"message": "How should I lift heavy sacks?", "language": "en"}, headers=worker_h)
    assert r.status_code == 200
    first = r.json()
    assert first["reply"]["classification"] == "safety_guidance" and first["reply"]["demo_mode"] is True
    assert "knees" in first["reply"]["content"]
    r2 = client.post("/api/ai/assist", json={"message": "भारी बोरी कैसे उठाऊँ?", "conversation_id": first["conversation_id"]},
                     headers=worker_h)
    assert "घुटने" in r2.json()["reply"]["content"]  # Hindi, the worker's preferred language
    convo = client.get(f"/api/ai/conversations/{first['conversation_id']}", headers=worker_h).json()
    assert [m["role"] for m in convo["messages"]] == ["user", "assistant", "user", "assistant"]
    assert any(c["id"] == first["conversation_id"] for c in client.get("/api/ai/conversations", headers=worker_h).json())


def test_emergency_message_gets_fixed_escalation_not_a_model_answer(client, worker_h):
    r = client.post("/api/ai/assist", json={"message": "There is a fire in the solvent store, help!", "language": "en"},
                    headers=worker_h).json()
    assert r["reply"]["classification"] == "emergency"
    assert r["reply"]["content"] == MESSAGES[Language.en]["ai.escalation"]
    with SessionLocal() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "ai.emergency_detected",
                                                AuditLog.entity_id == r["conversation_id"])) is not None


def test_medical_concern_leads_with_disclaimer(client, worker_h):
    r = client.post("/api/ai/assist", json={"message": "I have back pain after lifting", "language": "en"},
                    headers=worker_h).json()
    assert r["reply"]["classification"] == "medical_concern"
    assert r["reply"]["content"].startswith("I can't give medical advice")


def test_conversations_are_private(client, worker_h, admin_h):
    cid = client.post("/api/ai/assist", json={"message": "noise"}, headers=worker_h).json()["conversation_id"]
    assert client.get(f"/api/ai/conversations/{cid}", headers=admin_h).status_code == 404
    assert client.post("/api/ai/assist", json={"message": "hi", "conversation_id": cid}, headers=admin_h).status_code == 404
    assert client.delete(f"/api/ai/conversations/{cid}", headers=worker_h).status_code == 204
    assert client.get(f"/api/ai/conversations/{cid}", headers=worker_h).status_code == 404


@pytest.mark.parametrize("text,expected", [
    ("Is there fire safety training this month?", "safety_guidance"),
    ("there is a fire in the store help!", "emergency"),
    ("Someone is unconscious near press 2", "emergency"),
    ("कोई बेहोश पड़ा है", "emergency"),
    ("मेरे सिर में दर्द है", "medical_concern"),
    ("Wie hebe ich schwere Kisten?", "safety_guidance"),
])
def test_classifier(text, expected):
    assert guardrails.classify(text) == expected


def test_phone_numbers_are_removed_but_references_kept():
    out = guardrails.strip_numbers("Call +91 98765 43210 about INC-2026-0042 on 2026-10-02.", Language.en)
    assert "98765" not in out and "INC-2026-0042" in out and "2026-10-02" in out


# --- AI: report suggestions -------------------------------------------------------------------------------------

def test_hazard_suggestion_from_english(client, worker_h):
    r = client.post("/api/ai/suggest/hazard", json={"description": "Live wire sparking next to the dock door",
                                                     "language": "en"}, headers=worker_h).json()
    assert r["category"] == "exposed_wire" and r["severity"] == "critical" and r["demo_mode"] is True
    assert "wire" in r["keywords"] and r["reasoning"].startswith("Suggested because")


def test_hazard_suggestion_from_hindi(client, worker_h):
    r = client.post("/api/ai/suggest/hazard", json={"description": "फ़र्श पर तेल गिरा है, बहुत फिसलन है"},
                    headers=worker_h).json()
    assert r["category"] == "slippery_floor" and "विवरण" in r["reasoning"]


def test_incident_suggestion(client, worker_h):
    r = client.post("/api/ai/suggest/incident", json={
        "description": "I slipped on oil near the dock and hurt my knee. It is swollen.", "language": "en"},
        headers=worker_h).json()
    assert r["category"] == "slip_trip_fall" and r["injury_likely"] is True
    assert r["title"].startswith("I slipped on oil")


class FakeProvider:
    demo = False

    def __init__(self, fail=False):
        self.fail = fail

    def structured(self, system, user, schema):
        if self.fail:
            raise AIError("down")
        if schema is Translation:
            return Translation(english="There is oil on the floor near the dock.")
        return HazardSuggestion(category=HazardCategory.chemical_leak, severity=Severity.high,
                                reasoning="Model says so.", keywords=["oil"])

    def chat(self, system, messages):
        if self.fail:
            raise AIError("down")
        assert "Reply in Hindi" in system
        return "अपने सुपरवाइज़र को 9876543210 पर फ़ोन करें।"


def test_live_provider_output_is_used_and_numbers_stripped(client, worker_h, monkeypatch):
    from app.ai import service
    monkeypatch.setattr(service, "get_provider", lambda: FakeProvider())
    s = client.post("/api/ai/suggest/hazard", json={"description": "oil everywhere on the floor"}, headers=worker_h).json()
    assert s["category"] == "chemical_leak" and s["demo_mode"] is False
    reply = client.post("/api/ai/assist", json={"message": "क्या करूँ?"}, headers=worker_h).json()["reply"]
    assert "9876543210" not in reply["content"] and "नंबर हटाया गया" in reply["content"]


def test_live_provider_failure_falls_back_safely(client, worker_h, monkeypatch):
    from app.ai import service
    monkeypatch.setattr(service, "get_provider", lambda: FakeProvider(fail=True))
    s = client.post("/api/ai/suggest/hazard", json={"description": "Live wire sparking", "language": "en"},
                    headers=worker_h).json()
    assert s["demo_mode"] is True and s["category"] == "exposed_wire"
    reply = client.post("/api/ai/assist", json={"message": "noise", "language": "en"}, headers=worker_h).json()["reply"]
    assert reply["content"].startswith("SafeAssist couldn't answer")


def test_non_english_report_is_translated_and_original_kept(client, worker_h, monkeypatch):
    from app.ai import service
    monkeypatch.setattr(service, "get_provider", lambda: FakeProvider())
    hz = new_hazard(client, worker_h, description="डॉक के पास फ़र्श पर तेल गिरा है।", original_language="hi")
    assert hz["description"] == "There is oil on the floor near the dock."
    assert hz["original_description"] == "डॉक के पास फ़र्श पर तेल गिरा है।" and hz["original_language"] == "hi"


def test_demo_mode_keeps_report_text_untranslated(client, worker_h):
    hz = new_hazard(client, worker_h, description="डॉक के पास फ़र्श पर तेल गिरा है।", original_language="hi")
    assert hz["description"] == "डॉक के पास फ़र्श पर तेल गिरा है।" and hz["original_description"] is None


# --- workflow ---------------------------------------------------------------------------------------------------

def test_full_incident_lifecycle_with_notes_and_notifications(client, worker_h, supervisor_h):
    inc = new_incident(client, worker_h)
    detail = client.get(f"/api/incidents/{inc['id']}", headers=supervisor_h).json()
    assert detail["can_manage"] and detail["allowed_transitions"] == ["assigned"]

    me = client.get("/api/auth/me", headers=supervisor_h).json()["id"]
    r = client.post(f"/api/incidents/{inc['id']}/assign", json={"investigator_id": me}, headers=supervisor_h)
    assert r.status_code == 200 and r.json()["status"] == "assigned" and r.json()["investigator"]["id"] == me
    assert "सौंपा गया" in latest_note("worker@demo.com").title  # reporter told, in Hindi

    for step in ["investigating", "corrective_action"]:
        r = client.post(f"/api/incidents/{inc['id']}/status", json={"status": step}, headers=supervisor_h)
        assert r.status_code == 200 and r.json()["status"] == step
    # Verification needs a corrective action, and it has to be done.
    blocked = client.post(f"/api/incidents/{inc['id']}/status", json={"status": "verification"}, headers=supervisor_h)
    assert blocked.status_code == 422 and "corrective action" in blocked.json()["fields"]["status"]
    fix = client.post("/api/actions", json={"incident_id": inc["id"], "description": "Fit a lip to the shelf edge",
                                            "due_date": (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()},
                      headers=supervisor_h).json()
    client.patch(f"/api/actions/corrective/{fix['id']}", json={"state": "completed", "completion_note": "Lip fitted"},
                 headers=supervisor_h)
    r = client.post(f"/api/incidents/{inc['id']}/status", json={"status": "verification"}, headers=supervisor_h)
    assert r.status_code == 200 and r.json()["status"] == "verification"
    no_note = client.post(f"/api/incidents/{inc['id']}/status", json={"status": "closed"}, headers=supervisor_h)
    assert no_note.status_code == 422 and "note" in no_note.json()["fields"]
    done = client.post(f"/api/incidents/{inc['id']}/status",
                       json={"status": "closed", "note": "Shelf lip fitted, checked by supervisor"}, headers=supervisor_h)
    assert done.status_code == 200 and done.json()["allowed_transitions"] == []
    with SessionLocal() as db:
        assert db.get(Incident, inc["id"]).closed_at is not None
    assert "Shelf lip fitted" in latest_note("worker@demo.com").body

    history = client.get(f"/api/incidents/{inc['id']}/activity", headers=worker_h).json()
    assert [h["action"] for h in history] == ["create", "assign", "status", "status", "status", "status"]  # actions log separately
    assert history[-1]["to_status"] == "closed" and history[-1]["note"].startswith("Shelf lip")


def test_transitions_are_enforced(client, worker_h, supervisor_h):
    inc = new_incident(client, worker_h)
    r = client.post(f"/api/incidents/{inc['id']}/status", json={"status": "closed", "note": "x"}, headers=supervisor_h)
    assert r.status_code == 422 and "status" in r.json()["fields"]
    assert client.post(f"/api/incidents/{inc['id']}/status", json={"status": "flying"},
                       headers=supervisor_h).status_code == 422


def test_only_responsible_staff_can_act(client, worker_h):
    inc = new_incident(client, worker_h)
    assert client.post(f"/api/incidents/{inc['id']}/status", json={"status": "assigned"},
                       headers=worker_h).status_code == 403
    other_sup = token_for(client, "supervisor.asm@demo.com")
    assert client.post(f"/api/incidents/{inc['id']}/status", json={"status": "assigned"},
                       headers=other_sup).status_code == 404
    detail = client.get(f"/api/incidents/{inc['id']}", headers=worker_h).json()
    assert detail["can_manage"] is False and detail["allowed_transitions"] == []


def test_admin_can_act_anywhere_and_ineligible_investigators_rejected(client, worker_h, admin_h):
    inc = new_incident(client, worker_h)
    assert client.post(f"/api/incidents/{inc['id']}/assign", json={"investigator_id": uid("worker06@demo.com")},
                       headers=admin_h).status_code == 422
    assert client.post(f"/api/incidents/{inc['id']}/assign", json={"investigator_id": uid("supervisor.asm@demo.com")},
                       headers=admin_h).status_code == 422
    assert client.post(f"/api/incidents/{inc['id']}/assign", json={"investigator_id": uid("supervisor@demo.com")},
                       headers=admin_h).status_code == 200


def test_staff_list_for_department(client, supervisor_h, worker_h):
    whl = next(d for d in client.get("/api/locations", headers=supervisor_h).json() if d["code"] == "WHL")["id"]
    names = {p["full_name"] for p in client.get(f"/api/staff?department_id={whl}", headers=supervisor_h).json()}
    assert {"Demo Supervisor", "Demo Admin"} <= names
    assert client.get("/api/staff", headers=worker_h).status_code == 403


def test_hazard_workflow_and_anonymous_reporter_never_contacted(client, worker_h, supervisor_h):
    hz = new_hazard(client, worker_h, is_anonymous=True)
    with SessionLocal() as db:
        before = db.query(Notification).count()
    assert client.post(f"/api/hazards/{hz['id']}/status", json={"status": "in_review"}, headers=supervisor_h).status_code == 200
    need_note = client.post(f"/api/hazards/{hz['id']}/status", json={"status": "controlled"}, headers=supervisor_h)
    assert need_note.status_code == 422 and "note" in need_note.json()["fields"]
    r = client.post(f"/api/hazards/{hz['id']}/status", json={"status": "controlled", "note": "Area cleaned, drip tray fitted"},
                    headers=supervisor_h)
    assert r.status_code == 200 and r.json()["allowed_transitions"] == ["closed", "in_review"]
    with SessionLocal() as db:
        assert db.query(Notification).count() == before  # nobody to notify: no identity was stored
        assert db.get(Hazard, hz["id"]).reporter_id is None
    history = client.get(f"/api/hazards/{hz['id']}/activity", headers=supervisor_h).json()
    assert history[0]["action"] == "create" and history[0]["actor"] is None
