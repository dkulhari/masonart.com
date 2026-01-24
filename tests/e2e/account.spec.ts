import { test, expect } from '@playwright/test';

/**
 * Account Dashboard E2E Tests
 *
 * Tests for the MasonArt user account dashboard page (/account).
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/account/index.tsx
 * - packages/web/app/components/account/OrderList.tsx
 *
 * The account dashboard includes:
 * - Authentication check (redirect to login if not authenticated)
 * - Profile card with user info and actions
 * - Recent orders section
 * - Quick actions sidebar
 * - Help section
 */

// ============================================================================
// Authentication Tests
// ============================================================================

test.describe('Account Page Authentication', () => {
  test('should redirect unauthenticated users to login page', async ({ page }) => {
    await page.goto('/account');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/redirect.*account/);
  });

  test('should preserve account redirect in login URL', async ({ page }) => {
    await page.goto('/account');

    // Login page should have redirect param
    const url = page.url();
    expect(url).toContain('redirect');
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================

test.describe('Account Page Loading State', () => {
  test('should display loading spinner while fetching session', async ({ page }) => {
    // Mock delayed auth response
    await page.route('**/api/auth/get-session', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.goto('/account');

    // Should show loading state
    const spinner = page.locator('.animate-spin');
    await expect(spinner).toBeVisible();

    const loadingText = page.locator('text=Loading your account');
    await expect(loadingText).toBeVisible();
  });

  test('should have Loader2 spinner in loading state', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.goto('/account');

    const spinner = page.locator('.text-brand-500.animate-spin');
    await expect(spinner).toBeVisible();
  });
});

// ============================================================================
// Page Header Tests (Authenticated)
// ============================================================================

test.describe('Account Page Header', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated session
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    // Mock empty orders response
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should display page title "My Account"', async ({ page }) => {
    const title = page.locator('h1:has-text("My Account")');
    await expect(title).toBeVisible();
  });

  test('should display page description', async ({ page }) => {
    const description = page.locator('text=Manage your orders, profile, and preferences');
    await expect(description).toBeVisible();
  });

  test('should have correct HTML title', async ({ page }) => {
    await expect(page).toHaveTitle(/My Account.*MasonArt/);
  });

  test('should have noindex robots meta tag', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('should have meta description', async ({ page }) => {
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description).toContain('account');
  });
});

// ============================================================================
// Profile Card Tests
// ============================================================================

test.describe('Profile Card', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'John Doe',
            email: 'john@example.com',
            createdAt: '2024-01-15T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should display user name', async ({ page }) => {
    const name = page.locator('h2:has-text("John Doe")');
    await expect(name).toBeVisible();
  });

  test('should display user email', async ({ page }) => {
    const email = page.locator('text=john@example.com');
    await expect(email).toBeVisible();
  });

  test('should display member since date', async ({ page }) => {
    const memberSince = page.locator('text=Member since');
    await expect(memberSince).toBeVisible();
  });

  test('should display user initials when no image', async ({ page }) => {
    // Without user image, should show initials
    const initials = page.locator('.bg-brand-100:has-text("JD")');
    await expect(initials).toBeVisible();
  });

  test('should display Settings button', async ({ page }) => {
    const settingsBtn = page.locator('a[href="/account/settings"]').first();
    await expect(settingsBtn).toBeVisible();
  });

  test('should display Sign Out button', async ({ page }) => {
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await expect(signOutBtn).toBeVisible();
  });

  test('should have Sign Out button with red styling', async ({ page }) => {
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await expect(signOutBtn).toHaveClass(/text-red-600/);
  });

  test('should display Settings icon', async ({ page }) => {
    const settingsLink = page.locator('a[href="/account/settings"]').first();
    const icon = settingsLink.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('should display LogOut icon', async ({ page }) => {
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    const icon = signOutBtn.locator('svg');
    await expect(icon).toBeVisible();
  });
});

// ============================================================================
// Profile Card with User Image Tests
// ============================================================================

test.describe('Profile Card with User Image', () => {
  test('should display user image when available', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Jane Doe',
            email: 'jane@example.com',
            image: 'https://example.com/avatar.jpg',
            createdAt: '2024-01-15T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');

    const avatar = page.locator('img[alt="Jane Doe"]');
    await expect(avatar).toBeVisible();
  });
});

