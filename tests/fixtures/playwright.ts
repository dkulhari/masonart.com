/**
 * Playwright Test Fixtures & Helpers
 *
 * Provides utilities for E2E testing with Playwright
 */

import type { Page, BrowserContext } from '@playwright/test';
import type { User } from './users';
import type { Product } from './products';
import type { Order } from './orders';

/**
 * Test data seed configuration
 */
export interface TestSeedConfig {
  products?: number;
  users?: number;
  orders?: number;
  aiGenerations?: number;
}

/**
 * Common test user credentials
 * All test users use the same password for simplicity
 */
const TEST_PASSWORD = 'TestPassword123!';

export const testCredentials = {
  // Primary customer
  customer: {
    email: 'test-customer@example.com',
    password: TEST_PASSWORD,
    name: 'Test Customer',
  },
  // Additional customers for cart independence testing
  customer2: {
    email: 'test-customer-2@example.com',
    password: TEST_PASSWORD,
    name: 'Alice Tester',
  },
  customer3: {
    email: 'test-customer-3@example.com',
    password: TEST_PASSWORD,
    name: 'Bob Buyer',
  },
  customer4: {
    email: 'test-customer-4@example.com',
    password: TEST_PASSWORD,
    name: 'Carol Checkout',
  },
  customer5: {
    email: 'test-customer-5@example.com',
    password: TEST_PASSWORD,
    name: 'Dave Demo',
  },
  // Admins
  admin: {
    email: 'test-admin@chobi.art',
    password: TEST_PASSWORD,
    name: 'Test Admin',
  },
  admin2: {
    email: 'test-admin-2@chobi.art',
    password: TEST_PASSWORD,
    name: 'Admin Secondary',
  },
  // Trade users
  trade: {
    email: 'test-trade@interior.com',
    password: TEST_PASSWORD,
    name: 'Test Trade User',
  },
  tradePending: {
    email: 'test-trade-pending@interior.com',
    password: TEST_PASSWORD,
    name: 'Pending Trade',
  },
};

/**
 * Common test URLs
 */
export const testUrls = {
  home: '/',
  products: '/products',
  product: (slug: string) => `/products/${slug}`,
  cart: '/cart',
  checkout: '/checkout',
  login: '/login',
  register: '/register',
  account: '/account',
  orders: '/account/orders',
  order: (id: string) => `/account/orders/${id}`,
  aiGenerator: '/create',
  aiHistory: '/account/creations',
  admin: {
    dashboard: '/admin',
    products: '/admin/products',
    product: (id: string) => `/admin/products/${id}`,
    orders: '/admin/orders',
    order: (id: string) => `/admin/orders/${id}`,
    users: '/admin/users',
  },
};

/**
 * Viewport configurations for responsive testing
 */
export const viewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  largeDesktop: { width: 1920, height: 1080 },
};

/**
 * Wait for a specific network state
 */
export async function waitForNetwork(page: Page, state: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<void> {
  await page.waitForLoadState(state);
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForResponse(
    (response) => {
      if (typeof urlPattern === 'string') {
        return response.url().includes(urlPattern);
      }
      return urlPattern.test(response.url());
    }
  );
}

/**
 * Fill login form
 */
export async function fillLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.fill('[data-testid="email-input"], input[name="email"], #email', email);
  await page.fill('[data-testid="password-input"], input[name="password"], #password', password);
}

/**
 * Fill registration form
 */
export async function fillRegistrationForm(
  page: Page,
  data: { name: string; email: string; password: string; confirmPassword?: string }
): Promise<void> {
  await page.fill('[data-testid="name-input"], input[name="name"], #name', data.name);
  await page.fill('[data-testid="email-input"], input[name="email"], #email', data.email);
  await page.fill('[data-testid="password-input"], input[name="password"], #password', data.password);
  if (data.confirmPassword) {
    await page.fill('[data-testid="confirm-password-input"], input[name="confirmPassword"], #confirmPassword', data.confirmPassword);
  }
}

