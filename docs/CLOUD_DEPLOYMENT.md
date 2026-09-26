# Cloud Deployment

ChallengeON uses the following deployment layout:

- GitHub: source of truth
- Vercel: Vite frontend
- Supabase Free: PostgreSQL
- Google Cloud Run: Express API, YouTube uploads, and scheduled jobs
- Firebase: existing user authentication

The initial deployment uses World Chain Sepolia. Do not switch to mainnet until the complete upload, authentication, signature, and prize flows pass end-to-end testing.

## 1. Supabase PostgreSQL

1. Create a Supabase project near the Cloud Run region.
2. Open **Connect** and copy the shared pooler **session mode** URI.
3. Back up the current local PostgreSQL `public` schema and data with PostgreSQL 18 `pg_dump` using `--no-owner --no-privileges`.
4. Restore that dump to the Supabase session pooler connection with `pg_restore`.
5. Compare source and target row counts before allowing writes to the new database.
6. Save the Supabase URI as Cloud Run's `DATABASE_URL` secret.
7. Do not append `sslmode` to the URI. The backend supplies its own TLS options;
   URI-level SSL parameters override those options in `pg`.

Follow Supabase's official **Migrate from Postgres to Supabase** dump/restore procedure. Do not migrate PostgreSQL roles or ownership. The backend runs `backend/schema.sql` and its idempotent migrations on startup after the existing data is restored. The free database limit is 500 MB, so monitor table and index size.

## 2. Cloud Run API

Build and deploy the repository root so the Docker image includes both `backend/` and `config/`.

Recommended initial service settings:

- Region: `asia-northeast3` (Seoul)
- Memory: 1 GiB
- CPU: 1
- Concurrency: 10
- Request timeout: 900 seconds
- Minimum instances: 0
- Maximum instances: 2
- Public ingress: enabled for the application API

Required Cloud Run secret:

- `RUNTIME_SECRETS_JSON`: a single JSON object containing `DATABASE_URL`,
  `FIREBASE_SERVICE_ACCOUNT_JSON`, YouTube credentials, `CRON_SECRET`, API tokens,
  admin allowlists, and private signer keys needed by enabled features.

The bundled secret keeps the deployment within Secret Manager's six-active-version
free allowance. Individual environment variables still override bundled values for
local development and emergency configuration.

Required configuration:

```env
DEPLOY_NETWORK=worldchainSepolia
UNON_NETWORK_CONFIG_PATH=../config/unon-networks.json
ENABLE_IN_PROCESS_JOBS=false
ENABLE_STARTUP_DATA_MAINTENANCE=false
VIDEO_MAINTENANCE_ENABLED=true
PGPOOL_MAX=5
CORS_ORIGINS=https://<vercel-production-domain>
```

Verify `GET https://<cloud-run-host>/health` returns `{ "status": "ok" }`.

## 3. Scheduled jobs

Cloud Run can stop allocating CPU after a request finishes, so production does not use in-process timers. Schedule protected requests with Supabase Cron or Google Cloud Scheduler.

Each request must include `x-cron-secret: <CRON_SECRET>`:

```text
POST /api/internal/jobs/trend-sync
POST /api/internal/jobs/video-maintenance
POST /api/internal/jobs/unon-sync
```

Suggested starting schedules:

- Trend sync: every hour
- Video maintenance: every six hours
- UNON sync: every two minutes only while testing; increase the interval after measuring RPC usage

Store the API URL and cron secret in Supabase Vault before creating `pg_cron` and `pg_net` jobs. Never place the secret directly in checked-in SQL.

## 4. Vercel frontend

Import `WorldChallengeBattle/ChallengeON` into Vercel as a Vite project.

Set these build environment variables using the existing frontend `.env` values:

- All `VITE_FIREBASE_*` values
- `VITE_MINIKIT_APP_ID`
- `VITE_WORLD_CHAIN_ID=4801`
- `VITE_API_BASE_URL=https://<cloud-run-host>`

The checked-in `vercel.json` provides SPA deep-link routing. Do not put backend or signer secrets in Vercel variables prefixed with `VITE_`; those values are public in the browser bundle.

## 5. Release verification

1. Confirm the API health endpoint and database initialization logs.
2. Confirm the Vercel app loads challenges from Cloud Run.
3. Sign in through Firebase and verify admin access separately.
4. Upload a video smaller than 28 MB and confirm it appears on YouTube and in PostgreSQL.
5. Invoke each scheduled endpoint once and inspect the API and Supabase Cron logs.
6. Verify the World App Sepolia transaction flow before considering mainnet.

## Free-tier constraints

- Cloud Run HTTP/1 requests are limited to 32 MiB. The app caps videos at 28 MB and records at a reduced bitrate.
- Cloud Run and Supabase can scale down or pause during inactivity, so the first request can be slower.
- Supabase Free database capacity is 500 MB.
- Vercel Hobby is restricted to personal, non-commercial use. Re-evaluate the Vercel plan before enabling real platform fees or other commercial operation.
