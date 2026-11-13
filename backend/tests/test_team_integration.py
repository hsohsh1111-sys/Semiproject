import io
import json
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from tests.test_auth import client, signup, login

def test_public_members_adapter_uses_canonical_user_name_and_masks_data(client, monkeypatch):
    from app.core.config import settings
    c, engine = client
    assert signup(c).status_code == 201
    assert c.get('/api/auth/public-members').status_code == 401
    token = login(c).json()['access_token']
    headers = {'Authorization': 'Bearer ' + token}
    assert c.get('/api/auth/public-members', headers=headers).status_code == 403
    from app.core.security import password_hasher
    from app.features.auth import admin_auth
    monkeypatch.setattr(settings, 'admin_username', 'test-admin')
    monkeypatch.setattr(settings, 'admin_password_hash', password_hasher.hash('test-only-admin-password'))
    admin_auth._attempts.clear()
    result=c.post('/api/auth/admin/login',json={'username':'test-admin','password':'test-only-admin-password'})
    response = c.get('/api/auth/public-members', headers={'Authorization':'Bearer '+result.json()['access_token']})
    assert response.status_code == 200
    data = response.json()
    assert data['total_count'] == data['visible_count'] == 1
    member = data['members'][0]
    assert member['masked_name'] == 'M*****'
    assert member['masked_email'] == 'm***@example.com'
    assert 'password' not in response.text and 'member@example.com' not in response.text

def test_canonical_and_team_routes_coexist():
    paths = app.openapi()['paths']
    for path in ['/api/auth/signup','/api/auth/login','/api/auth/me',
                 '/api/fitting/preview','/api/fitting/defaults','/api/circle-search/segment',
                 '/api/circle-search/recommend','/api/circle-search/try-on']:
        assert path in paths

def test_team_segment_is_wired_without_any_external_ai_call(monkeypatch):
    from routers import circle_search
    calls=[]
    def fake_analyze(*args):
        calls.append(args)
        return {'status':'success','test_only':True}
    monkeypatch.setattr(circle_search,'analyze',fake_analyze)
    output=io.BytesIO();Image.new('RGB',(32,32),'white').save(output,format='PNG')
    with TestClient(app) as c:
        response=c.post('/api/circle-search/segment',files={'image':('test.png',output.getvalue(),'image/png')},
            data={'width':'32','height':'32','point':'[10,10]','box':'[0,0,31,31]',
                  'polygon':json.dumps([[0,0],[31,0],[31,31],[0,31]])})
    assert response.status_code==200 and response.json()['test_only'] is True
    assert len(calls)==1

def test_team_missing_input_returns_validation_error_without_inference():
    with TestClient(app) as c:
        assert c.post('/api/circle-search/segment').status_code==422

def test_team_tidb_fields_build_tls_url_without_connecting():
    from app.core.config import Settings
    settings=Settings(_env_file=None,database_url='',tidb_host='example.invalid',tidb_port=4000,
        tidb_username='test@example.com',tidb_password='test-only:password',tidb_database='onfit')
    assert 'test%40example.com:test-only%3Apassword@' in settings.database_url
    assert 'ssl_verify_cert=true&ssl_verify_identity=true' in settings.database_url
