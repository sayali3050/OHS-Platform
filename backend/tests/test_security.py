"""Phase 9: every API route is protected unless it is meant to be public, and production refuses weak secrets."""
import re

import pytest
from fastapi.routing import APIRoute

from app.main import app

PUBLIC = {
    ("GET", "/api/health"), ("GET", "/api/system/info"), ("POST", "/api/auth/login"), ("POST", "/api/auth/register"),
    ("GET", "/api/auth/departments"), ("POST", "/api/auth/forgot-password"), ("POST", "/api/auth/reset-password"),
}


def _routes():
    for r in app.routes:
        if isinstance(r, APIRoute) and r.path.startswith("/api/"):
            for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
                yield m, r.path


def test_route_inventory_is_large():
    assert len(list(_routes())) > 100  # guards against the router silently losing modules


@pytest.mark.parametrize("method,path", [r for r in _routes() if r not in PUBLIC])
def test_route_requires_sign_in(client, method, path):
    url = re.sub(r"\{[^}]+\}", "1", path).replace("{kind}", "incidents")
    url = url.replace("/1.csv", "/incidents.csv")
    r = client.request(method, url, json={})
    assert r.status_code == 401, f"{method} {path} answered {r.status_code} without a token"


def test_public_routes_stay_public(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/system/info").status_code == 200


def test_production_refuses_a_weak_secret(monkeypatch):
    from app.core.config import Settings
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-in-.env")
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings()
    monkeypatch.setenv("JWT_SECRET_KEY", "x" * 48)
    with pytest.raises(ValueError, match="SEED_DEMO_DATA"):
        Settings()  # demo accounts share a public password
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    assert Settings().environment == "production"