/**
 * Fill shipping address form
 */
export async function fillShippingForm(
  page: Page,
  address: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  }
): Promise<void> {
  await page.fill('[data-testid="full-name"], input[name="fullName"]', address.fullName);
  await page.fill('[data-testid="phone"], input[name="phone"]', address.phone);
  await page.fill('[data-testid="address-line1"], input[name="addressLine1"]', address.addressLine1);
  if (address.addressLine2) {
    await page.fill('[data-testid="address-line2"], input[name="addressLine2"]', address.addressLine2);
  }
  await page.fill('[data-testid="city"], input[name="city"]', address.city);
  await page.fill('[data-testid="state"], input[name="state"]', address.state);
  await page.fill('[data-testid="pincode"], input[name="pincode"]', address.pincode);
  if (address.country) {
    await page.fill('[data-testid="country"], input[name="country"]', address.country);
  }
}

/**
 * Add product to cart via UI
 */
export async function addToCart(
  page: Page,
  options?: { quantity?: number; size?: string; frame?: string }
): Promise<void> {
  // Select size if specified
  if (options?.size) {
    await page.click(`[data-testid="size-${options.size}"], [data-size="${options.size}"]`);
  }

  // Select frame if specified
  if (options?.frame) {
    await page.click(`[data-testid="frame-${options.frame}"], [data-frame="${options.frame}"]`);
  }

  // Set quantity if specified and different from 1
  if (options?.quantity && options.quantity > 1) {
    const quantityInput = page.locator('[data-testid="quantity-input"], input[name="quantity"]');
    await quantityInput.fill(String(options.quantity));
  }

  // Click add to cart button
  await page.click('[data-testid="add-to-cart"], button:has-text("Add to Cart")');
}

/**
 * Navigate to product and add to cart
 */
export async function navigateAndAddToCart(
  page: Page,
  productSlug: string,
  options?: { quantity?: number; size?: string; frame?: string }
): Promise<void> {
  await page.goto(testUrls.product(productSlug));
  await waitForNetwork(page, 'load');
  await addToCart(page, options);
}

/**
 * Login helper
 */
export async function login(
  page: Page,
  credentials: { email: string; password: string }
): Promise<void> {
  await page.goto(testUrls.login);
  await fillLoginForm(page, credentials.email, credentials.password);
  await page.click('[data-testid="login-button"], button[type="submit"]:has-text("Login"), button[type="submit"]:has-text("Sign In")');
  await waitForNetwork(page);
}

/**
 * Logout helper
 */
export async function logout(page: Page): Promise<void> {
  // Try clicking logout button/link
  const logoutButton = page.locator('[data-testid="logout-button"], a:has-text("Logout"), button:has-text("Logout")');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  } else {
    // Navigate to account menu first
    await page.click('[data-testid="user-menu"], [data-testid="account-menu"]');
    await page.click('[data-testid="logout-button"], button:has-text("Logout")');
  }
  await waitForNetwork(page);
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const userMenu = page.locator('[data-testid="user-menu"], [data-testid="account-link"]');
  return userMenu.isVisible();
}

/**
 * Get cart count from UI
 */
export async function getCartCount(page: Page): Promise<number> {
  const cartBadge = page.locator('[data-testid="cart-count"], .cart-count, .cart-badge');
  const text = await cartBadge.textContent();
  return text ? parseInt(text, 10) || 0 : 0;
}

/**
 * Clear cart
 */
export async function clearCart(page: Page): Promise<void> {
  await page.goto(testUrls.cart);
  await waitForNetwork(page, 'load');

  // Click clear cart or remove all items
  const clearButton = page.locator('[data-testid="clear-cart"], button:has-text("Clear Cart")');
  if (await clearButton.isVisible()) {
    await clearButton.click();
    await waitForNetwork(page);
  } else {
    // Remove items one by one
    while (true) {
      const removeButton = page.locator('[data-testid="remove-item"], button:has-text("Remove")').first();
      if (!(await removeButton.isVisible())) break;
      await removeButton.click();
      await waitForNetwork(page);
    }
  }
}

