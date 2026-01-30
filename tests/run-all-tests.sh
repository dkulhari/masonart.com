#!/bin/bash
# MasonArt Comprehensive Test Runner
# This script ensures all prerequisites are met before running tests
#
# Usage:
#   ./tests/run-all-tests.sh [OPTIONS]
#
# Options:
#   --project=<name>      Browser to run (chromium, firefox, webkit, mobile-chrome, mobile-safari)
#                         Default: chromium
#   --max-failures=<N>    Stop after N test failures (default: no limit)
#   --workers=<N>         Number of parallel workers (default: 4)
#   --grep=<pattern>      Only run tests matching pattern
#   --help                Show this help message
#
# Examples:
#   ./tests/run-all-tests.sh                           # Run all chromium tests
#   ./tests/run-all-tests.sh --max-failures=1          # Stop on first failure
#   ./tests/run-all-tests.sh --max-failures=5          # Stop after 5 failures
#   ./tests/run-all-tests.sh --project=firefox         # Run Firefox tests
#   ./tests/run-all-tests.sh --grep="approval"         # Run only approval tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
PROJECT="chromium"
MAX_FAILURES=""
WORKERS="4"
GREP_PATTERN=""

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --project=*)
            PROJECT="${arg#*=}"
            shift
            ;;
        --max-failures=*)
            MAX_FAILURES="${arg#*=}"
            shift
            ;;
        --workers=*)
            WORKERS="${arg#*=}"
            shift
            ;;
        --grep=*)
            GREP_PATTERN="${arg#*=}"
            shift
            ;;
        --help)
            sed -n '3,20p' "$0" | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Build playwright command options
PLAYWRIGHT_OPTS="--project=$PROJECT --reporter=list --workers=$WORKERS"
[ -n "$MAX_FAILURES" ] && PLAYWRIGHT_OPTS="$PLAYWRIGHT_OPTS --max-failures=$MAX_FAILURES"
[ -n "$GREP_PATTERN" ] && PLAYWRIGHT_OPTS="$PLAYWRIGHT_OPTS --grep=\"$GREP_PATTERN\""

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           MasonArt Comprehensive Test Suite                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Track overall status
OVERALL_STATUS=0
DEV_PID=""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    if [ -n "$DEV_PID" ]; then
        kill $DEV_PID 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Function to check service
check_service() {
    local name=$1
    local port=$2
    if nc -z localhost $port 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $name (port $port)"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name (port $port)"
        return 1
    fi
}

# Function to wait for service
wait_for_service() {
    local name=$1
    local port=$2
    local max_attempts=${3:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost $port 2>/dev/null; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    return 1
}

echo -e "${BLUE}━━━ Phase 1: Docker Services ━━━${NC}"
echo ""

DOCKER_OK=true
check_service "PostgreSQL" 5433 || DOCKER_OK=false
check_service "Redis" 6380 || DOCKER_OK=false
check_service "MinIO API" 9000 || DOCKER_OK=false

if [ "$DOCKER_OK" = false ]; then
    echo ""
    echo -e "${YELLOW}Starting Docker services...${NC}"
    cd docker && docker compose up -d && cd ..

    echo "Waiting for services to initialize..."
    sleep 10

    echo ""
    echo "Re-checking services:"
    check_service "PostgreSQL" 5433 || { echo -e "${RED}ERROR: PostgreSQL failed to start${NC}"; exit 1; }
    check_service "Redis" 6380 || { echo -e "${RED}ERROR: Redis failed to start${NC}"; exit 1; }
    check_service "MinIO API" 9000 || { echo -e "${RED}ERROR: MinIO failed to start${NC}"; exit 1; }
fi

echo ""
echo -e "${GREEN}✓ Docker services ready${NC}"
echo ""

echo -e "${BLUE}━━━ Phase 2: Database Setup ━━━${NC}"
echo ""

cd packages/api
echo "Running database migrations..."
bun run db:push 2>&1 | head -5

echo "Seeding database..."
bun run seed 2>/dev/null && echo -e "  ${GREEN}✓${NC} Seed data applied" || echo -e "  ${YELLOW}⚠${NC} Seed data may already exist"
cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}✓ Database ready${NC}"
echo ""

echo -e "${BLUE}━━━ Phase 3: Starting Development Servers ━━━${NC}"
echo ""

echo "Starting API and Web servers..."
bun run dev > /tmp/masonart-dev.log 2>&1 &
DEV_PID=$!

echo "Waiting for servers to start (max 60 seconds)..."
echo -n "  API Server: "
if wait_for_service "API" 3000 60; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    cat /tmp/masonart-dev.log
    exit 1
fi

echo -n "  Web Server: "
if wait_for_service "Web" 3001 60; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    cat /tmp/masonart-dev.log
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Development servers ready${NC}"
echo ""

echo -e "${BLUE}━━━ Phase 4: API Health Check ━━━${NC}"
echo ""

HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "  ${GREEN}✓${NC} API health check passed"
else
    echo -e "  ${RED}✗${NC} API health check failed: $HEALTH_RESPONSE"
    OVERALL_STATUS=1
fi

echo ""

echo -e "${BLUE}━━━ Phase 5: E2E Tests (Playwright) ━━━${NC}"
echo ""

# Display test configuration
echo "Configuration:"
echo "  Project: $PROJECT"
echo "  Workers: $WORKERS"
[ -n "$MAX_FAILURES" ] && echo "  Max failures: $MAX_FAILURES (will stop early)"
[ -n "$GREP_PATTERN" ] && echo "  Filter: $GREP_PATTERN"
echo ""

# Run E2E tests
echo "Running E2E tests..."
if eval "bunx playwright test $PLAYWRIGHT_OPTS" 2>&1; then
    echo -e "${GREEN}✓ E2E tests passed${NC}"
else
    echo -e "${RED}✗ Some E2E tests failed${NC}"
    OVERALL_STATUS=1
fi

echo ""

echo -e "${BLUE}━━━ Phase 6: Test Report ━━━${NC}"
echo ""

# Generate HTML report
bunx playwright test --reporter=html 2>/dev/null || true

echo "Reports available at:"
echo "  - playwright-report/index.html"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}                    ALL TESTS PASSED                         ${NC}"
else
    echo -e "${RED}                    SOME TESTS FAILED                        ${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit $OVERALL_STATUS
