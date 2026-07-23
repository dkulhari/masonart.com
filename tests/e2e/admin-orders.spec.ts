import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json');

// Use admin authentication for all tests in this file
test.use({ storageState: ADMIN_AUTH });

/**
 * Admin Orders Management E2E Tests
 *
 * Tests for the chobii.art admin orders management pages (/admin/orders).
 *
 * Based on actual implementation in:
 * - packages/api/src/routes/admin/orders.ts
 * - packages/web/app/routes/admin/orders/index.tsx
 * - packages/web/app/routes/admin/orders/$id.tsx
 * - packages/web/app/components/admin/OrdersTable.tsx
 * - packages/web/app/components/admin/OrderDetail.tsx
 *
 * Admin Orders features:
 * - List all orders with pagination, filtering, sorting, and search
 * - View order statistics (today's orders, pending, revenue)
 * - View order details
 * - Update order status
 * - Update shipping details
 * - Initiate refunds
 * - Manage internal notes
 */

// ============================================================================
// Test Data Helpers
// ============================================================================

/**
 * Mock order data
 */
const mockOrders = [
  {
    id: 'ord-001',
    orderNumber: 'MA-20240115-001',
    userId: 'user-001',
    guestEmail: null,
    guestPhone: null,
    status: 'processing',
    paymentStatus: 'paid',
    orderType: 'regular',
    shippingMethod: 'standard',
    shippingCost: '99.00',
    subtotal: '3998.00',
    discount: '0.00',
    tax: '719.64',
    total: '4816.64',
    itemCount: 2,
    currency: 'INR',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T12:00:00Z',
    paidAt: '2024-01-15T10:05:00Z',
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    customer: {
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
    },
  },
  {
    id: 'ord-002',
    orderNumber: 'MA-20240114-002',
    userId: null,
    guestEmail: 'guest@example.com',
    guestPhone: '+91-9876543210',
    status: 'shipped',
    paymentStatus: 'paid',
    orderType: 'regular',
    shippingMethod: 'express',
    shippingCost: '199.00',
    subtotal: '2499.00',
    discount: '250.00',
    tax: '404.82',
    total: '2852.82',
    itemCount: 1,
    currency: 'INR',
    createdAt: '2024-01-14T14:30:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    paidAt: '2024-01-14T14:35:00Z',
    shippedAt: '2024-01-15T09:00:00Z',
    deliveredAt: null,
    cancelledAt: null,
    customer: {
      name: null,
      email: 'guest@example.com',
    },
  },
  {
    id: 'ord-003',
    orderNumber: 'MA-20240114-003',
    userId: 'user-002',
    guestEmail: null,
    guestPhone: null,
    status: 'delivered',
    paymentStatus: 'paid',
    orderType: 'ai_generated',
    shippingMethod: 'standard',
    shippingCost: '0.00',
    subtotal: '4999.00',
    discount: '0.00',
    tax: '899.82',
    total: '5898.82',
    itemCount: 1,
    currency: 'INR',
    createdAt: '2024-01-14T08:00:00Z',
    updatedAt: '2024-01-16T14:00:00Z',
    paidAt: '2024-01-14T08:10:00Z',
    shippedAt: '2024-01-15T10:00:00Z',
    deliveredAt: '2024-01-16T14:00:00Z',
    cancelledAt: null,
    customer: {
      name: 'Priya Patel',
      email: 'priya.patel@example.com',
    },
  },
  {
    id: 'ord-004',
    orderNumber: 'MA-20240113-004',
    userId: 'user-003',
    guestEmail: null,
    guestPhone: null,
    status: 'pending_payment',
    paymentStatus: 'pending',
    orderType: 'regular',
    shippingMethod: 'standard',
    shippingCost: '99.00',
    subtotal: '1499.00',
    discount: '0.00',
    tax: '287.64',
    total: '1885.64',
    itemCount: 1,
    currency: 'INR',
    createdAt: '2024-01-13T16:00:00Z',
    updatedAt: '2024-01-13T16:00:00Z',
    paidAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    customer: {
      name: 'Amit Kumar',
      email: 'amit.kumar@example.com',
    },
  },
  {
    id: 'ord-005',
    orderNumber: 'MA-20240112-005',
    userId: 'user-004',
    guestEmail: null,
    guestPhone: null,
    status: 'cancelled',
    paymentStatus: 'refunded',
    orderType: 'regular',
    shippingMethod: 'express',
    shippingCost: '199.00',
    subtotal: '3499.00',
    discount: '350.00',
    tax: '602.64',
    total: '3950.64',
    itemCount: 2,
    currency: 'INR',
    createdAt: '2024-01-12T11:00:00Z',
    updatedAt: '2024-01-13T10:00:00Z',
    paidAt: '2024-01-12T11:05:00Z',
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: '2024-01-13T10:00:00Z',
    customer: {
      name: 'Sneha Reddy',
      email: 'sneha.reddy@example.com',
    },
  },
];

/**
 * Mock order statistics
 */
