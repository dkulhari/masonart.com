#!/bin/bash
# MasonArt Database Reset Script
# Drops and recreates the database, applies schema, and seeds data
#
# Usage:
#   ./scripts/db-reset.sh [OPTIONS]
#
# Options:
#   --skip-seed         Skip seeding data after reset
#   --skip-test-users   Skip seeding test users
#   --docker-reset      Also reset Docker containers (full clean slate)
#   --help              Show this help message
#
# Examples:
#   ./scripts/db-reset.sh                    # Full reset with all seed data
#   ./scripts/db-reset.sh --skip-seed        # Reset schema only, no data
#   ./scripts/db-reset.sh --docker-reset     # Nuclear option: reset everything

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
SKIP_SEED=false
SKIP_TEST_USERS=false
DOCKER_RESET=false

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --skip-seed)
            SKIP_SEED=true
            shift
            ;;
        --skip-test-users)
            SKIP_TEST_USERS=true
            shift
            ;;
        --docker-reset)
            DOCKER_RESET=true
            shift
            ;;
        --help)
            sed -n '2,16p' "$0" | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
fi

# Database connection details
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-poster_app}"
DB_PASSWORD="${DB_PASSWORD:-dev_password}"
DB_NAME="${DB_NAME:-poster_app_dev}"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              MasonArt Database Reset Script                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================================
# Phase 1: Docker Reset (optional)
# ============================================================================
if [ "$DOCKER_RESET" = true ]; then
    echo -e "${BLUE}━━━ Phase 1: Docker Reset ━━━${NC}"
    echo ""
    echo -e "${YELLOW}WARNING: This will delete ALL Docker volumes including data!${NC}"
    echo -n "Continue? [y/N] "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    echo "Stopping and removing Docker containers..."
    cd docker && docker compose down -v && cd ..

    echo "Starting fresh Docker containers..."
    cd docker && docker compose up -d && cd ..

    echo "Waiting for PostgreSQL to be ready..."
    sleep 10

    # Wait for postgres to accept connections
    for i in {1..30}; do
        if nc -z localhost $DB_PORT 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} PostgreSQL is ready"
            break
        fi
        sleep 1
    done
    echo ""
fi

# ============================================================================
# Phase 2: Database Reset
# ============================================================================
echo -e "${BLUE}━━━ Phase 2: Database Reset ━━━${NC}"
echo ""

# Check if postgres is running
if ! nc -z localhost $DB_PORT 2>/dev/null; then
    echo -e "${RED}ERROR: PostgreSQL is not running on port $DB_PORT${NC}"
    echo "Start it with: cd docker && docker compose up -d"
    exit 1
fi

echo "Dropping and recreating database..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Database recreated: $DB_NAME"
else
    echo -e "  ${RED}✗${NC} Failed to recreate database"
    exit 1
fi
echo ""

# ============================================================================
# Phase 3: Schema Push
# ============================================================================
echo -e "${BLUE}━━━ Phase 3: Schema Push ━━━${NC}"
echo ""

echo "Pushing Drizzle schema to database..."
cd packages/api
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" bunx drizzle-kit push --force 2>&1 | grep -E "(Creating|Pushing|Created|✓|Error|changes)" || true
cd "$PROJECT_ROOT"

echo -e "  ${GREEN}✓${NC} Schema pushed successfully"
echo ""

# ============================================================================
# Phase 4: Seed Data
# ============================================================================
if [ "$SKIP_SEED" = false ]; then
    echo -e "${BLUE}━━━ Phase 4: Seed Data ━━━${NC}"
    echo ""

    echo "Seeding products, variants, and frames..."
    cd packages/api
    bun run seed 2>&1 | grep -E "(Created|Seeding|seeded|Summary|Products|Variants|Frames)" || true
    cd "$PROJECT_ROOT"

    echo ""
fi

# ============================================================================
# Phase 5: Test Users
# ============================================================================
if [ "$SKIP_SEED" = false ] && [ "$SKIP_TEST_USERS" = false ]; then
    echo -e "${BLUE}━━━ Phase 5: Test Users ━━━${NC}"
    echo ""

    echo "Seeding test users for E2E tests..."
    cd packages/api
    bun run seed:test-users 2>&1 | grep -E "(Created|Updated|Test Credentials|Customer|Admin|Trade)" || true
    cd "$PROJECT_ROOT"

    echo ""
fi

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}              DATABASE RESET COMPLETE                          ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

if [ "$SKIP_SEED" = false ]; then
    echo "Seeded Data:"
    echo "  - 36 products with variants (comprehensive filter coverage)"
    echo "  - 8 frame options"
    if [ "$SKIP_TEST_USERS" = false ]; then
        echo "  - 9 test users (5 customers, 2 admins, 2 trade)"
        echo ""
        echo "Test Credentials (password: TestPassword123!):"
        echo "  Customers: test-customer@example.com, test-customer-2..5@example.com"
        echo "  Admins:    test-admin@masonart.com, test-admin-2@masonart.com"
        echo "  Trade:     test-trade@interior.com (approved)"
        echo "             test-trade-pending@interior.com (pending)"
    fi
fi
echo ""
