from fastapi import APIRouter

from app.schemas.profile import StyleProfileInput

router = APIRouter()


@router.post("/")
def save_profile(profile: StyleProfileInput) -> dict[str, object]:
    return {"status": "prototype", "profile": profile.model_dump()}
