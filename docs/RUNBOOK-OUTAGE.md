# RUNBOOK — "masonart.com is down"

Layered inside-out triage, adapted from the customs-copilot outage runbook (which was corrected against a real power-cut incident). **Work the layers in order and stop at the first failing one** — everything above it is noise until that layer is fixed. The host is a Mac mini on a home LAN, co-hosting customs-copilot; if **both** apps are down, the fault is almost certainly L1–L2 (machine/Docker), not MasonArt's containers.

## Step 0 — Capture the outside symptom first

From a machine **outside the LAN** (phone on LTE) or at minimum from the dev machine:

```bash
curl -si https://masonart.com/ | head -5
curl -si https://masonart.com/api/health | head -5
curl -si https://customs.xtoms.xyz/ | head -1   # shared-fate probe: ingress serves both apps
```

**Shared-fate rule first**: MasonArt rides the shared platform ingress (`platform-tunnel` + `platform-traefik`). If the customs probe is down too, the fault is the platform stack or host (L1–L2/L5) — stop triaging MasonArt's containers. If customs is up and masonart.com is down, it's MasonArt's containers, labels, or its Cloudflare hostname.

| Symptom | Points at |
|---|---|
| DNS `NXDOMAIN` / no resolution | L6 — zone paused, nameservers, domain expiry |
| Cloudflare error 530 / 1033 | L5 — tunnel down (cloudflared not connected) |
| 502 / 504 from Cloudflare | L3/L4 — tunnel up, container behind it down/unreachable |
| Plain `404` served by traefik | L5 — no router matched: labels missing/wrong, app off the `platform` network, or traefik < v3.7 discovering nothing |
| 403 / 1020 | L6 — WAF/firewall rule |
| 524 | L4 — container accepted the request and hung |
| Both curls 200 but users report errors | Not an infra outage — check Sentry, app logs (L4) |
| `/` 200 but `/api/health` failing | api container or path route (L3/L6) |

Record what you saw and the time — you'll want it for the post-incident note.

## L1 — Is the machine up and on the network?

```bash
ping <mini-ip>              # from dev machine, same LAN
ssh <user>@<mini-ip> true
```

