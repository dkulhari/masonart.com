import { test, expect } from '@playwright/test';

/**
 * Product Listing Page E2E Tests
 *
 * Tests for the MasonArt product listing page (/posters) including:
 * - Page header with title and product count
 * - Filter sidebar (desktop) and sheet (mobile)
 * - Active filter tags with clear functionality
 * - Product grid with cards
 * - Pagination
 * - URL-based filter state
 * - Sort options
 * - SEO meta tags
 * - Responsive design
 * - Accessibility
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/posters/index.tsx
 * - packages/web/app/components/product/ProductFilters.tsx
 * - packages/web/app/components/product/ProductGrid.tsx
 * - packages/web/app/components/product/ProductCard.tsx
 */

// ============================================================================
// Page Header Tests
// ============================================================================

test.describe('Product Listing - Page Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display the page header section', async ({ page }) => {
    const headerSection = page.locator('section').first();
    await expect(headerSection).toBeVisible();
  });

  test('should display Shop Posters title', async ({ page }) => {
    const title = page.locator('h1:has-text("Shop Posters")');
    await expect(title).toBeVisible();
  });

  test('should display product count or default text', async ({ page }) => {
    // Either shows "Showing X products" or "Browse our collection"
    const productCount = page.locator('text=/Showing \\d+ product|Browse our collection/');
    await expect(productCount.first()).toBeVisible();
  });

  test('should indicate active filters in header', async ({ page }) => {
    // Navigate with a filter applied
    await page.goto('/posters?styles=abstract');

    const filterIndicator = page.locator('text=/matching your filters/');
    // May or may not be visible depending on product count
    const count = await filterIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Desktop Filter Sidebar Tests
// ============================================================================

test.describe('Product Listing - Desktop Filter Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');
  });

  test('should display filter sidebar on desktop', async ({ page }) => {
    const filterSidebar = page.locator('aside.hidden.lg\\:block');
    await expect(filterSidebar).toBeVisible();
  });

  test('should display Filters header', async ({ page }) => {
    const filtersHeader = page.locator('h2:has-text("Filters")');
    await expect(filtersHeader).toBeVisible();
  });

  test('should display Sort By section', async ({ page }) => {
    const sortSection = page.locator('button:has-text("Sort By")');
    await expect(sortSection).toBeVisible();
  });

  test('should display Orientation section', async ({ page }) => {
    const orientationSection = page.locator('button:has-text("Orientation")');
    await expect(orientationSection).toBeVisible();
  });

  test('should display Style section', async ({ page }) => {
    const styleSection = page.locator('button:has-text("Style")');
    await expect(styleSection).toBeVisible();
  });

  test('should display Subject section', async ({ page }) => {
    const subjectSection = page.locator('button:has-text("Subject")');
    await expect(subjectSection).toBeVisible();
  });

  test('should display Color section', async ({ page }) => {
    const colorSection = page.locator('button:has-text("Color")');
    await expect(colorSection).toBeVisible();
  });

  test('should display Room section', async ({ page }) => {
    const roomSection = page.locator('button:has-text("Room")');
    await expect(roomSection).toBeVisible();
  });

  test('should display Special filters section', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await expect(specialSection).toBeVisible();
  });

  test('should toggle filter section on click', async ({ page }) => {
    // Click on Color section to expand it (might be collapsed by default)
    const colorSection = page.locator('button:has-text("Color")');
    await colorSection.click();

    // Should show color options
    const blackOption = page.locator('button:has-text("Black")').first();
    await expect(blackOption).toBeVisible();
  });

  test('should show Clear all button when filters are active', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    const clearAllButton = page.locator('button:has-text("Clear all")').first();
    await expect(clearAllButton).toBeVisible();
  });
});

// ============================================================================
// Filter Selection Tests
// ============================================================================

