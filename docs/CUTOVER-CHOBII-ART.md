# Cutover: chobii.xtoms.xyz → chobii.art

Executed checklist for the production domain cutover (planned 2026-07-24).
Repo-side changes are already committed; the dashboard steps below are
manual and must be done **in order** — the deploy (Phase 2) is only safe
after every Phase 0 box is checked.

Decisions: old staging URL **dropped** (no redirect) · CDN moved to
`cdn.chobii.art` · Razorpay stays on **test keys** (live keys are a separate
go-live) · email sender moves to `notifications@chobii.art`.

## Phase 0 — dashboards & DNS (do days ahead; zero downtime)

- [ ] **Cloudflare**: add site `chobii.art` in the SAME account that owns
      `xtoms.xyz` and the platform tunnel (Free plan). Note the two assigned
      nameservers.
- [ ] **GoDaddy** (`chobii.art`): DNSSEC OFF → set nameservers to
      Cloudflare's pair. Complete the ICANN registrant-email verification
      mail (ignoring it suspends a fresh domain in ~15 days).
- [ ] Wait for the zone to show **Active** (usually <1 h). Then: SSL mode
      **Full**, enable **Always Use HTTPS** (match xtoms.xyz zone settings).
- [ ] **Zero Trust → Networks → Tunnels → platform tunnel → Public hostnames**:
      add `chobii.art` → `http://traefik:80`. (Dashboard auto-creates the
      proxied, flattened apex CNAME.)
- [ ] **www**: add proxied DNS record for `www` (easiest: second tunnel
      public hostname `www.chobii.art` → `http://traefik:80`), then zone
      **Redirect Rule**: `www.chobii.art/*` → 301 `https://chobii.art/$1`.
      Do NOT add www to any traefik Host rule.
- [ ] **Pre-flight**: `curl -sI https://chobii.art` returns traefik
      `404 page not found` — that 404 IS success (edge → tunnel → traefik
      proven before the app flips).
- [ ] **R2** → bucket `chobii-staging` → Settings → add custom domain
      `cdn.chobii.art`. KEEP `chobii-cdn.xtoms.xyz` attached (old emails
      embed it forever). Verify `https://cdn.chobii.art/<existing-key>` → 200.
- [ ] **Resend**: chobii.art uses a **dedicated Resend account** (free tier
      allows one domain; the original account's `xtoms.xyz` domain is shared
      plumbing with customs-copilot — never delete it). Add domain
      `chobii.art` there; publish the DKIM/SPF records it gives you into the
      chobii.art Cloudflare zone (DMARC `v=DMARC1; p=none;` already set).
      Wait for **Verified** — HARD gate for deploy (EMAIL_FROM is already
      flipped in deploy/.env; deploying unverified silently kills signup
      emails). API key `chobii-prod` (Sending access, scoped to chobii.art)
      is already swapped into deploy/.env; free tier = 100 emails/day —
      upgrade THIS account when volume grows.
- [ ] **Google OAuth** (console under **dk.jarvis1.ai@gmail.com**, project
      756865349904 — client is SHARED with customs-copilot, so **ADD, never
      replace**): add redirect URI
      `https://chobii.art/api/auth/callback/google` and JS origin
      `https://chobii.art`. Propagation can take hours — do early.
- [ ] **Razorpay (test dashboard)**: ADD webhook
      `https://chobii.art/api/webhooks/razorpay` using the existing
      `RAZORPAY_WEBHOOK_SECRET` from deploy/.env, same events. If a wallet
      webhook (`/api/webhooks/wallet`) is registered, add its chobii.art
      twin. Do NOT delete the old-URL webhooks yet (rollback path).

## Phase 2 — cutover deploy (minutes of downtime; low-traffic hour)

- [ ] Morning-of re-check: zone Active · apex curl → traefik 404 ·
      cdn.chobii.art serves · Resend Verified · Google URI added · new
      Razorpay webhook active.
- [ ] Rollback pin: note `git rev-parse --short HEAD`; DB backup:
      `ssh dhruv@<mini> "export PATH=/opt/homebrew/bin:$PATH; docker compose -f ~/chobii-docker-compose.yml exec -T postgres pg_dump -U chobii chobii" > pre-cutover.sql`
- [ ] `make -C deploy build-push-deploy` — MUST be the full target
      (`VITE_CDN_URL`/`VITE_APP_URL` are baked into the web image at build
      time; a config-only `deploy` ships a stale bundle).
- [ ] Purge Cloudflare cache on BOTH zones (chobii.art may have cached the
      pre-flip 404 for ~5 min/PoP).
- [ ] Redis: sitemap is cached 1 h with old URLs — delete that key or wait
      out the TTL. Never `FLUSHALL` (BullMQ shares this Redis).

## Phase 3 — stored CDN URL rewrite (after Phase 4 basics pass)

- [ ] Run `deploy/cutover-cdn-url-rewrite.sql` against the mini's postgres
      (usage comment in the file). Pre-counts → rewrite → all counts 0.
      Not urgent: old CDN hostname keeps serving meanwhile.

## Phase 4 — verification gate (from OUTSIDE the LAN, on LTE)

- [ ] `https://chobii.art` → 200 with CSP/HSTS; `www.chobii.art/x` → 301 to
      apex; `chobii.xtoms.xyz` → 404 (intended drop).
- [ ] Fresh signup → verification email arrives FROM
      `chobii.art <notifications@chobii.art>`, DKIM/SPF pass, link works.
- [ ] Google OAuth round-trip; session survives reload. (Everyone's old
      sessions are gone — host-only cookies; expected.)
- [ ] Product pages: images load from `cdn.chobii.art`; zero requests to the
      old CDN host on fresh pages (post Phase 3).
- [ ] `/sitemap.xml` URLs say chobii.art; `/robots.txt` OK.
- [ ] Test-mode checkout (card `4111 1111 1111 1111`) → order flips to paid
      **via webhook** (this specifically proves the new webhook URL) →
      confirmation email arrives. Wallet top-up too if registered.
- [ ] AI generation → new record's image URLs are `cdn.chobii.art`.
- [ ] Update UptimeRobot monitors (ticket #278) to
      `https://chobii.art/api/health` + homepage → green.

## Phase 5 — post-cutover

- [ ] Google Search Console: add `chobii.art` domain property (DNS TXT),
      submit sitemap.
- [ ] After ~2 weeks stable: delete old-URL Razorpay webhooks; optionally
      remove the old Google redirect URI. Keep the `chobii-cdn.xtoms.xyz`
      R2 domain indefinitely.
- [ ] Separate go-live step (own gate): `rzp_live_` keys + live-mode webhook
      registration + `SENTRY_DSN` wiring.

## Rollback (single change)

Revert `deploy/.env` (`PUBLIC_HOSTNAME=chobii.xtoms.xyz`,
`CDN_URL=https://chobii-cdn.xtoms.xyz`, `EMAIL_FROM=no-reply@xtoms.xyz`, and
`RESEND_API_KEY` back to the old shared-account key — kept in a comment next
to the new one) and
run `make -C deploy build-push-deploy` (full target — the CDN value is
build-time). Everything old-side still exists until Phase 5 cleanup: the
wildcard tunnel route, old Google redirect URI, old Razorpay webhook, old R2
custom domain, and the xtoms.xyz Resend verification. The Phase 3 rewrite
doesn't block rollback (cdn.chobii.art keeps serving while the zone exists);
to fully unwind, swap the `replace()` arguments in the SQL or restore
`pre-cutover.sql`.
