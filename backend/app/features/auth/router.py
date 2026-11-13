from fastapi import APIRouter, Depends, Request, HTTPException, Response
from pydantic import ValidationError
import re
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.db.models.user import User
from app.features.auth import service
from app.features.auth.account import WithdrawalInput, account_details, withdraw
from app.features.auth.dependencies import auth_db, auth_ready, get_current_user, is_admin
from app.features.auth.schemas import EmailVerificationRequest, EmailVerificationConfirm
from app.features.auth import email_verification
from app.features.auth import admin_auth
from app.features.auth.schemas import AdminCredentials, AdminPublic, LoginInput
from app.features.auth.dependencies import require_admin
from app.features.auth.schemas import Credentials, ErrorResponse, SignupInput, SignupSessionResponse, TokenResponse, UserPublic

class PrivateValidationRoute(APIRoute):
    """Do not echo passwords or raw request bodies in validation responses."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def safe_handler(request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                return JSONResponse(status_code=422, content={"detail": [
                    {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
                    for error in exc.errors()
                ]})
        return safe_handler


router = APIRouter(route_class=PrivateValidationRoute)
unavailable = {503: {"model": ErrorResponse, "description": "DB 또는 인증 시크릿 설정 필요"}}


def public_user(user):
    return UserPublic.model_validate(user).model_copy(update={'is_admin': is_admin(user)})


def login_db(payload: LoginInput):
    if settings.admin_username and payload.email.casefold() == settings.admin_username.casefold():
        yield None
        return
    yield from auth_db()


@router.post('/admin/login', response_model=TokenResponse, summary='별도 관리자 ID 로그인', dependencies=[Depends(auth_ready)])
def admin_login(payload: AdminCredentials, request: Request):
    token = admin_auth.login(payload.username, payload.password.get_secret_value(),
                             request.client.host if request.client else 'unknown')
    return TokenResponse(access_token=token, expires_in=settings.access_token_expire_minutes * 60, auth_type='admin')


@router.get('/admin/me', response_model=AdminPublic, summary='관리자 세션 확인')
def admin_me(principal=Depends(require_admin)):
    return principal


@router.post('/email-verification/request', summary='회원가입 이메일 인증번호 발송', dependencies=[Depends(auth_ready)])
def request_email_verification(payload: EmailVerificationRequest, request: Request):
    return email_verification.request_code(str(payload.email), request.client.host if request.client else 'unknown')


@router.post('/email-verification/confirm', summary='이메일 인증번호 확인', dependencies=[Depends(auth_ready)])
def confirm_email_verification(payload: EmailVerificationConfirm):
    token = email_verification.verify_code(str(payload.email), payload.challenge_id, payload.code)
    return {'verification_token': token, 'expires_in': 900}


@router.get("/status", summary="인증 설정 상태")
def auth_status() -> dict[str, str]:
    from app.db.session import SessionLocal
    configured = settings.auth_configured and SessionLocal is not None
    return {"status": "configured" if configured else "not-configured",
            "message": "Configuration only; database connectivity is not checked."}


@router.post("/signup", response_model=UserPublic, status_code=201,
             summary="회원가입", dependencies=[Depends(auth_ready)],
             responses={409: {"model": ErrorResponse, "description": "중복 이메일"}, **unavailable})
def signup(payload: SignupInput, db: Session = Depends(auth_db)):
    """이메일을 소문자로 정규화합니다. 비밀번호는 8~128자이며 해시만 저장합니다."""
    return public_user(service.signup(db, payload))


@router.post('/signup-session', response_model=SignupSessionResponse, status_code=201,
             summary='회원가입 및 자동 로그인', dependencies=[Depends(auth_ready)], responses=unavailable)
def signup_session(payload: SignupInput, db: Session = Depends(auth_db)):
    user = service.signup(db, payload)
    return SignupSessionResponse(user=public_user(user), access_token=create_access_token(user.id),
                                 expires_in=settings.access_token_expire_minutes * 60)


@router.post("/login", response_model=TokenResponse, summary="회원·관리자 통합 로그인",
             dependencies=[Depends(auth_ready)],
             responses={401: {"model": ErrorResponse, "description": "이메일 또는 비밀번호 오류"}, **unavailable})
def login(payload: LoginInput, request: Request, db: Session | None = Depends(login_db)):
    """같은 입력 창에서 서버가 관리자 ID를 구분합니다. 비밀번호 오류 시 회원 로그인으로 우회하지 않습니다."""
    if settings.admin_username and payload.email.casefold() == settings.admin_username.casefold():
        if not 8 <= len(payload.password.get_secret_value()) <= 32:
            raise HTTPException(401, '이메일/ID 또는 비밀번호를 확인해 주세요.')
        token = admin_auth.login(settings.admin_username, payload.password.get_secret_value(),
                                request.client.host if request.client else 'unknown')
        return TokenResponse(access_token=token, expires_in=settings.access_token_expire_minutes * 60, auth_type='admin')
    try:
        if '@' in payload.email:
            credentials = Credentials(email=payload.email, password=payload.password)
        elif re.fullmatch(r'[a-zA-Z0-9_.-]{4,32}', payload.email):
            credentials = payload
        else:
            raise HTTPException(422, '아이디 또는 이메일 주소를 확인해 주세요.')
    except ValidationError:
        raise HTTPException(422, '이메일 주소를 확인해 주세요.') from None
    user = service.authenticate(db, credentials)
    return TokenResponse(access_token=create_access_token(user.id), expires_in=settings.access_token_expire_minutes * 60)


@router.get("/me", response_model=UserPublic, summary="로그인한 회원 조회",
            responses={401: {"model": ErrorResponse, "description": "토큰 누락·만료·변조 또는 회원 없음"}, **unavailable})
def me(user: User = Depends(get_current_user)):
    """토큰의 회원만 반환하며 비밀번호 해시는 응답에 포함하지 않습니다."""
    return public_user(user)


@router.get('/account', summary='마이페이지 본인 정보 조회')
def my_account(user: User = Depends(get_current_user)):
    return account_details(user)


@router.delete('/account', status_code=204, summary='비밀번호 재확인 후 본인 회원탈퇴')
def delete_account(payload: WithdrawalInput, user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    withdraw(db,user,payload)
    return Response(status_code=204)
