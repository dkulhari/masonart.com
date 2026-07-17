# MasonArt — Operations Manual (Day-2 Runbook)

Production runs on the shared Mac mini behind a Cloudflare Tunnel — see [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md) for architecture and [RUNBOOK-OUTAGE.md](RUNBOOK-OUTAGE.md) for outage triage. All deploy orchestration is from the **dev machine** via `make -C deploy <target>`; the mini holds no repo checkout, no build toolchain, and no `.env` — only the rendered compose file at `~/masonart-docker-compose.yml` and a read-only GHCR credential.

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
curl -si https://masonart.xtoms.xyz/ | head -1          # 200
curl -si https://masonart.xtoms.xyz/api/health | head -1 # 200 + component status
```

**Panic switch**: `masonart.xtoms.xyz` rides the platform wildcard, so there is no per-app Cloudflare route to remove. Take MasonArt offline by stopping its containers — `ssh <mini> "docker compose -f ~/masonart-docker-compose.yml stop api web"` (traefik then serves a bare 404) — and restore with `start`. Do **not** disable the tunnel: it serves every app on the mini, including customs-copilot.

### Env contract

Secrets live only in `deploy/.env` on the dev machine (gitignored; template `deploy/.env.example`). They reach the mini solely baked into the rendered compose file. Critical vars carry `:?` guards so a missing value fails at render time instead of degrading silently in prod (silent-failure class: unset `RESEND_API_KEY` → no verification emails → signups dead-end; unset R2 keys → uploads black-hole).

Contract (see `.env.example` for descriptions): `POSTGRES_*`, `BETTER_AUTH_SECRET`, `APP_URL`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `TWO_FACTOR_API_KEY`, `R2_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`, `CDN_URL`, `VITE_CDN_URL`, `REPLICATE_API_TOKEN` / `GOOGLE_AI_STUDIO_KEY`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SLACK_WEBHOOK_URL`, `LOG_LEVEL`, rate-limit tunables.

## 2. Backups

Postgres is the only backed-up service. No host port is published, so everything goes through `docker compose exec`.

**Nightly cron on the mini** (offset from customs-copilot's 02:15 job):
```cron
45 2 * * * docker compose -f ~/masonart-docker-compose.yml exec -T postgres pg_dump -U masonart -Fc masonart > /backups/masonart-$(date +\%F).dump && find /backups -name 'masonart-*.dump' -mtime +14 -delete
```

**Quarterly restore drill** — a backup that has never been restored is a hope, not a backup:
```bash
C="docker compose -f ~/masonart-docker-compose.yml exec -T postgres"
$C createdb -U masonart masonart_restore_test
$C pg_restore -U masonart -d masonart_restore_test < /backups/masonart-<date>.dump
$C psql -U masonart -d masonart_restore_test -c "SELECT count(*) FROM orders; SELECT count(*) FROM products; SELECT count(*) FROM \"user\";"
$C dropdb -U masonart masonart_restore_test
```

- **R2 (images)**: customer photo uploads and AI generations are **not reproducible** — bucket versioning must stay on. Product catalog images are re-uploadable from source assets.
- **Redis**: cache + BullMQ queues only. AOF is enabled for crash recovery; no backups. Losing it means in-flight AI jobs are lost (users can regenerate) and sessions/cache rebuild.

## 3. Routine checks

```bash
# Container status — expect 4 services Up (healthy): api, web, postgres, redis
docker compose -f ~/masonart-docker-compose.yml ps

# Shared ingress (platform stack) — expect platform-traefik + platform-tunnel Up
docker ps --filter name=platform-

# Logs (pino JSON on api)
docker compose -f ~/masonart-docker-compose.yml logs -f api
docker compose -f ~/masonart-docker-compose.yml logs -f web
docker logs -f platform-tunnel        # tunnel (shared with customs-copilot)

# Memory headroom — shared 6GB Colima VM with customs-copilot;
# no container should sit near its mem_limit
docker stats --no-stream
```

- **Uptime**: UptimeRobot on `/api/health` + homepage → Slack `#prod-alerts`.
- **Errors**: Sentry (api + web projects); critical errors also fire the Slack webhook.
- **Tunnel**: Cloudflare Zero Trust → Tunnels → the **platform tunnel** shows HEALTHY with **exactly one** connector replica (`linux_arm64`). Two replicas = intermittent 502s. Route debugging: traefik dashboard is loopback-only on the mini — `ssh -L 8080:localhost:8080 dhruv@<mini>` → http://localhost:8080.
- **AI queue**: admin panel generation queue; failed BullMQ jobs are visible in api logs (`aiGenerationWorker` failed events).

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
- **Co-tenancy**: customs-copilot shares the VM. Before raising any MasonArt `mem_limit`, re-check the combined budget against the 6GB VM.
