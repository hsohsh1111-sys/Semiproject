"""Add only owned profile columns and inbody_records. Default is preview.

Run: python -m app.db.profile_extension [--apply]
TiDB DDL auto-commits: failures may leave completed additions in place. Rerun
after correcting the cause; existing columns and tables are never replaced.
"""
import argparse
import json

from sqlalchemy import create_engine, inspect, Numeric
from sqlalchemy.schema import CreateTable
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.models.user import User
from app.db.models.user_profile import UserProfile
from app.db.models.inbody_record import InbodyRecord

ADDITIONS = {
    "height_cm_precise": "DECIMAL(5,2) NULL",
    "weight_kg": "DECIMAL(5,2) NULL",
    "personal_color": "VARCHAR(80) NULL",
    "preferred_colors": "JSON NULL",
}


def same_type(actual, expected, dialect):
    if isinstance(actual, Numeric) and isinstance(expected, Numeric):
        return (actual.precision, actual.scale) == (expected.precision, expected.scale)
    return actual.compile(dialect=dialect).upper() == expected.compile(dialect=dialect).upper()


def plan(connection):
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    if not {"users", "user_profiles"} <= tables:
        raise ValueError("Expected team users and user_profiles tables are missing.")
    for table, required in {
        "users": {c.name for c in User.__table__.columns},
        "user_profiles": {"user_id", "height_cm", "body_shape", "style_preference", "fit_preference"},
    }.items():
        if not required <= {c["name"] for c in inspector.get_columns(table)}:
            raise ValueError(f"Unexpected team column contract: {table}")
    if inspector.get_pk_constraint("user_profiles")["constrained_columns"] != ["user_id"]:
        raise ValueError("Unexpected user_profiles primary key; no DDL executed.")
    columns = {c["name"]: c for c in inspector.get_columns("user_profiles")}
    # Do not silently reuse incompatible partially-created extension columns.
    for name in ADDITIONS.keys() & columns.keys():
        expected = UserProfile.__table__.c[name].type
        actual = columns[name]["type"]
        if not same_type(actual, expected, connection.dialect) or not columns[name]["nullable"]:
            raise ValueError(f"Incompatible existing extension column: {name}")
    statements = [f"ALTER TABLE user_profiles ADD COLUMN {name} {ddl}"
                  for name, ddl in ADDITIONS.items() if name not in columns]
    if "inbody_records" not in tables:
        statements.append(str(CreateTable(InbodyRecord.__table__).compile(dialect=connection.dialect)))
    else:
        existing = {c['name']: c for c in inspector.get_columns('inbody_records')}
        for column in InbodyRecord.__table__.columns:
            actual = existing.get(column.name)
            if actual is None or not same_type(actual['type'], column.type, connection.dialect):
                raise ValueError('Existing inbody_records requires manual compatibility review.')
        if inspector.get_pk_constraint('inbody_records')['constrained_columns'] != ['id']:
            raise ValueError('Unexpected inbody_records primary key.')
    return statements


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not settings.database_url or make_url(settings.database_url).get_backend_name() != 'mysql':
        print(json.dumps({'status': 'mysql_configuration_required'}))
        return 2
    engine = create_engine(settings.database_url, connect_args={'connect_timeout': 5, 'read_timeout': 30})
    completed = 0
    try:
        with engine.connect() as connection:
            statements = plan(connection)
            if not args.apply:
                print(json.dumps({'status': 'preview', 'sql': statements}, indent=2))
                return 0
            for statement in statements:
                connection.exec_driver_sql(statement)
                connection.commit()
                completed += 1
            remaining = plan(connection)
            print(json.dumps({'status': 'applied' if not remaining else 'incomplete',
                              'completed_statements': completed, 'remaining_statements': len(remaining)}))
            return 0 if not remaining else 2
    except Exception as error:
        # Never print driver messages, credentials, SQL parameters or URLs.
        original = getattr(error, 'orig', error)
        code = original.args[0] if original.args and isinstance(original.args[0], int) else None
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__,
                          'mysql_error_code': code, 'completed_statements': completed}))
        return 2
    finally:
        engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