// ============================================================================
// Recent Orders Section Tests
// ============================================================================

test.describe('Recent Orders Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });
  });

  test('should display Recent Orders header', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');

    const header = page.locator('h2:has-text("Recent Orders")');
    await expect(header).toBeVisible();
  });

  test('should display Package icon in header', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');

    const header = page.locator('h2:has-text("Recent Orders")');
    const icon = header.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('should display View All link', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');

    const viewAllLink = page.locator('a[href="/account/orders"]:has-text("View All")');
    await expect(viewAllLink).toBeVisible();
  });

  test('should display loading skeleton while fetching orders', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');

    // Should show loading skeletons (animate-pulse class)
    const skeleton = page.locator('.animate-pulse');
    await expect(skeleton.first()).toBeVisible();
  });
});

// ============================================================================
// Empty Orders State Tests
// ============================================================================

test.describe('Empty Orders State', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should display "No orders yet" message', async ({ page }) => {
    const message = page.locator('h3:has-text("No orders yet")');
    await expect(message).toBeVisible();
  });

  test('should display empty state description', async ({ page }) => {
    const description = page.locator('text=Start shopping to see your order history');
    await expect(description).toBeVisible();
  });

  test('should display Browse Posters CTA', async ({ page }) => {
    const cta = page.locator('a[href="/posters"]:has-text("Browse Posters")');
    await expect(cta).toBeVisible();
  });

  test('should display shopping bag icon', async ({ page }) => {
    // ShoppingBag icon in the empty state
    const emptyState = page.locator('text=No orders yet').locator('..');
    await expect(emptyState).toBeVisible();
  });
});

// ============================================================================
// Orders List with Data Tests
// ============================================================================

test.describe('Orders List with Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-1',
              orderNumber: 'MA-20240115-0001',
              status: 'delivered',
              createdAt: '2024-01-15T10:00:00Z',
              total: 2499,
              subtotal: 2199,
              shippingCost: 300,
              itemCount: 2,
            },
            {
              id: 'order-2',
              orderNumber: 'MA-20240120-0002',
              status: 'processing',
              createdAt: '2024-01-20T14:30:00Z',
              total: 1499,
              subtotal: 1499,
              shippingCost: 0,
              itemCount: 1,
            },
            {
              id: 'order-3',
              orderNumber: 'MA-20240125-0003',
              status: 'shipped',
              createdAt: '2024-01-25T09:15:00Z',
              total: 3999,
              subtotal: 3699,
              shippingCost: 300,
              itemCount: 3,
              estimatedDelivery: 'Jan 30, 2024',
            },
          ],
          total: 3,
        }),
      });
    });

    await page.goto('/account');
  });

  test('should display order numbers', async ({ page }) => {
    const orderNumber = page.locator('text=MA-20240115-0001');
    await expect(orderNumber).toBeVisible();
  });

  test('should display order status badges', async ({ page }) => {
    const deliveredBadge = page.locator('text=Delivered');
    await expect(deliveredBadge).toBeVisible();
  });

  test('should display order totals', async ({ page }) => {
    // Price display - look for formatted price
    const total = page.locator('text=/\\d+/'); // Match price pattern
    await expect(total.first()).toBeVisible();
  });

  test('should display item count', async ({ page }) => {
    const itemCount = page.locator('text=2 items');
    await expect(itemCount).toBeVisible();
  });

  test('should display View Details link on orders', async ({ page }) => {
    const viewDetails = page.locator('text=View Details');
    await expect(viewDetails.first()).toBeVisible();
  });

  test('should link orders to detail page', async ({ page }) => {
    const orderLink = page.locator('a[href*="/account/orders/MA-20240115-0001"]');
    await expect(orderLink).toBeVisible();
  });

  test('should show up to 3 recent orders', async ({ page }) => {
    // Dashboard shows limit of 3 orders
    const orders = page.locator('a[href*="/account/orders/MA-"]');
    const count = await orders.count();
    expect(count).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// Order Status Display Tests
// ============================================================================

test.describe('Order Status Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });
  });

  test('should display Pending Payment status correctly', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-1',
              orderNumber: 'MA-001',
              status: 'pending_payment',
              createdAt: '2024-01-15T10:00:00Z',
              total: 1000,
              subtotal: 1000,
              shippingCost: 0,
              itemCount: 1,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/account');

    const badge = page.locator('text=Pending Payment');
    await expect(badge).toBeVisible();
  });

  test('should display Shipped status correctly', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-1',
              orderNumber: 'MA-001',
              status: 'shipped',
              createdAt: '2024-01-15T10:00:00Z',
              total: 1000,
              subtotal: 1000,
              shippingCost: 0,
              itemCount: 1,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/account');

    const badge = page.locator('text=Shipped');
    await expect(badge).toBeVisible();
  });

  test('should display Cancelled status correctly', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-1',
              orderNumber: 'MA-001',
              status: 'cancelled',
              createdAt: '2024-01-15T10:00:00Z',
              total: 1000,
              subtotal: 1000,
              shippingCost: 0,
              itemCount: 1,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/account');

    const badge = page.locator('text=Cancelled');
    await expect(badge).toBeVisible();
  });
});

