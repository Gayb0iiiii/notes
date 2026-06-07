# Private Notes

Self-hosted, local-first collaborative notes for a small private workplace.

## What is implemented

- TypeScript monorepo with React/Vite web app, Fastify API, shared contracts, and Hocuspocus collaboration service.
- Username/password auth with Argon2id hashes and httpOnly session cookies.
- Long-lived local-workplace sessions, configurable with `SESSION_TTL_DAYS`.
- Admin panel for owner-managed users, roles, password resets, removals, and backup commands.
- Workspace membership checks for workspace-scoped routes.
- Nested page metadata, offline Dexie cache, idempotent metadata outbox, archive/restore conflict rules.
- Tiptap editor with Yjs, y-indexeddb local persistence, table controls, task/code/quote blocks, and local HTML snapshots.
- Image paste/drop/file insert with durable local previews and queued offline blobs.
- Backlink indexing endpoint and simple backlink panel.
- PWA manifest, app-shell service worker, responsive mobile layout, and committed Capacitor iOS SPM project.
- Docker Compose, Caddy reverse proxy profile, SQL migration, seed script, and backup script.

## Local run

```bash
cp .env.example .env
docker compose up -d postgres minio create-bucket
docker compose run --rm api sh -lc "corepack enable && pnpm install && pnpm --filter @notes/api db:migrate && pnpm --filter @notes/api tsx src/seed.ts"
docker compose up app-web api collab
```

Open `http://localhost:5173` and sign in with the seeded owner credentials from `.env`.

## Production notes

- Replace every secret in `.env`.
- Put the app behind HTTPS. The `caddy` profile is provided for self-hosted deployment.
- Keep MinIO private; serve assets through signed URLs.
- Run `scripts/backup.sh` daily and test restore before trusting the system for work notes.
- For iCloud Drive backup on macOS, set `BACKUP_DIR` to a folder inside iCloud Drive:

```bash
BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Notes Backups" scripts/backup.sh
```

- For S3-compatible backup sync, install the AWS CLI and set `S3_BACKUP_URI`; use `S3_BACKUP_ENDPOINT` for MinIO, Cloudflare R2, or another compatible provider:

```bash
S3_BACKUP_URI="s3://my-notes-backups" scripts/backup.sh
S3_BACKUP_URI="s3://my-notes-backups" S3_BACKUP_ENDPOINT="https://s3.example.com" scripts/backup.sh
```

## Mobile App

The iOS shell is committed under `apps/web/ios` and uses Swift Package Manager, not CocoaPods.

```bash
pnpm --filter @notes/web app:ios:copy
pnpm --filter @notes/web app:ios:open
pnpm --filter @notes/web app:ios:build-sim
```

The native shell uses the same server URL field as the web app before login.
