from datetime import datetime, timedelta, timezone
import jwt
from app.core.config import settings
from tests.test_auth import client, signup, login


def register(c, username='new.user', email='new@example.com', **changes):
    now=datetime.now(timezone.utc)
    proof=jwt.encode({'sub':email, 'type':'email-verification','iat':now,
        'exp':now+timedelta(minutes=15),'iss':'onfit-api','aud':'onfit-signup'},settings.secret_key,algorithm='HS256')
    return c.post('/api/auth/signup',json={'username':username,'email':email,'name':'My nickname',
        'password':'test-password-123','verification_token':proof,**changes})


def test_username_and_email_login_share_nickname_and_duplicate_rules(client):
    c,_=client
    created=register(c,username=' New.User ')
    assert created.status_code==201,created.text
    assert created.json()['name']=='My nickname'
    for identifier in ['new.user','NEW.USER','new@example.com']:
        logged=login(c,identifier)
        assert logged.status_code==200,logged.text
        headers={'Authorization':'Bearer '+logged.json()['access_token']}
        assert c.get('/api/auth/me',headers=headers).json()['id']==created.json()['id']
    assert register(c,username='NEW.USER',email='other@example.com').status_code==409
    assert register(c,username='different',email='new@example.com').status_code==409
    assert login(c,'new.user',password='wrong-password').status_code==401
    assert login(c,'unknown.id').status_code==401


def test_legacy_email_login_and_admin_reservation(client,monkeypatch):
    c,_=client
    assert signup(c).status_code==201
    assert login(c).status_code==200
    monkeypatch.setattr(settings,'admin_username','onfit-admin')
    assert register(c,username='ONFIT-ADMIN').status_code==409
    assert register(c,username='abc').status_code==422
    assert register(c,username='x'*33).status_code==422
    assert register(c,username='not valid').status_code==422
