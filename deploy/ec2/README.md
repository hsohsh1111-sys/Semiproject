# EC2 Docker 배포

`compose.yaml`이 FastAPI와 정적 웹 프런트엔드를 Docker로 실행합니다. 프런트엔드 컨테이너가 Nginx를 제공하고, EC2의 호스트 Nginx가 HTTPS를 종료한 뒤 `127.0.0.1:8080`으로 전달합니다. DB는 기존 외부 TiDB/MySQL을 사용합니다.

## 구성 파일

- `compose.yaml`: API와 웹 컨테이너 빌드 및 실행
- `Dockerfile.web`: ONFIT과 AI 패션 앱을 빌드해 Nginx 이미지에 포함
- `nginx.container.conf`: 컨테이너 Nginx의 정적 파일 제공 및 API 프록시
- `nginx.bootstrap.conf`: 첫 인증서 발급용 임시 HTTP 설정
- `nginx.conf.example`: 인증서 발급 후 사용하는 EC2 호스트 HTTPS 설정
- `../../.github/workflows/deploy-ec2.yml`: GitHub `main` 푸시 및 수동 실행 배포

## 1. EC2 준비

Ubuntu 22.04/24.04 EC2를 준비하세요. 공개 접속 인바운드는 SSH(관리자 IP), HTTP 80, HTTPS 443만 허용하고, DB 방화벽은 EC2에서 오는 DB 연결만 허용하세요. 프런트엔드에는 약 650 MB의 3D 모델 파일이 포함되어 있어 **메모리 8 GiB와 여유 디스크 30 GiB 이상**을 권장합니다.

Docker Engine 공식 APT 저장소를 등록하고 Docker Compose 플러그인을 설치한 뒤 저장소를 EC2에 한 번 복제합니다. 배포할 사용자를 실제 SSH 계정으로 바꿔 실행하세요(일반 Ubuntu AMI는 `ubuntu`).

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker nginx
sudo mkdir -p /srv/onfit
sudo chown "$USER":"$USER" /srv/onfit
git clone --branch main https://github.com/hsohsh1111-sys/Semiproject.git /srv/onfit/app
```

현재 GitHub 저장소가 비공개라면 EC2 사용자의 SSH 공개 키를 저장소의 read-only Deploy key로 등록하고 `origin`을 SSH URL로 설정하세요. GitHub Actions가 EC2에 접속하는 키는 아래 별도 설정 단계에서 등록합니다.

## 2. 운영 환경 변수

운영 값을 GitHub Repository secret `EC2_ENV_FILE`에 dotenv 형식으로 저장합니다. [`deploy/ec2/.env.example`](.env.example)을 참고해 `APP_ENV`, 실제 도메인, DB 접속 정보, 새 `SECRET_KEY`를 설정하세요. `DATABASE_URL` 또는 모든 `TIDB_*` 값을 지정해야 합니다.

```dotenv
APP_ENV=production
FRONTEND_ORIGINS=https://onfit3.duckdns.org
SECRET_KEY=
DATABASE_URL=
TIDB_HOST=
TIDB_PORT=4000
TIDB_USERNAME=
TIDB_PASSWORD=
TIDB_DATABASE=
```

`DATABASE_URL`을 쓰면 `TIDB_*` 값 대신 연결 문자열 하나를 입력하세요. URL 안의 특수문자 비밀번호는 percent-encoding해야 합니다. `.env` 값에 `$`, `#`, 공백이 포함되면 작은따옴표로 감싸세요. `SECRET_KEY`는 `openssl rand -hex 32`로 생성하고, 메일 인증이나 AI 기능을 쓸 때만 SMTP/Brevo/OpenAI 값을 추가합니다. `EC2_ENV_FILE`은 배포 중 임시 파일로 전달된 뒤 삭제되고, 앱 비밀값은 API 컨테이너 실행 환경에만 전달됩니다. GitHub Actions 로그나 프런트엔드 `VITE_*` 변수에는 비밀값을 넣지 마세요.

## 3. 호스트 Nginx와 TLS

