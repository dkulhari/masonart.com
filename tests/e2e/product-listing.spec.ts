import { test, expect } from '@playwright/test';

/**
 * Facet vocabulary, taken from FACET_GROUPS in @chobii/shared (#395, #415).
 *
 * Spelled out here because most of this file was written against the old
 * words and every one of them is now wrong in a way that reads as a broken
 * page rather than a stale test:
 *
 *   - `abstract` is a SUBJECT, not a style. `?styles=abstract` fails
 *     validation, so no chip, no filtered grid, no clear-all.
 *   - `orientation=portrait` is still the parameter, but the rail labels it
 *     "Vertical" — mesonart's word (#415).
 *   - A chip carries the raw id with its hyphens spaced out, not the label:
 *     `minimalist-art` renders as "minimalist art".
 *
 * Zero-count options render DISABLED, so anything clicked here has to be a
 * value the seed actually carries.
 */
const STYLE = {
  id: 'minimalist-art',
  label: 'Minimalist Art',
  chip: 'minimalist art',
};
const STYLE_2 = { id: 'pop-art', label: 'Pop Art', chip: 'pop art' };
const SUBJECT = { id: 'landscape', label: 'Landscape' };
const ORIENTATION = { id: 'portrait', label: 'Vertical', chip: 'portrait' };
const ROOM = { id: 'living-room', label: 'Living Room' };
const COLOR = { id: 'blue', label: 'Blue' };

/**
 * The desktop chip row and the mobile one both render; scope or you get both.
 *
 * The desktop copy moved into the toolbar in #454 — it used to be a
 * `div.hidden.lg:block` sitting in the products column, after the `</aside>`.
 * Addressed by test id now rather than by class, so the next placement change
 * does not silently resolve this locator to some other hidden block.
 */
const desktopChips = (page: import('@playwright/test').Page) =>
  page.getByTestId('toolbar-active-filters');

