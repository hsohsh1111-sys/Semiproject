"""Separate environment-managed admin identity; never creates a DB user."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import threading
import time

import jwt
from fastapi import HTTPException
from app.core.config import settings
from app.core.security import dummy_hash, verify_password

_lock = threading.Lock()
_attempts = {}


def configured():
    return bool(settings.admin_username.strip() and settings.admin_password_hash)


def _version():
    return hmac.new(settings.secret_key.encode(),
        (settings.admin_username + '\0' + settings.admin_password_hash).encode(), hashlib.sha256).hexdigest()


def identity():
    return {'id': 'admin:' + settings.admin_username, 'name': 'ONFIT 관리자', 'is_admin': True}


def login(username, password, client_ip):
    if not configured():
        raise HTTPException(503, '관리자 로그인 설정이 준비되지 않았습니다.')
    now = time.monotonic()
    key = hashlib.sha256(client_ip.encode()).hexdigest()
    with _lock:
        for stale in list(_attempts):
            if _attempts[stale]['until'] <= now:
                del _attempts[stale]
        if len(_attempts) >= 10000:
            raise HTTPException(429, '잠시 후 다시 시도해 주세요.')
        state = _attempts.setdefault(key, {'count': 0, 'until': now + 900})
        if state['count'] >= 10:
            raise HTTPException(429, '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.')
        state['count'] += 1
    name_ok = hmac.compare_digest(username.encode(), settings.admin_username.encode())
    password_ok = verify_password(password, settings.admin_password_hash if name_ok else dummy_hash)
    if not name_ok or not password_ok:
        raise HTTPException(401, '관리자 ID 또는 비밀번호를 확인해 주세요.')
    issued = datetime.now(timezone.utc)
    return jwt.encode({'sub': settings.admin_username, 'type': 'admin', 'ver': _version(),
        'iss': 'onfit-api', 'aud': 'onfit-admin', 'iat': issued,
        'exp': issued + timedelta(minutes=settings.access_token_expire_minutes)}, settings.secret_key, algorithm='HS256')


def authenticate(token):
    try:
        if not configured():
            raise jwt.InvalidTokenError()
        claims = jwt.decode(token, settings.secret_key, algorithms=['HS256'],
            issuer='onfit-api', audience='onfit-admin',
            options={'require':['sub','type','ver','iat','exp']})
        if (claims['type'] != 'admin' or claims['sub'] != settings.admin_username
                or not isinstance(claims['ver'], str) or not hmac.compare_digest(claims['ver'], _version())):
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise HTTPException(401, '관리자 로그인이 필요합니다.', headers={'WWW-Authenticate':'Bearer'}) from None
    return identity()
