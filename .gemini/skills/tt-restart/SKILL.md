---
name: tt-restart
description: Update the current project's ticketrack container to the latest built image. Use when the user says restart ticketrack, update the tracker, pick up the new image/build, or the UI/API is serving a stale build.
allowed-tools:
  - Bash
---

# /tt-restart — Recreate Container on Latest Image

Swaps this project's ticketrack container onto whatever `tracker-unified:latest`
currently is. Does **not** build the image — run `make build` in the ticketrack
repo first if the image itself needs updating.

## Steps

### 1. Resolve the compose file

```bash
if [ -f docker-compose.ticketrack.yml ]; then
  COMPOSE=docker-compose.ticketrack.yml     # consumer project
elif [ -f docker-compose.yml ] && [ -d packages/api ]; then
  COMPOSE=docker-compose.yml                # ticketrack repo itself
else
  echo "No ticketrack instance in $PWD"; # stop and report
fi
```

### 2. Record the before version

```bash
docker compose -f "$COMPOSE" ps --format '{{.Name}}\t{{.Ports}}'
# host port is the N in 0.0.0.0:N->3002/tcp
curl -s "http://localhost:${PORT}/api/version"
```

Keep `gitCommit` and `buildTime`. Unreachable endpoint is fine — note it and continue.

### 3. Force-recreate

```bash
docker compose -f "$COMPOSE" up -d --force-recreate
```

### 4. Verify

```bash
docker compose -f "$COMPOSE" ps --format '{{.Name}}\t{{.Status}}'   # want (healthy)
curl -s "http://localhost:${PORT}/api/version"
```

Report before → after version. If `gitCommit`/`buildTime` did not move, the
image hasn't been rebuilt since the last recreate — say so and suggest
`make build` in the ticketrack repo, don't report it as a failure.

If unhealthy: `docker compose -f "$COMPOSE" logs --tail 50` and report.

## Output

```
🔄 ticketrack recreated — {project}
  Before:  {version-before} (built {buildTime-before})
  After:   {version-after}  (built {buildTime-after})
  Status:  {healthy | unhealthy}
  URL:     http://localhost:{port}
```
