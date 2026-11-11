# ONFIT

### AI 기반 개인 맞춤형 코디 추천과 가상 피팅 서비스

체형과 스타일 취향을 반영한 코디를 확인하고, 옷장 관리와 가격 비교까지 한곳에서 경험하는 패션 플랫폼입니다.

## 서비스 소개

ONFIT은 사용자의 스타일 프로필과 체형 정보를 바탕으로 패션 탐색과 구매 결정을 돕는 웹 서비스입니다. 코디 추천, 디지털 옷장, 상품 가격 비교, 가격 흐름 분석, 3D 가상 피팅과 이미지 기반 AI 패션 검색 기능을 제공합니다.

## 주요 기능

- **스타일 프로필** — 취향과 체형 정보를 입력해 개인화된 추천의 기반을 설정합니다.
- **코디 추천** — 상황과 계절에 맞는 코디를 탐색하고 저장합니다.
- **디지털 옷장** — 보유 의류를 관리하고 코디에 활용합니다.
- **가격 비교와 분석** — 상품별 판매 가격을 비교하고 가격 흐름 및 구매 시점을 확인합니다.
- **3D 가상 피팅** — 체형 정보를 반영한 아바타와 의류 모델을 확인합니다.
- **AI 패션 검색** — 이미지에서 관심 영역을 선택해 유사한 패션 상품을 찾습니다.
- **계정 관리** — 회원 가입과 로그인을 통해 프로필과 저장 정보를 관리합니다.

상품과 가격 데이터는 데이터베이스 및 외부 연동 설정에 따라 달라질 수 있습니다. 실제 판매처 데이터가 연결되지 않은 환경에서는 일부 화면이 예시 데이터를 표시할 수 있습니다.

## 기술 스택

| 구분          | 기술                            | 역할                                   |
| ------------- | ------------------------------- | -------------------------------------- |
| 웹 프론트엔드 | React, Vite, Tailwind CSS       | ONFIT 화면과 사용자 인터랙션           |
| AI 패션 화면  | React, Vite                     | 이미지 선택 및 패션 검색 인터페이스    |
| 백엔드 API    | Python, FastAPI, SQLAlchemy     | 인증, 스타일링, 피팅, 상품 및 가격 API |
| 데이터베이스  | TiDB Cloud, MySQL 호환 드라이버 | 계정과 서비스 데이터 저장              |
| 3D 그래픽     | Three.js, React Three Fiber     | 아바타 및 의류 가상 피팅               |
| 배포          | Render                          | 정적 프론트엔드, API, 가격 갱신 작업   |

## 로컬 실행

### 준비물

- Node.js와 npm
- Python 3.11 이상
- TiDB Cloud 데이터베이스와 접속 정보 (데이터베이스 연동 기능을 사용할 경우)

### 환경 변수 설정

프로젝트 루트의 `.env.example`을 참고해 `.env`를 설정합니다. 이미 `.env` 파일이 있다면 기존 파일을 보존하고 필요한 항목만 확인하세요.

```env
TIDB_HOST=
TIDB_PORT=4000
TIDB_USERNAME=
TIDB_PASSWORD=
TIDB_DATABASE=
SECRET_KEY=
```

`DATABASE_URL`을 사용하는 경우에는 다섯 개의 `TIDB_*` 항목 대신 연결 문자열을 설정할 수 있습니다. `SECRET_KEY`에는 충분히 긴 임의의 값을 사용하세요. 실제 비밀번호와 키는 저장소에 커밋하지 마세요.

### 설치 및 시작 (Windows PowerShell)

저장소 루트에서 아래 명령을 실행합니다.

```powershell
npm ci --prefix frontend
npm ci --prefix ai-fashion
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\Start-ONFIT.ps1
```

시작 스크립트는 프론트엔드, FastAPI 백엔드, AI 패션 화면을 로컬에서 실행합니다.

| 화면                   | 주소                              |
| ---------------------- | --------------------------------- |
| ONFIT                  | http://127.0.0.1:5173/            |
| AI 패션 검색           | http://127.0.0.1:5173/ai-fashion/ |
| AI 패션 화면 직접 접속 | http://127.0.0.1:5174/ai-fashion/ |
| API 문서               | http://127.0.0.1:8000/docs        |
| API 상태 확인          | http://127.0.0.1:8000/health      |

개별 프론트엔드 작업은 `frontend` 폴더에서 `npm run dev`, 프로덕션 빌드는 `npm run build`로 실행합니다. 통합 사이트 배포용 정적 파일은 다음 명령으로 생성합니다.

```powershell
npm run build:site --prefix frontend
```

## 배포

저장소의 [`render.yaml`](render.yaml)에 Render 서비스 구성이 있습니다.

### 배포 페이지

| 플랫폼 | 주소 |
| --- | --- |
| GitHub Pages | [ONFIT 페이지 열기](https://hsohsh1111-sys.github.io/Semiproject/) |
| Netlify | [ONFIT 페이지 열기](https://onfit3.netlify.app/) |

- **정적 웹 서비스** — 프론트엔드와 AI 패션 화면을 빌드해 배포합니다.
- **웹 서비스** — FastAPI를 실행하고 `/health` 경로로 상태를 확인합니다.
- **Cron 작업** — 설정된 일정에 따라 가격 갱신 작업을 실행합니다.

Render 대시보드에서 `DATABASE_URL` 또는 TiDB 접속 정보, `FRONTEND_ORIGINS`, 프론트엔드의 `VITE_API_BASE_URL` 등 환경 변수를 서비스에 맞게 설정해야 합니다. 배포 주소는 Render에서 서비스를 생성한 뒤 확인할 수 있습니다.

## 프로젝트 구조

```text
Semiproject/
├── frontend/                # 메인 React 웹앱, 페이지, 3D 피팅
├── ai-fashion/              # 이미지 기반 AI 패션 검색 UI
├── backend/
│   ├── app/api/              # API 라우터와 핵심 서비스
│   ├── app/features/         # 인증, 스타일링, 피팅, 인바디, 이미지 검색
│   └── requirements.txt
├── assets/                   # 피팅용 모델 및 관련 에셋
├── database/                 # 데이터베이스 자료
├── docs/                     # 프로젝트 문서
├── scripts/                  # 빌드 및 개발 스크립트
├── Start-ONFIT.ps1           # 로컬 통합 실행 스크립트
└── render.yaml               # Render 배포 구성
```

## 팀 구성

| 이름   | 담당 업무                                                                |
| ------ | ------------------------------------------------------------------------ |
| 송성근 | 회원·프로필, 개인 맞춤 코디, 인바디, 3D 피팅 및 관련 프론트엔드·백엔드 |
| 황상옥 | 공통 프론트엔드 및 UI                                                    |
| 안종범 | 상품 크롤링, 동일 상품 매칭, 가격 비교, 카메라연동 백엔드 구축           |
| 이승호 | 가격 이력, 구매 타이밍 분석, 가격 수집 자동화                            |

## 보안 및 데이터

- `.env`, `backend/.env`, `frontend/.env.local`은 개인 환경 설정용이며 Git에 올리지 않습니다.
- `VITE_*` 변수는 브라우저에 포함될 수 있으므로 비밀 키나 데이터베이스 비밀번호를 넣지 마세요.
- API 키와 배포용 비밀 값은 로컬 환경 변수 또는 Render 환경 변수로 관리하세요.
