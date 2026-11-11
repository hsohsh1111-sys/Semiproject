from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class Category(str, Enum):
    tops = 'tops'
    bottoms = 'bottoms'
    one_pieces = 'one-pieces'


class JobStatus(str, Enum):
    queued = 'queued'
    processing = 'processing'
    succeeded = 'succeeded'
    failed = 'failed'
    model_unavailable = 'model_unavailable'


class JobError(BaseModel):
    code: str
    message: str


class TryOnJob(BaseModel):
    job_id: UUID
    status: JobStatus
    category: Category
    created_at: datetime
    updated_at: datetime
    back_image_provided: bool = False
    result_url: str | None = None
    error: JobError | None = None
    notice: str = '전면 피팅 요청입니다. 뒷면 이미지는 검증만 하며 현재 추론 입력에 사용하지 않습니다. 작업은 임시 메모리에 15분 보관하며 서버 재시작 시 사라집니다.'
