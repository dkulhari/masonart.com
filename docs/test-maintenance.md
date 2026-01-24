# Test Maintenance Guide

A comprehensive guide for maintaining and updating tests as the MasonArt platform evolves.

**Last Updated:** 2026-01-19

---

## Table of Contents

1. [When to Update Tests](#when-to-update-tests)
2. [Test File Organization](#test-file-organization)
3. [Adding Tests for New Features](#adding-tests-for-new-features)
4. [Updating Tests for Changed Features](#updating-tests-for-changed-features)
5. [Test Patterns and Conventions](#test-patterns-and-conventions)
6. [Fixing Broken Tests](#fixing-broken-tests)
7. [Test Deprecation and Removal](#test-deprecation-and-removal)
8. [Fixtures and Test Data](#fixtures-and-test-data)
9. [CI/CD Considerations](#cicd-considerations)
10. [Common Pitfalls](#common-pitfalls)
11. [Checklist for Test Maintenance](#checklist-for-test-maintenance)

---

## When to Update Tests

### Mandatory Test Updates

Update tests whenever you:

1. **Add a new feature** - Write tests before or alongside the implementation
2. **Modify existing behavior** - Update tests to match new expectations
3. **Fix a bug** - Add a regression test that fails without the fix
4. **Change API contracts** - Update route tests and integration tests
5. **Update database schemas** - Update schema tests and CRUD tests
6. **Modify UI components** - Update E2E tests and component tests
7. **Add/modify validation rules** - Update schema validation tests

### Signs Tests Need Attention

- Tests fail after code changes (may indicate tests need updating or code has bugs)
- Tests pass but don't reflect current feature behavior
- Test coverage drops significantly (check with `bun run test:coverage`)
- Duplicate or redundant tests exist
- Tests are flaky (pass/fail inconsistently)

---

## Test File Organization

### Directory Structure

```
tests/
├── e2e/                    # Playwright E2E tests (browser-based)
│   ├── flows/              # Full user journey tests
│   │   ├── catalog.spec.ts
│   │   ├── checkout.spec.ts
│   │   ├── auth.spec.ts
│   │   └── admin.spec.ts
│   ├── [page-name].spec.ts # Individual page tests
│   └── seo-*.spec.ts       # SEO tests
├── integration/            # Cross-service integration tests
├── setup/                  # Infrastructure tests
└── fixtures/               # Shared test data

packages/api/tests/
├── database/               # Database schema tests
├── routes/                 # API route tests
│   └── admin/              # Admin-specific routes
├── middleware/             # Middleware tests
├── auth/                   # Authentication tests
├── ai/                     # AI feature tests
├── queues/                 # Queue tests
└── lib/                    # Library/utility tests

packages/web/tests/
├── hooks/                  # React hook tests
├── stores/                 # Zustand store tests
└── lib/                    # Utility tests

packages/shared/tests/
├── schemas/                # Zod schema tests
└── constants/              # Business constant tests
```

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Unit tests (Vitest) | `[name].test.ts` | `products.test.ts` |
| E2E tests (Playwright) | `[name].spec.ts` | `home.spec.ts` |
| Test fixtures | `[name].ts` | `products.ts` |
| Setup files | `setup.ts` | `setup.ts` |

---

## Adding Tests for New Features

### Step 1: Identify Test Types Needed

| Feature Type | Required Tests |
|--------------|----------------|
| New API endpoint | Route tests, integration tests, manual test doc |
| New database table | Schema tests, CRUD tests |
| New UI page | E2E tests, manual test doc |
| New component | Component tests (if complex) |
| New hook | Hook tests |
| New Zustand store | Store tests |
| New schema | Schema validation tests |

### Step 2: Create Test Files

**For API Routes:**
```bash
# Create test file in packages/api/tests/routes/
touch packages/api/tests/routes/[feature].test.ts
```

**Template (API Route):**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src';

describe('[Feature] API', () => {
  describe('Module Exports', () => {
    it('should export the router', () => {
      expect(app).toBeDefined();
    });
  });

  describe('GET /api/[feature]', () => {
    it('should return 200 for valid request', async () => {
      const res = await app.request('/api/[feature]');
      expect(res.status).toBe(200);
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await app.request('/api/[feature]/protected');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/[feature]', () => {
    it('should validate request body', async () => {
      const res = await app.request('/api/[feature]', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });
  });
});
```

**For E2E Tests:**
```bash
# Create test file in tests/e2e/
touch tests/e2e/[feature].spec.ts
```

**Template (E2E Test):**
```typescript
import { test, expect } from '@playwright/test';

test.describe('[Feature] Page', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to page or mock APIs
    await page.goto('/[feature]');
  });

  test.describe('Page Header', () => {
    test('should display page title', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });

  test.describe('Main Content', () => {
    test('should display content', async ({ page }) => {
      await expect(page.getByTestId('[feature]-content')).toBeVisible();
    });
  });

  test.describe('Interactions', () => {
    test('should handle user action', async ({ page }) => {
      await page.click('button[data-action="submit"]');
      await expect(page.getByText('Success')).toBeVisible();
    });
  });
});
```

### Step 3: Add Test Fixtures (if needed)

Create or update fixtures in `tests/fixtures/`:

```typescript
// tests/fixtures/[feature].ts
export const create[Feature] = (overrides: Partial<[Feature]> = {}): [Feature] => ({
  id: 'test-id',
  name: 'Test Name',
  createdAt: new Date(),
  ...overrides,
});

export const mock[Feature]s = [
  create[Feature]({ id: '1', name: 'First' }),
  create[Feature]({ id: '2', name: 'Second' }),
];
```

Update the index export:
```typescript
// tests/fixtures/index.ts
export * from './[feature]';
```

### Step 4: Update Manual Test Documentation

Create a manual test document:
```bash
touch docs/manual-tests/[feature].md
```

Use the template from `docs/manual-tests/` existing files.

---

## Updating Tests for Changed Features

### Scenario 1: API Response Format Changed

1. **Update test expectations:**
   ```typescript
   // Before
   expect(data.products).toBeDefined();

   // After (if response structure changed)
   expect(data.items).toBeDefined();
   expect(data.pagination).toBeDefined();
   ```

2. **Update fixtures if data shapes changed:**
   ```typescript
   // tests/fixtures/products.ts
   export const createProduct = (overrides = {}) => ({
     // Add new fields
     newField: 'default value',
     ...overrides,
   });
   ```

3. **Update integration tests** if API contracts changed.

### Scenario 2: UI Component Changed

1. **Update selectors in E2E tests:**
   ```typescript
   // Before
   await page.click('.old-class-name');

   // After (prefer data-testid)
   await page.click('[data-testid="submit-button"]');
   ```

2. **Update expected text/content:**
   ```typescript
   // Before
   await expect(page.getByText('Old Label')).toBeVisible();

   // After
   await expect(page.getByText('New Label')).toBeVisible();
   ```

### Scenario 3: Database Schema Changed

1. **Update schema tests** in `packages/api/tests/database/`:
   ```typescript
   // Add tests for new columns
   it('should have new_column', () => {
     expect(schema.newColumn).toBeDefined();
   });
   ```

2. **Update fixtures** to include new fields.

3. **Update CRUD tests** with new field operations.

### Scenario 4: Validation Rules Changed

1. **Update schema tests** in `packages/shared/tests/schemas/`:
   ```typescript
   describe('new validation rule', () => {
     it('should reject invalid value', () => {
       expect(() => schema.parse({ field: 'invalid' })).toThrow();
     });

     it('should accept valid value', () => {
       expect(schema.parse({ field: 'valid' })).toBeDefined();
     });
   });
   ```

---

## Test Patterns and Conventions

### AAA Pattern (Arrange-Act-Assert)

Always structure tests with:
```typescript
it('should do something', async () => {
  // Arrange - Set up test conditions
  const input = { name: 'test' };

  // Act - Execute the code under test
  const result = await functionUnderTest(input);

  // Assert - Verify the results
  expect(result.name).toBe('test');
});
```

### Descriptive Test Names

```typescript
// Good - Describes what should happen
it('should return 401 when authentication token is missing', () => {});
it('should display error message when form validation fails', () => {});

// Bad - Too vague
it('test auth', () => {});
it('works', () => {});
```

### Test Grouping

```typescript
describe('Feature Name', () => {
  describe('Module Exports', () => {
    // Export verification tests
  });

  describe('Happy Path', () => {
    // Success scenarios
  });

  describe('Error Handling', () => {
    // Error scenarios
  });

  describe('Edge Cases', () => {
    // Boundary conditions
  });
});
```

### API Testing Pattern

```typescript
describe('GET /api/resource', () => {
  it('should return 200 for valid request', async () => {});
  it('should return 401 for unauthenticated request', async () => {});
  it('should return 400 for invalid query params', async () => {});
  it('should return 404 for non-existent resource', async () => {});
});

describe('POST /api/resource', () => {
  it('should return 201 for valid creation', async () => {});
  it('should return 400 for missing required fields', async () => {});
  it('should return 409 for duplicate resource', async () => {});
});
```

### E2E Testing Pattern

```typescript
test.describe('Page Name', () => {
  test.describe('Page Load', () => {
    test('should display page title', async ({ page }) => {});
    test('should show correct meta tags', async ({ page }) => {});
  });

  test.describe('User Interactions', () => {
    test('should handle button click', async ({ page }) => {});
    test('should submit form successfully', async ({ page }) => {});
  });

  test.describe('Responsive Design', () => {
    test('should adapt to mobile viewport', async ({ page }) => {});
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {});
    test('should be keyboard navigable', async ({ page }) => {});
  });
});
```

---

## Fixing Broken Tests

### Diagnostic Process

1. **Read the error message carefully**
   ```bash
   # Run specific failing test with verbose output
   bun run test -- tests/path/to/test.test.ts --reporter=verbose
   ```

2. **Check if code changed intentionally**
   - If yes: Update test to match new behavior
   - If no: Fix the code regression

3. **Check test environment**
   ```bash
   # Verify environment variables
   env | grep -E "SKIP_|TEST_|DB_|REDIS_"

   # Check if services are running
   docker compose ps
   ```

### Common Fixes

**Test times out:**
```typescript
// Increase timeout for slow operations
it('should process large dataset', async () => {
  // ...
}, 30000); // 30 second timeout
```

**Selector not found (E2E):**
```typescript
// Add wait for element
await page.waitForSelector('[data-testid="element"]');

// Or use auto-waiting assertions
await expect(page.getByTestId('element')).toBeVisible();
```

**Mock not working:**
```typescript
// Ensure mock is set up before import
vi.mock('./module', () => ({
  default: vi.fn(),
}));

// Must be at top of file
import { module } from './module';
```

**Database connection error:**
```typescript
// Add graceful handling
const isDatabaseAvailable = await checkConnection();
if (!isDatabaseAvailable) {
  console.log('Skipping test - database unavailable');
  return;
}
```

---

## Test Deprecation and Removal

### When to Remove Tests

- Feature has been completely removed
- Tests are redundant (covered by other tests)
- Tests are testing internal implementation details that changed

### Deprecation Process

1. **Mark test as skipped with reason:**
   ```typescript
   it.skip('should do X - DEPRECATED: Feature removed in v2.0', () => {});
   ```

2. **Create tracking issue** for test removal

3. **Remove after verification period** (typically 1-2 sprints)

### Before Removing Tests

- [ ] Verify feature is truly removed
- [ ] Check no other tests depend on it
- [ ] Ensure coverage doesn't drop significantly
- [ ] Get code review approval

---

## Fixtures and Test Data

### Updating Fixtures

When models change, update fixtures accordingly:

```typescript
// tests/fixtures/products.ts

// 1. Update the factory function
export const createProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod_test',
  title: 'Test Product',
  // Add new required fields
  newField: 'default value',
  ...overrides,
});

// 2. Update any mock arrays
export const mockProducts = [
  createProduct({ id: '1' }),
  createProduct({ id: '2', newField: 'custom value' }),
];
```

### Database Fixtures

For tests requiring database state:

```typescript
// tests/fixtures/database.ts
export const seedTestData = async (db: Database) => {
  // Clear existing data
  await db.delete(products);

  // Insert test data
  await db.insert(products).values(mockProducts);
};

export const cleanupTestData = async (db: Database) => {
  await db.delete(products);
};
```

### E2E Test Data

For E2E tests, use API mocking:

```typescript
// tests/e2e/[feature].spec.ts
test.beforeEach(async ({ page }) => {
  await page.route('/api/products', async route => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify(mockProducts),
    });
  });
});
```

---

## CI/CD Considerations

### Environment Variables

Set these in CI to control test execution:

| Variable | Purpose |
|----------|---------|
| `SKIP_DB_RUNTIME_TESTS=true` | Skip database-dependent tests |
| `SKIP_REDIS_RUNTIME_TESTS=true` | Skip Redis-dependent tests |
| `SKIP_DOCKER_RUNTIME_TESTS=true` | Skip Docker service checks |
| `SKIP_E2E_SERVER=true` | Use existing server for E2E |
| `CI=true` | Enable CI-specific Playwright settings |

### Test Splitting

For faster CI, split tests across jobs:

```yaml
# .github/workflows/test.yml
jobs:
  test-shared:
    runs-on: ubuntu-latest
    steps:
      - run: cd packages/shared && bun test

  test-api:
    runs-on: ubuntu-latest
    steps:
      - run: cd packages/api && bun test

  test-web:
    runs-on: ubuntu-latest
    steps:
      - run: cd packages/web && bun test
```

### Handling Flaky Tests

1. **Use retries in CI:**
   ```typescript
   // playwright.config.ts
   retries: process.env.CI ? 2 : 0,
   ```

2. **Add explicit waits:**
   ```typescript
   await page.waitForLoadState('networkidle');
   ```

3. **Isolate shared state:**
   ```typescript
   test.beforeEach(async () => {
     // Reset state before each test
   });
   ```

---

## Common Pitfalls

### 1. Testing Implementation Details

```typescript
// Bad - Tests internal structure
it('should call _privateMethod', () => {
  const spy = vi.spyOn(obj, '_privateMethod');
  obj.publicMethod();
  expect(spy).toHaveBeenCalled();
});

// Good - Tests behavior
it('should return expected result', () => {
  const result = obj.publicMethod();
  expect(result).toBe('expected');
});
```

### 2. Hardcoded Values in Assertions

```typescript
// Bad - Breaks if order changes
expect(items[0].id).toBe('specific-id');

// Good - Tests behavior
expect(items).toContainEqual(expect.objectContaining({ id: 'specific-id' }));
```

### 3. Not Cleaning Up State

```typescript
// Bad - Leaves state for other tests
it('creates resource', async () => {
  await createResource();
  // No cleanup
});

// Good - Cleans up after test
it('creates resource', async () => {
  const resource = await createResource();
  // Test...
  await deleteResource(resource.id);
});

// Better - Use hooks
afterEach(async () => {
  await cleanupTestResources();
});
```

### 4. Ignoring Async/Await

```typescript
// Bad - Promise not awaited
it('should fetch data', () => {
  fetchData().then(data => {
    expect(data).toBeDefined();
  });
});

// Good - Properly awaited
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});
```

### 5. Overly Specific Selectors (E2E)

```typescript
// Bad - Breaks easily
await page.click('div.container > section:nth-child(2) > button.primary');

// Good - Semantic selectors
await page.click('[data-testid="submit-button"]');
await page.click('button:has-text("Submit")');
await page.getByRole('button', { name: 'Submit' }).click();
```

---

## Checklist for Test Maintenance

### Adding New Tests

- [ ] Test file follows naming convention (`*.test.ts` or `*.spec.ts`)
- [ ] Test is in the correct directory
- [ ] Uses AAA pattern (Arrange, Act, Assert)
- [ ] Has descriptive test names
- [ ] Includes both happy path and error cases
- [ ] Uses fixtures instead of hardcoded data
- [ ] Cleans up any created resources
- [ ] Runs successfully in isolation
- [ ] Runs successfully with full test suite

### Updating Existing Tests

- [ ] Old behavior is intentionally changed (not a regression)
- [ ] All affected tests are updated
- [ ] Fixtures are updated if data shapes changed
- [ ] Manual test docs are updated if applicable
- [ ] Changes are reviewed by another developer

### Before Pull Request

- [ ] All tests pass locally
- [ ] No skipped tests without explanation
- [ ] Test coverage hasn't decreased significantly
- [ ] CI pipeline passes
- [ ] New tests added for new functionality

### Periodic Maintenance

- [ ] Remove tests for deleted features
- [ ] Update flaky tests
- [ ] Refactor duplicate test code
- [ ] Update outdated fixtures
- [ ] Review and update manual test docs

---

## Quick Reference Commands

```bash
# Run all tests
bun run test

# Run specific test file
bun run test -- tests/path/to/file.test.ts

# Run tests matching pattern
bun run test -- -t "pattern"

# Run E2E tests
npx playwright test

# Run E2E tests with UI
npx playwright test --ui

# Run tests with coverage
bun run test:coverage

# List E2E tests without running
npx playwright test --list

# Debug a specific E2E test
npx playwright test --debug tests/e2e/file.spec.ts
```

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Testing Library Docs](https://testing-library.com/docs/)
- [Internal: TEST-COVERAGE.md](./TEST-COVERAGE.md)
- [Internal: README Testing Section](../README.md#testing)
