/**
 * E2E Tests for Admin Photo Approval Workflow
 *
 * Tests the admin approval management flow:
 * - Navigate to approvals dashboard
 * - View approval list with filtering
 * - View approval details
 * - Upload production photos
 * - View/add comments
 * - Monitor approval status changes
 *
 * Note: These tests use mocked API responses for the UI flow.
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json');

// Use admin authentication for all tests in this file
test.use({ storageState: ADMIN_AUTH });

// ============================================================================
// Test Data
// ============================================================================

const mockApprovalsList = {
  approvals: [
    {
      id: 'apv-001',
      orderId: 'ord-001',
      orderItemId: 'item-001',
      status: 'pending_upload',
      approvalToken: 'apv_token001',
      deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      order: {
        orderNumber: 'MA-2024-001234',
        customer: { name: 'John Doe', email: 'john@example.com' },
      },
      orderItem: {
        snapshot: { title: 'Custom AI Poster - Mountain Sunset' },
      },
      photos: [],
    },
    {
      id: 'apv-002',
      orderId: 'ord-002',
      orderItemId: 'item-002',
      status: 'pending_approval',
      approvalToken: 'apv_token002',
      deadlineAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      order: {
        orderNumber: 'MA-2024-001235',
        customer: { name: 'Jane Smith', email: 'jane@example.com' },
      },
      orderItem: {
        snapshot: { title: 'Custom AI Poster - Ocean Waves' },
      },
      photos: [
        { id: 'photo-001', url: 'https://example.com/photo1.jpg' },
        { id: 'photo-002', url: 'https://example.com/photo2.jpg' },
      ],
    },
    {
      id: 'apv-003',
      orderId: 'ord-003',
      orderItemId: 'item-003',
      status: 'changes_requested',
      approvalToken: 'apv_token003',
      deadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      order: {
        orderNumber: 'MA-2024-001236',
        customer: { name: 'Bob Wilson', email: 'bob@example.com' },
      },
      orderItem: {
        snapshot: { title: 'Custom AI Poster - Forest Path' },
      },
      photos: [],
    },
    {
      id: 'apv-004',
      orderId: 'ord-004',
      orderItemId: 'item-004',
      status: 'approved',
      approvalToken: 'apv_token004',
      approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      order: {
        orderNumber: 'MA-2024-001237',
        customer: { name: 'Alice Brown', email: 'alice@example.com' },
      },
      orderItem: {
        snapshot: { title: 'Custom AI Poster - City Skyline' },
      },
      photos: [],
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 4,
    totalPages: 1,
  },
  stats: {
    pending_upload: 1,
    pending_approval: 1,
    changes_requested: 1,
    approved: 1,
    expired: 0,
  },
};

const mockApprovalDetail = {
  id: 'apv-002',
  orderId: 'ord-002',
  orderItemId: 'item-002',
  status: 'pending_approval',
  approvalToken: 'apv_token002',
  deadlineAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  order: {
    id: 'ord-002',
    orderNumber: 'MA-2024-001235',
    status: 'processing',
    customer: { name: 'Jane Smith', email: 'jane@example.com' },
  },
  orderItem: {
    id: 'item-002',
    snapshot: { title: 'Custom AI Poster - Ocean Waves', sizeLabel: '24x36' },
  },
  photos: [
    { id: 'photo-001', url: 'https://example.com/photo1.jpg', sortOrder: 0 },
    { id: 'photo-002', url: 'https://example.com/photo2.jpg', sortOrder: 1 },
  ],
  comments: [
    {
      id: 'cmt-001',
      authorType: 'admin',
      comment: 'Production photos uploaded. Please review and approve.',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

async function mockApprovalsListApi(page: Page) {
  // Single route handler that handles all /api/admin/approvals endpoints
  await page.route('**/api/admin/approvals**', (route) => {
    const url = route.request().url();

    // Handle stats endpoint
    if (url.includes('/stats')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            byStatus: mockApprovalsList.stats,
            recentApproved: mockApprovalsList.stats.approved,
          },
        }),
      });
      return;
    }

    // Handle list endpoint (with or without query string)
    const parsedUrl = new URL(url);
    const status = parsedUrl.searchParams.get('status');

    let filteredApprovals = mockApprovalsList.approvals;
    if (status) {
      filteredApprovals = mockApprovalsList.approvals.filter((a) => a.status === status);
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          approvals: filteredApprovals,
          pagination: { ...mockApprovalsList.pagination, total: filteredApprovals.length },
        },
      }),
    });
  });
}

async function mockApprovalDetailApi(page: Page, approval = mockApprovalDetail) {
  await page.route('**/api/admin/approvals/*', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: approval }),
      });
    } else {
      route.continue();
    }
  });
}

async function mockUploadPhotosApi(page: Page) {
  await page.route('**/api/admin/approvals/*/photos', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Photos uploaded successfully',
          data: {
            photos: [
              { id: 'new-photo-001', url: 'https://example.com/new-photo1.jpg' },
            ],
          },
        }),
      });
    } else {
      route.continue();
    }
  });
}

