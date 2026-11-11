from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.models.user import User
from app.features.auth.dependencies import auth_db, get_current_user
from app.features.auth.router import PrivateValidationRoute
from app.features.auth.schemas import ErrorResponse
from app.features.fitting import service
from app.features.fitting.schemas import Defaults, FittingPreviewRequest, Preview

router = APIRouter(route_class=PrivateValidationRoute, responses={
    401: {"model": ErrorResponse, "description": "로그인 필요"},
    503: {"model": ErrorResponse, "description": "인증 또는 DB 설정 필요"},
})


@router.get("/defaults", response_model=Defaults, summary="본인 마네킹 기본 치수 불러오기")
def get_defaults(user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    """최신 측정일의 인바디 키·체중 우선, 기록이 없으면 프로필. 어깨·허리는 직접 입력합니다."""
    return service.defaults(db, user.id)


@router.post("/preview", response_model=Preview, summary="직접 입력한 치수로 3D 변형값 계산")
def preview(payload: FittingPreviewRequest, user: User = Depends(get_current_user)):
    """DB 저장 없음. 미터 단위. 허리를 원형 단면으로 근사하는 기하학적 미리보기입니다.
    체중은 확인용으로 반환하며, 부위 크기 추정에 사용하지 않습니다.
    """
    return service.preview(payload)
