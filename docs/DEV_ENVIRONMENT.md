# chobii.art Development Environment Setup

This guide explains how to set up and run the chobii.art e-commerce platform locally.

## Prerequisites

- [Bun](https://bun.sh/) v1.1.x or later
- [Docker](https://www.docker.com/) and Docker Compose
- Git

## Quick Start

```bash
# 1. Navigate to the project directory
cd /path/to/chobii.art

# 2. Start Docker services (PostgreSQL, Redis, MinIO)
cd docker && docker compose up -d && cd ..

# 3. Install dependencies
bun install

# 4. Build the database schema — MIGRATE, never PUSH. See the warning below.
cd packages/api
bun run db:migrate
cd ..

# 5. Seed the database with sample data
cd packages/api && bun run seed && cd ..

# 6. Start the development server
bun run dev
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:3001 | Main frontend (TanStack Start) |
| **API Server** | http://localhost:3000 | Backend API (Hono) |
| **API Health** | http://localhost:3000/api/health | Health check endpoint |
| **MinIO Console** | http://localhost:9001 | Object storage admin |
| **Drizzle Studio** | http://localhost:4983 | Database explorer (run `bun run db:studio` in packages/api) |

## Docker Services

| Service | Host Port | Container Port | Description |
|---------|-----------|----------------|-------------|
| PostgreSQL | 5440 (from `.env`) | 5432 | Database |
| Redis | 6380 | 6379 | Cache & Queue |
| MinIO API | 9000 | 9000 | S3-compatible storage |
| MinIO Console | 9001 | 9001 | Storage admin UI |

### MinIO Credentials
- **Username**: `minioadmin`
- **Password**: `minioadmin`

## Key Application Pages

| Page | URL | Description |
|------|-----|-------------|
| Homepage | http://localhost:3001/ | Landing page with featured products |
| Product Catalog | http://localhost:3001/posters | Browse all products with filters |
| Product Detail | http://localhost:3001/posters/abstract/cosmic-harmony | Example product page |
| Cart | http://localhost:3001/cart | Shopping cart |
| Checkout | http://localhost:3001/checkout | Checkout flow |
| Login | http://localhost:3001/auth/login | User login |
| Register | http://localhost:3001/auth/register | User registration |
| Account | http://localhost:3001/account | User dashboard (requires login) |
| AI Generator | http://localhost:3001/create | AI poster generation |
| Admin Panel | http://localhost:3001/admin | Admin dashboard (requires admin role) |

## Environment Variables

The `.env` file in the project root contains all configuration. Key variables:

```bash
# Database
DATABASE_URL=postgresql://poster_app:dev_password@localhost:5440/poster_app_dev

# Redis
REDIS_URL=redis://localhost:6380

# Authentication
BETTER_AUTH_SECRET=dev-secret-change-in-production

# Storage (MinIO)
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY=minioadmin
R2_SECRET_KEY=minioadmin
R2_BUCKET=poster-app-dev

# Frontend
VITE_API_URL=http://localhost:3000
```

## Useful Commands

### Development
```bash
# Start all services
bun run dev

# Start only API
cd packages/api && bun run dev

# Start only Web
cd packages/web && bun run dev
```

### Database
```bash
cd packages/api

# Apply schema changes to the database
bun run db:migrate

# NOT `drizzle-kit push`. Push diffs the drizzle DSL, which cannot express a
# function or a trigger, so it creates the table and NEITHER — silently. A
# push-built database has no `admin_audit_log_immutable_trg`, which means the
# audit log is editable and deletable: the one property the whole audit design
# rests on. That was #663. `packages/api/src/database/raw-sql-objects.ts` holds
# a manifest of every raw-SQL object and its test names push as the cause — but
# only if somebody runs it.

# Generate migrations — note the meta snapshots and the enum hazard below
bun run db:generate

# Open Drizzle Studio (database explorer)
bun run db:studio

# Seed database with sample data
bun run seed
```

### Docker
```bash
cd docker

# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Check service status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep poster-app

# Reset volumes (delete all data)
docker compose down -v
```

### Type Checking & Build
```bash
# Type check all packages
bun run typecheck

# Build all packages
bun run build

# Clean build artifacts
bun run clean
```

## Sample Data

After running `bun run seed`, the database contains:

- **12 Products** across various styles:
  - Abstract: Cosmic Harmony, Golden Flow
  - Nature: Serene Waves, Mountain Majesty, Forest Whispers, Desert Bloom
  - Botanical: Monstera Dreams, Eucalyptus Study
  - Geometric: Circle of Zen, Linear Horizons
  - Typography: Stay Curious, Dream Big

- **48 Variants** (4 sizes per product):
  - Small (8x10")
  - Medium (12x16")
  - Large (18x24")
  - Extra Large (24x36")

- **8 Frames**:
  - None, Black, White, Wood, Walnut, Oak, Gold, Silver

## Running your own server pair

This machine is shared. Several sessions run their own API and web servers at
once, so `:3000` and `:3001` usually belong to somebody else and are often
stale. Run your own pair rather than assuming those are yours.

| | Port | Notes |
|---|---|---|
| API | `3010` | |
| Web | `4321` | |

Four things that will cost you an afternoon if you skip them:

- **`:5173` is a DIFFERENT APP.** Point an E2E run at it and the suite passes
  vacuously — every selector misses, nothing throws, and you get green. This has
  bitten more than once.
- **`FRONTEND_URL` must match your web port** or every auth setup step fails,
  with an error that does not mention the URL.
- **`VITE_API_PROXY_TARGET` overrides the hardcoded `:3000` proxy.** There is no
  Vite `/api` proxy by default, so without it your web server talks to whoever
  owns `:3000`.
- **The database is on `:5440`.** `:5432` and `:5433` belong to other projects.

### Do not kill processes by pattern

`pkill -f "src/index.ts"` kills **every session's** API server on this box, not
just yours. It has happened during this project. If you need to restart your own
server, find its PID by port.

## Migrations

Migrations are hand-written from `0014` onward and applied with `db:migrate`.
Two hazards are documented in the migration files themselves and are worth
knowing before you write one:

- **`db:push` silently omits triggers and functions** — see the warning in the
  Database section above (#663).
- **A new enum value may not be USED in the same migration batch that adds it.**
  `drizzle-kit` replays every pending migration in ONE transaction, so Postgres
  raises `unsafe use of new value` even when the `ADD VALUE` and the use are in
  different migration *files*. On a fresh database they are still one batch.
  `0018_gift_card_delivery_index_predicate.sql:6-8` is the write-up, and
  `packages/api/tests/database/migration-enum-literals.test.ts` enforces it.
  A backfill that needs a new value is a **script**, not a migration.

## Troubleshooting

### Port Conflicts

If ports 5432 or 6379 are already in use by other projects, the docker-compose.yml uses alternate ports:
- PostgreSQL: 5440 (instead of 5432 — 5432 and 5433 belong to other projects on this machine)
- Redis: 6380 (instead of 6379)

Make sure your `.env` file reflects these ports.

### Database Connection Issues

1. Verify Docker containers are running:
   ```bash
   docker ps | grep poster-app
   ```

2. Test database connection:
   ```bash
   docker exec -it poster-app-postgres psql -U poster_app -d poster_app_dev -c "SELECT 1"
   ```

### Redis Connection Issues

Redis is optional in development. The API will gracefully handle missing Redis connections.

### Frontend Not Loading

1. Check if API is running: http://localhost:3000/api/health
2. Verify VITE_API_URL in `.env` matches API port
3. Check browser console for errors

## Project Structure

```
chobii/
├── docker/
│   └── docker-compose.yml    # Docker services config
├── docs/
│   ├── DEV_ENVIRONMENT.md    # This file
│   ├── Requirement.md        # Product requirements
│   └── poster-app-tech-stack.md  # Tech stack details
├── packages/
│   ├── api/                  # Hono API server
│   │   ├── src/
│   │   │   ├── auth/         # Better Auth config
│   │   │   ├── database/     # Drizzle schema & seed
│   │   │   ├── lib/          # Utilities (redis, storage)
│   │   │   ├── middleware/   # Auth middleware
│   │   │   ├── queues/       # BullMQ workers
│   │   │   └── routes/       # API routes
│   │   └── drizzle.config.ts
│   ├── shared/               # Shared types & schemas
│   │   └── src/
│   │       ├── constants/    # Business constants
│   │       ├── schemas/      # Zod schemas
│   │       └── types/        # TypeScript types
│   └── web/                  # TanStack Start frontend
│       └── app/
│           ├── components/   # React components
│           ├── hooks/        # Custom hooks
│           ├── lib/          # API client, utilities
│           ├── routes/       # File-based routing
│           └── stores/       # Zustand stores
├── .env                      # Environment variables
├── .env.example              # Environment template
├── package.json              # Root workspace config
└── turbo.json                # Turborepo config
```

## Creating an Admin User

To access the admin panel, you need to create an admin user:

1. Register a new user at http://localhost:3001/auth/register
2. Update the user role in the database:
   ```bash
   docker exec -it poster-app-postgres psql -U poster_app -d poster_app_dev -c \
     "UPDATE \"user\" SET role = 'admin' WHERE email = 'your-email@example.com'"
   ```
3. Log in and access http://localhost:3001/admin
