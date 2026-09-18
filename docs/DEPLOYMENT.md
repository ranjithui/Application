# Deployment

## Option A — Docker (single image + PostgreSQL)

The root `Dockerfile` builds the API and the web app into one image; the API serves the SPA
from `WEB_DIST_DIR` on the same origin (so no CORS setup is needed for the web app).

1. Create a `.env` next to `docker-compose.yml` with `POSTGRES_PASSWORD`, `JWT_SECRET`,
   `JWT_REFRESH_SECRET` (long random values) and `CORS_ORIGINS` (your public URL, used by
   any other browser origin).
2. Build and start:

```bash
docker compose up -d --build
```

3. The container entrypoint (`backend/dist/scripts/start.js`) applies pending migrations, then starts the server on port 4000 in the same process.
4. Put a TLS-terminating reverse proxy (nginx, Caddy, a cloud load balancer) in front, forwarding to `app:4000`.
   `COOKIE_SECURE=true` is set, so the site must be served over HTTPS.
5. Create the first administrator (production never loads sample data):

```bash
docker compose exec db psql -U holysai -d holysai
```

   and insert a Super Admin user with a bcrypt hash generated offline, or run the seed once
   in a staging database and copy only the reference tables (roles, permissions,
   role_permissions, campuses, academic_years, classes, subjects, system_settings).

Persistent volumes: `pgdata` (database) and `uploads` (documents). Back both up.

## Option B — separate hosts

| Part | How |
|---|---|
| Database | Managed PostgreSQL 15+ (set `DATABASE_SSL=true` if required). Run `npm run db:migrate`. |
| API | `npm ci && npm run build --workspace backend`, then `NODE_ENV=production node backend/dist/src/server.js` under a process manager (systemd, PM2) behind a reverse proxy. |
| Web | `npm run build --workspace frontend` and serve `frontend/dist` from any static host / CDN with SPA fallback to `index.html`. Set `VITE_API_BASE_URL=https://api.example.com/api` at build time and add the web origin to `CORS_ORIGINS`. For cross-site cookies, host the web app and API on the same site (e.g. `app.` and `api.` subdomains) and set `COOKIE_DOMAIN`. |

nginx sketch for Option B (same host):

```nginx
server {
  listen 443 ssl http2;
  server_name school.example.com;
  root /srv/holysai/frontend/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 12m;
  }
  location / {
    try_files $uri /index.html;
  }
}
```

## Option C — Render + Supabase

`render.yaml` in the repo root deploys the whole app as **one** Render web service: the
Docker image serves the API and the SPA on a single origin, so the refresh-token cookie
stays `SameSite=Strict` and no CORS configuration is needed. Postgres and document storage
come from Supabase.

Two constraints drive this setup:

- **Use Supabase's connection pooler, not the direct host.** `db.<ref>.supabase.co` resolves
  to IPv6 only, and Render has no IPv6 outbound — connections there hang and then time out.
  The Supavisor pooler is dual-stack.
- **Render's filesystem is ephemeral.** Anything written locally is lost on every deploy and
  every restart, so uploaded documents must go to Supabase Storage (`STORAGE_DRIVER=supabase`).

### 1. Create the Supabase project

Note the database password when the project is created — it is shown only once.

From **Project Settings → Database → Connection string → Session pooler**, copy the URI:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Session mode (port 5432) suits this app: one long-lived Node process holding a small pool.
Transaction mode (port 6543) also works, but keep `DATABASE_POOL_MAX` low if you use it.

### 2. Copy the API credentials

From **Project Settings → API**, take the project URL (`https://<ref>.supabase.co`) and the
`service_role` key. That key bypasses row-level security, so it belongs on the server only —
never in the SPA, and never committed.

The `documents` storage bucket is created for you in step 3. It must stay **private**: the
API streams every download itself through `/api/documents/:id/download` after checking
permissions, so a public bucket would expose student records to anyone holding a URL. No
bucket policies are needed — the backend authenticates with the service role key.

### 3. Point .env at Supabase and check it

Everything in this step runs from your machine, not from Render. Put the Supabase values in
`.env` — they stay in that file and are never passed on a command line:

```ini
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_SSL=no-verify
NODE_ENV=development
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
STORAGE_DRIVER=supabase
```

Then:

```bash
npm run supabase:init
```

That checks the connection string is the pooler and not the IPv6-only direct host, connects
to Postgres and reports what is already there, creates the private bucket if it is missing,
and round-trips a test object through it. It is safe to re-run. Fix anything it reports
before going near Render — every one of these failures is much harder to diagnose from a
build log.

### 4. Load the schema and demo data

The seed refuses to run when `NODE_ENV=production`, by design — it writes fictional sample
data — and only runs against an empty database.

