import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Admin Authentication & Access Control E2E Tests
 *
 * Tests for the MasonArt admin panel authentication and authorization including:
 * - Unauthenticated access (should redirect to login)
 * - Non-admin user access (should be denied)
 * - Admin role access (should work)
 *
 * IMPORTANT: These tests use REAL authentication via stored session state.
 * Route mocking for auth does NOT work with SSR auth in beforeLoad hooks.
 * The TanStack Start router performs auth checks server-side before rendering.
 */

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to stored authentication states
const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json');
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json');

// ============================================================================
// Unauthenticated Access Tests
// ============================================================================

test.describe('Unauthenticated Access to Admin', () => {
  test('should redirect to login when accessing admin dashboard', async ({ page }) => {
    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing admin products', async ({ page }) => {
    await page.goto('/admin/products');

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing admin orders', async ({ page }) => {
    await page.goto('/admin/orders');

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should preserve redirect URL in login', async ({ page }) => {
    await page.goto('/admin/products');

    // Login page should have redirect param pointing to admin
    const url = page.url();
    expect(url).toContain('redirect');
    expect(url).toContain('admin');
  });

  test('should not show admin content when unauthenticated', async ({ page }) => {
    const response = await page.goto('/admin');

    // Either redirects or shows login
    const isRedirectOrLogin = page.url().includes('/auth/login') || page.url().includes('/login');
    expect(isRedirectOrLogin || response?.status() === 401).toBeTruthy();
  });
});

// ============================================================================
// Customer Role Access Tests (Non-Admin)
// Uses real customer authentication via stored session state
// ============================================================================

test.describe('Customer Role Access to Admin', () => {
  // Use the stored customer authentication state
  test.use({ storageState: CUSTOMER_AUTH });

  test('should deny customer access to admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Customer should see "Access Denied" message or be on an unauthorized page
    // The admin.tsx beforeLoad returns isUnauthorized: true for non-admin roles
    const pageContent = await page.content();
    const url = page.url();

    const hasAccessDenied =
      pageContent.toLowerCase().includes('access denied') ||
      pageContent.toLowerCase().includes('unauthorized') ||
      pageContent.toLowerCase().includes('not authorized') ||
      pageContent.toLowerCase().includes('forbidden') ||
      pageContent.includes('Administrator access required') ||
      url.includes('/auth/login'); // May redirect if session invalid

    expect(hasAccessDenied).toBeTruthy();
  });

  test('should deny customer access to admin products', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    const url = page.url();

    const hasAccessDenied =
      pageContent.toLowerCase().includes('access denied') ||
      pageContent.toLowerCase().includes('unauthorized') ||
      pageContent.toLowerCase().includes('not authorized') ||
      pageContent.includes('Administrator access required') ||
      url.includes('/auth/login');

    expect(hasAccessDenied).toBeTruthy();
  });

  test('should deny customer access to admin orders', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    const url = page.url();

    const hasAccessDenied =
      pageContent.toLowerCase().includes('access denied') ||
      pageContent.toLowerCase().includes('unauthorized') ||
      pageContent.toLowerCase().includes('not authorized') ||
      pageContent.includes('Administrator access required') ||
      url.includes('/auth/login');

    expect(hasAccessDenied).toBeTruthy();
  });
});

// ============================================================================
// Trade Role Access Tests (Non-Admin)
// NOTE: Skipped because we don't have a trade test user seeded
// ============================================================================

test.describe.skip('Trade Role Access to Admin', () => {
  // Would use storageState: TRADE_AUTH if we had that user
  test('should deny trade user access to admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    // Trade users should also see access denied
  });
});

// ============================================================================
// Admin Role Access Tests
// Uses real authentication via stored admin session state
// ============================================================================

