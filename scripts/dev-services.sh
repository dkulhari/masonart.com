#!/bin/bash
# chobii.art Dev Services Preflight
# Ensures the backing containers (postgres, redis, minio) are running before
# `turbo run dev` starts. Without minio, product images 404 and every poster
# card renders as an empty grey box.
#
# Usage:
#   ./scripts/dev-services.sh
#
# Set DEV_SKIP_SERVICES=1 to bypass entirely.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ "${DEV_SKIP_SERVICES:-0}" = "1" ]; then
    echo -e "${YELLOW}⏭  DEV_SKIP_SERVICES=1 — skipping container preflight${NC}"
    exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/docker"

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running.${NC}" >&2
    echo "  Start Docker Desktop / OrbStack, then run this again." >&2
    exit 1
fi

# DATABASE_URL from the root .env is the single source for the port; compose
# interpolates POSTGRES_PORT from it. Several projects publish postgres on this
# machine (5432, 5433, 5440), so nothing here may guess.
source "$REPO_ROOT/scripts/lib/db-env.sh"
chobii_load_db_env "$REPO_ROOT" || exit 1
EXPECTED_PORT="$POSTGRES_PORT"

# --no-recreate is deliberate: a running container is left exactly as-is, even
# if its port mapping or env drifted from docker-compose.yml. Recreating would
# silently move postgres off whatever port .env is pointed at.
echo "🐳 Ensuring dev containers are up (postgres :$EXPECTED_PORT)..."
(cd "$COMPOSE_DIR" && POSTGRES_PORT="$EXPECTED_PORT" docker compose up -d --no-recreate postgres redis minio)

# Confirm we adopted the right postgres, not a same-named container left over
# from an older layout or a neighbouring project.
ACTUAL_PORT="$(docker port poster-app-postgres 5432 2>/dev/null | head -1 | sed 's/.*://')"
if [ "$ACTUAL_PORT" != "$EXPECTED_PORT" ]; then
    echo -e "${RED}✗ poster-app-postgres is published on $ACTUAL_PORT but .env expects $EXPECTED_PORT.${NC}" >&2
    echo "  The app would connect to a different project's database." >&2
    echo "  Recreate it with: cd docker && POSTGRES_PORT=$EXPECTED_PORT docker compose up -d --force-recreate postgres" >&2
    exit 1
fi

wait_for() {
    local name="$1" check="$2" tries="${3:-30}"
    for _ in $(seq 1 "$tries"); do
        if eval "$check" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ $name ready${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ $name did not come up in ${tries}s${NC}" >&2
    return 1
}

wait_for "postgres (:$EXPECTED_PORT)" "docker exec poster-app-postgres pg_isready -U poster_app -d poster_app_dev"
wait_for "redis"                      "docker exec poster-app-redis redis-cli ping"
wait_for "minio"                      "curl -sf -m 2 http://localhost:9000/minio/health/live"

echo -e "${GREEN}✓ Dev services ready${NC}"