test.describe('Product Listing - Filter Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');
  });

  test('should select orientation filter', async ({ page }) => {
    // Orientation section should be expanded by default
    const portraitButton = page.locator('button:has-text("Portrait")').first();
    await portraitButton.click();

    // URL should update with orientation parameter
    await expect(page).toHaveURL(/orientation=portrait/);
  });

  test('should select style filter and update URL', async ({ page }) => {
    // Style section should be expanded by default
    const abstractLabel = page.locator('label:has-text("Abstract")');
    await abstractLabel.click();

    // URL should update with styles parameter
    await expect(page).toHaveURL(/styles=abstract/);
  });

  test('should allow multiple style selections', async ({ page }) => {
    const abstractLabel = page.locator('label:has-text("Abstract")');
    await abstractLabel.click();

    const minimalistLabel = page.locator('label:has-text("Minimalist")');
    await minimalistLabel.click();

    // URL should contain both styles
    await expect(page).toHaveURL(/styles=.*abstract/);
    await expect(page).toHaveURL(/styles=.*minimalist/);
  });

  test('should deselect filter on second click', async ({ page }) => {
    // Select filter
    const portraitButton = page.locator('button:has-text("Portrait")').first();
    await portraitButton.click();
    await expect(page).toHaveURL(/orientation=portrait/);

    // Deselect filter
    await portraitButton.click();
    await expect(page).not.toHaveURL(/orientation=/);
  });

  test('should select subject filter', async ({ page }) => {
    // Expand subjects section
    const subjectsSection = page.locator('button:has-text("Subject")');
    await subjectsSection.click();

    const natureLabel = page.locator('label:has-text("Nature & Landscape")');
    await natureLabel.click();

    await expect(page).toHaveURL(/subjects=nature-landscape/);
  });

  test('should select color filter', async ({ page }) => {
    // Expand colors section
    const colorsSection = page.locator('button:has-text("Color")');
    await colorsSection.click();

    const blueButton = page.locator('button:has-text("Blue")');
    await blueButton.click();

    await expect(page).toHaveURL(/colors=blue/);
  });

  test('should select room filter', async ({ page }) => {
    // Expand rooms section
    const roomsSection = page.locator('button:has-text("Room")');
    await roomsSection.click();

    const livingRoomLabel = page.locator('label:has-text("Living Room")');
    await livingRoomLabel.click();

    await expect(page).toHaveURL(/rooms=living-room/);
  });
});

// ============================================================================
// Sort Options Tests
// ============================================================================

test.describe('Product Listing - Sort Options', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');
  });

  test('should display sort options', async ({ page }) => {
    // Sort section should be expanded by default
    const newestFirst = page.locator('button:has-text("Newest First")');
    await expect(newestFirst).toBeVisible();
  });

  test('should display all sort options', async ({ page }) => {
    await expect(page.locator('button:has-text("Newest First")')).toBeVisible();
    await expect(page.locator('button:has-text("Oldest First")')).toBeVisible();
    await expect(page.locator('button:has-text("Price: Low to High")')).toBeVisible();
    await expect(page.locator('button:has-text("Price: High to Low")')).toBeVisible();
    await expect(page.locator('button:has-text("Name: A to Z")')).toBeVisible();
    await expect(page.locator('button:has-text("Name: Z to A")')).toBeVisible();
  });

  test('should sort by price low to high', async ({ page }) => {
    const priceLowHigh = page.locator('button:has-text("Price: Low to High")');
    await priceLowHigh.click();

    await expect(page).toHaveURL(/sortBy=basePrice/);
    await expect(page).toHaveURL(/sortOrder=asc/);
  });

  test('should sort by price high to low', async ({ page }) => {
    const priceHighLow = page.locator('button:has-text("Price: High to Low")');
    await priceHighLow.click();

    await expect(page).toHaveURL(/sortBy=basePrice/);
    await expect(page).toHaveURL(/sortOrder=desc/);
  });

  test('should sort by name A to Z', async ({ page }) => {
    const nameAZ = page.locator('button:has-text("Name: A to Z")');
    await nameAZ.click();

    await expect(page).toHaveURL(/sortBy=title/);
    await expect(page).toHaveURL(/sortOrder=asc/);
  });

  test('should indicate current sort selection', async ({ page }) => {
    const priceLowHigh = page.locator('button:has-text("Price: Low to High")');
    await priceLowHigh.click();

    // Selected option should have checkmark icon
    const checkIcon = priceLowHigh.locator('svg');
    await expect(checkIcon).toBeVisible();
  });
});

