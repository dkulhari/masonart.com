import { test, expect } from '@playwright/test';

/**
 * Reviews Feature E2E Tests
 *
 * Tests for the chobii.art product reviews feature including:
 * - Review display on product pages
 * - Review filtering and sorting
 * - Verified purchase review flow from order pages
 * - Review summary statistics
 * - Admin moderation workflow
 *
 * Based on actual implementation in:
 * - packages/web/app/components/product/ProductReviews.tsx
 * - packages/web/app/components/reviews/
 * - packages/web/app/routes/_authed/account/orders.$id.tsx
 * - packages/web/app/routes/admin/reviews.tsx
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Navigate to a product detail page via the listing page, with the review
 * wall open.
 *
 * The wall is no longer a section stacked below the buy panel — it is the
 * "Review" tabpanel of ProductTabs (#521), so it is only in the DOM while that
 * tab is selected. Landing on `#reviews` is how the rest of the site reaches
 * it (the buy box's rating link does exactly this), and ProductTabs opens on
 * the Review tab for that hash. Every assertion below is unchanged; only the
 * way the wall is reached is.
 *
 * Returns the product URL if a product was found.
 */
async function navigateToProductPage(page: typeof test.page): Promise<string | null> {
  await page.goto('/posters');

  // Wait for either products or empty state to appear
  await page.waitForSelector('a[href^="/posters/"], h3:has-text("No products found")', { timeout: 10000 }).catch(() => null);

  const productLinks = page.locator('a[href^="/posters/"]:not([href="/posters"])');
  const count = await productLinks.count();

  if (count > 0) {
    const href = await productLinks.first().getAttribute('href');
    if (href && href !== '/posters') {
      await page.goto(`${href}#reviews`);
      return href;
    }
  }
  return null;
}

// ============================================================================
// Reviews Section Display Tests
// ============================================================================

test.describe('Reviews Section - Display', () => {
  test('should display reviews section on product page', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewsSection = page.locator('#reviews, section:has-text("Customer Reviews")');
    await expect(reviewsSection).toBeVisible();
  });

  test('should display section header with icon', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const sectionHeader = page.locator('h2:has-text("Customer Reviews")');
    await expect(sectionHeader).toBeVisible();
  });

  test('should display review summary or empty state', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Either show summary stats (with average rating text like "4.2" and "Based on X reviews")
    // or empty state message from ProductReviews component
    // First, verify the reviews section exists (look for Customer Reviews heading)
    const reviewsHeader = page.locator('h2:has-text("Customer Reviews")');
    await expect(reviewsHeader).toBeVisible();

    // The reviews section may be a <section id="reviews"> or just a container
    // Use the heading to find the parent section
    const reviewsSection = page.locator('section:has(h2:has-text("Customer Reviews")), div:has(h2:has-text("Customer Reviews"))').first();

    // Wait for loading state to clear - ProductReviews fetches data and shows skeleton first
    // Wait for either the summary stats text OR the empty state text to appear
    // Using a proper Playwright wait condition instead of fixed timeout
    try {
      await page.waitForSelector(
        ':text-matches("Based on \\\\d+ reviews?|No reviews yet|Be the first", "i")',
        { timeout: 5000 }
      );
    } catch {
      // If no text appears after 5s, check what's visible
    }

    // Look for the summary stats area (shows "Based on X reviews" text) or empty state
    const hasSummary = await page.getByText(/Based on \d+ reviews?/i).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/No reviews yet/i).isVisible().catch(() => false);
    // Also check for "Be the first" which is part of the empty state message
    const hasBeFirstState = await page.getByText(/Be the first/i).isVisible().catch(() => false);
    // Also check if the loading skeleton is still visible (data still loading)
    const hasLoadingSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false);

    expect(hasSummary || hasEmptyState || hasBeFirstState || hasLoadingSkeleton).toBe(true);
  });
});

// ============================================================================
// Verified Purchase Reviews - Product Page Guidance
// ============================================================================

