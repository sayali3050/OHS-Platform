import os
import shutil
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret"
os.environ["UPLOAD_DIR"] = UPLOAD_DIR = tempfile.mkdtemp(prefix="ohs-test-uploads-")
os.environ["EMERGENCY_CONTACTS"] = "Site security:+91 20 5555 0100"
os.environ["OPENAI_API_KEY"] = ""  # tests always run in Demo AI Mode, whatever is in .env

import pytest
from fastapi.testclient import TestClient

from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.main import app
from app.seed import seed
from app.api.routes.ai import ai_limiter
from app.utils.rate_limit import emergency_limiter, login_limiter, report_limiter

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
    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)


@pytest.fixture(autouse=True)
def reset_limits():
    for limiter in (login_limiter, report_limiter, emergency_limiter, ai_limiter):
        limiter._hits.clear()


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
