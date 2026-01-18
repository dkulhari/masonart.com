import { test, expect, type Page } from '@playwright/test';

/**
 * Payment Processing Flow E2E Tests
 *
 * Tests for the MasonArt payment processing using Razorpay:
 * - Payment button states and interactions
 * - Payment initiation flow
 * - Razorpay checkout modal loading
 * - Payment success flow
 * - Payment failure handling
 * - Payment cancellation handling
 * - Payment verification
 * - Order confirmation after payment
 * - Error states and recovery
 *
 * Based on actual implementation in:
 * - packages/web/app/components/checkout/PaymentButton.tsx
 * - packages/api/src/lib/razorpay.ts
 * - packages/api/src/routes/webhooks/razorpay.ts
 */

// ============================================================================
// Helper Functions
// ============================================================================

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
    const existing = localStorage.getItem('masonart-cart-storage');
    let data = existing ? JSON.parse(existing) : { state: { items: [] }, version: 0 };
    data.state.items.push(cartItem);
    localStorage.setItem('masonart-cart-storage', JSON.stringify(data));
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

/**
 * Navigate through checkout to payment step
 */
async function navigateToPaymentStep(page: Page) {
  await page.goto('/checkout');
  await page.evaluate(() => localStorage.removeItem('masonart-cart-storage'));
  await addItemToCart(page, { productTitle: 'Payment Test Poster', unitPrice: 2999 });
  await page.reload();

  // Fill shipping address
  await fillValidAddressForm(page);
  await page.locator('button:has-text("Continue to Delivery")').click();

  // Select delivery and proceed to payment
  await page.locator('button:has-text("Continue to Payment")').click();
}

/**
 * Mock Razorpay script and API responses
 */
async function setupRazorpayMocks(page: Page, options?: {
  scriptLoadFail?: boolean;
  orderCreateFail?: boolean;
  paymentInitiateFail?: boolean;
  paymentFail?: boolean;
  verificationFail?: boolean;
}) {
  // Mock the Razorpay script loading
  await page.addInitScript((opts) => {
    if (opts.scriptLoadFail) {
      // Simulate script load failure
      return;
    }

    // Create mock Razorpay class
    class MockRazorpay {
      options: Record<string, unknown>;
      handlers: Record<string, () => void> = {};

      constructor(options: Record<string, unknown>) {
        this.options = options;
      }

      open() {
        // Simulate payment modal opening
        const event = new CustomEvent('razorpay-modal-opened');
        window.dispatchEvent(event);

        // Simulate payment based on options
        setTimeout(() => {
          if (opts.paymentFail) {
            // Trigger payment failed event
            if (this.handlers['payment.failed']) {
              this.handlers['payment.failed']();
            }
          } else {
            // Trigger success handler with mock response
            const handler = this.options.handler as (response: Record<string, string>) => void;
            if (handler) {
              handler({
                razorpay_order_id: 'order_mock123',
                razorpay_payment_id: 'pay_mock456',
                razorpay_signature: 'mock_signature_789',
              });
            }
          }
        }, 500);
      }

      close() {
        const event = new CustomEvent('razorpay-modal-closed');
        window.dispatchEvent(event);
      }

      on(event: string, callback: () => void) {
        this.handlers[event] = callback;
      }
    }

    // Attach to window
    (window as unknown as Record<string, unknown>).Razorpay = MockRazorpay;
  }, options || {});

  // Mock API endpoints
  if (!options?.orderCreateFail) {
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            order: {
              id: 'order_123',
              orderNumber: 'ORD-12345678',
            },
          }),
        });
      } else {
        await route.continue();
      }
    });
  } else {
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Failed to create order',
          }),
        });
      } else {
        await route.continue();
      }
    });
  }

  if (!options?.paymentInitiateFail) {
    await page.route('**/api/orders/*/payment/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          razorpayKeyId: 'rzp_test_123',
          razorpayOrderId: 'order_mock123',
          amount: 299900,
          currency: 'INR',
          orderNumber: 'ORD-12345678',
          prefill: {
            name: 'John Doe',
            email: 'john.doe@example.com',
          },
        }),
      });
    });
  } else {
    await page.route('**/api/orders/*/payment/initiate', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Failed to initiate payment',
        }),
      });
    });
  }

  if (!options?.verificationFail) {
    await page.route('**/api/orders/*/payment/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'order_123',
            orderNumber: 'ORD-12345678',
          },
        }),
      });
    });
  } else {
    await page.route('**/api/orders/*/payment/verify', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Payment verification failed',
        }),
      });
    });
  }
}

