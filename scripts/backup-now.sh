#!/usr/bin/env bash
# One full copy of the live database, exactly as it is now, into the gitignored .local/backups/ (plaintext: it is your real data,
# keep it on your Mac and never commit it). Run it before anything that changes data (an import, test data).
# Usage: read -rs "DATABASE_URL_MIGRATE?Neon owner URL (direct): " && export DATABASE_URL_MIGRATE && scripts/backup-now.sh; unset DATABASE_URL_MIGRATE
set -euo pipefail
case "${DATABASE_URL_MIGRATE:-}" in
  postgresql://*|postgres://*) ;;
  *) echo "Set DATABASE_URL_MIGRATE to the Neon owner URL (direct, starting with postgresql://)"; exit 1 ;;
esac
PG_IMAGE="postgres:17.6" # as .github/workflows/backup.yml: pg_dump must be at least as new as the server
out="$(cd "$(dirname "$0")/.." && pwd)/.local/backups"
name="life-tracker-$(date +%Y-%m-%d-%H%M%S).dump"
mkdir -p "$out"
docker run --rm -e DATABASE_URL_MIGRATE -v "$out:/out" "$PG_IMAGE" \
  sh -c 'pg_dump "$DATABASE_URL_MIGRATE" --format=custom --no-owner --no-privileges -f "/out/'"$name"'"'
# A dump that cannot be listed or is tiny is not a backup.
docker run --rm -v "$out:/out" "$PG_IMAGE" pg_restore -l "/out/$name" >/dev/null
test "$(wc -c <"$out/$name")" -gt 10000
echo "Backup written: .local/backups/$name ($(du -h "$out/$name" | cut -f1))"
