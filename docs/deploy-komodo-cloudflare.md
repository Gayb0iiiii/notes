# Deploy Private Notes with Komodo and Cloudflare Tunnel

This guide deploys the full Private Notes stack from GitHub using Komodo Stacks and exposes it through Cloudflare Tunnel.

## Target layout

- Git repo: `Gayb0iiiii/notes`
- Branch: `main`
- Komodo stack name: `notes`
- Compose file: `docker-compose.prod.yml`
- Public URL: `https://notes.example.com`
- Internal Caddy URL for Cloudflare Tunnel: `http://localhost:18080`

The public service should expose only Caddy through Cloudflare Tunnel. Do not expose Postgres, MinIO, API, or collab ports directly to the internet.

## Services

- `app-web` - built React/Vite app served on internal port `5173`
- `api` - Fastify API on internal port `4000`
- `collab` - Hocuspocus/Yjs websocket service on internal port `4001`
- `postgres` - database
- `minio` - private S3-compatible asset storage
- `create-bucket` - one-shot MinIO bucket init service
- `seed` - optional one-shot owner/workspace seed service
- `caddy` - internal reverse proxy on `127.0.0.1:18080`

## 1. Create required secrets

Generate three long secrets/passwords:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

Use them for:

- `POSTGRES_PASSWORD`
- `SESSION_SECRET`
- `S3_SECRET_KEY`

Also choose a strong temporary owner password for `SEED_OWNER_PASSWORD`.

## 2. Create the Komodo Stack

In Komodo:

1. Go to **Stacks**.
2. Click **New Stack**.
3. Use these settings:

| Field | Value |
| --- | --- |
| Name | `notes` |
| Server | Your server/periphery host |
| Repo | `Gayb0iiiii/notes` |
| Branch | `main` |
| Run directory | `/opt/stacks/notes` |
| Compose file paths | `docker-compose.prod.yml` |
| Project name | `notes` |

If Komodo asks for Git credentials, use a GitHub connection/token that can read the repo.

## 3. Add Stack environment

In the Komodo Stack environment editor, paste this and replace all placeholders:

```env
NODE_ENV=production

APP_URL=https://notes.example.com
API_URL=https://notes.example.com
APP_HOST=:80

POSTGRES_USER=notes
POSTGRES_PASSWORD=REPLACE_WITH_LONG_RANDOM_DB_PASSWORD
POSTGRES_DB=notes
DATABASE_URL=postgres://notes:REPLACE_WITH_LONG_RANDOM_DB_PASSWORD@postgres:5432/notes

SESSION_SECRET=REPLACE_WITH_LONG_RANDOM_SESSION_SECRET
SESSION_TTL_DAYS=180

S3_ENDPOINT=http://minio:9000
S3_BUCKET=notes-assets
S3_ACCESS_KEY=notes
S3_SECRET_KEY=REPLACE_WITH_LONG_RANDOM_MINIO_PASSWORD

SEED_OWNER_USERNAME=asher
SEED_OWNER_PASSWORD=REPLACE_WITH_TEMP_OWNER_PASSWORD
SEED_OWNER_DISPLAY_NAME=Asher
SEED_WORKSPACE_NAME=Private Notes
```

Rules:

- `POSTGRES_PASSWORD` must match the password inside `DATABASE_URL`.
- `APP_URL` must match the real public HTTPS URL exactly.
- Do not include a trailing slash in `APP_URL` or `API_URL`.
- Keep MinIO private. Do not make a public Cloudflare hostname for MinIO.

## 4. Configure Komodo services

In the Stack settings, ignore these services for normal health/status expectations if Komodo provides an ignore list:

```text
create-bucket
seed
```

Reason:

- `create-bucket` is a one-shot init service and exits after creating the bucket.
- `seed` is an optional profile service and should not run continuously.

## 5. Deploy the stack

Deploy the Stack in Komodo.

Watch the logs in this order:

1. `postgres`
2. `minio`
3. `create-bucket`
4. `api`
5. `collab`
6. `app-web`
7. `caddy`

Expected result:

- `postgres` becomes healthy.
- `minio` stays running.
- `create-bucket` exits successfully.
- `api` runs database migrations and starts.
- `collab` starts.
- `app-web` starts preview server.
- `caddy` listens on `127.0.0.1:18080`.

## 6. Seed the owner user

After the first successful deploy, run the `seed` service once.

Preferred method in Komodo:

1. Open the `notes` Stack.
2. Find an action for running a one-off service or compose command.
3. Run the service/profile:

```bash
docker compose -f docker-compose.prod.yml --profile seed run --rm seed
```

Alternative from a shell on the server:

```bash
cd /opt/stacks/notes
sudo docker compose -f docker-compose.prod.yml --profile seed run --rm seed
```

The seed script is idempotent. If the owner already exists, it exits without creating a duplicate.

## 7. Create the Cloudflare Tunnel route

Use your existing Cloudflare Tunnel if one already runs on the same server.

In the Cloudflare dashboard:

1. Go to **Zero Trust**.
2. Go to **Networks** > **Tunnels**.
3. Open your existing tunnel, or create a new tunnel.
4. Go to **Public Hostnames**.
5. Add a hostname:

| Field | Value |
| --- | --- |
| Subdomain | `notes` |
| Domain | `example.com` |
| Type | `HTTP` |
| URL | `localhost:18080` |

This routes:

```text
https://notes.example.com -> Cloudflare Tunnel -> http://localhost:18080 -> Caddy -> app/api/collab
```

## 8. Test the web app

Open:

```text
https://notes.example.com
```

On the website login page:

- Leave **Server URL** blank.
- Username: value from `SEED_OWNER_USERNAME`
- Password: value from `SEED_OWNER_PASSWORD`

## 9. Test the iPhone app

In the iPhone app login screen:

- Server URL: `https://notes.example.com`
- Username: value from `SEED_OWNER_USERNAME`
- Password: value from `SEED_OWNER_PASSWORD`

The iPhone app needs the Server URL because it runs from the native app bundle, not from the website origin.

## 10. Update flow

For normal updates:

1. Push changes to `main`.
2. Open Komodo.
3. Redeploy the `notes` Stack.
4. Watch logs for `api`, `collab`, `app-web`, and `caddy`.

For iPhone app updates:

1. Pull latest repo on the Mac.
2. Run:

```bash
cd apps/web
pnpm install
pnpm app:ios:copy
pnpm app:ios:open
```

3. In Xcode, clean build folder.
4. Run the app.

## 11. Backup requirements

Back up these Docker volumes:

- `notes_postgres-data`
- `notes_minio-data`

Also back up the Komodo Stack environment values. Without the environment secrets, restoring sessions and storage access can be painful.

Minimum backup rhythm:

- Daily Postgres dump.
- Daily MinIO backup.
- Off-server copy.
- Monthly restore test.

## 12. Troubleshooting

### Web opens but login fails

Check:

- `api` logs
- `APP_URL`
- `SESSION_SECRET`
- `DATABASE_URL`
- whether the seed service has been run

### iPhone app login fails

Check the Server URL field. It must be the public HTTPS URL, for example:

```text
https://notes.example.com
```

### Collaboration does not work

Check:

- `collab` logs
- Cloudflare hostname points to `localhost:18080`
- Caddy logs
- Browser dev tools websocket connection to `/collab`

Expected websocket URL:

```text
wss://notes.example.com/collab
```

### Images do not upload

Check:

- `minio` logs
- `create-bucket` logs
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT=http://minio:9000`

### `create-bucket` shows exited

That is normal. It is a one-shot service.

### `seed` shows exited

That is normal. It is a one-shot service.