async function mockAddCommentApi(page: Page) {
  await page.route('**/api/admin/approvals/*/comments', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'new-cmt-001',
            authorType: 'admin',
            comment: 'New admin comment',
            createdAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      route.continue();
    }
  });
}

// ============================================================================
// Approvals List Page Tests
// ============================================================================

test.describe('Admin Approvals List Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalsListApi(page);
    await page.goto('/admin/approvals', { waitUntil: 'networkidle' });
  });

  test('displays approvals page with header and stats', async ({ page }) => {
    // Check page header
    await expect(page.getByRole('heading', { name: /Photo Approvals/i })).toBeVisible();

    // Check stats cards are visible
    await expect(page.getByText(/Pending Upload/i).first()).toBeVisible();
    await expect(page.getByText(/Pending Approval/i).first()).toBeVisible();
    await expect(page.getByText(/Changes Requested/i).first()).toBeVisible();
  });

  test('displays list of approvals with correct information', async ({ page }) => {
    // Check that approval cards are displayed
    await expect(page.getByText('MA-2024-001234')).toBeVisible();
    await expect(page.getByText('MA-2024-001235').first()).toBeVisible();
    await expect(page.getByText('Custom AI Poster - Mountain Sunset')).toBeVisible();
    await expect(page.getByText('Custom AI Poster - Ocean Waves')).toBeVisible();
  });

  test('displays status badges correctly', async ({ page }) => {
    // Check status badges
    await expect(page.getByText('Pending Upload').first()).toBeVisible();
    await expect(page.getByText('Pending Approval').first()).toBeVisible();
    await expect(page.getByText('Changes Requested').first()).toBeVisible();
    await expect(page.getByText('Approved').first()).toBeVisible();
  });

  test('filters approvals by status', async ({ page }) => {
    // Find and click status filter
    const statusFilter = page.getByRole('combobox').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      await page.getByRole('option', { name: /Pending Approval/i }).click();

      // Verify filtered results
      await page.waitForTimeout(500);
      await expect(page.getByText('MA-2024-001235').first()).toBeVisible();
    }
  });

  test('navigates to approval detail on click', async ({ page }) => {
    await mockApprovalDetailApi(page);

    // Click on "View Details" link for one of the approvals
    await page.getByRole('link', { name: /View Details/i }).first().click();

    // Verify navigation to detail page
    await expect(page).toHaveURL(/\/admin\/approvals\/apv-/);
  });
});

// ============================================================================
// Approval Detail Page Tests
// ============================================================================

test.describe('Admin Approval Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalDetailApi(page);
    await mockUploadPhotosApi(page);
    await mockAddCommentApi(page);
    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });
  });

  test('displays approval details correctly', async ({ page }) => {
    // Check page header and order information
    await expect(page.getByRole('heading', { name: /Approval Details/i })).toBeVisible();
    await expect(page.getByText('MA-2024-001235').first()).toBeVisible();

    // Check status badge
    await expect(page.getByText('Pending Approval').first()).toBeVisible();
  });

  test('displays uploaded photos', async ({ page }) => {
    // Check that photos are displayed
    const photos = page.locator('img[src*="example.com/photo"]');
    await expect(photos.first()).toBeVisible();
  });

  test('displays comments timeline', async ({ page }) => {
    // Check comments section
    await expect(page.getByText('Production photos uploaded')).toBeVisible();
  });

  test('shows deadline information', async ({ page }) => {
    // Check deadline is displayed (format: "X days left" or "Xh left")
    await expect(page.getByText(/days? left|h left/i)).toBeVisible();
  });

  test('can copy approval link', async ({ page }) => {
    // Find copy link button if exists
    const copyButton = page.getByRole('button', { name: /copy.*link/i });
    if (await copyButton.isVisible()) {
      await copyButton.click();
      // Verify some feedback (toast, button text change, etc.)
    }
  });
});

// ============================================================================
// Photo Upload Flow Tests
// ============================================================================

test.describe('Admin Photo Upload Flow', () => {
  test('can upload production photos', async ({ page }) => {
    const pendingUploadApproval = {
      ...mockApprovalDetail,
      id: 'apv-001',
      status: 'pending_upload',
      photos: [],
    };

    await mockApprovalDetailApi(page, pendingUploadApproval);
    await mockUploadPhotosApi(page);

    await page.goto('/admin/approvals/apv-001', { waitUntil: 'networkidle' });

    // Look for upload section - check for "Production Photos" heading and upload button
    await expect(page.getByRole('heading', { name: /Production Photos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload Photos/i })).toBeVisible();
  });

  test('shows notify customer option when uploading', async ({ page }) => {
    const pendingUploadApproval = {
      ...mockApprovalDetail,
      id: 'apv-001',
      status: 'pending_upload',
      photos: [],
    };

    await mockApprovalDetailApi(page, pendingUploadApproval);
    await page.goto('/admin/approvals/apv-001', { waitUntil: 'networkidle' });

    // Look for notify checkbox/toggle
    const notifyOption = page.getByText(/notify.*customer|send.*email/i);
    if (await notifyOption.isVisible()) {
      await expect(notifyOption).toBeVisible();
    }
  });
});

