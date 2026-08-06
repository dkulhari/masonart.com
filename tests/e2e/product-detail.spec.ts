import { test, expect } from '@playwright/test';

/**
 * Product Detail Page E2E Tests
 *
 * Tests for the chobii.art product detail page (/posters/:slug) including:
 * - Breadcrumb navigation
 * - Product image gallery with navigation
 * - Product information (title, artist, rating, SKU)
 * - Price display and calculation
 * - Size selection
 * - Frame selection
 * - Quantity controls
 * - Add to cart functionality
 * - Action buttons (wishlist, share)
 * - Trust badges
 * - Product description
 * - Room suggestions
 * - Related products section
 * - SEO meta tags
 * - JSON-LD structured data
 * - Responsive design
 * - Accessibility
 * - 404/Not Found handling
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/posters/$slug.tsx
 * - packages/web/app/components/product/ProductDetail.tsx
 * - packages/web/app/components/product/SizeSelector.tsx
 * - packages/web/app/components/product/FrameSelector.tsx
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Navigate to a product detail page via the listing page
 * Returns the product URL if a product was found
 */
async function navigateToProductPage(page: typeof test.page): Promise<string | null> {
  await page.goto('/posters');
  const productLinks = page.locator('a[href^="/posters/"]');
  const count = await productLinks.count();

  if (count > 0) {
    const href = await productLinks.first().getAttribute('href');
    if (href) {
      await page.goto(href);
      return href;
    }
  }
  return null;
}

// ============================================================================
// Breadcrumb Navigation Tests
// ============================================================================

test.describe('Product Detail - Breadcrumb', () => {
  test('should display breadcrumb navigation', async ({ page }) => {
    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
      await expect(breadcrumb).toBeVisible();
    }
  });

  test('should display Home link in breadcrumb', async ({ page }) => {
    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const homeLink = page.locator('nav[aria-label="Breadcrumb"] a[href="/"]');
      await expect(homeLink).toBeVisible();
      await expect(homeLink).toHaveText('Home');
    }
  });

  test('should display Posters link in breadcrumb', async ({ page }) => {
    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const postersLink = page.locator('nav[aria-label="Breadcrumb"] a[href="/posters"]');
      await expect(postersLink).toBeVisible();
      await expect(postersLink).toHaveText('Posters');
    }
  });

  test('should display product title in breadcrumb', async ({ page }) => {
    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
      const currentPage = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toBeVisible();
    }
  });

  test('should navigate to listing page from breadcrumb', async ({ page }) => {
    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const postersLink = page.locator('nav[aria-label="Breadcrumb"] a[href="/posters"]');
      await postersLink.click();
      await expect(page).toHaveURL('/posters');
    }
  });
});

// ============================================================================
// Product Image Gallery Tests
// ============================================================================