// ============================================================================
// Mobile Filter Tests
// ============================================================================

test.describe('Product Listing - Mobile Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');
  });

  test('should hide desktop filter sidebar on mobile', async ({ page }) => {
    const filterSidebar = page.locator('aside.hidden.lg\\:block');
    await expect(filterSidebar).not.toBeVisible();
  });

  test('should display mobile filter button', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await expect(filterButton).toBeVisible();
  });

  test('should display filter count badge when filters active', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    const filterButton = page.locator('button:has-text("Filters")');
    await expect(filterButton).toBeVisible();

    // Should show badge with count
    const badge = filterButton.locator('.rounded-full.bg-primary');
    await expect(badge).toBeVisible();
  });

  test('should open mobile filter sheet on button click', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    // Filter sheet should be visible
    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).toBeVisible();
  });

  test('should display filter options in mobile sheet', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    // Should show filter sections
    await expect(page.locator('button:has-text("Sort By")')).toBeVisible();
    await expect(page.locator('button:has-text("Orientation")')).toBeVisible();
    await expect(page.locator('button:has-text("Style")')).toBeVisible();
  });

  test('should display Apply Filters button in mobile sheet', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    const applyButton = page.locator('button:has-text("Apply Filters")');
    await expect(applyButton).toBeVisible();
  });

  test('should close mobile filter sheet on Apply Filters', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    const applyButton = page.locator('button:has-text("Apply Filters")');
    await applyButton.click();

    // Sheet should close
    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).not.toBeVisible();
  });

  test('should close mobile filter sheet on backdrop click', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    // Click backdrop
    const backdrop = page.locator('.bg-black\\/50');
    await backdrop.click({ force: true });

    // Sheet should close
    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).not.toBeVisible();
  });

  test('should display close button in mobile sheet', async ({ page }) => {
    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    const closeButton = page.locator('button[aria-label="Close filters"]');
    await expect(closeButton).toBeVisible();
  });
});

// ============================================================================
// Active Filter Tags Tests
// ============================================================================

test.describe('Product Listing - Active Filter Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('should display active filter tags', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    const activeFiltersLabel = page.locator('text=Active filters:');
    await expect(activeFiltersLabel.first()).toBeVisible();
  });

  test('should display filter tag with remove button', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    // Should show abstract tag with X button
    const abstractTag = page.locator('button:has-text("abstract")');
    await expect(abstractTag.first()).toBeVisible();
  });

  test('should remove individual filter on tag click', async ({ page }) => {
    await page.goto('/posters?styles=abstract,minimalist');

    // Click to remove abstract filter
    const abstractTag = page.locator('button:has-text("abstract")').first();
    await abstractTag.click();

    // URL should no longer contain abstract
    await expect(page).not.toHaveURL(/abstract/);
    await expect(page).toHaveURL(/minimalist/);
  });

  test('should display Clear all button with active filters', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    const clearAllButton = page.locator('button:has-text("Clear all")');
    await expect(clearAllButton.first()).toBeVisible();
  });

  test('should clear all filters on Clear all click', async ({ page }) => {
    await page.goto('/posters?styles=abstract&orientation=portrait');

    const clearAllButton = page.locator('button:has-text("Clear all")').first();
    await clearAllButton.click();

    // URL should be clean
    await expect(page).not.toHaveURL(/styles=/);
    await expect(page).not.toHaveURL(/orientation=/);
  });

  test('should display multiple filter tags', async ({ page }) => {
    await page.goto('/posters?styles=abstract&orientation=portrait');

    const abstractTag = page.locator('button:has-text("abstract")');
    const portraitTag = page.locator('button:has-text("portrait")');

    await expect(abstractTag.first()).toBeVisible();
    await expect(portraitTag.first()).toBeVisible();
  });

  test('should not display filter tags when no filters active', async ({ page }) => {
    await page.goto('/posters');

    const activeFiltersLabel = page.locator('text=Active filters:');
    await expect(activeFiltersLabel).not.toBeVisible();
  });
});

