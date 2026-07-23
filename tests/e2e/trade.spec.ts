import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Trade Role E2E Tests
 *
 * Tests for the chobii.art trade program user role.
 *
 * The trade role is intended for wholesale customers (interior designers,
 * architects, staging companies, etc.) who get access to:
 * - Wholesale pricing (not yet implemented)
 * - Bulk ordering features (not yet implemented)
 * - Trade dashboard (not yet implemented)
 *
 * Current Test Coverage:
 * 1. Access Control - Verify trade users can access customer features
 * 2. Admin Restriction - Verify trade users cannot access admin panel
 * 3. Feature Placeholders - Document tests for when trade features are implemented
 *
 * Note: Trade-specific features are not yet implemented. These tests verify
 * that the trade role has appropriate access levels.
 */

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to stored authentication state
const TRADE_AUTH = path.join(__dirname, '..', '.auth', 'trade.json');
const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json');

// Each describe block has its own beforeEach re-auth, so parallel is fine

// ============================================================================
// Unauthenticated Tests
// ============================================================================

test.describe('Trade Role - Unauthenticated Comparison', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect unauthenticated users from account page', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Trade User - Customer Feature Access
// ============================================================================

test.describe('Trade Role - Customer Feature Access', () => {
  test.use({ storageState: TRADE_AUTH });

  // Re-authenticate if session expired (cookie cache is 5 min)
  test.beforeEach(async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/auth/login')) {
      await page.waitForLoadState('networkidle');
      await page.locator('main').getByLabel('Email').fill('test-trade@interior.com');
      await page.locator('main').getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(/\/account/, { timeout: 15000 });
    }
  });

  test.describe('Account Dashboard', () => {
    test('should access account dashboard', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on account page, not redirect
      expect(page.url()).toContain('/account');

      // Should see account heading
      const heading = page.locator('h1').filter({ hasText: /Account/i });
      await expect(heading).toBeVisible({ timeout: 10000 });
    });

    test('should display user profile card', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('domcontentloaded');

      // Should see profile section with user info
      const profileCard = page.locator('text=/Test Trade User|test-trade@example.com/i').first();
      await expect(profileCard).toBeVisible({ timeout: 10000 });
    });

    test('should display quick actions menu', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('domcontentloaded');

      // Should see quick actions
      const quickActions = page.locator('text=/Quick Actions/i');
      await expect(quickActions).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Wallet Access', () => {
    test('should access wallet page', async ({ page }) => {
      await page.goto('/account/wallet');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on wallet page
      expect(page.url()).toContain('/account/wallet');

      // Should see wallet content
      const walletHeading = page.locator('h1').filter({ hasText: /Wallet/i });
      await expect(walletHeading).toBeVisible({ timeout: 10000 });
    });

    test('should display wallet balance', async ({ page }) => {
      await page.goto('/account/wallet');
      await page.waitForLoadState('domcontentloaded');

      // Should see balance indicator
      const balanceElement = page.locator('text=/₹|Balance/i').first();
      await expect(balanceElement).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('AI Generation Access', () => {
    test('should access AI generator page', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on create page
      expect(page.url()).toContain('/create');

      // Should see generator interface
      const createHeading = page.locator('h1, h2').filter({ hasText: /Create|Generate|AI/i }).first();
      await expect(createHeading).toBeVisible({ timeout: 10000 });
    });

    // Known issue: ai-creations route has auth issues with storage state
    // See ai-history.spec.ts for details
    test.skip('should access AI creations history', async ({ page }) => {
      await page.goto('/account/ai-creations');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on AI creations page
      expect(page.url()).toContain('/account/ai-creations');
    });
  });

  test.describe('Orders Access', () => {
    // Known issue: Similar to ai-creations, the orders route sometimes has
    // auth state issues in the E2E test environment
    test.skip('should access orders page', async ({ page }) => {
      await page.goto('/account/orders');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on orders page
      expect(page.url()).toContain('/account/orders');

      // Should see orders heading or empty state
      const ordersContent = page.locator('text=/Orders|No orders|order history/i').first();
      await expect(ordersContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Shopping Features', () => {
    test('should access product catalog', async ({ page }) => {
      await page.goto('/posters');
      await page.waitForLoadState('domcontentloaded');

      // Should see products
      expect(page.url()).toContain('/posters');
    });

    test('should access cart page', async ({ page }) => {
      await page.goto('/cart');
      await page.waitForLoadState('domcontentloaded');

      // Should stay on cart page
      expect(page.url()).toContain('/cart');
    });
  });
});

// ============================================================================
// Trade User - Admin Access Restriction
// ============================================================================

test.describe('Trade Role - Admin Access Restriction', () => {
  test.use({ storageState: TRADE_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/auth/login')) {
      await page.waitForLoadState('networkidle');
      await page.locator('main').getByLabel('Email').fill('test-trade@interior.com');
      await page.locator('main').getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(/\/account/, { timeout: 15000 });
    }
  });

  test('should NOT access admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Should be redirected away from admin or show access denied
    const url = page.url();
    const isRedirected = !url.includes('/admin') || url.includes('/auth/login');
    const accessDenied = await page.locator('text=/Access Denied|Unauthorized|Forbidden|not authorized/i').isVisible();

    expect(isRedirected || accessDenied).toBe(true);
  });

  test('should NOT access admin products page', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    const isRedirected = !url.includes('/admin/products') || url.includes('/auth/login');
    const accessDenied = await page.locator('text=/Access Denied|Unauthorized|Forbidden|not authorized/i').isVisible();

    expect(isRedirected || accessDenied).toBe(true);
  });

  test('should NOT access admin orders page', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    const isRedirected = !url.includes('/admin/orders') || url.includes('/auth/login');
    const accessDenied = await page.locator('text=/Access Denied|Unauthorized|Forbidden|not authorized/i').isVisible();

    expect(isRedirected || accessDenied).toBe(true);
  });
});

