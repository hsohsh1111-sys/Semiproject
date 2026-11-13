# EC2 배포 (Ubuntu 22.04/24.04)

이 구성은 Nginx가 React 정적 파일을 제공하고, systemd가 FastAPI를 관리하는 단일 EC2 배포입니다. DB는 외부 TiDB/MySQL을 사용합니다. 실제 도메인과 DB 접속 정보는 배포 환경에서 설정하세요.

## 1. 인스턴스 준비

- Ubuntu 22.04 또는 24.04, 메모리 4 GiB 이상 권장
- 보안 그룹 인바운드: SSH 22(관리자 IP만), HTTP 80, HTTPS 443
- DB 보안 그룹/방화벽은 EC2에서 오는 DB 포트만 허용
- DNS A 레코드를 EC2의 고정 IP(Elastic IP 권장)에 연결

```bash
sudo apt update
sudo apt install -y git nginx python3 python3-venv python3-pip nodejs npm \
  tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng fonts-dejavu-core
sudo adduser --system --group --home /srv/onfit onfit
sudo git clone https://github.com/hsohsh1111-sys/Semiproject.git /srv/onfit/repo
sudo chown -R onfit:onfit /srv/onfit
```

프로젝트의 현재 `main`을 배포 대상으로 사용합니다. Node.js는 Vite 8 지원 버전(20.19+ 또는 22.12+)을 설치하세요. Ubuntu 기본 저장소의 Node 버전이 낮으면 Node.js 공식 배포 저장소에서 설치해야 합니다.

## 2. 백엔드 설정

```bash
sudo -u onfit python3 -m venv /srv/onfit/repo/backend/.venv
sudo -u onfit /srv/onfit/repo/backend/.venv/bin/pip install -r /srv/onfit/repo/backend/requirements.txt
sudo mkdir -p /etc/onfit
sudo install -o root -g onfit -m 0640 /dev/null /etc/onfit/backend.env
sudoedit /etc/onfit/backend.env
```

`/etc/onfit-backend.env`에 필요한 값만 입력하세요. 최소한 `APP_ENV=production`, `SECRET_KEY`(32바이트 이상의 임의 값), `DATABASE_URL` 또는 `TIDB_HOST`, `TIDB_PORT`, `TIDB_USERNAME`, `TIDB_PASSWORD`, `TIDB_DATABASE`, 그리고 `FRONTEND_ORIGINS=https://실제도메인`이 필요합니다. URL 방식과 `TIDB_*` 방식은 하나만 설정합니다. 메일 인증을 사용할 경우 SMTP/Brevo 값도 별도로 설정합니다. 비밀값은 Git 저장소, 프런트엔드 `VITE_*`, Docker 이미지에 넣지 마세요.

예시 systemd 파일은 `/etc/onfit/backend.env`를 읽습니다.

```bash
sudo mkdir -p /etc/onfit
sudo install -o root -g onfit -m 0640 /dev/null /etc/onfit/backend.env
sudoedit /etc/onfit/backend.env
sudo install -o root -g root -m 0644 /srv/onfit/repo/deploy/ec2/onfit-api.service.example /etc/systemd/system/onfit-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now onfit-api
sudo systemctl status onfit-api
```

## 3. 프런트엔드 빌드 및 Nginx

```bash
sudo -u onfit npm ci --prefix /srv/onfit/repo/frontend
sudo -u onfit npm run build --prefix /srv/onfit/repo/frontend
sudo install -o root -g root -m 0644 /srv/onfit/repo/deploy/ec2/nginx.conf.example /etc/nginx/sites-available/onfit
sudoedit /etc/nginx/sites-available/onfit
sudo ln -s /etc/nginx/sites-available/onfit /etc/nginx/sites-enabled/onfit
sudo nginx -t
sudo systemctl reload nginx
```

Nginx 예시의 `server_name`을 실제 도메인으로 바꾸세요. SSL 인증서를 발급하고 HTTPS를 설정한 다음 `FRONTEND_ORIGINS`도 HTTPS 도메인으로 맞춥니다. ONFIT 정적 파일은 `/srv/onfit/repo/frontend/dist`에서 제공합니다. `/ai-fashion/` 경로도 프런트엔드 빌드 결과에 포함되어 있어야 합니다.

## 4. DB 및 점검

운영 DB 백업 후 `database/migrations/`의 SQL을 검토해 순서대로 적용하세요. 이 프로젝트는 애플리케이션 시작 시 운영 DB 스키마를 자동 변경하지 않습니다. DB TLS/인바운드 제한을 확인하고, 배포 후 아래 항목을 점검합니다.

```bash
curl -fsS http://127.0.0.1/health
sudo journalctl -u onfit-api -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

## 업데이트

현재 서비스 경로는 `/srv/onfit/repo`입니다. Git에서 직접 pull하기 전에 배포 파일과 `.env`를 백업하고, 변경 사항을 검토하세요. 업데이트할 때는 새 릴리스를 별도 경로에 checkout해 프런트엔드를 다시 빌드한 뒤 서비스를 재시작하는 방식이 안전합니다. DB 변경은 애플리케이션 배포와 분리해 백업 후 적용하세요.
