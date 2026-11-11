from typing import Annotated

from fastapi import APIRouter, Depends, File, Path, Query, UploadFile
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db.models.user import User
from app.features.auth.dependencies import auth_db, get_current_user
from app.features.auth.router import PrivateValidationRoute
from app.features.auth.schemas import ErrorResponse
from app.features.inbody import service
from app.features.inbody.schemas import RecordPublic, RecordWrite
from app.features.inbody.schemas import ExtractionPreview
from app.features.inbody.extraction import MAX_FILE_BYTES, extract_preview
from app.features.inbody.body_preview import BodyPreviewInput, BodyPreview, suggest_body

router = APIRouter(route_class=PrivateValidationRoute, responses={
    401: {"model": ErrorResponse, "description": "로그인 필요 또는 토큰 오류"},
    503: {"model": ErrorResponse, "description": "인증 또는 DB 설정 필요"},
})


@router.post('/body-preview', response_model=BodyPreview, summary='확인한 인바디 수치로 시각 체형 예시 제안')
def body_preview(payload: BodyPreviewInput, user: User = Depends(get_current_user)):
    """DB 저장 없이 기존 프리셋을 제안합니다. 부위 실측·의학적 분류가 아닙니다."""
    return suggest_body(payload)


@router.post("/extract", response_model=ExtractionPreview, summary="인바디 PDF·이미지 수치 추출 미리보기",
             responses={413: {"model": ErrorResponse, "description": "파일·페이지·해상도 제한 초과"},
                        415: {"model": ErrorResponse, "description": "지원하지 않는 파일 형식"},
                        422: {"description": "요청 오류·빈 파일·손상 파일·OCR 시간 초과"},
                        503: {"model": ErrorResponse, "description": "인증/DB 또는 OCR 엔진 설정 필요"}})
async def preview_inbody(file: Annotated[UploadFile, File(description="PDF/PNG/JPEG, 최대 10MiB. PDF 최대 3페이지.")],
                         user: User = Depends(get_current_user)):
    """원본과 추출값을 DB에 저장하지 않습니다. 파일명·원문 텍스트도 응답하지 않습니다.
    추출값은 오인식 가능성이 있어 사용자 확인이 필수입니다. 명시된 항목명·수치를 읽으며
    같은 줄의 여러 항목과 바로 다음 줄의 단일 수치를 지원합니다. 표·그래프·모호한 값은
    null일 수 있습니다. measured_at은 직접 입력하세요.
    이미지/텍스트 없는 PDF는 서버에 Tesseract 및 kor/eng 언어 데이터가 필요합니다.
    확인한 values를 수정·보완한 뒤 POST /api/inbody/records로 저장하세요.
    """
    try:
        data = await file.read(MAX_FILE_BYTES + 1)
        return await run_in_threadpool(extract_preview, data)
    finally:
        await file.close()


@router.post("/records", response_model=RecordPublic, status_code=201, summary="확인한 인바디 수치 저장")
def create_record(payload: RecordWrite, user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    """사용자가 확인한 수치만 저장합니다. 파일 업로드/OCR/의학적 분석은 수행하지 않습니다.
    user_id는 로그인 토큰에서 결정합니다. 같은 요청을 다시 보내면 별도 기록이 생성됩니다.
    프로필은 자동 변경하지 않습니다.
    """
    return service.create_record(db, user.id, payload)


@router.get("/records", response_model=list[RecordPublic], summary="본인 인바디 기록 목록")
def list_records(limit: Annotated[int, Query(ge=1, le=100)] = 20,
                 offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
                 user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    """측정 시각 내림차순, 같은 시각은 id 내림차순. 기록이 없으면 빈 배열입니다."""
    return service.list_records(db, user.id, limit, offset)


@router.get("/records/{record_id}", response_model=RecordPublic, summary="본인 인바디 기록 상세",
            responses={404: {"model": ErrorResponse, "description": "없거나 다른 회원의 기록"}})
def get_record(record_id: Annotated[int, Path(ge=1, le=9223372036854775807)],
               user: User = Depends(get_current_user), db: Session = Depends(auth_db)):
    return service.get_record(db, user.id, record_id)
