"""Shared pytest fixtures.

The environment is configured *before* importing the application so that the
test database is isolated from the development one.
"""

from __future__ import annotations

import os
import pathlib

TEST_DB = pathlib.Path("/tmp/opencode/padel_test.db")

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-at-least-32-bytes-long"
os.environ["BCRYPT_ROUNDS"] = "4"  # keep hashing fast in tests

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db_file():
    TEST_DB.unlink(missing_ok=True)
    yield
    TEST_DB.unlink(missing_ok=True)


@pytest.fixture()
def client():
    """A fresh database + test client for every test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def register(client: TestClient, email: str, password: str = "Passw0rd!", **extra) -> dict | None:
    """Register a user; returns the body, or ``None`` when it already exists."""
    payload = {"email": email, "password": password, "full_name": extra.pop("full_name", email.split("@")[0]), **extra}
    response = client.post(f"{API}/auth/register", json=payload)
    if response.status_code == 409:
        return None
    assert response.status_code == 201, response.text
    return response.json()


def login(client: TestClient, email: str, password: str = "Passw0rd!") -> str:
    response = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def login_tokens(client: TestClient, email: str, password: str = "Passw0rd!") -> dict:
    """Return the full token response (access + refresh + user)."""
    response = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


ADMIN_EMAIL = "admin@pytest.com"


@pytest.fixture()
def admin_token(client: TestClient) -> str:
    register(client, ADMIN_EMAIL)
    return login(client, ADMIN_EMAIL)


@pytest.fixture()
def player_token(client: TestClient) -> str:
    # Make sure an admin exists first, so the player does not become the first user.
    register(client, ADMIN_EMAIL)
    register(client, "player1@pytest.com")
    return login(client, "player1@pytest.com")


@pytest.fixture()
def player2_token(client: TestClient) -> str:
    register(client, ADMIN_EMAIL)
    register(client, "player2@pytest.com")
    return login(client, "player2@pytest.com")


@pytest.fixture()
def court(client: TestClient, admin_token: str) -> dict:
    response = client.post(
        f"{API}/courts",
        headers=auth(admin_token),
        json={
            "name": "Test Court",
            "court_number": 1,
            "surface": "panoramic",
            "environment": "indoor",
            "price_per_hour": "20.00",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