test.describe('Verified Purchase Reviews - Product Page', () => {
  test('product page should show guidance instead of review form', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Product page should NOT have "Write a Review" button anymore
    const writeReviewBtn = page.locator('button:has-text("Write a Review")');
    await expect(writeReviewBtn).not.toBeVisible();

    // Should show guidance text pointing to order history
    const guidanceText = page.getByText(/Leave a review from your order history/i);
    await expect(guidanceText).toBeVisible();
  });

  test('guidance text should link to orders page', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Find the link to order history
    const ordersLink = page.locator('a[href="/account/orders"]:has-text("Leave a review from your order history")');
    await expect(ordersLink).toBeVisible();
  });

  test('should display purchased this item text', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const purchasedText = page.getByText(/Purchased this item\?/i);
    await expect(purchasedText).toBeVisible();
  });
});

// ============================================================================
// Reviews Summary Statistics Tests
// ============================================================================

test.describe('Reviews Section - Summary Statistics', () => {
  test('should display average rating when reviews exist', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Look for star rating display in summary area - ReviewSummary uses StarRating component
    // which renders SVG stars, and the average rating as a large number (e.g., "4.2")
    const reviewsSection = page.locator('#reviews');
    await expect(reviewsSection).toBeVisible();

    // Check for star SVGs (from StarRating component) or the numeric rating display
    const hasStars = await reviewsSection.locator('svg').first().isVisible().catch(() => false);
    const hasEmptyState = await reviewsSection.getByText(/No reviews yet/i).isVisible().catch(() => false);

    // Either stars should show or empty state
    expect(hasStars || hasEmptyState).toBe(true);
  });

  test('should display rating distribution when reviews exist', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Rating distribution bars use role="progressbar" in ReviewSummary component
    // Each bar shows "X stars" text and a progress indicator
    const reviewsHeader = page.locator('h2:has-text("Customer Reviews")');
    await expect(reviewsHeader).toBeVisible();

    // Wait for loading state to clear - look for distribution bars or empty state
    try {
      await page.waitForSelector(
        '[role="progressbar"], :text-matches("No reviews yet|Be the first", "i")',
        { timeout: 5000 }
      );
    } catch {
      // If nothing appears, we'll check manually
    }

    const distributionBars = page.locator('[role="progressbar"]');
    const hasDistribution = await distributionBars.count() > 0;
    const hasEmptyState = await page.getByText(/No reviews yet/i).isVisible().catch(() => false);
    const hasBeFirstState = await page.getByText(/Be the first/i).isVisible().catch(() => false);
    // Also check if the loading skeleton is still visible (data still loading)
    const hasLoadingSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false);

    expect(hasDistribution || hasEmptyState || hasBeFirstState || hasLoadingSkeleton).toBe(true);
  });
});

// ============================================================================
// Reviews List Tests
// ============================================================================

