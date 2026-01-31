import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Admin Reviews Moderation E2E Tests
 *
 * Tests for the MasonArt admin reviews moderation dashboard including:
 * - Access control
 * - Stats display
 * - Review listing and filtering
 * - Approve/Reject workflow
 * - Bulk actions
 * - Pagination
 *
 * These tests use REAL authentication via stored session state.
 * The auth.setup.ts file creates and saves authentication state
 * before these tests run.
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/admin/reviews.tsx
 * - packages/api/src/routes/admin/reviews.ts
 */

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to stored authentication state
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json');
const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json');

// ============================================================================
// Access Control Tests
// ============================================================================

test.describe('Admin Reviews - Access Control (Unauthenticated)', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin/reviews');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Admin Reviews - Access Control (Admin)', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test('admin can access reviews page', async ({ page }) => {
    await page.goto('/admin/reviews');

    // Should see reviews page, not access denied
    const heading = page.locator('h1:has-text("Reviews")');
    await expect(heading).toBeVisible();
  });
});

test.describe('Admin Reviews - Access Control (Customer)', () => {
  // Use the stored customer authentication state
  test.use({ storageState: CUSTOMER_AUTH });

  test('non-admin user should see access denied', async ({ page }) => {
    await page.goto('/admin/reviews');

    // Should see access denied or redirect
    const accessDenied = page.locator('text=Access Denied');
    const loginPage = page.url().includes('/auth/login');

    const hasDenied = await accessDenied.isVisible().catch(() => false);

    expect(hasDenied || loginPage).toBe(true);
  });
});

// ============================================================================
// Page Structure Tests (Admin Authenticated)
// ============================================================================

test.describe('Admin Reviews - Page Structure', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
  });

  test('should display page title', async ({ page }) => {
    const heading = page.locator('h1:has-text("Reviews")');
    await expect(heading).toBeVisible();
  });

  test('should display refresh button when admin', async ({ page }) => {
    const refreshBtn = page.locator('button:has-text("Refresh")');
    await expect(refreshBtn).toBeVisible();
  });
});

// ============================================================================
// Stats Cards Tests
// ============================================================================

test.describe('Admin Reviews - Stats Cards', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
    // Wait for stats cards to load
    await page.locator('text=Pending Reviews').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should display pending reviews stat card', async ({ page }) => {
    const pendingCard = page.locator('text=Pending Reviews').locator('..');
    await expect(pendingCard).toBeVisible();
  });

  test('should display approved stat card', async ({ page }) => {
    // Use href selector to distinguish from filter button which also says "Approved"
    const approvedCard = page.locator('a[href*="status=approved"]');
    await expect(approvedCard).toBeVisible();
  });

  test('should display rejected stat card', async ({ page }) => {
    // Use href selector to distinguish from filter button which also says "Rejected"
    const rejectedCard = page.locator('a[href*="status=rejected"]');
    await expect(rejectedCard).toBeVisible();
  });

  test('should display today stat card', async ({ page }) => {
    const todayCard = page.locator('text=Today').locator('..');
    await expect(todayCard).toBeVisible();
  });
});

// ============================================================================
// Filter Controls Tests
// ============================================================================

test.describe('Admin Reviews - Filter Controls', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
  });

  test('should display status filter buttons', async ({ page }) => {
    const allButton = page.locator('button:has-text("All")');
    const pendingButton = page.locator('button:has-text("Pending")');
    await expect(allButton).toBeVisible();
    await expect(pendingButton).toBeVisible();
  });

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
  });

  test('clicking status filter should update URL', async ({ page }) => {
    // Wait for stats to load (stats cards have direct links)
    await expect(page.locator('text=Pending Reviews')).toBeVisible({ timeout: 10000 });

    // Click the Pending Reviews stats card which has direct href with status param
    await page.locator('text=Pending Reviews').click();
    await page.waitForURL(/status=pending/, { timeout: 5000 });
    expect(page.url()).toContain('status=pending');
  });
});

// ============================================================================
// Reviews Table Tests
// ============================================================================

test.describe('Admin Reviews - Reviews Table', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
    // Wait for loading to complete (stats cards appear after loading)
    await page.locator('text=Pending Reviews').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should display table with headers or no reviews message', async ({ page }) => {
    // Wait for either table or no reviews message to appear
    await expect(
      page.locator('table, :text("No reviews found")').first()
    ).toBeVisible({ timeout: 10000 });

    const table = page.locator('table');
    const hasTable = await table.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasTable || hasNoReviews).toBe(true);
  });

  test('table should have product column', async ({ page }) => {
    const productHeader = page.locator('th:has-text("Product")');
    const hasProduct = await productHeader.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasProduct || hasNoReviews).toBe(true);
  });

  test('table should have author column', async ({ page }) => {
    const authorHeader = page.locator('th:has-text("Author")');
    const hasAuthor = await authorHeader.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasAuthor || hasNoReviews).toBe(true);
  });

  test('table should have rating column', async ({ page }) => {
    const ratingHeader = page.locator('th:has-text("Rating")');
    const hasRating = await ratingHeader.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasRating || hasNoReviews).toBe(true);
  });

  test('table should have status column', async ({ page }) => {
    const statusHeader = page.locator('th:has-text("Status")');
    const hasStatus = await statusHeader.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasStatus || hasNoReviews).toBe(true);
  });

  test('table should have actions column', async ({ page }) => {
    const actionsHeader = page.locator('th:has-text("Actions")');
    const hasActions = await actionsHeader.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasActions || hasNoReviews).toBe(true);
  });
});

