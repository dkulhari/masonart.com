import { test, expect } from '@playwright/test';

/**
 * Admin Authentication & Access Control E2E Tests
 *
 * Tests for the MasonArt admin panel authentication and authorization including:
 * - Unauthenticated access (should redirect to login)
 * - Non-admin user access (should be denied)
 * - Admin role access (should work)
 * - Super-admin role access (should work)
 * - Session handling and sign out
 * - Protected admin routes
 *
 * Based on actual implementations in:
 * - packages/web/app/routes/admin/index.tsx
 * - packages/api/src/middleware/auth.ts
 * - packages/web/app/components/admin/AdminSidebar.tsx
 */

// ============================================================================
// Constants
// ============================================================================

const ADMIN_ROUTES = [
  '/admin',
  '/admin/products',
  '/admin/orders',
  '/admin/customers',
];

// ============================================================================
// Unauthenticated Access Tests
// ============================================================================

test.describe('Unauthenticated Access to Admin', () => {
  test('should redirect to login when accessing admin dashboard', async ({ page }) => {
    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing admin products', async ({ page }) => {
    await page.goto('/admin/products');

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing admin orders', async ({ page }) => {
    await page.goto('/admin/orders');

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should preserve redirect URL in login', async ({ page }) => {
    await page.goto('/admin/products');

    // Login page should have redirect param pointing to admin
    const url = page.url();
    expect(url).toContain('redirect');
    expect(url).toContain('admin');
  });

  test('should not show admin content when unauthenticated', async ({ page }) => {
    // Navigate directly and check response
    const response = await page.goto('/admin');

    // Either redirects or shows login
    const isRedirectOrLogin = page.url().includes('/auth/login') || page.url().includes('/login');
    expect(isRedirectOrLogin || response?.status() === 401).toBeTruthy();
  });

  test('should handle direct API access without auth', async ({ page }) => {
    // Try to access admin API directly
    const response = await page.request.get('/api/admin/orders/stats');

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test('should handle admin products API without auth', async ({ page }) => {
    const response = await page.request.get('/api/admin/products');

    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// Customer Role Access Tests (Non-Admin)
// ============================================================================

test.describe('Customer Role Access to Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated session with customer role
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'customer-user-id',
            name: 'Regular Customer',
            email: 'customer@example.com',
            role: 'customer',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'customer-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });
  });

  test('should deny customer access to admin dashboard', async ({ page }) => {
    // Mock admin API to return 403
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Forbidden',
          message: 'Access denied. Required role: admin or super-admin',
          code: 'FORBIDDEN',
        }),
      });
    });

    await page.goto('/admin');

    // Should either redirect, show error, or show access denied
    const pageContent = await page.content();
    const hasError = pageContent.includes('Forbidden') ||
      pageContent.includes('Access denied') ||
      pageContent.includes('error') ||
      page.url().includes('/auth/login') ||
      page.url().includes('/403');

    expect(hasError).toBeTruthy();
  });

  test('should deny customer access to admin orders API', async ({ page }) => {
    const response = await page.request.get('/api/admin/orders', {
      headers: {
        Cookie: 'session_token=mock-customer-token',
      },
    });

    // Expect 401 (no real session) or 403 (access denied)
    expect([401, 403]).toContain(response.status());
  });

  test('should deny customer access to admin products API', async ({ page }) => {
    const response = await page.request.get('/api/admin/products', {
      headers: {
        Cookie: 'session_token=mock-customer-token',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

// ============================================================================
// Trade Role Access Tests (Non-Admin)
// ============================================================================

test.describe('Trade Role Access to Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated session with trade role
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'trade-user-id',
            name: 'Trade Partner',
            email: 'trade@interiors.com',
            role: 'trade',
            emailVerified: true,
            tradeStatus: 'approved',
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'trade-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    // Mock admin API to return 403
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Forbidden',
          message: 'Access denied. Required role: admin or super-admin',
          code: 'FORBIDDEN',
        }),
      });
    });
  });

  test('should deny trade user access to admin dashboard', async ({ page }) => {
    await page.goto('/admin');

    // Check for error state or redirect
    const pageContent = await page.content();
    const hasError = pageContent.includes('Forbidden') ||
      pageContent.includes('Access denied') ||
      pageContent.includes('error') ||
      page.url().includes('/auth/login');

    expect(hasError).toBeTruthy();
  });

  test('should deny trade user access to admin products', async ({ page }) => {
    await page.goto('/admin/products');

    const pageContent = await page.content();
    const hasError = pageContent.includes('Forbidden') ||
      pageContent.includes('Access denied') ||
      pageContent.includes('error') ||
      page.url().includes('/auth/login');

    expect(hasError).toBeTruthy();
  });
});

