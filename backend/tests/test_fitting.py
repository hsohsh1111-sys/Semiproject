import pytest
from app.db.models.inbody_record import InbodyRecord
from app.db.models.user_profile import UserProfile
from tests.test_auth import client, signup, login

PAYLOAD = {"height_cm": 175, "weight_kg": 70, "shoulder_width_cm": 42, "waist_circumference_cm": 80}


@pytest.fixture
def fitting_client(client):
    c, engine = client
    UserProfile.__table__.create(engine)
    InbodyRecord.__table__.create(engine)
    signup(c)
    return c, {"Authorization": "Bearer " + login(c).json()["access_token"]}


def test_independent_dimensions_and_no_writes(fitting_client):
    c, headers = fitting_client
    def preview(**change):
        response = c.post("/api/fitting/preview", headers=headers, json={**PAYLOAD, **change})
        assert response.status_code == 200
        assert response.json()["approximate"] is True
        return response.json()["parameters"]
    base = preview()
    assert base["height_m"] == 1.75
    assert base["shoulder_width_m"] == .42
    assert preview(shoulder_width_cm=50)["waist_radius_m"] == base["waist_radius_m"]
    assert preview(waist_circumference_cm=100)["shoulder_width_m"] == base["shoulder_width_m"]
    assert preview(weight_kg=90) == base
    assert c.get("/api/inbody/records", headers=headers).json() == []
    assert c.get("/api/profiles/me", headers=headers).status_code == 404


def test_defaults_priority_and_ownership(fitting_client):
    c, headers = fitting_client
    assert c.get("/api/fitting/defaults", headers=headers).json()["source"] == "none"
    c.put("/api/profiles/me", headers=headers, json={"height_cm": 170, "weight_kg": 65})
    assert c.get("/api/fitting/defaults", headers=headers).json() == {"height_cm": 170, "weight_kg": 65, "source": "profile"}
    record = {"height_cm": 172, "weight_kg": 68, "skeletal_muscle_kg": 30, "body_fat_pct": 20, "measured_at": "2026-01-02T00:00:00Z"}
    assert c.post("/api/inbody/records", headers=headers, json=record).status_code == 201
    c.post("/api/inbody/records", headers=headers, json={**record, "weight_kg": 66, "measured_at": "2025-01-01T00:00:00Z"})
    assert c.get("/api/fitting/defaults", headers=headers).json() == {"height_cm": 172, "weight_kg": 68, "source": "inbody"}
    signup(c, "other@example.com")
    other = {"Authorization": "Bearer " + login(c, "other@example.com").json()["access_token"]}
    assert c.get("/api/fitting/defaults?user_id=1", headers=other).json()["source"] == "none"


@pytest.mark.parametrize("change", [{"height_cm": 99}, {"weight_kg": "70"}, {"shoulder_width_cm": True}, {"shoulder_width_cm": 66}, {"waist_circumference_cm": 181}, {"user_id": 2}])
def test_invalid(fitting_client, change):
    c, headers = fitting_client
    result = c.post("/api/fitting/preview", headers=headers, json={**PAYLOAD, **change})
    assert result.status_code == 422
    assert all("input" not in item for item in result.json()["detail"])


def test_auth_and_openapi(fitting_client):
    c, _ = fitting_client
    assert c.get("/api/fitting/defaults").status_code == 401
    assert c.post("/api/fitting/preview", json=PAYLOAD).status_code == 401
    paths = c.get("/openapi.json").json()["paths"]
    for path, method in (("/api/fitting/defaults", "get"), ("/api/fitting/preview", "post")):
        assert paths[path][method]["security"] == [{"BearerAuth": []}]


def test_new_measurements_and_legacy_defaults(fitting_client):
    from math import pi
    c, headers = fitting_client
    legacy = c.post("/api/fitting/preview", headers=headers, json=PAYLOAD)
    assert legacy.status_code == 200
    assert set(legacy.json()) == {"measurements", "parameters", "garment_parameters", "approximate", "notice"}
    assert legacy.json()["measurements"]["chest_circumference_cm"] == 95
    assert set(legacy.json()["parameters"]) == {
        "height_m", "shoulder_width_m", "waist_radius_m", "chest_radius_m",
        "abdomen_protrusion_m", "pelvis_width_m", "hip_radius_m", "thigh_radius_m",
    }
    assert legacy.json()["parameters"] == pytest.approx({
        "height_m": 1.75,
        "shoulder_width_m": .42,
        "waist_radius_m": 80 / (200 * pi),
        "chest_radius_m": 95 / (200 * pi),
        "abdomen_protrusion_m": 0,
        "pelvis_width_m": .30,
        "hip_radius_m": 95 / (200 * pi),
        "thigh_radius_m": 50 / (200 * pi),
    })
    assert legacy.json()["garment_parameters"]["fit"] == "regular"
    assert legacy.json()["garment_parameters"]["fixed_size"] is False
    changes = {"chest_circumference_cm": (110, "chest_radius_m", 110 / (200 * pi)),
               "abdomen_protrusion_cm": (10, "abdomen_protrusion_m", .1),
               "pelvis_width_cm": (40, "pelvis_width_m", .4),
               "hip_circumference_cm": (100, "hip_radius_m", 100 / (200 * pi)),
               "thigh_circumference_cm": (60, "thigh_radius_m", 60 / (200 * pi))}
    original = legacy.json()["parameters"]
    for field, (value, key, expected) in changes.items():
        result = c.post("/api/fitting/preview", headers=headers, json={**PAYLOAD, field: value})
        assert result.status_code == 200
        parameters = result.json()["parameters"]
        assert parameters[key] == pytest.approx(expected)
        assert {k: v for k, v in parameters.items() if k != key} == {k: v for k, v in original.items() if k != key}