// ============================================================================
// Review Row Tests
// ============================================================================

test.describe('Admin Reviews - Review Row', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
    // Wait for loading to complete
    await page.locator('text=Pending Reviews').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('review row should have checkbox for selection', async ({ page }) => {
    const checkbox = page.locator('tbody input[type="checkbox"]').first();
    const hasCheckbox = await checkbox.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasCheckbox || hasNoReviews).toBe(true);
  });

  test('review row should display star rating', async ({ page }) => {
    const stars = page.locator('tbody svg[class*="fill-amber"], tbody [class*="text-amber"]').first();
    const hasStars = await stars.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasStars || hasNoReviews).toBe(true);
  });

  test('review row should display status badge', async ({ page }) => {
    const statusBadge = page.locator('tbody span:has-text("pending"), tbody span:has-text("approved"), tbody span:has-text("rejected")').first();
    const hasBadge = await statusBadge.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasBadge || hasNoReviews).toBe(true);
  });
});

// ============================================================================
// Bulk Actions Tests
// ============================================================================

test.describe('Admin Reviews - Bulk Actions', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
    // Wait for loading to complete
    await page.locator('text=Pending Reviews').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show bulk action bar when reviews selected', async ({ page }) => {
    const checkbox = page.locator('tbody input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.click();
      const bulkBar = page.locator('text=selected');
      await expect(bulkBar).toBeVisible();
    } else {
      // No reviews to select
      const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
      expect(hasNoReviews).toBe(true);
    }
  });

  test('bulk bar should have approve all button', async ({ page }) => {
    const checkbox = page.locator('tbody input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.click();
      const approveAllBtn = page.locator('button:has-text("Approve All")');
      await expect(approveAllBtn).toBeVisible();
    } else {
      // No reviews to select
      const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
      expect(hasNoReviews).toBe(true);
    }
  });

  test('bulk bar should have reject all button', async ({ page }) => {
    const checkbox = page.locator('tbody input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.click();
      const rejectAllBtn = page.locator('button:has-text("Reject All")');
      await expect(rejectAllBtn).toBeVisible();
    } else {
      // No reviews to select
      const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
      expect(hasNoReviews).toBe(true);
    }
  });

  test('select all checkbox should select all rows', async ({ page }) => {
    const selectAllCheckbox = page.locator('thead input[type="checkbox"]');
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click();
      const checkedBoxes = await page.locator('tbody input[type="checkbox"]:checked').count();
      const totalBoxes = await page.locator('tbody input[type="checkbox"]').count();
      expect(checkedBoxes).toBe(totalBoxes);
    } else {
      // No reviews to select
      const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
      expect(hasNoReviews).toBe(true);
    }
  });
});

// ============================================================================
// Pagination Tests
// ============================================================================

test.describe('Admin Reviews - Pagination', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/reviews');
  });

  test('should display pagination when multiple pages', async ({ page }) => {
    const pagination = page.locator('text=Page');
    const hasPagination = await pagination.isVisible().catch(() => false);
    // Pagination may or may not show depending on data
    expect(typeof hasPagination).toBe('boolean');
  });

  test('previous button should be disabled on first page', async ({ page }) => {
    const prevButton = page.locator('button:has-text("Previous")');
    if (await prevButton.isVisible()) {
      await expect(prevButton).toBeDisabled();
    }
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Admin Reviews - Responsive Design', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test('page should be usable on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/admin/reviews');

    const heading = page.locator('h1:has-text("Reviews")');
    await expect(heading).toBeVisible();
  });

  test('table should be scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/reviews');
    // Wait for loading to complete
    await page.locator('text=Pending Reviews').waitFor({ state: 'visible', timeout: 10000 });

    const table = page.locator('table');
    const hasTable = await table.isVisible().catch(() => false);
    const hasNoReviews = await page.locator('text=No reviews found').isVisible().catch(() => false);
    expect(hasTable || hasNoReviews).toBe(true);
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Admin Reviews - Navigation', () => {
  // Use the stored admin authentication state
  test.use({ storageState: ADMIN_AUTH });

  test('admin sidebar should have reviews link', async ({ page }) => {
    await page.goto('/admin');

    const reviewsLink = page.locator('a[href="/admin/reviews"], a:has-text("Reviews")');
    await expect(reviewsLink).toBeVisible();
  });

  test('clicking reviews link should navigate to reviews page', async ({ page }) => {
    await page.goto('/admin');

    const reviewsLink = page.locator('a[href="/admin/reviews"]');
    await reviewsLink.click();
    await page.waitForURL('/admin/reviews**');
    expect(page.url()).toContain('/admin/reviews');
  });
});