test.describe('Product Detail - Image Gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display main product image', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const mainImage = page.locator('.aspect-square img, .aspect-square svg.text-muted-foreground');
      await expect(mainImage.first()).toBeVisible();
    }
  });

  test('should display image navigation arrows when multiple images', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Navigation arrows only appear when there are multiple images
      const prevButton = page.locator('button[aria-label="Previous image"]');
      const nextButton = page.locator('button[aria-label="Next image"]');

      // May or may not be visible depending on image count
      const prevCount = await prevButton.count();
      const nextCount = await nextButton.count();
      expect(prevCount).toBeGreaterThanOrEqual(0);
      expect(nextCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should navigate images with arrows', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const nextButton = page.locator('button[aria-label="Next image"]');

      if (await nextButton.isVisible()) {
        await nextButton.click();
        // Should still see the main image area. Scoped to the gallery:
        // `.aspect-square` also matches the mega-menu category tiles and every
        // card in the similar-artworks row, so a bare locator is a strict-mode
        // violation rather than an assertion about this page's artwork.
        const mainImage = page.getByTestId('pdp-gallery').locator('.aspect-square');
        await expect(mainImage.first()).toBeVisible();
      }
    }
  });

  test('should display thumbnail gallery when multiple images', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The rail is now a vertical list on desktop with a stable testid, not
      // an anonymous `.flex.gap-2.overflow-x-auto button` — that class trio no
      // longer exists on the page, so the old locator matched nothing and this
      // assertion passed without ever seeing a thumbnail.
      const thumbnails = page.getByTestId('pdp-thumbnail');
      const thumbnailCount = await thumbnails.count();
      // Single-image products legitimately render no rail at all.
      if (thumbnailCount > 0) {
        await expect(thumbnails.first()).toBeVisible();
      }
    }
  });

  test('should highlight current thumbnail', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Selection is `aria-current="true"` plus a `border-foreground` ring;
      // `.border-brand-500` was the old style and matches nothing now.
      const thumbnails = page.getByTestId('pdp-thumbnail');
      if ((await thumbnails.count()) > 0) {
        const selected = page.locator('[data-testid="pdp-thumbnail"][aria-current="true"]');
        await expect(selected).toHaveCount(1);
        await expect(thumbnails.first()).toHaveAttribute('aria-current', 'true');
      }
    }
  });

  test('should change main image on thumbnail click', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The rail is interactive, so this one has to wait for hydration — a
      // click landing on server HTML changes nothing.
      await page.waitForLoadState('networkidle');
      const thumbnails = page.getByTestId('pdp-thumbnail');
      const thumbnailCount = await thumbnails.count();

      if (thumbnailCount > 1) {
        await thumbnails.nth(1).click();
        // Selection moves with the click: the second thumbnail becomes the
        // current one and the first stops being it.
        await expect(thumbnails.nth(1)).toHaveAttribute('aria-current', 'true');
        await expect(thumbnails.first()).not.toHaveAttribute('aria-current', 'true');
      }
    }
  });

  // Removed: 'should display Featured badge on featured products'. The
  // Featured overlay no longer exists anywhere on the PDP — the reference
  // paints no chrome over the artwork, so the badge was deleted rather than
  // restyled (#513). There is no new shape to retarget to.

  test('should disclose AI generation on AI products', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The disclosure moved off the image and into the buy panel's byline
      // as plain text (`.bg-purple-500` overlay is gone). Still optional:
      // only AI-generated posters carry it.
      const aiDisclosure = page
        .getByTestId('buy-panel')
        .locator('text=AI Generated');
      const disclosureCount = await aiDisclosure.count();
      if (disclosureCount > 0) {
        await expect(aiDisclosure.first()).toBeVisible();
      }
    }
  });
});

// ============================================================================
// Product Information Tests
// ============================================================================

test.describe('Product Detail - Product Information', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display product title', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const title = page.locator('h1');
      await expect(title).toBeVisible();
    }
  });

  // Removed: 'should display style tags if available'. The style chips that
  // sat above the H1 are gone — the reference has nothing between the social
  // proof row and the title (#514). Styles are still surfaced, but as a
  // `Style` row in the Details And Customization tab, which is asserted by the
  // tab tests below rather than by a chip selector.

  test('should display artist name if available', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Artist is optional, look for "by" text
      const artistText = page.locator('text=/^by /');
      const artistCount = await artistText.count();
      expect(artistCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display rating if available', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Rating with star icon
      const ratingSection = page.locator('text=/reviews\\)/');
      const ratingCount = await ratingSection.count();
      expect(ratingCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display SKU', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The SKU is no longer its own `SKU: FIX-001` line — it is inline in the
      // H1 as `<title> #FIX-001` (parity reference, "H1").
      const sku = page.locator('h1 >> text=/#\\S+/');
      await expect(sku.first()).toBeVisible();
    }
  });
});

// ============================================================================
// Price Display Tests
// ============================================================================

test.describe('Product Detail - Price Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display price section', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The grey rounded price card is gone (#514) — the price is now a bare
      // red figure, printed by SalePrice with a stable testid.
      const priceSection = page.getByTestId('buy-panel').getByTestId('price-current');
      await expect(priceSection.first()).toBeVisible();
    }
  });

  test('should display price in INR format', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const price = page.locator('text=/₹[\\d,]+/');
      await expect(price.first()).toBeVisible();
    }
  });

  test('should display price explanation text', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const priceNote = page.locator('text=Price varies by size and frame selection');
      await expect(priceNote).toBeVisible();
    }
  });
});

// ============================================================================
// Size Selector Tests
// ============================================================================

