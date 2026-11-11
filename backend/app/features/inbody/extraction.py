"""Conservative previews only: never persist documents or infer unlabeled values.

OCR requires Tesseract on PATH with kor and eng traineddata installed.
PDFium calls are serialized because PDFium is not thread-safe.
"""
from contextlib import closing
from io import BytesIO
import os
import re
from threading import Lock
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
import pypdfium2 as pdfium
import pytesseract

from app.features.inbody.schemas import ExtractionPreview, ExtractedValues
from app.core.config import settings

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 12_000_000
MAX_PAGES = 3
MAX_TEXT = 100_000
PDF_LOCK = Lock()

# Match explicitly labeled values; still reject ranges and multiple candidates.
LABELS = {
    "height_cm": (r"키|신장|Height", r"cm", 100, 230),
    "weight_kg": (r"체중|Weight", r"kg", 20, 300),
    "skeletal_muscle_kg": (r"골격근량|Skeletal\s+Muscle\s+Mass|SMM", r"kg", 0.01, 300),
    "body_fat_pct": (r"체지방률|Percent\s+Body\s+Fat|PBF", r"%", 0, 100),
}


def parse_measurements(text: str, method: str) -> ExtractionPreview:
    # Join split Korean labels without changing numeric tokens.
    for label in ['골격근량', '체지방률', '신장', '체중']:
        text = re.sub(r'[ \t]*'.join(label), label, text)
    all_labels = '|'.join(f'(?:{item[0]})' for item in LABELS.values())
    # Separate multiple labeled cells on a single OCR line. Match whole labels,
    # not substrings in phrases such as 목표체중 or Skeletal Muscle Mass history.
    label_start = re.compile(rf'(?<![A-Za-z가-힣])(?:{all_labels})(?![A-Za-z가-힣])', re.I)
    cells = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        matches = list(label_start.finditer(line))
        for position, match in enumerate(matches):
            end = matches[position + 1].start() if position + 1 < len(matches) else len(line)
            cell = line[match.start():end].strip(' \t|;')
            # A value immediately below an otherwise empty label is permitted.
            # No broad search into nearby graph/history/reference columns.
            if index + 1 < len(lines) and re.fullmatch(r'[ \t]*\d+(?:\.\d{1,2})?[ \t]*(?:cm|kg|%)?[ \t]*', lines[index + 1], re.I):
                if not re.search(r'\d', cell):
                    cell += ' ' + lines[index + 1].strip()
            cells.append(cell)
    values = {}
    messages = ["추출값을 원본과 대조하고 측정 시각을 직접 입력한 뒤 저장해 주세요."]
    for field, (label, unit, minimum, maximum) in LABELS.items():
        pattern = re.compile(
            rf"^[ \t]*(?:{label})[ \t]*(?:\([ \t]*{unit}[ \t]*\))?[ \t]*[:：]?[ \t]*"
            rf"(?P<number>\d+(?:\.\d{{1,2}})?)[ \t]*(?:{unit})?[ \t]*$", re.I
        )
        candidates = {float(match["number"]) for line in cells
                      if (match := pattern.fullmatch(line))}
        if len(candidates) == 1 and minimum <= next(iter(candidates)) <= maximum:
            values[field] = next(iter(candidates))
        else:
            values[field] = None
            messages.append(f"{field}: 누락·모호함·범위 초과로 직접 확인이 필요합니다.")
    if (values["weight_kg"] is not None and values["skeletal_muscle_kg"] is not None
            and values["skeletal_muscle_kg"] > values["weight_kg"]):
        values["skeletal_muscle_kg"] = None
        messages.append("골격근량이 체중보다 커서 추출값을 제외했습니다.")
    return ExtractionPreview(method=method, values=ExtractedValues(**values), warnings=messages)


def tesseract_config() -> str:
    """Optional local paths; Docker keeps the installed executable/data defaults."""
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
    if settings.tesseract_data_dir:
        # Environment inheritance avoids Windows pytesseract/shlex passing
        # quotation marks literally inside a --tessdata-dir argument.
        os.environ['TESSDATA_PREFIX'] = settings.tesseract_data_dir
    return ''


def ocr_image(image: Image.Image) -> str:
    try:
        # No external API: the engine works locally; its temporary files are cleaned by pytesseract.
        return pytesseract.image_to_string(image, lang="kor+eng", timeout=20, config=tesseract_config())
    except pytesseract.TesseractNotFoundError:
        raise HTTPException(503, "OCR 엔진이 준비되지 않았습니다. Tesseract와 kor/eng 언어 데이터가 필요합니다.") from None
    except pytesseract.TesseractError:
        raise HTTPException(503, "OCR 실행에 실패했습니다. 엔진과 kor/eng 언어 데이터를 확인해 주세요.") from None
    except RuntimeError:
        raise HTTPException(422, "OCR 처리 시간을 초과했습니다. 선명한 단일 페이지로 다시 시도해 주세요.") from None


def image_text(data: bytes) -> str:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG"}:
                    raise HTTPException(415, "PNG 또는 JPEG 이미지만 지원합니다.")
                if source.width * source.height > MAX_PIXELS:
                    raise HTTPException(413, "이미지는 1,200만 픽셀 이하여야 합니다.")
                if getattr(source, "n_frames", 1) != 1:
                    raise HTTPException(415, "여러 프레임의 이미지는 지원하지 않습니다.")
                source.load()
                with ImageOps.exif_transpose(source) as oriented:
                    with oriented.convert("RGB") as rgb:
                        return ocr_image(rgb)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "이미지 해상도가 너무 큽니다.") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(422, "이미지 파일을 읽을 수 없습니다.") from None


def pdf_text(data: bytes) -> tuple[str, str]:
    with PDF_LOCK:
        try:
            with pdfium.PdfDocument(data) as document:
                if not 1 <= len(document) <= MAX_PAGES:
                    raise HTTPException(413, "PDF는 1~3페이지만 지원합니다.")
                parts = []
                used_ocr = False
                for index in range(len(document)):
                    with closing(document[index]) as page:
                        with closing(page.get_textpage()) as textpage:
                            if textpage.count_chars() > MAX_TEXT:
                                raise HTTPException(413, "PDF 텍스트가 너무 많습니다.")
                            text = textpage.get_text_range()
                        if not text.strip():
                            width, height = page.get_size()
                            if width <= 0 or height <= 0 or width * height * 4 > MAX_PIXELS:
                                raise HTTPException(413, "PDF 페이지 해상도가 너무 큽니다.")
                            with closing(page.render(scale=2)) as bitmap:
                                with bitmap.to_pil() as image:
                                    text = ocr_image(image)
                            used_ocr = True
                        parts.append(text)
                return "\n".join(parts), "pdf_ocr" if used_ocr else "pdf_text"
        except pdfium.PdfiumError:
            raise HTTPException(422, "PDF를 읽을 수 없습니다. 손상되었거나 암호로 보호된 파일인지 확인해 주세요.") from None


def extract_preview(data: bytes) -> ExtractionPreview:
    if not data:
        raise HTTPException(422, "빈 파일은 업로드할 수 없습니다.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "파일 크기는 10MiB 이하여야 합니다.")
    if data.startswith(b"%PDF-"):
        text, method = pdf_text(data)
    elif data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff"):
        text, method = image_text(data), "image_ocr"
    else:
        raise HTTPException(415, "PDF, PNG, JPEG 파일만 지원합니다.")
    if len(text) > MAX_TEXT:
        raise HTTPException(413, "추출된 텍스트가 너무 많습니다.")
    return parse_measurements(text, method)