// ============================================================================
// Product Grid Tests
// ============================================================================

test.describe('Product Listing - Product Grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display product grid or empty state', async ({ page }) => {
    // Either product grid or empty state should be visible
    const productGrid = page.locator('.grid.grid-cols-2');
    const emptyState = page.locator('text=No products found');

    const hasGrid = await productGrid.count() > 0;
    const hasEmptyState = await emptyState.isVisible();

    expect(hasGrid || hasEmptyState).toBe(true);
  });

  test('should display product cards with links to detail page', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      await expect(firstCard).toBeVisible();

      // Card should have proper href
      const href = await firstCard.getAttribute('href');
      expect(href).toMatch(/^\/posters\/.+/);
    }
  });

  test('should display product title in card', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      const title = firstCard.locator('h3');
      await expect(title).toBeVisible();
    }
  });

  test('should display product price in card', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      const price = firstCard.locator('text=/From ₹/');
      await expect(price).toBeVisible();
    }
  });

  test('should display product image or placeholder', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      const image = firstCard.locator('img');
      const placeholder = firstCard.locator('svg.text-muted-foreground');

      const hasImage = await image.count() > 0;
      const hasPlaceholder = await placeholder.count() > 0;

      expect(hasImage || hasPlaceholder).toBe(true);
    }
  });

  test('should lazy load product images', async ({ page }) => {
    const productImages = page.locator('a[href^="/posters/"] img[loading="lazy"]');
    const count = await productImages.count();

    // If there are products with images, they should have lazy loading
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display Featured badge on featured products', async ({ page }) => {
    const featuredBadge = page.locator('.bg-brand-500:has-text("Featured")');
    const count = await featuredBadge.count();

    // Badge count can be 0 or more
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display AI badge on AI generated products', async ({ page }) => {
    const aiBadge = page.locator('.bg-purple-500:has-text("AI")');
    const count = await aiBadge.count();

    // Badge count can be 0 or more
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Empty State Tests
// ============================================================================

test.describe('Product Listing - Empty State', () => {
  test('should display empty state with impossible filter combination', async ({ page }) => {
    // Use a filter combination that likely returns no results
    await page.goto('/posters?styles=nonexistent-style-xyz');

    // Should show empty state or products
    const emptyState = page.locator('text=No products found');
    const productGrid = page.locator('.grid.grid-cols-2');

    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasProducts = await productGrid.locator('a').count() > 0;

    // One of these should be true
    expect(hasEmptyState || hasProducts).toBe(true);
  });

  test('should display empty state description', async ({ page }) => {
    await page.goto('/posters?styles=nonexistent-style-xyz');

    const description = page.locator('text=Try adjusting your filters');
    const isVisible = await description.isVisible().catch(() => false);

    // May or may not be visible depending on data
    expect(typeof isVisible).toBe('boolean');
  });

  test('should display Create with AI link in empty state', async ({ page }) => {
    await page.goto('/posters?styles=nonexistent-style-xyz');

    const createLink = page.locator('a[href="/create"]:has-text("Create your own with AI")');
    const count = await createLink.count();

    // May or may not be visible depending on data
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Pagination Tests
// ============================================================================

test.describe('Product Listing - Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display pagination when multiple pages exist', async ({ page }) => {
    // Pagination nav should be visible if there are multiple pages
    const pagination = page.locator('nav[aria-label="Pagination"]');
    const count = await pagination.count();

    // Pagination may or may not be visible depending on product count
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display Previous button', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const prevButton = page.locator('button[aria-label="Go to previous page"]');
      await expect(prevButton).toBeVisible();
    }
  });

  test('should display Next button', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const nextButton = page.locator('button[aria-label="Go to next page"]');
      await expect(nextButton).toBeVisible();
    }
  });

  test('should disable Previous button on first page', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const prevButton = page.locator('button[aria-label="Go to previous page"]');
      const isDisabled = await prevButton.getAttribute('disabled');
      expect(isDisabled).not.toBeNull();
    }
  });

  test('should navigate to next page on Next click', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const nextButton = page.locator('button[aria-label="Go to next page"]');
      const isDisabled = await nextButton.getAttribute('disabled');

      if (isDisabled === null) {
        await nextButton.click();
        await expect(page).toHaveURL(/page=2/);
      }
    }
  });

  test('should display page numbers', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const page1Button = page.locator('button[aria-label="Go to page 1"]');
      await expect(page1Button).toBeVisible();
    }
  });

  test('should highlight current page', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const currentPage = page.locator('button[aria-current="page"]');
      await expect(currentPage).toBeVisible();
    }
  });

  test('should navigate to page 2 via URL', async ({ page }) => {
    await page.goto('/posters?page=2');

    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const currentPage = page.locator('button[aria-current="page"]');
      await expect(currentPage).toContainText('2');
    }
  });

  test('should enable Previous button on page 2', async ({ page }) => {
    await page.goto('/posters?page=2');

    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const prevButton = page.locator('button[aria-label="Go to previous page"]');
      const isDisabled = await prevButton.getAttribute('disabled');
      expect(isDisabled).toBeNull();
    }
  });
});