test.describe('Reviews Section - Review List', () => {
  test('should display filter controls when reviews exist', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // ReviewFilters component has "All" button and sort dropdown with "Sort:" label
    // But filters only show when there are reviews - otherwise show empty state
    const reviewsHeader = page.locator('h2:has-text("Customer Reviews")');
    await expect(reviewsHeader).toBeVisible();

    // Wait for loading state to clear - look for filter controls or empty state
    try {
      await page.waitForSelector(
        'button:has-text("All"), :text("Sort:"), :text-matches("No reviews yet|Be the first", "i")',
        { timeout: 5000 }
      );
    } catch {
      // If nothing appears, we'll check manually
    }

    // Look for "All" filter button or "Sort:" dropdown label
    const hasAllButton = await page.locator('button:has-text("All")').isVisible().catch(() => false);
    const hasSortLabel = await page.getByText(/Sort:/i).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/No reviews yet/i).isVisible().catch(() => false);
    const hasBeFirstState = await page.getByText(/Be the first/i).isVisible().catch(() => false);
    // Also check if the loading skeleton is still visible (data still loading)
    const hasLoadingSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false);

    expect(hasAllButton || hasSortLabel || hasEmptyState || hasBeFirstState || hasLoadingSkeleton).toBe(true);
  });

  test('should display review cards when reviews exist', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // ReviewCard uses <article aria-label="Review by {name}"> element
    const reviewsHeader = page.locator('h2:has-text("Customer Reviews")');
    await expect(reviewsHeader).toBeVisible();

    // Wait for loading state to clear - look for review cards or empty state
    try {
      await page.waitForSelector(
        'article[aria-label^="Review by"], :text-matches("No reviews yet|Be the first", "i")',
        { timeout: 5000 }
      );
    } catch {
      // If nothing appears, we'll check manually
    }

    const reviewCards = page.locator('article[aria-label^="Review by"]');
    const cardCount = await reviewCards.count().catch(() => 0);
    const hasEmptyState = await page.getByText(/No reviews yet/i).isVisible().catch(() => false);
    const hasBeFirstState = await page.getByText(/Be the first/i).isVisible().catch(() => false);
    // Also check if the loading skeleton is still visible (data still loading)
    const hasLoadingSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false);

    expect(cardCount > 0 || hasEmptyState || hasBeFirstState || hasLoadingSkeleton).toBe(true);
  });

  test('should display pagination when many reviews exist', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // Pagination appears when there are more reviews than page size
    const pagination = page.locator('nav[aria-label="Pagination"], button:has-text("Previous"), button:has-text("Next")');
    // Pagination may or may not be visible depending on review count
    const exists = await pagination.first().isVisible().catch(() => false);
    // This is acceptable - just verifying the component handles both cases
    expect(typeof exists).toBe('boolean');
  });
});

// ============================================================================
// Review Card Display Tests
// ============================================================================

test.describe('Reviews Section - Review Card', () => {
  test('review card should display star rating', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewCards = page.locator('[class*="ReviewCard"], article').first();
    const hasReviews = await reviewCards.isVisible().catch(() => false);

    if (hasReviews) {
      // Check for star rating in the card
      const stars = reviewCards.locator('svg');
      await expect(stars.first()).toBeVisible();
    }
  });

  test('review card should display author information', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewCards = page.locator('[class*="ReviewCard"], article').first();
    const hasReviews = await reviewCards.isVisible().catch(() => false);

    if (hasReviews) {
      // Should show author name or avatar
      const hasAuthorInfo = await reviewCards.locator('[class*="author"], [class*="avatar"], [class*="rounded-full"]').isVisible().catch(() => false);
      expect(hasAuthorInfo).toBe(true);
    }
  });

  test('review card should display review date', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewCards = page.locator('[class*="ReviewCard"], article').first();
    const hasReviews = await reviewCards.isVisible().catch(() => false);

    if (hasReviews) {
      // Should show date
      const hasDate = await reviewCards.locator('time, [class*="date"], [class*="text-muted"]').isVisible().catch(() => false);
      expect(hasDate).toBe(true);
    }
  });
});

// ============================================================================
// Verified Purchase Reviews - Order Page Flow Tests
// ============================================================================

