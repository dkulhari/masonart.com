#!/bin/bash

# =============================================================================
# chobii.art Unified Test Runner
# =============================================================================
# Single script for all test execution modes: unit, integration, E2E, CI, setup.
#
# Usage:
#   ./scripts/run-tests.sh [command] [options]
#
# Commands:
#   all           Run all tests: unit + integration + E2E (default)
#   unit          Run unit tests only (no Docker required)
#   integration   Run setup and integration tests
#   e2e           Setup infra + run E2E tests with Playwright
#   ci            Run all tests in CI mode (assumes services exist)
#   setup         Setup infra only, leave servers running for manual testing
#   stop          Stop dev servers and Docker services
#   clean         Full teardown: stop everything + wipe volumes
#
# Options (for setup, e2e, all):
#   --seed-products       Seed 36 sample products with variants
#   --seed-users          Seed test users (customers, admins, trade)
#   --project=<name>      Browser project (default: chromium)
#   --file=<path>         Run specific test file (e.g., auth.spec.ts)
#   --grep=<pattern>      Filter tests by pattern
#   --max-failures=<N>    Stop after N test failures
#   --workers=<N>         Parallel workers (default: 2, or $PW_WORKERS)
#   --help                Show this help message
#
# Examples:
#   ./scripts/run-tests.sh                              # Run all tests
#   ./scripts/run-tests.sh unit                         # Unit tests only
#   ./scripts/run-tests.sh e2e                          # E2E tests (full seed)
#   ./scripts/run-tests.sh e2e --file=auth.spec.ts      # Specific E2E file
#   ./scripts/run-tests.sh e2e --max-failures=1         # Stop on first failure
#   ./scripts/run-tests.sh setup                        # Minimal env (frames + admin)
#   ./scripts/run-tests.sh setup --seed-products        # + 36 sample products
#   ./scripts/run-tests.sh setup --seed-products --seed-users  # Full data
#   ./scripts/run-tests.sh stop                         # Stop servers + Docker
#   ./scripts/run-tests.sh clean                        # Full teardown + wipe
#   ./scripts/run-tests.sh ci                           # CI mode
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print helpers
print_status() { echo -e "${BLUE}[TEST]${NC} $1"; }
print_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# Default options
COMMAND=""
PROJECT="chromium"
MAX_FAILURES=""
# Concurrent agents share one 8-core machine — 4 workers each pegged it.
# Pass --workers=N for a solo run.
WORKERS="${PW_WORKERS:-2}"
TEST_FILE=""
GREP_PATTERN=""
SEED_PRODUCTS=false
SEED_USERS=false

# Track state
OVERALL_STATUS=0
DEV_PID=""

# File paths
PID_FILE="/tmp/chobii-dev.pid"
CREDENTIALS_FILE="/tmp/chobii-credentials.txt"
DEV_LOG="/tmp/chobii-dev.log"

# Project root (resolve from script location)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    sed -n '6,44p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

parse_args() {
    for arg in "$@"; do
        case $arg in
            all|unit|integration|e2e|ci|setup|stop|clean)
                COMMAND="$arg"
                ;;
            --project=*)
                PROJECT="${arg#*=}"
                ;;
            --max-failures=*)
                MAX_FAILURES="${arg#*=}"
                ;;
            --workers=*)
                WORKERS="${arg#*=}"
                ;;
            --file=*)
                TEST_FILE="${arg#*=}"
                ;;
            --grep=*)
                GREP_PATTERN="${arg#*=}"
                ;;
            --seed-products)
                SEED_PRODUCTS=true
                ;;
            --seed-users)
                SEED_USERS=true
                ;;
            --help|-h)
                show_help
                ;;
            *)
                echo "Unknown option: $arg"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # Default command
    if [ -z "$COMMAND" ]; then
        COMMAND="all"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Service utilities
# ─────────────────────────────────────────────────────────────────────────────

check_service() {
    local name=$1
    local port=$2
    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $name (port $port)"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name (port $port)"
        return 1
    fi
}

