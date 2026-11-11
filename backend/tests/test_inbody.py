import pytest

from app.db.models.inbody_record import InbodyRecord
from tests.test_auth import client, login, signup

PAYLOAD = {"height_cm": 175.25, "weight_kg": 70, "skeletal_muscle_kg": 30.12,
           "body_fat_pct": 20.5, "measured_at": "2026-01-02T09:00:00+09:00"}
URL = "/api/inbody/records"


@pytest.fixture
def inbody_client(client):
    c, engine = client
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        InbodyRecord.__table__.create(connection)
    signup(c)
    return c, {"Authorization": "Bearer " + login(c).json()["access_token"]}


def test_save_read_order_and_pagination(inbody_client):
    c, headers = inbody_client
    assert c.get(URL, headers=headers).json() == []
    first = c.post(URL, json=PAYLOAD, headers=headers)
    assert first.status_code == 201
    record = first.json()
    assert record["measured_at"] == "2026-01-02T00:00:00Z"
    assert record["skeletal_muscle_kg"] == 30.12
    assert record["created_at"].endswith("Z")
    assert c.get(f"{URL}/{record['id']}", headers=headers).json() == record
    older = c.post(URL, json={**PAYLOAD, "measured_at": "2025-01-01T00:00:00Z"}, headers=headers).json()
    same_date = c.post(URL, json=PAYLOAD, headers=headers).json()
    records = c.get(URL, headers=headers).json()
    assert [r["id"] for r in records] == [same_date["id"], record["id"], older["id"]]
    assert c.get(URL + "?limit=1&offset=1", headers=headers).json() == [record]


def test_ownership(inbody_client):
    c, first_headers = inbody_client
    record = c.post(URL, json=PAYLOAD, headers=first_headers).json()
    signup(c, "other@example.com")
    headers = {"Authorization": "Bearer " + login(c, "other@example.com").json()["access_token"]}
    assert c.get(URL + "?user_id=" + str(record["user_id"]), headers=headers).json() == []
    hidden = c.get(f"{URL}/{record['id']}", headers=headers)
    missing = c.get(URL + "/99999", headers=headers)
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


@pytest.mark.parametrize("change", [
    {"user_id": 2}, {"height_cm": True}, {"weight_kg": "70"}, {"weight_kg": 0},
    {"skeletal_muscle_kg": 71}, {"skeletal_muscle_kg": 0}, {"body_fat_pct": 101},
    {"body_fat_pct": -1}, {"weight_kg": 70.123}, {"height_cm": None},
    {"measured_at": "2026-01-01T10:00:00"}, {"measured_at": "9999-01-01T00:00:00Z"},
    {"measured_at": 1234567890}, {"measured_at": "0900-01-01T00:00:00Z"},
])
def test_invalid_not_persisted(inbody_client, change):
    c, headers = inbody_client
    result = c.post(URL, json={**PAYLOAD, **change}, headers=headers)
    assert result.status_code == 422
    assert all("input" not in e and "ctx" not in e for e in result.json()["detail"])
    assert c.get(URL, headers=headers).json() == []


def test_auth_query_validation_and_swagger(inbody_client):
    c, headers = inbody_client
    assert c.post(URL, json=PAYLOAD).status_code == 401
    assert c.get(URL).status_code == 401
    assert c.get(URL + "/1").status_code == 401
    for suffix in ("?limit=0", "?limit=101", "?offset=-1", "/0", "/9223372036854775808"):
        assert c.get(URL + suffix, headers=headers).status_code == 422
    paths = c.get("/openapi.json").json()["paths"]
    for path, method in ((URL, "post"), (URL, "get"), (URL + "/{record_id}", "get")):
        assert paths[path][method]["security"] == [{"BearerAuth": []}]
    assert "201" in paths[URL]["post"]["responses"]
