import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.models.user_profile import UserProfile
from tests.test_auth import client, signup, login


@pytest.fixture
def profile_client(client):
    c, engine = client
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        UserProfile.__table__.create(connection)
    signup(c)
    token = login(c).json()["access_token"]
    return c, engine, {"Authorization": "Bearer " + token}


def test_create_read_patch_replace(profile_client):
    c, engine, headers = profile_client
    assert c.get("/api/profiles/me", headers=headers).status_code == 404
    payload = {"height_cm": 175.25, "weight_kg": 70, "preferred_style": " 미니멀 ",
               "preferred_fit": "여유롭게", "preferred_colors": ["#abcdef"]}
    created = c.put("/api/profiles/me", json=payload, headers=headers)
    assert created.status_code == 201
    assert created.json()["preferred_style"] == "미니멀"
    assert created.json()["weight_kg"] == 70
    assert c.get("/api/profiles/me", headers=headers).json() == created.json()
    patched = c.patch("/api/profiles/me", json={"weight_kg": None, "preferred_colors": []}, headers=headers)
    assert patched.status_code == 200
    assert patched.json()["weight_kg"] is None
    assert patched.json()["height_cm"] == 175.25
    assert patched.json()["preferred_colors"] == []
    assert c.patch("/api/profiles/me", json={}, headers=headers).json() == patched.json()
    replaced = c.put("/api/profiles/me", json={"preferred_style": "캐주얼"}, headers=headers)
    assert replaced.status_code == 200
    assert replaced.json()["height_cm"] is None
    assert replaced.json()["preferred_colors"] is None
    assert replaced.json()["id"] == created.json()["id"]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(UserProfile)) == 1


def test_missing_profile_patch(profile_client):
    c, _, headers = profile_client
    assert c.patch("/api/profiles/me", json={}, headers=headers).status_code == 404


@pytest.mark.parametrize("payload", [
    {"user_id": 2}, {"id": 1}, {"height_cm": 99}, {"height_cm": 231},
    {"height_cm": True}, {"height_cm": "175"}, {"weight_kg": 0},
    {"weight_kg": 300.01}, {"weight_kg": 70.123}, {"body_shape": " "},
    {"personal_color": "a" * 81}, {"preferred_colors": ["red"]},
    {"preferred_colors": ["#ffffff"] * 13}, {"style": "legacy"},
])
def test_invalid_profile_not_saved(profile_client, payload):
    c, _, headers = profile_client
    result = c.put("/api/profiles/me", json=payload, headers=headers)
    assert result.status_code == 422
    assert all("input" not in error for error in result.json()["detail"])
    assert c.get("/api/profiles/me", headers=headers).status_code == 404


@pytest.mark.parametrize("method", ["get", "put", "patch"])
def test_profile_requires_auth(profile_client, method):
    c, _, _ = profile_client
    kwargs = {} if method == "get" else {"json": {}}
    assert getattr(c, method)("/api/profiles/me", **kwargs).status_code == 401


def test_profiles_are_isolated(profile_client):
    c, _, first_headers = profile_client
    first = c.put("/api/profiles/me", json={"preferred_style": "first"}, headers=first_headers).json()
    signup(c, "second@example.com")
    second_headers = {"Authorization": "Bearer " + login(c, "second@example.com").json()["access_token"]}
    assert c.get("/api/profiles/me", headers=second_headers).status_code == 404
    second = c.put("/api/profiles/me", json={"preferred_style": "second"}, headers=second_headers).json()
    assert first["user_id"] != second["user_id"]
    c.patch("/api/profiles/me?user_id=" + str(first["user_id"]), json={"preferred_style": "changed"}, headers=second_headers)
    assert c.get("/api/profiles/me", headers=first_headers).json() == first


def test_legacy_route_and_swagger(profile_client):
    c, _, _ = profile_client
    legacy = c.post("/api/profiles/", json={"style": "미니멀"})
    assert legacy.status_code == 200 and legacy.json()["status"] == "prototype"
    paths = c.get("/openapi.json").json()["paths"]
    assert paths["/api/profiles/"]["post"]["deprecated"] is True
    for method in ("get", "put", "patch"):
        assert paths["/api/profiles/me"][method]["security"] == [{"BearerAuth": []}]
    assert "201" in paths["/api/profiles/me"]["put"]["responses"]


def test_team_profile_columns_and_api_aliases(profile_client):
    from sqlalchemy import text
    c, engine, headers = profile_client
    result = c.put('/api/profiles/me', json={
        'preferred_style': 'casual', 'preferred_fit': 'regular'
    }, headers=headers)
    assert result.status_code == 201
    assert result.json()['id'] == result.json()['user_id']
    assert list(UserProfile.__table__.primary_key.columns.keys()) == ['user_id']
    assert 'id' not in UserProfile.__table__.columns
    with engine.connect() as connection:
        row = connection.execute(text(
            'SELECT style_preference, fit_preference FROM user_profiles'
        )).one()
        assert tuple(row) == ('casual', 'regular')
        assert connection.execute(text('SELECT display_name FROM users')).scalar()


def test_legacy_integer_height_and_precise_extension(profile_client):
    from sqlalchemy import text
    c, engine, headers = profile_client
    created = c.put('/api/profiles/me', json={'height_cm': 175.75}, headers=headers)
    assert created.status_code == 201
    assert created.json()['height_cm'] == 175.75
    with engine.begin() as connection:
        assert connection.execute(text('SELECT height_cm FROM user_profiles')).scalar() == 176
        connection.execute(text('UPDATE user_profiles SET height_cm = 180'))
    assert c.get('/api/profiles/me', headers=headers).json()['height_cm'] == 180
    cleared = c.patch('/api/profiles/me', json={'height_cm': None}, headers=headers)
    assert cleared.json()['height_cm'] is None
    with engine.connect() as connection:
        assert tuple(connection.execute(text('SELECT height_cm, height_cm_precise FROM user_profiles')).one()) == (None, None)


def test_existing_height_without_precision_column_value(profile_client):
    from sqlalchemy import text
    c, engine, headers = profile_client
    c.put('/api/profiles/me', json={'height_cm': 170}, headers=headers)
    with engine.begin() as connection:
        connection.execute(text('UPDATE user_profiles SET height_cm_precise = NULL'))
    assert c.get('/api/profiles/me', headers=headers).json()['height_cm'] == 170
