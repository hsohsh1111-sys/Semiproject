from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_wardrobe() -> dict[str, object]:
    return {"items": [], "status": "prototype"}
