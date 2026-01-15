# Development Environment Setup Guide

This guide provides step-by-step instructions for setting up and starting the development environment for the Poster & Frame E-Commerce Platform.

---

## Prerequisites

Before starting, ensure you have the following installed:

### Required Software

| Software | Version | Installation |
|----------|---------|--------------|
| **Bun** | ^1.1.x | [bun.sh](https://bun.sh) |
| **Docker** | Latest | [docker.com](https://docs.docker.com/get-docker/) |
| **Docker Compose** | Latest | Included with Docker Desktop |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Verify Installation

```bash
# Check Bun version (should be 1.1.x or higher)
bun --version

# Check Docker version
docker --version

# Check Docker Compose version
docker compose version
```

---

## Quick Start

For experienced developers, here's the TL;DR:

```bash
# 1. Clone the repository
git clone <repository-url>
cd poster-app

# 2. Start Docker services
docker compose up -d

# 3. Install dependencies
bun install

# 4. Set up environment variables
cp .env.example .env

# 5. Run database migrations
bun run db:migrate

# 6. Start development servers
bun run dev
```

---

## Step-by-Step Setup

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd poster-app
```

### Step 2: Start Docker Services

The project uses Docker for local development services. Start PostgreSQL, Redis, and MinIO:

```bash
# Start all services in detached mode
docker compose up -d

# Verify services are running
docker compose ps
```

**Expected Output:**
```
NAME                COMMAND                  SERVICE     STATUS
poster-app-postgres ...                      postgres    running
poster-app-redis    ...                      redis       running
poster-app-minio    ...                      minio       running
```

### Step 3: Install Dependencies

Install all project dependencies using Bun:

```bash
bun install
```

This installs dependencies for all packages in the monorepo:
- `packages/api` - Hono API server
- `packages/web` - TanStack Start frontend
- `packages/shared` - Shared types and schemas

### Step 4: Configure Environment Variables

Copy the example environment file and configure your local settings:

```bash
cp .env.example .env
```

Open `.env` and review the settings. For local development, the defaults should work:

```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://poster_app:dev_password@localhost:5432/poster_app_dev

# Cache/Queue (Redis)
REDIS_URL=redis://localhost:6379

# Object Storage (MinIO - S3 compatible)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=poster-app-dev

# API
API_PORT=3000

# Web
WEB_PORT=3001
VITE_API_URL=http://localhost:3000
```

### Step 5: Run Database Migrations

Initialize the database schema:

```bash
bun run db:migrate
```

Optionally, seed the database with sample data:

```bash
bun run db:seed
```

### Step 6: Start Development Servers

Start all development servers (API + Web):

```bash
bun run dev
```

This starts:
- **API Server** at `http://localhost:3000`
- **Web App** at `http://localhost:3001`

---

## Docker Services

### Service Details

| Service | Image | Port(s) | Purpose |
|---------|-------|---------|---------|
| **PostgreSQL** | postgres:16 | 5432 | Primary database |
| **Redis** | redis:7-alpine | 6379 | Caching, sessions, job queues |
| **MinIO** | minio/minio | 9000, 9001 | S3-compatible object storage |

### Docker Compose Configuration

The `docker/docker-compose.yml` file defines the development services:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: poster_app
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: poster_app_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Docker Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f postgres

# Restart a specific service
docker compose restart redis

# Remove volumes (reset data)
docker compose down -v
```

---

## Development Commands

### Root Level (Turborepo)

| Command | Description |
|---------|-------------|
| `bun install` | Install all dependencies |
| `bun run dev` | Start all services (API + Web) |
| `bun run build` | Build all packages |
| `bun run lint` | Lint all packages |
| `bun run typecheck` | TypeScript check all packages |
| `bun run test` | Run tests across all packages |

### API Server (packages/api)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start API server (port 3000) |
| `bun run db:generate` | Generate migrations from schema |
| `bun run db:migrate` | Run pending migrations |
| `bun run db:studio` | Open Drizzle Studio (database GUI) |
| `bun run db:seed` | Seed database with sample data |
| `bun run test` | Run API tests |

### Web App (packages/web)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start TanStack Start (port 3001) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |

---

## Service Endpoints

### Development URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:3001 | Frontend application |
| **API Server** | http://localhost:3000 | Backend API |
| **API Docs** | http://localhost:3000/docs | Swagger/OpenAPI documentation |
| **MinIO Console** | http://localhost:9001 | Object storage admin UI |
| **Drizzle Studio** | http://localhost:4983 | Database GUI (run `bun run db:studio`) |

### Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| PostgreSQL | poster_app | dev_password |
| MinIO | minioadmin | minioadmin |

---

## Troubleshooting

### Port Conflicts

If you see port conflicts, check which services are using the ports:

```bash
# Check what's using a specific port
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :3000  # API
lsof -i :3001  # Web
```

To resolve, either stop the conflicting service or modify the port in `.env`.

### Docker Issues

```bash
# Reset Docker services (removes all data)
docker compose down -v
docker compose up -d

# Rebuild containers
docker compose up -d --build

# Check container health
docker compose ps
```

### Database Connection Issues

1. Verify PostgreSQL is running:
   ```bash
   docker compose ps postgres
   ```

2. Check the connection string in `.env`:
   ```bash
   DATABASE_URL=postgresql://poster_app:dev_password@localhost:5432/poster_app_dev
   ```

3. Test connection:
   ```bash
   docker compose exec postgres psql -U poster_app -d poster_app_dev -c "SELECT 1"
   ```

### Bun/Node Module Issues

```bash
# Clear Bun cache and reinstall
rm -rf node_modules
rm bun.lockb
bun install
```

### Redis Connection Issues

1. Verify Redis is running:
   ```bash
   docker compose ps redis
   ```

2. Test connection:
   ```bash
   docker compose exec redis redis-cli ping
   # Expected: PONG
   ```

---

## Next Steps

Once your development environment is running:

1. **Explore the API** - Visit http://localhost:3000/docs for API documentation
2. **View the Web App** - Open http://localhost:3001 in your browser
3. **Check the Database** - Run `bun run db:studio` to explore the schema
4. **Run Tests** - Execute `bun run test` to verify everything works

For more information, see:
- [Technical Stack Document](./poster-app-tech-stack.md)
- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)
