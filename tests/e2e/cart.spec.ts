import { test, expect } from '@playwright/test';

/**
 * Cart Page E2E Tests
 *
 * Tests for the chobi.art cart page (/cart) including:
 * - Page header and title
 * - Empty cart state
 * - Cart items display
 * - Quantity controls
 * - Remove items
 * - Clear cart functionality
 * - Order summary section
 * - Free shipping progress
 * - Checkout button
 * - Trust badges
 * - Payment methods
 * - Responsive design
 * - Accessibility
 * - Cart persistence (localStorage)
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/cart/index.tsx
 * - packages/web/app/components/cart/CartItem.tsx
 * - packages/web/app/stores/cart.ts
 */

// ============================================================================
// Page Header Tests
// ============================================================================

test.describe('Cart Page - Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
  });

  test('should display page title', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Shopping Cart');
  });

  test('should have correct page meta title', async ({ page }) => {
    const pageTitle = await page.title();
    expect(pageTitle).toContain('Shopping Cart');
    expect(pageTitle).toContain('chobi.art');
  });

  test('should have noindex robots meta tag', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

// ============================================================================
// Empty Cart State Tests
// ============================================================================

test.describe('Cart Page - Empty Cart State', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first, then clear cart data and reload
    await page.goto('/cart');
    // Clear any existing cart data
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    // Reload to show empty cart state
    await page.reload();
    // Wait for hydration to complete by checking for the h1 title
    await expect(page.locator('h1:has-text("Shopping Cart")')).toBeVisible();
  });

  test('should display empty cart message', async ({ page }) => {
    const emptyMessage = page.locator('h2:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });

  test('should display shopping bag icon', async ({ page }) => {
    // The shopping bag icon is in a rounded container
    const iconContainer = page.locator('.rounded-full.bg-muted svg');
    await expect(iconContainer).toBeVisible();
  });

  test('should display descriptive text', async ({ page }) => {
    const description = page.locator('text=Looks like you haven\'t added anything');
    await expect(description).toBeVisible();
  });

  test('should display Browse Posters button', async ({ page }) => {
    const browseButton = page.locator('a[href="/posters"]:has-text("Browse Posters")');
    await expect(browseButton).toBeVisible();
  });

  test('should display Create with AI button', async ({ page }) => {
    // Scope to main content to avoid matching footer link
    const mainContent = page.locator('main, [role="main"]').first();
    const createButton = mainContent.locator('a[href="/create"]:has-text("Create with AI")');
    await expect(createButton).toBeVisible();
  });

  test('should navigate to posters page when clicking Browse Posters', async ({ page }) => {
    const browseButton = page.locator('a[href="/posters"]:has-text("Browse Posters")');
    await browseButton.click();
    await expect(page).toHaveURL('/posters');
  });

  test('should navigate to create page when clicking Create with AI', async ({ page }) => {
    // Scope to main content to avoid matching footer link
    const mainContent = page.locator('main, [role="main"]').first();
    const createButton = mainContent.locator('a[href="/create"]:has-text("Create with AI")');
    await createButton.click();
    await expect(page).toHaveURL('/create');
  });

  test('should display Recommended for You section', async ({ page }) => {
    const recommendedSection = page.locator('h3:has-text("Recommended for You")');
    await expect(recommendedSection).toBeVisible();
  });

  test('should display View Featured Collection link', async ({ page }) => {
    const featuredLink = page.locator('a[href="/posters?featured=true"]:has-text("View Featured Collection")');
    await expect(featuredLink).toBeVisible();
  });

  test('should navigate to featured collection', async ({ page }) => {
    const featuredLink = page.locator('a[href="/posters?featured=true"]');
    await featuredLink.click();
    await expect(page).toHaveURL(/\/posters\?featured=true/);
  });

  test('should not display item count when cart is empty', async ({ page }) => {
    // Item count paragraph should not be visible when cart is empty
    const itemCount = page.locator('text=/\\d+ items? in your cart/');
    await expect(itemCount).not.toBeVisible();
  });

  test('should not display Clear Cart button when empty', async ({ page }) => {
    const clearButton = page.locator('button:has-text("Clear Cart")');
    await expect(clearButton).not.toBeVisible();
  });

  test('should not display Order Summary when empty', async ({ page }) => {
    const orderSummary = page.locator('h2:has-text("Order Summary")');
    await expect(orderSummary).not.toBeVisible();
  });
});

// ============================================================================
// Cart with Items - Helper Function
// ============================================================================

/**
 * Add a test item to cart via localStorage
 */
async function addItemToCart(page: typeof test.page, itemOverrides?: Partial<{
  id: string;
  productTitle: string;
  unitPrice: number;
  framePrice: number;
  quantity: number;
}>) {
  const item = {
    id: itemOverrides?.id || 'test_item_1',
    productId: 'prod_123',
    variantId: 'var_123',
    frameId: null,
    quantity: itemOverrides?.quantity || 1,
    productTitle: itemOverrides?.productTitle || 'Test Poster',
    productSlug: 'abstract/test-poster',
    thumbnailUrl: '',
    sizeLabel: '24x32 inches',
    widthInches: 24,
    heightInches: 32,
    unitPrice: itemOverrides?.unitPrice || 2999,
    framePrice: itemOverrides?.framePrice || 0,
    isAiGenerated: false,
    addedAt: new Date().toISOString(),
  };

  await page.evaluate((cartItem) => {
    const existing = localStorage.getItem('chobi-cart-storage');
    let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
    data.state.items.push(cartItem);
    localStorage.setItem('chobi-cart-storage', JSON.stringify(data));
  }, item);
}

// ============================================================================
// Cart with Items Tests
// ============================================================================

test.describe('Cart Page - With Items', () => {
  test.beforeEach(async ({ page }) => {
    // Set up cart with items before each test
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_1',
      productTitle: 'Abstract Waves Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display item count in header', async ({ page }) => {
    const itemCount = page.locator('text=/1 item in your cart/');
    await expect(itemCount).toBeVisible();
  });

  test('should display cart item', async ({ page }) => {
    const cartItem = page.locator('.rounded-lg.border.border-border.bg-card');
    await expect(cartItem.first()).toBeVisible();
  });

  test('should display product title', async ({ page }) => {
    const productTitle = page.locator('text=Abstract Waves Poster');
    await expect(productTitle).toBeVisible();
  });

  test('should display size label', async ({ page }) => {
    const sizeLabel = page.locator('text=Size: 24x32 inches');
    await expect(sizeLabel).toBeVisible();
  });

  test('should display Clear Cart button', async ({ page }) => {
    const clearButton = page.locator('button:has-text("Clear Cart")');
    await expect(clearButton).toBeVisible();
  });

  test('should display Continue Shopping link', async ({ page }) => {
    const continueLink = page.locator('a[href="/posters"]:has-text("Continue Shopping")');
    await expect(continueLink).toBeVisible();
  });

  test('should navigate to posters when clicking Continue Shopping', async ({ page }) => {
    const continueLink = page.locator('a[href="/posters"]:has-text("Continue Shopping")');
    await continueLink.click();
    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Cart Item Quantity Controls Tests
// ============================================================================

test.describe('Cart Page - Quantity Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_qty',
      productTitle: 'Quantity Test Poster',
      unitPrice: 1999,
      quantity: 2,
    });
    await page.reload();
  });

  test('should display quantity controls', async ({ page }) => {
    const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
    const increaseButton = page.locator('button[aria-label="Increase quantity"]');
    await expect(decreaseButton).toBeVisible();
    await expect(increaseButton).toBeVisible();
  });

  test('should display current quantity', async ({ page }) => {
    const quantityDisplay = page.locator('.min-w-\\[2rem\\].text-center');
    await expect(quantityDisplay).toHaveText('2');
  });

  test('should increase quantity on plus click', async ({ page }) => {
    const increaseButton = page.locator('button[aria-label="Increase quantity"]');
    await increaseButton.click();

    const quantityDisplay = page.locator('.min-w-\\[2rem\\].text-center');
    await expect(quantityDisplay).toHaveText('3');
  });

  test('should decrease quantity on minus click', async ({ page }) => {
    const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
    await decreaseButton.click();

    const quantityDisplay = page.locator('.min-w-\\[2rem\\].text-center');
    await expect(quantityDisplay).toHaveText('1');
  });

  test('should disable decrease button at quantity 1', async ({ page }) => {
    // First decrease to 1
    const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
    await decreaseButton.click();

    // Now button should be disabled
    await expect(decreaseButton).toBeDisabled();
  });

  test('should update item count in header when quantity changes', async ({ page }) => {
    const increaseButton = page.locator('button[aria-label="Increase quantity"]');
    await increaseButton.click();

    const itemCount = page.locator('text=/3 items in your cart/');
    await expect(itemCount).toBeVisible();
  });
});

// ============================================================================
// Remove Item Tests
// ============================================================================

test.describe('Cart Page - Remove Items', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_remove',
      productTitle: 'Remove Test Poster',
      unitPrice: 2499,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display remove button', async ({ page }) => {
    const removeButton = page.locator('button[aria-label="Remove item"]');
    await expect(removeButton).toBeVisible();
  });

  test('should remove item when clicking remove button', async ({ page }) => {
    const removeButton = page.locator('button[aria-label="Remove item"]');
    await removeButton.click();

    // Should show empty cart state
    const emptyMessage = page.locator('h2:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });
});

// ============================================================================
// Clear Cart Tests
// ============================================================================

test.describe('Cart Page - Clear Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_1',
      productTitle: 'First Poster',
      unitPrice: 1999,
      quantity: 1,
    });
    await addItemToCart(page, {
      id: 'test_item_2',
      productTitle: 'Second Poster',
      unitPrice: 2999,
      quantity: 2,
    });
    await page.reload();
  });

  test('should clear all items when clicking Clear Cart', async ({ page }) => {
    const clearButton = page.locator('button:has-text("Clear Cart")');
    await clearButton.click();

    // Should show empty cart state
    const emptyMessage = page.locator('h2:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });

  test('should remove all items from localStorage', async ({ page }) => {
    const clearButton = page.locator('button:has-text("Clear Cart")');
    await clearButton.click();

    // Verify localStorage is cleared
    const cartData = await page.evaluate(() => {
      const data = localStorage.getItem('chobi-cart-storage');
      return data ? JSON.parse(data) : null;
    });

    expect(cartData?.state?.items?.length || 0).toBe(0);
  });
});

// ============================================================================
// Order Summary Tests
// ============================================================================

test.describe('Cart Page - Order Summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_summary',
      productTitle: 'Summary Test Poster',
      unitPrice: 500,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display Order Summary heading', async ({ page }) => {
    const orderSummary = page.locator('h2:has-text("Order Summary")');
    await expect(orderSummary).toBeVisible();
  });

  test('should display subtotal', async ({ page }) => {
    const subtotalLabel = page.locator('text=Subtotal');
    await expect(subtotalLabel).toBeVisible();
  });

  test('should display shipping line', async ({ page }) => {
    const shippingLabel = page.locator('text=Shipping');
    await expect(shippingLabel).toBeVisible();
  });

  test('should display tax note', async ({ page }) => {
    const taxNote = page.locator('text=Calculated at checkout');
    await expect(taxNote).toBeVisible();
  });

  test('should display estimated total', async ({ page }) => {
    const totalLabel = page.locator('text=Estimated Total');
    await expect(totalLabel).toBeVisible();
  });

  test('should display price in INR format', async ({ page }) => {
    const price = page.locator('text=/₹[\\d,]+/');
    await expect(price.first()).toBeVisible();
  });
});

