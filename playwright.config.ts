import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Environment Variables:
 * - SKIP_E2E_SERVER: Set to 'true' to skip automatic web server startup
 *   (use when running tests against an already running server)
 * - E2E_BASE_URL: Override the base URL (default: http://localhost:3001)
 * - CI: Set automatically in CI environments
 * - PW_WORKERS: Local worker count (default: 2)
 * - PW_ALL_BROWSERS: Set to 'true' for firefox/webkit/mobile projects locally
 *
 * Usage:
 * - Normal: npx playwright test
 * - With existing server: SKIP_E2E_SERVER=true npx playwright test
 * - Custom URL: E2E_BASE_URL=http://localhost:5000 npx playwright test
 *
 * Project Structure:
 * - 'setup': Creates authenticated sessions (runs first)
 * - 'chromium': Regular tests + tests using stored auth state
 * - 'firefox', 'webkit': Cross-browser testing (CI or PW_ALL_BROWSERS only)
 * - 'Mobile Chrome', 'Mobile Safari': Mobile testing (CI or PW_ALL_BROWSERS only)
 */

const skipServer = process.env.SKIP_E2E_SERVER === 'true';
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3001';

// Several agents run e2e concurrently on one 8-core machine. Two defaults used
// to let a single spec saturate it: workers defaulted to half the cores, and a
// bare `playwright test <spec>` ran that spec against all five browser
// projects. Locally we default to chromium only and a small worker pool; CI and
// PW_ALL_BROWSERS=1 restore the full matrix. Raise the pool with PW_WORKERS.
const crossBrowser = !!process.env.CI || process.env.PW_ALL_BROWSERS === 'true';

// Auth storage paths
const CUSTOMER_STORAGE = 'tests/.auth/customer.json';
const ADMIN_STORAGE = 'tests/.auth/admin.json';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS ?? 2),
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // =========================================================================
    // Setup Projects - Run first to create authenticated sessions
    // =========================================================================
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      // Auth setup needs more time for registration + login flows
      timeout: 60000,
    },

    // =========================================================================
    // Desktop Browser Projects
    // =========================================================================
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // The remaining browsers only exist under CI or PW_ALL_BROWSERS=1 — a
    // local `playwright test <spec>` should cost one browser, not five.
    ...(crossBrowser
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            dependencies: ['setup'],
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            dependencies: ['setup'],
          },

          // =====================================================================
          // Mobile Browser Projects
          // =====================================================================
          {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
            dependencies: ['setup'],
          },
          {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] },
            dependencies: ['setup'],
          },
        ]
      : []),

    // =========================================================================
    // Authenticated Test Projects (use stored auth state)
    // =========================================================================
    {
      name: 'chromium-customer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: CUSTOMER_STORAGE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.(customer|account)\.spec\.ts/,
    },
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.admin.*\.spec\.ts/,
    },
  ],
  // Only start web server if not explicitly skipped
  ...(skipServer ? {} : {
    webServer: [
      {
        command: 'bun run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: {
          // E2E auth setup logs in as 4 roles back-to-back; all dev traffic
          // shares one "unknown" IP bucket, so the sliding-window limiter
          // always trips. The bypass is inert under NODE_ENV=production —
          // see packages/api/src/middleware/rate-limit.ts (#332).
          DISABLE_RATE_LIMIT: 'true',
        },
      },
    ],
  }),
});
