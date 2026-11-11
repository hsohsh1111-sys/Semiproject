from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.core.config import settings

password_hasher = PasswordHash.recommended()
# Equalize the expensive hash check for unknown accounts and wrong passwords.
dummy_hash = password_hasher.hash("onfit-dummy-password-not-an-account")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hasher.verify(password, hashed)
    except (UnknownHashError, ValueError):
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": now,
         "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
         "iss": "onfit-api", "aud": "onfit-client", "type": "access"},
        settings.secret_key, algorithm="HS256",
    )


def decode_user_id(token: str) -> int:
    claims = jwt.decode(
        token, settings.secret_key, algorithms=["HS256"],
        issuer="onfit-api", audience="onfit-client",
        options={"require": ["sub", "iat", "exp", "iss", "aud", "type"]},
    )
    sub = claims["sub"]
    if claims["type"] != "access" or not isinstance(sub, str) or len(sub) > 19 or not sub.isascii() or not sub.isdigit():
        raise jwt.InvalidTokenError("Invalid subject or token type")
    user_id = int(sub)
    if not 0 < user_id <= 9223372036854775807:
        raise jwt.InvalidTokenError("Invalid user id")
    return user_id
