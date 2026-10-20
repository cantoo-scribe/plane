#!/usr/bin/env bash
# Recreate Plane app services with Cantoo TT images. Volumes / plane.env preserved.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yaml -f docker-compose.tt.yaml --env-file plane.env)

echo ">> Recreating migrator (volumes preserved)..."
"${COMPOSE[@]}" up -d --no-deps --force-recreate migrator

echo ">> Waiting for migrator..."
migrator_id="$("${COMPOSE[@]}" ps -aq migrator | head -1 || true)"
if [[ -n "${migrator_id}" ]]; then
  while docker inspect --format='{{.State.Status}}' "${migrator_id}" 2>/dev/null | grep -q running; do
    sleep 1
  done
  code="$(docker inspect --format='{{.State.ExitCode}}' "${migrator_id}")"
  if [[ "${code}" != "0" ]]; then
    echo "Migrator failed (exit ${code}). Logs:"
    "${COMPOSE[@]}" logs --tail=80 migrator
    exit 1
  fi
  echo ">> Migration OK"
fi

echo ">> Recreating api / worker / beat-worker / web / space..."
"${COMPOSE[@]}" up -d --no-deps --force-recreate api worker beat-worker web space

echo ">> Status:"
"${COMPOSE[@]}" ps