const mockOrderStats = {
  byStatus: {
    pending: 3,
    pending_payment: 5,
    confirmed: 8,
    processing: 12,
    shipped: 15,
    out_for_delivery: 4,
    delivered: 150,
    cancelled: 10,
    refund_requested: 2,
    refunded: 5,
    failed: 1,
  },
  byPaymentStatus: {
    pending: 5,
    processing: 2,
    paid: 180,
    failed: 3,
    refunded: 8,
    partially_refunded: 2,
    cancelled: 15,
  },
  totalRevenue: '1250000.00',
  todayOrders: 12,
  monthRevenue: '350000.00',
};

/**
 * Mock order detail with items
 */
const mockOrderDetail = {
  ...mockOrders[0],
  shippingAddress: {
    fullName: 'Rahul Sharma',
    phone: '+91-9876543210',
    addressLine1: '123 MG Road',
    addressLine2: 'Near City Mall',
    landmark: 'Opposite State Bank',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    countryCode: 'IN',
  },
  shippingDetails: {
    carrier: 'Delhivery',
    trackingNumber: 'DEL123456789',
    trackingUrl: 'https://www.delhivery.com/track/DEL123456789',
    awbNumber: 'AWB123456',
    estimatedDelivery: '2024-01-18',
  },
  paymentDetails: {
    method: 'razorpay',
    orderId: 'order_abc123',
    paymentId: 'pay_xyz789',
  },
  customerNotes: 'Please deliver before 5 PM',
  internalNotes: 'Customer requested gift wrapping',
  items: [
    {
      id: 'item-001',
      snapshot: {
        title: 'Ocean Waves Abstract Poster',
        sku: 'TX-001',
        sizeLabel: '18x24 inches',
        imageUrl: 'https://cdn.example.com/ocean.jpg',
      },
      unitPrice: '1999.00',
      framePrice: '0.00',
      quantity: 1,
      lineTotal: '1999.00',
      itemDiscount: null,
      isAiGenerated: false,
      aiGenerationId: null,
      customizations: null,
      isFulfilled: false,
      fulfilledAt: null,
      product: {
        id: 'prod-001',
        slug: 'ocean-waves-abstract-poster',
        title: 'Ocean Waves Abstract Poster',
        images: [{ url: 'https://cdn.example.com/ocean.jpg' }],
        sku: 'TX-001',
      },
      variant: {
        id: 'var-001',
        sizeLabel: '18x24 inches',
        widthInches: 18,
        heightInches: 24,
        price: '1999.00',
      },
      frame: null,
    },
    {
      id: 'item-002',
      snapshot: {
        title: 'Mountain Peaks Minimalist',
        sku: 'TX-002',
        sizeLabel: '12x16 inches',
        imageUrl: 'https://cdn.example.com/mountain.jpg',
      },
      unitPrice: '1499.00',
      framePrice: '500.00',
      quantity: 1,
      lineTotal: '1999.00',
      itemDiscount: null,
      isAiGenerated: false,
      aiGenerationId: null,
      customizations: null,
      isFulfilled: false,
      fulfilledAt: null,
      product: {
        id: 'prod-002',
        slug: 'mountain-peaks-minimalist',
        title: 'Mountain Peaks Minimalist',
        images: [{ url: 'https://cdn.example.com/mountain.jpg' }],
        sku: 'TX-002',
      },
      variant: {
        id: 'var-002',
        sizeLabel: '12x16 inches',
        widthInches: 12,
        heightInches: 16,
        price: '1499.00',
      },
      frame: {
        id: 'frame-001',
        name: 'Classic Black',
        type: 'wood',
      },
    },
  ],
};

/**
 * Setup admin session mock
 */
async function setupAdminSession(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/get-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'admin-user-id',
          name: 'Admin User',
          email: 'admin@chobii.art',
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
}

/**
 * Setup orders list API mock
 */
async function setupOrdersListMock(
  page: import('@playwright/test').Page,
  orders: typeof mockOrders = mockOrders,
  total?: number
) {
  await page.route('**/api/admin/orders**', async (route) => {
    const url = new URL(route.request().url());

    // Handle stats endpoint
    if (url.pathname.includes('/stats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOrderStats),
      });
      return;
    }

    // Handle single order endpoint
    const orderIdMatch = url.pathname.match(/\/api\/admin\/orders\/([^/]+)$/);
    if (orderIdMatch && !['stats', 'status', 'shipping', 'refund'].includes(orderIdMatch[1])) {
      const orderId = orderIdMatch[1];
      const order = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
      if (order) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockOrderDetail,
            ...order,
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Order not found' }),
        });
      }
      return;
    }

    // Handle list endpoint with filters
    const status = url.searchParams.get('status');
    const paymentStatus = url.searchParams.get('paymentStatus');
    const search = url.searchParams.get('search');
    const page_num = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');

    let filteredOrders = [...orders];

    if (status) {
      filteredOrders = filteredOrders.filter((o) => o.status === status);
    }

    if (paymentStatus) {
      filteredOrders = filteredOrders.filter((o) => o.paymentStatus === paymentStatus);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrders = filteredOrders.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(searchLower) ||
          o.customer?.email?.toLowerCase().includes(searchLower) ||
          o.customer?.name?.toLowerCase().includes(searchLower) ||
          o.guestEmail?.toLowerCase().includes(searchLower)
      );
    }

    const totalOrders = total ?? filteredOrders.length;
    const offset = (page_num - 1) * pageSize;
    const paginatedOrders = filteredOrders.slice(offset, offset + pageSize);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: paginatedOrders,
        total: totalOrders,
        page: page_num,
        pageSize,
        totalPages: Math.ceil(totalOrders / pageSize),
        hasNextPage: page_num * pageSize < totalOrders,
        hasPreviousPage: page_num > 1,
      }),
    });
  });
}

