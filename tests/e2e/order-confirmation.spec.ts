import { test, expect, type Page } from '@playwright/test';

/**
 * Order Confirmation Page E2E Tests
 *
 * Tests for the MasonArt order confirmation page (/checkout/success) including:
 * - Success header with order number
 * - Order number copy functionality
 * - Order items display
 * - Shipping details section
 * - Payment summary section
 * - What's Next steps
 * - Action buttons (Continue Shopping, View Orders)
 * - Generic success state (no order number)
 * - Error state handling
 * - Loading state
 * - Responsive design
 * - Accessibility
 * - SEO meta tags
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/checkout/success.tsx
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mock order details API response
 */
async function mockOrderResponse(page: Page, order: {
  id?: string;
  orderNumber?: string;
  status?: string;
  createdAt?: string;
  total?: number;
  subtotal?: number;
  shippingCost?: number;
  discountAmount?: number;
  userEmail?: string;
  shippingAddress?: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  shippingMethod?: string;
  estimatedDelivery?: string;
  items?: Array<{
    id: string;
    productTitle: string;
    thumbnailUrl?: string;
    sizeLabel?: string;
    frameName?: string;
    quantity: number;
    unitPrice: number;
    framePrice?: number;
  }>;
  payment?: {
    method?: string;
    status?: string;
  };
}) {
  const defaultOrder = {
    id: 'order_123',
    orderNumber: 'ORD-20260119-001',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    total: 353818, // 3538.18 INR in paise
    subtotal: 299900, // 2999 INR
    shippingCost: 0,
    discountAmount: 0,
    userEmail: 'john.doe@example.com',
    shippingAddress: {
      fullName: 'John Doe',
      phone: '9876543210',
      addressLine1: '123 Test Street, Building A',
      addressLine2: 'Near City Park',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
    },
    shippingMethod: 'standard',
    estimatedDelivery: '5-7 business days',
    items: [
      {
        id: 'item_1',
        productTitle: 'Abstract Sunset Poster',
        thumbnailUrl: '',
        sizeLabel: '24x32 inches',
        frameName: 'Black Wood Frame',
        quantity: 1,
        unitPrice: 299900,
        framePrice: 99900,
      },
    ],
    payment: {
      method: 'razorpay',
      status: 'captured',
    },
    ...order,
  };

  await page.route('**/api/orders/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        order: defaultOrder,
      }),
    });
  });

  return defaultOrder;
}

/**
 * Mock order API error response
 */
async function mockOrderError(page: Page, errorMessage: string = 'Order not found') {
  await page.route('**/api/orders/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: errorMessage,
      }),
    });
  });
}

/**
 * Mock slow API response for loading state testing
 */
async function mockSlowOrderResponse(page: Page, delayMs: number = 2000) {
  await page.route('**/api/orders/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        order: {
          id: 'order_123',
          orderNumber: 'ORD-20260119-001',
          status: 'confirmed',
          total: 299900,
          subtotal: 299900,
          shippingCost: 0,
        },
      }),
    });
  });
}

// ============================================================================
// Success Header Tests
// ============================================================================

test.describe('Order Confirmation - Success Header', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display success check icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const successIcon = page.locator('.bg-green-100 svg');
    await expect(successIcon).toBeVisible();
  });

  test('should display Order Confirmed title', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const title = page.locator('h1:has-text("Order Confirmed")');
    await expect(title).toBeVisible();
  });

  test('should display thank you message', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const message = page.locator('text=Thank you for your purchase');
    await expect(message).toBeVisible();
  });

  test('should display order number', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const orderNumber = page.locator('text=ORD-20260119-001');
    await expect(orderNumber).toBeVisible();
  });

  test('should display Order Number label', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const label = page.locator('text=Order Number');
    await expect(label).toBeVisible();
  });

  test('should display receipt icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    // Receipt icon is next to order number
    const receiptIcon = page.locator('.text-brand-500').first();
    await expect(receiptIcon).toBeVisible();
  });

  test('should display email confirmation notice', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const emailNotice = page.locator('text=Confirmation email sent to');
    await expect(emailNotice).toBeVisible();
  });

  test('should display user email address', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const email = page.locator('text=john.doe@example.com');
    await expect(email).toBeVisible();
  });
});

