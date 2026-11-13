#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$ROOT" == /home/ubuntu/ONFIT ]] || { echo 'Run from /home/ubuntu/ONFIT on EC2.' >&2; exit 1; }
cd "$ROOT"
dc() { docker compose -f "$ROOT/compose.ajb.yaml" "$@"; }
fail() { echo "ONFIT deployment stopped: $*" >&2; exit 1; }

[[ "$(git branch --show-current)" == AJB ]] || fail 'AJB branch is required.'
[[ "$(git remote get-url origin)" == *hsohsh1111-sys/Semiproject* ]] || fail 'Unexpected Git origin.'
git diff --quiet && git diff --cached --quiet || fail 'Tracked files have local changes.'

echo 'Current ONFIT containers:'
docker ps --filter label=com.docker.compose.project=onfit-ajb --format '{{.Names}}  {{.Status}}'
api_before="$(docker ps -q --filter label=com.docker.compose.project=onfit-ajb --filter label=com.docker.compose.service=api)"
web_before="$(docker ps -q --filter label=com.docker.compose.project=onfit-ajb --filter label=com.docker.compose.service=web)"
[[ -n "$api_before" && -n "$web_before" ]] || fail 'Existing ONFIT API/web containers are required.'
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$api_before")" == healthy ]] || fail 'Existing API is not healthy.'

git pull --ff-only --quiet origin AJB >/dev/null 2>&1 || fail 'AJB fast-forward pull failed; check Git state manually.'
grep -Fq 'emptyOutDir:false' scripts/build-site.mjs || fail 'Production image fix is missing.'
git ls-files --error-unmatch frontend/public/ai-fashion/images/AIfashion.png >/dev/null 2>&1 || fail 'Card image is not tracked.'
[[ -f deploy/ec2/Caddyfile && -f deploy/ec2/duckdns-update.sh ]] || fail 'HTTPS deployment files are missing.'

api_env=deploy/ec2/.env
duck_env=deploy/ec2/.env.duckdns
[[ -f "$api_env" ]] || fail 'Existing API environment file is missing.'
git check-ignore -q "$api_env" || fail 'API environment file is not Git-ignored.'
git check-ignore -q "$duck_env" || fail 'DuckDNS environment file is not Git-ignored.'

if [[ ! -s "$duck_env" ]]; then
  [[ -t 0 ]] || fail 'DuckDNS token needs private terminal input.'
  umask 077
  read -r -s -p 'DuckDNS token: ' duck_token
  printf '\n'
  [[ -n "$duck_token" ]] || fail 'DuckDNS token is empty.'
  printf 'DUCKDNS_TOKEN=%s\n' "$duck_token" > "$duck_env"
  unset duck_token
fi
chmod 600 "$duck_env" "$api_env"
grep -Eq '^DUCKDNS_TOKEN=[^[:space:]]+' "$duck_env" || fail 'DuckDNS token is not configured.'

# Change only this public origin; preserve all other existing secrets/settings.
if grep -q '^FRONTEND_ORIGINS=' "$api_env"; then
  sed -i 's|^FRONTEND_ORIGINS=.*|FRONTEND_ORIGINS=https://onfit-ajb.duckdns.org|' "$api_env"
else
  printf '\nFRONTEND_ORIGINS=https://onfit-ajb.duckdns.org\n' >> "$api_env"
fi

dc config -q || fail 'Compose configuration is invalid.'
dc pull duckdns caddy || fail 'Caddy/DuckDNS image pull failed.'
dc run --rm --no-deps --entrypoint nginx web -t >/dev/null || fail 'Nginx configuration is invalid.'
dc run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || fail 'Caddy configuration is invalid.'

# Keep the existing HTTP web container running during DNS setup and web build.
dc up -d --no-deps --no-build duckdns || fail 'DuckDNS service did not start.'
duck_ready=0
for _ in {1..24}; do
  duck_id="$(dc ps -q duckdns)"
  if [[ -n "$duck_id" && "$(docker inspect -f '{{.State.Health.Status}}' "$duck_id")" == healthy ]]; then
    duck_ready=1; break
  fi
  sleep 5
done
[[ "$duck_ready" == 1 ]] || fail 'DuckDNS update did not become healthy; inspect ONFIT DuckDNS logs.'

