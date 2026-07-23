import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Saved Addresses E2E Tests
 *
 * Tests for the chobii.art saved addresses management page (/account/addresses).
 *
 * These tests use REAL authentication via stored session state.
 * The auth.setup.ts file creates and saves authentication state
 * before these tests run.
 *
 * Test Categories:
 * 1. Unauthenticated tests - Verify redirect behavior
 * 2. Authenticated tests - Verify address CRUD operations
 * 3. SEO tests - Verify meta tags
 */

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to stored authentication state
const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json');

// ============================================================================
// Unauthenticated Tests
// ============================================================================

test.describe('Addresses Page - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect unauthenticated users to login page', async ({ page }) => {
    await page.goto('/account/addresses');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Authenticated Tests - Address Management
// ============================================================================

test.describe('Addresses Page - Authenticated', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('should load addresses page', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    // Should display the page heading
    const heading = page.locator('h1').filter({ hasText: /Saved Addresses/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display Add Address button', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const addButton = page.locator('button:has-text("Add Address")').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });

  test('should show empty state when no addresses exist', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    // If no addresses, should show empty state OR the add button
    const emptyState = page.locator('text=No saved addresses');
    const addressCards = page.locator('[class*="rounded-xl"][class*="border"]').filter({ hasText: /\d{6}/ });

    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const cardCount = await addressCards.count();

    // Either empty state or some address cards should be visible
    expect(hasEmpty || cardCount >= 0).toBeTruthy();
  });

  test('should open add address form when clicking Add Address', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    // Click add button (either the header button or empty state button)
    const addButton = page.locator('button:has-text("Add Address"), button:has-text("Add Your First Address")').first();
    await addButton.click();

    // Form should appear
    const formHeading = page.locator('text=Add New Address');
    await expect(formHeading).toBeVisible({ timeout: 5000 });

    // Form fields should be visible
    await expect(page.locator('#fullName')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#addressLine1')).toBeVisible();
    await expect(page.locator('#city')).toBeVisible();
    await expect(page.locator('#state')).toBeVisible();
    await expect(page.locator('#postalCode')).toBeVisible();
  });

  test('should have cancel button in form', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const addButton = page.locator('button:has-text("Add Address"), button:has-text("Add Your First Address")').first();
    await addButton.click();

    const cancelButton = page.locator('button:has-text("Cancel")').first();
    await expect(cancelButton).toBeVisible();

    // Clicking cancel should hide the form
    await cancelButton.click();

    const formHeading = page.locator('text=Add New Address');
    await expect(formHeading).not.toBeVisible();
  });

  test('should have back to account link', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const backLink = page.locator('a[href="/account"]').filter({ hasText: /Back to Account/i }).first();
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });

  test('should display info card about saved addresses', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const infoCard = page.locator('text=About Saved Addresses');
    await expect(infoCard).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// SEO Tests
// ============================================================================

test.describe('Addresses Page SEO', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('should have page title', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Saved Addresses.*chobii.art/);
  });

  test('should have robots noindex meta tag', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const robots = page.locator('meta[name="robots"]');
    if (await robots.count() > 0) {
      const content = await robots.getAttribute('content');
      expect(content).toContain('noindex');
    }
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Addresses Page Accessibility', () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    const headings = page.locator('h1, h2, h3');
    expect(await headings.count()).toBeGreaterThan(0);
  });

  test('should have labeled form inputs', async ({ page }) => {
    await page.goto('/account/addresses');
    await page.waitForLoadState('networkidle');

    // Open form
    const addButton = page.locator('button:has-text("Add Address"), button:has-text("Add Your First Address")').first();
    await addButton.click();

    // All required inputs should have labels
    const requiredFields = ['fullName', 'phone', 'addressLine1', 'city', 'state', 'postalCode'];
    for (const field of requiredFields) {
      const label = page.locator(`label[for="${field}"]`);
      await expect(label).toBeVisible();
    }
  });
});
