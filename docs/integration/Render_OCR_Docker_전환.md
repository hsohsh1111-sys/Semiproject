# Render 인바디 이미지 OCR 배포 준비

작성일: 2026-11-09

## 변경 범위

기존 이미지 업로드·수치 추출·확인 후 저장 API는 유지한다. Tesseract 실행 파일과 kor/eng 언어 데이터를 Docker 이미지에 설치한다. 운영 중인 Python 서비스와 기존 render.yaml은 이번에 변경하지 않는다. 새 Docker 서비스가 확인되기 전 기존 서비스를 삭제하지 않는다.

공식 근거: [Render Docker 배포](https://render.com/docs/docker), [Tesseract 엔진·언어 데이터 설치](https://tesseract-ocr.github.io/tessdoc/Installation.html).

## 추가 파일

- backend/Dockerfile: Python 3.12 Debian 기반. Tesseract·한글/영문 데이터·테스트 폰트 설치, Python 의존성 설치, 일반 사용자로 FastAPI 실행. Render PORT 환경변수 사용. Playwright 브라우저나 AI 모델은 설치하지 않는다.
- backend/.dockerignore: 로컬 .env·가상환경·캐시·업로드·키 파일 제외. Dockerfile도 소스 디렉터리만 명시적으로 복사하므로 실제 .env와 검증 계정 파일을 이미지에 포함하지 않는다. 비밀값은 실행 환경변수로 전달한다.
- backend/scripts/verify_ocr.py: 실제 엔진과 kor/eng 설치 확인 후 개인정보 없는 테스트 PNG를 생성해 기존 extract_preview로 네 수치를 추출한다. Docker 빌드 중 실행하며 실패하면 빌드를 중단한다. DB 접속·인바디 저장은 하지 않는다. 한글 라벨 파싱 테스트와 실제 한국어 결과지의 OCR 정확도는 별도 검증이다.
- deploy/render-ocr.yaml: 선택적으로 사용할 OCR API 단독 Blueprint. 기존 cron·프론트 서비스를 함께 만들지 않는다. 현재 저장소 루트 경로를 기준으로 하며 팀원 클론의 최상위 backend 구조에는 그대로 적용하면 안 된다.

## Render 적용 순서 — 아직 실행하지 않음

먼저 변경 파일을 별도 요청에 따라 커밋·푸시해야 Render가 읽을 수 있다. 현재 PC에는 Docker가 없어 로컬 컨테이너 빌드·실행은 검증하지 못했다. Render가 Docker를 빌드하므로 사용자 PC에 Docker를 반드시 설치할 필요는 없다.

1. New → Web Service에서 본인 저장소 tjdrms8353-spec/semiProject를 선택한다.
2. 새 서비스 이름 예: OnFit-ocr. 브랜치는 integration/team-develop-20261106, Language는 Docker, Region은 Singapore, Compute는 Free를 선택한다.
3. Root Directory는 비워 둔다. Dockerfile Path는 Semiproject-front/backend/Dockerfile, Docker Build Context는 Semiproject-front/backend로 지정한다. Docker Command는 비워서 Dockerfile CMD를 사용한다. Health Check Path는 /health.
4. 환경변수는 TIDB_HOST/PORT/USERNAME/PASSWORD/DATABASE, APP_ENV=production, FRONTEND_ORIGINS=https://onfit-web.onrender.com, SECRET_KEY를 설정한다. SECRET_KEY는 새로 Generate할 수 있으며 사용자는 재로그인해야 한다. TIDB 방식이면 DATABASE_URL은 추가하지 않는다. PYTHON_VERSION 대신 Dockerfile의 Python 버전을 사용한다. 실제 값은 채팅·Git에 넣지 않는다.
5. Deploy 후 빌드 로그에서 verify_ocr의 passed 및 synthetic_image_extraction=true, 이후 서버 /health 응답을 확인한다. 빌드 성공은 실제 인바디 결과지 정확도를 보장하지 않는다.
6. 새 주소에서 로그인·PNG/JPEG·스캔 PDF·잘못된 파일·사용자 확인·저장을 검증한다. 가급적 합성 샘플을 먼저 사용하며 사용자 문서는 권한을 확인한다.
7. 검증 후 OnFit-web의 VITE_API_BASE_URL을 새 주소/api로 바꾸고 프론트를 다시 빌드·배포한다. 별도 VITE_API_URL이 있다면 AI 패션이 이전 API를 보지 않도록 함께 확인한다.
8. 새 사이트의 로그인·DB·인바디·기존 3D 기능을 확인한 뒤 기존 Python 서비스 유지/중지/삭제를 사용자가 결정한다. 문제가 생기면 프론트 API 주소를 이전 값으로 되돌려 재배포할 수 있다.

Blueprint 방식을 선택하면 파일 경로 Semiproject-front/deploy/render-ocr.yaml을 지정한다. 수동 생성과 Blueprint 생성을 동시에 진행해 중복 서비스를 만들지 않는다.

## Docker가 있는 환경에서 직접 검증

저장소 루트에서:

```text
docker build -t onfit-api-ocr -f Semiproject-front/backend/Dockerfile Semiproject-front/backend
docker run --rm onfit-api-ocr python scripts/verify_ocr.py
docker run --rm -p 8001:8000 onfit-api-ocr
```

마지막 명령은 DB 설정 없이 /health까지만 확인하는 실행이다. 로그인·기록 API는 실제 환경변수를 안전하게 전달한 별도 검증이 필요하다. 기본 컨테이너 포트는 8000이며 Render에서는 PORT를 따른다.

## 운영 한계

OCR은 원본 이미지 품질·표 구성에 따라 오인식할 수 있어 자동 저장하지 않는다. 파일·픽셀·페이지 제한과 OCR 20초 제한은 유지한다. OMP_THREAD_LIMIT=1로 OCR 스레드를 제한하지만, 무료 512MB 환경의 동시 업로드 처리와 메모리 안정성은 실서버에서 확인해야 한다. 비용을 줄이기 위한 미검증 자동 확장 설정은 추가하지 않았다.