wait_for_service() {
    local name=$1
    local port=$2
    local max_attempts=${3:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost "$port" 2>/dev/null; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    return 1
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        return 1
    fi
    if ! docker info &> /dev/null; then
        print_error "Docker is not running"
        return 1
    fi
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Infrastructure setup
# ─────────────────────────────────────────────────────────────────────────────

start_docker_services() {
    echo -e "${BLUE}━━━ Docker Services ━━━${NC}"
    echo ""

    local DOCKER_OK=true
    check_service "PostgreSQL" 5433 || DOCKER_OK=false
    check_service "Redis" 6380 || DOCKER_OK=false
    check_service "MinIO API" 9000 || DOCKER_OK=false

    if [ "$DOCKER_OK" = false ]; then
        echo ""
        echo -e "${YELLOW}Starting Docker services...${NC}"
        cd "$PROJECT_ROOT/docker" && docker compose up -d && cd "$PROJECT_ROOT"

        echo "Waiting for services to initialize..."
        sleep 10

        echo ""
        echo "Re-checking services:"
        check_service "PostgreSQL" 5433 || { print_error "PostgreSQL failed to start"; exit 1; }
        check_service "Redis" 6380 || { print_error "Redis failed to start"; exit 1; }
        check_service "MinIO API" 9000 || { print_error "MinIO failed to start"; exit 1; }
    fi

    echo ""
    echo -e "${GREEN}✓ Docker services ready${NC}"
    echo ""
}

stop_docker_services() {
    print_status "Stopping Docker services..."
    cd "$PROJECT_ROOT/docker" && docker compose down && cd "$PROJECT_ROOT"
}

setup_database() {
    echo -e "${BLUE}━━━ Database Setup ━━━${NC}"
    echo ""

    cd "$PROJECT_ROOT/packages/api"

    # Load root .env so drizzle-kit can find DATABASE_URL
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    fi

    # Always: migrate schema
    echo "Running database migrations..."
    bun run db:push 2>&1 | head -5

    # Always: seed frames + admin
    echo "Seeding frames and admin user..."
    bun run seed:admin 2>/dev/null && echo -e "  ${GREEN}✓${NC} Admin seed applied" || echo -e "  ${YELLOW}⚠${NC} Admin seed may already exist"

    # Optional: seed products
    if [ "$SEED_PRODUCTS" = true ]; then
        echo "Seeding sample products..."
        bun run seed 2>/dev/null && echo -e "  ${GREEN}✓${NC} Product seed applied" || echo -e "  ${YELLOW}⚠${NC} Product seed may already exist"
    fi

    # Optional: seed test users
    if [ "$SEED_USERS" = true ]; then
        echo "Seeding test users..."
        bun run seed:test-users 2>/dev/null && echo -e "  ${GREEN}✓${NC} Test users seeded" || echo -e "  ${YELLOW}⚠${NC} Test users may already exist"
    fi

    cd "$PROJECT_ROOT"

    # Write credentials file
    write_credentials_file

    echo ""
    echo -e "${GREEN}✓ Database ready${NC}"
    echo ""
}

write_credentials_file() {
    cat > "$CREDENTIALS_FILE" << 'CRED_HEADER'
========================================
  chobii.art Seeded Credentials
========================================

Admin:
  admin@chobii.art / AdminPass123! (admin)
CRED_HEADER

    if [ "$SEED_USERS" = true ]; then
        cat >> "$CREDENTIALS_FILE" << 'CRED_USERS'

Customers:
  test-customer@example.com / TestPassword123! (customer)
  test-customer-2@example.com / TestPassword123! (customer)
  test-customer-3@example.com / TestPassword123! (customer)
  test-customer-4@example.com / TestPassword123! (customer)
  test-customer-5@example.com / TestPassword123! (customer)

Admins:
  test-admin@chobii.art / TestPassword123! (admin)
  test-admin-2@chobii.art / TestPassword123! (admin)

Trade:
  test-trade@interior.com / TestPassword123! (trade, approved)
  test-trade-pending@interior.com / TestPassword123! (trade, pending)
CRED_USERS
    fi

    echo ""
    echo -e "  ${GREEN}✓${NC} Credentials saved to: $CREDENTIALS_FILE"
}

start_dev_servers() {
    echo -e "${BLUE}━━━ Starting Development Servers ━━━${NC}"
    echo ""

    # Check if servers already running
    if nc -z localhost 3001 2>/dev/null && nc -z localhost 3000 2>/dev/null; then
        print_status "Dev servers already running on ports 3000/3001"
        echo ""
        return 0
    fi

    echo "Starting API and Web servers..."
    cd "$PROJECT_ROOT"
    bun run dev > "$DEV_LOG" 2>&1 &
    DEV_PID=$!

    # Write PID file for cross-session tracking
    echo "$DEV_PID" > "$PID_FILE"

    echo "Waiting for servers to start (max 60 seconds)..."
    echo -n "  API Server: "
    if wait_for_service "API" 3000 60; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
        cat "$DEV_LOG"
        exit 1
    fi

    echo -n "  Web Server: "
    if wait_for_service "Web" 3001 60; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
        cat "$DEV_LOG"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}✓ Development servers ready${NC}"
    echo ""
}

stop_dev_servers() {
    # Try PID file first
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping dev servers (PID $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi

    # Fallback: kill by port
    for port in 3000 3001; do
        local pids
        pids=$(lsof -ti TCP:$port -s TCP:LISTEN 2>/dev/null || true)
        if [ -n "$pids" ]; then
            print_status "Killing process on port $port..."
            echo "$pids" | xargs kill 2>/dev/null || true
        fi
    done
}

health_check() {
    echo -e "${BLUE}━━━ API Health Check ━━━${NC}"
    echo ""

    local HEALTH_RESPONSE
    HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "FAILED")
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        echo -e "  ${GREEN}✓${NC} API health check passed"
    else
        echo -e "  ${RED}✗${NC} API health check failed: $HEALTH_RESPONSE"
        OVERALL_STATUS=1
    fi

    echo ""
}

# Full infrastructure setup: Docker + DB + servers + health check
setup_infra() {
    start_docker_services
    setup_database
    start_dev_servers
    health_check
}

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────

cleanup() {
    if [ "$COMMAND" = "setup" ]; then
        return  # Leave servers running in setup mode
    fi
    if [ -n "$DEV_PID" ]; then
        echo ""
        echo -e "${YELLOW}Cleaning up...${NC}"
        kill $DEV_PID 2>/dev/null || true
        rm -f "$PID_FILE"
    fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Test runners
# ─────────────────────────────────────────────────────────────────────────────

run_unit_tests() {
    print_status "Running Unit Tests..."
    echo ""

    # Shared package
    print_status "Running shared package tests..."
    cd "$PROJECT_ROOT/packages/shared"
    if bun run test; then
        print_success "Shared package tests passed"
    else
        print_error "Shared package tests failed"
        cd "$PROJECT_ROOT"
        exit 1
    fi
    cd "$PROJECT_ROOT"
    echo ""

    # API package (without DB)
    print_status "Running API package tests (without DB)..."
    cd "$PROJECT_ROOT/packages/api"
    if SKIP_DB_RUNTIME_TESTS=true SKIP_REDIS_RUNTIME_TESTS=true bun run test; then
        print_success "API package tests passed"
    else
        print_error "API package tests failed"
        cd "$PROJECT_ROOT"
        exit 1
    fi
    cd "$PROJECT_ROOT"
    echo ""

    # Web package
    print_status "Running web package tests..."
    cd "$PROJECT_ROOT/packages/web"
    if bun run test; then
        print_success "Web package tests passed"
    else
        print_error "Web package tests failed"
        cd "$PROJECT_ROOT"
        exit 1
    fi
    cd "$PROJECT_ROOT"
    echo ""
}

run_integration_tests() {
    print_status "Running Setup and Integration Tests..."
    echo ""

    cd "$PROJECT_ROOT"
    if bunx vitest run tests/setup tests/integration; then
        print_success "Setup and integration tests passed"
    else
        print_error "Setup and integration tests failed"
        exit 1
    fi
    echo ""
}

resolve_test_file() {
    if [ -z "$TEST_FILE" ]; then
        TEST_FILE_PATH=""
        return
    fi

    # If it's just a filename, prepend tests/e2e/
    if [[ "$TEST_FILE" != *"/"* ]]; then
        TEST_FILE_PATH="tests/e2e/$TEST_FILE"
    else
        TEST_FILE_PATH="$TEST_FILE"
    fi

    # Verify file exists
    if [ ! -f "$PROJECT_ROOT/$TEST_FILE_PATH" ]; then
        print_error "Test file not found: $TEST_FILE_PATH"
        echo "Available test files:"
        ls "$PROJECT_ROOT/tests/e2e/"*.spec.ts 2>/dev/null | xargs -I{} basename {} | head -10
        exit 1
    fi
}

run_e2e_tests() {
    echo -e "${BLUE}━━━ E2E Tests (Playwright) ━━━${NC}"
    echo ""

    resolve_test_file

    # Build playwright command options
    local PLAYWRIGHT_OPTS="--project=$PROJECT --reporter=list --workers=$WORKERS"
    [ -n "$MAX_FAILURES" ] && PLAYWRIGHT_OPTS="$PLAYWRIGHT_OPTS --max-failures=$MAX_FAILURES"
    [ -n "$GREP_PATTERN" ] && PLAYWRIGHT_OPTS="$PLAYWRIGHT_OPTS --grep=\"$GREP_PATTERN\""

    # Display configuration
    echo "Configuration:"
    echo "  Project: $PROJECT"
    echo "  Workers: $WORKERS"
    [ -n "$TEST_FILE_PATH" ] && echo "  Test file: $TEST_FILE_PATH"
    [ -n "$MAX_FAILURES" ] && echo "  Max failures: $MAX_FAILURES"
    [ -n "$GREP_PATTERN" ] && echo "  Filter: $GREP_PATTERN"
    echo ""

    # Run E2E tests
    echo "Running E2E tests..."
    cd "$PROJECT_ROOT"
    if eval "bunx playwright test $TEST_FILE_PATH $PLAYWRIGHT_OPTS" 2>&1; then
        echo -e "${GREEN}✓ E2E tests passed${NC}"
    else
        echo -e "${RED}✗ Some E2E tests failed${NC}"
        OVERALL_STATUS=1
    fi

    echo ""

    echo "Reports available at:"
    echo "  - playwright-report/index.html"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────────────────────

cmd_unit() {
    print_status "=========================================="
    print_status "chobii.art Unit Tests"
    print_status "=========================================="
    echo ""
    run_unit_tests
    print_success "Unit tests completed!"
}

cmd_integration() {
    print_status "=========================================="
    print_status "chobii.art Integration Tests"
    print_status "=========================================="
    echo ""
    run_integration_tests
    print_success "Integration tests completed!"
}

cmd_e2e() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              chobii.art E2E Test Suite                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    if ! check_docker; then
        print_error "Docker is required for E2E tests"
        exit 1
    fi

    # E2E tests need full data
    SEED_PRODUCTS=true
    SEED_USERS=true

    setup_infra
    run_e2e_tests

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ $OVERALL_STATUS -eq 0 ]; then
        echo -e "${GREEN}                    ALL E2E TESTS PASSED                      ${NC}"
    else
        echo -e "${RED}                    SOME E2E TESTS FAILED                     ${NC}"
    fi
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

cmd_ci() {
    print_status "=========================================="
    print_status "chobii.art CI Test Suite"
    print_status "=========================================="
    echo ""

    print_status "Running in CI mode (assuming services exist)..."
    echo ""

    run_unit_tests
    run_integration_tests

    # In CI, servers should already be running or started by CI pipeline
    SKIP_E2E_SERVER=false run_e2e_tests

    print_success "CI test suite completed!"
}

cmd_setup() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              chobii.art Environment Setup                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    if ! check_docker; then
        print_error "Docker is required for environment setup"
        exit 1
    fi

    setup_infra

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}            SETUP COMPLETE - READY FOR MANUAL TESTING           ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Services running:"
    echo "  • Web App:    http://localhost:3001"
    echo "  • API Server: http://localhost:3000"
    echo "  • PostgreSQL: localhost:5433"
    echo "  • Redis:      localhost:6380"
    echo "  • MinIO:      http://localhost:9000"
    echo ""
    echo "Seeded data:"
    echo "  • Frames: 8 frame options"
    echo "  • Admin:  admin@chobii.art / AdminPass123!"
    [ "$SEED_PRODUCTS" = true ] && echo "  • Products: 36 sample products with variants"
    [ "$SEED_USERS" = true ] && echo "  • Test users: 9 users (customers, admins, trade)"
    echo ""
    echo "Credentials saved to: $CREDENTIALS_FILE"
    echo ""
    [ -n "$DEV_PID" ] && echo "Dev server PID: $DEV_PID (saved to $PID_FILE)"
    echo "Dev server logs: $DEV_LOG"
    echo ""
    echo "To stop:  ./scripts/run-tests.sh stop"
    echo "To clean: ./scripts/run-tests.sh clean"
    echo ""
    exit 0
}

