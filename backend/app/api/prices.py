from fastapi import APIRouter

from app.services.price_timing import sample_price_insight

router = APIRouter()


@router.get("/{product_id}/insight")
def price_insight(product_id: str) -> dict[str, object]:
    return sample_price_insight(product_id)
