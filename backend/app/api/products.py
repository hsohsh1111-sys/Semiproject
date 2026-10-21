from fastapi import APIRouter

from app.services.product_matching import sample_products

router = APIRouter()


@router.get("/")
def list_products() -> list[dict[str, object]]:
    return sample_products()


@router.get("/{product_id}/offers")
def product_offers(product_id: str) -> dict[str, object]:
    return {"product_id": product_id, "offers": [], "status": "sample-data-pending"}
