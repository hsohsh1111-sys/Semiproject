# ONFIT

### AI 기반 개인 맞춤형 코디 추천과 가상 피팅 서비스

체형과 스타일 취향을 반영한 코디를 확인하고, 옷장 관리와 가격 비교까지 한곳에서 경험하는 패션 플랫폼입니다.

## 서비스 소개

ONFIT은 사용자의 스타일 프로필과 체형 정보를 바탕으로 패션 탐색과 구매 결정을 돕는 웹 서비스입니다. 코디 추천, 디지털 옷장, 상품 가격 비교, 가격 흐름 분석, 3D 가상 피팅과 이미지 기반 AI 패션 검색 기능을 제공합니다.

## 주요 기능

- **스타일 프로필** — 취향과 체형 정보를 입력해 개인화 추천의 기반을 설정합니다.
- **코디 추천** — 상황과 계절에 맞는 코디를 탐색하고 저장합니다.
- **디지털 옷장** — 보유 의류를 관리하고 코디에 활용합니다.
- **가격 비교와 분석** — 상품별 판매 가격을 비교하고 가격 흐름과 구매 시점을 확인합니다.
- **3D 가상 피팅** — 체형 정보를 반영한 아바타와 의류 모델을 확인합니다.
- **AI 패션 검색** — 이미지에서 관심 영역을 선택해 유사한 패션 상품을 찾습니다.
- **계정 관리** — 회원가입과 로그인을 통해 프로필과 저장 정보를 관리합니다.

상품과 가격 데이터는 데이터베이스 및 외부 연동 설정에 따라 달라질 수 있습니다. 실제 판매처 데이터가 연결되지 않은 환경에서는 일부 화면에 예시 데이터가 표시될 수 있습니다.

로그인하지 않아도 시즌 코디 상품을 찜하고 가격 인사이트에서 찜한 시점의 가격을 확인할 수 있습니다. 비로그인 찜 목록은 현재 브라우저에 저장되며 로그인 계정과 자동으로 동기화되지 않습니다. 실제 가격 추이와 구매 적기 분석에는 별도의 가격 수집 연동이 필요합니다.
가격 인사이트의 지난 1년 차트는 선택한 상품의 찜할 때 저장된 가격을 기준으로 상품별 패턴을 임의 생성한 시연용 데이터이며, 실제 가격 이력이나 계절별 변동이 아닙니다.

## 기술 스택

| 구분 | 기술 | 역할 |
| --- | --- | --- |
| 웹 프론트엔드 | React, Vite, Tailwind CSS | ONFIT 화면과 사용자 상호작용 |
| AI 패션 화면 | React, Vite | 이미지 선택 및 패션 검색 화면 |
| 백엔드 API | Python, FastAPI, SQLAlchemy | 인증, 스타일 추천, 피팅, 상품 및 가격 정보 제공 |
| 데이터베이스 | TiDB Cloud, MySQL 호환 드라이버 | 계정과 서비스 데이터 저장 |
| 3D 그래픽 | Three.js, React Three Fiber | 아바타 및 의류 가상 피팅 |
| 배포 | Render | 정적 웹사이트, API 서버, 가격 갱신 작업 |

## 로컬 실행

### 준비물

- Node.js와 npm
- Python 3.11 이상
- TiDB Cloud 데이터베이스와 접속 정보 (데이터베이스 연동 기능을 사용하는 경우)

### 환경 변수 설정

저장소 루트의 `.env.example`을 참고해 `.env`를 설정합니다. 기존 `.env` 파일이 있으면 보존하고 필요한 항목만 수정하세요.

```dotenv
TIDB_HOST=
TIDB_PORT=4000
TIDB_USERNAME=
TIDB_PASSWORD=
TIDB_DATABASE=
SECRET_KEY=
```

`DATABASE_URL`을 사용하는 경우에는 다섯 개의 `TIDB_*` 항목 대신 연결 문자열을 설정할 수 있습니다. `SECRET_KEY`에는 충분히 긴 임의의 값을 사용하세요. 데이터베이스 연결이 필요하지 않은 화면 개발은 TiDB 항목을 비워둔 채 진행할 수 있습니다.

### 설치 및 시작 (Windows PowerShell)

저장소 루트에서 실행합니다.