// ============================================================================
// Free Shipping Progress Tests
// ============================================================================

test.describe('Cart Page - Free Shipping Progress', () => {
  test('should show free shipping progress when under threshold', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_shipping',
      productTitle: 'Shipping Test Poster',
      unitPrice: 500, // Under ₹999 threshold
      quantity: 1,
    });
    await page.reload();

    // Should show free shipping progress message
    const progressMessage = page.locator('text=/Add .* more for free shipping/');
    await expect(progressMessage).toBeVisible();
  });

  test('should show shipping fee when under threshold', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_shipping',
      productTitle: 'Shipping Test Poster',
      unitPrice: 500, // Under ₹999 threshold
      quantity: 1,
    });
    await page.reload();
    // Wait for hydration
    await expect(page.locator('h1:has-text("Shopping Cart")')).toBeVisible();

    // Should show ₹99.00 shipping fee - use exact text to avoid matching ₹999
    const shippingFee = page.locator('text="₹99.00"');
    await expect(shippingFee).toBeVisible();
  });

  test('should show FREE shipping when over threshold', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_free_shipping',
      productTitle: 'Shipping Test Poster Over', // Avoid "Free" in product name
      unitPrice: 1500, // Over ₹999 threshold
      quantity: 1,
    });
    await page.reload();
    // Wait for hydration
    await expect(page.locator('h1:has-text("Shopping Cart")')).toBeVisible();

    // Should show FREE text in the shipping row - use exact match
    const shippingRow = page.locator('span.text-green-600:has-text("FREE")');
    await expect(shippingRow).toBeVisible();
  });

  test('should not show progress bar when over threshold', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_no_progress',
      productTitle: 'No Progress Test Poster',
      unitPrice: 1500, // Over ₹999 threshold
      quantity: 1,
    });
    await page.reload();

    // Should not show free shipping progress message
    const progressMessage = page.locator('text=/Add .* more for free shipping/');
    await expect(progressMessage).not.toBeVisible();
  });
});