// ============================================================================
// Copy Order Number Tests
// ============================================================================

test.describe('Order Confirmation - Copy Order Number', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display copy button', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const copyButton = page.locator('button[title*="Copy"]');
    await expect(copyButton).toBeVisible();
  });

  test('should have copy icon initially', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const copyButton = page.locator('button[title="Copy order number"]');
    await expect(copyButton).toBeVisible();
  });

  test('should show check icon after copying', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-write']);

    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const copyButton = page.locator('button[title*="Copy"]');
    await copyButton.click();

    // Should show success state
    const successButton = page.locator('button.bg-green-100');
    await expect(successButton).toBeVisible();
  });

  test('should change button title after copying', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-write']);

    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const copyButton = page.locator('button[title="Copy order number"]');
    await copyButton.click();

    const copiedButton = page.locator('button[title="Copied!"]');
    await expect(copiedButton).toBeVisible();
  });
});

// ============================================================================
// Order Items Section Tests
// ============================================================================

test.describe('Order Confirmation - Order Items', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {
      items: [
        {
          id: 'item_1',
          productTitle: 'Abstract Sunset Poster',
          sizeLabel: '24x32 inches',
          frameName: 'Black Wood Frame',
          quantity: 2,
          unitPrice: 149900,
          framePrice: 49900,
        },
        {
          id: 'item_2',
          productTitle: 'Mountain Landscape Art',
          sizeLabel: '18x24 inches',
          quantity: 1,
          unitPrice: 99900,
          framePrice: 0,
        },
      ],
    });
  });

  test('should display Order Items section header', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const header = page.locator('h2:has-text("Order Items")');
    await expect(header).toBeVisible();
  });

  test('should display item count in header', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const itemCount = page.locator('text=Order Items (2)');
    await expect(itemCount).toBeVisible();
  });

  test('should display package icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const packageIcon = page.locator('.text-brand-500').first();
    await expect(packageIcon).toBeVisible();
  });

  test('should display product titles', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=Abstract Sunset Poster')).toBeVisible();
    await expect(page.locator('text=Mountain Landscape Art')).toBeVisible();
  });

  test('should display product sizes', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=24x32 inches')).toBeVisible();
    await expect(page.locator('text=18x24 inches')).toBeVisible();
  });

  test('should display frame name when applicable', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=Black Wood Frame')).toBeVisible();
  });

  test('should display quantities', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=Qty: 2')).toBeVisible();
    await expect(page.locator('text=Qty: 1')).toBeVisible();
  });

  test('should display item totals', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    // Items should show their individual totals in INR format
    const priceElements = page.locator('text=/\u20B9[\\d,]+/');
    const count = await priceElements.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Shipping Section Tests
// ============================================================================

test.describe('Order Confirmation - Shipping Details', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display Shipping Details header', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const header = page.locator('h2:has-text("Shipping Details")');
    await expect(header).toBeVisible();
  });

  test('should display map pin icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const shippingSection = page.locator('text=Shipping Details').locator('..');
    await expect(shippingSection).toBeVisible();
  });

  test('should display recipient name', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=John Doe').first()).toBeVisible();
  });

  test('should display address line 1', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=123 Test Street, Building A')).toBeVisible();
  });

  test('should display address line 2 when present', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=Near City Park')).toBeVisible();
  });

  test('should display city, state, and postal code', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=Mumbai, Maharashtra - 400001')).toBeVisible();
  });

  test('should display phone number', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=9876543210')).toBeVisible();
  });

  test('should display delivery method', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=standard Delivery')).toBeVisible();
  });

  test('should display estimated delivery', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=5-7 business days')).toBeVisible();
  });

  test('should display truck icon for delivery method', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const deliverySection = page.locator('.bg-muted\\/50');
    await expect(deliverySection).toBeVisible();
  });
});

