from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.router import api_router
from app.core.config import settings
from routers.circle_search import router as circle_search_router

app = FastAPI(title="ONFIT API", version="0.1.0", description="Personal styling and smart shopping API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")
app.include_router(circle_search_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "onfit-api"}


# Built assets are optional locally, where Vite serves both React apps.
backend_dir = Path(__file__).resolve().parents[1]
ai_fashion_dist = backend_dir.parent / "ai-fashion" / "dist"
frontend_dist = backend_dir.parent / "frontend" / "dist"
if ai_fashion_dist.is_dir():
    app.mount("/ai-fashion", StaticFiles(directory=ai_fashion_dist, html=True), name="ai-fashion")
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