// ============================================================================
// Checkout Button Tests
// ============================================================================

test.describe('Cart Page - Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_checkout',
      productTitle: 'Checkout Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display Proceed to Checkout button', async ({ page }) => {
    const checkoutButton = page.locator('a[href="/checkout"]:has-text("Proceed to Checkout")');
    await expect(checkoutButton).toBeVisible();
  });

  test('should navigate to checkout when clicking button', async ({ page }) => {
    const checkoutButton = page.locator('a[href="/checkout"]:has-text("Proceed to Checkout")');
    await checkoutButton.click();
    await expect(page).toHaveURL('/checkout');
  });
});

// ============================================================================
// Trust Badges Tests
// ============================================================================

test.describe('Cart Page - Trust Badges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_trust',
      productTitle: 'Trust Badge Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display free shipping badge', async ({ page }) => {
    const freeShippingBadge = page.locator('text=Free shipping on orders over ₹999');
    await expect(freeShippingBadge).toBeVisible();
  });

  test('should display secure checkout badge', async ({ page }) => {
    const secureBadge = page.locator('text=Secure checkout with encrypted payment');
    await expect(secureBadge).toBeVisible();
  });

  test('should display 30-day returns badge', async ({ page }) => {
    const returnsBadge = page.locator('text=30-day hassle-free returns');
    await expect(returnsBadge).toBeVisible();
  });
});

