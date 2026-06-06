#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-notes-postgres-1}"
MINIO_VOLUME="${MINIO_VOLUME:-notes_minio-data}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
BACKUP_ROOT="$(cd "$BACKUP_DIR" && pwd)"
BACKUP_TARGET="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP_TARGET"

docker exec "$POSTGRES_CONTAINER" pg_dump -U notes -d notes > "$BACKUP_TARGET/postgres.sql"

docker run --rm -v "$MINIO_VOLUME:/data:ro" -v "$BACKUP_TARGET:/backup" alpine tar -czf /backup/minio-assets.tar.gz /data

cp docker-compose.yml "$BACKUP_TARGET/docker-compose.yml"
if [ -f .env ]; then
  cp .env "$BACKUP_TARGET/env.secure-copy"
fi

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

if [ -n "${S3_BACKUP_URI:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "S3_BACKUP_URI was set, but aws CLI is not installed" >&2
    exit 1
  fi

  if [ -n "${S3_BACKUP_ENDPOINT:-}" ]; then
    aws s3 sync "$BACKUP_TARGET" "$S3_BACKUP_URI/$STAMP" --endpoint-url "$S3_BACKUP_ENDPOINT"
  else
    aws s3 sync "$BACKUP_TARGET" "$S3_BACKUP_URI/$STAMP"
  fi
fi

echo "Backup written to $BACKUP_TARGET"
