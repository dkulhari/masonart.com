# MasonArt

A modern e-commerce platform for custom art posters and AI-generated artwork, built with a monorepo architecture.

## Tech Stack

- **Backend:** Hono + Drizzle ORM + PostgreSQL + BullMQ
- **Frontend:** TanStack Start + TanStack Router/Query + Zustand + Tailwind CSS
- **Runtime:** Bun
- **Monorepo:** Bun workspaces + Turbo

## Project Structure

```
masonart/
├── packages/
│   ├── api/          # Hono backend API
│   ├── web/          # TanStack Start frontend
│   └── shared/       # Shared types, schemas, constants
├── tests/
│   ├── e2e/          # Playwright E2E tests
│   ├── integration/  # Cross-service integration tests
│   ├── setup/        # Infrastructure tests
│   └── fixtures/     # Test fixtures
├── docs/
│   └── manual-tests/ # Manual test documentation
└── docker/           # Docker configuration
```

## Prerequisites

- [Bun](https://bun.sh/) >= 1.1.38
- [Node.js](https://nodejs.org/) >= 20.0.0
- [Docker](https://www.docker.com/) (for PostgreSQL and Redis)
- [Playwright](https://playwright.dev/) (for E2E tests)

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd masonart
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Docker services (PostgreSQL & Redis):**

   ```bash
   docker compose up -d
   ```

5. **Run database migrations:**

   ```bash
   cd packages/api
   bun run db:push
   bun run seed
   ```

6. **Start development servers:**
   ```bash
   bun run dev
   ```

## Available Scripts

| Command                | Description                    |
| ---------------------- | ------------------------------ |
| `bun run dev`          | Start all development servers  |
| `bun run build`        | Build all packages             |
| `bun run lint`         | Run ESLint across all packages |
| `bun run typecheck`    | Run TypeScript type checking   |
| `bun run format`       | Format code with Prettier      |
| `bun run format:check` | Check formatting with Prettier |
| `bun run clean`        | Clean build artifacts          |

---

## Testing

MasonArt uses a comprehensive testing strategy with multiple layers:

| Layer                   | Framework                                       | Location              |
| ----------------------- | ----------------------------------------------- | --------------------- |
| **E2E Testing**         | [Playwright](https://playwright.dev/)           | `tests/e2e/`          |
| **Integration Testing** | [Vitest](https://vitest.dev/)                   | `tests/integration/`  |
| **API Unit Testing**    | [Vitest](https://vitest.dev/)                   | `packages/api/tests/` |
| **Web Unit Testing**    | [Vitest](https://vitest.dev/) + Testing Library | `packages/web/tests/` |

### Quick Start

```bash
# Run all tests
bun run test

# Run E2E tests
bun run test:e2e

# Run integration tests
bun run test:integration
```

### Running E2E Tests (Playwright)

E2E tests use Playwright and require the development server to be running.

```bash
# Run all E2E tests (auto-starts dev server)
npx playwright test

# Run E2E tests with UI mode (interactive)
npx playwright test --ui

# Run specific E2E test file
npx playwright test tests/e2e/home.spec.ts

# Run tests in a specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run mobile viewport tests
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"

# Run tests against an already running server
SKIP_E2E_SERVER=true npx playwright test

# Run tests with custom base URL
E2E_BASE_URL=http://localhost:5000 npx playwright test

# View test report
npx playwright show-report
```

### Running API Tests (Vitest)

```bash
# Run all API tests
cd packages/api
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Run specific test file
bun run test -- tests/routes/products.test.ts
```

### Running Web Tests (Vitest + Testing Library)

```bash
# Run all web tests
cd packages/web
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Run specific test file
bun run test -- tests/hooks/useProducts.test.ts
```

### Running Integration Tests

```bash
# Run all integration tests
bun run test:integration

# Or run directly with Vitest
npx vitest run tests/integration/
```

### Running Infrastructure Tests

Infrastructure tests verify the project setup (Docker, environment variables, workspaces).

```bash
# Run setup/infrastructure tests
npx vitest run tests/setup/
```

### Test Coverage

Generate test coverage reports:

```bash
# API coverage
cd packages/api && bun run test:coverage

# Web coverage
cd packages/web && bun run test:coverage

# Coverage reports are generated in the 'coverage/' directory
```

### E2E Test Configuration

The Playwright configuration (`playwright.config.ts`) supports:

- **Multi-browser testing:** Chromium, Firefox, WebKit
- **Mobile viewport testing:** Pixel 5, iPhone 12
- **CI/CD optimizations:** Retries, single worker
- **Flexible server management:** Auto-start or use existing server

Key environment variables:

- `SKIP_E2E_SERVER=true` - Skip automatic server startup
- `E2E_BASE_URL=<url>` - Override the base URL (default: http://localhost:3001)
- `CI=true` - Enable CI-specific settings (retries, single worker)

### Test Directory Structure

```
tests/
├── e2e/                    # Playwright E2E tests
│   ├── flows/              # Full user journey tests
│   │   ├── catalog.spec.ts
│   │   ├── checkout.spec.ts
│   │   ├── auth.spec.ts
│   │   └── admin.spec.ts
│   ├── home.spec.ts
│   ├── product-listing.spec.ts
│   ├── cart.spec.ts
│   ├── checkout.spec.ts
│   ├── auth.spec.ts
│   ├── admin-*.spec.ts
│   └── seo-*.spec.ts
├── integration/            # Cross-service tests
│   ├── seed.test.ts
│   └── api-frontend.test.ts
├── setup/                  # Infrastructure tests
│   ├── workspaces.test.ts
│   ├── docker.test.ts
│   └── env.test.ts
└── fixtures/               # Test fixtures
    ├── products.ts
    ├── users.ts
    └── orders.ts

packages/api/tests/
├── server.test.ts          # Server startup tests
├── setup.ts                # Test setup
├── database/               # Database tests
│   ├── connection.test.ts
│   ├── products.test.ts
│   └── ...
├── routes/                 # API route tests
│   ├── products.test.ts
│   ├── cart.test.ts
│   └── ...
├── middleware/             # Middleware tests
├── auth/                   # Auth tests
├── ai/                     # AI feature tests
├── queues/                 # Queue tests
└── lib/                    # Library tests

packages/web/tests/
├── build.test.ts           # Build verification tests
├── styles.test.ts          # Style tests
├── setup.ts                # Test setup
├── hooks/                  # React hook tests
├── stores/                 # Zustand store tests
└── lib/                    # Utility tests
```

### Writing Tests

**E2E Test Example (Playwright):**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Product Listing", () => {
  test("should display products", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByTestId("product-card")).toHaveCount(12);
  });
});
```

**API Test Example (Vitest):**

```typescript
import { describe, it, expect } from "vitest";
import { app } from "../src/index";

describe("Products API", () => {
  it("should return products list", async () => {
    const res = await app.request("/api/products");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
```

**Component Test Example (Vitest + Testing Library):**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from '../components/ProductCard';

describe('ProductCard', () => {
  it('should render product title', () => {
    render(<ProductCard product={{ title: 'Test Product' }} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });
});
```

### Manual Testing

Manual test documentation is available in `docs/manual-tests/`. These guides follow a structured format for browser-based testing with specific test cases, expected results, and issue tracking.

### CI/CD Integration

Tests are automatically run in CI via GitHub Actions (`.github/workflows/test.yml`):

- **Unit tests:** Run on every push/PR
- **E2E tests:** Run with PostgreSQL and Redis services
- **Artifacts:** Test reports are uploaded on failure

---

## Database Management

```bash
cd packages/api

# Generate migrations
bun run db:generate

# Run migrations
bun run db:migrate

# Push schema changes (development)
bun run db:push

# Open Drizzle Studio (GUI)
bun run db:studio

# Seed database
bun run seed
```

## License

Private - All rights reserved.
