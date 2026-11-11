from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.models.user import User
from app.features.auth.dependencies import auth_db, get_current_user
from app.features.auth.router import PrivateValidationRoute
from app.features.auth.schemas import ErrorResponse
from app.features.styling import service
from app.features.styling.schemas import ProfilePublic, ProfileWrite

router = APIRouter(route_class=PrivateValidationRoute, responses={
    401: {"model": ErrorResponse, "description": "로그인 필요 또는 토큰 오류"},
    503: {"model": ErrorResponse, "description": "인증 또는 DB 설정 필요"},
})


@router.get("/me", response_model=ProfilePublic, summary="본인 프로필 조회",
            responses={404: {"model": ErrorResponse, "description": "프로필 미생성"}})
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    return service.require_profile(db, user.id)


@router.put("/me", response_model=ProfilePublic, summary="본인 프로필 생성 또는 전체 교체",
            responses={201: {"model": ProfilePublic, "description": "최초 생성"},
                       409: {"model": ErrorResponse, "description": "동시 생성 충돌; 다시 조회 후 재시도"}})
def put_profile(payload: ProfileWrite, response: Response,
                user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    """최초 생성 201, 교체 200. 생략한 필드는 null로 초기화합니다. user_id는 토큰에서 결정합니다."""
    profile, created = service.save_profile(db, user.id, payload, partial=False)
    response.status_code = 201 if created else 200
    return profile


@router.patch("/me", response_model=ProfilePublic, summary="본인 프로필 부분 수정",
              responses={404: {"model": ErrorResponse, "description": "프로필 미생성"}})
def patch_profile(payload: ProfileWrite, user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    """생략한 필드는 유지, 명시한 null은 삭제합니다. 빈 객체는 현재 값을 유지합니다."""
    profile, _ = service.save_profile(db, user.id, payload, partial=True)
    return profile