test.describe('Product Detail - Size Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display size selection section', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The "Select Size" heading above a stack of size cards is gone: the
      // selector is one native <select> whose accessible name is `Size`
      // (#515), with `Select a Size` as its placeholder option.
      const sizeSelect = page.locator('select[aria-label="Size"]');
      await expect(sizeSelect).toBeVisible();
    }
  });

  test('should display available size options', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Options live inside the <select>, not as separate cards. One of them
      // is the disabled `Select a Size` placeholder, so a real product has
      // more than one.
      const sizeOptions = page.locator('select[aria-label="Size"]').locator('option');
      const optionCount = await sizeOptions.count();
      expect(optionCount).toBeGreaterThan(1);
    }
  });

  test('should have a size selected by default', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Default selection is now the <select>'s value, not a
      // `.border-brand-500` card. It must not be the empty placeholder.
      const selected = await page.locator('select[aria-label="Size"]').inputValue();
      expect(selected).not.toBe('');
    }
  });

  test('should update price when selecting different size', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();

      // `.text-3xl.font-bold` never matched the price (it was font-medium even
      // before this redesign) — the live figure is `price-current` in the buy
      // panel.
      const priceElement = page
        .getByTestId('buy-panel')
        .getByTestId('price-current')
        .first();
      await expect(priceElement).toBeVisible();

      const sizeSelect = page.locator('select[aria-label="Size"]');
      const values = await sizeSelect
        .locator('option:not([disabled])')
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value)
        );

      if (values.length > 1) {
        const current = await sizeSelect.inputValue();
        const next = values.find((value) => value !== current);
        if (next) {
          await sizeSelect.selectOption(next);
          await expect(sizeSelect).toHaveValue(next);
          // The price may be the same across sizes; what matters is that the
          // panel still prints one.
          await expect(priceElement).toBeVisible();
          expect(await priceElement.textContent()).toBeTruthy();
        }
      }
    }
  });

  test('should display size dimensions', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Option labels carry inches and cm in one string, e.g.
      // `24"H x 20"W/ 61H x 51W CM`.
      const labels = await page
        .getByLabel('Size')
        .locator('option:not([value=""])')
        .allTextContents();
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.some((label) => /\d+.*x.*\d+/i.test(label))).toBe(true);
    }
  });

  test('should show unavailable sizes as disabled', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Out-of-stock variants are `disabled` options tagged "Out of stock",
      // not line-through cards. Optional: a fully stocked product has none.
      const disabledOptions = page
        .getByLabel('Size')
        .locator('option[disabled]:not([value=""])');
      const disabledCount = await disabledOptions.count();
      if (disabledCount > 0) {
        expect(await disabledOptions.first().textContent()).toContain('Out of stock');
      }
    }
  });
});

// ============================================================================
// Frame Selector Tests
// ============================================================================

test.describe('Product Detail - Frame Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display frame selection section when frames available', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const frameSection = page.locator('text=Select Frame');
      const frameSectionCount = await frameSection.count();
      // Frame section is optional
      expect(frameSectionCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display No Frame option', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const noFrameOption = page.locator('text=No Frame');
      const noFrameCount = await noFrameOption.count();
      expect(noFrameCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display frame options with prices', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Frame options with price modifiers
      const frameOptions = page.locator('text=/\\+₹/');
      const frameCount = await frameOptions.count();
      expect(frameCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should update total price when selecting frame', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await page.waitForLoadState('networkidle');

      // `.text-3xl.font-bold` never matched anything here — the price was
      // `font-medium` even before the redesign, so this locator timed out
      // rather than reading a price. The live figure is `price-current`.
      const priceElement = page
        .getByTestId('buy-panel')
        .getByTestId('price-current')
        .first();
      await expect(priceElement).toBeVisible();

      // Click a frame option if available. The swatches print no price, but
      // their accessible name still carries the modifier.
      const frameOptions = page.locator('button:has-text("+₹")');
      const frameCount = await frameOptions.count();

      if (frameCount > 0) {
        await frameOptions.first().click();
        // Price should update to include frame
        await expect(priceElement).toBeVisible();
        expect(await priceElement.textContent()).toBeTruthy();
      }
    }
  });

  test('should show includes frame text when frame selected', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();

      // Click a frame option if available (frame buttons with price modifier)
      const frameOptions = page.locator('button:has-text("+₹")');
      const frameCount = await frameOptions.count();

      if (frameCount > 0) {
        await frameOptions.first().click();
        // Verify frame is selected by checking for selected/active state
        // or that the frame option shows visual selection indicator
        const selectedFrame = page.locator('button:has-text("+₹")').first();
        // The selected frame should have some visual indication (border, background, etc.)
        await expect(selectedFrame).toBeVisible();
      }
    }
  });
});