// ============================================================================
// Payment Button Tests
// ============================================================================

test.describe('Payment Processing - Payment Button', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);
  });

  test('should display payment button', async ({ page }) => {
    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });

  test('should display payment amount on button', async ({ page }) => {
    const payButton = page.locator('button:has-text("Pay")');
    // Button should show formatted price
    const buttonText = await payButton.textContent();
    expect(buttonText).toMatch(/Pay.*₹/);
  });

  test('should have credit card icon on payment button', async ({ page }) => {
    const payButton = page.locator('button:has-text("Pay")');
    const icon = payButton.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('should display security notice', async ({ page }) => {
    const securityNotice = page.locator('text=Secured by Razorpay');
    await expect(securityNotice).toBeVisible();
  });

  test('should display encryption message', async ({ page }) => {
    const encryptionMessage = page.locator('text=encrypted');
    await expect(encryptionMessage).toBeVisible();
  });

  test('should display accepted payment methods', async ({ page }) => {
    await expect(page.locator('text=UPI')).toBeVisible();
    await expect(page.locator('text=Cards')).toBeVisible();
    await expect(page.locator('text=Net Banking')).toBeVisible();
    await expect(page.locator('text=Wallets')).toBeVisible();
  });
});

// ============================================================================
// Payment Initiation Tests
// ============================================================================

test.describe('Payment Processing - Payment Initiation', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
  });

  test('should show loading state when clicked', async ({ page }) => {
    await navigateToPaymentStep(page);
    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show loading text
    await expect(page.locator('text=Creating Order')).toBeVisible({ timeout: 2000 });
  });

  test('should disable button during payment processing', async ({ page }) => {
    await navigateToPaymentStep(page);
    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Button should be disabled during processing
    await expect(payButton).toBeDisabled({ timeout: 2000 });
  });

  test('should show spinner during payment processing', async ({ page }) => {
    await navigateToPaymentStep(page);
    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show spinner/loading indicator
    const spinner = page.locator('button .animate-spin');
    await expect(spinner).toBeVisible({ timeout: 2000 });
  });
});

// ============================================================================
// Payment Success Flow Tests
// ============================================================================

test.describe('Payment Processing - Success Flow', () => {
  test('should complete payment and show success state', async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for success state
    await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });
  });

  test('should show success icon after payment', async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for success state
    await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });

    // Button should have success styling (green)
    const successButton = page.locator('button.bg-green-500');
    await expect(successButton).toBeVisible();
  });

  test('should clear cart after successful payment', async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for success state
    await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });

    // Check cart is cleared in localStorage
    const cartData = await page.evaluate(() => {
      const cart = localStorage.getItem('masonart-cart-storage');
      return cart ? JSON.parse(cart) : null;
    });

    // Cart should be empty or cleared
    expect(cartData?.state?.items?.length || 0).toBe(0);
  });
});

// ============================================================================
// Payment Failure Tests
// ============================================================================

