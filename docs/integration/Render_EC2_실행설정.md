# Render·EC2 실행 설정 준비

실제 배포 전 참고할 설정이다. 이번 작업은 파일 준비만 했으며 외부 서버·서비스는 변경하지 않았다. 로컬 브라우저 육안 검증도 아직 남아 있다.

## Render

저장소 루트가 `semiProject`인 현재 구조를 기준으로 `Semiproject-front/render.yaml`을 Blueprint 파일로 지정한다. 내부 rootDir는 저장소 루트 기준이다.

1. API의 `DATABASE_URL`과 `FRONTEND_ORIGINS`를 실제 배포 환경에 입력한다. URL에는 TLS 검증 옵션을 유지하고 비밀번호의 특수문자를 URL 인코딩한다. `SECRET_KEY`는 새 생성값을 사용한다.
2. API가 배포되어 실제 주소가 정해지면 프론트의 `VITE_API_BASE_URL`에 `https://실제-API-주소/api`를 입력한다. 예시 도메인을 실제 주소로 간주하지 않는다.
3. `npm ci && npm --prefix ../ai-fashion ci && npm run build:site`가 두 프론트를 빌드한다. 같은 빌드 환경의 API 주소가 두 앱에 전달된다. `VITE_API_URL`을 별도로 설정했다면 AI 패션에서 우선하므로 잘못된 이전 주소를 남기지 않는다.
4. 프론트 실제 HTTPS 주소를 API의 `FRONTEND_ORIGINS`에 등록한다. 환경변수 변경 후 API 재시작·프론트 재빌드가 필요한 항목을 구분한다.
5. Blueprint에는 가격 수집 cron도 포함돼 있다. 현재 실행기는 수집하지 않고 로그만 남긴다. 전체 Blueprint를 적용하기 전 해당 서비스 생성 여부·요금 조건은 별도로 검토한다. 이번에는 cron을 실행하거나 수정하지 않았다.

`sync: false`는 생성 시 직접 입력하는 설정이다. 기존 서비스가 있다면 Dashboard 값이 원하는 실제 주소인지 별도로 확인해야 한다. [Render Blueprint 문서](https://render.com/docs/blueprint-spec)

## EC2 설정 예제

Linux 경로는 `/srv/onfit`에 저장소를 배치하고 전용 `onfit` 계정을 사용하는 예제다. 현재 Windows 경로를 그대로 서버 경로로 사용하지 않는다.

- `deploy/ec2/onfit-api.service.example`: 가상환경의 FastAPI를 127.0.0.1:8000에서 실행. `--reload`를 사용하지 않는다.
- `deploy/ec2/nginx.conf.example`: 빌드 결과 정적 제공, `/api`·`/health` 전달, `/models`·`/textures`·`/ai-fashion` 제공. 원래 `/api` 경로가 유지되도록 proxy_pass에 URI suffix를 붙이지 않았다. [Nginx 공식 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
- 비밀 설정 파일 `/etc/onfit/backend.env`는 별도 생성한다. 실제 값은 저장소에 넣지 않는다. 서비스 계정과 파일 읽기 권한, 프론트 dist의 Nginx 읽기 권한이 필요하다.
- Windows `.venv`·`node_modules`를 복사하지 않고 Linux에서 의존성을 설치한다.
- 같은 도메인으로 API를 전달할 때 프론트 빌드는 `VITE_API_BASE_URL=/api`, `VITE_API_URL`은 비운다. 기존 frontend/.env.local 등에 다른 주소가 없는지도 확인한다.

Linux에서 준비 후 실행할 명령 예시:

```bash
# /srv/onfit/Semiproject-front/backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

# /srv/onfit/Semiproject-front/frontend
VITE_API_BASE_URL=/api VITE_API_URL= npm ci
npm --prefix ../ai-fashion ci
VITE_API_BASE_URL=/api VITE_API_URL= npm run build:site
```

예제 파일을 서버에 설치한 뒤에는 `nginx -t`, `systemd-analyze verify`, 서비스 시작 로그와 `/health` 응답을 실제 Linux 환경에서 확인해야 한다. 이 검사는 아직 실행하지 않았다. 기존 서버 설정을 자동 덮어쓰는 스크립트는 제공하지 않는다.

Nginx 예제는 HTTP 연결 확인용이다. 공개 로그인·인바디 업로드 전 HTTPS 및 실제 도메인 설정이 필요하다. TLS 인증서·보안그룹·DNS·Tesseract 및 kor/eng 설치는 이번에 구성하지 않았다.

## 완료 판단

배포 후 로그인·프로필·인바디 저장·재접속, 모델 GLB의 실제 응답, 피팅 화면의 색상·의류·카메라 조작을 확인해야 한다. 빌드 성공만으로 전체 기능이 배포 환경에서 검증된 것은 아니다. 유료 외부 AI 기능과 팀원 수집 기능은 별도 조건을 확인해야 한다.