호스트 Nginx 설정은 workflow가 처리합니다. 인증서가 없으면 임시 HTTP 설정으로 앱과 ACME challenge를 제공하고, 인증서 발급 후 HTTPS 설정으로 전환합니다. 기본 Nginx 사이트가 활성화되어 있으면 workflow가 해당 `sites-enabled/default` 심볼릭 링크를 비활성화합니다. DNS A 레코드가 EC2를 가리키고 보안 그룹에서 80/443이 열려 있어야 합니다. 인증서 자동 갱신을 사용하며, 상태는 `sudo certbot renew --dry-run`으로 확인할 수 있습니다. `FRONTEND_ORIGINS`에는 `https://onfit3.duckdns.org`를 설정합니다.

## 4. 첫 수동 배포

GitHub Repository secrets를 등록한 뒤 workflow를 실행하면 환경 파일 전달, Compose 빌드, 시작이 자동으로 진행됩니다. 수동 배포가 필요하면 `EC2_ENV_FILE` 내용을 `/tmp/onfit.env`에 임시로 만들어 사용하고, 배포 후 삭제하세요.

```bash
cd /srv/onfit/app
sudo docker compose --env-file /tmp/onfit.env -f deploy/ec2/compose.yaml up -d --build
sudo docker compose --env-file /tmp/onfit.env -f deploy/ec2/compose.yaml ps
sudo rm -f /tmp/onfit.env
curl -fsS http://127.0.0.1:8080/health
```

브라우저에서 `https://실제도메인/`과 `https://실제도메인/ai-fashion/`을 확인하세요. API 로그는 `sudo docker compose -f deploy/ec2/compose.yaml logs -f api`로 볼 수 있습니다.

운영 DB 백업 후 `database/migrations/` 변경 파일을 검토해 필요한 SQL을 순서대로 적용하세요. 애플리케이션은 시작할 때 운영 스키마를 자동 변경하지 않습니다.

## 5. GitHub Actions 자동 배포 설정

EC2 SSH 사용자(예: `ubuntu`)의 공개 키가 EC2의 `authorized_keys`에 있어야 합니다. 해당 사용자는 Docker 명령을 비밀번호 입력 없이 실행할 수 있어야 합니다. Ubuntu 기본 `ubuntu` 사용자는 기본적으로 `sudo -n`이 가능하며, 별도 계정을 쓰면 Docker 그룹 또는 제한된 sudo 권한을 준비하세요.

저장소 **Settings → Secrets and variables → Actions → Repository secrets**에 다음 값을 등록합니다.

| Secret | 값 |
| --- | --- |
| `EC2_HOST` | EC2 Elastic IP 또는 DNS 이름 |
| `EC2_USER` | SSH 사용자 이름(예: `ubuntu`) |
| `EC2_SSH_KEY` | EC2 접속용 SSH 개인 키 전체(PEM/OpenSSH 형식) |
| `EC2_ENV_FILE` | 운영 환경 변수 전체를 담은 dotenv 텍스트. `.env` 예시를 기반으로 하며 새 키를 사용 |

워크플로는 `EC2_HOST`에 대해 `ssh-keyscan`을 실행해 SSH host key 확인 파일을 만들고 strict host checking을 적용합니다. 이후 `main`에 push하면 `.github/workflows/deploy-ec2.yml`이 `EC2_ENV_FILE`을 비밀 출력 없이 임시로 전달해 최신 `main`을 Compose로 빌드·재기동하고 임시 파일을 삭제합니다. 앱이 실행되는 동안 값은 API 컨테이너 환경에 존재합니다. 첫 배포에는 Nginx 사이트 설정과 TLS 인증서도 적용합니다. **Actions → Deploy to EC2 → Run workflow**로 수동 배포도 가능합니다.

워크플로는 `/srv/onfit/app`을 `origin/main`으로 동기화합니다. 이 경로에서 서버에서 직접 수정한 파일은 다음 배포 때 덮어써집니다. 영구적인 `.env` 파일은 EC2에 남기지 않습니다.

## 배포 후 확인

```bash
sudo docker compose -f /srv/onfit/app/deploy/ec2/compose.yaml ps
sudo docker compose -f /srv/onfit/app/deploy/ec2/compose.yaml logs --tail=100 api web
curl -fsS https://실제도메인/health
```
