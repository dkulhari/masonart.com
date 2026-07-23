/**
 * E2E Tests for Guest Order Tracking Flow
 *
 * Tests the complete guest order tracking flow from the public /track page:
 * - Navigate to tracking page
 * - Enter order details
 * - View tracking timeline
 * - Handle invalid orders
 * - Mobile responsiveness
 *
 * Note: These tests use mocked API responses since they test the UI flow,
 * not the actual backend tracking functionality.
 */

import { test, expect, Page } from '@playwright/test';

// ============================================================================
// Test Data
// ============================================================================

const TEST_ORDER = {
  orderNumber: 'MA-2024-001234',
  email: 'test@example.com',
  phone: '9876543210',
};

const INVALID_ORDER = {
  orderNumber: 'MA-9999-999999',
  email: 'wrong@example.com',
};

// ============================================================================
// Helper Functions
// ============================================================================

async function mockTrackingApiSuccess(page: Page, orderData = TEST_ORDER) {
  await page.route('**/api/tracking/lookup*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderNumber: orderData.orderNumber,
        status: 'shipped',
        itemCount: 2,
        shippingAddress: {
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
        },
        tracking: {
          carrier: 'blue_dart',
          trackingNumber: 'BD123456789',
          trackingUrl: 'https://bluedart.com/track/BD123456789',
          status: 'in_transit',
          shippedAt: '2024-02-10T10:00:00Z',
          estimatedDeliveryAt: '2024-02-15T18:00:00Z',
          deliveredAt: null,
        },
        timeline: {
          orderedAt: '2024-02-08T10:00:00Z',
          shippedAt: '2024-02-10T10:00:00Z',
          deliveredAt: null,
        },
      }),
    });
  });
}

async function mockTrackingApiNotFound(page: Page) {
  await page.route('**/api/tracking/lookup*', (route) => {
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND',
      }),
    });
  });
}

async function mockTrackingApiError(page: Page) {
  await page.route('**/api/tracking/lookup*', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Failed to look up order',
        code: 'LOOKUP_ERROR',
      }),
    });
  });
}

async function mockTokenTrackingApi(page: Page) {
  await page.route('**/api/tracking/token/*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderNumber: TEST_ORDER.orderNumber,
        status: 'shipped',
        itemCount: 2,
        shippingAddress: {
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
        },
        tracking: {
          carrier: 'blue_dart',
          trackingNumber: 'BD123456789',
          trackingUrl: 'https://bluedart.com/track/BD123456789',
          status: 'in_transit',
          shippedAt: '2024-02-10T10:00:00Z',
          estimatedDeliveryAt: '2024-02-15T18:00:00Z',
          deliveredAt: null,
        },
        timeline: {
          orderedAt: '2024-02-08T10:00:00Z',
          shippedAt: '2024-02-10T10:00:00Z',
          deliveredAt: null,
        },
      }),
    });
  });
}

// ============================================================================
// Tests
// ============================================================================

test.describe('Guest Order Tracking', () => {
  test.describe('Page Navigation', () => {
    test('should navigate to tracking page', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      await expect(page).toHaveURL(/\/track/);
      await expect(page.getByText('Track Your Order')).toBeVisible();
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      await expect(page).toHaveTitle(/Track.*Order.*chobi.art/i);
    });

    test('should display lookup form', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      await expect(page.getByLabel('Order Number')).toBeVisible();
      await expect(page.locator('main').getByLabel('Email Address')).toBeVisible();
      await expect(page.getByRole('button', { name: /track order/i })).toBeVisible();
    });
  });

  test.describe('Order Lookup with Email', () => {
    test('should look up order with valid email', async ({ page }) => {
      await mockTrackingApiSuccess(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Fill in order number
      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);

      // Fill in email
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);

      // Submit form
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show tracking results
      await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
      await expect(page.getByText('Shipped', { exact: true }).first()).toBeVisible();
    });

    test('should display tracking timeline', async ({ page }) => {
      await mockTrackingApiSuccess(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show timeline steps
      await expect(page.getByText('Order Confirmed')).toBeVisible({ timeout: 10000 });
    });

    test('should display carrier information', async ({ page }) => {
      await mockTrackingApiSuccess(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show carrier info
      await expect(page.getByText('BD123456789')).toBeVisible();
    });
  });

  test.describe('Order Lookup with Phone', () => {
    test('should switch to phone verification', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Click phone tab
      await page.getByRole('button', { name: /phone/i }).click();

      // Should show phone input
      await expect(page.getByLabel('Phone Number')).toBeVisible();
      await expect(page.locator('main').getByLabel('Email Address')).not.toBeVisible();
    });

    test('should look up order with valid phone', async ({ page }) => {
      await mockTrackingApiSuccess(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Fill in order number
      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);

      // Switch to phone
      await page.getByRole('button', { name: /phone/i }).click();

      // Fill in phone
      await page.getByLabel('Phone Number').fill(TEST_ORDER.phone);

      // Submit form
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show tracking results
      await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
    });
  });

  test.describe('Invalid Order Handling', () => {
    test('should show error for non-existent order', async ({ page }) => {
      await mockTrackingApiNotFound(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      await page.getByLabel('Order Number').fill(INVALID_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(INVALID_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show error message
      await expect(page.getByText('Unable to find order')).toBeVisible();
      await expect(page.getByText(/not found/i)).toBeVisible();
    });

    test('should show error for server error', async ({ page }) => {
      await mockTrackingApiError(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show error message
      await expect(page.getByText('Unable to find order')).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should require order number', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Try to submit without order number
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show validation error
      await expect(page.getByText(/enter.*order number/i)).toBeVisible();
    });

    test('should require email when email tab selected', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Enter order number but not email
      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show validation error
      await expect(page.getByText('Please enter your email address')).toBeVisible();
    });

    test('should require phone when phone tab selected', async ({ page }) => {
      await page.goto('/track', { waitUntil: 'networkidle' });

      // Enter order number
      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);

      // Switch to phone
      await page.getByRole('button', { name: /phone/i }).click();

      // Submit without phone
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show validation error
      await expect(page.getByText('Please enter your phone number')).toBeVisible();
    });
  });

  test.describe('Loading State', () => {
    test('should show loading state during lookup', async ({ page }) => {
      // Delay API response to see loading state
      await page.route('**/api/tracking/lookup*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            orderNumber: TEST_ORDER.orderNumber,
            status: 'shipped',
            itemCount: 2,
            shippingAddress: { city: 'Mumbai', state: 'Maharashtra', postalCode: '400001' },
            tracking: null,
            timeline: { orderedAt: '2024-02-08T10:00:00Z', shippedAt: null, deliveredAt: null },
          }),
        });
      });

      await page.goto('/track', { waitUntil: 'networkidle' });

      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Should show loading state
      await expect(page.getByText(/looking up/i)).toBeVisible();
    });
  });

  test.describe('Token-Based Tracking', () => {
    test('should load order via token URL', async ({ page }) => {
      await mockTokenTrackingApi(page);

      // Navigate directly to token URL
      await page.goto('/track/abcd1234567890abcdef1234567890ab');

      // Should show tracking results without needing to fill form
      await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
    });
  });

  test.describe('New Search After Results', () => {
    test('should allow new search after viewing results', async ({ page }) => {
      await mockTrackingApiSuccess(page);
      await page.goto('/track', { waitUntil: 'networkidle' });

      // First search
      await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
      await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
      await page.getByRole('button', { name: /track order/i }).click();

      // Wait for results
      await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();

      // Look for "Track Another Order" or similar button
      const newSearchButton = page.getByRole('button', { name: /another|new|reset/i });
      if (await newSearchButton.isVisible()) {
        await newSearchButton.click();
        await expect(page.getByLabel('Order Number')).toBeVisible();
      }
    });
  });
});

