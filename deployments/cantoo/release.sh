#!/usr/bin/env bash
# Build Plane TT images locally and deploy them to the Cantoo VPS.
# Volumes (users, uploads, plane.env) are never touched.
#
# Usage:
#   ./deployments/cantoo/release.sh
#   ./deployments/cantoo/release.sh --skip-build
#   SSH_HOST=ubuntu@plane.cantoo.fr ./deployments/cantoo/release.sh
#
# Env overrides:
#   SSH_HOST          default: ubuntu@plane.cantoo.fr
#   REMOTE_APP_DIR    default: ~/plane-selfhost/plane-app
#   REMOTE_STAGING    default: ~/plane-tt-images
#   FRONTEND_IMAGE    default: cantoo/plane-frontend:tt
#   BACKEND_IMAGE     default: cantoo/plane-backend:tt
#   HEALTH_URL        default: https://plane.cantoo.fr/api/instances/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SSH_HOST="${SSH_HOST:-ubuntu@plane.cantoo.fr}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-~/plane-selfhost/plane-app}"
REMOTE_STAGING="${REMOTE_STAGING:-~/plane-tt-images}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-cantoo/plane-frontend:tt}"
BACKEND_IMAGE="${BACKEND_IMAGE:-cantoo/plane-backend:tt}"
HEALTH_URL="${HEALTH_URL:-https://plane.cantoo.fr/api/instances/}"

SKIP_BUILD=0
SKIP_FRONTEND=0
SKIP_BACKEND=0
SKIP_HEALTH=0
DRY_RUN=0

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \?//'
  cat <<EOF

Flags:
  --skip-build       Reuse existing local images (no docker build)
  --skip-frontend    Do not build/transfer frontend image
  --skip-backend     Do not build/transfer backend image
  --skip-health      Skip post-deploy HTTP check
  --dry-run          Print steps only
  -h, --help         Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --skip-backend) SKIP_BACKEND=1 ;;
    --skip-health) SKIP_HEALTH=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

log() { printf '==> %s\n' "$*"; }
run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

ssh_remote() {
  # shellcheck disable=SC2029
  ssh -o BatchMode=yes -o ConnectTimeout=10 "${SSH_HOST}" "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd docker
require_cmd rsync
require_cmd ssh
require_cmd gzip

STAGING_DIR="$(mktemp -d /tmp/plane-tt-release.XXXXXX)"
cleanup() { rm -rf "${STAGING_DIR}"; }
trap cleanup EXIT

log "SSH host: ${SSH_HOST}"
log "Remote app: ${REMOTE_APP_DIR}"
log "Images: ${FRONTEND_IMAGE} / ${BACKEND_IMAGE}"

# --- connectivity ---
log "Checking SSH..."
if [[ "${DRY_RUN}" -eq 0 ]]; then
  ssh_remote 'echo ok >/dev/null'
fi

# --- build ---
if [[ "${SKIP_BUILD}" -eq 0 ]]; then
  if [[ "${SKIP_BACKEND}" -eq 0 ]]; then
    log "Building ${BACKEND_IMAGE}..."
    run "docker build -t '${BACKEND_IMAGE}' -f '${ROOT_DIR}/apps/api/Dockerfile.api' '${ROOT_DIR}/apps/api'"
  fi
  if [[ "${SKIP_FRONTEND}" -eq 0 ]]; then
    log "Building ${FRONTEND_IMAGE}..."
    run "docker build -t '${FRONTEND_IMAGE}' -f '${ROOT_DIR}/apps/web/Dockerfile.web' '${ROOT_DIR}'"
  fi
else
  log "Skipping build (--skip-build)"
fi

# --- save ---
ARTIFACTS=()
if [[ "${SKIP_BACKEND}" -eq 0 ]]; then
  log "Saving ${BACKEND_IMAGE}..."
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    docker save "${BACKEND_IMAGE}" | gzip -1 >"${STAGING_DIR}/plane-backend-tt.tar.gz"
    ARTIFACTS+=("${STAGING_DIR}/plane-backend-tt.tar.gz")
  else
    run "docker save '${BACKEND_IMAGE}' | gzip -1 >'${STAGING_DIR}/plane-backend-tt.tar.gz'"
  fi
fi
if [[ "${SKIP_FRONTEND}" -eq 0 ]]; then
  log "Saving ${FRONTEND_IMAGE}..."
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    docker save "${FRONTEND_IMAGE}" | gzip -1 >"${STAGING_DIR}/plane-frontend-tt.tar.gz"
    ARTIFACTS+=("${STAGING_DIR}/plane-frontend-tt.tar.gz")
  else
    run "docker save '${FRONTEND_IMAGE}' | gzip -1 >'${STAGING_DIR}/plane-frontend-tt.tar.gz'"
  fi
fi

# --- sync helper scripts ---
log "Syncing compose override + restart script + Caddyfile..."
run "rsync -az '${SCRIPT_DIR}/docker-compose.tt.yaml' '${SCRIPT_DIR}/restart-tt.sh' '${SCRIPT_DIR}/Caddyfile.web' '${SSH_HOST}:${REMOTE_APP_DIR}/'"
run "ssh_remote 'chmod +x ${REMOTE_APP_DIR}/restart-tt.sh'"

# --- transfer images ---
if [[ "${#ARTIFACTS[@]}" -gt 0 ]] || [[ "${DRY_RUN}" -eq 1 ]]; then
  log "Transferring image tarballs..."
  run "ssh_remote 'mkdir -p ${REMOTE_STAGING}'"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    rsync -avP "${ARTIFACTS[@]}" "${SSH_HOST}:${REMOTE_STAGING}/"
  else
    run "rsync -avP '${STAGING_DIR}/'*.tar.gz '${SSH_HOST}:${REMOTE_STAGING}/'"
  fi
fi

# --- load ---
load_cmds=()
if [[ "${SKIP_BACKEND}" -eq 0 ]]; then
  load_cmds+=("gunzip -c ${REMOTE_STAGING}/plane-backend-tt.tar.gz | docker load")
fi
if [[ "${SKIP_FRONTEND}" -eq 0 ]]; then
  load_cmds+=("gunzip -c ${REMOTE_STAGING}/plane-frontend-tt.tar.gz | docker load")
fi
if [[ "${#load_cmds[@]}" -gt 0 ]]; then
  log "Loading images on VPS..."
  remote_load="$(printf '%s && ' "${load_cmds[@]}")"
  remote_load="${remote_load% && }"
  run "ssh_remote '${remote_load}'"
fi

# --- restart ---
log "Restarting app services on VPS..."
run "ssh_remote 'cd ${REMOTE_APP_DIR} && ./restart-tt.sh'"

# --- health ---
if [[ "${SKIP_HEALTH}" -eq 0 ]]; then
  log "Waiting for API (${HEALTH_URL})..."
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    ok=0
    for i in $(seq 1 30); do
      code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${HEALTH_URL}" || true)"
      if [[ "${code}" == "200" ]]; then
        ok=1
        break
      fi
      sleep 2
    done
    if [[ "${ok}" -ne 1 ]]; then
      echo "Health check failed (last HTTP ${code:-n/a}). Check: ssh ${SSH_HOST} 'docker logs plane-app-api-1 --tail=80'" >&2
      exit 1
    fi
    log "Health OK (HTTP 200)"
  else
    run "curl -sS -o /dev/null -w '%{http_code}\\n' '${HEALTH_URL}'"
  fi
fi

log "Release complete."
log "Site: https://plane.cantoo.fr"