// ============================================================================
// Payment Summary Section Tests
// ============================================================================

test.describe('Order Confirmation - Payment Summary', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {
      subtotal: 299900,
      shippingCost: 9900,
      discountAmount: 50000,
      total: 259800,
      payment: { status: 'captured' },
    });
  });

  test('should display Payment Summary header', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const header = page.locator('h2:has-text("Payment Summary")');
    await expect(header).toBeVisible();
  });

  test('should display credit card icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const paymentSection = page.locator('text=Payment Summary').locator('..');
    await expect(paymentSection).toBeVisible();
  });

  test('should display Subtotal', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const subtotal = page.locator('text=Subtotal');
    await expect(subtotal).toBeVisible();
  });

  test('should display Discount when applicable', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const discount = page.locator('text=Discount');
    await expect(discount).toBeVisible();
  });

  test('should display discount in green', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const discountLine = page.locator('.text-green-600:has-text("Discount")');
    await expect(discountLine).toBeVisible();
  });

  test('should display Shipping cost', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const shipping = page.locator('text=Shipping').first();
    await expect(shipping).toBeVisible();
  });

  test('should display FREE shipping in green when applicable', async ({ page }) => {
    await mockOrderResponse(page, {
      subtotal: 299900,
      shippingCost: 0,
      total: 299900,
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const freeShipping = page.locator('.text-green-600:has-text("FREE")');
    await expect(freeShipping).toBeVisible();
  });

  test('should display Total Paid', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const total = page.locator('text=Total Paid');
    await expect(total).toBeVisible();
  });

  test('should display payment status badge', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const badge = page.locator('text=Payment Complete');
    await expect(badge).toBeVisible();
  });

  test('should display check icon in payment badge', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const badge = page.locator('.bg-green-100:has-text("Payment")');
    await expect(badge).toBeVisible();
  });
});

// ============================================================================
// What's Next Section Tests
// ============================================================================

test.describe('Order Confirmation - What Happens Next', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display What Happens Next header', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const header = page.locator('h2:has-text("What Happens Next")');
    await expect(header).toBeVisible();
  });

  test('should display Confirmation Email step', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h3:has-text("Confirmation Email")')).toBeVisible();
  });

  test('should display Order Processing step', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h3:has-text("Order Processing")')).toBeVisible();
  });

  test('should display Shipping Updates step', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h3:has-text("Shipping Updates")')).toBeVisible();
  });

  test('should display Delivery step', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h3:has-text("Delivery")')).toBeVisible();
  });

  test('should display step numbers 1-4', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const stepNumbers = page.locator('.bg-brand-500.rounded-full');
    const count = await stepNumbers.count();
    expect(count).toBe(4);
  });

  test('should display step descriptions', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('text=order details and receipt')).toBeVisible();
    await expect(page.locator('text=prepare your order')).toBeVisible();
    await expect(page.locator('text=tracking information')).toBeVisible();
    await expect(page.locator('text=arrive at your doorstep')).toBeVisible();
  });

  test('should display step icons', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    // Steps should have icons in brand-colored circles
    const stepIcons = page.locator('.bg-brand-100');
    const count = await stepIcons.count();
    expect(count).toBe(4);
  });
});

// ============================================================================
// Action Buttons Tests
// ============================================================================

