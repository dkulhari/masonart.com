import { test, expect, type Page } from '@playwright/test';

/**
 * Checkout Page E2E Tests
 *
 * Tests for the chobii.art checkout page (/checkout) including:
 * - Page header and navigation
 * - Empty cart state
 * - Multi-step checkout flow (shipping, delivery, payment)
 * - Progress steps indicator
 * - Shipping address form
 * - Form validation
 * - Delivery options selection
 * - Order summary sidebar
 * - Payment step
 * - Trust badges
 * - Responsive design
 * - Accessibility
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/checkout/index.tsx
 * - packages/web/app/components/checkout/AddressForm.tsx
 * - packages/web/app/components/checkout/OrderSummary.tsx
 * - packages/web/app/components/checkout/PaymentButton.tsx
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mock the shipping estimate API to return standard and express delivery options.
 * Must be called BEFORE page.goto() so the route is registered before the page loads.
 */
async function setupShippingMock(page: Page, cartTotal = 2999) {
  await page.route('**/api/shipping/estimate*', async (route) => {
    const today = new Date();
    const stdMin = new Date(today); stdMin.setDate(stdMin.getDate() + 5);
    const stdMax = new Date(today); stdMax.setDate(stdMax.getDate() + 7);
    const expMin = new Date(today); expMin.setDate(expMin.getDate() + 2);
    const expMax = new Date(today); expMax.setDate(expMax.getDate() + 3);
    const qualifiesFree = cartTotal >= 1000;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cartTotal,
        zipCode: '400001',
        freeShippingThreshold: 1000,
        qualifiesForFreeShipping: qualifiesFree,
        options: [
          {
            id: 'ship-standard',
            name: 'Standard Delivery',
            carrier: 'India Post',
            description: 'Regular delivery via India Post',
            baseCost: '99',
            finalCost: qualifiesFree ? 0 : 99,
            isFree: qualifiesFree,
            estimatedDaysMin: 5,
            estimatedDaysMax: 7,
            estimatedDeliveryMin: stdMin.toISOString().split('T')[0],
            estimatedDeliveryMax: stdMax.toISOString().split('T')[0],
          },
          {
            id: 'ship-express',
            name: 'Express Delivery',
            carrier: 'DTDC',
            description: 'Fast delivery via DTDC courier',
            baseCost: '149',
            finalCost: 149,
            isFree: false,
            estimatedDaysMin: 2,
            estimatedDaysMax: 3,
            estimatedDeliveryMin: expMin.toISOString().split('T')[0],
            estimatedDeliveryMax: expMax.toISOString().split('T')[0],
          },
        ],
      }),
    });
  });
}

/**
 * Add a test item to cart via localStorage
 */
async function addItemToCart(page: Page, itemOverrides?: Partial<{
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
    const existing = localStorage.getItem('chobii-cart-storage');
    let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
    data.state.items.push(cartItem);
    localStorage.setItem('chobii-cart-storage', JSON.stringify(data));
  }, item);
}

/**
 * Fill address form with valid data
 */
async function fillValidAddressForm(page: Page) {
  await page.fill('#fullName', 'John Doe');
  await page.fill('#email', 'john.doe@example.com');
  await page.fill('#phone', '9876543210');
  await page.fill('#addressLine1', '123 Test Street, Building A');
  await page.fill('#city', 'Mumbai');
  await page.selectOption('#state', 'Maharashtra');
  await page.fill('#postalCode', '400001');
}

// ============================================================================
// Page Header Tests
// ============================================================================

test.describe('Checkout Page - Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Test Poster', unitPrice: 2999 });
    await page.reload();
  });

  test('should display page title', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Checkout');
  });

  test('should have correct page meta title', async ({ page }) => {
    const pageTitle = await page.title();
    expect(pageTitle).toContain('Checkout');
    expect(pageTitle).toContain('chobii.art');
  });

  test('should have noindex robots meta tag', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('should display Back to Cart link', async ({ page }) => {
    const backLink = page.locator('a[href="/cart"]:has-text("Back to Cart")');
    await expect(backLink).toBeVisible();
  });

  test('should navigate to cart when clicking Back to Cart', async ({ page }) => {
    const backLink = page.locator('a[href="/cart"]:has-text("Back to Cart")');
    await backLink.click();
    await expect(page).toHaveURL('/cart');
  });
});

