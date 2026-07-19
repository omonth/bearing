#!/usr/bin/env bash

set -Eeuo pipefail

cd /opt/bearing-sales

backend_image="$(/usr/bin/docker inspect \
  --format '{{.Config.Image}}' bearing-sales-backend 2>/dev/null)"

if [[ ! "$backend_image" =~ (:[0-9a-f]{40}|@sha256:[0-9a-f]{64})$ ]]; then
  echo "Running backend does not use an immutable Git SHA or digest image" >&2
  exit 1
fi

export BACKEND_IMAGE="$backend_image"

exec /usr/bin/docker compose \
  --env-file /etc/bearing-sales/backup.env \
  -f docker-compose.yml \
  --profile ops run --rm --no-deps backup
