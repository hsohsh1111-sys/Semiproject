from sqlalchemy import text
from tests.test_auth import client, signup, login


def member(c, email='member@example.com'):
    response = signup(c, email)
    assert response.status_code == 201
    return response.json()['id'], {'Authorization': 'Bearer ' + login(c, email).json()['access_token']}


def payload(password='test-password-123'):
    return {'password': password, 'confirmation': '회원탈퇴'}


def test_account_self_only_and_password_confirmation(client):
    c, engine = client
    uid, headers = member(c)
    assert c.get('/api/auth/account').status_code == 401
    result = c.get('/api/auth/account', headers=headers)
    assert result.status_code == 200
    assert result.json()['id'] == uid
    assert 'password_hash' not in result.json() and 'signup_consent' not in result.json()
    assert c.request('DELETE', '/api/auth/account', headers=headers, json=payload('wrong')).status_code == 401
    assert c.request('DELETE', '/api/auth/account', headers=headers, json={'password': 'test-password-123'}).status_code == 422
    assert c.request('DELETE', '/api/auth/account', headers=headers, json={**payload(), 'user_id': 999}).status_code == 422
    assert c.get('/api/auth/me', headers=headers).status_code == 200


def linked_tables(engine, uid, other):
    with engine.begin() as db:
        db.execute(text('PRAGMA foreign_keys=ON'))
        for name in ['user_profiles', 'inbody_records', 'wardrobe_items', 'seasonal_favorites', 'outfits']:
            db.execute(text(f'CREATE TABLE {name} (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))'))
            db.execute(text(f'INSERT INTO {name} (id,user_id) VALUES (1,:uid),(2,:other)'), {'uid': uid, 'other': other})
        db.execute(text('CREATE TABLE outfit_items (id INTEGER PRIMARY KEY, outfit_id INTEGER REFERENCES outfits(id))'))
        db.execute(text('INSERT INTO outfit_items VALUES (1,1),(2,2)'))
        db.execute(text('CREATE TABLE products (id INTEGER PRIMARY KEY)'))
        db.execute(text('INSERT INTO products VALUES (1)'))


def test_withdraw_deletes_only_owned_data_and_revokes_token(client):
    c, engine = client
    uid, headers = member(c)
    other, other_headers = member(c, 'other@example.com')
    linked_tables(engine, uid, other)
    response = c.request('DELETE', '/api/auth/account', headers=headers, json=payload())
    assert response.status_code == 204 and not response.content
    assert c.get('/api/auth/me', headers=headers).status_code == 401
    assert login(c).status_code == 401
    assert c.get('/api/auth/me', headers=other_headers).status_code == 200
    with engine.connect() as db:
        for name in ['user_profiles', 'inbody_records', 'wardrobe_items', 'seasonal_favorites', 'outfits']:
            assert db.execute(text(f'SELECT user_id FROM {name}')).scalars().all() == [other]
        assert db.execute(text('SELECT id FROM outfit_items')).scalars().all() == [2]
        assert db.execute(text('SELECT COUNT(*) FROM products')).scalar() == 1


def test_unknown_dependency_rolls_back_all_deletions(client):
    c, engine = client
    uid, headers = member(c)
    other, _ = member(c, 'other@example.com')
    linked_tables(engine, uid, other)
    with engine.begin() as db:
        db.execute(text('CREATE TABLE future_dependency (user_id INTEGER REFERENCES users(id))'))
        db.execute(text('INSERT INTO future_dependency VALUES (:uid)'), {'uid': uid})
    assert c.request('DELETE', '/api/auth/account', headers=headers, json=payload()).status_code == 409
    assert c.get('/api/auth/me', headers=headers).status_code == 200
    with engine.connect() as db:
        assert db.execute(text('SELECT COUNT(*) FROM inbody_records')).scalar() == 2
        assert db.execute(text('SELECT COUNT(*) FROM outfit_items')).scalar() == 2


def test_optional_team_tables_not_required(client):
    c, _ = client
    _, headers = member(c)
    assert c.request('DELETE', '/api/auth/account', headers=headers, json=payload()).status_code == 204
