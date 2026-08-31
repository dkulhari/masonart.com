# chobii.art — Operations Manual (Day-2 Runbook)

The deployed environment (`chobii.art` — **production**; Razorpay still in test mode until the live-keys go-live step) runs on the shared Mac mini behind a Cloudflare Tunnel — see [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md) for architecture and [RUNBOOK-OUTAGE.md](RUNBOOK-OUTAGE.md) for outage triage. All deploy orchestration is from the **dev machine** via `make -C deploy <target>`; the mini holds no repo checkout, no build toolchain, and no `.env` — only the rendered compose file at `~/chobii-docker-compose.yml` and a read-only GHCR credential.

## 1. Deploying

```bash
# Every deploy — build both images (linux/arm64), push to GHCR
# (tags: latest + git short-sha), render compose, ship, pull, up:
make -C deploy build-push-deploy

# Schema changed? run migrations after the new api container is up:
make -C deploy migrate

# Roll back to a previous version:
make -C deploy deploy IMAGE_TAG=<git-short-sha>
```

After every deploy: **purge the Cloudflare cache** (dashboard → Caching → Purge Everything, or scripted via API in the Makefile). The edge caches 404s per-PoP for ~5 minutes and browsers cache them up to 4h — a client that loaded HTML mid-recreate can otherwise wedge on stale chunk 404s.

Verify from outside the LAN (phone on LTE, not home Wi-Fi):
```bash
curl -si https://chobii.art/ | head -1          # 200
curl -si https://chobii.art/api/health | head -1 # 200 + component status
```

**Panic switch**: `chobii.art` is routed by its own tunnel public hostname, but the fastest off-switch is still the containers, not Cloudflare. Take chobii.art offline by stopping its containers — `ssh <mini> "docker compose -f ~/chobii-docker-compose.yml stop api web"` (traefik then serves a bare 404) — and restore with `start`. Do **not** disable the tunnel: it serves every app on the mini, including customs-copilot.

### Env contract

Secrets live only in `deploy/.env` on the dev machine (gitignored; template `deploy/.env.example`). They reach the mini solely baked into the rendered compose file. Critical vars carry `:?` guards so a missing value fails at render time instead of degrading silently in prod (silent-failure class: unset `RESEND_API_KEY` → no verification emails → signups dead-end; unset R2 keys → uploads black-hole).

Contract (see `.env.example` for descriptions): `POSTGRES_*`, `BETTER_AUTH_SECRET`, `APP_URL`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `TWO_FACTOR_API_KEY`, `R2_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`, `CDN_URL`, `VITE_CDN_URL`, `REPLICATE_API_TOKEN` / `GOOGLE_AI_STUDIO_KEY`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SLACK_WEBHOOK_URL`, `LOG_LEVEL`, rate-limit tunables.

## 2. Backups

Postgres is the only backed-up service. No host port is published, so everything goes through `docker compose exec`.

**Nightly cron on the mini** (offset from customs-copilot's 02:15 job):
```cron
45 2 * * * docker compose -f ~/chobii-docker-compose.yml exec -T postgres pg_dump -U chobii -Fc chobii > /backups/chobii-$(date +\%F).dump && find /backups -name 'chobii-*.dump' -mtime +14 -delete
```

**Quarterly restore drill** — a backup that has never been restored is a hope, not a backup:
```bash
C="docker compose -f ~/chobii-docker-compose.yml exec -T postgres"
$C createdb -U chobii chobii_restore_test
$C pg_restore -U chobii -d chobii_restore_test < /backups/chobii-<date>.dump
$C psql -U chobii -d chobii_restore_test -c "SELECT count(*) FROM orders; SELECT count(*) FROM products; SELECT count(*) FROM \"user\";"
$C dropdb -U chobii chobii_restore_test
```

- **R2 (images)**: customer photo uploads and AI generations are **not reproducible** — bucket versioning must stay on. Product catalog images are re-uploadable from source assets.
- **Redis**: cache + BullMQ queues only. AOF is enabled for crash recovery; no backups. Losing it means in-flight AI jobs are lost (users can regenerate) and sessions/cache rebuild.

## 3. Routine checks

```bash
# Container status — expect 4 services Up (healthy): api, web, postgres, redis
docker compose -f ~/chobii-docker-compose.yml ps

# Shared ingress (platform stack) — expect platform-traefik + platform-tunnel Up
docker ps --filter name=platform-

# Logs (pino JSON on api)
docker compose -f ~/chobii-docker-compose.yml logs -f api
docker compose -f ~/chobii-docker-compose.yml logs -f web
docker logs -f platform-tunnel        # tunnel (shared with customs-copilot)

# Memory headroom — shared 6GB Colima VM with customs-copilot;
# no container should sit near its mem_limit
docker stats --no-stream
```

- **Uptime**: UptimeRobot on `/api/health` + homepage → Slack `#prod-alerts`.
- **Errors**: Sentry (api + web projects); critical errors also fire the Slack webhook.
- **Tunnel**: Cloudflare Zero Trust → Tunnels → the **platform tunnel** shows HEALTHY with **exactly one** connector replica (`linux_arm64`). Two replicas = intermittent 502s. Route debugging: traefik dashboard is loopback-only on the mini — `ssh -L 8080:localhost:8080 dhruv@<mini>` → http://localhost:8080.
- **AI queue**: admin panel generation queue; failed BullMQ jobs are visible in api logs (`aiGenerationWorker` failed events).

## 3b. The audit trail

