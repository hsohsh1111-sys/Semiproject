from fastapi import HTTPException
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import dummy_hash, password_hasher, verify_password
from app.core.config import settings
from app.db.models.user import User
from app.features.auth.dependencies import unauthorized
from app.features.auth.schemas import SignupInput, Credentials


def signup(db: Session, payload: SignupInput) -> User:
    if settings.admin_username and settings.admin_username.casefold() in {str(payload.email).casefold(), (payload.username or '').casefold()}:
        raise HTTPException(409, '다른 이메일 주소로 가입해 주세요.')
    # Legacy email-only API clients retain their verification contract.
    # New phone-contact signup does not claim ownership verification.
    if payload.email:
        from app.features.auth.email_verification import require_verified_email
        require_verified_email(str(payload.email), payload.verification_token)
    # Schema migrations are deployment prerequisites. Database UNIQUE constraints
    # enforce duplicates atomically; only failed inserts need a duplicate lookup.
    user = User(email=str(payload.email) if payload.email else None, username=payload.username, name=payload.name,
                signup_consent={'version':'2026-11-12-draft-1',
                    'recorded_at':datetime.now(timezone.utc).isoformat(),
                    'terms_agreed':payload.terms_agreed, 'privacy_agreed':payload.privacy_agreed,
                    'age_14_or_over_confirmed':payload.age_14_or_over,
                    'sms_marketing_consent':payload.sms_marketing_consent} if payload.phone_number else None,
                phone_number=payload.phone_number, sms_marketing_consent=payload.sms_marketing_consent,
                sms_marketing_consented_at=datetime.now(timezone.utc).replace(tzinfo=None) if payload.sms_marketing_consent else None,
                password_hash=password_hasher.hash(payload.password.get_secret_value()))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Recheck after rollback: only duplicate email is translated to 409.
        if payload.email and db.scalar(select(User.id).where(User.email == str(payload.email))) is not None:
            raise HTTPException(409, "Email is already registered.") from None
        if payload.username and db.scalar(select(User.id).where(User.username == payload.username)) is not None:
            raise HTTPException(409, '이미 사용 중인 아이디입니다.') from None
        raise
    db.refresh(user)
    return user


def authenticate(db: Session, payload: Credentials) -> User:
    identifier = str(payload.email).strip().lower()
    if '@' in identifier:
        user = db.scalar(select(User).where(User.email == identifier))
    else:
        user = db.scalar(select(User).where(User.username == identifier))
    valid = verify_password(payload.password.get_secret_value(), user.password_hash if user else dummy_hash)
    if user is None or not valid:
        raise unauthorized()
    return user
