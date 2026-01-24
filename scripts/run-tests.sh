#!/bin/bash

# =============================================================================
# MasonArt Test Runner Script
# =============================================================================
# This script runs all tests for the MasonArt project including:
# - Unit tests (shared, api, web packages)
# - Setup and integration tests
# - E2E tests with Playwright (requires Docker)
#
# Usage:
#   ./scripts/run-tests.sh           # Run all tests
#   ./scripts/run-tests.sh unit      # Run unit tests only
#   ./scripts/run-tests.sh e2e       # Run E2E tests only
#   ./scripts/run-tests.sh ci        # Run in CI mode (no Docker check)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Check if Docker is available and running
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

# Start Docker services
start_docker_services() {
    print_status "Starting Docker services..."
    cd docker
    docker compose up -d

    # Wait for services to be healthy
    print_status "Waiting for services to be ready..."
    sleep 5

    # Check PostgreSQL
    local retries=30
    while ! docker exec poster-app-postgres pg_isready -U poster_app -d poster_app_dev &> /dev/null; do
        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            print_error "PostgreSQL failed to start"
            exit 1
        fi
        sleep 1
    done
    print_success "PostgreSQL is ready"

    # Check Redis
    while ! docker exec poster-app-redis redis-cli ping &> /dev/null; do
        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            print_error "Redis failed to start"
            exit 1
        fi
        sleep 1
    done
    print_success "Redis is ready"

    cd ..
}

# Stop Docker services
stop_docker_services() {
    print_status "Stopping Docker services..."
    cd docker
    docker compose down
    cd ..
}

# Run unit tests for all packages
run_unit_tests() {
    print_status "Running Unit Tests..."
    echo ""

    # Shared package
    print_status "Running shared package tests..."
    cd packages/shared
    if bun run test; then
        print_success "Shared package tests passed"
    else
        print_error "Shared package tests failed"
        exit 1
    fi
    cd ../..
    echo ""

    # API package (without DB)
    print_status "Running API package tests (without DB)..."
    cd packages/api
    if SKIP_DB_RUNTIME_TESTS=true SKIP_REDIS_RUNTIME_TESTS=true bun run test; then
        print_success "API package tests passed"
    else
        print_error "API package tests failed"
        exit 1
    fi
    cd ../..
    echo ""

    # Web package
    print_status "Running web package tests..."
    cd packages/web
    if bun run test; then
        print_success "Web package tests passed"
    else
        print_error "Web package tests failed"
        exit 1
    fi
    cd ../..
    echo ""
}

# Run setup and integration tests
run_integration_tests() {
    print_status "Running Setup and Integration Tests..."
    echo ""

    if bunx vitest run tests/setup tests/integration; then
        print_success "Setup and integration tests passed"
    else
        print_error "Setup and integration tests failed"
        exit 1
    fi
    echo ""
}

# Run E2E tests with Playwright
run_e2e_tests() {
    local project="${1:-chromium}"

    print_status "Running E2E Tests with Playwright..."
    echo ""

    # Check if server is already running
    if lsof -iTCP:3001 -sTCP:LISTEN &> /dev/null; then
        print_status "Dev server detected on port 3001"
        export SKIP_E2E_SERVER=true
    else
        print_status "Will start dev server automatically"
    fi

    # Run Playwright tests
    if bunx playwright test --project="$project"; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
        exit 1
    fi
    echo ""
}

# Run all tests
run_all_tests() {
    local skip_e2e=false

    print_status "=========================================="
    print_status "MasonArt Test Suite"
    print_status "=========================================="
    echo ""

    # Run unit tests
    run_unit_tests

    # Run setup/integration tests
    run_integration_tests

    # Check Docker for E2E tests
    if ! check_docker; then
        print_warning "Docker not available - skipping E2E tests"
        print_warning "To run E2E tests, start Docker and run: ./scripts/run-tests.sh e2e"
        skip_e2e=true
    fi

    if [ "$skip_e2e" = false ]; then
        # Start Docker services
        start_docker_services

        # Push DB schema and seed
        print_status "Preparing database..."
        cd packages/api
        bunx drizzle-kit push
        bun run seed
        cd ../..

        # Run E2E tests
        run_e2e_tests "chromium"

        # Cleanup
        stop_docker_services
    fi

    print_status "=========================================="
    print_success "All tests completed successfully!"
    print_status "=========================================="
}

# Main script logic
main() {
    # Ensure we're in the project root
    if [ ! -f "package.json" ]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi

    case "${1:-all}" in
        unit)
            run_unit_tests
            ;;
        integration)
            run_integration_tests
            ;;
        e2e)
            if check_docker; then
                start_docker_services
                cd packages/api && bunx drizzle-kit push && bun run seed && cd ../..
                run_e2e_tests "${2:-chromium}"
                stop_docker_services
            else
                print_error "Docker is required for E2E tests"
                exit 1
            fi
            ;;
        ci)
            # CI mode - assume Docker services are available
            print_status "Running in CI mode..."
            run_unit_tests
            run_integration_tests
            SKIP_E2E_SERVER=false run_e2e_tests "chromium"
            ;;
        all)
            run_all_tests
            ;;
        *)
            echo "Usage: $0 {unit|integration|e2e|ci|all}"
            echo ""
            echo "Commands:"
            echo "  unit        Run unit tests only (no Docker required)"
            echo "  integration Run setup and integration tests"
            echo "  e2e         Run E2E tests with Playwright (Docker required)"
            echo "  ci          Run all tests in CI mode"
            echo "  all         Run all tests (default)"
            exit 1
            ;;
    esac
}

main "$@"