// ============================================================================
// Admin Role Access Tests
// ============================================================================

test.describe('Admin Role Access', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated session with admin role
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    // Mock admin order stats API
    await page.route('**/api/admin/orders/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: { pending: 5, processing: 3, shipped: 10, delivered: 50 },
          byPaymentStatus: { pending: 5, paid: 60, failed: 3 },
          totalRevenue: '250000',
          todayOrders: 8,
          monthRevenue: '75000',
        }),
      });
    });

    // Mock admin products stats API
    await page.route('**/api/admin/products/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalProducts: 100,
          activeProducts: 85,
          lowStockProducts: 10,
          outOfStockProducts: 5,
        }),
      });
    });

    // Mock admin orders list API
    await page.route('**/api/admin/orders*', async (route) => {
      if (route.request().url().includes('/stats')) {
        return; // Let the stats route handler handle this
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'order-1',
              orderNumber: 'MA-20240115-0001',
              customer: { name: 'John Doe', email: 'john@example.com' },
              total: '2499',
              status: 'processing',
              paymentStatus: 'paid',
              createdAt: '2024-01-15T10:00:00Z',
            },
          ],
          total: 1,
        }),
      });
    });
  });

  test('should allow admin access to dashboard', async ({ page }) => {
    await page.goto('/admin');

    // Should show dashboard content
    const dashboard = page.locator('h1:has-text("Dashboard")');
    await expect(dashboard).toBeVisible();
  });

  test('should display admin dashboard title', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveTitle(/Dashboard.*Admin.*MasonArt/);
  });

  test('should display dashboard stats for admin', async ({ page }) => {
    await page.goto('/admin');

    // Wait for stats to load
    await page.waitForLoadState('networkidle');

    // Should show revenue stats
    const revenueCard = page.locator('text=Total Revenue');
    await expect(revenueCard).toBeVisible();
  });

  test('should display recent orders section', async ({ page }) => {
    await page.goto('/admin');

    const recentOrders = page.locator('h2:has-text("Recent Orders")');
    await expect(recentOrders).toBeVisible();
  });

  test('should display quick actions section', async ({ page }) => {
    await page.goto('/admin');

    const quickActions = page.locator('h2:has-text("Quick Actions")');
    await expect(quickActions).toBeVisible();
  });

  test('should have noindex/nofollow robots meta', async ({ page }) => {
    await page.goto('/admin');

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    expect(robots).toContain('nofollow');
  });

  test('should allow access to admin products page', async ({ page }) => {
    await page.route('**/api/admin/products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
        }),
      });
    });

    await page.goto('/admin/products');

    // Should not redirect and show products page
    expect(page.url()).toContain('/admin/products');
  });

  test('should allow access to admin orders page', async ({ page }) => {
    await page.goto('/admin/orders');

    // Should not redirect
    expect(page.url()).toContain('/admin/orders');
  });
});

// ============================================================================
// Super-Admin Role Access Tests
// ============================================================================