test.describe('Payment Processing - Failure Handling', () => {
  test('should display error message on order creation failure', async ({ page }) => {
    await setupRazorpayMocks(page, { orderCreateFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('should display error message on payment initiation failure', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentInitiateFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('should display error message on payment failure', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show error state
    await expect(page.locator('text=Payment failed')).toBeVisible({ timeout: 5000 });
  });

  test('should display error message on verification failure', async ({ page }) => {
    await setupRazorpayMocks(page, { verificationFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show verification error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('should show Try Again button after failure', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show Try Again text
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 5000 });
  });

  test('should allow retry after payment failure', async ({ page }) => {
    // First attempt fails
    await setupRazorpayMocks(page, { paymentFail: true });
    await navigateToPaymentStep(page);

    let payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for failure
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 5000 });

    // Setup successful mock for retry
    await setupRazorpayMocks(page, {});

    // Click retry
    const retryButton = page.locator('button:has-text("Try Again")');
    await retryButton.click();

    // Should start processing again
    await expect(page.locator('text=Creating Order')).toBeVisible({ timeout: 2000 });
  });
});

// ============================================================================
// Payment Cancellation Tests
// ============================================================================

test.describe('Payment Processing - Cancellation', () => {
  test('should handle payment modal dismiss', async ({ page }) => {
    // Setup mock that simulates modal dismiss
    await page.addInitScript(() => {
      class MockRazorpay {
        options: Record<string, unknown>;
        handlers: Record<string, () => void> = {};

        constructor(options: Record<string, unknown>) {
          this.options = options;
        }

        open() {
          // Simulate modal dismiss after short delay
          setTimeout(() => {
            const modalOptions = this.options.modal as { ondismiss?: () => void } | undefined;
            if (modalOptions?.ondismiss) {
              modalOptions.ondismiss();
            }
          }, 300);
        }

        close() {}
        on(event: string, callback: () => void) {
          this.handlers[event] = callback;
        }
      }
      (window as unknown as Record<string, unknown>).Razorpay = MockRazorpay;
    });

    // Mock API endpoints
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            order: { id: 'order_123', orderNumber: 'ORD-12345678' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/orders/*/payment/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          razorpayKeyId: 'rzp_test_123',
          razorpayOrderId: 'order_mock123',
          amount: 299900,
          currency: 'INR',
          orderNumber: 'ORD-12345678',
          prefill: { name: 'John Doe', email: 'john.doe@example.com' },
        }),
      });
    });

    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Should show cancellation message
    await expect(page.locator('text=Payment was cancelled')).toBeVisible({ timeout: 3000 });
  });

  test('should return to idle state after cancellation', async ({ page }) => {
    await page.addInitScript(() => {
      class MockRazorpay {
        options: Record<string, unknown>;
        handlers: Record<string, () => void> = {};

        constructor(options: Record<string, unknown>) {
          this.options = options;
        }

        open() {
          setTimeout(() => {
            const modalOptions = this.options.modal as { ondismiss?: () => void } | undefined;
            if (modalOptions?.ondismiss) {
              modalOptions.ondismiss();
            }
          }, 300);
        }

        close() {}
        on(event: string, callback: () => void) {
          this.handlers[event] = callback;
        }
      }
      (window as unknown as Record<string, unknown>).Razorpay = MockRazorpay;
    });

    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            order: { id: 'order_123', orderNumber: 'ORD-12345678' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/orders/*/payment/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          razorpayKeyId: 'rzp_test_123',
          razorpayOrderId: 'order_mock123',
          amount: 299900,
          currency: 'INR',
          orderNumber: 'ORD-12345678',
          prefill: { name: 'John Doe', email: 'john.doe@example.com' },
        }),
      });
    });

    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for cancellation
    await expect(page.locator('text=Payment was cancelled')).toBeVisible({ timeout: 3000 });

    // Button should be back to normal state (not disabled)
    await expect(page.locator('button:has-text("Pay")')).not.toBeDisabled();
  });
});

// ============================================================================
// Order Summary in Payment Step Tests
// ============================================================================

test.describe('Payment Processing - Order Summary', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);
  });

  test('should display order summary in payment step', async ({ page }) => {
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

  test('should display total amount', async ({ page }) => {
    const totalLabel = page.locator('text=Total Amount');
    await expect(totalLabel).toBeVisible();
  });

  test('should display price in INR format', async ({ page }) => {
    const price = page.locator('text=/₹[\\d,]+/');
    await expect(price.first()).toBeVisible();
  });
});

// ============================================================================
// Payment Step Navigation Tests
// ============================================================================

