# chobi.art — Go to Production Plan

**Date:** 2026-02-18
**Current Production Readiness Score:** 58/100
**Target:** Launch-ready with core functionality, security, and observability

---

## Executive Summary

chobi.art has a strong foundation — 86.6% feature completion (200/231 tickets), solid CI pipeline, and production-ready payment/email/SMS integrations. However, critical gaps in deployment infrastructure, security headers, routing bugs, and observability must be addressed before launch.

---

## P0 — Must Fix Before Launch

### 1. Critical Bug Fixes

Six tracked tickets represent broken core functionality:

| Ticket | Issue | Impact |
|--------|-------|--------|
| #240 | All static/info pages return 404 (about, contact, FAQ, shipping, returns, privacy, terms, cookies) | Legal compliance, user trust |
| #241 | `sitemap.xml` returns 404 HTML instead of XML | SEO — search engines can't crawl |
| #242 | Forgot password page (`/auth/forgot-password`) returns 404 | Users locked out of accounts |
| #243 | Missing static assets (favicon.ico, apple-touch-icon.png, site.webmanifest) | Broken branding, PWA support |
| #261 | Auth sign-up endpoint returns 500 for all validation errors | Users can't register |
| #264 | Web server (SSR) missing ALL security headers | Security vulnerability |

### 2. Deployment Infrastructure

**Current state:** CI exists (GitHub Actions), but zero deployment infrastructure.

| Item | What's Needed | Notes |
|------|---------------|-------|
| Production Dockerfile | Multi-stage build for API + Web | Bun-based, optimize for image size |
| Health check endpoint | `GET /api/health` returning DB/Redis/queue status | Required by all hosting platforms |
| Deployment target config | Railway, Fly.io, AWS ECS, or similar | Choose platform, add config files |
| Production `docker-compose.yml` | Separate from dev compose | Production-optimized services |
| Deployment documentation | Runbook for deploy, rollback, troubleshooting | Operational readiness |

### 3. Security Hardening

**Current state:** API has `secureHeaders()` middleware. Web server has nothing.

| Item | What's Needed | Notes |
|------|---------------|-------|
| CORS production config | Set `CORS_ORIGIN` to production domain | Currently defaults to `localhost:3001` |
| CSP headers | Content Security Policy on both API and web | Prevent XSS, injection |
| HSTS header | HTTP Strict-Transport-Security | Force HTTPS |
| Web server security headers | Add security middleware to React Router SSR server | Ticket #264 — HIGH priority |
| Rate limiting on auth | Wire up existing rate limit middleware on `/api/auth/*` | Prevent brute force |

---

## P1 — Should Have at Launch

### 4. Observability & Monitoring

**Current state:** `console.log`/`console.error` only. No error tracking, no APM.

| Item | What's Needed | Notes |
|------|---------------|-------|
| Error tracking (Sentry) | SDK integration in API + Web | Catch errors before users report them |
| Structured logging | Replace console.* with pino or winston | Queryable, leveled logs |
| Error alerting | Slack/email alerts on error spikes | Respond to incidents quickly |
| Uptime monitoring | External health check monitoring | UptimeRobot, BetterUptime, etc. |

### 5. Remaining Critical Bug Fixes

| Ticket | Issue | Impact |
|--------|-------|--------|
| #255 | Account Settings page returns 404 | Users can't manage their account |
| #245 | Health check response format non-compliant | Deployment platform compatibility |

---

## P2 — Address Within Weeks of Launch

### 6. SEO & Performance

| Item | What's Needed | Notes |
|------|---------------|-------|
| JSON-LD structured data (#244) | Add to product pages, homepage | Rich search results |
| Bundle analysis | rollup-plugin-visualizer | Identify bloat |
| Code splitting optimization | Lazy routes, dynamic imports | Faster initial load |
| Image optimization | Sharp/imagemin pipeline, WebP | Reduce bandwidth |
| Compression middleware | gzip/brotli on API responses | Smaller payloads |

### 7. Database Production Readiness

| Item | What's Needed | Notes |
|------|---------------|-------|
| Connection pooling | PgBouncer or built-in pool tuning | Handle concurrent connections |
| Backup procedures | Automated daily backups with retention | Data safety |
| Migration rollback plan | Document manual rollback procedures | Drizzle lacks auto-rollback |

### 8. Resilience

| Item | What's Needed | Notes |
|------|---------------|-------|
| Email/SMS retry logic | Retry transient failures with backoff | Prevent lost notifications |
| Payment webhook idempotency | Verify duplicate webhook handling | Prevent double-processing |
| Circuit breaker for external services | Graceful degradation when Resend/2Factor down | Prevent cascade failures |

---

## What's Already Production-Ready

| Area | Status | Details |
|------|--------|---------|
| Payment (Razorpay) | Ready | Auto-switches test/live by key prefix |
| Email (Resend) | Ready | Dev/prod mode handling, template system |
| SMS (2Factor.in) | Ready | Dev/prod mode handling, OTP verification |
| Auth (Better Auth) | Ready | Email verification enforced in prod, RBAC |
| Database schema | Ready | 200 tickets implemented, migrations working |
| CI pipeline | Ready | GitHub Actions: unit + integration + E2E |
| Core features | 86.6% | Product catalog, cart, checkout, admin panel, AI generator, reviews, wallet |

---

## Implementation Order

```
Week 1: P0 Bug Fixes + Security
  ├── Fix routing bugs (#240, #241, #242, #243)
  ├── Fix auth validation (#261)
  ├── Add security headers to web server (#264)
  ├── Set production CORS config
  └── Add rate limiting to auth endpoints

Week 2: P0 Deployment + P1 Observability
  ├── Create production Dockerfile
  ├── Add /api/health endpoint
  ├── Choose & configure deployment target
  ├── Integrate Sentry
  ├── Add structured logging (pino)
  └── Set up uptime monitoring

Week 3: P1 Remaining + P2 Start
  ├── Fix #255 (Account Settings)
  ├── Add JSON-LD structured data
  ├── Bundle analysis & optimization
  ├── Database backup procedures
  └── Deployment documentation / runbook

Week 4: P2 Resilience & Polish
  ├── Connection pooling
  ├── Email/SMS retry logic
  ├── Compression middleware
  ├── Image optimization
  └── Final security audit
```

---

## Success Criteria

- [ ] All P0 bugs fixed and verified
- [ ] Production Dockerfile builds and runs successfully
- [ ] Health check endpoint returns valid JSON with component status
- [ ] Security headers present on all responses (API + Web)
- [ ] Sentry capturing errors in staging
- [ ] Deployment to staging environment succeeds
- [ ] Load test: handles 100 concurrent users without errors
- [ ] All E2E tests pass against staging
- [ ] Production environment variables documented and configured
- [ ] Deployment runbook reviewed by team