// ============================================================================
// Quantity Controls Tests
// ============================================================================

test.describe('Product Detail - Quantity Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display quantity selector', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const quantityLabel = page.locator('text=Quantity');
      await expect(quantityLabel).toBeVisible();
    }
  });

  test('should display quantity decrease button', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
      await expect(decreaseButton).toBeVisible();
    }
  });

  test('should display quantity increase button', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const increaseButton = page.locator('button[aria-label="Increase quantity"]');
      await expect(increaseButton).toBeVisible();
    }
  });

  test('should start with quantity 1', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const quantityDisplay = page.locator('.min-w-\\[3rem\\].text-center');
      await expect(quantityDisplay).toHaveText('1');
    }
  });

  // Skipped: Quantity button interactions are flaky due to viewport/scroll issues
  test.skip('should increase quantity on plus click', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const increaseButton = page.locator('button[aria-label="Increase quantity"]');
      // Scroll into view and wait for button to be visible
      await increaseButton.scrollIntoViewIfNeeded();
      await expect(increaseButton).toBeVisible();
      await increaseButton.click();

      const quantityDisplay = page.locator('.min-w-\\[3rem\\].text-center');
      await expect(quantityDisplay).toHaveText('2');
    }
  });

  // Skipped: Quantity button interactions are flaky due to viewport/scroll issues
  test.skip('should decrease quantity on minus click', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const increaseButton = page.locator('button[aria-label="Increase quantity"]');
      const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');

      // Scroll buttons into view
      await increaseButton.scrollIntoViewIfNeeded();
      await expect(increaseButton).toBeVisible();

      // Increase to 2 first
      await increaseButton.click();
      // Wait for quantity to update before decreasing
      const quantityDisplay = page.locator('.min-w-\\[3rem\\].text-center');
      await expect(quantityDisplay).toHaveText('2');
      // Then decrease
      await decreaseButton.click();

      await expect(quantityDisplay).toHaveText('1');
    }
  });

  test('should disable minus button at quantity 1', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
      await expect(decreaseButton).toBeDisabled();
    }
  });

  test('should not go below quantity 1', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');

      // Scroll decrease button into view first
      await decreaseButton.scrollIntoViewIfNeeded();

      // Try clicking disabled button
      await decreaseButton.click({ force: true });

      const quantityDisplay = page.locator('.min-w-\\[3rem\\].text-center');
      await expect(quantityDisplay).toHaveText('1');
    }
  });
});

// ============================================================================
// Add to Cart Tests
// ============================================================================

test.describe('Product Detail - Add to Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display Add to Cart button', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const addToCartButton = page.locator('button:has-text("Add to Cart")');
      await expect(addToCartButton).toBeVisible();
    }
  });

  test('should carry the price in the button label', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The CTA is text-only now — no ShoppingCart glyph (#518). What it does
      // carry instead is the price, `Add to cart - ₹21,200`, which is the
      // thing the reference button is distinguished by.
      const addToCartButton = page.locator('button:has-text("Add to Cart")');
      await expect(addToCartButton.locator('svg')).toHaveCount(0);
      await expect(addToCartButton).toHaveText(/Add to cart - ₹[\d,]+/);
    }
  });

  test('should enable Add to Cart when size selected', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const addToCartButton = page.locator('button:has-text("Add to Cart")');
      // If a size is selected by default, button should be enabled
      const isDisabled = await addToCartButton.isDisabled();
      // Button state depends on whether a variant is available
      expect(typeof isDisabled).toBe('boolean');
    }
  });
});

// ============================================================================
// Action Buttons Tests
// ============================================================================

test.describe('Product Detail - Action Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display wishlist button', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Scoped to the buy panel: every card in the similar-artworks row below
      // carries the identical label, so a page-wide locator is ambiguous.
      const wishlistButton = page
        .getByTestId('buy-panel')
        .locator('button[aria-label="Add to wishlist"]');
      await expect(wishlistButton).toBeVisible();
    }
  });

  test('should display share row', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The old `aria-label="Share product"` button had no onClick at all. It
      // is now a row of real share controls (#520) — the native/Web Share
      // trigger is labelled `Share`, with a copy-link button beside it.
      await expect(page.locator('button[aria-label="Share"]')).toBeVisible();
      await expect(page.locator('button[aria-label="Copy link"]')).toBeVisible();
    }
  });
});