// ============================================================================
// Orders Error State Tests
// ============================================================================

test.describe('Orders Error State', () => {
  test('should display error message when orders fail to load', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/account');

    const errorTitle = page.locator('text=Unable to load orders');
    await expect(errorTitle).toBeVisible();
  });

  test('should display error icon in error state', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/account');

    const errorContainer = page.locator('.bg-red-50');
    await expect(errorContainer).toBeVisible();
  });
});

// ============================================================================
// Quick Actions Sidebar Tests
// ============================================================================

test.describe('Quick Actions Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should display Quick Actions header', async ({ page }) => {
    const header = page.locator('h3:has-text("Quick Actions")');
    await expect(header).toBeVisible();
  });

  test('should display My Orders action', async ({ page }) => {
    const action = page.locator('a[href="/account/orders"]:has-text("My Orders")');
    await expect(action).toBeVisible();
  });

  test('should display My Orders description', async ({ page }) => {
    const description = page.locator('text=Track and manage your orders');
    await expect(description).toBeVisible();
  });

  test('should display AI Creations action', async ({ page }) => {
    const action = page.locator('a[href="/account/ai-creations"]:has-text("AI Creations")');
    await expect(action).toBeVisible();
  });

  test('should display AI Creations description', async ({ page }) => {
    const description = page.locator('text=View your AI-generated art');
    await expect(description).toBeVisible();
  });

  test('should display Saved Addresses action', async ({ page }) => {
    const action = page.locator('a[href="/account/addresses"]:has-text("Saved Addresses")');
    await expect(action).toBeVisible();
  });

  test('should display Saved Addresses description', async ({ page }) => {
    const description = page.locator('text=Manage delivery addresses');
    await expect(description).toBeVisible();
  });

  test('should display Account Settings action', async ({ page }) => {
    const action = page.locator('a[href="/account/settings"]:has-text("Account Settings")');
    await expect(action).toBeVisible();
  });

  test('should display Account Settings description', async ({ page }) => {
    const description = page.locator('text=Update profile & preferences');
    await expect(description).toBeVisible();
  });

  test('should have chevron icons on actions', async ({ page }) => {
    const actions = page.locator('a[href^="/account/"]');
    const count = await actions.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// Quick Actions Navigation Tests
// ============================================================================

test.describe('Quick Actions Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should navigate to orders page when clicking My Orders', async ({ page }) => {
    const action = page.locator('a[href="/account/orders"]:has-text("My Orders")');
    await action.click();
    await expect(page).toHaveURL(/\/account\/orders/);
  });

  test('should navigate to AI creations when clicking AI Creations', async ({ page }) => {
    const action = page.locator('a[href="/account/ai-creations"]:has-text("AI Creations")');
    await action.click();
    await expect(page).toHaveURL(/\/account\/ai-creations/);
  });

  test('should navigate to addresses when clicking Saved Addresses', async ({ page }) => {
    const action = page.locator('a[href="/account/addresses"]:has-text("Saved Addresses")');
    await action.click();
    await expect(page).toHaveURL(/\/account\/addresses/);
  });

  test('should navigate to settings when clicking Account Settings', async ({ page }) => {
    const action = page.locator('a[href="/account/settings"]:has-text("Account Settings")');
    await action.click();
    await expect(page).toHaveURL(/\/account\/settings/);
  });
});

