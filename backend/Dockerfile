FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_THREAD_LIMIT=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 onfit

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

# Explicit sources only: never bake .env, test accounts or uploads into images.
COPY app/ ./app/
COPY routers/ ./routers/
COPY services/ ./services/
COPY data/ ./data/
COPY scripts/verify_ocr.py ./scripts/verify_ocr.py

USER onfit
# Fail the image build if the engine, languages or synthetic recognition fail.
RUN python scripts/verify_ocr.py

EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]
