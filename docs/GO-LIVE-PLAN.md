# chobii.art — Go-Live Plan (Mac mini + Cloudflare Tunnel)

> **2026-07-24 update:** the domain cutover happened — the public URL is now
> **`https://chobii.art`** and `chobii.xtoms.xyz` was dropped (no redirect).
> See [CUTOVER-CHOBII-ART.md](CUTOVER-CHOBII-ART.md) for the executed cutover
> checklist. The staging-era framing below is kept as a historical record;
> the remaining production step is live Razorpay keys.

| | |
|---|---|
| **Status** | LAUNCHED — URL cutover done 2026-07-24; Razorpay live keys pending |
| **Environment** | **PRODUCTION** at `chobii.art` (Razorpay still test mode) |
| **Date** | 2026-07-16 (rev. 2026-07-17: shared platform edge stack; 2026-07-18: staging on xtoms.xyz) |
| **Host** | Mac mini (Apple Silicon, home LAN) — co-hosted with customs-copilot |
| **Exposure** | Shared platform edge (platform-tunnel + platform-traefik) — zero inbound ports, no app-owned cloudflared |
| **Public URL** | `https://chobii.xtoms.xyz` (single hostname, path-routed) |
| **Billing** | Razorpay **test mode** — for the whole life of this staging environment, not just launch |
| **Email / SMS** | Resend (live) / 2Factor.in (live) |
| **Images** | Cloudflare R2 + `masonart-cdn.xtoms.xyz` custom domain |