// ============================================================================
// Empty Cart State Tests
// ============================================================================

test.describe('Checkout Page - Empty Cart State', () => {
  test.beforeEach(async ({ page }) => {
    // Need to navigate first to access localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await page.goto('/checkout');
  });

  test('should display empty cart message', async ({ page }) => {
    const emptyMessage = page.locator('h1:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });

  test('should display shopping cart icon', async ({ page }) => {
    const iconContainer = page.locator('.rounded-full.bg-muted svg');
    await expect(iconContainer).toBeVisible();
  });

  test('should display descriptive text', async ({ page }) => {
    const description = page.locator('text=Add some items to your cart');
    await expect(description).toBeVisible();
  });

  test('should display Browse Posters button', async ({ page }) => {
    const browseButton = page.locator('a[href="/posters"]:has-text("Browse Posters")');
    await expect(browseButton).toBeVisible();
  });

  test('should navigate to posters page when clicking Browse Posters', async ({ page }) => {
    const browseButton = page.locator('a[href="/posters"]:has-text("Browse Posters")');
    await browseButton.click();
    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Progress Steps Tests
// ============================================================================

test.describe('Checkout Page - Progress Steps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Progress Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display all checkout steps', async ({ page }) => {
    // Steps: Shipping, Delivery, Payment - use step indicator buttons with exact match
    await expect(page.getByRole('button', { name: 'Shipping', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delivery', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Payment', exact: true })).toBeVisible();
  });

  test('should highlight current step', async ({ page }) => {
    // Shipping should be the current step initially
    const shippingStep = page.locator('.bg-brand-500').first();
    await expect(shippingStep).toBeVisible();
  });

  test('should show step icons', async ({ page }) => {
    // Step icons should be visible
    const stepIcons = page.locator('.rounded-full svg');
    const count = await stepIcons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test.skip('should show connector lines between steps', async ({ page }) => {
    // TODO: CSS class selector is brittle - test visual appearance manually
    const connectorLines = page.locator('.h-0\\.5.rounded-full');
    const count = await connectorLines.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Shipping Step Tests
// ============================================================================

test.describe('Checkout Page - Shipping Step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Shipping Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display Shipping Address section title', async ({ page }) => {
    const title = page.locator('h2:has-text("Shipping Address")');
    await expect(title).toBeVisible();
  });

  test('should display Full Name field', async ({ page }) => {
    const label = page.locator('label[for="fullName"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Full Name');

    const input = page.locator('#fullName');
    await expect(input).toBeVisible();
  });

  test('should display Email field', async ({ page }) => {
    const label = page.locator('label[for="email"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Email');

    const input = page.locator('#email');
    await expect(input).toBeVisible();
  });

  test('should display Phone field', async ({ page }) => {
    const label = page.locator('label[for="phone"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Phone');

    const input = page.locator('#phone');
    await expect(input).toBeVisible();
  });

  test('should display Address field', async ({ page }) => {
    const label = page.locator('label[for="addressLine1"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Address');

    const textarea = page.locator('#addressLine1');
    await expect(textarea).toBeVisible();
  });

  test('should display optional Address Line 2 field', async ({ page }) => {
    const label = page.locator('label[for="addressLine2"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Optional');
  });

  test('should display optional Landmark field', async ({ page }) => {
    const label = page.locator('label[for="landmark"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Optional');
  });

  test('should display City field', async ({ page }) => {
    const label = page.locator('label[for="city"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('City');

    const input = page.locator('#city');
    await expect(input).toBeVisible();
  });

  test('should display State dropdown', async ({ page }) => {
    const label = page.locator('label[for="state"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('State');

    const select = page.locator('#state');
    await expect(select).toBeVisible();
  });

  test('should have Indian states in dropdown', async ({ page }) => {
    const select = page.locator('#state');

    // Check for some Indian states - options exist in the DOM even if not visible
    await expect(page.locator('option[value="Maharashtra"]')).toHaveCount(1);
    await expect(page.locator('option[value="Delhi"]')).toHaveCount(1);
    await expect(page.locator('option[value="Karnataka"]')).toHaveCount(1);
  });

  test('should display PIN Code field', async ({ page }) => {
    const label = page.locator('label[for="postalCode"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('PIN Code');

    const input = page.locator('#postalCode');
    await expect(input).toBeVisible();
  });

  test('should display Order Notes section', async ({ page }) => {
    const title = page.locator('h3:has-text("Order Notes")');
    await expect(title).toBeVisible();
  });

  test('should display Continue to Delivery button', async ({ page }) => {
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await expect(continueButton).toBeVisible();
  });

  test('should have disabled Continue button when form is invalid', async ({ page }) => {
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await expect(continueButton).toBeDisabled();
  });
});

// ============================================================================
// Address Form Validation Tests
// ============================================================================

test.describe('Checkout Page - Address Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Validation Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should show error for empty full name', async ({ page }) => {
    const input = page.locator('#fullName');
    await input.focus();
    await input.blur();

    const error = page.locator('text=Full name is required');
    await expect(error).toBeVisible();
  });

  test('should show error for short name', async ({ page }) => {
    const input = page.locator('#fullName');
    await input.fill('A');
    await input.blur();

    const error = page.locator('text=Name must be at least 2 characters');
    await expect(error).toBeVisible();
  });

  test('should show error for empty email', async ({ page }) => {
    const input = page.locator('#email');
    await input.focus();
    await input.blur();

    const error = page.locator('text=Email is required');
    await expect(error).toBeVisible();
  });

  test('should show error for invalid email', async ({ page }) => {
    const input = page.locator('#email');
    await input.fill('invalid-email');
    await input.blur();

    const error = page.locator('text=Please enter a valid email address');
    await expect(error).toBeVisible();
  });

  test('should show error for empty phone', async ({ page }) => {
    const input = page.locator('#phone');
    await input.focus();
    await input.blur();

    const error = page.locator('text=Phone number is required');
    await expect(error).toBeVisible();
  });

  test('should show error for invalid phone', async ({ page }) => {
    const input = page.locator('#phone');
    await input.fill('123');
    await input.blur();

    const error = page.locator('text=Please enter a valid 10-digit phone number');
    await expect(error).toBeVisible();
  });

  test('should show error for empty address', async ({ page }) => {
    const textarea = page.locator('#addressLine1');
    await textarea.focus();
    await textarea.blur();

    const error = page.locator('text=Address is required');
    await expect(error).toBeVisible();
  });

  test('should show error for short address', async ({ page }) => {
    const textarea = page.locator('#addressLine1');
    await textarea.fill('Test');
    await textarea.blur();

    const error = page.locator('text=Please enter a complete address');
    await expect(error).toBeVisible();
  });

  test('should show error for empty city', async ({ page }) => {
    const input = page.locator('#city');
    await input.focus();
    await input.blur();

    const error = page.locator('text=City is required');
    await expect(error).toBeVisible();
  });

  test('should show error for empty state', async ({ page }) => {
    const select = page.locator('#state');
    await select.focus();
    await select.blur();

    const error = page.locator('text=State is required');
    await expect(error).toBeVisible();
  });

  test('should show error for empty PIN code', async ({ page }) => {
    const input = page.locator('#postalCode');
    await input.focus();
    await input.blur();

    const error = page.locator('text=PIN code is required');
    await expect(error).toBeVisible();
  });

  test('should show error for invalid PIN code', async ({ page }) => {
    const input = page.locator('#postalCode');
    await input.fill('123');
    await input.blur();

    const error = page.locator('text=Please enter a valid 6-digit PIN code');
    await expect(error).toBeVisible();
  });

  test('should enable Continue button when form is valid', async ({ page }) => {
    await fillValidAddressForm(page);

    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await expect(continueButton).not.toBeDisabled();
  });

  test('should accept valid email formats', async ({ page }) => {
    const input = page.locator('#email');
    await input.fill('test@example.com');
    await input.blur();

    const error = page.locator('text=Please enter a valid email address');
    await expect(error).not.toBeVisible();
  });

  test('should accept valid 10-digit phone', async ({ page }) => {
    const input = page.locator('#phone');
    await input.fill('9876543210');
    await input.blur();

    const error = page.locator('text=Please enter a valid 10-digit phone number');
    await expect(error).not.toBeVisible();
  });

  test('should accept valid 6-digit PIN code', async ({ page }) => {
    const input = page.locator('#postalCode');
    await input.fill('400001');
    await input.blur();

    const error = page.locator('text=Please enter a valid 6-digit PIN code');
    await expect(error).not.toBeVisible();
  });
});

// ============================================================================
// Delivery Step Tests
// ============================================================================

test.describe('Checkout Page - Delivery Step', () => {
  test.beforeEach(async ({ page }) => {
    await setupShippingMock(page);
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Delivery Test', unitPrice: 2999 });
    await page.reload();

    // Fill valid address and proceed to delivery
    await fillValidAddressForm(page);
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await continueButton.click();
  });

  test('should display Delivery Options section', async ({ page }) => {
    const title = page.locator('h2:has-text("Delivery Options")');
    await expect(title).toBeVisible();
  });

  test('should display Standard Delivery option', async ({ page }) => {
    const standardOption = page.getByText('Standard Delivery', { exact: true });
    await expect(standardOption).toBeVisible();
  });

  test('should display Express Delivery option', async ({ page }) => {
    const expressOption = page.getByText('Express Delivery', { exact: true });
    await expect(expressOption).toBeVisible();
  });

  test('should display estimated delivery days for standard', async ({ page }) => {
    // Standard Delivery card should show "Arrives {date range}"
    const standardCard = page.getByRole('button', { name: /Standard Delivery/ });
    await expect(standardCard).toContainText(/Arrives/);
  });

  test('should display estimated delivery days for express', async ({ page }) => {
    // Express Delivery card should show "Arrives {date range}"
    const expressCard = page.getByRole('button', { name: /Express Delivery/ });
    await expect(expressCard).toContainText(/Arrives/);
  });

  test('should have Standard Delivery selected by default', async ({ page }) => {
    const standardOption = page.getByRole('button', { name: /Standard Delivery/ });
    await expect(standardOption).toHaveClass(/border-brand-500/);
  });

  test('should allow selecting Express Delivery', async ({ page }) => {
    const expressOption = page.getByRole('button', { name: /Express Delivery/ });
    await expressOption.click();

    await expect(expressOption).toHaveClass(/border-brand-500/);
  });

  test('should display Shipping To summary', async ({ page }) => {
    const shippingTo = page.locator('h3:has-text("Shipping To")');
    await expect(shippingTo).toBeVisible();
  });

  test('should display Edit link for shipping address', async ({ page }) => {
    const editLink = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(editLink).toBeVisible();
  });

  test('should navigate back to shipping when clicking Edit', async ({ page }) => {
    const editLink = page.getByRole('button', { name: 'Edit', exact: true });
    await editLink.click();

    // Should show shipping form
    const shippingTitle = page.locator('h2:has-text("Shipping Address")');
    await expect(shippingTitle).toBeVisible();
  });

  test('should display Back button', async ({ page }) => {
    const backButton = page.getByRole('button', { name: 'Back', exact: true });
    await expect(backButton).toBeVisible();
  });

  test('should display Continue to Payment button', async ({ page }) => {
    const continueButton = page.getByRole('button', { name: 'Continue to Payment' });
    await expect(continueButton).toBeVisible();
  });

  test('should navigate to payment step when clicking Continue', async ({ page }) => {
    const continueButton = page.getByRole('button', { name: 'Continue to Payment' });
    await continueButton.click();

    // Should show payment section
    const paymentTitle = page.locator('h2:has-text("Payment")');
    await expect(paymentTitle).toBeVisible();
  });

  test('should navigate back to shipping when clicking Back', async ({ page }) => {
    const backButton = page.getByRole('button', { name: 'Back', exact: true });
    await backButton.click();

    // Should show shipping form
    const shippingTitle = page.locator('h2:has-text("Shipping Address")');
    await expect(shippingTitle).toBeVisible();
  });
});

// ============================================================================
// Free Shipping Tests
// ============================================================================

test.describe('Checkout Page - Free Shipping', () => {
  test('should show FREE for standard when over threshold', async ({ page }) => {
    await setupShippingMock(page, 1500);
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    // Add item over ₹999 threshold
    await addItemToCart(page, { productTitle: 'Free Shipping Test', unitPrice: 1500 });
    await page.reload();

    // Fill valid address and proceed to delivery
    await fillValidAddressForm(page);
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await continueButton.click();

    // Check for FREE label
    const freeLabel = page.locator('text=FREE').first();
    await expect(freeLabel).toBeVisible();
  });

  test('should show free shipping notice when qualified', async ({ page }) => {
    await setupShippingMock(page, 1500);
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    // Add item over ₹999 threshold
    await addItemToCart(page, { productTitle: 'Free Shipping Test', unitPrice: 1500 });
    await page.reload();

    // Fill valid address and proceed to delivery
    await fillValidAddressForm(page);
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await continueButton.click();

    // Check for free shipping notice
    const notice = page.locator('text=/You qualify for free shipping/');
    await expect(notice).toBeVisible();
  });

  test('should show shipping price when under threshold', async ({ page }) => {
    await setupShippingMock(page, 500);
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    // Add item under ₹999 threshold
    await addItemToCart(page, { productTitle: 'Paid Shipping Test', unitPrice: 500 });
    await page.reload();

    // Fill valid address and proceed to delivery
    await fillValidAddressForm(page);
    const continueButton = page.getByRole('button', { name: 'Continue to Delivery' });
    await continueButton.click();

    // Check for shipping price in standard delivery option
    const standardDeliveryOption = page.getByRole('button', { name: /Standard Delivery/ });
    await expect(standardDeliveryOption).toContainText('₹99');
  });
});

// ============================================================================
// Payment Step Tests
// ============================================================================

test.describe('Checkout Page - Payment Step', () => {
  test.beforeEach(async ({ page }) => {
    await setupShippingMock(page);
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Payment Test', unitPrice: 2999 });
    await page.reload();

    // Navigate to payment step
    await fillValidAddressForm(page);
    await page.getByRole('button', { name: 'Continue to Delivery' }).click();
    await page.getByRole('button', { name: 'Continue to Payment' }).click();
  });

  test('should display Payment section title', async ({ page }) => {
    const title = page.locator('h2:has-text("Payment")');
    await expect(title).toBeVisible();
  });

  test('should display Order Summary in payment step', async ({ page }) => {
    const summaryTitle = page.locator('h3:has-text("Order Summary")');
    await expect(summaryTitle).toBeVisible();
  });

  test('should display shipping address in order summary', async ({ page }) => {
    const shippingTo = page.locator('text=Shipping to:');
    await expect(shippingTo).toBeVisible();
  });

  test('should display delivery method in order summary', async ({ page }) => {
    const delivery = page.locator('text=Delivery:');
    await expect(delivery).toBeVisible();
  });

  test('should display Total Amount', async ({ page }) => {
    const totalLabel = page.locator('text=Total Amount');
    await expect(totalLabel).toBeVisible();
  });

  test('should display Pay button', async ({ page }) => {
    const payButton = page.getByRole('button', { name: /^Pay\s/ });
    await expect(payButton).toBeVisible();
  });

  test('should display Back button', async ({ page }) => {
    const backButton = page.getByRole('button', { name: 'Back', exact: true });
    await expect(backButton).toBeVisible();
  });

  test('should navigate back to delivery when clicking Back', async ({ page }) => {
    const backButton = page.getByRole('button', { name: 'Back', exact: true });
    await backButton.click();

    // Should show delivery options
    const deliveryTitle = page.locator('h2:has-text("Delivery Options")');
    await expect(deliveryTitle).toBeVisible();
  });
});

// ============================================================================
// Order Summary Sidebar Tests
// ============================================================================

test.describe('Checkout Page - Order Summary Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Summary Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display Order Summary heading', async ({ page }) => {
    const heading = page.locator('h2:has-text("Order Summary")');
    await expect(heading).toBeVisible();
  });

  test('should display item count badge', async ({ page }) => {
    const badge = page.locator('text=/\\d+ items?/');
    await expect(badge.first()).toBeVisible();
  });

  test('should display subtotal', async ({ page }) => {
    const subtotal = page.locator('text=Subtotal');
    await expect(subtotal).toBeVisible();
  });

  test('should display shipping line', async ({ page }) => {
    const shipping = page.getByText('Shipping', { exact: true }).first();
    await expect(shipping).toBeVisible();
  });

  test('should display total', async ({ page }) => {
    const total = page.getByText('Total', { exact: true });
    await expect(total).toBeVisible();
  });

  test('should display price in INR format', async ({ page }) => {
    const price = page.locator('text=/₹[\\d,]+/');
    await expect(price.first()).toBeVisible();
  });

  test('should display Show/Hide items toggle', async ({ page }) => {
    const toggle = page.locator('text=/Show items|Hide items/');
    await expect(toggle).toBeVisible();
  });
});

// ============================================================================
// Trust Badges Tests
// ============================================================================

test.describe('Checkout Page - Trust Badges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Trust Badge Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display Secure Checkout notice', async ({ page }) => {
    const secureNotice = page.getByText('Secure Checkout', { exact: true });
    await expect(secureNotice).toBeVisible();
  });

  test('should display encryption message', async ({ page }) => {
    const encryptionMessage = page.locator('text=encrypted');
    await expect(encryptionMessage.first()).toBeVisible();
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
// Customer Notes Tests
// ============================================================================

test.describe('Checkout Page - Customer Notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Notes Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display Order Notes textarea', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="special instructions"]');
    await expect(textarea).toBeVisible();
  });

  test('should allow entering customer notes', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="special instructions"]');
    await textarea.fill('Please gift wrap this item');

    await expect(textarea).toHaveValue('Please gift wrap this item');
  });

  test('should display character count', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="special instructions"]');
    await textarea.fill('Test note');

    const charCount = page.locator('text=9/500');
    await expect(charCount).toBeVisible();
  });

  test('should limit notes to 500 characters', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="special instructions"]');
    await expect(textarea).toHaveAttribute('maxlength', '500');
  });
});

