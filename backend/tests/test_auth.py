from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import password_hasher
from app.db.models.user import User
from app.features.auth.dependencies import auth_db
from app.main import app
from app.features.auth.router import login_db


@pytest.fixture
def client(monkeypatch):
    # Dedicated in-memory database; never read/write the configured TiDB engine.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    User.__table__.create(engine)
    monkeypatch.setattr(settings, "secret_key", "test-only-secret-not-for-production-0123456789")
    monkeypatch.setattr(settings, "admin_username", "")
    monkeypatch.setattr(settings, "admin_password_hash", "")

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[auth_db] = override
    app.dependency_overrides[login_db] = override
    try:
        with TestClient(app) as test_client:
            yield test_client, engine
    finally:
        app.dependency_overrides.pop(auth_db, None)
        app.dependency_overrides.pop(login_db, None)
        engine.dispose()


def signup(client, email="member@example.com"):
    # Fixture setup proof only. The complete emailed-code flow is tested separately.
    now = datetime.now(timezone.utc)
    proof = jwt.encode({'sub': email.strip().lower(), 'iat': now, 'exp': now + timedelta(minutes=15),
                        'type': 'email-verification', 'iss': 'onfit-api', 'aud': 'onfit-signup'},
                       settings.secret_key, algorithm='HS256')
    return client.post("/api/auth/signup", json={"email": email, "password": "test-password-123", "name": "Member", "verification_token": proof})


def login(client, email="member@example.com", password="test-password-123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_signup_login_and_self(client):
    c, engine = client
    response = signup(c, " MEMBER@EXAMPLE.COM ")
    assert response.status_code == 201
    assert set(response.json()) == {"id", "email", "name", "created_at", "is_admin"}
    assert response.json()["email"] == "member@example.com"
    with Session(engine) as db:
        user = db.scalar(select(User))
        assert user.password_hash != "test-password-123"
        assert password_hasher.verify("test-password-123", user.password_hash)
    token = login(c).json()
    assert token["token_type"] == "bearer" and token["expires_in"] == 1800
    me = c.get("/api/auth/me", headers={"Authorization": "Bearer " + token["access_token"]})
    assert me.status_code == 200
    assert me.json() == response.json()


def test_duplicate_email(client):
    c, _ = client
    assert signup(c).status_code == 201
    assert signup(c, "MEMBER@example.com").status_code == 409
    assert login(c).status_code == 200


@pytest.mark.parametrize("change", [
    {"password": "abc123!"}, {"password": "x" * 129}, {"name": "   "},
    {"email": "invalid"}, {"user_id": 42},
])
def test_invalid_input_does_not_leak_password(client, change):
    c, _ = client
    data = {"email": "member@example.com", "password": "sensitive-password", "name": "Member", **change}
    response = c.post("/api/auth/signup", json=data)
    assert response.status_code == 422
    assert data["password"] not in response.text


def test_wrong_and_unknown_credentials_same_error(client):
    c, _ = client
    signup(c)
    wrong = login(c, password="incorrect")
    missing = login(c, email="unknown@example.com")
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()
    assert wrong.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("kind", ["missing", "malformed", "expired", "forged", "unknown_user", "wrong_audience", "wrong_type", "missing_exp", "oversized_id"])
def test_token_rejection(client, kind):
    c, _ = client
    signup(c)
    now = datetime.now(timezone.utc)
    claims = {"sub": "1", "iat": now, "exp": now + timedelta(minutes=5),
              "iss": "onfit-api", "aud": "onfit-client", "type": "access"}
    if kind == "expired": claims["exp"] = now - timedelta(seconds=1)
    if kind == "unknown_user": claims["sub"] = "999"
    if kind == "oversized_id": claims["sub"] = "9" * 100
    if kind == "wrong_audience": claims["aud"] = "other"
    if kind == "wrong_type": claims["type"] = "refresh"
    if kind == "missing_exp": del claims["exp"]
    token = jwt.encode(claims, "forged-secret-012345678901234567890" if kind == "forged" else settings.secret_key, algorithm="HS256")
    if kind == "malformed": token = "invalid.token"
    headers = {} if kind == "missing" else {"Authorization": "Bearer " + token}
    assert c.get("/api/auth/me", headers=headers).status_code == 401


def test_user_isolation(client):
    c, _ = client
    one = signup(c).json()
    signup(c, "second@example.com")
    token = login(c).json()["access_token"]
    result = c.get("/api/auth/me?user_id=2", headers={"Authorization": "Bearer " + token})
    assert result.json()["id"] == one["id"]


def test_missing_secret_does_not_break_public_routes(client, monkeypatch):
    c, _ = client
    monkeypatch.setattr(settings, "secret_key", "development-only-change-me")
    assert signup(c).status_code == 503
    assert c.get("/health").status_code == 200
    assert c.get("/api/wardrobe/").status_code == 200


def test_missing_database(client, monkeypatch):
    c, _ = client
    from app.db import session
    app.dependency_overrides.pop(auth_db)
    monkeypatch.setattr(session, "SessionLocal", None)
    assert signup(c).status_code == 503


def test_openapi_contract(client):
    c, _ = client
    assert c.get("/docs").status_code == 200
    schema = c.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["BearerAuth"]["scheme"] == "bearer"
    assert "password_hash" not in schema["components"]["schemas"]["UserPublic"]["properties"]
    assert "201" in schema["paths"]["/api/auth/signup"]["post"]["responses"]
    assert schema["paths"]["/api/auth/me"]["get"]["security"] == [{"BearerAuth": []}]
