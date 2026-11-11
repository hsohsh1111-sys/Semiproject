"""Real-engine smoke check: synthetic text only, no DB or API credentials.

Run from backend: python scripts/verify_ocr.py
Executed during Docker build; no mocked OCR and no personal report stored.
"""
import json
from pathlib import Path
import shutil
import sys
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont
import pytesseract

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.features.inbody.extraction import extract_preview, tesseract_config


def verify():
    config = tesseract_config()
    if not shutil.which(pytesseract.pytesseract.tesseract_cmd):
        return {'status': 'failed', 'reason': 'tesseract_not_installed'}, 2
    try:
        languages = set(pytesseract.get_languages(config=config))
        missing = sorted({'kor', 'eng'} - languages)
        if missing:
            return {'status': 'failed', 'reason': 'missing_language_data', 'missing': missing}, 2
        expected = {'height_cm': 175.25, 'weight_kg': 70,
                    'skeletal_muscle_kg': 30.12, 'body_fat_pct': 20.5,
                    'measured_at': None}
        # Fixed fixture font installed by the Dockerfile.
        fonts = [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('C:/Windows/Fonts/arial.ttf')]
        font_path = next((path for path in fonts if path.is_file()), None)
        font = ImageFont.truetype(str(font_path), 36) if font_path else ImageFont.load_default(size=36)
        with Image.new('RGB', (1200, 320), 'white') as image:
            draw = ImageDraw.Draw(image)
            for index, text in enumerate([
                'Height (cm): 175.25', 'Weight (kg): 70',
                'Skeletal Muscle Mass (kg): 30.12', 'Percent Body Fat (%): 20.5',
            ]):
                draw.text((30, 20 + index * 70), text, fill='black', font=font)
            with BytesIO() as buffer:
                image.save(buffer, format='PNG')
                preview = extract_preview(buffer.getvalue())
        if preview.method != 'image_ocr' or preview.values.model_dump() != expected:
            return {'status': 'failed', 'reason': 'synthetic_measurements_mismatch'}, 2
        return {'status': 'passed', 'engine': 'tesseract', 'languages': ['eng', 'kor'],
                'synthetic_image_extraction': True, 'real_report_accuracy_verified': False}, 0
    except Exception as error:
        return {'status': 'failed', 'reason': 'ocr_check_failed', 'error_type': type(error).__name__}, 2


if __name__ == '__main__':
    result, code = verify()
    print(json.dumps(result))
    raise SystemExit(code)
