import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Environment Variables:
 * - SKIP_E2E_SERVER: Set to 'true' to skip automatic web server startup
 *   (use when running tests against an already running server)
 * - E2E_BASE_URL: Override the base URL (default: http://localhost:3001)
 * - CI: Set automatically in CI environments
 *
 * Usage:
 * - Normal: npx playwright test
 * - With existing server: SKIP_E2E_SERVER=true npx playwright test
 * - Custom URL: E2E_BASE_URL=http://localhost:5000 npx playwright test
 */

const skipServer = process.env.SKIP_E2E_SERVER === 'true';
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
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
      },
    ],
  }),
});