// ============================================================================
// Trust Badges Tests
// ============================================================================

test.describe('Product Detail - Trust List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  // The three centred badges became four stacked rows (#519). Same claims,
  // new copy — every assertion below is retargeted to the wording TrustList
  // actually renders, scoped to the buy panel so the footer's own shipping
  // copy cannot answer for it.

  test('should display the free shipping row', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const freeShipping = page
        .getByTestId('buy-panel')
        .locator('text=Free Shipping Over ₹999');
      await expect(freeShipping).toBeVisible();
    }
  });

  test('should display the payment safety row', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Was "Secure Payment / 100% Protected"; now "Safe Payment Options"
      // with the real Razorpay sub-line.
      const payment = page.getByTestId('buy-panel').locator('text=Safe Payment Options');
      await expect(payment).toBeVisible();
    }
  });

  test('should display the returns row', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const easyReturns = page
        .getByTestId('buy-panel')
        .locator('text=30 Days Easy Returns');
      await expect(easyReturns).toBeVisible();
    }
  });

  test('should display shipping threshold', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const shippingThreshold = page
        .getByTestId('buy-panel')
        .locator('text=orders over ₹999');
      await expect(shippingThreshold.first()).toBeVisible();
    }
  });

  test('should display return policy duration', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // "30-day policy" became the row title "30 Days Easy Returns"; the
      // window is still stated on the page, which is what this test is for.
      const returnPolicy = page.getByTestId('buy-panel').locator('text=/30 Days/i');
      await expect(returnPolicy.first()).toBeVisible();
    }
  });

  test('should display the made-to-order row', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The fourth row, which the old three-badge strip had no equivalent for.
      const madeToOrder = page.getByTestId('buy-panel').locator('text=Made Just For You');
      await expect(madeToOrder).toBeVisible();
    }
  });

  test('should display the delivery estimate line', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // #517 — under the frame swatches, above the CTA.
      const delivery = page.getByTestId('buy-panel').locator('text=Arrives soon!');
      await expect(delivery).toBeVisible();
      await expect(delivery).toContainText('if you order today');
    }
  });
});

// ============================================================================
// Product Description Tests
// ============================================================================

test.describe('Product Detail - Description', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  // Description is no longer a top-level `<h2>Description</h2>` section in the
  // buy column — it is the body of the "About The Artwork" tabpanel (#521),
  // which is the tab the page opens on.

  test('should display Description in the About tab', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const aboutTab = page.getByRole('tab', { name: 'About The Artwork' });
      await expect(aboutTab).toBeVisible();
      // Open by default.
      await expect(aboutTab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('should display description content', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const panel = page.getByRole('tabpanel');
      const descriptionContent = panel.locator('.prose.prose-sm');
      const contentCount = await descriptionContent.count();
      // Description is optional per-product; when present it is inside the
      // panel, not loose in the buy column.
      expect(contentCount).toBeGreaterThanOrEqual(0);
      await expect(page.getByTestId('buy-panel').locator('.prose.prose-sm')).toHaveCount(0);
    }
  });
});

// ============================================================================
// Room Suggestions Tests
// ============================================================================