/**
 * Take screenshot with timestamp
 * Returns a Uint8Array (Buffer in Node.js)
 */
export async function takeTimestampedScreenshot(
  page: Page,
  name: string
): Promise<Uint8Array> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Check for accessibility issues (basic)
 */
export async function checkBasicAccessibility(page: Page): Promise<{
  hasAltText: boolean;
  hasLabels: boolean;
  hasHeadings: boolean;
}> {
  const imagesWithoutAlt = await page.locator('img:not([alt])').count();
  const inputsWithoutLabels = await page.locator('input:not([aria-label]):not([id])').count();
  const hasHeadings = await page.locator('h1, h2, h3').count() > 0;

  return {
    hasAltText: imagesWithoutAlt === 0,
    hasLabels: inputsWithoutLabels === 0,
    hasHeadings,
  };
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: response.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body || {}),
      headers: response.headers,
    });
  });
}

/**
 * Setup authenticated session (cookie-based)
 */
export async function setupAuthenticatedSession(
  context: BrowserContext,
  sessionData: {
    token: string;
    userId: string;
    expiresAt: string;
  }
): Promise<void> {
  await context.addCookies([
    {
      name: 'session_token',
      value: sessionData.token,
      domain: 'localhost',
      path: '/',
      expires: Date.now() / 1000 + 86400, // 24 hours
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Generate unique test identifiers
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate unique email for test user
 */
export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}@test.example.com`;
}

/**
 * Common assertions helper
 */
export const assertions = {
  /**
   * Assert page title contains text
   */
  async titleContains(page: Page, text: string): Promise<boolean> {
    const title = await page.title();
    return title.toLowerCase().includes(text.toLowerCase());
  },

  /**
   * Assert URL contains path
   */
  urlContains(page: Page, path: string): boolean {
    return page.url().includes(path);
  },

  /**
   * Assert element has text
   */
  async elementHasText(page: Page, selector: string, text: string): Promise<boolean> {
    const element = page.locator(selector);
    const content = await element.textContent();
    return content?.includes(text) || false;
  },

  /**
   * Assert toast/notification appears
   */
  async toastAppears(page: Page, text?: string): Promise<boolean> {
    const toast = page.locator('[data-testid="toast"], .toast, .notification, [role="alert"]');
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    if (text) {
      const content = await toast.textContent();
      return content?.includes(text) || false;
    }
    return true;
  },
};

/**
 * Common selectors for reuse
 */
export const selectors = {
  // Navigation
  header: 'header, [data-testid="header"]',
  footer: 'footer, [data-testid="footer"]',
  nav: 'nav, [data-testid="navigation"]',
  logo: '[data-testid="logo"], .logo',
  cartIcon: '[data-testid="cart-icon"], .cart-icon',

  // Products
  productCard: '[data-testid="product-card"], .product-card',
  productGrid: '[data-testid="product-grid"], .product-grid',
  productTitle: '[data-testid="product-title"], .product-title',
  productPrice: '[data-testid="product-price"], .product-price',
  addToCartButton: '[data-testid="add-to-cart"], button:has-text("Add to Cart")',

  // Forms
  form: 'form',
  input: 'input',
  button: 'button',
  select: 'select',
  submitButton: 'button[type="submit"]',

  // Cart
  cartItem: '[data-testid="cart-item"], .cart-item',
  cartTotal: '[data-testid="cart-total"], .cart-total',
  checkoutButton: '[data-testid="checkout-button"], button:has-text("Checkout")',

  // Auth
  loginForm: '[data-testid="login-form"], form.login-form',
  registerForm: '[data-testid="register-form"], form.register-form',

  // Loading states
  spinner: '[data-testid="spinner"], .spinner, .loading',
  skeleton: '[data-testid="skeleton"], .skeleton',
};
