import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_user_id
from app.db import session as db_session
from app.db.models.user import User

bearer = HTTPBearer(auto_error=False, scheme_name="BearerAuth")


def auth_ready() -> None:
    if not settings.auth_configured:
        raise HTTPException(503, "Authentication is not configured.")


def auth_db():
    if db_session.SessionLocal is None:
        raise HTTPException(503, "Authentication database is not configured.")
    yield from db_session.get_db()


def unauthorized() -> HTTPException:
    return HTTPException(401, "Invalid credentials or access token.", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ready: None = Depends(auth_ready),
    db: Session = Depends(auth_db),
) -> User:
    if credentials is None:
        raise unauthorized()
    try:
        user_id = decode_user_id(credentials.credentials)
    except jwt.InvalidTokenError:
        raise unauthorized() from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized()
    return user