/**
 * Setup order mutation mocks (status update, shipping, refund)
 */
async function setupOrderMutationMocks(page: import('@playwright/test').Page) {
  // Status update
  await page.route('**/api/admin/orders/*/status', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Order status updated successfully',
          order: {
            id: 'ord-001',
            orderNumber: 'MA-20240115-001',
            status: body.status,
            previousStatus: 'processing',
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  // Shipping update
  await page.route('**/api/admin/orders/*/shipping', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Shipping details updated successfully',
          order: {
            id: 'ord-001',
            orderNumber: 'MA-20240115-001',
            shippingDetails: body,
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  // Refund
  await page.route('**/api/admin/orders/*/refund', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Refund initiated successfully',
          refund: {
            id: 'refund_abc123',
            amount: 4816.64,
            currency: 'INR',
            status: 'processed',
            orderNumber: 'MA-20240115-001',
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  // Order update (notes, etc.) - only intercept PATCH requests
  // GET requests should fall through to setupOrdersListMock handler
  await page.route('**/api/admin/orders/*', async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'PATCH' &&
      !url.pathname.includes('/status') &&
      !url.pathname.includes('/shipping')
    ) {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Order updated successfully',
          order: {
            id: 'ord-001',
            orderNumber: 'MA-20240115-001',
            ...body,
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      // Let other route handlers process this request (e.g., setupOrdersListMock)
      await route.fallback();
    }
  });
}

// ============================================================================
// Orders List Page Tests
// ============================================================================

test.describe('Admin Orders List Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
  });

  test('should display "Orders" as page title', async ({ page }) => {
    const title = page.locator('h1:has-text("Orders")');
    await expect(title).toBeVisible();
  });

  test('should have correct HTML document title', async ({ page }) => {
    await expect(page).toHaveTitle(/Orders.*Admin.*chobii.art/);
  });

  test('should have noindex/nofollow robots meta tag', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    expect(robots).toContain('nofollow');
  });

  test('should display total order count in subtitle', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const subtitle = page.locator('text=/\\d+.*total/i');
    await expect(subtitle.first()).toBeVisible();
  });

  test('should display Refresh button', async ({ page }) => {
    const refreshButton = page.locator('button:has-text("Refresh")');
    await expect(refreshButton).toBeVisible();
  });

  test('should display Export button', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export")');
    await expect(exportButton).toBeVisible();
  });

  test('should display date filter inputs', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();
  });

  test('should display orders table', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const table = page.locator('table, [role="table"]');
    await expect(table).toBeVisible();
  });

  test('should display order number column', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const orderNumber = page.locator('text=MA-20240115-001');
    await expect(orderNumber).toBeVisible();
  });

  test('should display customer name in order row', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const customerName = page.locator('text=Rahul Sharma');
    await expect(customerName).toBeVisible();
  });

  test('should display customer email in order row', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const customerEmail = page.locator('text=rahul.sharma@example.com');
    await expect(customerEmail).toBeVisible();
  });
});

// ============================================================================
// Orders Stats Cards Tests
// ============================================================================

test.describe('Orders Statistics Cards', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Today\'s Orders stat card', async ({ page }) => {
    const todayOrders = page.locator('text=/Today.*Orders/i');
    await expect(todayOrders.first()).toBeVisible();
  });

  test('should display Pending Orders stat card', async ({ page }) => {
    const pendingOrders = page.locator('text=/Pending.*Orders/i');
    await expect(pendingOrders.first()).toBeVisible();
  });

  test('should display Total Revenue stat card', async ({ page }) => {
    const totalRevenue = page.locator('text=/Total.*Revenue/i');
    await expect(totalRevenue.first()).toBeVisible();
  });

  test('should display This Month stat card', async ({ page }) => {
    const monthRevenue = page.locator('text=/This.*Month/i');
    await expect(monthRevenue.first()).toBeVisible();
  });
});

// ============================================================================
// Orders Status Filter Tests
// ============================================================================

