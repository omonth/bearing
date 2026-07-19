#!/bin/sh
set -eu

# Named volumes may have been created by an older root-running image. Repair
# only the application-owned writable paths, then drop privileges permanently.
for writable_path in /app/logs /app/backups /app/public/images; do
  if [ -d "$writable_path" ]; then
    chown -R node:node "$writable_path"
  fi
done

exec gosu node "$@"
