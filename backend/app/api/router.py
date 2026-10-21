from fastapi import APIRouter

from app.api import auth, outfits, prices, products, profiles, wardrobe

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(outfits.router, prefix="/outfits", tags=["outfits"])
api_router.include_router(wardrobe.router, prefix="/wardrobe", tags=["wardrobe"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(prices.router, prefix="/prices", tags=["prices"])
