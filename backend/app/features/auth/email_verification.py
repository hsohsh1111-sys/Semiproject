"""Short-lived signup verification. No users are created before verification.

Challenge/rate state is process-local: deploy a single worker until a shared
store is configured. Restarting the process invalidates pending codes safely.
"""
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import hashlib
import hmac
import secrets
import smtplib
import ssl
import threading
import time

import jwt
import httpx
from fastapi import HTTPException
from app.core.config import settings

_lock = threading.Lock()
_challenges = {}
_limits = {}


def ensure_delivery_ready():
    ready = (bool(settings.brevo_api_key and settings.brevo_sender_email)
             if settings.email_provider == 'brevo' else
             all((settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from_email))
             if settings.email_provider == 'smtp' else False)
    if not ready:
        raise HTTPException(503, '인증 메일 발송 서비스가 아직 연결되지 않았습니다. 현재 회원가입 이메일 인증을 사용할 수 없습니다.')


def send_code_email(email, code):
    ensure_delivery_ready()
    if settings.email_provider == 'brevo':
        if not settings.brevo_api_key or not settings.brevo_sender_email:
            raise HTTPException(503, '이메일 인증 발송 설정이 준비되지 않았습니다.')
        try:
            response = httpx.post('https://api.brevo.com/v3/smtp/email',
                headers={'api-key': settings.brevo_api_key}, timeout=10,
                json={'sender': {'email': settings.brevo_sender_email, 'name': 'ONFIT'},
                      'to': [{'email': email}], 'subject': '[ONFIT] 회원가입 인증번호',
                      'textContent': f'ONFIT 인증번호: {code}\n5분 안에 입력해 주세요. 요청하지 않았다면 무시해 주세요.'})
            response.raise_for_status()
            if not response.json().get('messageId'):
                raise ValueError('missing delivery receipt')
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, '인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.') from None
        return
    if settings.email_provider != 'smtp':
        raise HTTPException(503, '이메일 발송 방식을 확인해 주세요.')
    if not all((settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from_email)):
        raise HTTPException(503, '이메일 인증 발송 설정이 준비되지 않았습니다.')
    message = EmailMessage()
    message['From'] = settings.smtp_from_email
    message['To'] = email
    message['Subject'] = '[ONFIT] 회원가입 인증번호'
    message.set_content(f'ONFIT 회원가입 인증번호: {code}\n5분 안에 입력해 주세요. 요청하지 않았다면 무시해 주세요.')
    client = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    try:
        kwargs = {'timeout': 10}
        if settings.smtp_use_ssl:
            kwargs['context'] = ssl.create_default_context()
        with client(settings.smtp_host, settings.smtp_port, **kwargs) as smtp:
            if not settings.smtp_use_ssl:
                smtp.starttls(context=ssl.create_default_context())
            smtp.login(settings.smtp_username, settings.smtp_password)
            if smtp.send_message(message):
                raise smtplib.SMTPException('recipient rejected')
    except (OSError, smtplib.SMTPException):
        raise HTTPException(503, '인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.') from None


def _digest(value):
    return hmac.new(settings.secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


def request_code(email, client_ip):
    # Missing configuration is not a delivery attempt and must not consume cooldown.
    ensure_delivery_ready()
    now = time.monotonic()
    challenge_id = secrets.token_urlsafe(24)
    code = f'{secrets.randbelow(1000000):06d}'
    # Both address and client are limited, including unsuccessful deliveries.
    with _lock:
        for key in list(_challenges):
            if _challenges[key]['expires'] <= now:
                del _challenges[key]
        for key in list(_limits):
            if _limits[key]['reset'] <= now:
                del _limits[key]
        keys = [('email', _digest(email)), ('ip', _digest(client_ip))]
        if len(_limits) >= 10000 or len(_challenges) >= 5000:
            raise HTTPException(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.')
        for key in keys:
            limit = _limits.get(key)
            if limit and (now - limit['last'] < 60 or limit['count'] >= 5):
                retry = max(1, int((limit['reset'] if limit['count'] >= 5 else limit['last'] + 60) - now) + 1)
                raise HTTPException(429, '요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.', headers={'Retry-After':str(retry)})
        for key in keys:
            limit = _limits.setdefault(key, {'reset': now + 900, 'count': 0})
            limit.update(count=limit['count'] + 1, last=now)
    send_code_email(email, code)
    with _lock:
        # A newly delivered code supersedes older codes for this email.
        for key in list(_challenges):
            if _challenges[key]['email'] == email:
                del _challenges[key]
        _challenges[challenge_id] = {'email': email, 'digest': _digest(challenge_id + code),
                                     'expires': time.monotonic() + 300, 'attempts': 0}
    return {'challenge_id': challenge_id, 'expires_in': 300, 'retry_after': 60}


def verify_code(email, challenge_id, code):
    with _lock:
        item = _challenges.get(challenge_id)
        if not item or item['expires'] <= time.monotonic() or item['attempts'] >= 5:
            _challenges.pop(challenge_id, None)
            raise HTTPException(400, '인증번호가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.')
        item['attempts'] += 1
        if item['email'] != email or not hmac.compare_digest(item['digest'], _digest(challenge_id + code)):
            raise HTTPException(400, '이메일과 인증번호를 확인해 주세요.')
        del _challenges[challenge_id]
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': email, 'type': 'email-verification', 'iat': now,
                       'exp': now + timedelta(minutes=15), 'iss': 'onfit-api', 'aud': 'onfit-signup'},
                      settings.secret_key, algorithm='HS256')


def require_verified_email(email, token):
    try:
        claims = jwt.decode(token or '', settings.secret_key, algorithms=['HS256'],
                            issuer='onfit-api', audience='onfit-signup',
                            options={'require': ['sub', 'type', 'iat', 'exp']})
        if claims['sub'] != email or claims['type'] != 'email-verification':
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise HTTPException(403, '이메일 인증을 완료한 뒤 회원가입해 주세요.') from None
