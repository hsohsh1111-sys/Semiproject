from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models.user import User
from app.core.config import settings
from tests.test_auth import client, login


def payload(**changes):
    return {'username':'phone.user','name':'Phone nickname','phone_number':'010-1234-5678',
        'phone_collection_consent':True,'terms_agreed':True,'privacy_agreed':True,'age_14_or_over':True,
        'password':'test-password-123',**changes}


def test_phone_signup_without_email_or_verification_stores_contact_and_logs_in(client):
    c,engine=client
    response=c.post('/api/auth/signup',json=payload())
    assert response.status_code==201,response.text
    assert response.json()['email'] is None
    assert 'phone_number' not in response.json()
    with Session(engine) as db:
        user=db.scalar(select(User).where(User.username=='phone.user'))
        assert user.phone_number=='01012345678'
        assert user.email is None
        assert user.sms_marketing_consent is False
        assert user.sms_marketing_consented_at is None
        assert user.signup_consent['version']=='2026-11-12-draft-1'
        assert user.signup_consent['recorded_at']
        assert user.signup_consent['terms_agreed'] is True
        assert user.signup_consent['sms_marketing_consent'] is False
    assert login(c,'phone.user').status_code==200
    assert c.post('/api/auth/signup',json=payload(username='second.user')).status_code==201
    assert c.post('/api/auth/signup',json=payload()).status_code==409


def test_phone_consent_and_marketing_are_separate_and_masked_for_admin(client,monkeypatch):
    from app.core.security import password_hasher
    c,engine=client
    assert c.post('/api/auth/signup',json=payload(phone_collection_consent=False)).status_code==422
    assert c.post('/api/auth/signup',json=payload(sms_marketing_consent=True)).status_code==201
    with Session(engine) as db:
        user=db.scalar(select(User))
        assert user.sms_marketing_consent is True and user.sms_marketing_consented_at
    monkeypatch.setattr(settings,'admin_username','test-contact-admin')
    monkeypatch.setattr(settings,'admin_password_hash',password_hasher.hash('test-only-admin-password'))
    result=c.post('/api/auth/login',json={'email':'test-contact-admin','password':'test-only-admin-password'})
    headers={'Authorization':'Bearer '+result.json()['access_token']}
    response=c.get('/api/auth/public-members',headers=headers)
    assert response.status_code==200
    member=response.json()['members'][0]
    assert member['masked_phone']=='010-****-5678'
    assert member['sms_marketing_consent'] is True
    assert '01012345678' not in response.text


def test_phone_is_format_checked_but_not_an_authentication_identifier(client):
    c,_=client
    for invalid in ['1234','0101234567','010abcdefgh','01012345678<script>']:
        assert c.post('/api/auth/signup',json=payload(phone_number=invalid)).status_code==422
    assert c.post('/api/auth/signup',json=payload()).status_code==201
    assert login(c,'01012345678').status_code==401


def test_all_required_consents_are_checked_on_server_and_cannot_be_fabricated(client):
    c,_=client
    for flag in ['terms_agreed','privacy_agreed','age_14_or_over']:
        response=c.post('/api/auth/signup',json=payload(**{flag:False}))
        assert response.status_code==422
    assert c.post('/api/auth/signup',json=payload(terms_agreed='yes')).status_code==422
    assert c.post('/api/auth/signup',json=payload(consent_version='fabricated')).status_code==422


def test_signup_session_is_atomic_and_avoids_duplicate_login_and_schema_queries(client):
    from sqlalchemy import event
    c,engine=client
    statements=[]
    def record(conn,cursor,statement,parameters,context,many):
        statements.append(statement.split()[0].upper())
    event.listen(engine,'before_cursor_execute',record)
    response=c.post('/api/auth/signup-session',json=payload())
    event.remove(engine,'before_cursor_execute',record)
    assert response.status_code==201,response.text
    data=response.json()
    assert data['user']['name']=='Phone nickname' and data['auth_type']=='member'
    assert data['access_token'] and data['expires_in']==1800
    assert statements.count('INSERT')==1
    assert statements.count('SELECT')==1
    assert 'PRAGMA' not in statements
    headers={'Authorization':'Bearer '+data['access_token']}
    assert c.get('/api/auth/me',headers=headers).json()['id']==data['user']['id']
    assert c.post('/api/auth/signup-session',json=payload()).status_code==409
    assert c.post('/api/auth/signup-session',json=payload(username='other.id',terms_agreed=False)).status_code==422