imds_token="$(curl -fsS --max-time 5 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)" || fail 'EC2 metadata token is unavailable.'
ec2_ip="$(curl -fsS --max-time 5 -H "X-aws-ec2-metadata-token: $imds_token" http://169.254.169.254/latest/meta-data/public-ipv4)" || fail 'EC2 public IPv4 is unavailable.'
unset imds_token
dns_ok=0
for _ in {1..12}; do
  dns_ip="$(getent ahostsv4 onfit-ajb.duckdns.org | awk 'NR==1 {print $1}')" || dns_ip=
  if [[ "$dns_ip" == "$ec2_ip" ]]; then dns_ok=1; break; fi
  sleep 10
done
[[ "$dns_ok" == 1 ]] || fail 'DuckDNS does not resolve to this EC2 public IPv4; HTTP remains running.'

dc build web || fail 'Web image build failed; HTTP remains running.'
dc run --rm --no-deps --entrypoint sh web -ec \
  'test -s /usr/share/nginx/html/ai-fashion/images/AIfashion.png' || fail 'Built web image lacks the card image.'

rollback_file="$(mktemp --suffix=.yaml)"
trap 'rm -f "$rollback_file"' EXIT
cat > "$rollback_file" <<'YAML'
services:
  web:
    ports:
      - "80:80"
YAML
restore_http() {
  echo 'Restoring ONFIT HTTP web binding; Caddy certificate volumes are retained.' >&2
  dc stop caddy >/dev/null 2>&1 || true
  docker compose -f "$ROOT/compose.ajb.yaml" -f "$rollback_file" up -d --no-deps --no-build web || true
}

# Only the web container changes. The healthy API container/image is untouched.
if ! dc up -d --no-deps --no-build web; then restore_http; fail 'Web cutover failed.'; fi
if ! dc up -d --no-deps --no-build caddy; then restore_http; fail 'Caddy cutover failed.'; fi

https_ok=0
for _ in {1..36}; do
  if curl --resolve onfit-ajb.duckdns.org:443:127.0.0.1 -fsS --max-time 10 \
      https://onfit-ajb.duckdns.org/health >/dev/null 2>&1; then
    https_ok=1; break
  fi
  sleep 5
done
if [[ "$https_ok" != 1 ]]; then restore_http; fail 'HTTPS health check failed; inspect ONFIT Caddy logs before retrying.'; fi
if ! curl --resolve onfit-ajb.duckdns.org:443:127.0.0.1 -fsS --max-time 10 -o /dev/null \
    https://onfit-ajb.duckdns.org/; then
  restore_http; fail 'HTTPS home page failed.'
fi

redirect="$(curl --resolve onfit-ajb.duckdns.org:80:127.0.0.1 -sS --max-time 10 \
  -o /dev/null -w '%{redirect_url}' http://onfit-ajb.duckdns.org/)" || redirect=
if [[ "$redirect" != https://onfit-ajb.duckdns.org/* ]]; then restore_http; fail 'HTTP to HTTPS redirect is missing.'; fi
image_headers="$(curl --resolve onfit-ajb.duckdns.org:443:127.0.0.1 -fsSI --max-time 10 \
  https://onfit-ajb.duckdns.org/ai-fashion/images/AIfashion.png)" || image_headers=
if ! grep -qi '^content-type: image/png' <<< "$image_headers"; then
  restore_http; fail 'Production AI Fashion card image is not served as PNG.'
fi

api_after="$(dc ps -q api)"
[[ "$api_after" == "$api_before" ]] || fail 'API container changed unexpectedly.'
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$api_after")" == healthy ]] || fail 'API lost healthy status.'
docker volume inspect onfit-ajb_caddy_data onfit-ajb_caddy_config >/dev/null || fail 'Caddy certificate volumes are missing.'
for service in api web duckdns caddy; do
  id="$(dc ps -q "$service")"
  [[ -n "$id" && "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$id")" == unless-stopped ]] || fail "$service restart policy is not set."
done
if command -v systemctl >/dev/null && ! systemctl is-enabled --quiet docker; then
  echo 'Docker service is not enabled at boot; enable it after review.' >&2
fi
echo 'ONFIT HTTPS, redirect, card image, API health and restart policies verified.'
echo 'Certificate renewal is automatic; inspect later with: docker compose -f compose.ajb.yaml logs --tail=100 caddy duckdns'