cmd_stop() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              chobii.art Environment Stop                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    stop_dev_servers

    if check_docker 2>/dev/null; then
        print_status "Stopping Docker services..."
        cd "$PROJECT_ROOT/docker" && docker compose stop && cd "$PROJECT_ROOT"
        echo -e "  ${GREEN}✓${NC} Docker services stopped"
    else
        print_warning "Docker not available, skipping"
    fi

    echo ""
    print_success "Environment stopped. Data and volumes preserved."
    echo ""
    exit 0
}

cmd_clean() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              chobii.art Environment Clean                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    stop_dev_servers

    if check_docker 2>/dev/null; then
        print_status "Removing Docker containers and volumes..."
        cd "$PROJECT_ROOT/docker" && docker compose down -v && cd "$PROJECT_ROOT"
        echo -e "  ${GREEN}✓${NC} Docker containers and volumes removed"
    else
        print_warning "Docker not available, skipping"
    fi

    print_status "Removing temp files..."
    rm -f "$PID_FILE" "$DEV_LOG" "$CREDENTIALS_FILE"
    echo -e "  ${GREEN}✓${NC} Temp files removed"

    echo ""
    print_success "Full teardown complete. Everything wiped."
    echo ""
    exit 0
}

cmd_all() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              chobii.art Full Test Suite                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Unit tests (no Docker needed)
    run_unit_tests

    # Integration tests
    run_integration_tests

    # E2E tests (need Docker + full data)
    if ! check_docker; then
        print_warning "Docker not available - skipping E2E tests"
        print_warning "To run E2E tests, start Docker and run: ./scripts/run-tests.sh e2e"
    else
        SEED_PRODUCTS=true
        SEED_USERS=true
        setup_infra
        run_e2e_tests
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ $OVERALL_STATUS -eq 0 ]; then
        echo -e "${GREEN}                    ALL TESTS PASSED                           ${NC}"
    else
        echo -e "${RED}                    SOME TESTS FAILED                          ${NC}"
    fi
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    cd "$PROJECT_ROOT"

    if [ ! -f "package.json" ]; then
        print_error "Cannot find package.json in $PROJECT_ROOT"
        exit 1
    fi

    parse_args "$@"

    case "$COMMAND" in
        all)         cmd_all ;;
        unit)        cmd_unit ;;
        integration) cmd_integration ;;
        e2e)         cmd_e2e ;;
        ci)          cmd_ci ;;
        setup)       cmd_setup ;;
        stop)        cmd_stop ;;
        clean)       cmd_clean ;;
    esac

    exit $OVERALL_STATUS
}

main "$@"