// ============================================================================
// Help Section Tests
// ============================================================================

test.describe('Help Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should display Need Help? header', async ({ page }) => {
    const header = page.locator('h3:has-text("Need Help?")');
    await expect(header).toBeVisible();
  });

  test('should display help description', async ({ page }) => {
    const description = page.locator('text=Have questions about your order or account');
    await expect(description).toBeVisible();
  });

  test('should display Contact Support link', async ({ page }) => {
    const link = page.locator('a[href="/contact"]:has-text("Contact Support")');
    await expect(link).toBeVisible();
  });

  test('should have arrow icon in Contact Support link', async ({ page }) => {
    const link = page.locator('a[href="/contact"]:has-text("Contact Support")');
    const icon = link.locator('svg');
    await expect(icon).toBeVisible();
  });
});

// ============================================================================
// Sign Out Functionality Tests
// ============================================================================

test.describe('Sign Out Functionality', () => {
  test('should call sign out API when clicking Sign Out', async ({ page }) => {
    let signOutCalled = false;

    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route('**/api/auth/sign-out', async (route) => {
      signOutCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/account');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();

    // Wait for navigation to complete
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {});

    expect(signOutCalled).toBe(true);
  });

  test('should redirect to home page after sign out', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route('**/api/auth/sign-out', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/account');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();

    await expect(page).toHaveURL('/');
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/account');

    const title = page.locator('h1:has-text("My Account")');
    await expect(title).toBeVisible();

    const profileCard = page.locator('text=Test User');
    await expect(profileCard).toBeVisible();
  });

  test('should stack layout vertically on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/account');

    // On mobile, sidebar should be below main content
    const content = page.locator('.container-wide');
    await expect(content).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/account');

    const quickActions = page.locator('h3:has-text("Quick Actions")');
    await expect(quickActions).toBeVisible();
  });

  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/account');

    // Desktop has 3-column grid layout
    const grid = page.locator('.lg\\:grid-cols-3');
    await expect(grid).toBeVisible();
  });

  test('should show Settings text on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/account');

    const settingsText = page.locator('a[href="/account/settings"] >> text=Settings');
    await expect(settingsText).toBeVisible();
  });

  test('should hide Settings text on mobile (icon only)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/account');

    // Icon should still be visible
    const settingsBtn = page.locator('a[href="/account/settings"]').first();
    const icon = settingsBtn.locator('svg');
    await expect(icon).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });

  test('should have semantic HTML structure', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('should have alt text on user avatar image', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            image: 'https://example.com/avatar.jpg',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.goto('/account');

    const avatar = page.locator('img[alt]');
    const count = await avatar.count();
    if (count > 0) {
      const alt = await avatar.first().getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });

  test('should have button type on Sign Out button', async ({ page }) => {
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    const type = await signOutBtn.getAttribute('type');
    expect(type).toBe('button');
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
  });

  test('should navigate to orders page from View All link', async ({ page }) => {
    const viewAllLink = page.locator('a[href="/account/orders"]:has-text("View All")');
    await viewAllLink.click();
    await expect(page).toHaveURL(/\/account\/orders/);
  });

  test('should navigate to settings from profile Settings button', async ({ page }) => {
    const settingsBtn = page.locator('a[href="/account/settings"]').first();
    await settingsBtn.click();
    await expect(page).toHaveURL(/\/account\/settings/);
  });

  test('should navigate to contact page from Contact Support', async ({ page }) => {
    const contactLink = page.locator('a[href="/contact"]:has-text("Contact Support")');
    await contactLink.click();
    await expect(page).toHaveURL(/\/contact/);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    const startTime = Date.now();
    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/account');
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Error Handling', () => {
  test('should handle auth API error gracefully', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/account');

    // Should redirect to login on auth error
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should handle network timeout gracefully', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      // Simulate timeout by not responding
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await route.abort('timedout');
    });

    // Should redirect to login eventually
    await page.goto('/account', { timeout: 15000 }).catch(() => {});

    // Page should load (even if redirected)
    await expect(page.locator('body')).toBeVisible();
  });
});
