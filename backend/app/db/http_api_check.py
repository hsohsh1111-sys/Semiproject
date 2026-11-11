"""Real local HTTP + durable DB check. Synthetic test account remains in DB.

From backend: python -m app.db.http_api_check --run
Reuses local ignored .tmp/http-api-check-account.json on subsequent runs.
Never prints credentials or tokens. Does not verify browser rendering.
"""
import argparse
import json
from pathlib import Path
import secrets
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

STATE_PATH = Path(__file__).resolve().parents[3] / '.tmp/http-api-check-account.json'
BASE = 'http://127.0.0.1:5173/api'
PROFILE = {'height_cm': 175.75, 'weight_kg': 70.25, 'preferred_style': 'casual',
           'preferred_fit': 'regular', 'personal_color': 'synthetic-test',
           'preferred_colors': ['#16181D']}
RECORD = {'height_cm': 175.75, 'weight_kg': 70.25, 'skeletal_muscle_kg': 30.12,
          'body_fat_pct': 20.5, 'measured_at': '2026-01-02T00:00:00Z'}


def request(path, method='GET', payload=None, token=None, expected=200):
    headers = {'Content-Type': 'application/json', 'Connection': 'close'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(payload).encode() if payload is not None else None
    try:
        with urlopen(Request(BASE + path, data=data, headers=headers, method=method), timeout=20) as response:
            if response.status != expected:
                raise RuntimeError(f'Unexpected HTTP status {response.status}')
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f'HTTP {error.code}') from None


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding='utf-8')


def run():
    stage = 'server_preflight'
    checks = []
    try:
        assert request('/auth/status')['status'] == 'configured'
        if STATE_PATH.exists():
            state = json.loads(STATE_PATH.read_text(encoding='utf-8'))
            assert state.get('purpose') == 'ONFIT synthetic integration check'
        else:
            state = {'purpose': 'ONFIT synthetic integration check',
                     'email': f'onfit-persistent-{uuid.uuid4().hex}@example.com',
                     'password': secrets.token_urlsafe(24)}
            stage = 'signup'
            user = request('/auth/signup', 'POST', {
                'email': state['email'], 'password': state['password'],
                'name': 'ONFIT synthetic integration check'}, expected=201)
            state['user_id'] = user['id']
            save_state(state)
            checks.append('http_signup_committed')
        credentials = {key: state[key] for key in ('email', 'password')}
        stage = 'login'
        token = request('/auth/login', 'POST', credentials)['access_token']
        assert request('/auth/me', token=token)['id'] == state['user_id']
        checks.append('http_login_and_self')
        if not state.get('record_id'):
            stage = 'profile_write'
            # PUT returns 201 on first creation and 200 when resuming after partial failure.
            try:
                request('/profiles/me', token=token)
                code = 200
            except RuntimeError as error:
                if str(error) != 'HTTP 404':
                    raise
                code = 201
            profile = request('/profiles/me', 'PUT', PROFILE, token, expected=code)
            assert all(profile[k] == v for k, v in PROFILE.items())
            stage = 'inbody_write'
            record = request('/inbody/records', 'POST', RECORD, token, expected=201)
            state['record_id'] = record['id']
            save_state(state)
            checks += ['http_profile_committed', 'http_inbody_committed']
        # New login, new HTTP connections; no in-process dependency overrides.
        stage = 'relogin_and_read'
        del token
        token = request('/auth/login', 'POST', credentials)['access_token']
        profile = request('/profiles/me', token=token)
        assert all(profile[k] == v for k, v in PROFILE.items())
        checks.append('profile_survives_relogin')
        record = request(f"/inbody/records/{state['record_id']}", token=token)
        assert record['user_id'] == state['user_id']
        assert all(record[k] == v for k, v in RECORD.items())
        checks.append('inbody_survives_relogin')
        defaults = request('/fitting/defaults', token=token)
        assert defaults == {'height_cm': 175.75, 'weight_kg': 70.25, 'source': 'inbody'}
        checks.append('fitting_reads_persisted_inbody')
        return {'status': 'passed', 'checks': checks,
                'test_data': 'One synthetic account with profile and inbody remains; local credentials are ignored by Git.',
                'scope': 'Running HTTP server via Vite proxy; relogin verified, browser and server restart not verified.'}, 0
    except Exception as error:
        return {'status': 'failed', 'stage': stage, 'checks': checks,
                'error_type': type(error).__name__,
                'note': 'No existing user data touched; synthetic data may remain after partial failure.'}, 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    result, code = run() if args.run else ({'status': 'not_run', 'message': 'Use --run to create/recheck persistent synthetic data.'}, 0)
    print(json.dumps(result, indent=2))
    raise SystemExit(code)
