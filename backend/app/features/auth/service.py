from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import dummy_hash, password_hasher, verify_password
from app.db.models.user import User
from app.features.auth.dependencies import unauthorized
from app.features.auth.schemas import SignupInput, Credentials


def signup(db: Session, payload: SignupInput) -> User:
    if db.scalar(select(User.id).where(User.email == str(payload.email))) is not None:
        raise HTTPException(409, "Email is already registered.")
    user = User(email=str(payload.email), name=payload.name,
                password_hash=password_hasher.hash(payload.password.get_secret_value()))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Recheck after rollback: only duplicate email is translated to 409.
        if db.scalar(select(User.id).where(User.email == str(payload.email))) is not None:
            raise HTTPException(409, "Email is already registered.") from None
        raise
    db.refresh(user)
    return user


def authenticate(db: Session, payload: Credentials) -> User:
    user = db.scalar(select(User).where(User.email == str(payload.email)))
    valid = verify_password(payload.password.get_secret_value(), user.password_hash if user else dummy_hash)
    if user is None or not valid:
        raise unauthorized()
    return user