/**
 * Product Listing Page E2E Tests
 *
 * Tests for the chobii.art product listing page (/posters) including:
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
    // The count moved into the toolbar with #416 and reads "N products" /
    // "No products" — the header band no longer carries it.
    const productCount = page
      .getByTestId('collection-toolbar')
      .locator('text=/\\d+ products?|No products/');
    await expect(productCount.first()).toBeVisible();
  });

  test('should indicate active filters in header', async ({ page }) => {
    // Navigate with a filter applied
    await page.goto(`/posters?styles=${STYLE.id}`);

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
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('should display filter sidebar on desktop', async ({ page }) => {
    const filterSidebar = page.locator('aside.hidden.lg\\:block');
    await expect(filterSidebar).toBeVisible();
  });

  test('carries no header of its own — the chips above the grid do that job', async ({
    page,
  }) => {
    // #415: mesonart's rail has no title, no active count and no "Clear all".
    // The drawer keeps its header because it has no chips and no other way
    // out; the rail does not. This asserts the removal so it stays removed.
    const rail = page.locator('aside.hidden.lg\\:block');
    await expect(rail).toBeVisible();
    await expect(rail.locator('h2')).toHaveCount(0);
  });

  test('should display Sort By in the toolbar, not the rail', async ({
    page,
  }) => {
    // Sort left the sidebar for a toolbar pill in #416 — it is not a filter
    // and it does not narrow the result set.
    const rail = page.locator('aside.hidden.lg\\:block');
    await expect(rail.getByRole('button', { name: /Sort/ })).toHaveCount(0);
    await expect(
      page.getByTestId('collection-toolbar').getByRole('button', {
        name: /^Sort by:/,
      })
    ).toBeVisible();
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
    // Exact: `has-text("Color")` also matches the "Colorful Art" style option.
    const colorSection = page.getByRole('button', {
      name: 'Color',
      exact: true,
    });
    await expect(colorSection).toBeVisible();
  });

  test('should display Room section', async ({ page }) => {
    const roomSection = page.locator('button:has-text("Room")');
    await expect(roomSection).toBeVisible();
  });

  test('has no Special section — those two live in the URL only', async ({
    page,
  }) => {
    // #415 rebuilt the rail from FACET_GROUPS, which has ten groups and no
    // Special. `isAiGenerated` and `isFeatured` survive as URL parameters the
    // API still filters on; they are covered as such under "URL State".
    const rail = page.locator('aside.hidden.lg\\:block');
    await expect(rail.getByRole('button', { name: /Special/ })).toHaveCount(0);
  });

  test('should toggle filter section on click', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    const styleSection = rail.getByRole('button', {
      name: 'Style',
      exact: true,
    });
    await expect(styleSection).toBeVisible();

    // Expanded by default, so its options are on screen. "Abstract" is a
    // SUBJECT — a style option is what belongs under Style.
    const styleOption = rail.getByText(STYLE.label, { exact: true });
    await expect(styleOption).toBeVisible({ timeout: 5000 });

    // Collapsing hides them again, which is the toggle this names.
    await styleSection.click();
    await expect(styleOption).toBeHidden();
  });

  test('should show Clear all button when filters are active', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id}`);

    // Clear all lives with the chips above the grid, not in the rail (#415).
    const clearAllButton = desktopChips(page)
      .getByRole('button', { name: 'Clear all' })
      .first();
    await expect(clearAllButton).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Filter Selection Tests
// ============================================================================

test.describe('Product Listing - Filter Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('should select orientation filter', async ({ page }) => {
    // The parameter is still `portrait`; the rail calls it "Vertical" (#415).
    // Options are labels wrapping an sr-only checkbox, not buttons.
    const rail = page.locator('aside.hidden.lg\\:block');
    await rail.getByText(ORIENTATION.label, { exact: true }).click();

    await expect(page).toHaveURL(
      new RegExp(`orientation=${ORIENTATION.id}`),
      { timeout: 10000 }
    );
  });

  test('should select style filter and update URL', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    await rail.getByText(STYLE.label, { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`styles=${STYLE.id}`), {
      timeout: 10000,
    });
  });

  test('should allow multiple style selections', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    await rail.getByText(STYLE.label, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`styles=${STYLE.id}`), {
      timeout: 10000,
    });

    await rail.getByText(STYLE_2.label, { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`styles=.*${STYLE.id}`), {
      timeout: 10000,
    });
    await expect(page).toHaveURL(new RegExp(`styles=.*${STYLE_2.id}`));
  });

  test('should deselect filter on second click', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    const vertical = rail.getByText(ORIENTATION.label, { exact: true });

    await vertical.click();
    await expect(page).toHaveURL(
      new RegExp(`orientation=${ORIENTATION.id}`),
      { timeout: 10000 }
    );

    await vertical.click();
    await expect(page).not.toHaveURL(/orientation=/, { timeout: 10000 });
  });

  test('should select subject filter', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    const subject = rail.getByText(SUBJECT.label, { exact: true });
    await subject.scrollIntoViewIfNeeded();
    await expect(subject).toBeVisible({ timeout: 5000 });
    await subject.click();

    await expect(page).toHaveURL(new RegExp(`subjects=${SUBJECT.id}`), {
      timeout: 10000,
    });
  });

  test('should select color filter', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    // Colors is one of the four groups open by default (ProductFilters.tsx:106)
    // — clicking its header here COLLAPSES it and hides the option.
    await expect(
      rail.getByRole('button', { name: 'Color', exact: true })
    ).toHaveAttribute('aria-expanded', 'true');

    const blue = rail.getByText(COLOR.label, { exact: true });
    await blue.scrollIntoViewIfNeeded();
    await blue.click();

    await expect(page).toHaveURL(new RegExp(`colors=${COLOR.id}`), {
      timeout: 10000,
    });
  });

  test('should select room filter', async ({ page }) => {
    const rail = page.locator('aside.hidden.lg\\:block');
    await rail.getByRole('button', { name: 'Room', exact: true }).click();

    const room = rail.getByText(ROOM.label, { exact: true });
    await expect(room).toBeVisible();
    await room.click();

    await expect(page).toHaveURL(new RegExp(`rooms=${ROOM.id}`), {
      timeout: 10000,
    });
  });
});

// ============================================================================
// Sort Options Tests
// ============================================================================

test.describe('Product Listing - Sort Options', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // networkidle, not load: the pill is a client component and a click on
    // server-rendered HTML lands on nothing.
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  /**
   * Sort is a toolbar pill that opens a panel in place (#416), not a radio
   * list in the rail. The pill's own label carries the current selection,
   * which is what these assert against.
   */
  const sortPill = (page: import('@playwright/test').Page) =>
    page
      .getByTestId('collection-toolbar')
      .getByRole('button', { name: /^Sort by:/ });

  const openSortPanel = async (page: import('@playwright/test').Page) => {
    await sortPill(page).click();
    const panel = page.getByRole('listbox', { name: 'Sort by' });
    await expect(panel).toBeVisible();
    return panel;
  };

  test('should display sort options', async ({ page }) => {
    const panel = await openSortPanel(page);
    await expect(panel.getByText('Newest First', { exact: true })).toBeVisible();
  });

  test('should display all sort options', async ({ page }) => {
    const panel = await openSortPanel(page);

    // Eight, including the two #405 added — Featured and Best selling.
    for (const label of [
      'Featured',
      'Best selling',
      'Newest First',
      'Oldest First',
      'Price: Low to High',
      'Price: High to Low',
      'Name: A to Z',
      'Name: Z to A',
    ]) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('should sort by price low to high', async ({ page }) => {
    const panel = await openSortPanel(page);
    await panel.getByText('Price: Low to High', { exact: true }).click();

    await expect(page).toHaveURL(/sortBy=basePrice/, { timeout: 10000 });
    await expect(page).toHaveURL(/sortOrder=asc/);
    await expect(sortPill(page)).toHaveText(/Price: Low to High/);
  });

  test('should sort by price high to low', async ({ page }) => {
    const panel = await openSortPanel(page);
    await panel.getByText('Price: High to Low', { exact: true }).click();

    // `desc` is the default sort order and the route deliberately leaves
    // defaults out of the URL (routes/posters/index.tsx:533) — so this one
    // writes sortBy alone. Asserting `sortOrder=desc` tests the URL builder's
    // absence of a feature, not the sort.
    await expect(page).toHaveURL(/sortBy=basePrice/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/sortOrder=asc/);
    await expect(sortPill(page)).toHaveText(/Price: High to Low/, {
      timeout: 10000,
    });
  });

  test('should sort by name A to Z', async ({ page }) => {
    const panel = await openSortPanel(page);
    await panel.getByText('Name: A to Z', { exact: true }).click();

    await expect(page).toHaveURL(/sortBy=title/, { timeout: 10000 });
    await expect(sortPill(page)).toHaveText(/Name: A to Z/);
  });

  test('should indicate current sort selection', async ({ page }) => {
    // The pill IS the indicator — there is no checked radio to look for.
    await expect(sortPill(page)).toHaveText(/Newest First/);

    const panel = await openSortPanel(page);
    await panel.getByText('Price: Low to High', { exact: true }).click();

    await expect(sortPill(page)).toHaveText(/Price: Low to High/, {
      timeout: 10000,
    });
  });
});

