"""Real users: self-registration, temporary passwords that must be changed, staff resets, email reset links,
and a real-site seed with no demo accounts."""
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.database.base import Base


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _bearer(r):
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_self_registered_worker_signs_in_and_works_straight_away(client):
    dept = client.get("/api/auth/departments").json()[0]["id"]
    r = client.post("/api/auth/register", json={"full_name": "Real Person", "email": "real.person@example.com",
                                                "password": "MyOwn1234", "employee_id": "EMP-9001", "department_id": dept})
    assert r.status_code == 201 and r.json()["requires_approval"] is False
    login = _login(client, "real.person@example.com", "MyOwn1234")
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is False
    assert client.get("/api/incidents", headers=_bearer(login)).status_code == 200


def test_staff_chosen_password_must_be_changed_before_anything_but_emergencies(client, supervisor_h):
    r = client.post("/api/people", headers=supervisor_h, json={
        "full_name": "Temp Starter", "email": "temp.starter@example.com", "employee_id": "WRK-9002", "password": "Given1234"})
    assert r.status_code == 201, r.text
    login = _login(client, "temp.starter@example.com", "Given1234")
    h = _bearer(login)
    assert login.json()["user"]["must_change_password"] is True
    assert client.get("/api/incidents", headers=h).status_code == 403
    # Never locked out of an emergency, and can still see who they are.
    assert client.get("/api/emergency/active", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 200

    bad = [({"current_password": "wrong1234", "new_password": "Fresh5678"}, "current_password"),
           ({"current_password": "Given1234", "new_password": "Given1234"}, "new_password"),
           ({"current_password": "Given1234", "new_password": "onlyletters"}, "new_password")]
    for body, field in bad:
        r = client.post("/api/auth/change-password", headers=h, json=body)
        assert r.status_code == 422 and field in r.text, r.text
    assert client.post("/api/auth/change-password", headers=h,
                       json={"current_password": "Given1234", "new_password": "Fresh5678"}).status_code == 204
    assert client.get("/api/auth/me", headers=h).json()["must_change_password"] is False
    assert client.get("/api/incidents", headers=h).status_code == 200
    assert _login(client, "temp.starter@example.com", "Given1234").status_code == 401
    assert _login(client, "temp.starter@example.com", "Fresh5678").status_code == 200


def test_supervisor_resets_a_workers_password(client, supervisor_h, worker_h, admin_h):
    me = client.get("/api/auth/me", headers=supervisor_h).json()
    r = client.post("/api/people", headers=admin_h, json={
        "full_name": "Forgetful Worker", "email": "forgetful@example.com", "employee_id": "WRK-9003",
        "password": "First1234", "department_id": me["department"]["id"]})
    target = r.json()["id"]

    assert client.post(f"/api/people/{target}/reset-password", headers=worker_h).status_code == 403
    assert client.post(f"/api/people/{me['id']}/reset-password", headers=supervisor_h).status_code in (400, 403)
    admin_id = client.get("/api/auth/me", headers=admin_h).json()["id"]
    assert client.post(f"/api/people/{admin_id}/reset-password", headers=supervisor_h).status_code == 404

    r = client.post(f"/api/people/{target}/reset-password", headers=supervisor_h)
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert len(temp) == 11 and temp[5] == "-"
    assert _login(client, "forgetful@example.com", "First1234").status_code == 401
    login = _login(client, "forgetful@example.com", temp)
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True
    audit = client.get("/api/audit?action=person.password_reset", headers=admin_h).json()
    assert temp not in str(audit)  # the temporary password is shown once and never stored in plain text


def test_forgot_password_emails_a_link_when_a_mail_server_is_set(client, monkeypatch):
    from app.services import mailer
    sent = []
    monkeypatch.setattr(get_settings(), "smtp_host", "smtp.example.com")
    monkeypatch.setattr(get_settings(), "app_url", "https://safety.example.com/")
    monkeypatch.setattr(mailer, "send", lambda to, subject, body: sent.append((to, body)) or True)
    for email in ("worker@demo.com", "nobody@example.com"):
        r = client.post("/api/auth/forgot-password", json={"email": email})
        assert r.status_code == 202  # same answer either way
    assert len(sent) == 1 and sent[0][0] == "worker@demo.com"
    assert "https://safety.example.com/reset-password?token=" in sent[0][1]


def test_password_rule_applies_to_reset_links_too(client):
    r = client.post("/api/auth/reset-password", json={"token": "x", "new_password": "abcdefghij"})
    assert r.status_code == 422 and "number" in r.text


@pytest.fixture
def blank_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    engine.dispose()


def test_real_site_seed_has_no_demo_accounts_and_creates_the_first_admin(blank_db, monkeypatch):
    from app import seed as seed_mod
    from app.models import Department, Incident, SafetyChecklist, TrainingCourse, TrainingQuiz, User
    s = get_settings()
    monkeypatch.setattr(s, "seed_demo_data", False)
    monkeypatch.setattr(s, "admin_email", "Safety.Head@Example.com")
    monkeypatch.setattr(s, "admin_password", "Start1234")
    monkeypatch.setattr(s, "admin_name", "Safety Head")
    seed_mod.seed(blank_db)
    seed_mod.seed(blank_db)  # idempotent

    users = blank_db.scalars(select(User)).unique().all()
    assert [(u.email, u.role.name.value, u.must_change_password) for u in users] == [
        ("safety.head@example.com", "admin", True)]
    assert blank_db.scalar(select(func.count(Department.id))) == 0
    assert blank_db.scalar(select(func.count(Incident.id))) == 0
    assert blank_db.scalar(select(func.count(SafetyChecklist.id))) == 1
    assert blank_db.scalar(select(func.count(TrainingCourse.id))) == 8
    assert blank_db.scalar(select(func.count(TrainingQuiz.id))) == 8
    assert "demo" not in " ".join(c.description or "" for c in blank_db.scalars(select(TrainingCourse))).lower()


def test_weak_admin_password_from_env_is_refused(blank_db, monkeypatch):
    from app import seed as seed_mod
    from app.models import User
    s = get_settings()
    monkeypatch.setattr(s, "seed_demo_data", False)
    monkeypatch.setattr(s, "admin_email", "admin@example.com")
    monkeypatch.setattr(s, "admin_password", "short")
    seed_mod.seed(blank_db)
    assert blank_db.scalar(select(func.count(User.id))) == 0

