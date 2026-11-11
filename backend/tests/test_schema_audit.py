from sqlalchemy import create_engine, text
from app.db.schema_audit import load_contract, compare_columns, inspect_columns, audit

def test_confirmed_contract_and_current_user_columns():
    from app.db.models.user import User
    contract=load_contract()
    assert len(contract)==11
    assert set(User.__table__.columns.keys()) == (set(contract['users']) - {'name'}) | {'display_name'}
    assert User.name.property.columns[0].name == 'display_name'
    assert 'name' in contract['users'] and 'display_name' not in contract['users']

def test_legacy_name_is_reported_and_extra_data_is_not_deleted():
    result=compare_columns({'users':['id','name','password_hash']},
                            {'users':['id','display_name'],'wardrobe_items':['id']})
    assert result['tables']['users']['missing_columns']==['name','password_hash']
    assert result['extra_tables']==['wardrobe_items']

def test_readonly_inspection_does_not_modify_existing_test_data():
    engine=create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE users (id INTEGER, display_name TEXT)'))
        connection.execute(text("INSERT INTO users VALUES (1,'test-only')"))
    with engine.connect() as connection:
        assert inspect_columns(connection)=={'users':['id','display_name']}
        assert connection.execute(text('SELECT COUNT(*) FROM users')).scalar()==1
    engine.dispose()

def test_missing_connection_never_builds_an_engine(monkeypatch):
    def forbidden(*args,**kwargs):raise AssertionError('No connection is allowed')
    monkeypatch.setattr('app.db.schema_audit.create_engine',forbidden)
    assert audit('')['status']=='not_configured'

def test_authentication_failure_reports_code_without_leaking_secrets(monkeypatch):
    import json
    from sqlalchemy.exc import OperationalError
    from pymysql.err import OperationalError as DriverError
    class FakeEngine:
        def connect(self):
            raise OperationalError(None,None,DriverError(1045,'sensitive-user sensitive-password sensitive-host'))
        def dispose(self):pass
    monkeypatch.setattr('app.db.schema_audit.create_engine',lambda *a,**k:FakeEngine())
    result=audit('mysql+pymysql://test-only:dummy@example.invalid/onfit')
    assert result['mysql_error_code']==1045
    assert result['reason']=='authentication_rejected'
    assert 'sensitive-' not in json.dumps(result)