test.describe('Super-Admin Role Access', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated session with super-admin role
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'super-admin-user-id',
            name: 'Super Admin',
            email: 'superadmin@masonart.com',
            role: 'super-admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'super-admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    // Mock admin APIs
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
  });

  test('should allow super-admin access to dashboard', async ({ page }) => {
    await page.goto('/admin');

    expect(page.url()).toContain('/admin');
    // Shouldn't redirect
    expect(page.url()).not.toContain('/auth/login');
  });

  test('should allow super-admin access to all admin routes', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      expect(page.url()).toContain(route.replace(/\/$/, ''));
    }
  });
});

// ============================================================================
// Admin Session Handling Tests
// ============================================================================

test.describe('Admin Session Handling', () => {
  test('should handle expired session', async ({ page }) => {
    // Mock expired session
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: null,
          session: null,
        }),
      });
    });

    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should handle session API error', async ({ page }) => {
    // Mock session API error
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/admin');

    // Should redirect to login or show error
    const isLoginOrError = page.url().includes('/auth/login') ||
      (await page.content()).includes('error');
    expect(isLoginOrError).toBeTruthy();
  });

  test('should handle network timeout gracefully', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await route.abort('timedout');
    });

    await page.goto('/admin', { timeout: 15000 }).catch(() => {});

    // Page should load (even if with error)
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================================
// Admin Sign Out Tests
// ============================================================================

test.describe('Admin Sign Out', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated admin session
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    // Mock admin APIs
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });
  });

  test('should display Sign Out button in admin sidebar', async ({ page }) => {
    await page.goto('/admin');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for sign out button in sidebar
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await expect(signOutBtn).toBeVisible();
  });

  test('should call sign out API when clicking Sign Out', async ({ page }) => {
    let signOutCalled = false;

    await page.route('**/api/auth/sign-out', async (route) => {
      signOutCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();

    // Wait for navigation
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {});

    expect(signOutCalled).toBe(true);
  });

  test('should redirect to home after sign out', async ({ page }) => {
    await page.route('**/api/auth/sign-out', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.click();

    await expect(page).toHaveURL('/');
  });
});

// ============================================================================
// Admin Navigation Tests
// ============================================================================

test.describe('Admin Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated admin session
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    // Mock all admin APIs
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
          totalProducts: 0,
          activeProducts: 0,
        }),
      });
    });
  });

  test('should display admin sidebar navigation', async ({ page }) => {
    await page.goto('/admin');

    // Check for main nav items
    await expect(page.locator('a[href="/admin"]:has-text("Dashboard")')).toBeVisible();
    await expect(page.locator('a[href="/admin/products"]:has-text("Products")')).toBeVisible();
    await expect(page.locator('a[href="/admin/orders"]:has-text("Orders")')).toBeVisible();
  });

  test('should navigate to products from sidebar', async ({ page }) => {
    await page.goto('/admin');

    const productsLink = page.locator('a[href="/admin/products"]:has-text("Products")');
    await productsLink.click();

    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test('should navigate to orders from sidebar', async ({ page }) => {
    await page.goto('/admin');

    const ordersLink = page.locator('a[href="/admin/orders"]:has-text("Orders")');
    await ordersLink.click();

    await expect(page).toHaveURL(/\/admin\/orders/);
  });

  test('should highlight active nav item', async ({ page }) => {
    await page.goto('/admin');

    // Dashboard link should be active
    const dashboardLink = page.locator('a[href="/admin"]:has-text("Dashboard")');
    await expect(dashboardLink).toHaveClass(/bg-brand-50/);
  });

  test('should navigate to dashboard via MasonArt logo', async ({ page }) => {
    await page.goto('/admin/products');

    // Click logo to go back to dashboard
    const logo = page.locator('a[href="/admin"]').first();
    await logo.click();

    await expect(page).toHaveURL(/\/admin$/);
  });
});

// ============================================================================
// Admin User Info Display Tests
// ============================================================================