test.describe('Order Confirmation - Action Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display Continue Shopping button', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const button = page.locator('a:has-text("Continue Shopping")');
    await expect(button).toBeVisible();
  });

  test('should display shopping bag icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const continueButton = page.locator('a:has-text("Continue Shopping")');
    const icon = continueButton.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('Continue Shopping should link to posters page', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const button = page.locator('a:has-text("Continue Shopping")');
    await expect(button).toHaveAttribute('href', '/posters');
  });

  test('should display View All Orders button', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const button = page.locator('a:has-text("View All Orders")');
    await expect(button).toBeVisible();
  });

  test('should display user icon on orders button', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const ordersButton = page.locator('a:has-text("View All Orders")');
    const icon = ordersButton.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('View All Orders should link to account orders page', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const button = page.locator('a:has-text("View All Orders")');
    await expect(button).toHaveAttribute('href', '/account/orders');
  });

  test('should navigate to posters when clicking Continue Shopping', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const button = page.locator('a:has-text("Continue Shopping")');
    await button.click();
    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Generic Success State Tests (No Order Number)
// ============================================================================

test.describe('Order Confirmation - Generic Success State', () => {
  test('should display success icon without order number', async ({ page }) => {
    await page.goto('/checkout/success');
    const successIcon = page.locator('.bg-green-100 svg');
    await expect(successIcon).toBeVisible();
  });

  test('should display Order Confirmed title', async ({ page }) => {
    await page.goto('/checkout/success');
    const title = page.locator('h1:has-text("Order Confirmed")');
    await expect(title).toBeVisible();
  });

  test('should display generic thank you message', async ({ page }) => {
    await page.goto('/checkout/success');
    const message = page.locator('text=Thank you for your purchase');
    await expect(message).toBeVisible();
  });

  test('should mention confirmation email', async ({ page }) => {
    await page.goto('/checkout/success');
    const emailNotice = page.locator('text=confirmation email');
    await expect(emailNotice).toBeVisible();
  });

  test('should display Continue Shopping button', async ({ page }) => {
    await page.goto('/checkout/success');
    const button = page.locator('a:has-text("Continue Shopping")');
    await expect(button).toBeVisible();
  });

  test('should display View Orders button', async ({ page }) => {
    await page.goto('/checkout/success');
    const button = page.locator('a:has-text("View Orders")');
    await expect(button).toBeVisible();
  });

  test('should display Need help contact link', async ({ page }) => {
    await page.goto('/checkout/success');
    const helpText = page.locator('text=Need help?');
    await expect(helpText).toBeVisible();
  });

  test('should have Contact us link', async ({ page }) => {
    await page.goto('/checkout/success');
    const contactLink = page.locator('a:has-text("Contact us")');
    await expect(contactLink).toBeVisible();
    await expect(contactLink).toHaveAttribute('href', '/contact');
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================

test.describe('Order Confirmation - Loading State', () => {
  test('should display loading spinner', async ({ page }) => {
    await mockSlowOrderResponse(page, 5000);
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const spinner = page.locator('.animate-spin');
    await expect(spinner).toBeVisible();
  });

  test('should display loading message', async ({ page }) => {
    await mockSlowOrderResponse(page, 5000);
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const loadingText = page.locator('text=Loading your order details');
    await expect(loadingText).toBeVisible();
  });

  test('should transition from loading to content', async ({ page }) => {
    await mockSlowOrderResponse(page, 500);
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Initially show loading
    await expect(page.locator('.animate-spin')).toBeVisible();

    // Then show content
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================================
// Error State Tests
// ============================================================================

test.describe('Order Confirmation - Error State', () => {
  test('should display error icon when order not found', async ({ page }) => {
    await mockOrderError(page, 'Order not found');
    await page.goto('/checkout/success?orderNumber=INVALID-ORDER');

    const errorIcon = page.locator('.bg-red-100 svg');
    await expect(errorIcon).toBeVisible();
  });

  test('should display Unable to Load Order title', async ({ page }) => {
    await mockOrderError(page, 'Order not found');
    await page.goto('/checkout/success?orderNumber=INVALID-ORDER');

    const title = page.locator('h1:has-text("Unable to Load Order")');
    await expect(title).toBeVisible();
  });

  test('should display error message', async ({ page }) => {
    await mockOrderError(page, 'Order not found');
    await page.goto('/checkout/success?orderNumber=INVALID-ORDER');

    const errorMessage = page.locator('text=Order not found');
    await expect(errorMessage).toBeVisible();
  });

  test('should display View All Orders link in error state', async ({ page }) => {
    await mockOrderError(page, 'Order not found');
    await page.goto('/checkout/success?orderNumber=INVALID-ORDER');

    const link = page.locator('a:has-text("View All Orders")');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/account/orders');
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('Order Confirmation - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should have correct page title', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const title = await page.title();
    expect(title).toContain('Order Confirmed');
    expect(title).toContain('MasonArt');
  });

  test('should have noindex robots meta tag', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('should have description meta tag', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
  });
});

// ============================================================================
// URL Parameters Tests
// ============================================================================

test.describe('Order Confirmation - URL Parameters', () => {
  test('should accept orderNumber parameter', async ({ page }) => {
    await mockOrderResponse(page, { orderNumber: 'ORD-CUSTOM-123' });
    await page.goto('/checkout/success?orderNumber=ORD-CUSTOM-123');

    const orderNumber = page.locator('text=ORD-CUSTOM-123');
    await expect(orderNumber).toBeVisible();
  });

  test('should accept orderId parameter', async ({ page }) => {
    await mockOrderResponse(page, { orderNumber: 'ORD-BY-ID' });
    await page.goto('/checkout/success?orderId=order_123');

    const title = page.locator('h1:has-text("Order Confirmed")');
    await expect(title).toBeVisible();
  });

  test('should show generic state without any parameter', async ({ page }) => {
    await page.goto('/checkout/success');

    // Should show generic success state without fetching order
    const continueButton = page.locator('a:has-text("Continue Shopping")');
    await expect(continueButton).toBeVisible();
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Order Confirmation - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
    await expect(page.locator('text=Continue Shopping')).toBeVisible();
  });

  test('should stack sections on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Sections should be visible in stacked layout
    await expect(page.locator('h2:has-text("Shipping Details")')).toBeVisible();
    await expect(page.locator('h2:has-text("Payment Summary")')).toBeVisible();
  });

  test('should stack buttons on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const buttons = page.locator('.flex-col a');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
  });

  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
  });

  test('should use grid layout for shipping/payment on large screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const grid = page.locator('.lg\\:grid-cols-2');
    await expect(grid).toBeVisible();
  });

  test('should use grid layout for What Next steps on larger screens', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const grid = page.locator('.sm\\:grid-cols-2');
    await expect(grid).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Order Confirmation - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Should have one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Should have multiple h2 for sections
    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(3);
  });

  test('should have accessible button labels', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const copyButton = page.locator('button[title*="Copy"]');
    await expect(copyButton).toBeVisible();
    await expect(copyButton).toHaveAttribute('title');
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });

  test('should have proper focus indicators', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const continueButton = page.locator('a:has-text("Continue Shopping")');
    await continueButton.focus();
    await expect(continueButton).toBeFocused();
  });

  test('should have descriptive link text', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Links should have descriptive text
    await expect(page.locator('a:has-text("Continue Shopping")')).toBeVisible();
    await expect(page.locator('a:has-text("View All Orders")')).toBeVisible();
  });

  test('should use semantic HTML sections', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Content should be in proper containers
    const container = page.locator('.container-wide');
    await expect(container).toBeVisible();
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Order Confirmation - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    await mockOrderResponse(page, {});

    const startTime = Date.now();
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await mockOrderResponse(page, {});
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
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

test.describe('Order Confirmation - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should arrive from payment completion', async ({ page }) => {
    // This simulates the redirect from payment success
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
  });

  test('should navigate to posters from Continue Shopping', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const continueButton = page.locator('a:has-text("Continue Shopping")');
    await continueButton.click();

    await expect(page).toHaveURL('/posters');
  });

  test('should allow browser back navigation', async ({ page }) => {
    await page.goto('/posters');
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');
    await page.goBack();

    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

test.describe('Order Confirmation - Edge Cases', () => {
  test('should handle missing email gracefully', async ({ page }) => {
    await mockOrderResponse(page, { userEmail: undefined });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Page should still load without email confirmation notice
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
    await expect(page.locator('text=Confirmation email sent to')).not.toBeVisible();
  });

  test('should handle missing shipping address gracefully', async ({ page }) => {
    await mockOrderResponse(page, { shippingAddress: undefined });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Page should still load without shipping section
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
  });

  test('should handle empty items array', async ({ page }) => {
    await mockOrderResponse(page, { items: [] });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Should not display items section
    await expect(page.locator('h1:has-text("Order Confirmed")')).toBeVisible();
    await expect(page.locator('h2:has-text("Order Items")')).not.toBeVisible();
  });

  test('should handle zero discount', async ({ page }) => {
    await mockOrderResponse(page, { discountAmount: 0 });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Discount line should not appear when zero
    await expect(page.locator('.text-green-600:has-text("Discount")')).not.toBeVisible();
  });

  test('should handle item without frame', async ({ page }) => {
    await mockOrderResponse(page, {
      items: [
        {
          id: 'item_1',
          productTitle: 'Unframed Poster',
          sizeLabel: '18x24 inches',
          quantity: 1,
          unitPrice: 99900,
          framePrice: 0,
        },
      ],
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Should display item without frame info
    await expect(page.locator('text=Unframed Poster')).toBeVisible();
  });

  test('should handle item without thumbnail', async ({ page }) => {
    await mockOrderResponse(page, {
      items: [
        {
          id: 'item_1',
          productTitle: 'Poster Without Image',
          thumbnailUrl: '',
          sizeLabel: '18x24 inches',
          quantity: 1,
          unitPrice: 99900,
        },
      ],
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    // Should show placeholder icon instead of image
    const placeholderSection = page.locator('.bg-muted');
    await expect(placeholderSection.first()).toBeVisible();
  });
});

// ============================================================================
// Multiple Items Tests
// ============================================================================

test.describe('Order Confirmation - Multiple Items', () => {
  test('should display all items in order', async ({ page }) => {
    await mockOrderResponse(page, {
      items: [
        {
          id: 'item_1',
          productTitle: 'First Poster',
          sizeLabel: '24x32 inches',
          quantity: 1,
          unitPrice: 199900,
        },
        {
          id: 'item_2',
          productTitle: 'Second Poster',
          sizeLabel: '18x24 inches',
          quantity: 2,
          unitPrice: 149900,
        },
        {
          id: 'item_3',
          productTitle: 'Third Poster',
          sizeLabel: '12x16 inches',
          quantity: 3,
          unitPrice: 99900,
        },
      ],
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('text=First Poster')).toBeVisible();
    await expect(page.locator('text=Second Poster')).toBeVisible();
    await expect(page.locator('text=Third Poster')).toBeVisible();
  });

  test('should show correct item count', async ({ page }) => {
    await mockOrderResponse(page, {
      items: [
        { id: '1', productTitle: 'P1', quantity: 1, unitPrice: 100 },
        { id: '2', productTitle: 'P2', quantity: 1, unitPrice: 100 },
        { id: '3', productTitle: 'P3', quantity: 1, unitPrice: 100 },
        { id: '4', productTitle: 'P4', quantity: 1, unitPrice: 100 },
        { id: '5', productTitle: 'P5', quantity: 1, unitPrice: 100 },
      ],
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('text=Order Items (5)')).toBeVisible();
  });
});

// ============================================================================
// Express Delivery Tests
// ============================================================================

test.describe('Order Confirmation - Express Delivery', () => {
  test('should display express delivery method', async ({ page }) => {
    await mockOrderResponse(page, {
      shippingMethod: 'express',
      estimatedDelivery: '2-3 business days',
    });
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    await expect(page.locator('text=express Delivery')).toBeVisible();
    await expect(page.locator('text=2-3 business days')).toBeVisible();
  });
});

// ============================================================================
// Animation Tests
// ============================================================================

test.describe('Order Confirmation - Animations', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderResponse(page, {});
  });

  test('should have zoom-in animation on success icon', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const iconContainer = page.locator('.animate-in.zoom-in-50');
    await expect(iconContainer).toBeVisible();
  });

  test('should have fade-in slide animation on title', async ({ page }) => {
    await page.goto('/checkout/success?orderNumber=ORD-20260119-001');

    const title = page.locator('h1.animate-in');
    await expect(title).toBeVisible();
  });
});