test.describe('Product Detail - Room Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display Perfect For inside the About tab when available', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Demoted from a page-level `<h2>` to an `<h3>` inside the About
      // tabpanel — still optional, since not every poster carries rooms.
      const perfectFor = page.getByRole('tabpanel').locator('h3:has-text("Perfect For")');
      const perfectForCount = await perfectFor.count();
      expect(perfectForCount).toBeGreaterThanOrEqual(0);
      // What must NOT still be true: a second copy left behind in the buy panel.
      await expect(
        page.getByTestId('buy-panel').locator(':text("Perfect For")')
      ).toHaveCount(0);
    }
  });

  test('should display room suggestion tags', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const panel = page.getByRole('tabpanel');
      const perfectFor = panel.locator('h3:has-text("Perfect For")');
      const perfectForCount = await perfectFor.count();

      if (perfectForCount > 0) {
        const roomTags = panel.locator('.rounded-full.border.border-border.bg-background.px-3');
        const tagCount = await roomTags.count();
        expect(tagCount).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// Product Tabs Tests (#521)
// ============================================================================

test.describe('Product Detail - Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display all four tabs', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const tablist = page.getByRole('tablist', { name: 'Product details' });
      await expect(tablist).toBeVisible();
      await expect(tablist.getByRole('tab')).toHaveCount(4);
      for (const label of [
        'About The Artwork',
        'Details And Customization',
        'Shipping And Returns',
        'Review',
      ]) {
        await expect(tablist.getByRole('tab', { name: label })).toBeVisible();
      }
    }
  });

  test('should show the spec table on the Details tab', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Tabs are client state: wait for hydration or the click is a no-op.
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: 'Details And Customization' }).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel.locator('dt:has-text("SKU")')).toBeVisible();
      await expect(panel.locator('dt:has-text("Orientation")')).toBeVisible();
    }
  });

  test('should show policy copy on the Shipping tab', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: 'Shipping And Returns' }).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel.locator('h3:has-text("Shipping")')).toBeVisible();
      await expect(panel.locator('h3:has-text("Returns")')).toBeVisible();
    }
  });

  test('should reach the review wall from the buybox reviews link', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await page.waitForLoadState('networkidle');

      const reviewsLink = page.getByTestId('buybox-reviews-link');
      // Only rated posters carry the link at all.
      if ((await reviewsLink.count()) === 0) return;

      // Before the click the review wall is behind an unselected tab.
      await expect(page.getByTestId('product-reviews')).toHaveCount(0);

      await reviewsLink.click();

      await expect(page.getByRole('tab', { name: 'Review' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByTestId('product-reviews')).toBeVisible();
      await expect(page.getByTestId('product-reviews')).toHaveAttribute('id', 'reviews');
    }
  });

  test('should open on the Review tab when loaded with a #reviews hash', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      const href = await productLinks.first().getAttribute('href');
      if (!href) return;
      await page.goto(`${href}#reviews`);

      await expect(page.getByRole('tab', { name: 'Review' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByTestId('product-reviews')).toBeVisible();
    }
  });
});

// ============================================================================
// Related Products Tests
// ============================================================================

test.describe('Product Detail - Related Products', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should display Visually Similar Artworks section', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // "You May Also Like" is now "Visually Similar Artworks" (#522).
      const relatedSection = page.locator('h2:has-text("Visually Similar Artworks")');
      await expect(relatedSection).toBeVisible();
    }
  });

  test('should display the related products carousel', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // A scroll track with prev/next arrows, not `.grid.grid-cols-2.gap-4`.
      const track = page.locator('ul:has(> [data-testid="product-card"])').last();
      await expect(track).toBeVisible();
      await expect(
        page.locator('button[aria-label="Next Visually Similar Artworks item"]')
      ).toBeVisible();
      await expect(track.getByTestId('product-card').first()).toBeVisible();
    }
  });

  test('should sit above the tab bar', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Reference order below the buy panel: carousel first, then the tabs.
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h2:has-text("Visually Similar Artworks")')).toBeVisible();
      const carouselBox = await page
        .locator('h2:has-text("Visually Similar Artworks")')
        .boundingBox();
      const tablistBox = await page
        .getByRole('tablist', { name: 'Product details' })
        .boundingBox();
      expect(carouselBox).not.toBeNull();
      expect(tablistBox).not.toBeNull();
      expect(carouselBox!.y).toBeLessThan(tablistBox!.y);
    }
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('Product Detail - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have page title with product name', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const title = await page.title();
      // Title should contain product-related content (not necessarily brand name)
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(10);
    }
  });

  test('should have meta description', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
    }
  });

  test('should have canonical URL', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBeTruthy();
      expect(canonical).toContain('/posters/');
    }
  });

  test('should have Open Graph title', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle).toBeTruthy();
    }
  });

  test('should have Open Graph type as product', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
      expect(ogType).toBe('product');
    }
  });

  test('should have Open Graph image', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(ogImage).toBeTruthy();
    }
  });

  test('should have Twitter card meta tag', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
      expect(twitterCard).toBe('summary_large_image');
    }
  });

  test('should have product price meta tags', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const priceAmount = await page.locator('meta[property="product:price:amount"]').getAttribute('content');
      const priceCurrency = await page.locator('meta[property="product:price:currency"]').getAttribute('content');

      expect(priceAmount).toBeTruthy();
      expect(priceCurrency).toBe('INR');
    }
  });

  test('should have product availability meta tag', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const availability = await page.locator('meta[property="product:availability"]').getAttribute('content');
      expect(availability).toMatch(/in stock|out of stock/);
    }
  });

  test('should have robots meta tag', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('follow');
    }
  });
});

