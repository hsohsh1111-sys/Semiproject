from datetime import datetime, timedelta, timezone
import jwt
import pytest
from app.core.config import settings
from app.core.security import password_hasher
from app.features.auth import admin_auth
from tests.test_auth import client, signup, login


@pytest.fixture
def configured_admin(monkeypatch):
    monkeypatch.setattr(settings, 'admin_username', 'onfit-admin')
    monkeypatch.setattr(settings, 'admin_password_hash', password_hasher.hash('test-only-admin-password'))
    admin_auth._attempts.clear()
    yield
    admin_auth._attempts.clear()


def admin_login(c, username='onfit-admin', password='test-only-admin-password'):
    return c.post('/api/auth/admin/login', json={'username':username,'password':password})


def test_separate_admin_identity_has_no_member_privileges(client, configured_admin):
    c, _ = client
    result = admin_login(c)
    assert result.status_code == 200
    token = result.json()['access_token']
    headers = {'Authorization':'Bearer '+token}
    me = c.get('/api/auth/admin/me', headers=headers)
    assert me.json() == {'id':'admin:onfit-admin','name':'ONFIT 관리자','is_admin':True}
    assert c.get('/api/auth/public-members',headers=headers).status_code == 200
    assert c.get('/api/auth/me',headers=headers).status_code == 401
    assert c.get('/api/auth/account',headers=headers).status_code == 401
    assert c.request('DELETE','/api/auth/account',headers=headers,json={'password':'test-only-admin-password','confirmation':'회원탈퇴'}).status_code == 401
    assert c.get('/api/outfits/favorites',headers=headers).status_code == 401
    assert signup(c).status_code == 201
    member = {'Authorization':'Bearer '+login(c).json()['access_token']}
    assert c.get('/api/auth/admin/me',headers=member).status_code == 403
    assert c.get('/api/auth/public-members',headers=member).status_code == 403
    assert c.get('/api/auth/me',headers=member).json()['is_admin'] is False


def test_unified_login_routes_admin_without_member_database(client, configured_admin, monkeypatch):
    from app.features.auth import router as auth_router
    from app.main import app
    c, _ = client
    app.dependency_overrides.pop(auth_router.login_db, None)
    monkeypatch.setattr(auth_router, 'auth_db', lambda: (_ for _ in ()).throw(AssertionError('Admin must not open member DB')))
    response=c.post('/api/auth/login',json={'email':'onfit-admin','password':'test-only-admin-password'})
    assert response.status_code==200 and response.json()['auth_type']=='admin'
    headers={'Authorization':'Bearer '+response.json()['access_token']}
    assert c.get('/api/auth/admin/me',headers=headers).status_code==200
    wrong=c.post('/api/auth/login',json={'email':'onfit-admin','password':'wrong-password'})
    assert wrong.status_code==401


def test_unified_login_supports_email_shaped_admin_id_and_reserves_signup(client, configured_admin, monkeypatch):
    c, _=client
    monkeypatch.setattr(settings,'admin_username','onfitadmin@gmail.com')
    response=c.post('/api/auth/login',json={'email':' ONFITADMIN@gmail.com ','password':'test-only-admin-password'})
    assert response.status_code==200 and response.json()['auth_type']=='admin'
    assert signup(c,'onfitadmin@gmail.com').status_code==409


def test_missing_wrong_throttled_and_revoked_admin_credentials(client, configured_admin, monkeypatch):
    c, _ = client
    token=admin_login(c).json()['access_token']
    for _ in range(9):
        assert admin_login(c,password='wrong-password').status_code == 401
    assert admin_login(c).status_code == 429
    monkeypatch.setattr(settings,'admin_password_hash',password_hasher.hash('changed-test-admin-password'))
    assert c.get('/api/auth/admin/me',headers={'Authorization':'Bearer '+token}).status_code == 401
    monkeypatch.setattr(settings,'admin_username','')
    assert admin_login(c).status_code == 503


def test_admin_token_expiry_and_payload_do_not_expose_password(client, configured_admin):
    c, _ = client
    r=c.post('/api/auth/admin/login',json={'username':'onfit-admin','password':'sensitive','role':'admin'})
    assert r.status_code==422 and 'sensitive' not in r.text
    token=admin_login(c).json()['access_token']
    claims=jwt.decode(token,settings.secret_key,algorithms=['HS256'],audience='onfit-admin')
    claims['exp']=datetime.now(timezone.utc)-timedelta(seconds=1)
    expired=jwt.encode(claims,settings.secret_key,algorithm='HS256')
    assert c.get('/api/auth/admin/me',headers={'Authorization':'Bearer '+expired}).status_code==401


def test_configuration_tool_preserves_other_settings_and_writes_only_hash(tmp_path, monkeypatch, capsys):
    from scripts import configure_admin
    monkeypatch.setattr(configure_admin, '__file__', str(tmp_path/'scripts'/'configure_admin.py'))
    env=tmp_path/'.env'
    env.write_text('EXISTING_SETTING=keep-me\n',encoding='utf8')
    values=iter(['', 'local-only-test-password', 'local-only-test-password'])
    monkeypatch.setattr('builtins.input',lambda _: next(values))
    configure_admin.main()
    text=env.read_text(encoding='utf8')
    assert 'EXISTING_SETTING=keep-me' in text
    assert 'ADMIN_USERNAME=onfit-admin' in text
    assert 'local-only-test-password' not in text
    hashed=text.split('ADMIN_PASSWORD_HASH=')[1].strip()
    assert password_hasher.verify('local-only-test-password',hashed)
    assert hashed not in capsys.readouterr().out


def test_configuration_tool_rejects_mismatch_without_changing_environment(tmp_path, monkeypatch):
    from scripts import configure_admin
    monkeypatch.setattr(configure_admin,'__file__',str(tmp_path/'scripts'/'configure_admin.py'))
    env=tmp_path/'.env';env.write_text('KEEP=original\n')
    values=iter(['onfit-admin','long-test-password-123','different-test-password'])
    monkeypatch.setattr('builtins.input',lambda _: next(values))
    with pytest.raises(SystemExit): configure_admin.main()
    assert env.read_text()=='KEEP=original\n'


@pytest.mark.parametrize('length,accepted', [(7,False),(8,True),(32,True),(33,False)])
def test_admin_password_length_boundaries(tmp_path, monkeypatch, length, accepted):
    from scripts import configure_admin
    from app.features.auth.schemas import AdminCredentials
    from pydantic import ValidationError
    monkeypatch.setattr(configure_admin,'__file__',str(tmp_path/'scripts'/'configure_admin.py'))
    values=iter(['', 'a'*length, 'a'*length])
    monkeypatch.setattr('builtins.input',lambda _: next(values))
    if accepted:
        configure_admin.main()
        assert (tmp_path/'.env').exists()
        AdminCredentials(username='onfit-admin',password='a'*length)
    else:
        with pytest.raises(SystemExit): configure_admin.main()
        assert not (tmp_path/'.env').exists()
        with pytest.raises(ValidationError): AdminCredentials(username='onfit-admin',password='a'*length)