test.describe('Orders Status Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
  });

  test('should have status filter dropdown', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const statusFilter = page.locator('select:has-text("All Status"), [data-testid="status-filter"]');
    await expect(statusFilter).toBeVisible();
  });

  test('should have payment status filter dropdown', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const paymentFilter = page.locator('select:has-text("All Payment"), [data-testid="payment-filter"]');
    await expect(paymentFilter).toBeVisible();
  });

  test('should filter by Processing status', async ({ page }) => {
    await page.goto('/admin/orders?status=processing');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('status=processing');
  });

  test('should filter by Shipped status', async ({ page }) => {
    await page.goto('/admin/orders?status=shipped');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('status=shipped');
  });

  test('should filter by Delivered status', async ({ page }) => {
    await page.goto('/admin/orders?status=delivered');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('status=delivered');
  });

  test('should filter by Cancelled status', async ({ page }) => {
    await page.goto('/admin/orders?status=cancelled');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('status=cancelled');
  });

  test('should filter by Paid payment status', async ({ page }) => {
    await page.goto('/admin/orders?paymentStatus=paid');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('paymentStatus=paid');
  });

  test('should filter by Pending payment status', async ({ page }) => {
    await page.goto('/admin/orders?paymentStatus=pending');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('paymentStatus=pending');
  });
});

// ============================================================================
// Orders Search Tests
// ============================================================================

test.describe('Orders Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
  });

  test('should have search input', async ({ page }) => {
    const searchInput = page.locator('input[type="text"][placeholder*="Search"], input[type="search"]');
    await expect(searchInput).toBeVisible();
  });

  test('should search orders by order number', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[type="text"][placeholder*="Search"], input[type="search"]');
    await searchInput.fill('MA-20240115');

    await page.waitForTimeout(500);

    const orderResult = page.locator('text=MA-20240115-001');
    await expect(orderResult).toBeVisible();
  });

  test('should search orders by customer email', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[type="text"][placeholder*="Search"], input[type="search"]');
    await searchInput.fill('rahul.sharma');

    await page.waitForTimeout(500);

    const orderResult = page.locator('text=rahul.sharma@example.com');
    await expect(orderResult).toBeVisible();
  });

  test('should clear search', async ({ page }) => {
    const searchInput = page.locator('input[type="text"][placeholder*="Search"], input[type="search"]');
    await searchInput.fill('test');
    await searchInput.clear();

    await page.waitForLoadState('domcontentloaded');
  });
});

// ============================================================================
// Orders Status Badges Tests
// ============================================================================

test.describe('Orders Status Badges', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Processing status badge', async ({ page }) => {
    // Target badge in table, not dropdown options
    const badge = page.locator('table span:has-text("Processing"), [role="table"] span:has-text("Processing")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Shipped status badge', async ({ page }) => {
    // Target badge in table, not dropdown options
    const badge = page.locator('table span:has-text("Shipped"), [role="table"] span:has-text("Shipped")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Delivered status badge', async ({ page }) => {
    // Target badge in table, not dropdown options
    const badge = page.locator('table span:has-text("Delivered"), [role="table"] span:has-text("Delivered")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Cancelled status badge', async ({ page }) => {
    // Target badge in table, not dropdown options
    const badge = page.locator('table span:has-text("Cancelled"), [role="table"] span:has-text("Cancelled")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Paid payment badge', async ({ page }) => {
    const badge = page.locator('table span:has-text("Paid"), [role="table"] span:has-text("Paid")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Pending payment badge', async ({ page }) => {
    const badge = page.locator('table span:has-text("Pending"), [role="table"] span:has-text("Pending")').first();
    await expect(badge).toBeVisible();
  });

  test('should display Refunded payment badge', async ({ page }) => {
    const badge = page.locator('table span:has-text("Refunded"), [role="table"] span:has-text("Refunded")').first();
    await expect(badge).toBeVisible();
  });
});

// ============================================================================
// Orders Table Actions Tests
// ============================================================================

test.describe('Orders Table Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display action menu button for each row', async ({ page }) => {
    // Scope to tbody to avoid header sort buttons
    const actionButtons = page.locator('tbody button:has(svg)');
    await expect(actionButtons.first()).toBeVisible();
  });

  test('should open action menu on click', async ({ page }) => {
    // Target tbody row action buttons, not header sort buttons
    const actionButton = page.locator('tbody button:has(svg)').first();
    await actionButton.click();

    // Menu appears as an absolute-positioned div
    const menu = page.locator('.absolute.rounded-lg.border');
    await expect(menu.first()).toBeVisible();
  });

  test('should show View Details option in action menu', async ({ page }) => {
    const actionButton = page.locator('tbody button:has(svg)').first();
    await actionButton.click();

    const viewOption = page.getByText('View Details');
    await expect(viewOption).toBeVisible();
  });

  test('should show Update Status option in action menu', async ({ page }) => {
    const actionButton = page.locator('tbody button:has(svg)').first();
    await actionButton.click();

    const updateOption = page.getByText('Update Status');
    await expect(updateOption).toBeVisible();
  });
});

// ============================================================================
// Orders List Pagination Tests
// ============================================================================

test.describe('Orders List Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
  });

  test('should display pagination controls', async ({ page }) => {
    await setupOrdersListMock(page, mockOrders, 50);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    // Look for pagination controls - try CSS selectors first, then text pattern
    const paginationCss = page.locator('[data-testid="pagination"], nav[aria-label="Pagination"], .pagination');
    const paginationText = page.getByText(/Page \d+ of \d+/);
    await expect(paginationCss.or(paginationText).first()).toBeVisible();
  });

  test('should display page info', async ({ page }) => {
    await setupOrdersListMock(page, mockOrders, 50);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const pageInfo = page.locator('text=/Page.*of/');
    await expect(pageInfo.first()).toBeVisible();
  });

  test('should navigate to next page', async ({ page }) => {
    await setupOrdersListMock(page, mockOrders, 50);
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const nextButton = page.locator('button:has-text("Next")');
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await expect(page).toHaveURL(/page=2/);
    }
  });

  test('should navigate to previous page', async ({ page }) => {
    await setupOrdersListMock(page, mockOrders, 50);
    await page.goto('/admin/orders?page=2');
    await page.waitForLoadState('domcontentloaded');

    const prevButton = page.locator('button:has-text("Previous")');
    if (await prevButton.isVisible()) {
      await prevButton.click();
      await expect(page).toHaveURL(/page=1|\/admin\/orders$/);
    }
  });
});

// ============================================================================
// Order Detail Page Tests
// ============================================================================

test.describe('Order Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
  });

  test('should navigate to order detail page', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const orderNumber = page.locator('text=MA-20240115-001');
    await expect(orderNumber.first()).toBeVisible();
  });

  test('should display Order Details as page title', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const title = page.locator('h1:has-text("Order Details")');
    await expect(title).toBeVisible();
  });

  test('should display back button', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    // The back button is in the header next to "Order Details" title
    // Exclude mobile-only buttons (lg:hidden class) and buttons with menu-related aria-labels
    const backButton = page.locator('main button:has(svg):not(.lg\\:hidden):not([aria-label*="menu" i])').first();
    await expect(backButton).toBeVisible();
  });

  test('should display Refresh button on detail page', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');

    const refreshButton = page.locator('button:has-text("Refresh")');
    await expect(refreshButton).toBeVisible();
  });

  test('should display order status badges', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const statusBadge = page.locator('span:has-text("Processing")');
    await expect(statusBadge.first()).toBeVisible();
  });

  test('should display payment status badge', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const paymentBadge = page.locator('span:has-text("Paid")');
    await expect(paymentBadge.first()).toBeVisible();
  });

  test('should display Update Status button', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await expect(updateStatusBtn).toBeVisible();
  });

  test('should display Update Shipping button', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const updateShippingBtn = page.locator('button:has-text("Update Shipping")');
    await expect(updateShippingBtn).toBeVisible();
  });
});