This plan adapts the proven customs-copilot deployment model (`~/work/customs-copilot/docs/XTOMS-DEPLOYMENT-GUIDE.md` — the cross-installation guide, plus `deploy/PLATFORM.md`, `OPERATIONS.md`, `RUNBOOK-OUTAGE.md`) to chobii.art. **Rev. 2026-07-17**: ingress moved to the shared platform edge stack (one cloudflared + one traefik v3.7+ serving every app on the mini, routing by docker labels); chobii.art runs no cloudflared of its own. Where customs-copilot paid for a lesson with a production bug (#88–#99, #130, #131), that lesson is baked in here as a design constraint instead of a future incident.

**Environment framing (2026-07-18):** everything this plan launches at `chobii.xtoms.xyz` is the **staging** deployment — production-shaped infrastructure (same images, same compose, same ops discipline) but Razorpay stays in test mode and Sentry reports as `staging`. The **production** deployment is a separate later cutover: `chobii.art` zone + tunnel hostname, live `rzp_live_` keys, webhook re-registration (webhooks don't follow redirects — cc #160), Resend on the branded domain, and its own gate.

Related docs: [EXTERNAL-SERVICES.md](EXTERNAL-SERVICES.md) · [OPERATIONS.md](OPERATIONS.md) · [RUNBOOK-OUTAGE.md](RUNBOOK-OUTAGE.md) · [deployment.md](deployment.md) (interim build-on-host flow; superseded by the Makefile flow below once ticket #288 lands)

---

## 1. Architecture

One public hostname, path-routed. Ingress is the **shared platform edge stack** already running on the mini for customs-copilot (`~/work/customs-copilot/deploy/platform/`): `platform-tunnel` (cloudflared, owns the Cloudflare tunnel, `http2` transport) + `platform-traefik` (v3.7+, routes by Host header via docker labels). Same-origin by construction: auth cookies are first-party, CORS is moot.

```
Users → chobii.xtoms.xyz (Cloudflare edge, TLS) → platform-tunnel (cloudflared, outbound-only, http2)
                                                      │
                                              platform-traefik (label-based routing,
                                              external `platform` docker network)
                                                      │
        Host(`chobii.xtoms.xyz`) && PathPrefix(`/api`) ──► api:3000  (Bun, Hono)
        Host(`chobii.xtoms.xyz`)  [catch-all] ───────────► web:3001  (Node, RR7 SSR)
                                                      │
                                          postgres:5432   redis:6379
                                          (16-alpine)     (7-alpine, AOF)
                                          — compose-default network ONLY, never on `platform`

        masonart-cdn.xtoms.xyz ──► Cloudflare R2 (product + AI images; no tunnel involved)
```

**Containers (4):** `api`, `web`, `postgres`, `redis` (compose project `chobii`). The tunnel and reverse proxy belong to the platform stack, shared with customs-copilot — chobii.art never runs its own cloudflared. The BullMQ AI-generation worker runs **in-process inside the api container** — there is no separate worker container, and single-instance assumptions apply (see OPERATIONS §5).

**Key decisions, with rationale imported from customs-copilot:**

- **Single hostname + path routing, not `api.chobii.xtoms.xyz`.** The current `docker-compose.prod.yml` / `deployment.md` two-subdomain design reintroduces CORS and cross-subdomain cookies — exactly what customs-copilot rejected. We use `chobii.xtoms.xyz` with path splitting done **in traefik labels**: `Host(\`chobii.xtoms.xyz\`) && PathPrefix(\`/api\`)` → api, plain `Host(\`chobii.xtoms.xyz\`)` → web (traefik v3 gives the longer rule priority automatically; no StripPrefix — the api serves its routes under `/api`). `PathPrefix` is anchored by design, so the unanchored-regex hazard that swallowed a Vite chunk named `api-<hash>.js` in customs-copilot (#97) is structurally gone.
- **Shared platform ingress, not a per-app tunnel.** Per the XTOMS deployment guide, apps never run their own cloudflared: api/web join the external `platform` docker network and register routes via labels; databases stay off that network. Because `chobii.xtoms.xyz` is a first-level subdomain, the existing wildcard (`*.xtoms.xyz` public hostname → `http://traefik:80` + proxied `*` CNAME) already routes it — **zero Cloudflare configuration for chobii.art's ingress**. No `CLOUDFLARE_TUNNEL_TOKEN` anywhere in chobii.art's env. Shared-fate corollary: if `chobii.xtoms.xyz` and `customs.xtoms.xyz` are down together, the fault is the platform stack, not this app.
- **Same-origin browser bundle.** Web image must be built with `--build-arg VITE_API_URL=""` and the client fallback must use `??` (not `||`) so the empty string survives and API calls are relative. customs-copilot shipped `http://localhost:3000` baked into prod once (#96); first real signup hung forever.
- **Images are built on the dev machine and pushed to GHCR; the mini only pulls.** The 8GB mini cannot absorb `bun install + vite build`, especially while also running customs-copilot. Tag every push `latest` **and** the git short-sha; rollback = redeploy an older sha.
- **Tunnel transport `http2`, not QUIC.** QUIC/UDP through the home router NAT killed long-lived streams in customs-copilot (#99). Already pinned in the platform stack's cloudflared — nothing to configure on the chobii.art side, but it's why large image uploads and slow admin requests behave.
- **No host ports published in prod** (`ports: !override []` on every service). Traefik reaches api/web over the `platform` network; backups run via `docker compose exec`. Avoids port collisions with the co-hosted customs-copilot stack (#92).
- **Migrations ship inside the api image** (`drizzle.config.ts` + `src/database/migrations/`) and run with `drizzle-kit migrate` via `make migrate`. The mini has no repo checkout, so `bun run db:push` (current deployment.md) is out — push is also unsafe against a production schema (#93).
- **Fail loudly on missing env.** Every var whose absence degrades silently gets a `:?` guard in the prod compose (Razorpay, Resend, 2Factor, R2, AI keys). customs-copilot ran fake embeddings and a silent dev email transport in prod because unset vars resolved to empty strings (#94, #131).

## 2. Code changes required before launch

Filed as the **`go-live`** feature (tickets #287–#294, phases Infra → Hardening → Ops → Gate; the owner-console/bootstrap work of §3–§4 is ticket #293). Prerequisite hardening lives in the `go-to-production` feature (89% done — Dockerfile, `/api/health`, security headers, Sentry, pino, Slack alerts, compression, pooling, webhook idempotency are already ✅); its two open tickets #278/#283 block the gate. Tickets:

| # | Ticket | Why |
|---|--------|-----|
| **#287** | **Same-origin web bundle + single-hostname config.** Audit `packages/web` for `VITE_API_URL` fallbacks — every one must be `?? ` so `""` survives; all fetches/uploads must go through the shared API base. Update prod compose: drop `CORS_ORIGIN` multi-domain, set `APP_URL`/auth URL to `https://chobii.xtoms.xyz`. | cc #84, #96 |
| **#288** | **`deploy/` Makefile + GHCR.** Targets: `build`/`push`/`build-push` (buildx `linux/arm64`, tags `latest`+sha, web gets `--build-arg VITE_API_URL=""`), `gen-compose` (render compose + `deploy/.env` into one file, **strip `build:` keys**), `deploy` (scp rendered file → `~/chobii-docker-compose.yml`, ssh `pull && up -d` with explicit `export PATH=/opt/homebrew/bin:...` prefix), `rollback` (`IMAGE_TAG=<sha>`), `migrate`/`seed`/`admin-promote`, `first-boot`, `platform-network` (idempotent `docker network create platform` on the mini). Compose project name `chobii` so it can't collide with customs-copilot. | cc #88–#93 |
| **#290** | **Fix prod compose healthchecks — launch blocker.** `docker/docker-compose.prod.yml` healthchecks exec `curl`, but `oven/bun:1-slim` and `node:20-slim` don't ship curl → both containers report unhealthy forever and `depends_on: condition: service_healthy` prevents `web` from ever starting. Replace with `bun -e "fetch(...)"` / `node -e "fetch(...)"` probes (the Dockerfile HEALTHCHECKs already do this correctly). | cc runbook L4 |
| **#291** | **Trust `cf-connecting-ip` for client IPs.** `packages/api/src/middleware/rate-limit.ts:26` takes the *first* `x-forwarded-for` entry. Behind the tunnel every socket peer is cloudflared, and CF *appends* the real IP — the first entry is attacker-controlled, so rate limits are spoofable (and without the fix, all users may share one bucket). Prefer `cf-connecting-ip`, fall back to XFF last-hop; also set Better Auth's `advanced.ipAddress.ipAddressHeaders`. | cc #95 |
| **#292** | **Prod env contract with `:?` guards.** Forward the full contract into api/web with `:?` on: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `TWO_FACTOR_API_KEY`, `R2_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`, `CDN_URL`, `REPLICATE_API_TOKEN` (and/or `GOOGLE_AI_STUDIO_KEY`). Each guard message names the consequence. No tunnel token — ingress belongs to the platform stack; this ticket also adds the `platform` external network + traefik labels to api/web. | cc #94, #131, #99 |
| **#289** | **Ship migrations in the api image; migrate not push.** Copy `drizzle.config.ts` + `src/database/migrations/` into the api image; `make migrate` runs `drizzle-kit migrate` in-container. Pre-flight: verify `migrations/meta/_journal.json` is consistent (there are two `0002_*.sql` files — confirm both are journaled). Update deployment.md. | cc #93 |
| **#283** | **Backups (existing ticket #283).** Nightly host cron on the mini: `pg_dump -Fc` via `docker compose exec -T`, 14-day retention, plus a **quarterly restore drill** into a scratch DB ("a backup that has never been restored is a hope"). Enable R2 bucket versioning — customer-uploaded photos and AI generations are the one non-reproducible asset class. Redis is ephemeral (AOF only, no backup). | cc OPERATIONS §2 |
| **#278** | **Uptime monitoring (existing ticket #278).** External monitor (UptimeRobot free) on `https://chobii.xtoms.xyz/api/health` + homepage, alerting to the already-wired Slack webhook. customs-copilot launched with none and found its power-cut outage by hand. | cc #130 gap |
| **#295** | **api tsc build broken on main (fixed 2026-07-17).** ~60 type errors across 12 files blocked the Docker image build; dev never noticed because `bun run dev` runs TS directly. Also fixed en route: base-image drift (slim images dropped adduser → use built-in `bun`/`node` users; bun rejects `--production=false`) and vite `manualChunks` vs SSR externals. | found in build verify |
| **#296** | **Wildcard requireAuth leak + 401→500 (fixed 2026-07-17).** Sub-apps mounted at bare `/api` registered `use("*", requireAuth)`, auth-gating every later `/api` route — `/api/health` (web could never start), public tracking, and Razorpay webhooks; `onError` collapsed HTTPExceptions to 500 and paged Slack per 401. Unit suite 540 → 56 failures once fixed. | found in stack verify |
| **#294** | **Go-live gate** — §5 checklist executed from outside the LAN, suites ×2, merge, flip this doc's status to LIVE. Remaining suite failures are stale expectations (old `/health` shape, unmodeled 429s) — burn down before the gate. | cc #86 |

## 3. Owner console steps (no code)

1. **Ingress: nothing to do.** `chobii.xtoms.xyz` is a first-level subdomain of the `xtoms.xyz` zone, so the platform's existing wildcard public hostname (`*.xtoms.xyz` → `http://traefik:80`) and proxied `*` CNAME already route it, and the universal cert already covers it. Do NOT create a tunnel, a published hostname, or any DNS record — the subdomain goes live the moment the containers register their traefik labels. (A later branded `chobii.art` cutover is a separate post-launch project: new zone + tunnel hostname, Razorpay webhook re-registration — webhooks don't follow redirects — Resend re-verify, and a 302 legacy-redirect router, per the customs `app.`→`customs.` rename #160.)
2. **Tunnel sanity (shared)**: dashboard still shows **exactly one connector replica**. Panic-switch caveat: there is no per-app Cloudflare switch under the wildcard — disabling the tunnel takes down *every* app on the mini. chobii.art's panic switch is stopping its own containers (`docker compose -f ~/chobii-docker-compose.yml stop api web`).
3. **R2**: create bucket `masonart-prod`, enable versioning, create scoped API token, attach custom domain `masonart-cdn.xtoms.xyz` (first-level subdomain — covered by the universal cert; Cloudflare creates the DNS record itself, no tunnel involved).
4. **Resend**: the sending domain is `xtoms.xyz` — if customs-copilot already verified it, reuse that verification and just create a chobii.art API key; otherwise add `xtoms.xyz`, publish SPF/DKIM into the zone, verify. `EMAIL_FROM=noreply@xtoms.xyz` (needs no mailbox).
5. **2Factor.in**: confirm prod API key + sender ID; verify DLT template approval for OTP + transactional order SMS (India requirement).
6. **Razorpay (test mode)**: `rzp_test_` keys; register webhook `https://chobii.xtoms.xyz/api/webhooks/razorpay` (note: same-origin URL, not api.chobii.xtoms.xyz) with `payment.captured`, `payment.failed`, `refund.processed` (+ `order.*` as used); webhook secret = `openssl rand -hex 32`.
7. **AI provider**: Replicate token and/or Google AI Studio key with billing/quota set.
8. **Sentry**: prod project DSNs for api + web. **Slack**: `#prod-alerts` webhook.
9. **GHCR**: two classic PATs — `write:packages` (dev machine), `read:packages` (mini).

## 4. Mac mini bootstrap

The mini already runs customs-copilot, so the one-time host hardening is **done** (Colima under `brew services` in the GUI session, `pmset -c sleep 0 autorestart 1`, auto-login — see cc #130). chobii.art is additive:

1. **Memory budget check** — Colima VM is 6GB; customs-copilot limits total ~3.25g and the shared platform stack ~0.38g (traefik 128m + cloudflared 256m, already running). chobii.art adds ~1.15g (api 512m, web 256m, postgres 256m, redis 128m — no cloudflared) → ~4.8g committed. Acceptable, but watch `docker stats` after launch; the image-optimization pipeline (sharp/WebP, ticket #286) is the likeliest spike. If tight, the api limit is the first to revisit.
2. **Platform network + stack present** — `make -C deploy platform-network` (idempotent). The platform stack itself lives in customs-copilot's repo (`make -C ~/work/customs-copilot/deploy platform-deploy`) and should already be up; verify `docker ps` shows `platform-traefik` (≥ v3.7) and `platform-tunnel` before first deploy.
2. Static DHCP reservation for the mini (lease drift broke deploys once — cc #130).
3. **Wired Ethernet** — cc #100 found 88% packet loss on the mini's Wi-Fi; if not yet cabled, that is a chobii.art launch blocker too (shared physical link).
4. `make -C deploy login-remote` (read-only GHCR PAT; the mini's `~/.docker/config.json` must not use `credsStore: osxkeychain` — unreachable over SSH).
5. `mkdir -p /backups` (shared with customs-copilot, distinct filename prefixes).
6. First deploy: `make -C deploy build-push-deploy`, then `make -C deploy first-boot` (migrate → seed → seed:admin), sign up through the UI, `make -C deploy admin-promote EMAIL=<owner>`.
7. Install the nightly backup cron line (OPERATIONS §2).

## 5. Go-live gate — proven from OUTSIDE the LAN (phone on LTE)

Every item verified against `https://chobii.xtoms.xyz` on cellular, results recorded in the gate ticket:

1. **Auth**: signup → real Resend verification email arrives → verify → login. SMS OTP login delivers via 2Factor and completes.
2. **Catalog**: homepage, category, and product-detail pages render; all images load from `masonart-cdn.xtoms.xyz`.
3. **Purchase**: add to cart → checkout → Razorpay test card `4111 1111 1111 1111` succeeds → webhook flips the order to paid → confirmation email (and SMS if configured) arrives → order appears in account history.
4. **Webhook idempotency**: redeliver the payment webhook from the Razorpay dashboard → duplicate is a no-op (#285 in practice). Failure card `4000 0000 0000 0002` produces a clean failed-payment state.
5. **AI generation**: submit a prompt → BullMQ job runs → generated image lands in R2 and renders via CDN → appears in the user's creations.
6. **Admin**: promoted admin reaches `/admin`; a normal account gets 403.
7. **Hardening spot-checks**: hammer an auth endpoint → 429 (from a second device — proves per-IP isolation, #291); `curl -sI https://chobii.xtoms.xyz` shows CSP/HSTS headers; forced error shows up in Sentry and fires the Slack alert; uptime monitor is green.
8. **Suites**: full unit + Playwright suites ×2 green before the merge.

## 6. Out of scope for launch

- **The production deployment itself** — `chobii.art` zone + tunnel hostname, live `rzp_live_` keys and pricing, Razorpay webhook re-registration, Resend on the branded domain, `SENTRY_ENVIRONMENT=production`, its own gate. This staging environment stays on test keys permanently.
- Zero-downtime / blue-green deploys — compose recreate is accepted on a single host; mitigate by purging the Cloudflare cache after deploys (edge caches 404s ~5 min per PoP, browsers up to 4h).
- CI (GitHub Actions could replace `make push` later without changing the mini side).
- Scaling beyond one instance — in-memory rate limits and the in-process BullMQ worker assume a single api container.
- In-progress features (order-tracking notifications, photo approval) gate on their own features, not this plan.