```bash
npm run db:migrate
npm run db:seed
```

The demo accounts in `LOGINS.txt` now exist on Supabase with the password from
`SEED_DEMO_PASSWORD`.

For a real deployment, run only `db:migrate` and create the first Super Admin directly.

Then put your local `DATABASE_URL` and `STORAGE_DRIVER=local` back, so local development
keeps using the local cluster.

### 5. Deploy on Render

Push the repo to GitHub, then **New → Blueprint** and point Render at it. `render.yaml` is
picked up automatically. Render generates `JWT_SECRET` and `JWT_REFRESH_SECRET`; you supply
the three values marked `sync: false`:

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | The session pooler URI from step 1 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` |

The blueprint deliberately sets **no `dockerCommand`** — the image's own `CMD` runs
`backend/dist/scripts/start.js`, which applies pending migrations and then starts the server
in the same process. That is idempotent: `migrate-lib` skips any file already recorded in
`schema_migrations`.

Do not "fix" this by adding `dockerCommand: sh -c "node …migrate.js && node …server.js"`.
Render does not hand the `&&` chain to the shell intact, so the whole string comes back as
`sh: node …: not found` and the deploy exits 127. Keeping node as PID 1 also means it
actually receives SIGTERM, so the graceful shutdown in `server.ts` runs on redeploys.

Render marks the service live once `/api/health` returns 200, which it only does after a
successful `SELECT 1`. A service stuck "in progress" almost always means `DATABASE_URL` is
pointing at the direct Supabase host rather than the pooler.

### Notes

- **`DATABASE_SSL=no-verify`** encrypts the connection but does not verify Supabase's
  certificate chain. To verify properly, download Supabase's CA bundle (Project Settings →
  Database → SSL configuration), set `DATABASE_SSL=true`, and paste the PEM into
  `DATABASE_CA_CERT`.
- **Region:** the blueprint uses Render's `singapore`, the closest to India. Create the
  Supabase project in a matching region — a mismatch adds ~200ms to every query.

### Free tier

The blueprint ships with `plan: free`, which is enough to test the whole stack end to end.
What to expect:

- **The service sleeps after 15 minutes without an inbound request**, and takes ~30–60s to
  wake. The first person to hit the site after a quiet spell will watch a blank tab. Note
  that the notification dispatcher in `server.ts` does *not* keep it awake — only incoming
  requests count.
- **Waking restarts the container**, so migrations re-run on every cold start. That is
  harmless (already-applied files are skipped) but adds a second or two.
- **If the Supabase project is paused, the service will not start at all.** The start command
  runs migrations first, those fail against a paused database, and the container exits.
  Resume Supabase, then redeploy. This is the most likely cause of a free deploy that worked
  yesterday and fails today.
- **Supabase free projects pause after ~1 week of inactivity** and need a manual resume from
  the dashboard.
- **512 MB RAM, 0.1 CPU.** Fine for demo traffic; `DATABASE_POOL_MAX` is set to 5 to match.
- **No persistent disk** — which is exactly why `STORAGE_DRIVER=supabase` matters here. On
  free, `local` storage would lose every uploaded document on each sleep/wake cycle, not just
  on deploys.

Going to `starter` removes the sleeping and raises the memory; nothing else in the blueprint
needs to change. Note this uses **Supabase** for Postgres, not Render's own free Postgres —
that one expires after 30 days, which is a trap worth avoiding.

## Production checklist

- [ ] `NODE_ENV=production` (enables `trust proxy`, hides error details, blocks reset/seed)
- [ ] Strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (different values, ≥ 48 random bytes)
- [ ] HTTPS everywhere; `COOKIE_SECURE=true`; correct `CORS_ORIGINS`
- [ ] Database backups and point-in-time recovery; restore tested
- [ ] Documents on persistent, backed-up storage: `STORAGE_DRIVER=supabase` (private bucket), or `local` with `UPLOAD_DIR` on a mounted disk — never `local` on an ephemeral filesystem
- [ ] Log shipping from stdout (pino JSON) to your log platform
- [ ] Notification providers configured (`WHATSAPP_*`, `SMS_*`, `SMTP_URL`, `PUSH_FCM_SERVER_KEY`) and adapters implemented in `notification.service.ts`
- [ ] Payment gateway integrated in place of the simulated charge in the finance service
- [ ] Sample GPS rows removed; real devices issued; guardian consent recorded
- [ ] Retention policy for `student_locations` and `audit_logs`
- [ ] Rate limits tuned (`RATE_LIMIT_*`) for your traffic; if running several API instances, use a shared rate-limit store

## Environment variables

See `.env.example` for the full list with comments. Required: `DATABASE_URL`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`.