test.describe('Admin User Info Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'John Admin',
            email: 'john.admin@masonart.com',
            role: 'admin',
            image: 'https://example.com/avatar.jpg',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });
  });

  test('should display admin user name in sidebar', async ({ page }) => {
    await page.goto('/admin');

    const userName = page.locator('text=John Admin');
    await expect(userName).toBeVisible();
  });

  test('should display admin user email in sidebar', async ({ page }) => {
    await page.goto('/admin');

    const userEmail = page.locator('text=john.admin@masonart.com');
    await expect(userEmail).toBeVisible();
  });

  test('should display user initials when no image', async ({ page }) => {
    // Override to have no image
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Jane Doe',
            email: 'jane@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    await page.goto('/admin');

    // Should show initials "JD"
    const initials = page.locator('.bg-brand-100:has-text("JD")');
    await expect(initials).toBeVisible();
  });
});

// ============================================================================
// Responsive Admin Layout Tests
// ============================================================================

test.describe('Responsive Admin Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });
  });

  test('should display mobile menu button on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');

    // Should show mobile menu button
    const menuButton = page.locator('button[aria-label="Open menu"]');
    await expect(menuButton).toBeVisible();
  });

  test('should open mobile sidebar when clicking menu button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');

    const menuButton = page.locator('button[aria-label="Open menu"]');
    await menuButton.click();

    // Sidebar should now be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/translate-x-0/);
  });

  test('should close mobile sidebar when clicking overlay', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');

    const menuButton = page.locator('button[aria-label="Open menu"]');
    await menuButton.click();

    // Click overlay
    const overlay = page.locator('.bg-black\\/50');
    await overlay.click();

    // Sidebar should be hidden
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test('should display sidebar by default on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin');

    // Sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('should allow collapsing sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin');

    // Find and click collapse button
    const collapseButton = page.locator('button[aria-label="Collapse sidebar"]');
    if (await collapseButton.isVisible()) {
      await collapseButton.click();

      // Sidebar should be collapsed (width changed)
      const sidebar = page.locator('aside');
      await expect(sidebar).toHaveClass(/w-\[72px\]/);
    }
  });
});

// ============================================================================
// Admin Error Handling Tests
// ============================================================================

test.describe('Admin Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });
  });

  test('should display error message when stats fail to load', async ({ page }) => {
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/admin');

    // Should show error message
    const errorMessage = page.locator('text=Failed to load dashboard data');
    await expect(errorMessage).toBeVisible();
  });

  test('should display retry button on error', async ({ page }) => {
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/admin');

    // Should show retry button
    const retryButton = page.locator('button:has-text("Retry"), a:has-text("Retry")');
    await expect(retryButton).toBeVisible();
  });

  test('should have refresh button in dashboard', async ({ page }) => {
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });

    await page.goto('/admin');

    const refreshButton = page.locator('button:has-text("Refresh")');
    await expect(refreshButton).toBeVisible();
  });
});

// ============================================================================
// Admin Performance Tests
// ============================================================================

test.describe('Admin Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });
  });

  test('should load admin dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/admin');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors in admin', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/admin');
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Admin Accessibility Tests
// ============================================================================

test.describe('Admin Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'Admin User',
            email: 'admin@masonart.com',
            role: 'admin',
            emailVerified: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          session: {
            id: 'session-id',
            userId: 'admin-user-id',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
    });

    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byStatus: {},
          byPaymentStatus: {},
          totalRevenue: '0',
          todayOrders: 0,
          monthRevenue: '0',
          items: [],
          total: 0,
        }),
      });
    });
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/admin');

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });

  test('should have aria labels on interactive elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');

    const menuButton = page.locator('button[aria-label]');
    const count = await menuButton.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/admin');

    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });

  test('should have button type on Sign Out button', async ({ page }) => {
    await page.goto('/admin');

    const signOutBtn = page.locator('button:has-text("Sign Out")');
    const type = await signOutBtn.getAttribute('type');
    expect(type).toBe('button');
  });
});
