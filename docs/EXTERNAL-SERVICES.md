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

- The site lives at `chobii.xtoms.xyz` — a first-level subdomain of the existing `xtoms.xyz` zone. **No chobii.art-specific Cloudflare configuration exists or is needed**: the platform's wildcard public hostname (`*.xtoms.xyz` → `http://traefik:80`) plus the proxied `*` CNAME already route it, and the universal cert covers first-level subdomains.
- TLS terminates at the edge; no certificates are managed on the mini.
- **Ingress = the shared platform tunnel** (`platform-tunnel` + `platform-traefik`, customs-copilot `deploy/platform/` — see the XTOMS deployment guide). chobii.art runs **no cloudflared** and holds **no tunnel token**; cloudflared dials **outbound only**, transport pinned to `http2` (QUIC degrades through the home-router NAT).
- Path splitting (`/api` → api:3000, rest → web:3001) is done by **traefik labels** in the prod compose overlay — `PathPrefix` is anchored by design, so the cc #97 unanchored-regex hazard is gone.
- ⚠️ The tunnel dashboard must show **exactly one connector replica**. A second process sharing the token (e.g. a natively-installed cloudflared) gets load-balanced → intermittent 502s.
- ⚠️ Shared fate: the tunnel and traefik serve every app on the mini. `chobii.xtoms.xyz` and `customs.xtoms.xyz` down together = platform stack, not chobii.art.
- ⚠️ The edge caches 404s per-PoP ~5 min and browsers up to 4h — purge cache after deploys.
- A branded `chobii.art` cutover is a deliberate post-launch project (new zone + tunnel hostname + webhook/Resend re-registration + 302 legacy redirect — cc #160).

## Cloudflare R2 — image storage + CDN

- Bucket `masonart-prod`, **versioning ON** (customer photo uploads and AI generations are not reproducible).
- Scoped API token (object read/write on this bucket only) → `R2_ACCESS_KEY` / `R2_SECRET_KEY`; endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- Custom domain `masonart-cdn.xtoms.xyz` attached to the bucket (Cloudflare creates the DNS record); `CDN_URL` / `VITE_CDN_URL` must match.
- Smoke test: `curl -sI https://masonart-cdn.xtoms.xyz/<known-object>` → 200.

## GHCR — image registry

- Private packages `ghcr.io/<owner>/chobii-api` and `ghcr.io/<owner>/chobii-web`; every push tags `latest` + git short-sha (sha tags are the rollback mechanism).
- Two **classic** PATs (fine-grained PATs have patchy GHCR support): `write:packages` on the dev machine, `read:packages` (least privilege) on the mini.
- ⚠️ On the mini, `~/.docker/config.json` must **not** use `credsStore: osxkeychain` — the keychain is unreachable from non-interactive SSH, so pulls fail. Remove it; the PAT lives base64 in the file on the headless box.
- ⚠️ Never park a PAT in a repo file, even untracked.

## Razorpay — payments

- **Test mode for the life of this staging environment**: `rzp_test_` keys with the real provider code path. Live `rzp_live_` keys arrive only with the future `chobii.art` production cutover (which also re-registers the webhook against the new hostname).
- Webhook: `https://chobii.xtoms.xyz/api/webhooks/razorpay` with `payment.captured`, `payment.failed`, `refund.processed` + order events as used. ⚠️ Registered against this exact hostname — a later `chobii.art` cutover must re-register it (webhooks don't follow redirects; this bit customs #160). Webhook secret is self-chosen: `openssl rand -hex 32`.
- Webhooks are the **sole source of truth** for payment state; duplicates are safe (idempotency, ticket #285) — redeliver from the dashboard rather than ever editing the DB.
- Test cards: success `4111 1111 1111 1111`, failure `4000 0000 0000 0002`, UPI `success@razorpay`.

## Resend — transactional email

- Sending domain is `xtoms.xyz`, added and **verified** in Resend (SPF + DKIM in the Cloudflare zone) — if customs-copilot already verified it, reuse the verification and just mint a chobii.art API key. Unverified domain = silent-looking 500s on signup.
- Prod API key (Sending access only), `EMAIL_FROM=noreply@xtoms.xyz` (no mailbox needed).
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

- Sentry: separate DSNs for api (`SENTRY_DSN`) and web (`VITE_SENTRY_DSN`), environment `staging` (the compose default) — `production` is reserved for the future chobii.art deployment so events never mix.
- Slack incoming webhook → `#prod-alerts`: critical api errors and (via UptimeRobot) downtime alerts.
- UptimeRobot (free tier): monitors on `https://chobii.xtoms.xyz/api/health` and `https://chobii.xtoms.xyz/`, 5-min interval, alert → Slack. This is the only thing watching the site when the operator isn't — customs-copilot launched without it and learned about its first outage from a user.