def test_abdomen_and_pelvis_are_independent_even_at_extremes(fitting_client):
    c, headers = fitting_client

    def parameters(**change):
        response = c.post("/api/fitting/preview", headers=headers, json={**PAYLOAD, **change})
        assert response.status_code == 200
        return response.json()["parameters"]

    base = parameters()
    high_abdomen = parameters(abdomen_protrusion_cm=20)
    assert high_abdomen["abdomen_protrusion_m"] == pytest.approx(.20)
    assert high_abdomen["pelvis_width_m"] == base["pelvis_width_m"]
    assert {k: v for k, v in high_abdomen.items() if k != "abdomen_protrusion_m"} == {
        k: v for k, v in base.items() if k != "abdomen_protrusion_m"
    }

    narrow_pelvis = parameters(pelvis_width_cm=20)
    assert narrow_pelvis["pelvis_width_m"] == pytest.approx(.20)
    assert {k: v for k, v in narrow_pelvis.items() if k != "pelvis_width_m"} == {
        k: v for k, v in base.items() if k != "pelvis_width_m"
    }

    high_abdomen_narrow_pelvis = parameters(abdomen_protrusion_cm=20, pelvis_width_cm=20)
    assert high_abdomen_narrow_pelvis["abdomen_protrusion_m"] == pytest.approx(.20)
    assert high_abdomen_narrow_pelvis["pelvis_width_m"] == pytest.approx(.20)
    assert {k: v for k, v in high_abdomen_narrow_pelvis.items()
            if k not in {"abdomen_protrusion_m", "pelvis_width_m"}} == {
        k: v for k, v in base.items()
        if k not in {"abdomen_protrusion_m", "pelvis_width_m"}
    }


@pytest.mark.parametrize("field,value", [("chest_circumference_cm", 181), ("abdomen_protrusion_cm", -1),
    ("abdomen_protrusion_cm", 21), ("pelvis_width_cm", 19), ("hip_circumference_cm", None),
    ("thigh_circumference_cm", True), ("thigh_circumference_cm", "50")])
def test_invalid_new_measurements(fitting_client, field, value):
    c, headers = fitting_client
    assert c.post("/api/fitting/preview", headers=headers, json={**PAYLOAD, field: value}).status_code == 422


def _body_parameters(**change):
    from app.features.fitting.body_engine import calculate_body_parameters
    from app.features.fitting.schemas import Measurements

    measurements = Measurements(**{
        "height_cm": 175.0,
        "weight_kg": 70.0,
        "shoulder_width_cm": 42.0,
        "waist_circumference_cm": 80.0,
        "chest_circumference_cm": 95.0,
        "abdomen_protrusion_cm": 0.0,
        "pelvis_width_cm": 40.0,
        "hip_circumference_cm": 80.0,
        "thigh_circumference_cm": 40.0,
        **change,
    })
    return calculate_body_parameters(measurements)


def test_garment_fits_have_distinct_allowance_values():
    from app.features.fitting.garment_engine import calculate_garment_silhouette

    body = _body_parameters()
    slim = calculate_garment_silhouette(body, "slim")
    regular = calculate_garment_silhouette(body, "regular")
    oversized = calculate_garment_silhouette(body, "oversized")

    assert slim.chest_radius_m < regular.chest_radius_m < oversized.chest_radius_m
    assert slim.waist_radius_m < regular.waist_radius_m < oversized.waist_radius_m
    assert slim.fixed_size is False
    assert regular.chest_ease_cm == pytest.approx(.025 * 200 * 3.141592653589793)