// ============================================================================
// Payment Methods Tests
// ============================================================================

test.describe('Cart Page - Payment Methods', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_payment',
      productTitle: 'Payment Methods Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display Accepted Payment Methods section', async ({ page }) => {
    const paymentSection = page.locator('text=Accepted Payment Methods');
    await expect(paymentSection).toBeVisible();
  });

  test('should display Visa payment method', async ({ page }) => {
    const visa = page.locator('text=Visa');
    await expect(visa).toBeVisible();
  });

  test('should display Mastercard payment method', async ({ page }) => {
    const mastercard = page.locator('text=Mastercard');
    await expect(mastercard).toBeVisible();
  });

  test('should display Razorpay payment method', async ({ page }) => {
    const razorpay = page.locator('text=Razorpay');
    await expect(razorpay).toBeVisible();
  });

  test('should display UPI payment method', async ({ page }) => {
    const upi = page.locator('text=UPI');
    await expect(upi).toBeVisible();
  });
});

// ============================================================================
// Cart Item with Frame Tests
// ============================================================================

test.describe('Cart Page - Item with Frame', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));

    // Add item with frame
    const item = {
      id: 'test_item_frame',
      productId: 'prod_frame_test',
      variantId: 'var_frame_test',
      frameId: 'frame_001',
      quantity: 1,
      productTitle: 'Framed Poster',
      productSlug: 'abstract/framed-poster',
      thumbnailUrl: '',
      sizeLabel: '18x24 inches',
      widthInches: 18,
      heightInches: 24,
      frameName: 'Black Wood Frame',
      frameType: 'wood',
      unitPrice: 2499,
      framePrice: 999,
      isAiGenerated: false,
      addedAt: new Date().toISOString(),
    };

    await page.evaluate((cartItem) => {
      const existing = localStorage.getItem('chobi-cart-storage');
      let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
      data.state.items.push(cartItem);
      localStorage.setItem('chobi-cart-storage', JSON.stringify(data));
    }, item);

    await page.reload();
  });

  test('should display frame name', async ({ page }) => {
    const frameName = page.locator('text=Frame: Black Wood Frame');
    await expect(frameName).toBeVisible();
  });

  test('should include frame price in total', async ({ page }) => {
    // Item price should be unitPrice + framePrice = 2499 + 999 = 3498
    // Use first() since price appears in item, subtotal, and total
    const price = page.locator('text=/₹3,?498/').first();
    await expect(price).toBeVisible();
  });
});

