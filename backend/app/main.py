from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.session import Base, engine
from app import models  # noqa: F401

backend_dir = Path(__file__).resolve().parents[1]
load_dotenv(backend_dir / '.env', override=False)
load_dotenv(backend_dir.parent / '.env', override=False)

from routers.circle_search import router as circle_search_router

app = FastAPI(title="ONFIT API", version="0.1.0", description="Personal styling and smart shopping API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in settings.frontend_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")
app.include_router(circle_search_router)


@app.on_event("startup")
def initialize_auth_table() -> None:
    if engine is None:
        return
    Base.metadata.create_all(bind=engine)
    # Existing project schema predates password-based accounts.
    from sqlalchemy import inspect, text

    if "users" in inspect(engine).get_table_names():
        columns = {column["name"] for column in inspect(engine).get_columns("users")}
        if "password_hash" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL"))


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "onfit-api"}
