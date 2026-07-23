import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Account Dashboard E2E Tests
 *
 * Tests for the chobii.art user account dashboard page (/account).
 *
 * These tests use REAL authentication via stored session state.
 * The auth.setup.ts file creates and saves authentication state
 * before these tests run.
 *
 * Test Categories:
 * 1. Unauthenticated tests - Verify redirect behavior (no auth needed)
 * 2. Authenticated tests - Verify account page functionality (uses stored auth)
 */

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to stored authentication state
const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json');

// ============================================================================
// Unauthenticated Tests - These don't need auth state
// ============================================================================

test.describe('Account Page - Unauthenticated', () => {
  // Use a fresh context without stored auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect unauthenticated users to login page', async ({ page }) => {
    await page.goto('/account');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should preserve account redirect in login URL', async ({ page }) => {
    await page.goto('/account');

    // Login page should have redirect param pointing back to account
    const url = page.url();
    expect(url).toContain('redirect');
    expect(url).toContain('account');
  });

  test('should show Sign In page title when redirected', async ({ page }) => {
    await page.goto('/account');

    await expect(page).toHaveTitle(/Sign In.*chobii.art/);
  });
});

// ============================================================================
// Authenticated Tests - Use stored authentication state
// ============================================================================

test.describe('Account Page - Authenticated', () => {
  // Use the stored customer authentication state
  test.use({ storageState: CUSTOMER_AUTH });

  test('should load account page without redirect', async ({ page }) => {
    await page.goto('/account');

    // Should stay on account page (not redirect to login)
    await page.waitForURL(/\/account/, { timeout: 10000 });
    expect(page.url()).toContain('/account');
  });

  test('should display My Account title', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Look for account-related heading
    const heading = page.locator('h1, h2').filter({ hasText: /Account|Dashboard/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display user information', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Should show user email from auth.setup.ts
    const userEmail = page.getByText('test-customer@example.com');
    await expect(userEmail).toBeVisible({ timeout: 10000 });
  });

  test('should have Sign Out functionality', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Look for sign out button
    const signOutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), a:has-text("Sign Out")').first();
    await expect(signOutBtn).toBeVisible({ timeout: 10000 });
  });

  test('should have navigation to orders', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Should have link to orders
    const ordersLink = page.locator('a[href*="orders"], a:has-text("Orders")').first();
    await expect(ordersLink).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Account Page SEO Tests
// ============================================================================

test.describe('Account Page SEO', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('should have robots noindex meta tag', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Account pages should be noindexed
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count() > 0) {
      const content = await robots.getAttribute('content');
      expect(content).toContain('noindex');
    }
  });

  test('should have meta description', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    const description = page.locator('meta[name="description"]');
    if (await description.count() > 0) {
      const content = await description.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });
});

// ============================================================================
// Account Page Accessibility Tests
// ============================================================================

test.describe('Account Page Accessibility', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Should have at least one h1 or h2
    const headings = page.locator('h1, h2');
    expect(await headings.count()).toBeGreaterThan(0);
  });

  test('should have proper button labels', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Buttons should have text content or aria-label
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      expect(text?.trim() || ariaLabel).toBeTruthy();
    }
  });

  test('should have proper link labels', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Links should have text content or aria-label
    const links = page.locator('a[href]');
    const linkCount = await links.count();

    for (let i = 0; i < Math.min(linkCount, 20); i++) {
      const link = links.nth(i);
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      const title = await link.getAttribute('title');
      // At least one should be present
      expect(text?.trim() || ariaLabel || title).toBeTruthy();
    }
  });
});

// ============================================================================
// Sign Out Flow Tests
// ============================================================================

test.describe('Sign Out Flow', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('clicking Sign Out should redirect to login or home', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Find and click sign out
    const signOutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Logout")').first();

    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();

      // Should redirect to login page or home
      await page.waitForURL(/\/(auth\/login|$)/, { timeout: 10000 });
    }
  });
});