**Where to look first when someone asks "who did this".** `/admin/audit-log`, filtered by
entity — `?entityType=order&entityId=<id>` answers a disputed order without scrolling.
Admin and super-admin only; content-managers get a 403 (rows carry customer emails).

**What is captured.** Every mutating request under `/api/admin/*` and `/api/vendor/*`
lands a row, whether or not its handler opted in — the middleware floor records the
coarse `admin.request` / `vendor.request` entry, and instrumented handlers upgrade it to a
named action with a before/after delta. Money and privilege paths (refunds, order
cancellation, gift cards, role changes) are all instrumented, and so are refusals: a
rejected privilege change is recorded with `outcome: failure` rather than dropped.

**Correlating with logs.** Every response carries `x-request-id` (from `x-request-id`,
else `cf-ray`, else generated); the same id is on every log line for that request and in
the audit row's `request_id`. A user reporting a 500 can quote the id from the error body.

```bash
# Every log line for one request
docker compose -f ~/chobii-docker-compose.yml logs api | grep '<request-id>'
```

**Rows cannot be edited or deleted.** A database trigger refuses every `UPDATE` and every
`DELETE` that has not set `chobii.audit_purge` inside its transaction — which only the
retention job does. If a statement fails with `admin_audit_log is append-only`, that is
the trigger working, not a bug. Note the corollary: a `DELETE FROM "user"` for someone who
appears in the log is fine (there is no foreign key), but any attempt to "clean up" audit
rows by hand will be refused.

**Retention.** `AUDIT_RETENTION_DAYS`, default **400** — a financial year plus the disputes
that trail it. The purge runs at startup and daily thereafter, inside the API process; a
value below 1 or unparseable falls back to the default rather than deleting everything.
DPDP applies to this table: rows carry customer emails, so shortening the window is a
compliance decision, not a disk one.

**If the trail goes quiet.** `alertCritical` fires on a failed audit write ("Audit write
failed"). The business action still succeeded — by design, an audit failure never rolls
back a refund — so the row is missing, not the money. Check the API logs for
`audit write failed` and the database for connection saturation.

## 3c. Object-store CORS, and why QC photographs fail silently without it

**Check before a vendor does:**

```bash
node scripts/check-bucket-cors.mjs https://chobii.art
```

Run it against the **production** bucket. A pass in dev proves nothing — MinIO
echoes back any Origin it is sent, so the script reports INCONCLUSIVE there, by
design.

**What breaks.** The vendor portal displays QC photographs by fetching the bytes
and rendering them from a local `blob:` URL, never by putting a presigned URL in
an `<img src>`. That is required, not stylistic: R2 of the customer-data rule
forbids a signed URL being parked in the portal's DOM, and the vendor test suite
bans `X-Amz-Signature` from that screen's markup.

So the browser makes a cross-origin GET, and the bucket must allow it.

**Why it hides.** The presigned PUT already needs CORS, so *uploading* works and
looks healthy. The GET is the new dependency. If the bucket allows only PUT,
every photo slot renders "could not be shown" while nothing else appears wrong.
The failure is graceful — it never falls back to a link carrying the signature —
which is exactly why nobody notices.

It is not cosmetic. Photo QC is what gates the shipping label, so a vendor who
cannot display their own photographs cannot prove they did the work, and the
order cannot progress.

**What no test will tell you.** Every vendor suite mocks the store; 149 tests
pass against a mock. The first real signal would be a vendor reporting that
photographs do not display, and nobody would suspect CORS, because uploading
worked.

**Required policy:** `GET` and `PUT`, for the production app origin and whatever
origin staging runs on, plus the preflight the browser sends.

Prefer configuration checked in, or at minimum a documented dashboard step here.
An unrecorded manual step is a defect in its own right — that is the lesson of
the audit-log trigger (#663), where a missing raw-SQL object survived because
nothing recorded that it had to exist.

## 4. Do-not rules

- **Payment state belongs to webhooks.** Never hand-edit order/payment status in the DB — redeliver the webhook from the Razorpay dashboard; idempotency makes duplicates safe.
- **Money is paise integers.** Never hand-insert or mutate payment/wallet rows outside a declared incident with a written record.
- **Never run `db:push` against prod.** Schema changes go through committed drizzle migrations + `make migrate`.
- **Never `docker compose build` on the mini.** The rendered compose file has no `build:` keys by design; if compose ever tries to build, the rendered file is stale or wrong — re-run `make gen-compose deploy`.
- **Routing lives in traefik labels in the prod overlay.** Change routes only via a code change + deploy — never by hand-editing the rendered compose on the mini, and never by adding Cloudflare routes (the platform wildcard `*.xtoms.xyz → http://traefik:80` handles everything; per-app entries would shadow it).
- **Don't park secrets in the repo** — no PATs, no `rzp_` keys, not even in untracked files that could be committed later. `deploy/.env` only.

## 5. Standing caveats

- **Single-instance assumptions**: in-memory rate-limit state and the in-process BullMQ worker (inside `api`) assume exactly one api container. Scaling out requires moving rate limits to Redis and splitting the worker into its own service first.
- **Deploy window races**: compose recreate is not zero-downtime; deploy at low-traffic hours and purge the cache after.
- **DNS**: the mini needs its static DHCP reservation intact; if `DEPLOY_HOST` stops answering, check whether the lease drifted (RUNBOOK L1).
- **DLT compliance (SMS)**: 2Factor templates must remain approved; template edits require re-approval before the code referencing them ships.
- **Co-tenancy**: customs-copilot shares the VM. Before raising any chobii.art `mem_limit`, re-check the combined budget against the 6GB VM.
