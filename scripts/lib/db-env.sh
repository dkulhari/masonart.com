#!/bin/bash
# Shared resolver for the dev database connection, sourced by the other
# scripts. The root .env is the single place the URL is configured — several
# projects run postgres on this machine (5432, 5433, 5440), so nothing here
# may guess a port.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/db-env.sh"
#   chobii_load_db_env "$PROJECT_ROOT"
# Exports: DATABASE_URL, POSTGRES_PORT, DB_HOST, DB_PORT, DB_USER,
#          DB_PASSWORD, DB_NAME

chobii_load_db_env() {
    local root="$1"
    local env_file="$root/.env"

    if [ -z "${DATABASE_URL:-}" ]; then
        if [ ! -f "$env_file" ]; then
            echo "✗ No DATABASE_URL set and no $env_file to read it from." >&2
            echo "  Copy .env.example to .env, or export DATABASE_URL." >&2
            return 1
        fi
        DATABASE_URL="$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}DATABASE_URL=//p' "$env_file" \
            | head -1 | sed 's/^["'"'"']//; s/["'"'"']$//')"
    fi

    if [ -z "$DATABASE_URL" ]; then
        echo "✗ DATABASE_URL is empty in $env_file." >&2
        return 1
    fi

    # postgresql://user:password@host:port/dbname
    local rest="${DATABASE_URL#*://}"
    local creds="${rest%%@*}"
    local hostpart="${rest#*@}"

    DB_USER="${creds%%:*}"
    DB_PASSWORD="${creds#*:}"
    DB_HOST="${hostpart%%:*}"
    local portpath="${hostpart#*:}"
    DB_PORT="${portpath%%/*}"
    local dbpart="${portpath#*/}"
    DB_NAME="${dbpart%%\?*}"
    POSTGRES_PORT="$DB_PORT"

    if [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ]; then
        echo "✗ Could not parse DATABASE_URL: $DATABASE_URL" >&2
        return 1
    fi

    export DATABASE_URL POSTGRES_PORT DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
}