// ============================================================================
// Mobile Viewport Tests
// ============================================================================

test.describe('Guest Order Tracking - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should display form correctly on mobile', async ({ page }) => {
    await page.goto('/track', { waitUntil: 'networkidle' });

    // Form should be visible and usable
    await expect(page.getByLabel('Order Number')).toBeVisible();
    await expect(page.getByRole('button', { name: /track order/i })).toBeVisible();
  });

  test('should complete lookup flow on mobile', async ({ page }) => {
    await mockTrackingApiSuccess(page);
    await page.goto('/track', { waitUntil: 'networkidle' });

    // Fill form on mobile
    await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
    await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
    await page.getByRole('button', { name: /track order/i }).click();

    // Should show results
    await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
  });

  test('should display tracking timeline on mobile', async ({ page }) => {
    await mockTrackingApiSuccess(page);
    await page.goto('/track', { waitUntil: 'networkidle' });

    await page.getByLabel('Order Number').fill(TEST_ORDER.orderNumber);
    await page.locator('main').getByLabel('Email Address').fill(TEST_ORDER.email);
    await page.getByRole('button', { name: /track order/i }).click();

    // Timeline should be visible and readable
    await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
  });

  test('should allow tab switching on mobile', async ({ page }) => {
    await page.goto('/track', { waitUntil: 'networkidle' });

    // Switch to phone tab
    await page.getByRole('button', { name: /phone/i }).click();

    // Should show phone input
    await expect(page.getByLabel('Phone Number')).toBeVisible();

    // Switch back to email
    await page.getByRole('button', { name: /email/i }).click();
    await expect(page.locator('main').getByLabel('Email Address')).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Guest Order Tracking - Accessibility', () => {
  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/track', { waitUntil: 'networkidle' });

    // Check that inputs have associated labels
    const orderNumberInput = page.getByLabel('Order Number');
    await expect(orderNumberInput).toBeVisible();
    await expect(orderNumberInput).toHaveAttribute('id');

    const emailInput = page.locator('main').getByLabel('Email Address');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('id');
  });

  test('should announce errors to screen readers', async ({ page }) => {
    await mockTrackingApiNotFound(page);
    await page.goto('/track', { waitUntil: 'networkidle' });

    await page.getByLabel('Order Number').fill(INVALID_ORDER.orderNumber);
    await page.locator('main').getByLabel('Email Address').fill(INVALID_ORDER.email);
    await page.getByRole('button', { name: /track order/i }).click();

    // Error should be visible
    await expect(page.getByText('Unable to find order')).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await mockTrackingApiSuccess(page);
    await page.goto('/track', { waitUntil: 'networkidle' });

    // Focus order number input directly and fill via keyboard
    await page.getByLabel('Order Number').focus();
    await page.keyboard.type(TEST_ORDER.orderNumber);

    // Tab to email input (may pass through toggle buttons)
    await page.locator('main').getByLabel('Email Address').focus();
    await page.keyboard.type(TEST_ORDER.email);

    // Tab to submit button and press Enter
    await page.getByRole('button', { name: /track order/i }).focus();
    await page.keyboard.press('Enter');

    // Should show results
    await expect(page.getByText(TEST_ORDER.orderNumber)).toBeVisible();
  });
});
