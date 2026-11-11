from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.base import Base  # Re-export for existing callers.


engine = create_engine(settings.database_url, pool_pre_ping=True) if settings.database_url else None
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None


def get_db():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured. Copy .env.example and set TiDB credentials.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
