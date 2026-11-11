"""Explicit, rollback-only API smoke check against configured TiDB.

Run from backend: python -m app.db.live_api_check --run
Uses the real app and real DB, with an outer transaction injected into auth_db.
Endpoint Session.commit() flushes without committing the outer transaction.
No existing member is read or changed. Auto-increment sequences may advance.
This does not test a running HTTP server, browsers, or durable committed writes.
"""
import argparse
import json
import secrets
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models.user import User
from app.db.models.user_profile import UserProfile
from app.db.models.inbody_record import InbodyRecord
from app.db.profile_extension import plan
from app.features.auth.dependencies import auth_db
from app.main import app


def check():
    if not settings.auth_configured or not settings.database_url:
        return {'status': 'configuration_required'}, 2
    if make_url(settings.database_url).get_backend_name() != 'mysql':
        return {'status': 'tidb_mysql_required'}, 2
    engine = create_engine(settings.database_url, connect_args={
        'connect_timeout': 5, 'read_timeout': 15, 'write_timeout': 15})
    checks = []
    email = f'onfit-check-{uuid.uuid4().hex}@example.com'
    password = secrets.token_urlsafe(24)
    user_id = None
    stage = 'preflight'
    previous = app.dependency_overrides.get(auth_db)
    try:
        with engine.connect() as connection:
            if plan(connection):
                return {'status': 'schema_additions_required'}, 2
            connection.rollback()  # close metadata autobegin before our outer transaction
            transaction = connection.begin()

            def test_db():
                with Session(bind=connection, join_transaction_mode='rollback_only') as session:
                    yield session

            app.dependency_overrides[auth_db] = test_db

            def expect(response, code, name):
                if response.status_code != code:
                    raise AssertionError(f'{name}: HTTP {response.status_code}, expected {code}')
                checks.append(name)
                return response.json()

            try:
                with TestClient(app, raise_server_exceptions=True) as client:
                    stage = 'signup'
                    user = expect(client.post('/api/auth/signup', json={
                        'email': email, 'password': password, 'name': 'ONFIT temporary API check'
                    }), 201, 'signup_201')
                    user_id = user['id']
                    stage = 'login'
                    token = expect(client.post('/api/auth/login', json={
                        'email': email, 'password': password
                    }), 200, 'login_200')['access_token']
                    headers = {'Authorization': f'Bearer {token}'}
                    me = expect(client.get('/api/auth/me', headers=headers), 200, 'self_200')
                    assert me['id'] == user_id and me['name'] == user['name']
                    expect(client.post('/api/auth/login', json={
                        'email': email, 'password': password + '-wrong'
                    }), 401, 'wrong_password_401')
                    stage = 'profile'
                    profile = expect(client.put('/api/profiles/me', headers=headers, json={
                        'height_cm': 175.75, 'weight_kg': 70.25,
                        'preferred_style': 'casual', 'preferred_fit': 'regular',
                        'personal_color': 'test-only', 'preferred_colors': ['#16181D']
                    }), 201, 'profile_write_201')
                    assert profile['height_cm'] == 175.75 and profile['id'] == user_id
                    assert expect(client.get('/api/profiles/me', headers=headers), 200,
                                  'profile_read_200') == profile
                    patched = expect(client.patch('/api/profiles/me', headers=headers,
                                                  json={'preferred_fit': 'slim'}), 200, 'profile_patch_200')
                    assert patched['preferred_fit'] == 'slim' and patched['height_cm'] == 175.75
                    stage = 'inbody'
                    payload = {'height_cm': 175.75, 'weight_kg': 70.25,
                               'skeletal_muscle_kg': 30.12, 'body_fat_pct': 20.5,
                               'measured_at': '2026-01-02T09:00:00+09:00'}
                    record = expect(client.post('/api/inbody/records', headers=headers, json=payload),
                                    201, 'inbody_write_201')
                    assert record['user_id'] == user_id
                    assert record['measured_at'] == '2026-01-02T00:00:00Z'
                    assert expect(client.get(f"/api/inbody/records/{record['id']}", headers=headers),
                                  200, 'inbody_read_200') == record
                    assert expect(client.get('/api/inbody/records', headers=headers),
                                  200, 'inbody_list_200') == [record]
                    expect(client.post('/api/inbody/records', headers=headers,
                                       json={**payload, 'weight_kg': 0}), 422, 'invalid_inbody_422')
                    expect(client.get('/api/inbody/records'), 401, 'unauthenticated_401')
                    stage = 'fitting'
                    defaults = expect(client.get('/api/fitting/defaults', headers=headers),
                                      200, 'fitting_defaults_200')
                    assert defaults['source'] == 'inbody' and defaults['height_cm'] == 175.75
                    preview = expect(client.post('/api/fitting/preview', headers=headers, json={
                        'height_cm': 175.75, 'weight_kg': 70.25,
                        'shoulder_width_cm': 43, 'waist_circumference_cm': 80,
                        'abdomen_protrusion_cm': 8, 'pelvis_width_cm': 26
                    }), 200, 'fitting_preview_200')
                    assert {'measurements', 'parameters', 'garment_parameters'} <= preview.keys()
                    # A separate connection must not see the uncommitted synthetic member.
                    stage = 'transaction_isolation'
                    with engine.connect() as observer:
                        assert observer.scalar(select(func.count()).select_from(User).where(User.email == email)) == 0
                    checks.append('test_data_not_committed')
            finally:
                if transaction.is_active:
                    transaction.rollback()
                if previous is None:
                    app.dependency_overrides.pop(auth_db, None)
                else:
                    app.dependency_overrides[auth_db] = previous
        stage = 'rollback_verification'
        with engine.connect() as observer:
            assert observer.scalar(select(func.count()).select_from(User).where(User.email == email)) == 0
            if user_id is not None:
                for model in (UserProfile, InbodyRecord):
                    assert observer.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) == 0
        checks.append('test_rows_absent_after_rollback')
        return {'status': 'passed', 'checks': checks,
                'scope': 'Real TiDB + in-process FastAPI; no durable commit, HTTP server or browser check.'}, 0
    except Exception as error:
        original = getattr(error, 'orig', error)
        args = getattr(original, 'args', ())
        code = args[0] if args and isinstance(args[0], int) else None
        return {'status': 'failed', 'stage': stage, 'checks': checks,
                'error_type': type(error).__name__, 'mysql_error_code': code}, 2
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Allow temporary, rolled-back writes to configured DB.')
    args = parser.parse_args()
    if not args.run:
        print(json.dumps({'status': 'not_run', 'message': 'Use --run for rollback-only live API checks.'}))
        return 0
    result, code = check()
    print(json.dumps(result, indent=2))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