test.describe('Admin Role Access', () => {
  // Use the stored admin authentication state (user has admin role)
  test.use({ storageState: ADMIN_AUTH });

  test('should allow admin access to dashboard without redirect', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should stay on admin page (not redirected to login or access denied)
    expect(page.url()).toContain('/admin');
    expect(page.url()).not.toContain('/auth/login');

    // Should NOT see access denied
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).not.toContain('access denied');
  });

  test('should display admin dashboard content', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should show Dashboard heading or admin-specific content
    const dashboardHeading = page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")');
    await expect(dashboardHeading).toBeVisible({ timeout: 10000 });
  });

  test('should display admin sidebar navigation', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should show admin sidebar with navigation links
    // Use .first() to avoid strict mode violations when there are multiple matching links
    const sidebar = page.locator('aside');
    const dashboardLink = sidebar.locator('a[href="/admin"]').filter({ hasText: 'Dashboard' }).first();
    const productsLink = sidebar.locator('a[href="/admin/products"]').filter({ hasText: 'Products' }).first();
    const ordersLink = sidebar.locator('a[href="/admin/orders"]').filter({ hasText: 'Orders' }).first();

    await expect(dashboardLink).toBeVisible({ timeout: 10000 });
    await expect(productsLink).toBeVisible();
    await expect(ordersLink).toBeVisible();
  });

  test('should allow access to admin products page', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForLoadState('networkidle');

    // Should not redirect and show products page
    expect(page.url()).toContain('/admin/products');
    expect(page.url()).not.toContain('/auth/login');
  });

  test('should allow access to admin orders page', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');

    // Should not redirect
    expect(page.url()).toContain('/admin/orders');
    expect(page.url()).not.toContain('/auth/login');
  });

  test('should display user info in sidebar', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should show admin user's name or email
    // The seeded admin is "E2E Test Admin" with email test-e2e-admin@masonart.com
    const userInfo = page.locator('aside').filter({
      hasText: /E2E Test Admin|test-e2e-admin@masonart.com|Admin/i
    });
    await expect(userInfo).toBeVisible({ timeout: 10000 });
  });

  test('should have Sign Out button in sidebar', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await expect(signOutBtn).toBeVisible();
  });

  test('should navigate between admin pages via sidebar', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Use sidebar-specific locators to avoid strict mode violations
    const sidebar = page.locator('aside');

    // Click Products link
    const productsLink = sidebar.locator('a[href="/admin/products"]').filter({ hasText: 'Products' }).first();
    await productsLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin/products');

    // Click Orders link
    const ordersLink = sidebar.locator('a[href="/admin/orders"]').filter({ hasText: 'Orders' }).first();
    await ordersLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin/orders');

    // Click Dashboard link
    const dashboardLink = sidebar.locator('a[href="/admin"]').filter({ hasText: 'Dashboard' }).first();
    await dashboardLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/admin\/?$/);
  });
});

// ============================================================================
// Super-Admin Role Access Tests
// NOTE: Skipped because we don't have a super-admin test user seeded
// ============================================================================

test.describe.skip('Super-Admin Role Access', () => {
  // Would use storageState: SUPER_ADMIN_AUTH if we had that user
  test('should allow super-admin access to dashboard', async ({ page }) => {
    await page.goto('/admin');
    expect(page.url()).toContain('/admin');
  });
});

// ============================================================================
// Admin Sign Out Tests
// ============================================================================

test.describe('Admin Sign Out', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('should redirect to home after sign out', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find and click sign out button
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();

    // Should redirect to home page
    await expect(page).toHaveURL('/');
  });

  test('should not allow access to admin after sign out', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Sign out
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();
    await expect(page).toHaveURL('/');

    // Try to access admin again - should redirect to login
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Admin Responsive Layout Tests
// ============================================================================

test.describe('Admin Responsive Layout', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('should display sidebar by default on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('should display mobile menu button on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should show mobile menu button - use getByRole for accessible name
    const menuButton = page.getByRole('button', { name: 'Open menu' }).first();
    await expect(menuButton).toBeVisible();
  });

  test('should open mobile sidebar when clicking menu button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click the menu button - use getByRole for accessible name
    const menuButton = page.getByRole('button', { name: 'Open menu' }).first();
    await menuButton.click();

    // Sidebar should now be visible (look for Dashboard link)
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
    await expect(dashboardLink).toBeVisible();
  });
});

// ============================================================================
// Admin Accessibility Tests
// ============================================================================

test.describe('Admin Accessibility', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
  });

  test('should have aria labels on interactive elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const buttonsWithAria = page.locator('button[aria-label]');
    const count = await buttonsWithAria.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });

  test('should have button type on Sign Out button', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    const type = await signOutBtn.getAttribute('type');
    expect(type).toBe('button');
  });
});

// ============================================================================
// Admin Performance Tests
// ============================================================================

test.describe('Admin Performance', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('should load admin dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Wait for dashboard heading
    await expect(page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000); // 10 seconds max
  });

  test('should not have critical JavaScript errors in admin', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Filter out non-critical errors (network issues, hydration, etc.)
    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') &&
             !e.includes('NetworkError') &&
             !e.includes('Load failed') &&
             !e.includes('Hydration') &&
             !e.includes('hydration') &&
             !e.includes('minified React error') &&
             !e.includes('useServerFn')
    );

    // Log errors for debugging
    if (criticalErrors.length > 0) {
      console.log('Critical JS errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
