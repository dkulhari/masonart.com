# MasonArt — Deployment Guide

## Prerequisites

- [Railway CLI](https://docs.railway.com/guides/cli) installed (`npm i -g @railway/cli`)
- Railway account with project created
- GitHub repository connected to Railway
- Domain name configured (DNS)

## Architecture

```
┌──────────────┐     ┌──────────────┐
│   Web (SSR)  │────▶│   API        │
│   Port 3001  │     │   Port 3000  │
│   Node.js    │     │   Bun        │
└──────────────┘     └──────┬───────┘
                            │
                   ┌────────┴────────┐
                   │                 │
              ┌────▼────┐     ┌─────▼────┐
              │ Postgres │     │  Redis   │
              │   16     │     │   7      │
              └──────────┘     └──────────┘
```

Both services are built from a single Dockerfile using multi-stage targets.

## Railway Setup

### 1. Create Project

```bash
railway login
railway init
```

### 2. Add Services

In Railway dashboard:
1. Add **PostgreSQL** plugin → provides `DATABASE_URL`
2. Add **Redis** plugin → provides `REDIS_URL`
3. Add service **api** → Dockerfile target: `api`
4. Add service **web** → Dockerfile target: `web`

### 3. Configure Build Targets

For each service, set the Docker build target in Railway settings:

**API Service:**
- Builder: Dockerfile
- Build target: `api`
- Port: `3000`
- Health check: `/api/health`

**Web Service:**
- Builder: Dockerfile
- Build target: `web`
- Port: `3001`
- Health check: `/`

### 4. Set Environment Variables

Set the following in Railway dashboard for the **API service**:

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` | Yes |
| `DATABASE_URL` | (auto from PostgreSQL plugin) | Yes |
| `REDIS_URL` | (auto from Redis plugin) | Yes |
| `CORS_ORIGIN` | `https://masonart.com,https://www.masonart.com` | Yes |
| `BETTER_AUTH_SECRET` | (generate: `openssl rand -base64 32`) | Yes |
| `RAZORPAY_KEY_ID` | (from Razorpay dashboard) | Yes |
| `RAZORPAY_KEY_SECRET` | (from Razorpay dashboard) | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | (from Razorpay webhook config) | Yes |
| `RESEND_API_KEY` | (from Resend dashboard) | Yes |
| `TWO_FACTOR_API_KEY` | (from 2Factor.in dashboard) | Yes |
| `SENTRY_DSN` | (from Sentry project) | Optional |
| `SLACK_WEBHOOK_URL` | (from Slack app) | Optional |

For the **Web service**:

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3001` | Yes |
| `VITE_API_URL` | (internal URL of API service) | Yes |
| `VITE_SENTRY_DSN` | (from Sentry project) | Optional |

### 5. Configure Custom Domain

In Railway service settings:
1. Add custom domain: `masonart.com`
2. Add custom domain: `www.masonart.com`
3. Configure DNS:
   - `A` record for `masonart.com` → Railway IP
   - `CNAME` record for `www` → Railway domain

### 6. Deploy

```bash
# Deploy from current branch
railway up

# Or auto-deploy from GitHub
# (Configure in Railway dashboard → Settings → Deploy)
```

## Database Migrations

Run migrations before first deploy and after schema changes:

```bash
# Connect to Railway database
railway run bun run db:migrate --cwd packages/api

# Or use Railway shell
railway shell
cd packages/api && bun run db:migrate
```

## Monitoring

### Health Check

```bash
curl https://api.masonart.com/api/health
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

### Logs

```bash
# Stream API logs
railway logs --service api

# Stream Web logs
railway logs --service web
```

### Error Tracking

- **Sentry dashboard**: Check for unhandled exceptions
- **Slack #prod-alerts**: Real-time critical error notifications

## Rollback

### Quick Rollback (Railway)

1. Go to Railway dashboard → Deployments
2. Click on the previous successful deployment
3. Click "Redeploy"

### Git-Based Rollback

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Railway auto-deploys from main
```

### Database Rollback

Drizzle ORM does not support automatic rollbacks. For schema issues:

1. Identify the problematic migration
2. Write a manual rollback SQL script
3. Execute via Railway shell:
   ```bash
   railway shell
   psql $DATABASE_URL -f rollback.sql
   ```

## Troubleshooting

### API returns 503

Check health endpoint: `curl /api/health`
- If database unhealthy: Check `DATABASE_URL`, PostgreSQL plugin status
- If Redis unhealthy: Check `REDIS_URL`, Redis plugin status

### Web shows blank page

- Check `VITE_API_URL` points to the API service internal URL
- Check Railway logs for SSR errors: `railway logs --service web`

### Auth not working

- Verify `BETTER_AUTH_SECRET` is set
- Check `CORS_ORIGIN` includes your domain
- Ensure cookies are set with `Secure` flag (HTTPS required)

### Payments failing

- Verify using live Razorpay keys (not test keys `rzp_test_*`)
- Check `RAZORPAY_WEBHOOK_SECRET` matches webhook config
- Verify webhook URL is configured in Razorpay dashboard

### Email/SMS not sending

- Check `RESEND_API_KEY` / `TWO_FACTOR_API_KEY` are set
- Verify sender domain is verified in Resend
- Check API logs for delivery errors