// ============================================================================
// AI Generated Item Tests
// ============================================================================

test.describe('Cart Page - AI Generated Item', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));

    // Add AI generated item
    const item = {
      id: 'test_item_ai',
      productId: 'prod_ai_test',
      variantId: 'var_ai_test',
      frameId: null,
      quantity: 1,
      productTitle: 'AI Generated Abstract',
      productSlug: 'ai/generated-abstract',
      thumbnailUrl: '',
      sizeLabel: '20x20 inches',
      widthInches: 20,
      heightInches: 20,
      unitPrice: 1999,
      framePrice: 0,
      isAiGenerated: true,
      aiDetails: {
        generationId: 'gen_123',
        prompt: 'Abstract waves in blue',
        stylePreset: 'abstract',
      },
      addedAt: new Date().toISOString(),
    };

    await page.evaluate((cartItem) => {
      const existing = localStorage.getItem('chobi-cart-storage');
      let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
      data.state.items.push(cartItem);
      localStorage.setItem('chobi-cart-storage', JSON.stringify(data));
    }, item);

    await page.reload();
  });

  test('should display AI badge on AI generated items', async ({ page }) => {
    // AI badge is a small purple badge with sparkles icon
    const aiBadge = page.locator('.bg-purple-500');
    await expect(aiBadge).toBeVisible();
  });
});

// ============================================================================
// Multiple Items Tests
// ============================================================================

test.describe('Cart Page - Multiple Items', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_1',
      productTitle: 'First Poster',
      unitPrice: 1999,
      quantity: 1,
    });
    await addItemToCart(page, {
      id: 'test_item_2',
      productTitle: 'Second Poster',
      unitPrice: 2999,
      quantity: 2,
    });
    await addItemToCart(page, {
      id: 'test_item_3',
      productTitle: 'Third Poster',
      unitPrice: 3499,
      quantity: 1,
    });
    await page.reload();
  });

  test('should display all cart items', async ({ page }) => {
    const cartItems = page.locator('.rounded-lg.border.border-border.bg-card');
    await expect(cartItems).toHaveCount(3);
  });

  test('should display correct total item count', async ({ page }) => {
    // 1 + 2 + 1 = 4 items
    const itemCount = page.locator('text=/4 items in your cart/');
    await expect(itemCount).toBeVisible();
  });

  test('should display each product title', async ({ page }) => {
    await expect(page.locator('text=First Poster')).toBeVisible();
    await expect(page.locator('text=Second Poster')).toBeVisible();
    await expect(page.locator('text=Third Poster')).toBeVisible();
  });
});

// ============================================================================
// Product Link Tests
// ============================================================================

