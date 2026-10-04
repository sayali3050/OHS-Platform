from datetime import date

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import User
from tests.conftest import token_for


# --- notifications ----------------------------------------------------------------------------------------------

def test_notifications_list_mark_read_and_read_all(client, supervisor_h):
    data = client.get("/api/notifications", headers=supervisor_h).json()
    assert data["items"] and data["unread"] >= 1
    first = next(n for n in data["items"] if n["read_at"] is None)
    r = client.post(f"/api/notifications/{first['id']}/read", headers=supervisor_h)
    assert r.status_code == 200 and r.json()["read_at"] is not None
    assert client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"] == data["unread"] - 1
    client.post("/api/notifications/read-all", headers=supervisor_h)
    assert client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"] == 0


def test_cannot_read_someone_elses_notification(client, supervisor_h, worker_h):
    note = client.get("/api/notifications", headers=supervisor_h).json()["items"][0]
    assert client.post(f"/api/notifications/{note['id']}/read", headers=worker_h).status_code == 404


# --- emergency --------------------------------------------------------------------------------------------------

def test_emergency_info_has_guidance_and_only_real_contacts(client, worker_h):
    info = client.get("/api/emergency?lang=en", headers=worker_h).json()
    assert info["first_step"].startswith("If anyone is in immediate danger")
    # Without an override, the demo worker (preferred language Hindi) gets Hindi guidance.
    hindi = client.get("/api/emergency", headers=worker_h).json()
    assert "अलार्म" in hindi["first_step"] and hindi["guides"][0]["label"] == "आग या धुआँ"
    assert {g["type"] for g in info["guides"]} >= {"fire", "medical", "chemical_spill"}
    phones = {c["phone"] for c in info["contacts"]}
    assert "+91 20 5555 0100" in phones           # configured in conftest
    assert "+91 00000 00002" in phones            # the worker's real supervisor record
    assert info["contacts_configured"] is True


def test_emergency_without_configured_contacts_says_so(client, worker_h, monkeypatch):
    from app.services import emergency
    monkeypatch.setattr(emergency.settings, "emergency_contacts", [])
    info = client.get("/api/emergency", headers=worker_h).json()
    assert info["contacts_configured"] is False
    # No site number is invented: only the real supervisor and the official national numbers remain.
    assert {c["kind"] for c in info["contacts"]} == {"supervisor", "public"}
    public = {c["phone"]: c["label"] for c in info["contacts"] if c["kind"] == "public"}
    assert set(public) == {"112", "100", "101", "108"}


def test_emergency_alert_notifies_supervisor_and_admins(client, worker_h, supervisor_h, admin_h):
    before_sup = client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"]
    before_admin = client.get("/api/notifications/unread-count", headers=admin_h).json()["unread"]
    r = client.post("/api/emergency/alert", json={"emergency_type": "fire", "notes": "Smoke from the baler"},
                    headers=worker_h)
    assert r.status_code == 201 and r.json()["notified"] >= 2
    assert client.get("/api/notifications/unread-count", headers=supervisor_h).json()["unread"] == before_sup + 1
    assert client.get("/api/notifications/unread-count", headers=admin_h).json()["unread"] == before_admin + 1
    top = client.get("/api/notifications", headers=supervisor_h).json()["items"][0]
    assert top["priority"] == "critical" and "Fire" in top["title"]


def test_emergency_alert_is_rate_limited(client):
    h = token_for(client, "worker06@demo.com")
    codes = [client.post("/api/emergency/alert", json={"emergency_type": "other"}, headers=h).status_code
             for _ in range(7)]
    assert codes[:5] == [201] * 5 and 429 in codes


def test_contacts_env_parsing(monkeypatch):
    from app.core.config import Settings
    monkeypatch.setenv("EMERGENCY_CONTACTS", "Security: 100 ; bad-entry; First aid room:2222")
    assert Settings().emergency_contacts == [("Security", "100"), ("First aid room", "2222")]


# --- dashboard --------------------------------------------------------------------------------------------------

def test_demo_worker_score_is_explained(client, worker_h):
    d = client.get("/api/dashboard/worker", headers=worker_h).json()
    parts = {c["key"]: c for c in d["components"]}
    # PPE 80 (gloves overdue), training 100, daily checklists 100: equal weights -> 93.
    assert d["score"] == 93 and d["band"] == "good"
    assert parts["ppe"]["score"] == 80 and "gloves (overdue)" in parts["ppe"]["explanation"]
    assert parts["training"]["score"] == 100
    gloves = next(p for p in d["ppe"] if p["name"] == "Gloves")
    assert gloves["status"] == "overdue" and date.fromisoformat(gloves["replace_by"]) < date.today()
    assert d["reports"]["recent"]


def test_score_reweights_when_a_component_has_no_data():
    from app.services.dashboard import safety_score
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "worker06@demo.com"))
        u.worker_profile = None  # no PPE to measure (not committed)
        s = safety_score(db, u)
        db.rollback()
    keys = [c["key"] for c in s["components"]]
    assert "ppe" not in keys and "training" in keys
    assert abs(sum(c["weight"] for c in s["components"]) - 1) < 0.02


def test_dashboard_is_for_workers(client, supervisor_h):
    assert client.get("/api/dashboard/worker", headers=supervisor_h).status_code == 403


def test_locations_grouped_by_department(client, worker_h):
    depts = client.get("/api/locations", headers=worker_h).json()
    assert len(depts) == 6 and sum(len(d["locations"]) for d in depts) == 16
