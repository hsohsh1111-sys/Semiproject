import pytest
from sqlalchemy import create_engine, text

from app.db.models.user import User
from app.db.models.user_profile import UserProfile
from app.db.models.inbody_record import InbodyRecord
from app.db.profile_extension import plan, same_type


def test_mysql_decimal_and_numeric_are_equivalent():
    from sqlalchemy import Numeric
    from sqlalchemy.dialects.mysql import DECIMAL, dialect
    assert same_type(DECIMAL(5, 2), Numeric(5, 2), dialect())
    assert not same_type(DECIMAL(6, 2), Numeric(5, 2), dialect())


def test_preview_only_adds_owned_fields_and_inbody():
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        User.__table__.create(connection)
        connection.execute(text('CREATE TABLE user_profiles (user_id INTEGER PRIMARY KEY, height_cm SMALLINT, body_shape VARCHAR(80), style_preference VARCHAR(80), fit_preference VARCHAR(80))'))
        connection.execute(text('INSERT INTO user_profiles (user_id, height_cm) VALUES (1, 175)'))
        statements = plan(connection)
        assert len(statements) == 5
        assert all(s.startswith('ALTER TABLE user_profiles ADD COLUMN') for s in statements[:4])
        assert 'CREATE TABLE inbody_records' in statements[4]
        assert connection.execute(text('SELECT height_cm FROM user_profiles')).scalar() == 175
    engine.dispose()


def test_already_compatible_schema_requires_no_changes():
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        for model in (User, UserProfile, InbodyRecord):
            model.__table__.create(connection)
        assert plan(connection) == []
    engine.dispose()


def test_wrong_profile_primary_key_is_rejected_before_any_ddl():
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        User.__table__.create(connection)
        connection.execute(text('CREATE TABLE user_profiles (id INTEGER PRIMARY KEY, user_id INTEGER, height_cm SMALLINT, body_shape TEXT, style_preference TEXT, fit_preference TEXT)'))
        with pytest.raises(ValueError, match='primary key'):
            plan(connection)
    engine.dispose()