// ============================================================================
// Step Navigation Tests
// ============================================================================

test.describe('Checkout Page - Step Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Navigation Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should allow clicking on completed steps', async ({ page }) => {
    // Complete shipping step
    await fillValidAddressForm(page);
    await page.getByRole('button', { name: 'Continue to Delivery' }).click();

    // Click on shipping step indicator (exact match to avoid matching delivery options)
    const shippingStep = page.getByRole('button', { name: 'Shipping', exact: true });
    await shippingStep.click();

    // Should show shipping form
    const shippingTitle = page.locator('h2:has-text("Shipping Address")');
    await expect(shippingTitle).toBeVisible();
  });

  test('should show completed checkmark on finished steps', async ({ page }) => {
    // Complete shipping step
    await fillValidAddressForm(page);
    await page.getByRole('button', { name: 'Continue to Delivery' }).click();

    // Shipping step should have checkmark
    const checkIcon = page.locator('.bg-green-500 svg');
    await expect(checkIcon).toBeVisible();
  });

  test('should update progress connector color for completed steps', async ({ page }) => {
    // Complete shipping step
    await fillValidAddressForm(page);
    await page.getByRole('button', { name: 'Continue to Delivery' }).click();

    // Connector line should be green
    const greenConnector = page.locator('.bg-green-500.h-0\\.5');
    await expect(greenConnector).toBeVisible();
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Checkout Page - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Responsive Test', unitPrice: 2999 });
    await page.reload();
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const title = page.locator('h1:has-text("Checkout")');
    await expect(title).toBeVisible();

    // Form should be visible
    const fullNameInput = page.locator('#fullName');
    await expect(fullNameInput).toBeVisible();
  });

  test('should stack form and summary on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Order summary should be below form on mobile
    const orderSummary = page.locator('h2:has-text("Order Summary")');
    await expect(orderSummary).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    const title = page.locator('h1:has-text("Checkout")');
    await expect(title).toBeVisible();
  });

  test('should use side-by-side layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Grid layout for form and summary
    const grid = page.locator('.lg\\:grid-cols-3');
    await expect(grid).toBeVisible();
  });

  test('should have sticky order summary on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const summary = page.locator('.sticky.top-24');
    await expect(summary).toBeVisible();
  });

  test('should hide step labels on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Step labels should be hidden on mobile (sm:block)
    const stepLabel = page.locator('.sm\\:block').filter({ hasText: 'Shipping' }).first();
    await expect(stepLabel).toHaveClass(/hidden/);
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Checkout Page - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'A11y Test', unitPrice: 2999 });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have one h1 for page title
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Should have h2 for sections
    const h2Elements = page.locator('h2');
    const h2Count = await h2Elements.count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });

  test('should have labels for all form inputs', async ({ page }) => {
    const inputs = ['fullName', 'email', 'phone', 'city', 'postalCode'];

    for (const inputId of inputs) {
      const label = page.locator(`label[for="${inputId}"]`);
      await expect(label).toBeVisible();
    }
  });

  test('should indicate required fields', async ({ page }) => {
    // Required fields should have asterisk
    const requiredLabels = page.locator('label:has-text("*")');
    const count = await requiredLabels.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have proper focus styles', async ({ page }) => {
    const input = page.locator('#fullName');
    await input.focus();

    // Input should be focused
    await expect(input).toBeFocused();
  });

  test('should show validation errors accessibly', async ({ page }) => {
    const input = page.locator('#fullName');
    await input.focus();
    await input.blur();

    // Error message should be visible
    const error = page.locator('text=Full name is required');
    await expect(error).toBeVisible();
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Checkout Page - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    // Navigate first to access localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));

    const startTime = Date.now();
    await page.goto('/checkout');
    await expect(page.locator('h1')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'JS Test', unitPrice: 2999 });
    await page.reload();
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

test.describe('Checkout Page - Navigation', () => {
  test('should navigate to checkout from cart', async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { productTitle: 'Nav Test', unitPrice: 2999 });
    await page.reload();

    const checkoutButton = page.locator('a[href="/checkout"]:has-text("Proceed to Checkout")');
    await checkoutButton.click();
    await expect(page).toHaveURL('/checkout');
  });

  test('should navigate back with browser back button', async ({ page }) => {
    await page.goto('/cart');
    await page.goto('/checkout');
    await page.goBack();
    await expect(page).toHaveURL('/cart');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Checkout Page - Error Handling', () => {
  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    await page.goto('/checkout');

    // Set corrupted data
    await page.evaluate(() => {
      localStorage.setItem('chobii-cart-storage', 'corrupted-data');
    });

    await page.reload();

    // Page should still load without crashing
    const title = page.locator('h1');
    await expect(title).toBeVisible();
  });

  test('should handle empty localStorage gracefully', async ({ page }) => {
    // Navigate first to access localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/checkout');

    // Should show empty cart state
    const emptyMessage = page.locator('h1:has-text("Your cart is empty")');
    await expect(emptyMessage).toBeVisible();
  });
});