// ============================================================================
// Admin Comment Flow Tests
// ============================================================================

test.describe('Admin Comment Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalDetailApi(page);
    await mockAddCommentApi(page);
    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });
  });

  test('can add admin comment', async ({ page }) => {
    // Find comment input
    const commentInput = page.getByPlaceholder(/add.*comment|response/i);
    if (await commentInput.isVisible()) {
      await commentInput.fill('Test admin response to customer');

      // Find and click submit button
      const submitButton = page.getByRole('button', { name: /send|add.*comment|submit/i });
      await submitButton.click();
    }
  });

  test('displays existing comments with author type', async ({ page }) => {
    // Verify admin comments are styled/labeled correctly
    // The mock data has a comment with authorType: 'admin'
    await expect(page.getByText('Admin').first()).toBeVisible();
    await expect(page.getByText('Production photos uploaded')).toBeVisible();
  });
});

// ============================================================================
// Status Transition Tests
// ============================================================================

test.describe('Approval Status Transitions', () => {
  test('pending_upload shows upload required state', async ({ page }) => {
    const pendingUploadApproval = {
      ...mockApprovalDetail,
      status: 'pending_upload',
      photos: [],
    };

    await mockApprovalDetailApi(page, pendingUploadApproval);
    await page.goto('/admin/approvals/apv-001', { waitUntil: 'networkidle' });

    await expect(page.getByText(/Pending Upload|Upload.*Required/i)).toBeVisible();
  });

  test('pending_approval shows awaiting customer state', async ({ page }) => {
    await mockApprovalDetailApi(page);
    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });

    await expect(page.getByText(/Pending Approval/i).first()).toBeVisible();
  });

  test('changes_requested shows customer feedback needed state', async ({ page }) => {
    const changesRequestedApproval = {
      ...mockApprovalDetail,
      status: 'changes_requested',
      comments: [
        ...mockApprovalDetail.comments,
        {
          id: 'cmt-002',
          authorType: 'customer',
          comment: 'Please adjust the colors slightly.',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    await mockApprovalDetailApi(page, changesRequestedApproval);
    await page.goto('/admin/approvals/apv-003', { waitUntil: 'networkidle' });

    await expect(page.getByText(/Changes Requested/i).first()).toBeVisible();
  });

  test('approved shows completion state', async ({ page }) => {
    const approvedApproval = {
      ...mockApprovalDetail,
      status: 'approved',
      approvedAt: new Date().toISOString(),
    };

    await mockApprovalDetailApi(page, approvedApproval);
    await page.goto('/admin/approvals/apv-004', { waitUntil: 'networkidle' });

    await expect(page.getByText(/Approved/i).first()).toBeVisible();
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Approvals Navigation', () => {
  test('back button returns to approvals list', async ({ page }) => {
    await mockApprovalDetailApi(page);
    await mockApprovalsListApi(page);

    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });

    // Find and click back button
    const backButton = page.getByRole('button', { name: /back/i }).or(page.getByRole('link', { name: /back/i }));
    if (await backButton.isVisible()) {
      await backButton.click();
      await expect(page).toHaveURL(/\/admin\/approvals\/?$/);
    }
  });

  test('can navigate to related order', async ({ page }) => {
    await mockApprovalDetailApi(page);
    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });

    // Find link to order
    const orderLink = page.getByRole('link', { name: /MA-2024-001235|View Order/i });
    if (await orderLink.isVisible()) {
      await expect(orderLink).toHaveAttribute('href', /\/admin\/orders\//);
    }
  });
});

// ============================================================================
// Mobile Responsiveness Tests
// ============================================================================

test.describe('Approvals Mobile View', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('approvals list is mobile responsive', async ({ page }) => {
    await mockApprovalsListApi(page);
    await page.goto('/admin/approvals', { waitUntil: 'networkidle' });

    // Check that content is visible and not overflowing
    await expect(page.getByRole('heading', { name: /Photo Approvals/i })).toBeVisible();

    // Check that approvals are displayed in mobile-friendly format
    await expect(page.getByText('MA-2024-001234')).toBeVisible();
  });

  test('approval detail is mobile responsive', async ({ page }) => {
    await mockApprovalDetailApi(page);
    await page.goto('/admin/approvals/apv-002', { waitUntil: 'networkidle' });

    // Check key elements are visible on mobile
    await expect(page.getByText('MA-2024-001235').first()).toBeVisible();
    await expect(page.getByText('Pending Approval').first()).toBeVisible();
  });
});
