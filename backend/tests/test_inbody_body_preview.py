import pytest
from app.features.inbody.body_preview import BodyPreviewInput, suggest_body
from tests.test_auth import client
from tests.test_inbody import inbody_client

BASE = {'height_cm': 175.0, 'weight_kg': 70.0,
        'skeletal_muscle_kg': 30.0, 'body_fat_pct': 20.0}


@pytest.mark.parametrize('changes,preset', [
    ({}, 'average'),
    ({'weight_kg': 60, 'skeletal_muscle_kg': 25}, 'slim'),
    ({'weight_kg': 78, 'skeletal_muscle_kg': 38, 'body_fat_pct': 15}, 'muscular'),
    ({'skeletal_muscle_kg': 38, 'body_fat_pct': 35}, 'average'),
])
def test_transparent_visual_selection_and_input_preservation(changes, preset):
    payload = BodyPreviewInput(**{**BASE, **changes})
    result = suggest_body(payload)
    assert result.preset == preset
    assert result.measurements == payload
    assert result.approximate and result.requires_confirmation
    assert result.rule_version == 'continuous-visual-v2'
    assert result.personalized_measurements.height_cm == payload.height_cm
    assert result.personalized_measurements.weight_kg == payload.weight_kg
    assert result.composition.kind == 'inbody'
    assert result.reasons and result.limitations


def test_same_old_preset_does_not_quantize_personal_body():
    a = suggest_body(BodyPreviewInput(**BASE))
    b = suggest_body(BodyPreviewInput(**{**BASE, 'skeletal_muscle_kg': 31}))
    assert a.preset == b.preset == 'average'  # compatibility field only
    assert a.personalized_measurements != b.personalized_measurements
    assert a.composition != b.composition


def test_fat_changes_are_gradual_not_a_preset_switch():
    results = [suggest_body(BodyPreviewInput(**{**BASE, 'body_fat_pct': fat}))
               for fat in [10, 15, 20, 25, 30]]
    waists = [r.personalized_measurements.waist_circumference_cm for r in results]
    assert all(a < b for a, b in zip(waists, waists[1:]))
    assert results[-1].personalized_measurements.abdomen_protrusion_cm > results[2].personalized_measurements.abdomen_protrusion_cm


@pytest.mark.parametrize('height,weight,muscle,fat', [
    (100, 20, 0.01, 0), (100, 300, 300, 100),
    (230, 20, 10, 100), (230, 300, 200, 0),
])
def test_extremes_keep_visual_parameters_and_blends_bounded(height, weight, muscle, fat):
    result = suggest_body(BodyPreviewInput(height_cm=height, weight_kg=weight,
                                         skeletal_muscle_kg=muscle, body_fat_pct=fat))
    assert 0 <= result.composition.build_lean + result.composition.build_muscular <= 1
    assert 0 <= result.composition.abdominal_definition <= 0.25
    assert 0 <= result.personalized_measurements.abdomen_protrusion_cm <= 20


def test_authenticated_api_proposes_without_creating_inbody_record(inbody_client):
    c, headers = inbody_client
    response = c.post('/api/inbody/body-preview', headers=headers, json=BASE)
    assert response.status_code == 200
    assert response.json()['measurements'] == BASE
    assert c.get('/api/inbody/records', headers=headers).json() == []
    assert c.post('/api/inbody/body-preview', json=BASE).status_code == 401


@pytest.mark.parametrize('changes', [
    {'height_cm': None}, {'weight_kg': '70'}, {'body_fat_pct': 101},
    {'skeletal_muscle_kg': 80}, {'weight_kg': True}, {'body_fat_pct': 20.123},
])
def test_invalid_or_incomplete_values_are_not_classified(inbody_client, changes):
    c, headers = inbody_client
    assert c.post('/api/inbody/body-preview', headers=headers, json={**BASE, **changes}).status_code == 422
