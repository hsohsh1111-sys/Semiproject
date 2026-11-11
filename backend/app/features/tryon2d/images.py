from dataclasses import dataclass
from io import BytesIO
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 12_000_000
MAX_EDGE = 8192
FORMATS = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}


@dataclass(frozen=True)
class ValidatedImage:
    data: bytes
    media_type: str


def validate_image(data: bytes, declared_type: str | None = None) -> ValidatedImage:
    if not data:
        raise HTTPException(422, '빈 이미지 파일은 사용할 수 없습니다.')
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, '이미지 한 장은 8MiB 이하여야 합니다.')
    mime = (declared_type or '').split(';')[0].lower()
    if mime and mime not in {*FORMATS.values(), 'application/octet-stream'}:
        raise HTTPException(415, 'PNG, JPEG, WEBP 이미지만 지원합니다.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                actual = FORMATS.get(image.format)
                if not actual:
                    raise HTTPException(415, 'PNG, JPEG, WEBP 이미지만 지원합니다.')
                if mime in FORMATS.values() and mime != actual:
                    raise HTTPException(415, '선언된 파일 형식과 실제 이미지 형식이 다릅니다.')
                if image.width * image.height > MAX_PIXELS or max(image.size) > MAX_EDGE:
                    raise HTTPException(413, '이미지는 1,200만 픽셀, 한 변 8192픽셀 이하여야 합니다.')
                if min(image.size) < 64:
                    raise HTTPException(422, '이미지의 가로·세로는 각각 64픽셀 이상이어야 합니다.')
                if getattr(image, 'n_frames', 1) != 1:
                    raise HTTPException(415, '여러 프레임의 이미지는 지원하지 않습니다.')
                image.verify()
            # verify() alone does not decode every JPEG pixel.
            with Image.open(BytesIO(data)) as image:
                image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, '이미지 해상도가 너무 큽니다.') from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(422, '손상되었거나 읽을 수 없는 이미지입니다.') from None
    return ValidatedImage(data=data, media_type=actual)


async def read_image(upload: UploadFile) -> ValidatedImage:
    data = await upload.read(MAX_FILE_BYTES + 1)
    return await run_in_threadpool(validate_image, data, upload.content_type)