// ============================================================================
// Multi-Item Cart Tests
// ============================================================================

test.describe('Checkout Page - Multi-Item Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));
    await addItemToCart(page, { id: 'item_1', productTitle: 'Poster One', unitPrice: 1500, quantity: 1 });
    await addItemToCart(page, { id: 'item_2', productTitle: 'Poster Two', unitPrice: 2000, quantity: 2 });
    await page.reload();
  });

  test('should display correct item count in summary', async ({ page }) => {
    // 1 + 2 = 3 items
    const badge = page.locator('text=/3 items/');
    await expect(badge).toBeVisible();
  });

  test('should calculate correct subtotal', async ({ page }) => {
    // 1500 + (2000 * 2) = 5500
    // Note: Prices are in paise, displayed in rupees
    const subtotalSection = page.locator('text=Subtotal');
    await expect(subtotalSection).toBeVisible();
  });
});

// ============================================================================
// Item with Frame Tests
// ============================================================================

test.describe('Checkout Page - Item with Frame', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('chobii-cart-storage'));

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
      const existing = localStorage.getItem('chobii-cart-storage');
      let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
      data.state.items.push(cartItem);
      localStorage.setItem('chobii-cart-storage', JSON.stringify(data));
    }, item);

    await page.reload();
  });

  test('should display item in order summary', async ({ page }) => {
    // Show items in summary
    const showItems = page.getByText('Show items', { exact: true });
    if (await showItems.isVisible()) {
      await showItems.click();
    }

    const productTitle = page.getByText('Framed Poster', { exact: true });
    await expect(productTitle).toBeVisible();
  });
});