// ============================================================================
// Trade vs Customer - Same Access Level Verification
// ============================================================================

test.describe('Trade Role - Same Access as Customer', () => {
  // These tests verify that trade users have at least the same access as customers

  test.describe('Trade User Access', () => {
    test.use({ storageState: TRADE_AUTH });

    test.beforeEach(async ({ page }) => {
      await page.goto('/account', { waitUntil: 'domcontentloaded' });
      if (page.url().includes('/auth/login')) {
        await page.waitForLoadState('networkidle');
        await page.locator('main').getByLabel('Email').fill('test-trade@interior.com');
        await page.locator('main').getByLabel('Password').fill('TestPassword123!');
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/account/, { timeout: 15000 });
      }
    });

    test('trade user can access account', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/account');
      expect(page.url()).not.toContain('/auth/login');
    });
  });

  test.describe('Customer User Access (Comparison)', () => {
    test.use({ storageState: CUSTOMER_AUTH });

    test.beforeEach(async ({ page }) => {
      await page.goto('/account', { waitUntil: 'domcontentloaded' });
      if (page.url().includes('/auth/login')) {
        await page.waitForLoadState('networkidle');
        await page.locator('main').getByLabel('Email').fill('test-customer@example.com');
        await page.locator('main').getByLabel('Password').fill('TestPassword123!');
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/account/, { timeout: 15000 });
      }
    });

    test('customer can access account', async ({ page }) => {
      await page.goto('/account');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/account');
      expect(page.url()).not.toContain('/auth/login');
    });
  });
});

// ============================================================================
// Trade-Specific Features (NOT YET IMPLEMENTED)
// ============================================================================

test.describe.skip('Trade Role - Trade-Specific Features (NOT IMPLEMENTED)', () => {
  /**
   * These tests are placeholders for when trade-specific features are implemented.
   * Currently skipped because the features don't exist yet.
   *
   * When implementing trade features, remove .skip and update the tests.
   */

  test.use({ storageState: TRADE_AUTH });

  test('should display wholesale pricing on products', async ({ page }) => {
    // TODO: When wholesale pricing is implemented
    // - Navigate to product page
    // - Verify trade user sees wholesale price
    // - Verify it's different from retail price
    await page.goto('/posters');
    // await expect(page.locator('text=/Wholesale|Trade Price/i')).toBeVisible();
  });

  test('should access trade dashboard', async ({ page }) => {
    // TODO: When trade dashboard is implemented
    // - Navigate to /trade or /account/trade
    // - Verify trade-specific dashboard loads
    await page.goto('/trade');
    // await expect(page.locator('h1')).toContainText('Trade Dashboard');
  });

  test('should display trade discount on checkout', async ({ page }) => {
    // TODO: When trade discounts are implemented
    // - Add items to cart
    // - Go to checkout
    // - Verify trade discount is applied
    await page.goto('/checkout');
    // await expect(page.locator('text=/Trade Discount/i')).toBeVisible();
  });

  test('should access bulk ordering features', async ({ page }) => {
    // TODO: When bulk ordering is implemented
    // - Navigate to bulk order page
    // - Verify bulk quantity inputs
    // - Verify volume discounts
    await page.goto('/trade/bulk-order');
    // await expect(page.locator('text=/Bulk Order/i')).toBeVisible();
  });

  test('should display trade account status', async ({ page }) => {
    // TODO: When trade status is shown in UI
    // - Navigate to account page
    // - Verify trade status badge is visible
    await page.goto('/account');
    // await expect(page.locator('text=/Trade Member|Wholesale/i')).toBeVisible();
  });

  test('should access net payment terms if approved', async ({ page }) => {
    // TODO: When payment terms are implemented
    // - Navigate to checkout
    // - Verify net payment option is available for approved trade users
    await page.goto('/checkout');
    // await expect(page.locator('text=/Net 30|Payment Terms/i')).toBeVisible();
  });
});

// ============================================================================
// Trade Application Flow (NOT YET IMPLEMENTED)
// ============================================================================

test.describe.skip('Trade Application Flow (NOT IMPLEMENTED)', () => {
  /**
   * Tests for the trade program application process.
   * Currently skipped because the feature isn't implemented yet.
   */

  test.use({ storageState: CUSTOMER_AUTH }); // Customer applying for trade

  test('should display trade program application page', async ({ page }) => {
    await page.goto('/trade/apply');
    // await expect(page.locator('h1')).toContainText('Trade Program');
  });

  test('should submit trade application', async ({ page }) => {
    await page.goto('/trade/apply');
    // await page.fill('[name="businessName"]', 'Test Interior Design Co');
    // await page.fill('[name="businessType"]', 'interior-designer');
    // await page.click('button:has-text("Submit Application")');
    // await expect(page.locator('text=/Application Submitted/i')).toBeVisible();
  });

  test('should show pending status after application', async ({ page }) => {
    await page.goto('/account');
    // await expect(page.locator('text=/Pending|Under Review/i')).toBeVisible();
  });
});
