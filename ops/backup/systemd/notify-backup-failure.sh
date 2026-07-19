#!/usr/bin/env bash
set -Eeuo pipefail

unit_name="${1:-bearing-postgres-backup.service}"
case "$unit_name" in
  *[!A-Za-z0-9@_.:-]*)
    echo "Unsafe systemd unit name" >&2
    exit 2
    ;;
esac

case "${BACKUP_ALERT_WEBHOOK_URL:-}" in
  https://*) ;;
  *)
    echo "BACKUP_ALERT_WEBHOOK_URL must be an HTTPS URL" >&2
    exit 2
    ;;
esac

occurred_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
payload="$(printf '{\"event\":\"postgres_backup_scheduler_failed\",\"status\":\"failed\",\"unit\":\"%s\",\"occurredAt\":\"%s\"}' "$unit_name" "$occurred_at")"

/usr/bin/curl \
  --fail \
  --silent \
  --show-error \
  --max-time 10 \
  --header 'Content-Type: application/json' \
  --data "$payload" \
  "$BACKUP_ALERT_WEBHOOK_URL"
