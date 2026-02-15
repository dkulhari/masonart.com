#!/bin/bash

# =============================================================================
# MasonArt Unified Test Runner
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
#
# Options (for e2e, all, and ci):
#   --project=<name>      Browser project (default: chromium)
#   --file=<path>         Run specific test file (e.g., auth.spec.ts)
#   --grep=<pattern>      Filter tests by pattern
#   --max-failures=<N>    Stop after N test failures
#   --workers=<N>         Parallel workers (default: 4)
#   --help                Show this help message
#
# Examples:
#   ./scripts/run-tests.sh                              # Run all tests
#   ./scripts/run-tests.sh unit                         # Unit tests only
#   ./scripts/run-tests.sh e2e                          # E2E tests
#   ./scripts/run-tests.sh e2e --file=auth.spec.ts      # Specific E2E file
#   ./scripts/run-tests.sh e2e --max-failures=1         # Stop on first failure
#   ./scripts/run-tests.sh e2e --project=firefox         # Firefox tests
#   ./scripts/run-tests.sh e2e --grep="approval"        # Filter by pattern
#   ./scripts/run-tests.sh setup                        # Setup env for manual testing
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
WORKERS="4"
TEST_FILE=""
GREP_PATTERN=""

# Track state
OVERALL_STATUS=0
DEV_PID=""

# Project root (resolve from script location)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    sed -n '6,36p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

parse_args() {
    for arg in "$@"; do
        case $arg in
            all|unit|integration|e2e|ci|setup)
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
    echo "Running database migrations..."
    bun run db:push 2>&1 | head -5

    echo "Seeding database..."
    bun run seed 2>/dev/null && echo -e "  ${GREEN}✓${NC} Seed data applied" || echo -e "  ${YELLOW}⚠${NC} Seed data may already exist"
    cd "$PROJECT_ROOT"

    echo ""
    echo -e "${GREEN}✓ Database ready${NC}"
    echo ""
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
    print_status "MasonArt Unit Tests"
    print_status "=========================================="
    echo ""
    run_unit_tests
    print_success "Unit tests completed!"
}

cmd_integration() {
    print_status "=========================================="
    print_status "MasonArt Integration Tests"
    print_status "=========================================="
    echo ""
    run_integration_tests
    print_success "Integration tests completed!"
}

cmd_e2e() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              MasonArt E2E Test Suite                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    if ! check_docker; then
        print_error "Docker is required for E2E tests"
        exit 1
    fi

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
    print_status "MasonArt CI Test Suite"
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
    echo "║              MasonArt Environment Setup                     ║"
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
    [ -n "$DEV_PID" ] && echo "Dev server PID: $DEV_PID"
    echo "Dev server logs: /tmp/masonart-dev.log"
    echo ""
    [ -n "$DEV_PID" ] && echo "To stop servers:"
    [ -n "$DEV_PID" ] && echo "  kill $DEV_PID"
    echo ""
    exit 0
}

cmd_all() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              MasonArt Full Test Suite                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Unit tests (no Docker needed)
    run_unit_tests

    # Integration tests
    run_integration_tests

    # E2E tests (need Docker)
    if ! check_docker; then
        print_warning "Docker not available - skipping E2E tests"
        print_warning "To run E2E tests, start Docker and run: ./scripts/run-tests.sh e2e"
    else
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
    esac

    exit $OVERALL_STATUS
}

main "$@"
