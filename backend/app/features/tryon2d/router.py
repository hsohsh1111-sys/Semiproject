import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.db.models.user import User
from app.features.auth.dependencies import get_current_user
from app.features.auth.router import PrivateValidationRoute
from app.features.auth.schemas import ErrorResponse
from app.features.tryon2d.adapter import InferenceInput
from app.features.tryon2d.images import read_image
from app.features.tryon2d.schemas import Category, JobStatus, TryOnJob
from app.features.tryon2d.service import TryOnService, get_tryon_service

router = APIRouter(route_class=PrivateValidationRoute, responses={
    401: {'model': ErrorResponse, 'description': '로그인 필요'},
    422: {'description': '필수 입력 누락·잘못된 종류·손상 이미지'},
})


@router.post('/jobs', response_model=TryOnJob, status_code=202, summary='2D 가상 피팅 입력 검증 및 작업 요청',
             responses={413: {'model': ErrorResponse, 'description': '파일·해상도 제한 초과'},
                        415: {'model': ErrorResponse, 'description': '지원하지 않는 이미지 형식'},
                        503: {'model': TryOnJob | ErrorResponse, 'description': '모델 미연결 또는 인증·임시 작업 공간 사용 불가'}})
async def create_job(background_tasks: BackgroundTasks,
                     person_image: Annotated[UploadFile, File(description='사용자 또는 마네킹 정면 PNG/JPEG/WEBP, 최대 8MiB')],
                     garment_image: Annotated[UploadFile, File(description='실제 상품 앞면 PNG/JPEG/WEBP, 최대 8MiB')],
                     category: Annotated[Category, Form()],
                     garment_back_image: Annotated[UploadFile | None, File(description='선택: 상품 뒷면. 현재 전면 추론에는 사용하지 않음')] = None,
                     user: User = Depends(get_current_user),
                     service: TryOnService = Depends(get_tryon_service)):
    """이미지당 1,200만 픽셀·한 변 8192px 이하·최소 64×64px, 단일 프레임.

    기본 어댑터는 모델 미연결이므로 유효한 요청에도 HTTP 503과
    status=model_unavailable, result_url=null을 반환합니다. 원본·뒷면 파일을
    별도 저장하지 않으며 업로드 임시 파일을 항상 닫습니다. 작업은 본인만
    조회 가능하고 15분 후/서버 재시작 시 소멸합니다. MVP는 API 단일 worker 전용입니다.
    """
    uploads = [image for image in (person_image, garment_image, garment_back_image) if image is not None]
    try:
        person = await read_image(person_image)
        garment = await read_image(garment_image)
        if garment_back_image is not None:
            await read_image(garment_back_image)
        job = service.create(user.id, category, garment_back_image is not None)
        if job.status == JobStatus.queued:
            background_tasks.add_task(service.execute, job.job_id,
                                      InferenceInput(person.data, garment.data, category))
        return JSONResponse(status_code=503 if job.status == JobStatus.model_unavailable else 202,
                            content=jsonable_encoder(job), headers={'Cache-Control': 'no-store'})
    finally:
        await asyncio.gather(*(image.close() for image in uploads), return_exceptions=True)


@router.get('/jobs/{job_id}', response_model=TryOnJob, summary='본인 2D 피팅 작업 상태',
            responses={404: {'model': ErrorResponse, 'description': '본인 작업 아님·없음·만료'}})
def get_job(job_id: UUID, response: Response, user: User = Depends(get_current_user),
            service: TryOnService = Depends(get_tryon_service)):
    response.headers['Cache-Control'] = 'no-store'
    return service.get(job_id, user.id)


@router.get('/jobs/{job_id}/result', summary='완료된 본인 AI 착용 이미지 조회',
            responses={200: {'content': {'image/png': {}, 'image/jpeg': {}, 'image/webp': {}}, 'description': '실제 추론이 완료된 이미지'},
                       404: {'model': ErrorResponse, 'description': '본인 작업 아님·없음·만료'},
                       409: {'model': ErrorResponse, 'description': '생성 결과 없음'}})
def get_result(job_id: UUID, user: User = Depends(get_current_user),
               service: TryOnService = Depends(get_tryon_service)):
    image = service.result(job_id, user.id)
    return Response(image.data, media_type=image.media_type,
                    headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
