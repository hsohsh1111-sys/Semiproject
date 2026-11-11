from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.user_profile import UserProfile
from app.features.styling.schemas import ProfileWrite


def find_profile(db: Session, user_id: int) -> UserProfile | None:
    return db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))


def require_profile(db: Session, user_id: int) -> UserProfile:
    profile = find_profile(db, user_id)
    if profile is None:
        raise HTTPException(404, "Profile has not been created.")
    return profile


def save_profile(db: Session, user_id: int, payload: ProfileWrite, partial: bool):
    profile = require_profile(db, user_id) if partial else find_profile(db, user_id)
    created = profile is None
    if created:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    for key, value in payload.model_dump(exclude_unset=partial).items():
        setattr(profile, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if created and find_profile(db, user_id) is not None:
            raise HTTPException(409, "Profile was created concurrently; reload and retry.") from None
        raise
    db.refresh(profile)
    return profile, created
