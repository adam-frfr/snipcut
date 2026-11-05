#!/usr/bin/env bash
# Restore a Snipcut backup (from deploy/backup.sh) on a NEW server.
#
#   git clone https://github.com/adam-frfr/snipcut.git /opt/snipcut
#   cd /opt/snipcut && ./deploy/restore.sh /opt/snipcut-backup-XXXX.tar.gz
#
# Puts the backup's .env in place (unless one already exists), builds and
# starts the app, then copies the saved data into it.
set -euo pipefail
if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "Usage: ./deploy/restore.sh /path/to/snipcut-backup-XXXX.tar.gz" >&2
  exit 1
fi
BACKUP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar xzf "$BACKUP" -C "$TMP"

if [ -f .env ]; then
  echo ".env already exists here — keeping it (not overwritten by the backup's copy)."
elif [ -f "$TMP/.env" ]; then
  cp "$TMP/.env" .env
  chmod 600 .env
  echo "Restored .env"
else
  echo "No .env in the backup: copy .env.example to .env and fill it in, then re-run." >&2
  exit 1
fi

echo "Building and starting Snipcut (first build takes a few minutes)..."
docker compose up -d --build

echo "Waiting for the container..."
for _ in $(seq 1 60); do
  if docker compose exec -T snipcut true 2>/dev/null; then break; fi
  sleep 2
done

if [ -f "$TMP/app-data.tgz" ]; then
  echo "Copying saved data in..."
  docker compose exec -T snipcut tar xzf - -C /app < "$TMP/app-data.tgz"
  docker compose restart snipcut
fi

echo
echo "Restored. Check it:  docker compose ps   and   docker compose logs -f snipcut"
echo "Then point your domain at this server and set up HTTPS (README: Move to another server)."