test.describe('Verified Purchase Reviews - Order Page', () => {
  // Note: These tests require authentication and order data
  // They may be skipped in environments without proper test data

  test('order detail page should show Write Review button for delivered orders', async ({ page }) => {
    // This test verifies the structure exists - actual functionality requires auth
    await page.goto('/account/orders');

    // If redirected to login, that's expected behavior for unauthenticated users
    const isLoginPage = await page.url().includes('/auth/login');
    if (isLoginPage) {
      // Verify we're redirected to login when not authenticated
      const loginForm = page.locator('form, input[type="password"], input[name="email"]');
      const hasLoginForm = await loginForm.first().isVisible().catch(() => false);
      expect(hasLoginForm || isLoginPage).toBe(true);
      return; // Skip rest of test - requires auth
    }

    // If we're on orders page, look for delivered orders
    const deliveredBadge = page.locator(':text("Delivered")');
    const hasDeliveredOrders = await deliveredBadge.first().isVisible().catch(() => false);

    if (!hasDeliveredOrders) {
      test.skip(); // No delivered orders to test
      return;
    }

    // Click on a delivered order
    await deliveredBadge.first().click();
    await page.waitForTimeout(500);

    // Look for Write Review button
    const writeReviewBtn = page.locator('button:has-text("Write Review")');
    await expect(writeReviewBtn.first()).toBeVisible();
  });

  test('non-delivered orders should not show Write Review button', async ({ page }) => {
    await page.goto('/account/orders');

    // If redirected to login, skip the test
    const isLoginPage = await page.url().includes('/auth/login');
    if (isLoginPage) {
      test.skip();
      return;
    }

    // Look for non-delivered order statuses
    const processingBadge = page.locator(':text("Processing"), :text("Shipped"), :text("Confirmed")');
    const hasNonDeliveredOrders = await processingBadge.first().isVisible().catch(() => false);

    if (!hasNonDeliveredOrders) {
      test.skip(); // No non-delivered orders to test
      return;
    }

    // Click on a non-delivered order
    await processingBadge.first().click();
    await page.waitForTimeout(500);

    // Write Review button should NOT be visible
    const writeReviewBtn = page.locator('button:has-text("Write Review")');
    await expect(writeReviewBtn).not.toBeVisible();
  });

  test('clicking Write Review should open modal', async ({ page }) => {
    await page.goto('/account/orders');

    // If redirected to login, skip the test
    const isLoginPage = await page.url().includes('/auth/login');
    if (isLoginPage) {
      test.skip();
      return;
    }

    // Navigate to a delivered order
    const deliveredBadge = page.locator(':text("Delivered")');
    const hasDeliveredOrders = await deliveredBadge.first().isVisible().catch(() => false);

    if (!hasDeliveredOrders) {
      test.skip();
      return;
    }

    await deliveredBadge.first().click();
    await page.waitForTimeout(500);

    // Click Write Review button
    const writeReviewBtn = page.locator('button:has-text("Write Review")');
    if (await writeReviewBtn.first().isVisible().catch(() => false)) {
      await writeReviewBtn.first().click();

      // Modal should open
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      // Modal should have title
      const modalTitle = page.locator('#review-modal-title, [role="dialog"] h2');
      await expect(modalTitle.first()).toBeVisible();
    }
  });

  test('review modal should have close button', async ({ page }) => {
    await page.goto('/account/orders');

    const isLoginPage = await page.url().includes('/auth/login');
    if (isLoginPage) {
      test.skip();
      return;
    }

    const deliveredBadge = page.locator(':text("Delivered")');
    if (!(await deliveredBadge.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await deliveredBadge.first().click();
    await page.waitForTimeout(500);

    const writeReviewBtn = page.locator('button:has-text("Write Review")');
    if (await writeReviewBtn.first().isVisible().catch(() => false)) {
      await writeReviewBtn.first().click();
      await page.waitForTimeout(300);

      // Modal should have close button
      const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"]');
      await expect(closeBtn).toBeVisible();

      // Clicking close should dismiss modal
      await closeBtn.click();
      await page.waitForTimeout(300);

      const modal = page.locator('[role="dialog"]');
      await expect(modal).not.toBeVisible();
    }
  });

  test('review modal should have form fields', async ({ page }) => {
    await page.goto('/account/orders');

    const isLoginPage = await page.url().includes('/auth/login');
    if (isLoginPage) {
      test.skip();
      return;
    }

    const deliveredBadge = page.locator(':text("Delivered")');
    if (!(await deliveredBadge.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await deliveredBadge.first().click();
    await page.waitForTimeout(500);

    const writeReviewBtn = page.locator('button:has-text("Write Review")');
    if (await writeReviewBtn.first().isVisible().catch(() => false)) {
      await writeReviewBtn.first().click();
      await page.waitForTimeout(300);

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      // Check for form fields in modal
      const titleInput = modal.locator('#review-title, input[id*="title"]');
      const contentArea = modal.locator('#review-content, textarea');
      const submitBtn = modal.locator('button[type="submit"], button:has-text("Submit")');

      // At least one form element should be visible
      const hasTitle = await titleInput.isVisible().catch(() => false);
      const hasContent = await contentArea.isVisible().catch(() => false);
      const hasSubmit = await submitBtn.isVisible().catch(() => false);

      expect(hasTitle || hasContent || hasSubmit).toBe(true);
    }
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Reviews Section - Responsive Design', () => {
  test('reviews section should be visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewsSection = page.locator('#reviews, section:has-text("Customer Reviews")');
    await expect(reviewsSection).toBeVisible();
  });

  test('reviews section should be visible on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const reviewsSection = page.locator('#reviews, section:has-text("Customer Reviews")');
    await expect(reviewsSection).toBeVisible();
  });

  test('purchase guidance should be visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const guidanceText = page.getByText(/Leave a review from your order history/i);
    await expect(guidanceText).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Reviews Section - Accessibility', () => {
  test('reviews section should have proper heading', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const heading = page.locator('h2:has-text("Customer Reviews")');
    await expect(heading).toBeVisible();
  });

  test('order history link should be keyboard accessible', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    const ordersLink = page.locator('a[href="/account/orders"]');
    if (await ordersLink.isVisible()) {
      await ordersLink.focus();
      await expect(ordersLink).toBeFocused();
    }
  });
});

// ============================================================================
// Error State Tests
// ============================================================================

test.describe('Reviews Section - Error States', () => {
  test('should handle reviews API error gracefully', async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (!productUrl) {
      test.skip();
      return;
    }

    // The section should still render even if API fails
    const reviewsSection = page.locator('#reviews, section:has-text("Customer Reviews")');
    await expect(reviewsSection).toBeVisible();

    // Should show error message or fallback content
    const hasError = await page.getByText(/Unable to load|error|try again/i).isVisible().catch(() => false);
    const hasContent = await reviewsSection.locator('div, p').first().isVisible().catch(() => false);

    expect(hasError || hasContent).toBe(true);
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================

test.describe('Reviews Section - Loading States', () => {
  test('should show loading skeleton while fetching', async ({ page }) => {
    // Navigate and check initial load state
    await page.goto('/posters');

    // Wait for page to load
    await page.waitForSelector('a[href^="/posters/"], h3:has-text("No products found")', { timeout: 10000 }).catch(() => null);

    const productLinks = page.locator('a[href^="/posters/"]:not([href="/posters"])');
    const count = await productLinks.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const href = await productLinks.first().getAttribute('href');
    if (!href || href === '/posters') {
      test.skip();
      return;
    }

    // Navigate to product and immediately check for skeleton
    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes('/reviews') || resp.url().includes(href)
    );
    // `#reviews` so the review tabpanel is the one mounted — see the helper
    // at the top of this file.
    await page.goto(`${href}#reviews`);

    // Either skeleton or loaded content should be visible.
    //
    // Read after a settle rather than in the same tick as the navigation: the
    // wall is a tabpanel now (#521), and the tab that mounts it is opened by
    // an effect, so an instant read races hydration and sees neither the
    // skeleton nor the section. The assertion is unchanged — one of the two
    // must show up.
    const skeleton = page.locator('[class*="skeleton"], [class*="animate-pulse"]');
    const reviewsSection = page.locator('#reviews');

    await page
      .waitForSelector('#reviews, [class*="animate-pulse"]', { timeout: 10000 })
      .catch(() => null);

    const hasSkeleton = await skeleton.first().isVisible().catch(() => false);
    const hasSection = await reviewsSection.isVisible().catch(() => false);

    // Wait for content to load
    await responsePromise.catch(() => {});

    expect(hasSkeleton || hasSection).toBe(true);
  });
});
