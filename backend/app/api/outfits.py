from fastapi import APIRouter

from app.schemas.profile import StyleProfileInput
from app.services.outfit_recommender import recommend_outfits

router = APIRouter()


@router.post("/recommendations")
def recommendations(profile: StyleProfileInput | None = None) -> list[dict[str, object]]:
    return recommend_outfits(profile)