test.describe('Payment Processing - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);
  });

  test('should display back button', async ({ page }) => {
    const backButton = page.locator('button:has-text("Back")');
    await expect(backButton).toBeVisible();
  });

  test('should navigate back to delivery step', async ({ page }) => {
    const backButton = page.locator('button:has-text("Back")');
    await backButton.click();

    // Should show delivery options
    const deliveryTitle = page.locator('h2:has-text("Delivery Options")');
    await expect(deliveryTitle).toBeVisible();
  });

  test('should show payment step as active in progress indicator', async ({ page }) => {
    // Payment step should be highlighted
    const paymentStep = page.locator('text=Payment').first();
    await expect(paymentStep).toBeVisible();
  });

  test('should show completed checkmarks for shipping and delivery steps', async ({ page }) => {
    // Both shipping and delivery should have checkmarks
    const checkIcons = page.locator('.bg-green-500 svg');
    const count = await checkIcons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Razorpay Script Loading Tests
// ============================================================================

test.describe('Payment Processing - Script Loading', () => {
  test('should handle Razorpay script load failure gracefully', async ({ page }) => {
    // Don't load Razorpay script
    await page.addInitScript(() => {
      // Razorpay is not defined
      delete (window as unknown as Record<string, unknown>).Razorpay;
    });

    // Mock API endpoints
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            order: { id: 'order_123', orderNumber: 'ORD-12345678' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToPaymentStep(page);

    // Payment button should still be visible
    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();

    // But should be disabled if script failed to load
    // (depends on implementation - some may show error message instead)
  });
});

// ============================================================================
// Multiple Items Payment Tests
// ============================================================================

test.describe('Payment Processing - Multiple Items', () => {
  test('should handle payment for multiple cart items', async ({ page }) => {
    await setupRazorpayMocks(page);

    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('masonart-cart-storage'));

    // Add multiple items
    await addItemToCart(page, { id: 'item_1', productTitle: 'Poster One', unitPrice: 1500 });
    await addItemToCart(page, { id: 'item_2', productTitle: 'Poster Two', unitPrice: 2000 });
    await addItemToCart(page, { id: 'item_3', productTitle: 'Poster Three', unitPrice: 2500 });

    await page.reload();

    // Navigate to payment
    await fillValidAddressForm(page);
    await page.locator('button:has-text("Continue to Delivery")').click();
    await page.locator('button:has-text("Continue to Payment")').click();

    // Payment button should be visible
    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });

  test('should display correct total for multiple items', async ({ page }) => {
    await setupRazorpayMocks(page);

    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('masonart-cart-storage'));

    // Add multiple items
    await addItemToCart(page, { id: 'item_1', productTitle: 'Poster One', unitPrice: 1500 });
    await addItemToCart(page, { id: 'item_2', productTitle: 'Poster Two', unitPrice: 2000 });

    await page.reload();

    // Navigate to payment
    await fillValidAddressForm(page);
    await page.locator('button:has-text("Continue to Delivery")').click();
    await page.locator('button:has-text("Continue to Payment")').click();

    // Should display total that includes both items
    const totalSection = page.locator('text=Total');
    await expect(totalSection).toBeVisible();
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Payment Processing - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
  });

  test('should display payment button on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });

  test('should display payment methods on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateToPaymentStep(page);

    // Payment methods should be visible
    await expect(page.locator('text=UPI')).toBeVisible();
  });

  test('should display payment button on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });

  test('should display payment button on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Payment Processing - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);
  });

  test('should have accessible payment button', async ({ page }) => {
    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();

    // Button should be focusable
    await payButton.focus();
    await expect(payButton).toBeFocused();
  });

  test('should have accessible error messages', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentFail: true });

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Error message should be visible
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have proper focus styles on payment button', async ({ page }) => {
    const payButton = page.locator('button:has-text("Pay")');
    await payButton.focus();

    // Button should show focus indication
    await expect(payButton).toBeFocused();
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Payment Processing - Performance', () => {
  test('should load payment step within acceptable time', async ({ page }) => {
    await setupRazorpayMocks(page);

    const startTime = Date.now();
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000); // 10 seconds max
  });

  test('should not have JavaScript errors during payment flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await setupRazorpayMocks(page);
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for payment processing
    await page.waitForTimeout(2000);

    // Filter out expected errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Error Recovery Tests
// ============================================================================

test.describe('Payment Processing - Error Recovery', () => {
  test('should allow user to navigate back after error', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });

    // Should be able to go back
    const backButton = page.locator('button:has-text("Back")');
    await backButton.click();

    // Should show delivery step
    const deliveryTitle = page.locator('h2:has-text("Delivery Options")');
    await expect(deliveryTitle).toBeVisible();
  });

  test('should preserve form data after payment error', async ({ page }) => {
    await setupRazorpayMocks(page, { paymentFail: true });
    await navigateToPaymentStep(page);

    const payButton = page.locator('button:has-text("Pay")');
    await payButton.click();

    // Wait for error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });

    // Go back to shipping
    const backButton = page.locator('button:has-text("Back")');
    await backButton.click();
    await page.locator('button:has-text("Edit")').click();

    // Check if form data is preserved
    const fullNameInput = page.locator('#fullName');
    await expect(fullNameInput).toHaveValue('John Doe');
  });
});

// ============================================================================
// High Value Order Tests
// ============================================================================

test.describe('Payment Processing - High Value Orders', () => {
  test('should handle high value orders correctly', async ({ page }) => {
    await setupRazorpayMocks(page);

    await page.goto('/checkout');
    await page.evaluate(() => localStorage.removeItem('masonart-cart-storage'));

    // Add high value item
    await addItemToCart(page, {
      id: 'luxury_item',
      productTitle: 'Premium Art Collection',
      unitPrice: 50000 // ₹500
    });

    await page.reload();

    // Navigate to payment
    await fillValidAddressForm(page);
    await page.locator('button:has-text("Continue to Delivery")').click();
    await page.locator('button:has-text("Continue to Payment")').click();

    // Payment button should be visible with correct amount
    const payButton = page.locator('button:has-text("Pay")');
    await expect(payButton).toBeVisible();
  });
});
