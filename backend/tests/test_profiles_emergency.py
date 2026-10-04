"""Phase 3: automatic language, voice notes, the site-wide alarm and roll call, profiles, departments, admin overview."""
import json
from datetime import date, timedelta

from sqlalchemy import select

from app.ai import guardrails
from app.database.session import SessionLocal
from app.models import Attachment, Department, EmergencyEvent, Hazard, Incident, User
from app.utils.langdetect import detect_language
from app.models.enums import Language
from tests.conftest import token_for

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 200  # smallest thing that sniffs as a WebM voice note


def uid(email):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


# --- language is read from the text, never asked -----------------------------------------------------------------

def test_detects_the_four_languages():
    assert detect_language("Oil on the floor near the dock door") == Language.en
    assert detect_language("गोदाम में फर्श पर तेल गिरा है और कोई फिसल सकता है") == Language.hi
    assert detect_language("गोदामात फरशीवर तेल सांडले आहे आणि कोणी घसरू शकतो") == Language.mr
    assert detect_language("Öl auf dem Boden an der Laderampe") == Language.de
    assert detect_language("1234") is None


def test_report_language_comes_from_the_text_not_the_profile(client):
    # The demo worker's profile says Hindi; a report written in Marathi is recorded as Marathi.
    h = token_for(client, "worker@demo.com")
    body = {"category": "slippery_floor", "severity": "medium",
            "description": "गोदामात फरशीवर तेल सांडले आहे आणि कोणी घसरू शकतो"}
    r = client.post("/api/hazards", data={"payload": json.dumps(body)}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["original_language"] == "mr"


def test_safeassist_answers_in_the_language_of_the_question(client):
    h = token_for(client, "worker03@demo.com")
    r = client.post("/api/ai/assist", json={"message": "Wie hebe ich schwere Kisten richtig?", "language": "en"},
                    headers=h)
    assert r.status_code == 200
    with SessionLocal() as db:
        from app.models import AIConversation
        assert db.get(AIConversation, r.json()["conversation_id"]).language == "de"


def test_smelling_gas_is_an_emergency():
    assert guardrails.classify("I smell gas near the boiler") == "emergency"
    assert guardrails.classify("मुझे गैस की बदबू आ रही है") == "emergency"


# --- voice notes --------------------------------------------------------------------------------------------------

def test_incident_with_voice_note(client, worker_h, supervisor_h):
    body = {"title": "Pallet slipped off forks", "description": "The pallet slid off the forks at Dock 2.",
            "category": "struck_by", "severity": "low",
            "occurred_at": (date.today() - timedelta(days=1)).isoformat() + "T10:00:00Z"}
    r = client.post("/api/incidents", data={"payload": json.dumps(body)},
                    files={"voice": ("note.webm", WEBM, "audio/webm")}, headers=worker_h)
    assert r.status_code == 201, r.text
    audio = [a for a in r.json()["attachments"] if a["content_type"].startswith("audio/")]
    assert len(audio) == 1 and audio[0]["content_type"] == "audio/webm"
    # Served with the report's visibility rules: the department supervisor can play it.
    got = client.get(f"/api/attachments/{audio[0]['id']}", headers=supervisor_h)
    assert got.status_code == 200 and got.content == WEBM


def test_voice_note_must_really_be_audio(client, worker_h):
    body = {"category": "other", "severity": "low", "description": "Loose cable across the walkway."}
    r = client.post("/api/hazards", data={"payload": json.dumps(body)},
                    files={"voice": ("note.webm", b"<script>alert(1)</script>" * 10, "audio/webm")}, headers=worker_h)
    assert r.status_code == 422 and "voice" in r.json()["fields"]


def test_anonymous_voice_note_has_no_uploader(client, worker_h):
    body = {"category": "blocked_exit", "severity": "high", "description": "Fire exit 3 blocked by pallets.",
            "is_anonymous": True}
    r = client.post("/api/hazards", data={"payload": json.dumps(body)},
                    files={"voice": ("n.webm", WEBM, "audio/webm")}, headers=worker_h)
    assert r.status_code == 201
    with SessionLocal() as db:
        att = db.scalar(select(Attachment).where(Attachment.hazard_id == r.json()["id"]))
        assert att.uploaded_by is None


# --- the alarm, roll call and follow-up incident ------------------------------------------------------------------

def test_alarm_reaches_everyone_and_runs_a_roll_call(client, admin_h):
    raiser = token_for(client, "worker14@demo.com")
    other = token_for(client, "worker13@demo.com")  # a different department
    r = client.post("/api/emergency/alert", json={"emergency_type": "chemical_spill", "notes": "Drum leaking"},
                    headers=raiser)
    assert r.status_code == 201
    event_id = r.json()["id"]

    # Anyone, in any department, sees the alarm sounding.
    active = client.get("/api/emergency/active", headers=other).json()
    mine = next(e for e in active if e["id"] == event_id)
    assert mine["my_response"] is None and mine["counts"] is None and mine["steps"]
    assert mine["can_resolve"] is False

    # A critical incident was opened so the cause gets investigated.
    with SessionLocal() as db:
        event = db.get(EmergencyEvent, event_id)
        incident = db.get(Incident, event.incident_id)
        assert incident.severity.value == "critical" and incident.category == "chemical_exposure"

    assert client.post(f"/api/emergency/{event_id}/respond", json={"status": "safe"}, headers=other).status_code == 200
    need = client.post(f"/api/emergency/{event_id}/respond", json={"status": "need_help"}, headers=raiser)
    assert need.json()["my_response"] == "need_help"

    roll = client.get(f"/api/emergency/{event_id}/roll-call", headers=admin_h).json()
    assert roll["event"]["counts"]["safe"] >= 1 and roll["event"]["counts"]["need_help"] >= 1
    assert roll["people"][0]["status"] == "need_help"  # people who need help are listed first
    assert client.get(f"/api/emergency/{event_id}/roll-call", headers=other).status_code == 403

    # Only staff can stop it, and then it stops for everyone.
    assert client.post(f"/api/emergency/{event_id}/resolve", json={}, headers=other).status_code == 403
    assert client.post(f"/api/emergency/{event_id}/resolve", json={"note": "Spill contained"},
                       headers=admin_h).status_code == 204
    assert all(e["id"] != event_id for e in client.get("/api/emergency/active", headers=other).json())
    assert client.post(f"/api/emergency/{event_id}/respond", json={"status": "safe"}, headers=other).status_code == 409


def test_need_help_alerts_the_safety_team_once(client, supervisor_h, admin_h):
    raiser = token_for(client, "worker07@demo.com")
    event_id = client.post("/api/emergency/alert", json={"emergency_type": "fire"}, headers=raiser).json()["id"]
    worker = token_for(client, "worker@demo.com")  # Warehouse, supervised by supervisor@demo.com
    before = client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"]
    for _ in range(2):
        client.post(f"/api/emergency/{event_id}/respond", json={"status": "need_help"}, headers=worker)
    assert client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"] == before + 1
    client.post(f"/api/emergency/{event_id}/resolve", json={}, headers=admin_h)


def test_voice_note_on_an_alert(client, admin_h):
    raiser = token_for(client, "worker08@demo.com")
    event_id = client.post("/api/emergency/alert", json={"emergency_type": "medical"}, headers=raiser).json()["id"]
    r = client.post(f"/api/emergency/{event_id}/voice", files={"voice": ("v.webm", WEBM, "audio/webm")}, headers=raiser)
    assert r.status_code == 201
    other = token_for(client, "worker09@demo.com")
    assert client.post(f"/api/emergency/{event_id}/voice", files={"voice": ("v.webm", WEBM, "audio/webm")},
                       headers=other).status_code == 404
    client.post(f"/api/emergency/{event_id}/resolve", json={}, headers=admin_h)


def test_admin_manages_site_numbers(client, admin_h, worker_h):
    r = client.post("/api/emergency/contacts", json={"label": "Main gate security", "phone": "+91 00000 77777"},
                    headers=admin_h)
    assert r.status_code == 201
    phones = {c["phone"]: c["kind"] for c in client.get("/api/emergency", headers=worker_h).json()["contacts"]}
    assert phones["+91 00000 77777"] == "site"
    assert client.post("/api/emergency/contacts", json={"label": "X", "phone": "1"}, headers=worker_h).status_code == 403
    assert client.delete(f"/api/emergency/contacts/{r.json()['id']}", headers=admin_h).status_code == 204


# --- profiles -----------------------------------------------------------------------------------------------------

def test_my_profile_has_full_details(client, worker_h):
    p = client.get("/api/people/me", headers=worker_h).json()
    for field in ("date_of_birth", "blood_group", "address", "date_of_joining", "qualification",
                  "emergency_contact_name", "emergency_contact_phone", "designation", "shift", "supervisor"):
        assert p[field], field
    assert p["is_me"] and not p["can_edit_work"]


def test_worker_edits_personal_but_not_work_details(client, worker_h):
    me = uid("worker@demo.com")
    ok = client.patch(f"/api/people/{me}", json={"blood_group": "O+", "emergency_contact_phone": "+91 00000 12345"},
                      headers=worker_h)
    assert ok.status_code == 200 and ok.json()["blood_group"] == "O+"
    assert client.patch(f"/api/people/{me}", json={"designation": "Plant Manager"}, headers=worker_h).status_code == 403
    assert client.patch(f"/api/people/{me}", json={"blood_group": "Z"}, headers=worker_h).status_code == 422


def test_supervisor_adds_and_manages_workers_in_own_department_only(client, supervisor_h):
    r = client.post("/api/people", json={"full_name": "New Starter", "email": "new.starter@example.com",
                                         "employee_id": "WRK-7301", "password": "Start1234", "designation": "Packer",
                                         "department_id": 999}, headers=supervisor_h)
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["department"]["code"] == "WHL"            # forced to the supervisor's own department
    assert new["supervisor"]["id"] == uid("supervisor@demo.com")
    assert client.post("/api/people", json={"full_name": "Boss", "email": "boss@example.com", "employee_id": "SUP-7301",
                                            "password": "Start1234", "role": "supervisor"},
                       headers=supervisor_h).status_code == 422

    listed = client.get("/api/people", headers=supervisor_h).json()["items"]
    assert listed and all(p["role"] == "worker" and p["department"] == "Warehouse & Logistics" for p in listed)

    upd = client.patch(f"/api/people/{new['id']}", json={"shift": "night", "experience_years": 4}, headers=supervisor_h)
    assert upd.status_code == 200 and upd.json()["shift"] == "night"
    # A worker in another department is invisible to this supervisor.
    with SessionLocal() as db:
        outsider = db.scalar(select(User).where(User.email == "worker02@demo.com"))
        assert outsider.department.code != "WHL"
    assert client.get(f"/api/people/{outsider.id}", headers=supervisor_h).status_code == 404
    assert client.patch(f"/api/people/{uid('supervisor@demo.com')}", json={"designation": "x"},
                        headers=supervisor_h).status_code == 403


def test_admin_adds_a_supervisor(client, admin_h):
    depts = client.get("/api/departments", headers=admin_h).json()
    r = client.post("/api/people", json={"full_name": "Second Shift Lead", "email": "lead2@example.com",
                                         "employee_id": "SUP-7302", "password": "Start1234", "role": "supervisor",
                                         "department_id": depts[0]["id"]}, headers=admin_h)
    assert r.status_code == 201 and r.json()["role"] == "supervisor"
    sups = client.get("/api/people?role=supervisor", headers=admin_h).json()["items"]
    assert any(p["email"] == "lead2@example.com" for p in sups)


def test_workers_cannot_list_or_add_people(client, worker_h):
    assert client.get("/api/people", headers=worker_h).status_code == 403
    assert client.get(f"/api/people/{uid('worker02@demo.com')}", headers=worker_h).status_code == 404


def test_health_checks_recorded_by_managers_only(client, worker_h, supervisor_h):
    me = uid("worker@demo.com")
    history = client.get(f"/api/people/{me}/health-checks", headers=worker_h).json()
    assert {c["check_type"] for c in history} >= {"pre_employment", "periodic"}
    check = {"check_type": "hearing", "checked_on": date.today().isoformat(), "result": "fit", "hearing": "Normal",
             "next_due_on": (date.today() + timedelta(days=365)).isoformat()}
    assert client.post(f"/api/people/{me}/health-checks", json=check, headers=worker_h).status_code == 403
    r = client.post(f"/api/people/{me}/health-checks", json=check, headers=supervisor_h)
    assert r.status_code == 201 and r.json()["recorded_by_name"] == "Demo Supervisor"
    bad = {**check, "blood_pressure": "high"}
    assert client.post(f"/api/people/{me}/health-checks", json=bad, headers=supervisor_h).status_code == 422


def test_work_history_and_records(client, worker_h):
    me = uid("worker@demo.com")
    r = client.post(f"/api/people/{me}/work-history",
                    json={"employer": "Old Mills Ltd", "role_title": "Helper", "from_date": "2015-01-01",
                          "to_date": "2017-06-30"}, headers=worker_h)
    assert r.status_code == 201
    assert any(w["employer"] == "Old Mills Ltd" for w in client.get(f"/api/people/{me}/work-history", headers=worker_h).json())
    rec = client.get(f"/api/people/{me}/records", headers=worker_h).json()
    assert rec["incidents"] and rec["ppe"] and rec["training"]
    with SessionLocal() as db:  # anonymous hazards are never linked to the person
        anon = set(db.scalars(select(Hazard.id).where(Hazard.is_anonymous.is_(True))))
    assert not anon & {h["id"] for h in rec["hazards"]}


# --- departments and the admin overview ---------------------------------------------------------------------------

def test_department_profiles(client, worker_h, admin_h):
    cards = client.get("/api/departments", headers=worker_h).json()
    assert len(cards) >= 6
    fab = next(c for c in cards if c["code"] == "FAB")
    p = client.get(f"/api/departments/{fab['id']}", headers=worker_h).json()
    assert p["risk_level"] == "critical" and "Ear protection" in p["required_ppe"] and p["assembly_point"]
    assert p["locations"] and p["supervisors"] and p["can_edit"] is False
    assert client.patch(f"/api/departments/{fab['id']}", json={"building": "x"}, headers=worker_h).status_code == 403
    upd = client.patch(f"/api/departments/{fab['id']}", json={"key_hazards": ["Arc flash", " "], "risk_level": "high"},
                       headers=admin_h)
    assert upd.status_code == 200 and upd.json()["key_hazards"] == ["Arc flash"]
    new = client.post("/api/departments", json={"name": "Paint Shop", "code": "pnt", "risk_level": "high",
                                                "locations": ["Spray Booth", "Drying Oven"]}, headers=admin_h)
    assert new.status_code == 201 and new.json()["code"] == "PNT" and len(new.json()["locations"]) == 2
    with SessionLocal() as db:  # other tests count the seeded departments
        db.delete(db.get(Department, new.json()["id"]))
        db.commit()


def test_admin_overview(client, admin_h, supervisor_h):
    d = client.get("/api/dashboard/admin", headers=admin_h).json()
    assert d["kpis"]["open_incidents"] > 0 and len(d["trend"]) == 6
    assert {x["code"] for x in d["departments"]} >= {"WHL", "FAB"}
    assert d["ppe"]["overdue"] >= 1 and d["training"]["compliance"] is not None
    assert d["health"]["restricted"] >= 1 and d["system"]["ai_mode"] == "demo" and d["system"]["demo_data"] is True
    assert client.get("/api/dashboard/admin", headers=supervisor_h).status_code == 403


def test_system_info_reports_demo_modes(client):
    info = client.get("/api/system/info").json()
    assert info["ai_demo_mode"] is True and info["demo_data"] is True
