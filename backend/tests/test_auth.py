from app.utils.rate_limit import login_limiter
from tests.conftest import PW


def test_login_success_returns_role(client):
    r = client.post("/api/auth/login", json={"email": "worker@demo.com", "password": PW})
    body = r.json()
    assert r.status_code == 200
    assert body["user"]["role"] == "worker" and body["token_type"] == "bearer"
    assert "password_hash" not in body["user"]


def test_login_is_case_insensitive_on_email(client):
    assert client.post("/api/auth/login", json={"email": "Admin@Demo.com", "password": PW}).status_code == 200


def test_wrong_password_gives_generic_401(client):
    r = client.post("/api/auth/login", json={"email": "worker@demo.com", "password": "nope"})
    assert r.status_code == 401 and r.json()["detail"] == "Email or password is incorrect."


def test_remember_me_extends_lifetime(client):
    short = client.post("/api/auth/login", json={"email": "worker@demo.com", "password": PW}).json()
    long = client.post("/api/auth/login", json={"email": "worker@demo.com", "password": PW, "remember_me": True}).json()
    assert long["expires_in"] > short["expires_in"]


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_me_returns_profile(client, worker_h):
    r = client.get("/api/auth/me", headers=worker_h)
    assert r.status_code == 200 and r.json()["email"] == "worker@demo.com"


def test_register_worker_then_login(client):
    depts = client.get("/api/auth/departments").json()
    r = client.post("/api/auth/register", json={
        "full_name": "New Worker", "email": "new.worker@example.com", "password": "Safety123",
        "employee_id": "WRK-9001", "department_id": depts[0]["id"], "role": "worker", "preferred_language": "mr",
    })
    assert r.status_code == 201 and r.json()["requires_approval"] is False
    assert client.post("/api/auth/login", json={"email": "new.worker@example.com", "password": "Safety123"}).status_code == 200


def test_register_supervisor_needs_approval(client, admin_h):
    depts = client.get("/api/auth/departments").json()
    r = client.post("/api/auth/register", json={
        "full_name": "New Sup", "email": "new.sup@example.com", "password": "Safety123",
        "employee_id": "SUP-9001", "department_id": depts[0]["id"], "role": "supervisor",
    })
    assert r.status_code == 201 and r.json()["requires_approval"] is True
    login = client.post("/api/auth/login", json={"email": "new.sup@example.com", "password": "Safety123"})
    assert login.status_code == 403
    uid = r.json()["user"]["id"]
    assert client.patch(f"/api/users/{uid}", json={"is_active": True}, headers=admin_h).status_code == 200
    assert client.post("/api/auth/login", json={"email": "new.sup@example.com", "password": "Safety123"}).status_code == 200


def test_cannot_self_register_as_admin(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Sneaky", "email": "sneaky@example.com", "password": "Safety123",
        "employee_id": "X-1", "department_id": 1, "role": "admin",
    })
    assert r.status_code == 422 and "role" in r.json()["fields"]


def test_register_rejects_duplicates_and_weak_passwords(client):
    base = {"full_name": "Dup", "password": "Safety123", "department_id": 1, "role": "worker"}
    assert client.post("/api/auth/register", json={**base, "email": "worker@demo.com", "employee_id": "Z-1"}).status_code == 409
    assert client.post("/api/auth/register", json={**base, "email": "z@example.com", "employee_id": "WRK-0001"}).status_code == 409
    weak = client.post("/api/auth/register", json={**base, "email": "w@example.com", "employee_id": "Z-2", "password": "password"})
    assert weak.status_code == 422 and "password" in weak.json()["fields"]


def test_login_rate_limited(client):
    login_limiter._hits.clear()
    codes = [client.post("/api/auth/login", json={"email": "x@example.com", "password": "x"}).status_code
             for _ in range(12)]
    assert 429 in codes


def test_forgot_password_does_not_reveal_accounts(client):
    a = client.post("/api/auth/forgot-password", json={"email": "worker@demo.com"})
    b = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()


def test_reset_token_is_single_use(client):
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone
    from app.core.config import get_settings
    from app.database.session import SessionLocal
    from app.models import User
    from sqlalchemy import select

    s = get_settings()
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "worker10@demo.com"))
        now = datetime.now(timezone.utc)
        tok = pyjwt.encode({"sub": str(u.id), "type": "reset", "fp": u.password_hash[-12:], "iat": now,
                            "exp": now + timedelta(minutes=5)}, s.jwt_secret_key, algorithm=s.jwt_algorithm)
    assert client.post("/api/auth/reset-password", json={"token": tok, "new_password": "NewPass123"}).status_code == 204
    assert client.post("/api/auth/reset-password", json={"token": tok, "new_password": "Other123"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "worker10@demo.com", "password": "NewPass123"}).status_code == 200


def test_access_token_cannot_be_used_as_reset_token(client):
    tok = client.post("/api/auth/login", json={"email": "worker@demo.com", "password": PW}).json()["access_token"]
    assert client.post("/api/auth/reset-password", json={"token": tok, "new_password": "Hijack123"}).status_code == 400


def test_cors_origins_accepts_comma_separated_env(monkeypatch):
    from app.core.config import Settings
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080")
    assert Settings().cors_origins == ["http://localhost:5173", "http://localhost:8080"]