- No route/ping: check power and the **Ethernet cable** first (physical link is this host's historical weak point — Wi-Fi ran at 88% packet loss before it was cabled).
- If the IP doesn't answer, suspect **DHCP lease drift**: sweep the LAN and match SSH host keys to find the mini's new address:
  ```bash
  nmap -sn 192.168.29.0/24        # or: arp -a
  ssh-keyscan <candidate-ip>       # compare against known_hosts entry
  ```
  If it moved, update `DEPLOY_HOST` in `deploy/.env` and get the static DHCP reservation fixed.
- mDNS pitfall: don't trust `*.local` names — they can resolve to the wrong machine.
- After a power failure, the mini should self-recover: `pmset autorestart 1` powers it on, auto-login opens the GUI session, `brew services` starts Colima. If it sat at the login screen, one of those three legs regressed — re-verify all three (they were installed after the customs-copilot power-cut incident, and each alone is insufficient).

## L2 — Is Colima/Docker up?

```bash
ssh <mini> "export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH; docker ps"
```

- `command not found: docker` over SSH is (usually) **not** a broken install — non-interactive SSH only sources `.zshenv`, so Homebrew's PATH is missing. Prefix the PATH export as above (the Makefile does this on every remote command).
- Colima not running: it must be started as a `brew services` job **in the GUI session** (`gui/501` domain) — do it via Screen Sharing or physically, not plain SSH:
  ```bash
  brew services start colima          # from a GUI session
  # stale/wedged Lima state:
  launchctl kickstart -k gui/501/homebrew.mxcl.colima
  ```
- Never `colima start` manually on the mini — it detaches the instance from the LaunchAgent and breaks the reboot-recovery chain.

## L3 — Are the containers up?

```bash
ssh <mini> "export PATH=/opt/homebrew/bin:\$PATH; docker compose -f ~/masonart-docker-compose.yml ps"
```

Expect **4 services Up**: `api`, `web`, `postgres`, `redis` (api and web `healthy`). The tunnel and traefik are the platform stack's containers (`docker ps --filter name=platform-`), not MasonArt's.

- **Read the logs before restarting anything**: `docker compose -f ~/masonart-docker-compose.yml logs --tail 100 <service>`.
- Crash-looping api: usually a failed migration, a missing env var (the `:?` guards should have caught it at render — if not, add one), or Postgres not ready.
- Check for OOM kills (shared 6GB VM — a sharp/WebP image-processing spike is the likeliest culprit):
  ```bash
  docker inspect <container> --format '{{.State.OOMKilled}}'
  docker stats --no-stream
  ```
- `web` stuck `waiting`/`created`: its `depends_on` gates on api being **healthy** — a broken api healthcheck blocks web forever. Remember the healthcheck probes must use `bun -e` / `node -e` fetch, not curl (slim images have no curl).

## L4 — Are the apps healthy inside the containers?

The images have no curl/wget. Probe with the runtimes:

```bash
docker compose -f ~/masonart-docker-compose.yml exec api \
  bun -e "fetch('http://localhost:3000/api/health').then(r=>r.text()).then(console.log)"
docker compose -f ~/masonart-docker-compose.yml exec web \
  node -e "fetch('http://localhost:3001/').then(r=>console.log(r.status))"
```

`/api/health` reports per-component status — if `database` or `redis` is unhealthy, go fix that container, not the api.

Distinguish real outages from app-level failures that *look* like outages:
- Signups failing → Resend domain verification / `RESEND_API_KEY` (check api logs for email errors).
- OTP not arriving → 2Factor balance/DLT template status.
- Payments failing → Razorpay keys mode mismatch (`rzp_test_` vs live) or webhook secret; check webhook delivery log in the Razorpay dashboard.
- AI generations stuck → BullMQ worker logs inside api; Replicate/Gemini quota or key.
- Images broken but site up → R2/CDN (`curl -sI https://cdn.masonart.com/<known-object>`), not the tunnel.
- 429s → rate limiting working as intended, not an outage.

## L5 — Is the shared ingress (platform tunnel + traefik) healthy?

⚠️ These are **shared containers** — restarting them blips every app on the mini. Confirm customs-copilot's symptom matches before touching them; their compose file is `~/platform-docker-compose.yml` on the mini, managed from `~/work/customs-copilot/deploy` (`make platform-deploy`).

```bash
ssh <mini> "export PATH=/opt/homebrew/bin:\$PATH; docker logs --tail 50 platform-tunnel"
ssh <mini> "export PATH=/opt/homebrew/bin:\$PATH; docker logs --tail 50 platform-traefik"
```

- Healthy tunnel: registered connections (4 edges), no reconnect churn, transport `http2` (QUIC degrades through this router's NAT).
- Cloudflare Zero Trust → Tunnels → the platform tunnel: status HEALTHY, **exactly one replica**, architecture `linux_arm64`. Two replicas means a stray connector is sharing the token → intermittent 502s; find and kill the imposter.
- **Traefik has no route** (edge shows a bare 404): check the router table — `ssh -L 8080:localhost:8080 dhruv@<mini>` → http://localhost:8080. MasonArt's routers come from labels on api/web; missing routers mean the containers aren't on the `platform` network, lack `traefik.enable=true`, or traefik is < v3.7 (its docker provider silently discovers nothing on Docker Engine 29).
- Tunnel can't dial out → the home internet connection itself; check the router.

## L6 — DNS / Cloudflare edge

```bash
dig masonart.com +short          # should resolve to Cloudflare anycast IPs
dig cdn.masonart.com +short
```

- Zone paused or nameservers changed → Cloudflare dashboard → zone status **Active**.
- 403/1020 → WAF or firewall rule blocking; check Security events.
- `/api/*` 404s but homepage fine → the api router is gone from traefik (label edit, api container off the `platform` network) — check the traefik dashboard; also confirm nobody added a Cloudflare path route (the hostname must stay a bare `masonart.com → http://traefik:80`).
- Weird stale behavior after a deploy → purge the Cloudflare cache (edge caches 404s ~5 min per PoP; browsers up to 4h — retest with cache-busting query strings before trusting a browser).

## L7 — What changed?

**An outage right after a deploy is that deploy until proven otherwise.**

```bash
make -C deploy deploy IMAGE_TAG=<previous-git-sha>   # rollback
```

- Schema migrated forward? Drizzle has no auto-rollback — restore from last night's dump or write a manual down-migration (declared incident, per OPERATIONS §4).
- Nothing deployed? Check what else changed: Cloudflare route edits, expired PATs (pull failures), provider incidents (Razorpay/Resend/2Factor/Replicate status pages), macOS auto-updates on the mini.
- **Panic switch**: disable the tunnel in the Cloudflare dashboard — takes the site offline cleanly while you work, and proves instantly whether Cloudflare-side config was the problem when re-enabled.

## After the incident

1. Confirm recovery **from outside the LAN** (phone on LTE): homepage, `/api/health`, one image from the CDN.
2. Record: failing layer, root cause, fix, time-to-diagnose.
3. If any check was missing from this runbook, **add it now** — that's how this document earned every line it has.