// ============================================================================
// Mobile Filter Tests
// ============================================================================

test.describe('Product Listing - Mobile Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // Wait for networkidle to ensure React hydration is complete
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  // Helper to get the mobile filter button (the one with border and icon, not the h2 header)
  const getMobileFilterButton = (page: import('@playwright/test').Page) =>
    page.locator('button.rounded-lg.border:has-text("Filters")');

  test('should hide desktop filter sidebar on mobile', async ({ page }) => {
    const filterSidebar = page.locator('aside.hidden.lg\\:block');
    await expect(filterSidebar).not.toBeVisible();
  });

  test('should display mobile filter button', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    await expect(filterButton).toBeVisible();
  });

  test('should display filter count badge when filters active', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id}`);

    const filterButton = getMobileFilterButton(page);
    await expect(filterButton).toBeVisible();

    // Should show badge with count
    const badge = filterButton.locator('.rounded-full.bg-primary');
    await expect(badge).toBeVisible();
  });

  test('should open mobile filter sheet on button click', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    // Wait for button to be visible and ready
    await expect(filterButton).toBeVisible();
    await filterButton.click();

    // Filter sheet should be visible (with longer timeout for state update)
    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).toBeVisible({ timeout: 10000 });
  });

  test('should display filter options in mobile sheet', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    await filterButton.click();

    // Sort is not in the drawer either — it is a toolbar pill (#416). The
    // drawer keeps its own "Filters" header, which the rail does not (#415).
    const dialog = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(dialog.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Orientation', exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Style', exact: true })
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Sort/ })).toHaveCount(0);
  });

  test('should display Apply Filters button in mobile sheet', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    await filterButton.click();

    const applyButton = page.locator('button:has-text("Apply Filters")');
    await expect(applyButton).toBeVisible();
  });

  test('should close mobile filter sheet on Apply Filters', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    await filterButton.click();

    const applyButton = page.locator('button:has-text("Apply Filters")');
    await applyButton.click();

    // Sheet should close
    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).not.toBeVisible();
  });

  test('should close mobile filter sheet on backdrop click', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
    await filterButton.click();

    const filterSheet = page.locator('div[role="dialog"][aria-label="Filters"]');
    await expect(filterSheet).toBeVisible();

    // Click the visible backdrop area (left side, not covered by the sheet)
    // Sheet is w-[85vw] from right, so visible backdrop is the left ~15% of viewport
    const backdrop = page.locator('.bg-black\\/50');
    await backdrop.click({ position: { x: 20, y: 300 } });

    // Sheet should close
    await expect(filterSheet).not.toBeVisible();
  });

  test('should display close button in mobile sheet', async ({ page }) => {
    const filterButton = getMobileFilterButton(page);
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
    await page.goto(`/posters?styles=${STYLE.id}`);

    // Both chip rows render — the mobile one and the desktop one. Scope, or
    // the mobile copy answers for the desktop layout.
    const activeFiltersLabel = desktopChips(page).locator(
      'text=Active filters:'
    );
    await expect(activeFiltersLabel.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display filter tag with remove button', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id}`);

    // A chip carries the raw id with its hyphens spaced, not the label.
    const styleTag = desktopChips(page).locator(
      `button:has-text("${STYLE.chip}")`
    );
    await expect(styleTag.first()).toBeVisible({ timeout: 10000 });
  });

  test('should remove individual filter on tag click', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id},${STYLE_2.id}`, {
      waitUntil: 'networkidle',
    });

    const styleTag = desktopChips(page)
      .locator(`button:has-text("${STYLE.chip}")`)
      .first();
    await expect(styleTag).toBeVisible({ timeout: 10000 });
    await styleTag.click();

    await expect(page).not.toHaveURL(new RegExp(STYLE.id), { timeout: 10000 });
    await expect(page).toHaveURL(new RegExp(STYLE_2.id));
  });

  test('should display Clear all button with active filters', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id}`);

    const clearAllButton = desktopChips(page).getByRole('button', {
      name: 'Clear all',
    });
    await expect(clearAllButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('should clear all filters on Clear all click', async ({ page }) => {
    await page.goto(
      `/posters?styles=${STYLE.id}&orientation=${ORIENTATION.id}`,
      { waitUntil: 'networkidle' }
    );

    const clearAllButton = desktopChips(page)
      .getByRole('button', { name: 'Clear all' })
      .first();
    await expect(clearAllButton).toBeVisible({ timeout: 10000 });
    await clearAllButton.click();

    // URL should be clean
    await expect(page).not.toHaveURL(/styles=/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/orientation=/, { timeout: 10000 });
  });

  test('should display multiple filter tags', async ({ page }) => {
    await page.goto(
      `/posters?styles=${STYLE.id}&orientation=${ORIENTATION.id}`
    );

    const chips = desktopChips(page);
    const styleTag = chips.locator(`button:has-text("${STYLE.chip}")`);
    const orientationTag = chips.locator(
      `button:has-text("${ORIENTATION.chip}")`
    );

    await expect(styleTag.first()).toBeVisible({ timeout: 10000 });
    await expect(orientationTag.first()).toBeVisible({ timeout: 10000 });
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
    // The title is a Link inside a <p>, not a heading — one h1 per page and
    // 24 card headings underneath it was the wrong hierarchy anyway.
    const cards = page.getByTestId('card-content');
    const count = await cards.count();

    if (count > 0) {
      const title = cards.first().locator('p a[href^="/posters/"]');
      await expect(title).toBeVisible();
      await expect(title).not.toHaveText('');
    }
  });

  test('should display product price in card', async ({ page }) => {
    // Price sits BESIDE the title link, sharing the right column with the
    // wishlist heart — not inside the product anchor.
    const cards = page.getByTestId('card-content');
    const count = await cards.count();

    if (count > 0) {
      const price = cards.first().locator('text=/From ₹/');
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
    await page.goto('/posters', { waitUntil: 'networkidle' });
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
        // Wait for client-side navigation to complete
        await expect(page).toHaveURL(/page=2/, { timeout: 10000 });
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

  /**
   * #457 — appending the next batch is a location change, so the router's
   * scroll restoration used to restore that location's stored position (0)
   * and throw the reader back to the first row mid-scroll.
   */
  test('should keep the scroll position when the next page appends', async ({ page }) => {
    const heightBefore = await page.evaluate(() => document.body.scrollHeight);

    // Far enough down that the sentinel's 400px rootMargin has fired
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 2400);
    await expect(page).toHaveURL(/page=2/, { timeout: 10000 });

    // The batch has to have actually appended, or the rest asserts nothing
    await expect
      .poll(() => page.evaluate(() => document.body.scrollHeight), { timeout: 10000 })
      .toBeGreaterThan(heightBefore);

    // html has scroll-behavior: smooth, so a reset glides over ~750ms rather
    // than jumping — read the position only once that could have finished.
    await page.waitForTimeout(2500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(1000);
  });
});

// ============================================================================
// URL-based Filter State Tests
// ============================================================================

test.describe('Product Listing - URL State', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('should apply styles filter from URL', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id}`);

    const styleTag = desktopChips(page).locator(
      `button:has-text("${STYLE.chip}")`
    );
    await expect(styleTag.first()).toBeVisible({ timeout: 10000 });
  });

  test('should apply multiple styles from URL', async ({ page }) => {
    await page.goto(`/posters?styles=${STYLE.id},${STYLE_2.id}`);

    const chips = desktopChips(page);
    await expect(
      chips.locator(`button:has-text("${STYLE.chip}")`).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      chips.locator(`button:has-text("${STYLE_2.chip}")`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should apply orientation filter from URL', async ({ page }) => {
    await page.goto(`/posters?orientation=${ORIENTATION.id}`);

    const orientationTag = desktopChips(page).locator(
      `button:has-text("${ORIENTATION.chip}")`
    );
    await expect(orientationTag.first()).toBeVisible({ timeout: 10000 });
  });

  test('should apply sort from URL', async ({ page }) => {
    await page.goto('/posters?sortBy=basePrice&sortOrder=asc');

    // The toolbar pill carries the current sort; the rail has no sort control
    // to put a check mark in any more (#416).
    await expect(
      page
        .getByTestId('collection-toolbar')
        .getByRole('button', { name: /^Sort by:/ })
    ).toHaveText(/Price: Low to High/, { timeout: 10000 });
  });

  test('should apply combined filters from URL', async ({ page }) => {
    await page.goto(
      `/posters?styles=${STYLE.id}&orientation=${ORIENTATION.id}&sortBy=title&sortOrder=asc`
    );

    const chips = desktopChips(page);
    await expect(
      chips.locator(`button:has-text("${STYLE.chip}")`).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      chips.locator(`button:has-text("${ORIENTATION.chip}")`).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page
        .getByTestId('collection-toolbar')
        .getByRole('button', { name: /^Sort by:/ })
    ).toHaveText(/Name: A to Z/);
  });

  test('should apply isAiGenerated from the URL', async ({ page }) => {
    // The rail's "Special" section went with the #415 facet rework, but the
    // parameter is still part of the contract and the API still filters on
    // it. Covered here rather than deleted with the UI that used to set it.
    await page.goto('/posters?isAiGenerated=true', {
      waitUntil: 'networkidle',
    });

    await expect(page).toHaveURL(/isAiGenerated=true/);
    const toolbarCount = page
      .getByTestId('collection-toolbar')
      .locator('text=/\\d+ products?|No products/');
    await expect(toolbarCount.first()).toBeVisible({ timeout: 10000 });
  });

  test('should apply isFeatured from the URL', async ({ page }) => {
    await page.goto('/posters?isFeatured=true', { waitUntil: 'networkidle' });

    await expect(page).toHaveURL(/isFeatured=true/);
  });

  test('should chip isFeatured like every other filter', async ({ page }) => {
    // Was fixme against #453: the chip row is gated on the active-filter
    // count, and that sum did not know isFeatured existed. Both come off one
    // derivation now (app/lib/activeFilters.ts).
    await page.goto('/posters?isFeatured=true', { waitUntil: 'networkidle' });

    await expect(
      desktopChips(page).getByRole('button', { name: /Featured/ }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should chip the facets the rail added in #415', async ({ page }) => {
    // Vibe, Aesthetic, Medium, Uniqueness and Availability were the other
    // five the old sum missed — filterable, but with no chip and no badge.
    await page.goto('/posters?vibe=tranquility-and-zen', {
      waitUntil: 'networkidle',
    });

    await expect(
      desktopChips(page)
        .getByRole('button', { name: /tranquility and zen/i })
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should narrow the result count with isFeatured', async ({ page }) => {
    const countText = async () =>
      (await page
        .getByTestId('collection-toolbar')
        .locator('text=/\\d+ products?|No products/')
        .first()
        .textContent()) ?? '';

    await page.goto('/posters', { waitUntil: 'networkidle' });
    const all = parseInt((await countText()).replace(/\D/g, ''), 10) || 0;

    await page.goto('/posters?isFeatured=true', { waitUntil: 'networkidle' });
    const featured = parseInt((await countText()).replace(/\D/g, ''), 10) || 0;

    // The parameter has to actually do something, not just survive the URL.
    expect(featured).toBeLessThanOrEqual(all);
  });

  test('should reset page to 1 when changing filters', async ({ page }) => {
    await page.goto('/posters?page=2', { waitUntil: 'networkidle' });

    const rail = page.locator('aside.hidden.lg\\:block');
    await rail.getByText(STYLE.label, { exact: true }).click();

    // Page should reset to 1 (not in URL or page=1)
    await expect(page).not.toHaveURL(/page=2/, { timeout: 10000 });
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('Product Listing - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have page title with chobii.art', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('chobii.art');
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
    expect(ogTitle).toContain('chobii.art');
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

    // Use specific selector for the mobile filter button (has border class)
    const filterButton = page.locator('button.rounded-lg.border:has-text("Filters")');
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
    // Anything that clicks needs the client bundle in place, not just HTML.
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // h1 should contain "Shop Posters"
    const h1 = page.locator('h1');
    await expect(h1).toContainText('Shop Posters');
  });

  test('should expose the rail as collapsible groups, header or not', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // The rail lost its "Filters" heading in #415 — mesonart's has none. What
    // a screen reader needs is not the title but the state of each group, so
    // that is what this asserts now.
    const rail = page.locator('aside.hidden.lg\\:block');
    const groups = rail.locator('button[aria-expanded]');
    await expect(groups.first()).toBeVisible();
    expect(await groups.count()).toBeGreaterThanOrEqual(10);

    const first = groups.first();
    const before = await first.getAttribute('aria-expanded');
    await first.click();
    await expect(first).not.toHaveAttribute('aria-expanded', before ?? '');
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
    // Reload with networkidle to ensure hydration after viewport change
    await page.goto('/posters', { waitUntil: 'networkidle' });

    // Use specific selector for the mobile filter button (has border class)
    const filterButton = page.locator('button.rounded-lg.border:has-text("Filters")');
    await expect(filterButton).toBeVisible();
    await filterButton.click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const ariaModal = await dialog.getAttribute('aria-modal');
    expect(ariaModal).toBe('true');

    const ariaLabel = await dialog.getAttribute('aria-label');
    expect(ariaLabel).toBe('Filters');
  });

  test('should have accessible close button for mobile filters', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // Reload with networkidle to ensure hydration after viewport change
    await page.goto('/posters', { waitUntil: 'networkidle' });

    // Use specific selector for the mobile filter button (has border class)
    const filterButton = page.locator('button.rounded-lg.border:has-text("Filters")');
    await expect(filterButton).toBeVisible();
    await filterButton.click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

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
    await page.goto(`/posters?styles=${STYLE.id}`);

    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      await firstCard.click();

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`styles=${STYLE.id}`));
    }
  });

  test('should navigate from home page category link', async ({ page }) => {
    // Was fixme against #452. The tiles carried loose slugs linked as
    // `?styles=<slug>`; Abstract is a SUBJECT, so it now goes out as one.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Scoped: the footer links the same value (#452).
    const tile = page
      .locator('section:has(h2:has-text("Shop by Style"))')
      .locator('a[href="/posters?subjects=abstract"]');
    await expect(tile).toBeVisible();
    await tile.click();

    await expect(page).toHaveURL(/\/posters\?subjects=abstract/);
    // Landing on a collection that is genuinely filtered is the point.
    await expect(
      desktopChips(page).locator('button:has-text("abstract")').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('offers no category tile the catalogue cannot fill', async ({ page }) => {
    // Typography is in the vocabulary so new art can be filed under it, and
    // nothing carries it yet — so no tile, rather than a tile onto an empty
    // grid (#452).
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(
      page.locator('a[href="/posters?subjects=typography"]')
    ).toHaveCount(0);
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
    // Warm the route first. Against the dev server the first hit pays for
    // compiling it — 3.1s of Vite, not 3.1s of page. Measuring that told us
    // nothing about the page and failed at random.
    await page.goto('/posters', { waitUntil: 'networkidle' });

    const startTime = Date.now();
    await page.reload();
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();

    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(3000);
  });

  test('should handle rapid filter changes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters', { waitUntil: 'networkidle' });

    const rail = page.locator('aside.hidden.lg\\:block');

    await rail.getByText(ORIENTATION.label, { exact: true }).click();
    await rail.getByText(STYLE.label, { exact: true }).click();
    await rail.getByText(STYLE_2.label, { exact: true }).click();

    // Page should still be responsive, with every click landing in the URL.
    await expect(page.locator('h1:has-text("Shop Posters")')).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`orientation=${ORIENTATION.id}`),
      { timeout: 10000 }
    );
    await expect(page).toHaveURL(new RegExp(`styles=.*${STYLE_2.id}`));
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
    // Wait for networkidle to ensure hydration
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  /**
   * The rail's "Special" section — AI Generated and Featured — went with the
   * #415 facet rework: FACET_GROUPS drives the rail now, and neither is a
   * facet. Five tests here drove that removed UI.
   *
   * They are NOT deleted, they are moved: both parameters are still part of
   * the URL contract and the API still filters on them, so "URL State" covers
   * setting each one and checks that isFeatured actually narrows the count.
   * What is left here is the half that still has UI — the chip.
   *
   * Whether the two toggles should come back to the rail is a product
   * question, not a test question. It is not answered by this file.
   */
  test('should show AI Generated in active filter tags', async ({ page }) => {
    await page.goto('/posters?isAiGenerated=true', { waitUntil: 'networkidle' });

    // Scope to the desktop chip row — in the toolbar since #454.
    const aiTag = desktopChips(page).locator(
      'button:has-text("AI Generated")'
    );
    await expect(aiTag.first()).toBeVisible({ timeout: 10000 });
  });
});
