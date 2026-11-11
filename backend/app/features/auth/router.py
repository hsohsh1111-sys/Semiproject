from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.db.models.user import User
from app.features.auth import service
from app.features.auth.dependencies import auth_db, auth_ready, get_current_user
from app.features.auth.schemas import Credentials, ErrorResponse, SignupInput, TokenResponse, UserPublic

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


@router.get("/status", summary="인증 설정 상태")
def auth_status() -> dict[str, str]:
    from app.db.session import SessionLocal
    configured = settings.auth_configured and SessionLocal is not None
    return {"status": "configured" if configured else "not-configured",
            "message": "Configuration only; database connectivity is not checked."}


@router.post("/signup", response_model=UserPublic, status_code=201,
             summary="이메일 회원가입", dependencies=[Depends(auth_ready)],
             responses={409: {"model": ErrorResponse, "description": "중복 이메일"}, **unavailable})
def signup(payload: SignupInput, db: Session = Depends(auth_db)):
    """이메일을 소문자로 정규화합니다. 비밀번호는 8~128자이며 해시만 저장합니다."""
    return service.signup(db, payload)


@router.post("/login", response_model=TokenResponse, summary="이메일 로그인",
             dependencies=[Depends(auth_ready)],
             responses={401: {"model": ErrorResponse, "description": "이메일 또는 비밀번호 오류"}, **unavailable})
def login(payload: Credentials, db: Session = Depends(auth_db)):
    """JSON으로 로그인합니다. 반환 토큰을 Swagger Authorize에 입력해 /me를 호출합니다."""
    user = service.authenticate(db, payload)
    return TokenResponse(access_token=create_access_token(user.id),
                         expires_in=settings.access_token_expire_minutes * 60)


@router.get("/me", response_model=UserPublic, summary="로그인한 회원 조회",
            responses={401: {"model": ErrorResponse, "description": "토큰 누락·만료·변조 또는 회원 없음"}, **unavailable})
def me(user: User = Depends(get_current_user)):
    """토큰의 회원만 반환하며 비밀번호 해시는 응답에 포함하지 않습니다."""
    return user