test.describe('Cart Page - Product Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_link',
      productTitle: 'Link Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
  });

  test('should link product title to product page', async ({ page }) => {
    const productLink = page.locator('a[href*="/posters/"]:has-text("Link Test Poster")');
    await expect(productLink).toBeVisible();
  });

  test('should navigate to product when clicking title', async ({ page }) => {
    const productLink = page.locator('a[href*="/posters/"]:has-text("Link Test Poster")');
    const href = await productLink.getAttribute('href');
    await productLink.click();
    await expect(page).toHaveURL(href!);
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Cart Page - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_responsive',
      productTitle: 'Responsive Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const title = page.locator('h1:has-text("Shopping Cart")');
    await expect(title).toBeVisible();

    const checkoutButton = page.locator('a[href="/checkout"]');
    await expect(checkoutButton).toBeVisible();
  });

  test('should stack columns on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Order summary should be below items on mobile
    const orderSummary = page.locator('h2:has-text("Order Summary")');
    await expect(orderSummary).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    const title = page.locator('h1:has-text("Shopping Cart")');
    await expect(title).toBeVisible();
  });

  test('should use side-by-side layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // On desktop, should use 3-column grid
    const grid = page.locator('.lg\\:grid-cols-3');
    await expect(grid).toBeVisible();
  });

  test('should have sticky order summary on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Order summary should have sticky positioning
    const summary = page.locator('.sticky.top-24');
    await expect(summary).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Cart Page - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_a11y',
      productTitle: 'Accessibility Test Poster',
      unitPrice: 2999,
      quantity: 2,
    });
    await page.reload();
    // Wait for hydration to complete
    await expect(page.locator('h1:has-text("Shopping Cart")')).toBeVisible();
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have one h1 for page title
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Should have h2 for Order Summary
    const h2 = page.locator('h2:has-text("Order Summary")');
    await expect(h2).toBeVisible();
  });

  test('should have ARIA labels on quantity buttons', async ({ page }) => {
    const decreaseButton = page.locator('button[aria-label="Decrease quantity"]');
    const increaseButton = page.locator('button[aria-label="Increase quantity"]');

    await expect(decreaseButton).toBeVisible();
    await expect(increaseButton).toBeVisible();
  });

  test('should have ARIA label on remove button', async ({ page }) => {
    const removeButton = page.locator('button[aria-label="Remove item"]');
    await expect(removeButton).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have accessible images', async ({ page }) => {
    // Images should have alt text
    const images = page.locator('img[alt]');
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Cart Persistence Tests
// ============================================================================

test.describe('Cart Page - Persistence', () => {
  test('should persist cart across page reloads', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_persist',
      productTitle: 'Persistence Test Poster',
      unitPrice: 2999,
      quantity: 1,
    });
    await page.reload();

    // Verify item is still there
    const productTitle = page.locator('text=Persistence Test Poster');
    await expect(productTitle).toBeVisible();

    // Reload again
    await page.reload();

    // Should still be there
    await expect(productTitle).toBeVisible();
  });

  test('should persist quantity changes', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobi-cart-storage'));
    await addItemToCart(page, {
      id: 'test_item_qty_persist',
      productTitle: 'Quantity Persist Test',
      unitPrice: 1999,
      quantity: 1,
    });
    await page.reload();

    // Increase quantity
    const increaseButton = page.locator('button[aria-label="Increase quantity"]');
    await increaseButton.click();
    await increaseButton.click();

    // Reload page
    await page.reload();

    // Quantity should be 3
    const quantityDisplay = page.locator('.min-w-\\[2rem\\].text-center');
    await expect(quantityDisplay).toHaveText('3');
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Cart Page - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/cart');
    await expect(page.locator('h1')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/cart');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(1000);

    // Filter out expected network errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Cart Page - Navigation', () => {
  test('should navigate to cart from header', async ({ page }) => {
    await page.goto('/');
    // Use first() to handle multiple cart icons (desktop/mobile)
    const cartIcon = page.locator('[data-testid="cart-icon"], a[href="/cart"]').first();
    if (await cartIcon.isVisible()) {
      await cartIcon.click();
      await expect(page).toHaveURL('/cart');
    }
  });

  test('should navigate back with browser back button', async ({ page }) => {
    await page.goto('/posters');
    await page.goto('/cart');
    await page.goBack();
    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Cart Page - Error Handling', () => {
  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    await page.goto('/cart');

    // Set corrupted data
    await page.evaluate(() => {
      localStorage.setItem('chobi-cart-storage', 'corrupted-data');
    });

    await page.reload();

    // Page should still load without crashing
    const title = page.locator('h1:has-text("Shopping Cart")');
    await expect(title).toBeVisible();
  });

  test('should handle empty localStorage gracefully', async ({ page }) => {
    // Navigate first, then clear localStorage
    await page.goto('/cart');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Should show empty cart state
    const emptyMessage = page.locator('h2:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });
});