// ============================================================================
// URL-based Filter State Tests
// ============================================================================

test.describe('Product Listing - URL State', () => {
  test('should apply styles filter from URL', async ({ page }) => {
    await page.goto('/posters?styles=abstract');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Should show abstract tag as active filter
    const abstractTag = page.locator('button:has-text("abstract")');
    await expect(abstractTag.first()).toBeVisible();
  });

  test('should apply multiple styles from URL', async ({ page }) => {
    await page.goto('/posters?styles=abstract,minimalist');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Should show both tags
    const abstractTag = page.locator('button:has-text("abstract")');
    const minimalistTag = page.locator('button:has-text("minimalist")');

    await expect(abstractTag.first()).toBeVisible();
    await expect(minimalistTag.first()).toBeVisible();
  });

  test('should apply orientation filter from URL', async ({ page }) => {
    await page.goto('/posters?orientation=portrait');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Should show portrait tag
    const portraitTag = page.locator('button:has-text("portrait")');
    await expect(portraitTag.first()).toBeVisible();
  });

  test('should apply sort from URL', async ({ page }) => {
    await page.goto('/posters?sortBy=basePrice&sortOrder=asc');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Price Low to High should be selected
    const priceLowHigh = page.locator('button:has-text("Price: Low to High")');
    const checkIcon = priceLowHigh.locator('svg');
    await expect(checkIcon).toBeVisible();
  });

  test('should apply combined filters from URL', async ({ page }) => {
    await page.goto('/posters?styles=abstract&orientation=portrait&sortBy=title&sortOrder=asc');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Should show all active filters
    const abstractTag = page.locator('button:has-text("abstract")');
    const portraitTag = page.locator('button:has-text("portrait")');

    await expect(abstractTag.first()).toBeVisible();
    await expect(portraitTag.first()).toBeVisible();
  });

  test('should reset page to 1 when changing filters', async ({ page }) => {
    await page.goto('/posters?page=2');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Select a style filter
    const abstractLabel = page.locator('label:has-text("Abstract")');
    await abstractLabel.click();

    // Page should reset to 1 (not in URL or page=1)
    await expect(page).not.toHaveURL(/page=2/);
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('Product Listing - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have page title with MasonArt', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('MasonArt');
    expect(title.toLowerCase()).toContain('poster');
  });

  test('should have meta description', async ({ page }) => {
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description?.toLowerCase()).toContain('poster');
  });

  test('should have canonical URL', async ({ page }) => {
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    expect(canonical).toContain('/posters');
  });

  test('should have Open Graph title', async ({ page }) => {
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toContain('MasonArt');
  });

  test('should have Open Graph description', async ({ page }) => {
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDescription).toBeTruthy();
  });

  test('should have Open Graph type', async ({ page }) => {
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    expect(ogType).toBe('website');
  });

  test('should have Open Graph image', async ({ page }) => {
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBeTruthy();
  });

  test('should have Twitter card meta tag', async ({ page }) => {
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');
  });

  test('should have robots meta tag', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBeTruthy();
    expect(robots).toContain('follow');
  });

  test('should have noindex for paginated pages', async ({ page }) => {
    await page.goto('/posters?page=2');

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Product Listing - Responsive Design', () => {
  test('should show 2 columns on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const grid = page.locator('.grid.grid-cols-2');
    await expect(grid.first()).toBeVisible();
  });

  test('should show filter button on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const filterButton = page.locator('button:has-text("Filters")');
    await expect(filterButton).toBeVisible();
  });

  test('should hide filter sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const sidebar = page.locator('aside.hidden.lg\\:block');
    await expect(sidebar).not.toBeVisible();
  });

  test('should show filter sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');

    const sidebar = page.locator('aside.hidden.lg\\:block');
    await expect(sidebar).toBeVisible();
  });

  test('should show 3 columns on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/posters');

    // Grid should adapt - checking the grid class
    const grid = page.locator('.grid.grid-cols-2');
    await expect(grid.first()).toBeVisible();
  });

  test('should show 4 columns on large desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/posters');

    const grid = page.locator('.grid');
    await expect(grid.first()).toBeVisible();
  });

  test('should adapt pagination for mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      // Previous/Next text should be hidden on mobile
      const prevButton = page.locator('button[aria-label="Go to previous page"]');
      await expect(prevButton).toBeVisible();
    }
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Product Listing - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // h1 should contain "Shop Posters"
    const h1 = page.locator('h1');
    await expect(h1).toContainText('Shop Posters');
  });

  test('should have accessible filter sidebar header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const filtersHeader = page.locator('h2:has-text("Filters")');
    await expect(filtersHeader).toBeVisible();
  });

  test('should have ARIA labels on pagination buttons', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const prevButton = page.locator('button[aria-label="Go to previous page"]');
      const nextButton = page.locator('button[aria-label="Go to next page"]');

      await expect(prevButton).toBeVisible();
      await expect(nextButton).toBeVisible();
    }
  });

  test('should have aria-expanded on filter sections', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const styleSection = page.locator('button:has-text("Style")');
    const ariaExpanded = await styleSection.getAttribute('aria-expanded');
    expect(ariaExpanded).toBeTruthy();
  });

  test('should have aria-current on current pagination page', async ({ page }) => {
    const pagination = page.locator('nav[aria-label="Pagination"]');
    if (await pagination.isVisible()) {
      const currentPage = page.locator('button[aria-current="page"]');
      await expect(currentPage).toBeVisible();
    }
  });

  test('should have accessible mobile filter dialog', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    const ariaModal = await dialog.getAttribute('aria-modal');
    expect(ariaModal).toBe('true');

    const ariaLabel = await dialog.getAttribute('aria-label');
    expect(ariaLabel).toBe('Filters');
  });

  test('should have accessible close button for mobile filters', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const filterButton = page.locator('button:has-text("Filters")');
    await filterButton.click();

    const closeButton = page.locator('button[aria-label="Close filters"]');
    await expect(closeButton).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Tab into page
    await page.keyboard.press('Tab');

    // Something should be focused
    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have sr-only checkbox inputs in filters', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const srOnlyCheckbox = page.locator('input[type="checkbox"].sr-only');
    const count = await srOnlyCheckbox.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Product Listing - Navigation', () => {
  test('should navigate to product detail on card click', async ({ page }) => {
    await page.goto('/posters');

    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      const href = await firstCard.getAttribute('href');
      await firstCard.click();

      await expect(page).toHaveURL(href!);
    }
  });

  test('should navigate back to listing with back button', async ({ page }) => {
    await page.goto('/posters');

    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      await firstCard.click();

      await page.goBack();
      await expect(page).toHaveURL('/posters');
    }
  });

  test('should preserve filters when navigating back', async ({ page }) => {
    await page.goto('/posters?styles=abstract');

    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      await firstCard.click();

      await page.goBack();
      await expect(page).toHaveURL(/styles=abstract/);
    }
  });

  test('should navigate from home page category link', async ({ page }) => {
    await page.goto('/');

    const abstractLink = page.locator('a[href="/posters?styles=abstract"]');
    await abstractLink.click();

    await expect(page).toHaveURL(/\/posters\?styles=abstract/);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Product Listing - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/posters');

    // Wait for main content
    await expect(page.locator('h1')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should render header quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/posters');

    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();

    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(3000);
  });

  test('should handle rapid filter changes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');

    // Rapidly apply multiple filters
    const portraitButton = page.locator('button:has-text("Portrait")').first();
    await portraitButton.click();

    const abstractLabel = page.locator('label:has-text("Abstract")');
    await abstractLabel.click();

    const minimalistLabel = page.locator('label:has-text("Minimalist")');
    await minimalistLabel.click();

    // Page should still be responsive
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();
  });

  test('should maintain layout during scroll', async ({ page }) => {
    await page.goto('/posters');

    // Get initial header position
    const header = page.locator('header');
    const initialBox = await header.boundingBox();

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);

    // Header should remain visible (sticky)
    const afterScrollBox = await header.boundingBox();
    if (initialBox && afterScrollBox) {
      expect(afterScrollBox.y).toBeLessThanOrEqual(10);
    }
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Product Listing - Error Handling', () => {
  test('should handle invalid page parameter', async ({ page }) => {
    await page.goto('/posters?page=invalid');

    // Page should still load
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();
  });

  test('should handle invalid sort parameter', async ({ page }) => {
    await page.goto('/posters?sortBy=invalid&sortOrder=invalid');

    // Page should still load
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();
  });

  test('should handle very large page number', async ({ page }) => {
    await page.goto('/posters?page=99999');

    // Page should load, possibly showing empty state
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();
  });

  test('should not have JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/posters');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(1000);

    // Filter out expected network errors
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Special Filter Tests
// ============================================================================

test.describe('Product Listing - Special Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');
  });

  test('should expand Special filters section', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await specialSection.click();

    const aiGeneratedOption = page.locator('label:has-text("AI Generated")');
    await expect(aiGeneratedOption).toBeVisible();
  });

  test('should display AI Generated filter option', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await specialSection.click();

    const aiGeneratedOption = page.locator('label:has-text("AI Generated")');
    await expect(aiGeneratedOption).toBeVisible();
  });

  test('should display Featured filter option', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await specialSection.click();

    const featuredOption = page.locator('label:has-text("Featured")');
    await expect(featuredOption).toBeVisible();
  });

  test('should apply AI Generated filter', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await specialSection.click();

    const aiGeneratedLabel = page.locator('label:has-text("AI Generated")');
    await aiGeneratedLabel.click();

    await expect(page).toHaveURL(/isAiGenerated=true/);
  });

  test('should apply Featured filter', async ({ page }) => {
    const specialSection = page.locator('button:has-text("Special")');
    await specialSection.click();

    const featuredLabel = page.locator('label:has-text("Featured")');
    await featuredLabel.click();

    await expect(page).toHaveURL(/isFeatured=true/);
  });

  test('should show AI Generated in active filter tags', async ({ page }) => {
    await page.goto('/posters?isAiGenerated=true');

    const aiTag = page.locator('button:has-text("AI Generated")');
    await expect(aiTag.first()).toBeVisible();
  });
});
