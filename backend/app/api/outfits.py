from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.auth.dependencies import auth_db, get_current_user
from app.db.models.user import User
from app.models import SeasonalFavorite
from app.schemas.favorite import SeasonalFavoriteInput, SeasonalFavoriteOutput
from app.schemas.profile import StyleProfileInput
from app.services.outfit_recommender import recommend_outfits

router = APIRouter()


@router.post("/recommendations")
def recommendations(profile: StyleProfileInput | None = None) -> list[dict[str, object]]:
    return recommend_outfits(profile)


def favorite_output(favorite: SeasonalFavorite) -> SeasonalFavoriteOutput:
    return SeasonalFavoriteOutput(
        id=favorite.favorite_key,
        title=favorite.title,
        vendor=favorite.vendor,
        imageUrl=favorite.image_url,
        price=float(favorite.price) if favorite.price is not None else None,
        currencyCode=favorite.currency_code,
        productUrl=favorite.product_url,
        type=favorite.item_type,
        lookTitle=favorite.look_title,
        season=favorite.season,
        style=favorite.style,
        age=favorite.age,
        gender=favorite.gender,
        createdAt=favorite.created_at.isoformat(),
    )


@router.get("/favorites", response_model=list[SeasonalFavoriteOutput])
def list_favorites(
    user: User = Depends(get_current_user),
    db: Session = Depends(auth_db),
) -> list[SeasonalFavoriteOutput]:
    favorites = db.scalars(
        select(SeasonalFavorite)
        .where(SeasonalFavorite.user_id == user.id)
        .order_by(SeasonalFavorite.created_at.desc(), SeasonalFavorite.id.desc())
    ).all()
    return [favorite_output(favorite) for favorite in favorites]


@router.post("/favorites", response_model=SeasonalFavoriteOutput)
def save_favorite(
    payload: SeasonalFavoriteInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(auth_db),
) -> SeasonalFavoriteOutput:
    favorite = db.scalar(
        select(SeasonalFavorite).where(
            SeasonalFavorite.user_id == user.id,
            SeasonalFavorite.favorite_key == payload.id,
        )
    )
    if favorite is None:
        favorite = SeasonalFavorite(
            user_id=user.id,
            favorite_key=payload.id,
            title=payload.title,
            vendor=payload.vendor,
            image_url=payload.image_url,
            price=payload.price,
            currency_code=payload.currency_code,
            product_url=payload.product_url,
            item_type=payload.item_type,
            look_title=payload.look_title,
            season=payload.season,
            style=payload.style,
            age=payload.age,
            gender=payload.gender,
        )
        db.add(favorite)
        db.commit()
        db.refresh(favorite)
    return favorite_output(favorite)


@router.delete("/favorites", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite(
    favorite_key: str = Query(max_length=512),
    user: User = Depends(get_current_user),
    db: Session = Depends(auth_db),
) -> Response:
    favorite = db.scalar(
        select(SeasonalFavorite).where(
            SeasonalFavorite.user_id == user.id,
            SeasonalFavorite.favorite_key == favorite_key,
        )
    )
    if favorite is not None:
        db.delete(favorite)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
