from fastapi import APIRouter

from app.schemas.profile import StyleProfileInput
from app.features.styling.router import router as styling_router

router = APIRouter()
router.include_router(styling_router)


@router.post("/", deprecated=True, summary="기존 프로필 미저장 프로토타입")
def save_profile(profile: StyleProfileInput) -> dict[str, object]:
    return {"status": "prototype", "profile": profile.model_dump()}