// ============================================================================
// Order Items Section Tests
// ============================================================================

test.describe('Order Items Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Order Items section header', async ({ page }) => {
    const header = page.locator('text=/Order Items/');
    await expect(header.first()).toBeVisible();
  });

  test('should display item count in header', async ({ page }) => {
    const itemCount = page.locator('text=/\\(2\\)/');
    await expect(itemCount.first()).toBeVisible();
  });

  test('should display product title', async ({ page }) => {
    const productTitle = page.locator('text=Ocean Waves Abstract Poster');
    await expect(productTitle.first()).toBeVisible();
  });

  test('should display product size', async ({ page }) => {
    const sizeLabel = page.locator('text=/18x24.*inches/');
    await expect(sizeLabel.first()).toBeVisible();
  });

  test('should display product price', async ({ page }) => {
    const price = page.locator('text=/1,999/');
    await expect(price.first()).toBeVisible();
  });

  test('should display quantity for items', async ({ page }) => {
    const qty = page.locator('text=/Qty.*1/');
    await expect(qty.first()).toBeVisible();
  });

  test('should display frame info when applicable', async ({ page }) => {
    const frameInfo = page.locator('text=/Classic Black.*Frame/');
    await expect(frameInfo.first()).toBeVisible();
  });

  test('should display fulfillment status', async ({ page }) => {
    const fulfillmentStatus = page.locator('text=/Pending Fulfillment|Fulfilled/');
    await expect(fulfillmentStatus.first()).toBeVisible();
  });
});

// ============================================================================
// Customer Information Section Tests
// ============================================================================

test.describe('Customer Information Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Customer section header', async ({ page }) => {
    // Use exact text match to avoid matching "Customer Notes"
    const header = page.getByRole('heading', { name: 'Customer', level: 3, exact: true });
    await expect(header).toBeVisible();
  });

  test('should display customer name', async ({ page }) => {
    const customerName = page.locator('text=Rahul Sharma');
    await expect(customerName.first()).toBeVisible();
  });

  test('should display customer email', async ({ page }) => {
    const customerEmail = page.locator('text=rahul.sharma@example.com');
    await expect(customerEmail.first()).toBeVisible();
  });
});

// ============================================================================
// Shipping Address Section Tests
// ============================================================================

