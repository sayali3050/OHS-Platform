import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.main import app
from app.seed import seed
from app.utils.rate_limit import login_limiter

PW = "Demo@1234"


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield
    Base.metadata.drop_all(engine)
    engine.dispose()
    os.remove("test.db")


@pytest.fixture(autouse=True)
def reset_limits():
    login_limiter._hits.clear()


@pytest.fixture
def client():
    return TestClient(app)


def token_for(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_h(client):
    return token_for(client, "admin@demo.com")


@pytest.fixture
def worker_h(client):
    return token_for(client, "worker@demo.com")


@pytest.fixture
def supervisor_h(client):
    return token_for(client, "supervisor@demo.com")
