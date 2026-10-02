def test_worker_cannot_list_users(client, worker_h):
    assert client.get("/api/users", headers=worker_h).status_code == 403


def test_supervisor_cannot_list_users(client, supervisor_h):
    assert client.get("/api/users", headers=supervisor_h).status_code == 403


def test_admin_lists_users_paginated(client, admin_h):
    r = client.get("/api/users?page_size=10", headers=admin_h).json()
    assert len(r["items"]) == 10 and r["total"] >= 41


def test_admin_filters_by_role(client, admin_h):
    r = client.get("/api/users?role=supervisor&page_size=100", headers=admin_h).json()
    assert r["items"] and all(u["role"] == "supervisor" for u in r["items"])


def test_worker_cannot_escalate_via_self_update(client, worker_h):
    r = client.patch("/api/auth/me", json={"role": "admin", "full_name": "Demo Worker"}, headers=worker_h)
    assert r.status_code == 200 and r.json()["role"] == "worker"  # unknown field ignored, role unchanged


def test_admin_cannot_demote_self(client, admin_h):
    me = client.get("/api/auth/me", headers=admin_h).json()
    assert client.patch(f"/api/users/{me['id']}", json={"role": "worker"}, headers=admin_h).status_code == 400


def test_deactivated_user_token_stops_working(client, admin_h):
    from tests.conftest import token_for
    h = token_for(client, "worker05@demo.com")
    uid = client.get("/api/auth/me", headers=h).json()["id"]
    client.patch(f"/api/users/{uid}", json={"is_active": False}, headers=admin_h)
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_audit_log_records_login(client):
    from sqlalchemy import select
    from app.database.session import SessionLocal
    from app.models import AuditLog
    client.post("/api/auth/login", json={"email": "supervisor@demo.com", "password": "Demo@1234"})
    with SessionLocal() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "login")) is not None