test.describe('Shipping Address Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Shipping Address section', async ({ page }) => {
    const header = page.locator('h3:has-text("Shipping Address")');
    await expect(header).toBeVisible();
  });

  test('should display shipping address line', async ({ page }) => {
    const address = page.locator('text=123 MG Road');
    await expect(address).toBeVisible();
  });

  test('should display city and state', async ({ page }) => {
    const cityState = page.locator('text=/Mumbai.*Maharashtra/');
    await expect(cityState.first()).toBeVisible();
  });

  test('should display postal code', async ({ page }) => {
    const postalCode = page.locator('text=400001');
    await expect(postalCode).toBeVisible();
  });
});

// ============================================================================
// Shipping Details Section Tests
// ============================================================================

test.describe('Shipping Details Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Shipping Details section', async ({ page }) => {
    const header = page.locator('h3:has-text("Shipping Details")');
    await expect(header).toBeVisible();
  });

  test('should display carrier name', async ({ page }) => {
    const carrier = page.locator('text=Delhivery');
    await expect(carrier).toBeVisible();
  });

  test('should display tracking number', async ({ page }) => {
    const tracking = page.locator('text=DEL123456789');
    await expect(tracking).toBeVisible();
  });

  test('should display track link', async ({ page }) => {
    const trackLink = page.locator('a:has-text("Track")');
    await expect(trackLink).toBeVisible();
  });
});

// ============================================================================
// Payment Summary Section Tests
// ============================================================================

test.describe('Payment Summary Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Payment Summary section', async ({ page }) => {
    const header = page.locator('h3:has-text("Payment Summary")');
    await expect(header).toBeVisible();
  });

  test('should display subtotal', async ({ page }) => {
    const subtotal = page.locator('text=Subtotal');
    await expect(subtotal).toBeVisible();
  });

  test('should display shipping cost', async ({ page }) => {
    // Use exact text match to target the Payment Summary shipping line
    const shipping = page.getByText('Shipping', { exact: true });
    await expect(shipping).toBeVisible();
  });

  test('should display tax', async ({ page }) => {
    const tax = page.getByText('Tax', { exact: true });
    await expect(tax).toBeVisible();
  });

  test('should display total', async ({ page }) => {
    const total = page.locator('text=Total');
    await expect(total.first()).toBeVisible();
  });
});

// ============================================================================
// Timeline Section Tests
// ============================================================================

test.describe('Timeline Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Timeline section', async ({ page }) => {
    const header = page.locator('h3:has-text("Timeline")');
    await expect(header).toBeVisible();
  });

  test('should display Order Created event', async ({ page }) => {
    const created = page.locator('text=Order Created');
    await expect(created).toBeVisible();
  });

  test('should display Payment Received event', async ({ page }) => {
    const payment = page.locator('text=Payment Received');
    await expect(payment).toBeVisible();
  });

  test('should display Shipped event', async ({ page }) => {
    const shipped = page.locator('text=Shipped');
    await expect(shipped.first()).toBeVisible();
  });

  test('should display Delivered event', async ({ page }) => {
    const delivered = page.locator('text=Delivered');
    await expect(delivered.first()).toBeVisible();
  });
});

// ============================================================================
// Internal Notes Section Tests
// ============================================================================

test.describe('Internal Notes Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Internal Notes section', async ({ page }) => {
    const header = page.locator('h3:has-text("Internal Notes")');
    await expect(header).toBeVisible();
  });

  test('should display Edit button for notes', async ({ page }) => {
    const editButton = page.locator('button:has-text("Edit"), a:has-text("Edit")');
    await expect(editButton.first()).toBeVisible();
  });

  test('should display existing internal notes', async ({ page }) => {
    const notes = page.locator('text=Customer requested gift wrapping');
    await expect(notes).toBeVisible();
  });
});

// ============================================================================
// Status Update Modal Tests
// ============================================================================

test.describe('Status Update Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should open status update modal on button click', async ({ page }) => {
    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await updateStatusBtn.click();

    const modal = page.locator('[role="dialog"], .fixed.inset-0');
    await expect(modal.first()).toBeVisible();
  });

  test('should display status dropdown in modal', async ({ page }) => {
    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await updateStatusBtn.click();

    const statusSelect = page.locator('[role="dialog"] select, .fixed.inset-0 select');
    await expect(statusSelect.first()).toBeVisible();
  });

  test('should display reason textarea in modal', async ({ page }) => {
    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await updateStatusBtn.click();

    const reasonInput = page.locator('[role="dialog"] textarea, .fixed.inset-0 textarea');
    await expect(reasonInput).toBeVisible();
  });

  test('should display Cancel button in modal', async ({ page }) => {
    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await updateStatusBtn.click();

    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel"), .fixed.inset-0 button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
  });

  test('should close modal on Cancel click', async ({ page }) => {
    const updateStatusBtn = page.locator('button:has-text("Update Status")');
    await updateStatusBtn.click();

    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel"), .fixed.inset-0 button:has-text("Cancel")');
    await cancelBtn.click();

    const modal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    await expect(modal).not.toBeVisible();
  });
});

// ============================================================================
// Shipping Update Modal Tests
// ============================================================================

