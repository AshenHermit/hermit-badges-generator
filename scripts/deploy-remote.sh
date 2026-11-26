#!/usr/bin/env bash
#
# Deploy prebuilt GHCR images on the production host. No git, no build here.
#
#   DEPLOY_PATH=/home/hermit-badges-generator \
#   COMPOSE_FILE=docker-compose.prod.yml \
#   bash scripts/deploy-remote.sh [ref]
#
# Environment:
#   DEPLOY_PATH          directory holding .env and the compose file (required)
#   COMPOSE_FILE         compose file name (default docker-compose.prod.yml)
#   GHCR_USER            registry user passed by CI (github.actor)
#   GHCR_TOKEN           registry token passed by CI; never logged
#   REF                  deployed ref, for logging (positional arg wins)
#   DRY_RUN=1            print commands instead of running them (no docker)
#   DEPLOY_SOURCE_ONLY=1 define functions only; used by the CI preflight
#
# Exit codes: 2 preflight, 4 bad env, 5 missing image tag.

set -Eeuo pipefail

REF="${1:-${REF:-master}}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/hermit-badges-generator}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
DRY_RUN="${DRY_RUN:-0}"

REQUIRED_KEYS="REDIS_PASSWORD COMMON_DOMAIN SERVICE_SUBDOMAIN BACKEND_IMAGE CADDY_IMAGE"
IMAGE_KEYS="BACKEND_IMAGE CADDY_IMAGE"

# Keep credential values out of every line this script prints.
redact() {
  local text="$1" secret
  for secret in "$GHCR_TOKEN" "${SSH_PRIVATE_KEY:-}" "${REDIS_PASSWORD:-}"; do
    if [ -n "$secret" ]; then
      text="${text//"$secret"/[REDACTED]}"
    fi
  done
  printf '%s' "$text"
}

log() {
  printf '[deploy] %s\n' "$(redact "$*")"
}

die() {
  local message="$1"
  local code="${2:-1}"
  printf '[deploy] ERROR: %s\n' "$(redact "$message")" >&2
  exit "$code"
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: $*"
    return 0
  fi
  "$@"
}

# Last occurrence wins, so tags appended by CI override values in PROD_ENV.
env_value() {
  local env_file="$1"
  local key="$2"
  awk -v k="$key" '
    index($0, k "=") == 1 { value = substr($0, length(k) + 2) }
    END { sub(/\r$/, "", value); print value }
  ' "$env_file"
}

validate_env() {
  local env_file="$DEPLOY_PATH/.env"
  local missing="" key value

  [ -f "$env_file" ] || die "no $env_file: CI writes it from PROD_ENV" 4

  for key in $REQUIRED_KEYS; do
    value=$(env_value "$env_file" "$key")
    if [ -z "$value" ]; then
      missing="$missing $key"
    fi
  done
  if [ -n "$missing" ]; then
    die "empty or missing required keys in $env_file:$missing" 4
  fi

  for key in $IMAGE_KEYS; do
    value=$(env_value "$env_file" "$key")
    case "$value" in
      *:*) ;;
      *) die "$key has no image tag in $env_file" 5 ;;
    esac
  done
}

preflight() {
  [ -n "$DEPLOY_PATH" ] || die "DEPLOY_PATH is empty" 2
  [ -d "$DEPLOY_PATH" ] || die "deploy directory $DEPLOY_PATH does not exist" 2
  [ -w "$DEPLOY_PATH" ] || die "deploy directory $DEPLOY_PATH is not writable" 2
  [ -f "$DEPLOY_PATH/$COMPOSE_FILE" ] || die "compose file $DEPLOY_PATH/$COMPOSE_FILE is missing" 2

  if [ "$DRY_RUN" != "1" ]; then
    command -v docker >/dev/null 2>&1 || die "docker is not installed" 2
    docker compose version >/dev/null 2>&1 || die "docker compose plugin is unavailable" 2
    docker info >/dev/null 2>&1 || die "docker daemon is unreachable" 2
  fi

  validate_env
}

docker_login() {
  [ -n "$GHCR_USER" ] || die "GHCR_USER is required for GHCR login" 2
  [ -n "$GHCR_TOKEN" ] || die "GHCR_TOKEN is required for GHCR login" 2

  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: docker login ghcr.io --username \"$GHCR_USER\" --password-stdin"
    return 0
  fi

  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin \
    || die "GHCR login failed" 2
}

ensure_network() {
  if [ "$DRY_RUN" != "1" ] && docker network inspect shared-net >/dev/null 2>&1; then
    log "network shared-net already exists"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: docker network inspect shared-net"
  fi
  run docker network create shared-net
}

compose() {
  run docker compose \
    --project-directory "$DEPLOY_PATH" \
    --env-file "$DEPLOY_PATH/.env" \
    -f "$DEPLOY_PATH/$COMPOSE_FILE" \
    "$@"
}

main() {
  log "deploying $REF to $DEPLOY_PATH (dry-run=$DRY_RUN)"
  preflight
  docker_login
  ensure_network
  compose pull
  compose up -d --force-recreate --wait
  run docker image prune -f
  log "done"
}

if [ "${DEPLOY_SOURCE_ONLY:-0}" != "1" ]; then
  main "$@"
fi
