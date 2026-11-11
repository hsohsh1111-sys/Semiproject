from io import BytesIO

import pytest
from PIL import Image
import pytesseract

from app.features.inbody import extraction
from tests.test_inbody import inbody_client
from tests.test_auth import client

URL = "/api/inbody/extract"
TEXT = "Height (cm): 175.25\nWeight (kg): 70\nSkeletal Muscle Mass (kg): 30.12\nPercent Body Fat (%): 20.5"


def pdf_bytes(text=TEXT):
    # Small synthetic PDF fixture; never a real user's report.
    lines = text.splitlines()
    commands = "BT /F1 12 Tf 30 750 Td " + " 0 -20 Td ".join(
        "(" + line.replace("(", r"\(").replace(")", r"\)") + ") Tj" for line in lines) + " ET"
    stream = commands.encode("ascii")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>",
               b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
               b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
    data = b"%PDF-1.4\n"
    offsets = []
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{number} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(data)
    data += b"xref\n0 6\n0000000000 65535 f \n"
    data += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    return data + f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF".encode()


def image_bytes(fmt="PNG"):
    output = BytesIO()
    with Image.new("RGB", (100, 100), "white") as image:
        image.save(output, format=fmt)
    return output.getvalue()


def upload(c, headers, content, filename="report.pdf", content_type="application/pdf"):
    return c.post(URL, headers=headers, files={"file": (filename, content, content_type)})


def test_real_pdf_preview_without_saving(inbody_client):
    c, headers = inbody_client
    result = upload(c, headers, pdf_bytes())
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["method"] == "pdf_text"
    assert body["values"] == {"height_cm": 175.25, "weight_kg": 70,
                              "skeletal_muscle_kg": 30.12, "body_fat_pct": 20.5, "measured_at": None}
    assert body["requires_confirmation"] is True
    assert "raw_text" not in body and "report.pdf" not in result.text
    assert c.get("/api/inbody/records", headers=headers).json() == []


def test_korean_labels_and_ambiguity():
    parsed = extraction.parse_measurements("신장(cm): 175\n체중 70 kg\n골격근량(kg) 30\n체지방률 20 %", "image_ocr")
    assert parsed.values.weight_kg == 70
    assert parsed.values.height_cm == 175
    assert parsed.values.skeletal_muscle_kg == 30
    assert parsed.values.body_fat_pct == 20
    ambiguous = extraction.parse_measurements("Weight: 70\nWeight: 80\nHeight: 175 (160-180)\nPBF: 101", "pdf_text")
    assert ambiguous.values.weight_kg is None
    assert ambiguous.values.height_cm is None
    assert ambiguous.values.body_fat_pct is None
    invalid = extraction.parse_measurements("Weight: 50\nSMM: 60", "pdf_text")
    assert invalid.values.skeletal_muscle_kg is None


def test_local_ocr_paths_do_not_require_quoted_windows_arguments(monkeypatch):
    import os
    monkeypatch.setattr(extraction.settings, 'tesseract_cmd', 'C:/OCR/tesseract.exe')
    monkeypatch.setattr(extraction.settings, 'tesseract_data_dir', 'C:/User Data/tessdata')
    monkeypatch.setattr(pytesseract.pytesseract, 'tesseract_cmd', 'tesseract')
    monkeypatch.delenv('TESSDATA_PREFIX', raising=False)
    assert extraction.tesseract_config() == ''
    assert pytesseract.pytesseract.tesseract_cmd == 'C:/OCR/tesseract.exe'
    assert os.environ['TESSDATA_PREFIX'] == 'C:/User Data/tessdata'


def test_multiple_labeled_cells_spaced_korean_and_split_value():
    text = '신 장 (cm): 175.25 | 체 중 (kg): 70\n골 격 근 량 (kg)\n30.12\n체 지 방 률 (%) 20.5'
    values = extraction.parse_measurements(text, 'image_ocr').values
    assert values.height_cm == 175.25
    assert values.weight_kg == 70
    assert values.skeletal_muscle_kg == 30.12
    assert values.body_fat_pct == 20.5


@pytest.mark.parametrize('text', [
    '체중 70 60 80', '체중 70 (60-80)', '목표체중 60',
    '체중\n정상범위 60-80\n70', '체중: 70\n체중: 80',
])
def test_reference_history_and_ambiguous_numbers_are_not_guessed(text):
    assert extraction.parse_measurements(text, 'image_ocr').values.weight_kg is None


@pytest.mark.parametrize("fmt", ["PNG", "JPEG"])
def test_image_ocr_contract(inbody_client, monkeypatch, fmt):
    c, headers = inbody_client
    def fake_ocr(image, **kwargs):
        assert kwargs == {"lang": "kor+eng", "timeout": 20, "config": extraction.tesseract_config()}
        return TEXT
    monkeypatch.setattr(pytesseract, "image_to_string", fake_ocr)
    result = upload(c, headers, image_bytes(fmt), "image", "application/octet-stream")
    assert result.status_code == 200
    assert result.json()["method"] == "image_ocr"
    assert result.json()["values"]["weight_kg"] == 70


def test_scanned_pdf_uses_ocr(inbody_client, monkeypatch):
    c, headers = inbody_client
    monkeypatch.setattr(pytesseract, "image_to_string", lambda *args, **kwargs: TEXT)
    result = upload(c, headers, pdf_bytes(""))
    assert result.status_code == 200
    assert result.json()["method"] == "pdf_ocr"


@pytest.mark.parametrize("error,status", [
    (pytesseract.TesseractNotFoundError(), 503),
    (pytesseract.TesseractError(1, "internal secret path"), 503),
    (RuntimeError("timeout"), 422),
])
def test_ocr_errors_are_explicit(inbody_client, monkeypatch, error, status):
    c, headers = inbody_client
    def fail(*args, **kwargs):
        raise error
    monkeypatch.setattr(pytesseract, "image_to_string", fail)
    result = upload(c, headers, image_bytes())
    assert result.status_code == status
    assert "internal secret path" not in result.text


@pytest.mark.parametrize("data,status", [(b"", 422), (b"not a PDF", 415),
                                         (b"%PDF-1.4 broken", 422), (b"\x89PNG\r\n\x1a\nbroken", 422)])
def test_reject_invalid_files(inbody_client, data, status):
    c, headers = inbody_client
    assert upload(c, headers, data).status_code == status


def test_limits(inbody_client, monkeypatch):
    c, headers = inbody_client
    monkeypatch.setattr(extraction, "MAX_FILE_BYTES", 20)
    assert upload(c, headers, b"x" * 21).status_code == 413
    monkeypatch.setattr(extraction, "MAX_FILE_BYTES", 10 * 1024 * 1024)
    monkeypatch.setattr(extraction, "MAX_PIXELS", 100)
    assert upload(c, headers, image_bytes()).status_code == 413
    assert upload(c, headers, pdf_bytes("")).status_code == 413
    monkeypatch.setattr(extraction, "MAX_PAGES", 0)
    assert upload(c, headers, pdf_bytes()).status_code == 413


def test_auth_empty_preview_and_swagger(inbody_client):
    c, headers = inbody_client
    assert upload(c, {}, pdf_bytes()).status_code == 401
    assert c.post(URL, headers=headers).status_code == 422
    result = upload(c, headers, pdf_bytes("Unrelated document"))
    assert result.status_code == 200
    assert all(value is None for value in result.json()["values"].values())
    operation = c.get("/openapi.json").json()["paths"][URL]["post"]
    assert operation["security"] == [{"BearerAuth": []}]
    assert "multipart/form-data" in operation["requestBody"]["content"]