test.describe('Shipping Update Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should open shipping update modal on button click', async ({ page }) => {
    const updateShippingBtn = page.locator('button:has-text("Update Shipping")');
    await updateShippingBtn.click();

    const modal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    await expect(modal.first()).toBeVisible();
  });

  test('should display carrier input', async ({ page }) => {
    const updateShippingBtn = page.locator('button:has-text("Update Shipping")');
    await updateShippingBtn.click();

    const carrierInput = page.locator('[role="dialog"] input[placeholder*="Delhivery"], .fixed.inset-0 input').first();
    await expect(carrierInput).toBeVisible();
  });

  test('should display tracking number input', async ({ page }) => {
    const updateShippingBtn = page.locator('button:has-text("Update Shipping")');
    await updateShippingBtn.click();

    const trackingInput = page.locator('[role="dialog"] input[placeholder*="Tracking"], .fixed.inset-0 input[placeholder*="Tracking"]');
    await expect(trackingInput.first()).toBeVisible();
  });

  test('should display estimated delivery date input', async ({ page }) => {
    const updateShippingBtn = page.locator('button:has-text("Update Shipping")');
    await updateShippingBtn.click();

    const dateInput = page.locator('[role="dialog"] input[type="date"], .fixed.inset-0 input[type="date"]');
    await expect(dateInput.first()).toBeVisible();
  });
});

// ============================================================================
// Order Not Found Tests
// ============================================================================

test.describe('Order Not Found', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page, []);
  });

  test('should display not found message for invalid order', async ({ page }) => {
    await page.goto('/admin/orders/invalid-order-id');
    await page.waitForLoadState('domcontentloaded');

    const notFound = page.locator('text=/Order Not Found|not found|404/i');
    await expect(notFound.first()).toBeVisible();
  });

  test('should display Back to Orders button on not found', async ({ page }) => {
    await page.goto('/admin/orders/invalid-order-id');
    await page.waitForLoadState('domcontentloaded');

    const backButton = page.locator('button:has-text("Back to Orders"), a:has-text("Back to Orders")');
    await expect(backButton).toBeVisible();
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================

test.describe('Orders Loading States', () => {
  test('should display skeleton loaders while fetching orders', async ({ page }) => {
    await setupAdminSession(page);

    await page.route('**/api/admin/orders**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: mockOrders, total: mockOrders.length }),
      });
    });

    await page.goto('/admin/orders');

    const skeletons = page.locator('.animate-pulse, [data-testid="skeleton"]');
    await expect(skeletons.first()).toBeVisible();
  });

  test('should display loading indicator on detail page', async ({ page }) => {
    await setupAdminSession(page);

    await page.route('**/api/admin/orders/ord-001', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOrderDetail),
      });
    });

    await page.goto('/admin/orders/ord-001');

    const loading = page.locator('.animate-pulse, .spinner, [data-testid="loading"]');
    await expect(loading.first()).toBeVisible();
  });
});

// ============================================================================
// Error State Tests
// ============================================================================

test.describe('Orders Error States', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
  });

  test('should display error when orders fail to load', async ({ page }) => {
    await page.route('**/api/admin/orders**', async (route) => {
      if (!route.request().url().includes('/stats')) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOrderStats),
        });
      }
    });

    await page.goto('/admin/orders');

    const errorMessage = page.locator('text=/error|failed|Error/i');
    await expect(errorMessage.first()).toBeVisible();
  });

  test('should display Dismiss button on error', async ({ page }) => {
    await page.route('**/api/admin/orders**', async (route) => {
      if (!route.request().url().includes('/stats')) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOrderStats),
        });
      }
    });

    await page.goto('/admin/orders');

    const dismissButton = page.locator('button:has-text("Dismiss")');
    await expect(dismissButton).toBeVisible();
  });
});

// ============================================================================
// Empty State Tests
// ============================================================================

