from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.features.tryon2d.adapter import InferenceInput, TryOnAdapter, UnconnectedAdapter
from app.features.tryon2d.images import ValidatedImage, validate_image
from app.features.tryon2d.schemas import Category, JobError, JobStatus, TryOnJob


@dataclass
class StoredJob:
    owner: int
    public: TryOnJob
    expires: float
    image: ValidatedImage | None = None


class TryOnService:
    """Bounded process-local MVP store; no DB writes or uploaded files on disk.

    Use one API worker for this MVP. Replace the store/dispatcher explicitly when
    integrating a separate GPU process or deploying multiple API workers.
    """
    def __init__(self, adapter: TryOnAdapter | None = None, clock=monotonic):
        self.adapter = adapter or UnconnectedAdapter()
        self.clock = clock
        self.jobs: dict[UUID, StoredJob] = {}
        self.lock = Lock()

    def _prune(self):
        for key in [key for key, value in self.jobs.items() if value.expires <= self.clock()]:
            del self.jobs[key]

    def create(self, owner: int, category: Category, back_image_provided: bool) -> TryOnJob:
        now = datetime.now(timezone.utc)
        ready = self.adapter.connected
        job = TryOnJob(job_id=uuid4(), category=category, created_at=now, updated_at=now,
                       back_image_provided=back_image_provided,
                       status=JobStatus.queued if ready else JobStatus.model_unavailable,
                       error=None if ready else JobError(code='model_not_connected', message='모델 미연결: GPU 추론 환경이 준비되지 않았습니다.'))
        with self.lock:
            self._prune()
            if len(self.jobs) >= 32:
                raise HTTPException(503, '임시 작업 공간이 가득 찼습니다. 잠시 후 다시 요청하세요.')
            self.jobs[job.job_id] = StoredJob(owner, job, self.clock() + 900)
        return job.model_copy(deep=True)

    def get(self, job_id: UUID, owner: int) -> TryOnJob:
        with self.lock:
            self._prune()
            stored = self.jobs.get(job_id)
            if stored is None or stored.owner != owner:
                raise HTTPException(404, '작업을 찾을 수 없거나 만료되었습니다.')
            return stored.public.model_copy(deep=True)

    def result(self, job_id: UUID, owner: int) -> ValidatedImage:
        self.get(job_id, owner)
        with self.lock:
            stored = self.jobs.get(job_id)
            if not stored or not stored.image:
                raise HTTPException(409, '생성된 AI 착용 결과가 없습니다.')
            return stored.image

    def _update(self, job_id, status, *, error=None, image=None):
        with self.lock:
            self._prune()
            stored = self.jobs.get(job_id)
            if stored is None:
                return
            stored.image = image
            stored.public = stored.public.model_copy(update={
                'status': status, 'error': error, 'updated_at': datetime.now(timezone.utc),
                'result_url': f'/api/tryon2d/jobs/{job_id}/result' if image else None,
            })

    def execute(self, job_id: UUID, inputs: InferenceInput):
        self._update(job_id, JobStatus.processing)
        try:
            output = self.adapter.infer(inputs)
            if output.error_code:
                disconnected = output.error_code == 'model_not_connected'
                self._update(job_id, JobStatus.model_unavailable if disconnected else JobStatus.failed,
                             error=JobError(code='model_not_connected' if disconnected else 'inference_failed',
                                            message='모델 미연결' if disconnected else '추론에 실패했습니다.'))
                return
            image = validate_image(output.image)
            self._update(job_id, JobStatus.succeeded, image=image)
        except Exception:
            # Never expose image bytes, model stack traces, filenames or paths.
            self._update(job_id, JobStatus.failed,
                         error=JobError(code='inference_failed', message='추론 처리 중 오류가 발생했습니다.'))


_service = TryOnService()


def get_tryon_service() -> TryOnService:
    return _service
