# chobii.art — External Services

Every third-party service production depends on: what it does, what credentials it needs, where they live, and the gotchas already paid for (mostly by customs-copilot's first deploy). All secrets live in `deploy/.env` on the dev machine only — never in the repo, never loose on the mini.

| Service | Purpose | Credentials | Where stored |
|---|---|---|---|
| Cloudflare (DNS + Tunnel + R2) | DNS, TLS, ingress (shared platform tunnel), image storage/CDN | R2 access key pair (tunnel token lives with the platform stack, not chobii.art) | `deploy/.env` |
| GHCR | Private image registry | 2 classic PATs (write / read) | dev keychain / mini `~/.docker/config.json` |
| Razorpay | Payments (orders, wallet) | Key id + secret + webhook secret | `deploy/.env` |
| Resend | Transactional email | API key | `deploy/.env` |
| 2Factor.in | SMS OTP + transactional SMS | API key | `deploy/.env` |
| Google OAuth (Cloud Console) | "Continue with Google" login | Client id + secret — client owned by dk.jarvis1.ai@gmail.com (GCP project 756865349904) | `deploy/.env` |
| Replicate / Google AI Studio | AI poster generation | API token / key | `deploy/.env` |
| Sentry | Error tracking (api + web) | 2 DSNs (not secret-critical) | `deploy/.env` |
| Slack | Alerts (`#prod-alerts`) | Incoming webhook URL | `deploy/.env` |
| UptimeRobot | External uptime checks | Dashboard account only | — |

## Cloudflare — DNS, Tunnel, edge

- The site lives at `chobii.art` — its own Cloudflare zone (same account as `xtoms.xyz` and the platform tunnel; nameservers pointed from GoDaddy). Ingress is still the shared platform tunnel: a public hostname `chobii.art → http://traefik:80` on the platform tunnel in Zero Trust (dashboard-managed; creates a proxied flattened apex CNAME). `www.chobii.art` 301s to the apex via a zone Redirect Rule. Universal SSL covers apex + first-level subdomains.
- The old staging URL `chobii.xtoms.xyz` was dropped at the 2026-07-24 cutover (404s at traefik; the `*.xtoms.xyz` wildcard route itself still serves other apps).
- TLS terminates at the edge; no certificates are managed on the mini.
- **Ingress = the shared platform tunnel** (`platform-tunnel` + `platform-traefik`, customs-copilot `deploy/platform/` — see the XTOMS deployment guide). chobii.art runs **no cloudflared** and holds **no tunnel token**; cloudflared dials **outbound only**, transport pinned to `http2` (QUIC degrades through the home-router NAT).
- Path splitting (`/api` → api:3000, rest → web:3001) is done by **traefik labels** in the prod compose overlay — `PathPrefix` is anchored by design, so the cc #97 unanchored-regex hazard is gone.
- ⚠️ The tunnel dashboard must show **exactly one connector replica**. A second process sharing the token (e.g. a natively-installed cloudflared) gets load-balanced → intermittent 502s.
- ⚠️ Shared fate: the tunnel and traefik serve every app on the mini. `chobii.art` and `customs.xtoms.xyz` down together = platform stack, not chobii.art.
- ⚠️ The edge caches 404s per-PoP ~5 min and browsers up to 4h — purge cache after deploys.
- The branded `chobii.art` cutover was executed 2026-07-24 (zone + tunnel hostname + webhook/Resend re-registration; the old staging URL was dropped without a redirect by decision).

## Cloudflare R2 — image storage + CDN

- Bucket `chobii-staging` (name is historical — R2 buckets can't be renamed; it is the production bucket), **versioning ON** (customer photo uploads and AI generations are not reproducible).
- Scoped API token (object read/write on this bucket only) → `R2_ACCESS_KEY` / `R2_SECRET_KEY`; endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- Custom domains attached to the bucket: `cdn.chobii.art` (primary; `CDN_URL` / `VITE_CDN_URL` must match) **and** `chobii-cdn.xtoms.xyz` (kept indefinitely — every email sent before the cutover embeds absolute old-CDN image URLs).
- Smoke test: `curl -sI https://cdn.chobii.art/<known-object>` → 200.

## GHCR — image registry

- Private packages `ghcr.io/<owner>/chobii-api` and `ghcr.io/<owner>/chobii-web`; every push tags `latest` + git short-sha (sha tags are the rollback mechanism).
- Two **classic** PATs (fine-grained PATs have patchy GHCR support): `write:packages` on the dev machine, `read:packages` (least privilege) on the mini.
- ⚠️ On the mini, `~/.docker/config.json` must **not** use `credsStore: osxkeychain` — the keychain is unreachable from non-interactive SSH, so pulls fail. Remove it; the PAT lives base64 in the file on the headless box.
- ⚠️ Never park a PAT in a repo file, even untracked.

## Razorpay — payments

- **Still test mode after the URL cutover**: `rzp_test_` keys with the real provider code path. Switching to live `rzp_live_` keys (+ registering the webhook in the live-mode dashboard) is the remaining go-live step.
- Webhook: `https://chobii.art/api/webhooks/razorpay` with `payment.captured`, `payment.failed`, `refund.processed` + order events as used (re-registered at the 2026-07-24 cutover — webhooks don't follow redirects; this bit customs #160 — and check the wallet webhook `/api/webhooks/wallet` if separately registered). Webhook secret is self-chosen: `openssl rand -hex 32`.
- Webhooks are the **sole source of truth** for payment state; duplicates are safe (idempotency, ticket #285) — redeliver from the dashboard rather than ever editing the DB.
- Test cards: success `4111 1111 1111 1111`, failure `4000 0000 0000 0002`, UPI `success@razorpay`.

## Resend — transactional email

- Sending domain is `chobii.art` in a **dedicated Resend account** (free tier = 1 domain/account; the original account's `xtoms.xyz` verification is shared with customs-copilot — never delete it). DKIM/SPF records live in the chobii.art Cloudflare zone; DMARC `p=none` to start. Unverified domain = silent-looking 500s on signup. (`xtoms.xyz` in the old account remains the rollback sender — rollback needs both `EMAIL_FROM` and `RESEND_API_KEY` reverted.)
- API key `chobii-prod` (Sending access, scoped to chobii.art only), `EMAIL_FROM=chobii.art <notifications@chobii.art>` (no mailbox needed). Free tier: 100 emails/day, 3k/month — upgrade this account when volume grows.
- Sends: verification, password reset, order confirmation, shipping notifications. A failed send must be loud (thrown + Sentry), never a silent fallback — `RESEND_API_KEY` carries a `:?` guard in the prod compose.

## 2Factor.in — SMS

- OTP login + transactional order SMS (India).
- ⚠️ **DLT compliance**: sender ID and message templates must be DLT-registered and approved; template text changes require re-approval *before* deploying code that uses them. Keep an eye on account balance — exhausted credits look like an app bug ("OTP never arrives").

## Google OAuth — social login

- The OAuth 2.0 client (`GOOGLE_CLIENT_ID`, prefix `756865349904-…`) lives in Google Cloud project number **756865349904** under the account **dk.jarvis1.ai@gmail.com** — *not* dhruv.kulhari@gmail.com (which owns Cloudflare). Console shortcut: `https://console.cloud.google.com/welcome?project=756865349904`.
- The client is **shared with customs-copilot**: when a hostname changes, ADD the new redirect URI (`https://<hostname>/api/auth/callback/google`) — never replace the list, or the other app's Google login breaks.
- Redirect URIs are exact-hostname registrations (same class as Razorpay webhooks / Resend domains): the chobii.art production cutover must add its own URI (see cutover checklist ticket #316).
- Gotcha: a missing URI fails with Google's `Error 400: redirect_uri_mismatch` before any app code runs — nothing appears in api logs.

## Replicate / Google AI Studio — AI generation

- Poster generation jobs run through BullMQ inside the api container and call out to `REPLICATE_API_TOKEN` and/or `GOOGLE_AI_STUDIO_KEY`.
- Set billing limits/quota alerts on the provider side — generation cost is per-request and user-triggered.
- Provider errors surface as failed BullMQ jobs (api logs + admin queue view), not outages.

## Sentry + Slack + UptimeRobot — observability

- Sentry: separate DSNs for api (`SENTRY_DSN`) and web (`VITE_SENTRY_DSN`), environment `production` (the compose default since the chobii.art cutover). DSNs are currently unset — wiring Sentry up is still pending.
- Slack incoming webhook → `#prod-alerts`: critical api errors and (via UptimeRobot) downtime alerts.
- UptimeRobot (free tier): monitors on `https://chobii.art/api/health` and `https://chobii.art/`, 5-min interval, alert → Slack. This is the only thing watching the site when the operator isn't — customs-copilot launched without it and learned about its first outage from a user.
