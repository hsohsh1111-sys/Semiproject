"""Read-only TiDB metadata check. Never reads member rows or changes schema.
Run from backend: python -m app.db.schema_audit
"""
import json
from pathlib import Path
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url
from app.core.config import settings

CONTRACT_PATH = Path(__file__).resolve().parents[3] / 'database/erd_contract.json'

def load_contract():
    return json.loads(CONTRACT_PATH.read_text(encoding='utf8'))['tables']

def compare_columns(expected, actual):
    """Extra tables/columns are reported, never interpreted as delete requests."""
    return {
        'missing_tables': sorted(set(expected)-set(actual)),
        'extra_tables': sorted(set(actual)-set(expected)),
        'tables': {name: {
            'missing_columns': sorted(set(columns)-set(actual[name])),
            'extra_columns': sorted(set(actual[name])-set(columns)),
        } for name, columns in expected.items() if name in actual},
    }

def inspect_columns(connection):
    inspector = inspect(connection)
    return {table: [c['name'] for c in inspector.get_columns(table)]
            for table in inspector.get_table_names()}

def audit(database_url=None):
    url = settings.database_url if database_url is None else database_url
    if not url:
        return {'status':'not_configured','message':'Set backend/.env TiDB fields; no database was contacted.'}
    engine = None
    try:
        if make_url(url).get_backend_name() != 'mysql':
            return {'status':'unsupported_database','message':'This CLI checks TiDB/MySQL only.'}
        engine = create_engine(url,connect_args={'connect_timeout':5,'read_timeout':5,'write_timeout':5})
        with engine.connect() as connection:
            actual = inspect_columns(connection)
        difference = compare_columns(load_contract(),actual)
        required_missing = difference['missing_tables'] or any(t['missing_columns'] for t in difference['tables'].values())
        return {'status':'differences_found' if required_missing else 'required_names_match',
                'scope':'Table/column names only; no data or DDL executed; types, PK/FK and indexes need separate review.',
                **difference}
    except Exception as error:
        # Raw exceptions can embed the username, password, hostname or URL.
        original = getattr(error, 'orig', error)
        args = getattr(original, 'args', ())
        code = args[0] if args and isinstance(args[0], int) else None
        return {'status':'connection_failed','error_type':type(error).__name__,
                'mysql_error_code':code,
                'reason': {1045:'authentication_rejected',1049:'unknown_database',
                           2003:'connection_unavailable',2005:'host_resolution_failed'}.get(code,'check_connection'),
                'message':'Check credentials, TLS and network access. Connection details are not printed.'}
    finally:
        if engine is not None: engine.dispose()

if __name__ == '__main__':
    result = audit()
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['status']=='required_names_match' else 2)