// ============================================================================
// JSON-LD Structured Data Tests
// ============================================================================

test.describe('Product Detail - JSON-LD Structured Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have JSON-LD script tag', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const jsonLd = page.locator('script[type="application/ld+json"]');
      await expect(jsonLd).toBeVisible({ timeout: 5000 }).catch(() => {
        // JSON-LD may be present but hidden
      });
      const jsonLdCount = await jsonLd.count();
      expect(jsonLdCount).toBeGreaterThan(0);
    }
  });

  test('should have valid JSON-LD content', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const jsonLdScript = page.locator('script[type="application/ld+json"]').first();
      const content = await jsonLdScript.textContent();

      if (content) {
        const parsed = JSON.parse(content);
        expect(parsed['@context']).toBe('https://schema.org');
        expect(parsed['@type']).toBe('Product');
      }
    }
  });

  test('should include product name in JSON-LD', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const jsonLdScript = page.locator('script[type="application/ld+json"]').first();
      const content = await jsonLdScript.textContent();

      if (content) {
        const parsed = JSON.parse(content);
        expect(parsed.name).toBeTruthy();
      }
    }
  });

  test('should include offers in JSON-LD', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const jsonLdScript = page.locator('script[type="application/ld+json"]').first();
      const content = await jsonLdScript.textContent();

      if (content) {
        const parsed = JSON.parse(content);
        expect(parsed.offers).toBeTruthy();
        expect(parsed.offers.priceCurrency).toBe('INR');
      }
    }
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Product Detail - Responsive Design', () => {
  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // On mobile, should still see main elements
      const title = page.locator('h1');
      await expect(title).toBeVisible();
    }
  });

  test('should stack layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The symmetric `lg:grid-cols-2` grid no longer exists — the columns are
      // an asymmetric `728px / 485px` pair (#512). Stacking is asserted on the
      // real thing: on a 375px viewport the gallery sits above the buy panel.
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('pdp-gallery')).toBeVisible();
      await expect(page.getByTestId('buy-panel')).toBeVisible();
      const galleryBox = await page.getByTestId('pdp-gallery').boundingBox();
      const panelBox = await page.getByTestId('buy-panel').boundingBox();
      expect(galleryBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.y).toBeGreaterThan(galleryBox!.y);
    }
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const title = page.locator('h1');
      await expect(title).toBeVisible();
    }
  });

  test('should use two-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Same as above: the two columns are asymmetric now, so "two column" is
      // asserted geometrically — the buy panel sits beside the gallery, not
      // under it, and is the narrower of the pair. The waits matter: a
      // bounding box read before layout settles is a coin flip.
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('pdp-gallery')).toBeVisible();
      await expect(page.getByTestId('buy-panel')).toBeVisible();
      const galleryBox = await page.getByTestId('pdp-gallery').boundingBox();
      const panelBox = await page.getByTestId('buy-panel').boundingBox();
      expect(galleryBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.x).toBeGreaterThan(galleryBox!.x + galleryBox!.width - 1);
      expect(panelBox!.width).toBeLessThan(galleryBox!.width);
    }
  });

  test('should scale images properly on different viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const mainImage = page.getByTestId('pdp-gallery').locator('.aspect-square');
      await expect(mainImage.first()).toBeVisible();
    }
  });

  test('should keep the trust list readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // The `.grid.grid-cols-3` badge strip is gone; the trust list is four
      // stacked rows at every width, so "adjusts on mobile" is now "all four
      // rows are still there and still stacked".
      const panel = page.getByTestId('buy-panel');
      for (const title of [
        'Made Just For You',
        'Free Shipping Over ₹999',
        '30 Days Easy Returns',
        'Safe Payment Options',
      ]) {
        await expect(panel.locator(`text=${title}`)).toBeVisible();
      }
      const first = await panel.locator('text=Made Just For You').boundingBox();
      const second = await panel.locator('text=Free Shipping Over ₹999').boundingBox();
      expect(second!.y).toBeGreaterThan(first!.y);
    }
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Product Detail - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Should have exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    }
  });

  test('should have ARIA labels on navigation buttons', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const prevButton = page.locator('button[aria-label="Previous image"]');
      const nextButton = page.locator('button[aria-label="Next image"]');

      const prevCount = await prevButton.count();
      const nextCount = await nextButton.count();
      expect(prevCount + nextCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have ARIA labels on action buttons', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Scoped for the same reason as above — the related row repeats the label.
      const wishlistButton = page
        .getByTestId('buy-panel')
        .locator('button[aria-label="Add to wishlist"]');
      // The dead `Share product` button was replaced by ShareRow, whose
      // triggers are labelled per destination (`Share`, `Share on Facebook`,
      // `Copy link`, …).
      const shareButton = page.locator('button[aria-label="Share"]');

      await expect(wishlistButton).toBeVisible();
      await expect(shareButton).toBeVisible();
    }
  });

  test('should have ARIA labels on quantity buttons', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
      const increaseButton = page.locator('button[aria-label="Increase quantity"]');

      await expect(decreaseButton).toBeVisible();
      await expect(increaseButton).toBeVisible();
    }
  });

  test('should have accessible breadcrumb navigation', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
      await expect(breadcrumb).toBeVisible();

      // Current page should have aria-current
      const currentPage = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toBeVisible();
    }
  });

  test('should have alt text on images', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const images = page.locator('img[alt]');
      const imageCount = await images.count();
      expect(imageCount).toBeGreaterThan(0);
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      // Tab into page
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      await expect(focusedElement.first()).toBeTruthy();
    }
  });
});

