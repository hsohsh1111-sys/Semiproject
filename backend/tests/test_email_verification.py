import pytest
from app.core.config import settings
from app.features.auth import email_verification as verification
from tests.test_auth import client, signup, login


@pytest.fixture(autouse=True)
def reset_challenges(monkeypatch):
    # Test configuration only; no real provider is called by these tests.
    monkeypatch.setattr(settings, 'email_provider', 'smtp')
    monkeypatch.setattr(settings, 'smtp_host', 'smtp.example.invalid')
    monkeypatch.setattr(settings, 'smtp_username', 'test-only')
    monkeypatch.setattr(settings, 'smtp_password', 'test-only')
    monkeypatch.setattr(settings, 'smtp_from_email', 'sender@example.com')
    verification._challenges.clear()
    verification._limits.clear()
    yield
    verification._challenges.clear()
    verification._limits.clear()


def request(c, email='new@example.com'):
    return c.post('/api/auth/email-verification/request', json={'email': email})


def confirm(c, challenge, code, email='new@example.com'):
    return c.post('/api/auth/email-verification/confirm', json={
        'email': email, 'challenge_id': challenge, 'code': code})


def test_real_flow_requires_delivered_code_and_binds_signup_email(client, monkeypatch):
    c, _ = client
    captured = []
    monkeypatch.setattr(verification, 'send_code_email', lambda email, code: captured.append((email, code)))
    data = {'email': 'new@example.com', 'password': 'test-password-123', 'name': 'New'}
    assert c.post('/api/auth/signup', json=data).status_code == 403
    sent = request(c)
    assert sent.status_code == 200 and len(captured) == 1
    assert 'code' not in sent.json()
    challenge = sent.json()['challenge_id']
    proof = confirm(c, challenge, captured[0][1]).json()['verification_token']
    assert confirm(c, challenge, captured[0][1]).status_code == 400
    assert c.post('/api/auth/signup', json={**data, 'email': 'other@example.com', 'verification_token': proof}).status_code == 403
    created = c.post('/api/auth/signup', json={**data, 'verification_token': proof})
    assert created.status_code == 201 and created.json()['is_admin'] is False
    assert c.post('/api/auth/signup', json={**data, 'verification_token': proof}).status_code == 409
    assert login(c, 'new@example.com').status_code == 200


def test_missing_smtp_fails_closed_without_returning_code(client, monkeypatch):
    c, _ = client
    monkeypatch.setattr(settings, 'smtp_host', '')
    monkeypatch.setattr(settings, 'email_provider', 'smtp')
    response = request(c)
    assert response.status_code == 503
    assert not verification._challenges
    assert not verification._limits
    assert request(c).status_code == 503


def test_https_mail_adapter_checks_provider_receipt_without_real_send(client, monkeypatch):
    import httpx
    monkeypatch.setattr(settings, 'email_provider', 'brevo')
    monkeypatch.setattr(settings, 'brevo_api_key', 'test-only-key')
    monkeypatch.setattr(settings, 'brevo_sender_email', 'sender@example.com')
    requests = []
    def post(url, **kwargs):
        requests.append((url, kwargs))
        return httpx.Response(201, json={'messageId':'test-id'}, request=httpx.Request('POST', url))
    monkeypatch.setattr(verification.httpx, 'post', post)
    verification.send_code_email('member@example.com', '123456')
    assert requests[0][1]['json']['to'] == [{'email':'member@example.com'}]
    assert requests[0][1]['headers']['api-key'] == 'test-only-key'
    monkeypatch.setattr(verification.httpx, 'post', lambda url, **kw: httpx.Response(401,
        json={'message':'bad key'}, request=httpx.Request('POST',url)))
    with pytest.raises(Exception) as exc:
        verification.send_code_email('member@example.com', '123456')
    assert exc.value.status_code == 503


def test_rate_limits_expiry_wrong_code_and_attempt_exhaustion(client, monkeypatch):
    c, _ = client
    captured = []
    monkeypatch.setattr(verification, 'send_code_email', lambda email, code: captured.append(code))
    challenge = request(c).json()['challenge_id']
    assert request(c).status_code == 429
    wrong = '111111' if captured[0] != '111111' else '222222'
    for _ in range(5):
        assert confirm(c, challenge, wrong).status_code == 400
    assert confirm(c, challenge, captured[0]).status_code == 400
    verification._limits.clear()
    challenge = request(c).json()['challenge_id']
    verification._challenges[challenge]['expires'] = 0
    assert confirm(c, challenge, captured[-1]).status_code == 400


def test_login_token_cannot_be_used_for_email_proof_and_admin_is_server_controlled(client, monkeypatch):
    c, _ = client
    assert signup(c).status_code == 201
    token = login(c).json()['access_token']
    headers = {'Authorization': 'Bearer ' + token}
    assert c.get('/api/auth/me', headers=headers).json()['is_admin'] is False
    assert c.get('/api/auth/public-members', headers=headers).status_code == 403
    monkeypatch.setattr(settings, 'admin_username', 'member@example.com')
    # Even a matching administrator login ID never elevates a member account.
    assert c.get('/api/auth/me', headers=headers).json()['is_admin'] is False
    assert c.get('/api/auth/public-members', headers=headers).status_code == 403
    assert c.post('/api/auth/signup', json={'email': 'new@example.com', 'name': 'New',
        'password': 'test-password-123', 'verification_token': token}).status_code == 403
