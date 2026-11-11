from fastapi import APIRouter

from app.api import auth, outfits, prices, products, profiles, wardrobe
from app.features.inbody.router import router as inbody_router
from app.features.fitting.router import router as fitting_router
from app.features.tryon2d.router import router as tryon2d_router
from app.api.public_members import router as public_members_router

api_router = APIRouter()
api_router.include_router(tryon2d_router, prefix="/tryon2d", tags=["tryon2d"])
api_router.include_router(fitting_router, prefix="/fitting", tags=["fitting"])
api_router.include_router(inbody_router, prefix="/inbody", tags=["inbody"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(public_members_router, prefix="/auth", tags=["auth"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(outfits.router, prefix="/outfits", tags=["outfits"])
api_router.include_router(wardrobe.router, prefix="/wardrobe", tags=["wardrobe"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(prices.router, prefix="/prices", tags=["prices"])