```powershell
npm ci --prefix frontend
npm ci --prefix ai-fashion
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

.\Start-ONFIT.ps1
```

시작 스크립트는 ONFIT 프론트엔드, FastAPI 백엔드, AI 패션 화면을 로컬에서 실행합니다. 스크립트가 실행 중인 터미널을 닫으면 스크립트가 시작한 서버도 종료됩니다.

| 화면 | 주소 |
| --- | --- |
| ONFIT | [http://127.0.0.1:5173/](http://127.0.0.1:5173/) |
| 3D 피팅 | [http://127.0.0.1:5173/#/fitting](http://127.0.0.1:5173/#/fitting) |
| AI 패션 검색 | [http://127.0.0.1:5173/ai-fashion/](http://127.0.0.1:5173/ai-fashion/) |
| AI 패션 화면 직접 접속 | [http://127.0.0.1:5174/ai-fashion/](http://127.0.0.1:5174/ai-fashion/) |
| API 문서 | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |
| API 상태 확인 | [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) |

개별 프론트엔드 개발 서버는 각 프로젝트 폴더에서 `npm run dev`로 실행합니다. 프론트엔드 배포용 빌드는 `npm run build --prefix frontend`, 통합 사이트 배포 파일은 다음 명령으로 생성합니다.

```powershell
npm run build:site --prefix frontend
```

## 배포

저장소의 [`render.yaml`](./render.yaml)에 Render 서비스 구성이 있습니다.

- **정적 웹 서비스** — 프론트엔드와 AI 패션 화면을 빌드해 배포합니다.
- **웹 서비스** — FastAPI를 실행하고 `/health` 경로로 상태를 확인합니다.
- **예약 작업** — 설정된 일정에 따라 가격 갱신 작업을 실행합니다.

Render 대시보드에서 서비스에 맞는 `DATABASE_URL` 또는 TiDB 접속 정보, `FRONTEND_ORIGINS`, 프론트엔드의 `VITE_API_BASE_URL` 등을 설정해야 합니다. 배포 주소는 Render에서 서비스를 생성한 뒤 확인할 수 있습니다.

## 프로젝트 구조

```text
Semiproject/
├── frontend/                 # 메인 React 웹사이트, 페이지, 3D 피팅
├── ai-fashion/               # 이미지 기반 AI 패션 검색 화면
├── backend/
│   ├── app/api/              # API 라우터
│   ├── app/features/         # 인증, 스타일링, 피팅, 인바디, 이미지 검색
│   ├── app/services/         # 추천 및 외부 서비스 연동
│   └── requirements.txt
├── assets/                   # 피팅용 모델 및 관련 에셋
├── database/                 # 데이터베이스 스키마와 시드 자료
├── docs/                     # 프로젝트 문서
├── scripts/                  # 빌드 및 개발 스크립트
├── Start-ONFIT.ps1           # 로컬 통합 실행 스크립트
└── render.yaml               # Render 배포 구성
```

## 팀 구성

| 이름 | 담당 업무 |
| --- | --- |
| 성승건 | 회원·프로필, 개인 맞춤 코디, 인바디, 3D 피팅 및 관련 프론트엔드·백엔드 |
| 황상옥 | 공통 웹 화면 및 사용자 인터페이스 |
| 안종범 | 상품 크롤링, 동일 상품 매칭, 가격 비교 |
| 이승호 | 가격 이력, 구매 타이밍 분석, 가격 수집 자동화 |

## 보안 및 데이터

- `.env`, `backend/.env`, `frontend/.env.local`은 개인 환경 설정용이며 Git 저장소에 올리지 않습니다.
- `VITE_*` 변수는 브라우저 코드에 포함될 수 있으므로 비밀 키나 데이터베이스 비밀번호를 넣지 마세요.
- API 키와 배포용 비밀 값은 로컬 환경 변수 또는 Render 환경 변수로 관리하세요.

## EC2 배포

Ubuntu EC2에 Docker Compose로 프런트엔드와 FastAPI를 배포하는 절차는 [`deploy/ec2/README.md`](deploy/ec2/README.md)를 참고하세요. GitHub 저장소에 EC2 접속 Secrets를 등록하면 `main` 업데이트 때 자동 배포하는 workflow도 포함되어 있습니다.
