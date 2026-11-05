#!/usr/bin/env bash
# Back up a running Snipcut server into ONE file you can move to a new server.
#
#   cd /opt/snipcut && ./deploy/backup.sh               # settings + saved data
#   cd /opt/snipcut && ./deploy/backup.sh --with-videos # + uploads and clips
#
# The backup holds: .env (passcode + API keys), job records / recent projects,
# saved YouTube cookies, your uploaded music, caches. With --with-videos also
# source videos and rendered clips (those expire after FILE_RETENTION_HOURS
# anyway, so they're usually not worth moving).
# It contains secrets: keep it private, delete it when you're done.
set -euo pipefail
cd "$(dirname "$0")/.."

PATHS="data"
if [ "${1:-}" = "--with-videos" ]; then
  PATHS="data public/uploads public/downloads public/rendered_clips"
fi

if ! docker compose ps --status running --services | grep -qx snipcut; then
  echo "The snipcut container isn't running. Start it first: docker compose up -d" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M)
OUT="$PWD/snipcut-backup-$STAMP.tar.gz"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Packing $PATHS from the container..."
# shellcheck disable=SC2086
docker compose exec -T snipcut tar czf - -C /app $PATHS > "$TMP/app-data.tgz"
if [ -f .env ]; then cp .env "$TMP/.env"; else echo "(no .env found — only the data is in the backup)"; fi

tar czf "$OUT" -C "$TMP" .
chmod 600 "$OUT"
echo
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
echo "It contains your passcode and API keys — keep it private."
echo "Copy it to the new server, e.g.:  scp $OUT root@NEW-SERVER:/opt/"