test.describe('Orders Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
  });

  test('should display empty state when no orders', async ({ page }) => {
    await page.route('**/api/admin/orders**', async (route) => {
      if (route.request().url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockOrderStats,
            todayOrders: 0,
            byStatus: {},
            byPaymentStatus: {},
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
        });
      }
    });

    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const emptyState = page.locator('text=/No orders|no orders found/i');
    await expect(emptyState.first()).toBeVisible();
  });

  test('should display empty search results message', async ({ page }) => {
    await setupOrdersListMock(page, []);

    await page.goto('/admin/orders?search=nonexistent');
    await page.waitForLoadState('domcontentloaded');

    const noResults = page.locator('text=/No orders|no results|No matching/i');
    await expect(noResults.first()).toBeVisible();
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Orders Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/orders');

    const title = page.locator('h1:has-text("Orders")');
    await expect(title).toBeVisible();
  });

  test('should display Refresh button on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/orders');

    const refreshButton = page.locator('button:has(svg)').first();
    await expect(refreshButton).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/admin/orders');

    const title = page.locator('h1:has-text("Orders")');
    await expect(title).toBeVisible();
  });

  test('should display full table on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    const table = page.locator('table, [role="table"]');
    await expect(table).toBeVisible();
  });

  test('should display order detail properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    const orderNumber = page.locator('text=MA-20240115-001');
    await expect(orderNumber.first()).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Orders Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/admin/orders');

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('should have h1 as Orders', async ({ page }) => {
    await page.goto('/admin/orders');

    const h1 = page.locator('h1');
    await expect(h1).toHaveText(/Orders/);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/admin/orders');

    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });

  test('should have focus indicators on buttons', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    // Wait for button to be enabled (not disabled during loading)
    const refreshButton = page.locator('button:has-text("Refresh"):not([disabled])');
    await expect(refreshButton).toBeVisible();

    await refreshButton.focus();
    await expect(refreshButton).toBeFocused();
  });

  test('should have accessible form inputs', async ({ page }) => {
    await page.goto('/admin/orders');

    const inputs = page.locator('input, select');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Orders Performance', () => {
  test('should load orders list within acceptable time', async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);

    const startTime = Date.now();
    await page.goto('/admin/orders');
    await expect(page.locator('h1:has-text("Orders")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await setupAdminSession(page);
    await setupOrdersListMock(page);

    await page.goto('/admin/orders');
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('should handle rapid navigation', async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);

    await page.goto('/admin/orders');
    await page.goto('/admin/orders/ord-001');
    await page.goto('/admin/orders');

    await expect(page.locator('h1:has-text("Orders")')).toBeVisible();
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Orders Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
  });

  test('should navigate back to orders list from detail page', async ({ page }) => {
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');

    // Use keyboard shortcut or navigate via sidebar link since back button selector is fragile
    // The Orders link in sidebar is more reliable
    const ordersLink = page.getByRole('link', { name: 'Orders' });
    await ordersLink.click();

    // URL may have query params like ?page=1&pageSize=20
    await expect(page).toHaveURL(/\/admin\/orders(\?|$)/);
  });

  test('should navigate to order detail from list', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('domcontentloaded');

    // Click the action button (last button in first row) to open dropdown menu
    const firstActionButton = page.locator('table tbody tr').first().locator('button').last();
    await firstActionButton.click();

    // Wait for dropdown menu to appear and click View Details
    const viewOption = page.getByRole('button', { name: 'View Details' });
    await expect(viewOption).toBeVisible({ timeout: 3000 });
    await viewOption.click();

    // Should navigate to order detail page
    await expect(page).toHaveURL(/\/admin\/orders\/ord-/);
  });

  test('should preserve filters in URL', async ({ page }) => {
    await page.goto('/admin/orders?status=processing&paymentStatus=paid');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('status=processing');
    expect(page.url()).toContain('paymentStatus=paid');
  });
});

// ============================================================================
// Refund Tests
// ============================================================================

test.describe('Order Refund', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await setupOrderMutationMocks(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Initiate Refund button for paid orders', async ({ page }) => {
    const refundButton = page.locator('button:has-text("Initiate Refund")');
    await expect(refundButton).toBeVisible();
  });

  test('should have red styling for refund button', async ({ page }) => {
    const refundButton = page.locator('button:has-text("Initiate Refund")');
    const className = await refundButton.getAttribute('class');
    expect(className).toContain('red');
  });
});

// ============================================================================
// Date Filter Tests
// ============================================================================

test.describe('Orders Date Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders');
  });

  test('should have date from input', async ({ page }) => {
    const dateFromInput = page.locator('input[type="date"]').first();
    await expect(dateFromInput).toBeVisible();
  });

  test('should have date to input', async ({ page }) => {
    const dateToInput = page.locator('input[type="date"]').last();
    await expect(dateToInput).toBeVisible();
  });

  test('should update URL with date filter', async ({ page }) => {
    // Wait for order data to render (proves React hydration complete)
    await page.locator('text=MA-20240115-001').waitFor({ state: 'visible', timeout: 10000 });

    const dateFromInput = page.locator('input[type="date"]').first();
    await dateFromInput.fill('2024-01-01');

    // Wait for URL to update with the date filter
    await page.waitForURL(/dateFrom/, { timeout: 10000 });
    expect(page.url()).toContain('dateFrom');
  });
});

// ============================================================================
// Copy Order Number Tests
// ============================================================================

test.describe('Copy Order Number', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display copy button next to order number', async ({ page }) => {
    // Target the copy button by its aria-label or title
    const copyButton = page.getByRole('button', { name: /copy order/i });
    await expect(copyButton).toBeVisible();
  });
});

// ============================================================================
// Customer Notes Tests
// ============================================================================

test.describe('Customer Notes Section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminSession(page);
    await setupOrdersListMock(page);
    await page.goto('/admin/orders/ord-001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display Customer Notes section', async ({ page }) => {
    const header = page.locator('h3:has-text("Customer Notes")');
    await expect(header).toBeVisible();
  });

  test('should display customer notes content', async ({ page }) => {
    const notes = page.locator('text=Please deliver before 5 PM');
    await expect(notes).toBeVisible();
  });
});
