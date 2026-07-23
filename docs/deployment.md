# chobii.art — Deployment Guide

> **⚠️ SUPERSEDED (2026-07-17).** Production deploys now use the
> Makefile/GHCR flow behind the shared platform edge stack — see
> [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md), [OPERATIONS.md](OPERATIONS.md), and
> `deploy/Makefile`. In particular: images are built on the dev machine
> (never the mini), schema changes run `make -C deploy migrate`
> (`drizzle-kit migrate` — **never `db:push` against prod**), and chobii.art
> runs no cloudflared of its own. This file is kept for the local
> build-on-host walkthrough only.

## Prerequisites

- Docker & Docker Compose installed
- [Cloudflare account](https://dash.cloudflare.com/) (free plan)
- [`cloudflared` CLI](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed
- Domain name added to Cloudflare (nameservers pointed to Cloudflare)

## Architecture

```
Users → chobii.art → Cloudflare Edge → Cloudflare Tunnel
                                              │
                                    ┌─────────┘
                                    ▼
                          Your Local Machine
                       (Docker Compose Stack)
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       ┌──────────┐         ┌──────────┐          ┌──────────┐
       │   Web    │────────▶│   API    │─────────▶│ Postgres │
       │  :3001   │         │  :3000   │          │   :5432  │
       │ Node.js  │         │   Bun    │     ┌───▶│  16-alp  │
       └──────────┘         └────┬─────┘     │    └──────────┘
                                 │           │
                                 ▼           │    ┌──────────┐
                            ┌─────────┐      │    │  Redis   │
                            │  Redis  │◀─────┘    │  :6379   │
                            │  :6379  │           └──────────┘
                            └─────────┘
                                 │
                            Cloudflare R2
                          (image storage)
```

All services run locally via Docker Compose. Cloudflare Tunnel exposes them to the internet.

## Initial Setup

### 1. Cloudflare Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create chobii

# Note the tunnel ID and credentials file path
# Credentials are saved to ~/.cloudflared/<TUNNEL_ID>.json
```

### 2. Configure Tunnel Routes

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/):

1. Go to **Networks → Tunnels** → select your tunnel
2. Add public hostname routes:

| Subdomain | Domain | Service |
|-----------|--------|---------|
| (empty) | chobii.art | `http://web:3001` |
| www | chobii.art | `http://web:3001` |
| api | chobii.art | `http://api:3000` |

Or configure via CLI with a config file at `docker/cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: api.chobii.art
    service: http://api:3000
  - hostname: chobii.art
    service: http://web:3001
  - hostname: www.chobii.art
    service: http://web:3001
  - service: http_status:404
```

### 3. Get Tunnel Token

In Cloudflare dashboard → Tunnels → your tunnel → **Install connector** → copy the token.

Add it to your `.env`:
```
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

### 4. Create Production `.env`

```bash
cp .env.example .env.production
```

Fill in all required values:

```bash
# ── Core ──────────────────────────────────────
NODE_ENV=production
APP_URL=https://chobii.art
CORS_ORIGIN=https://chobii.art,https://www.chobii.art

# ── Database ──────────────────────────────────
POSTGRES_USER=chobii
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=chobii

# ── Auth ──────────────────────────────────────
BETTER_AUTH_SECRET=<generate: openssl rand -hex 32>

# ── Payments ──────────────────────────────────
RAZORPAY_KEY_ID=<from razorpay dashboard>
RAZORPAY_KEY_SECRET=<from razorpay dashboard>
RAZORPAY_WEBHOOK_SECRET=<from razorpay webhook config>

# ── Email ─────────────────────────────────────
RESEND_API_KEY=<from resend.com>
EMAIL_FROM=noreply@chobii.art

# ── SMS ───────────────────────────────────────
TWO_FACTOR_API_KEY=<from 2factor.in>

# ── Storage (Cloudflare R2) ───────────────────
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY=<from R2 API tokens>
R2_SECRET_KEY=<from R2 API tokens>
R2_BUCKET=masonart-prod
CDN_URL=https://cdn.chobii.art
VITE_CDN_URL=https://cdn.chobii.art

# ── Frontend ──────────────────────────────────
VITE_API_URL=https://api.chobii.art

# ── Cloudflare Tunnel ─────────────────────────
CLOUDFLARE_TUNNEL_TOKEN=<from tunnel setup>

# ── Observability (optional) ──────────────────
SENTRY_DSN=
VITE_SENTRY_DSN=
SLACK_WEBHOOK_URL=
LOG_LEVEL=info
```

### 5. Build & Start

```bash
# Build and start all services
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d --build

# Check all services are running
docker compose -f docker/docker-compose.prod.yml ps

# Check API health
curl http://localhost:3000/health
```

### 6. Run Database Migrations

```bash
# Run migrations inside the API container
docker compose -f docker/docker-compose.prod.yml exec api bun run db:push

# Or seed initial data
docker compose -f docker/docker-compose.prod.yml exec api bun run seed
docker compose -f docker/docker-compose.prod.yml exec api bun run seed:admin
```

### 7. Verify

- Open `https://chobii.art` — should load the web app
- Check `https://api.chobii.art/health` — should return healthy status
- Test payments with Razorpay test mode first

## Cloudflare R2 Setup

1. In Cloudflare dashboard → **R2** → Create bucket: `masonart-prod`
2. Go to **R2 → Manage R2 API Tokens** → Create token with read/write access
3. For CDN serving, connect a custom domain:
   - R2 bucket settings → **Custom Domains** → Add `cdn.chobii.art`
   - Cloudflare automatically creates the DNS record

## Day-to-Day Operations

### Viewing Logs

```bash
# All services
docker compose -f docker/docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker/docker-compose.prod.yml logs -f api
docker compose -f docker/docker-compose.prod.yml logs -f web
```

### Updating the App

```bash
# Pull latest code
git pull origin main

# Rebuild and restart (zero-downtime)
docker compose -f docker/docker-compose.prod.yml up -d --build

# Run migrations if schema changed
docker compose -f docker/docker-compose.prod.yml exec api bun run db:push
```

### Health Check

```bash
curl https://api.chobii.art/health
```

Expected response:
```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 2 }
  }
}
```

### Monitoring

- **Sentry dashboard**: Unhandled exceptions and performance
- **Slack #prod-alerts**: Real-time critical error notifications
- **Cloudflare Analytics**: Traffic, cache hit rates, security events

## Backup & Recovery

### Database Backup

```bash
# Manual backup
docker compose -f docker/docker-compose.prod.yml exec postgres \
  pg_dump -U chobii chobii > backup-$(date +%Y%m%d).sql

# Automated daily backup (add to crontab)
# 0 2 * * * cd /path/to/chobii.art && docker compose -f docker/docker-compose.prod.yml exec -T postgres pg_dump -U chobii chobii > /backups/chobii-$(date +\%Y\%m\%d).sql
```

### Restore from Backup

```bash
docker compose -f docker/docker-compose.prod.yml exec -T postgres \
  psql -U chobii chobii < backup-20260218.sql
```

### Redis Data

Redis is used for caching and job queues — data is ephemeral. No backup needed. Append-only file (AOF) is enabled for crash recovery.

## Rollback

### Quick Rollback

```bash
# Revert to previous commit
git revert HEAD
docker compose -f docker/docker-compose.prod.yml up -d --build
```

### Database Rollback

Drizzle ORM does not support automatic rollbacks. For schema issues:

1. Identify the problematic migration
2. Write a manual rollback SQL script
3. Execute:
   ```bash
   docker compose -f docker/docker-compose.prod.yml exec postgres \
     psql -U chobii chobii -f /path/to/rollback.sql
   ```

## Troubleshooting

### Site not accessible

1. Check tunnel is running: `docker compose -f docker/docker-compose.prod.yml logs cloudflared`
2. Check tunnel status in Cloudflare dashboard → Tunnels
3. Verify DNS records point to the tunnel

### API returns 503

Check health endpoint: `curl http://localhost:3000/health`
- If database unhealthy: Check postgres container logs
- If Redis unhealthy: Check redis container logs

### Web shows blank page

- Check `VITE_API_URL` is set to `https://api.chobii.art`
- Check web container logs for SSR errors

### Auth not working

- Verify `BETTER_AUTH_SECRET` is set
- Check `CORS_ORIGIN` includes your domain
- Ensure you're accessing via HTTPS (Cloudflare provides SSL automatically)

### Payments failing

- Verify using live Razorpay keys (not test keys `rzp_test_*`)
- Check `RAZORPAY_WEBHOOK_SECRET` matches webhook config
- Configure webhook URL in Razorpay dashboard: `https://api.chobii.art/api/webhooks/razorpay`

### Email/SMS not sending

- Check `RESEND_API_KEY` / `TWO_FACTOR_API_KEY` are set
- Verify sender domain (`chobii.art`) is verified in Resend
- Check API logs for delivery errors

### Images not loading

- Verify R2 bucket exists and credentials are correct
- Check `CDN_URL` matches the R2 custom domain
- Test with: `curl https://cdn.chobii.art/products/test.jpg`