def test_abdomen_front_and_narrow_pelvis_hem_change_independently():
    from app.features.fitting.garment_engine import calculate_garment_silhouette

    base_body = _body_parameters()
    protruding_body = _body_parameters(abdomen_protrusion_cm=20.0)
    narrow_pelvis_body = _body_parameters(pelvis_width_cm=20.0)

    base = calculate_garment_silhouette(base_body, "regular")
    protruding = calculate_garment_silhouette(protruding_body, "regular")
    narrow_pelvis = calculate_garment_silhouette(narrow_pelvis_body, "regular")

    assert protruding.abdomen_front_depth_m - base.abdomen_front_depth_m == pytest.approx(.20)
    assert protruding.hem_half_width_m == base.hem_half_width_m
    assert narrow_pelvis.hem_half_width_m < base.hem_half_width_m
    assert narrow_pelvis.abdomen_front_depth_m == base.abdomen_front_depth_m


def test_fixed_garment_dimensions_stay_fixed_and_report_clearance_changes():
    from app.features.fitting.garment_engine import calculate_garment_silhouette

    garment_basis = _body_parameters(abdomen_protrusion_cm=2.0, pelvis_width_cm=40.0)
    original_body = _body_parameters(abdomen_protrusion_cm=2.0, pelvis_width_cm=40.0)
    changed_body = _body_parameters(abdomen_protrusion_cm=18.0, pelvis_width_cm=20.0)

    original = calculate_garment_silhouette(original_body, "regular", garment_basis)
    changed = calculate_garment_silhouette(changed_body, "regular", garment_basis)
    autofit = calculate_garment_silhouette(changed_body, "regular")

    assert changed.fixed_size is True
    assert changed.shoulder_half_width_m == original.shoulder_half_width_m
    assert changed.chest_radius_m == original.chest_radius_m
    assert changed.waist_radius_m == original.waist_radius_m
    assert changed.abdomen_front_depth_m == original.abdomen_front_depth_m
    assert changed.hem_half_width_m == original.hem_half_width_m
    assert changed.abdomen_front_clearance_m < original.abdomen_front_clearance_m
    assert changed.hem_clearance_m > original.hem_clearance_m
    assert autofit.abdomen_front_depth_m > changed.abdomen_front_depth_m


def test_garment_calculation_rejects_unknown_fit():
    from app.features.fitting.garment_engine import calculate_garment_silhouette

    with pytest.raises(ValueError, match="지원하지 않는 핏"):
        calculate_garment_silhouette(_body_parameters(), "custom")


def test_preview_api_returns_garment_parameters_for_fit_and_body_changes(fitting_client):
    c, headers = fitting_client
    response = c.post("/api/fitting/preview", headers=headers, json={
        **PAYLOAD,
        "abdomen_protrusion_cm": 12,
        "pelvis_width_cm": 24,
        "hip_circumference_cm": 55,
        "thigh_circumference_cm": 25,
        "garment_fit": "oversized",
    })

    assert response.status_code == 200
    body = response.json()
    assert body["parameters"]["abdomen_protrusion_m"] == pytest.approx(.12)
    assert body["parameters"]["pelvis_width_m"] == pytest.approx(.24)
    garment = body["garment_parameters"]
    assert garment["fit"] == "oversized"
    assert garment["fixed_size"] is False
    assert garment["abdomen_front_depth_m"] == pytest.approx(
        body["parameters"]["waist_radius_m"] + .12 + .055
    )
    assert garment["pelvis_half_width_m"] == pytest.approx(.12 + .055)
    assert garment["hem_half_width_m"] == pytest.approx(.24 / 2 + .055)


def test_preview_api_fixed_garment_keeps_basis_and_updates_clearance(fitting_client):
    c, headers = fitting_client
    initial = c.post("/api/fitting/preview", headers=headers, json={
        **PAYLOAD,
        "abdomen_protrusion_cm": 2,
        "pelvis_width_cm": 40,
        "garment_fit": "regular",
    }).json()
    fixed_basis = initial["parameters"]

    updated = c.post("/api/fitting/preview", headers=headers, json={
        **PAYLOAD,
        "abdomen_protrusion_cm": 18,
        "pelvis_width_cm": 20,
        "garment_fit": "regular",
        "fixed_garment_parameters": fixed_basis,
    })

    assert updated.status_code == 200
    result = updated.json()
    garment = result["garment_parameters"]
    initial_garment = initial["garment_parameters"]
    assert garment["fixed_size"] is True
    for field in (
        "shoulder_half_width_m", "chest_radius_m", "waist_radius_m",
        "abdomen_front_depth_m", "pelvis_half_width_m", "hip_radius_m",
        "thigh_radius_m", "hem_half_width_m",
    ):
        assert garment[field] == pytest.approx(initial_garment[field])
    assert garment["abdomen_front_clearance_m"] < initial_garment["abdomen_front_clearance_m"]
    assert garment["hem_clearance_m"] > initial_garment["hem_clearance_m"]