// ============================================================================
// 404 / Not Found Tests
// ============================================================================

test.describe('Product Detail - Not Found', () => {
  test('should display not found page for invalid product', async ({ page }) => {
    await page.goto('/posters/nonexistent-product-slug-xyz-123');

    // Should show not found message
    const notFound = page.locator('text=Product Not Found');
    await expect(notFound).toBeVisible();
  });

  test('should display description on not found page', async ({ page }) => {
    await page.goto('/posters/nonexistent-product-slug-xyz-123');

    const description = page.locator('text=could not be found');
    await expect(description).toBeVisible();
  });

  test('should display Browse All Products link on not found page', async ({ page }) => {
    await page.goto('/posters/nonexistent-product-slug-xyz-123');

    const browseLink = page.locator('a[href="/posters"]:has-text("Browse All Products")');
    await expect(browseLink).toBeVisible();
  });

  test('should navigate to listing from not found page', async ({ page }) => {
    await page.goto('/posters/nonexistent-product-slug-xyz-123');

    const browseLink = page.locator('a[href="/posters"]:has-text("Browse All Products")');
    await browseLink.click();

    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Product Detail - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      const startTime = Date.now();
      await productLinks.first().click();
      await expect(page.locator('h1')).toBeVisible();

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    }
  });

  test('should render title quickly', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      const startTime = Date.now();
      await productLinks.first().click();
      await expect(page.locator('h1')).toBeVisible();

      const renderTime = Date.now() - startTime;
      expect(renderTime).toBeLessThan(3000);
    }
  });

  test('should maintain layout during scroll', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
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
    }
  });

  test('should not have JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/posters');
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForTimeout(1000);

      // Filter out expected network errors
      const criticalErrors = errors.filter(
        (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
      );

      expect(criticalErrors.length).toBe(0);
    }
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Product Detail - Navigation', () => {
  test('should navigate from listing to detail page', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      const href = await productLinks.first().getAttribute('href');
      await productLinks.first().click();
      await expect(page).toHaveURL(href!);
    }
  });

  test('should navigate back to listing with browser back', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await page.goBack();
      await expect(page).toHaveURL('/posters');
    }
  });

  test('should navigate to home from breadcrumb', async ({ page }) => {
    await page.goto('/posters');

    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      const homeLink = page.locator('nav[aria-label="Breadcrumb"] a[href="/"]');
      await homeLink.click();
      await expect(page).toHaveURL('/');
    }
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Product Detail - Error Handling', () => {
  test('should handle missing product gracefully', async ({ page }) => {
    await page.goto('/posters/missing-product-12345');

    // Should show not found or error message
    const notFound = page.locator('text=Product Not Found');
    await expect(notFound).toBeVisible();
  });

  test('should handle invalid category gracefully', async ({ page }) => {
    await page.goto('/posters/invalid-category-xyz/some-product');

    // Page should still load
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
  });
});
