/**
 * E2E Tests for Customer Production Photo Approval Flow
 *
 * Tests the public customer approval page (/approve/:token):
 * - View production photos
 * - Full-screen gallery with zoom
 * - Request changes flow
 * - Approve for shipping flow
 * - Handle various approval states
 *
 * Note: These tests use mocked API responses for the UI flow.
 */

import { test, expect, Page } from '@playwright/test';

// ============================================================================
// Test Data
// ============================================================================

const mockApprovalPendingApproval = {
  id: 'apv-001',
  status: 'pending_approval',
  deadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  approvedAt: null,
  photos: [
    { id: 'photo-001', url: 'https://picsum.photos/800/600?random=1', thumbnailUrl: 'https://picsum.photos/200/150?random=1' },
    { id: 'photo-002', url: 'https://picsum.photos/800/600?random=2', thumbnailUrl: 'https://picsum.photos/200/150?random=2' },
    { id: 'photo-003', url: 'https://picsum.photos/800/600?random=3', thumbnailUrl: 'https://picsum.photos/200/150?random=3' },
  ],
  comments: [
    {
      id: 'cmt-001',
      authorType: 'admin',
      comment: 'Your production photos are ready for review. Please check the color accuracy and print quality.',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  order: {
    orderNumber: 'MA-2024-001234',
    status: 'processing',
  },
  orderItem: {
    title: 'Custom AI Poster - Mountain Sunset',
    sizeLabel: '24x36 inches',
  },
};

const mockApprovalPendingUpload = {
  ...mockApprovalPendingApproval,
  status: 'pending_upload',
  photos: [],
  comments: [],
};

const mockApprovalChangesRequested = {
  ...mockApprovalPendingApproval,
  status: 'changes_requested',
  comments: [
    ...mockApprovalPendingApproval.comments,
    {
      id: 'cmt-002',
      authorType: 'customer',
      comment: 'The colors look a bit washed out. Can you please enhance the saturation?',
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'cmt-003',
      authorType: 'admin',
      comment: 'We have adjusted the colors. New photos are uploaded for your review.',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

const mockApprovalApproved = {
  ...mockApprovalPendingApproval,
  status: 'approved',
  approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
};

const mockApprovalExpired = {
  ...mockApprovalPendingApproval,
  status: 'expired',
  deadlineAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
};

// ============================================================================
// Helper Functions
// ============================================================================

async function mockApprovalApi(page: Page, approval = mockApprovalPendingApproval) {
  await page.route('**/api/approvals/**', (route) => {
    const url = route.request().url();

    // Handle different endpoints
    if (url.includes('/changes') && route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Change request submitted successfully',
          data: {
            status: 'changes_requested',
            comment: {
              id: 'new-cmt-001',
              comment: 'Customer change request',
              createdAt: new Date().toISOString(),
            },
          },
        }),
      });
    } else if (url.includes('/approve') && route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Production approved! Your order will proceed to shipping.',
          data: {
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        }),
      });
    } else if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: approval,
        }),
      });
    } else {
      route.continue();
    }
  });
}

async function mockApprovalNotFound(page: Page) {
  await page.route('**/api/approvals/**', (route) => {
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: 'Approval not found or link expired',
      }),
    });
  });
}

async function mockApprovalExpiredToken(page: Page) {
  await page.route('**/api/approvals/**', (route) => {
    route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: 'This approval link has expired',
      }),
    });
  });
}

// ============================================================================
// Pending Approval State Tests
// ============================================================================

test.describe('Customer Approval - Pending Approval State', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
  });

  test('displays approval page with correct header', async ({ page }) => {
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
    await expect(page.getByText('MA-2024-001234')).toBeVisible();
  });

  test('displays order item information', async ({ page }) => {
    await expect(page.getByText('Custom AI Poster - Mountain Sunset', { exact: true })).toBeVisible();
    await expect(page.getByText('24x36 inches')).toBeVisible();
  });

  test('displays status badge correctly', async ({ page }) => {
    await expect(page.getByText('Ready for Review', { exact: true })).toBeVisible();
  });

  test('displays deadline countdown', async ({ page }) => {
    await expect(page.getByText(/days remaining/i)).toBeVisible();
  });

  test('displays production photos grid', async ({ page }) => {
    // Check photos are visible
    const photos = page.locator('img[src*="picsum"]');
    await expect(photos.first()).toBeVisible();
    expect(await photos.count()).toBeGreaterThanOrEqual(3);
  });

  test('displays admin comments', async ({ page }) => {
    await expect(page.getByText('Your production photos are ready for review')).toBeVisible();
    await expect(page.getByText(/MasonArt Team/i)).toBeVisible();
  });

  test('shows action buttons for approval and changes', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Request Changes/i })).toBeVisible();
  });
});

// ============================================================================
// Photo Gallery Tests
// ============================================================================

test.describe('Customer Approval - Photo Gallery', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
  });

  test('clicking photo opens full-screen gallery', async ({ page }) => {
    // Click on first photo
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Gallery modal should be visible
    await expect(page.locator('.fixed.inset-0')).toBeVisible();
  });

  test('gallery shows zoom controls', async ({ page }) => {
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Check for zoom controls
    await expect(page.getByText('100%')).toBeVisible();
  });

  test('gallery can be closed with X button', async ({ page }) => {
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Find and click close button
    const closeButton = page.locator('.fixed.inset-0 button').first();
    await closeButton.click();

    // Modal should be closed
    await expect(page.locator('.fixed.inset-0.bg-black')).not.toBeVisible();
  });

  test('gallery can be closed with Escape key', async ({ page }) => {
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should be closed
    await expect(page.locator('.fixed.inset-0.bg-black')).not.toBeVisible();
  });

  test('gallery has navigation arrows for multiple photos', async ({ page }) => {
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Check for photo counter in gallery
    await expect(page.locator('.fixed.inset-0').getByText('1 / 3')).toBeVisible();
  });
});

// ============================================================================
// Request Changes Flow Tests
// ============================================================================

test.describe('Customer Approval - Request Changes', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
  });

  test('clicking Request Changes shows comment form', async ({ page }) => {
    await page.getByRole('button', { name: /Request Changes/i }).click();

    // Comment form should appear
    await expect(page.getByPlaceholder(/describe the changes/i)).toBeVisible();
  });

  test('can submit change request with comment', async ({ page }) => {
    await page.getByRole('button', { name: /Request Changes/i }).click();

    // Fill in comment
    await page.getByPlaceholder(/describe the changes/i).fill('Please adjust the brightness of the image.');

    // Submit
    await page.getByRole('button', { name: /Submit Request/i }).click();

    // Success message should appear
    await expect(page.getByText(/Change request submitted/i)).toBeVisible();
  });

  test('can cancel change request form', async ({ page }) => {
    await page.getByRole('button', { name: /Request Changes/i }).click();

    // Cancel button
    await page.getByRole('button', { name: /Cancel/i }).click();

    // Form should be hidden
    await expect(page.getByPlaceholder(/describe the changes/i)).not.toBeVisible();
  });

  test('submit button is disabled without comment', async ({ page }) => {
    await page.getByRole('button', { name: /Request Changes/i }).click();

    // Submit button should be disabled
    const submitButton = page.getByRole('button', { name: /Submit Request/i });
    await expect(submitButton).toBeDisabled();
  });
});

// ============================================================================
// Approve Flow Tests
// ============================================================================

test.describe('Customer Approval - Approve Production', () => {
  test.beforeEach(async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
  });

  test('clicking Approve shows confirmation and succeeds', async ({ page }) => {
    // Handle the confirmation dialog
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('approve');
      await dialog.accept();
    });

    await page.getByRole('button', { name: /Approve.*Ship/i }).click();

    // Success message should appear
    await expect(page.getByText(/Approved|proceed to shipping/i)).toBeVisible();
  });

  test('canceling approval confirmation does not approve', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await page.getByRole('button', { name: /Approve.*Ship/i }).click();

    // Should still show pending state
    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).toBeVisible();
  });
});

// ============================================================================
// Different States Tests
// ============================================================================

test.describe('Customer Approval - Pending Upload State', () => {
  test('shows waiting message when photos not uploaded', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingUpload);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Waiting for Production Photos/i)).toBeVisible();
    await expect(page.getByText(/being produced/i)).toBeVisible();
  });

  test('does not show action buttons when pending upload', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingUpload);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Request Changes/i })).not.toBeVisible();
  });
});

test.describe('Customer Approval - Changes Requested State', () => {
  test('shows changes requested status', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalChangesRequested);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Changes Requested/i)).toBeVisible();
  });

  test('displays conversation history', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalChangesRequested);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    // Check both customer and admin comments
    await expect(page.getByText('The colors look a bit washed out')).toBeVisible();
    await expect(page.getByText('We have adjusted the colors')).toBeVisible();
  });

  test('still shows action buttons for review', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalChangesRequested);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).toBeVisible();
  });
});

test.describe('Customer Approval - Approved State', () => {
  test('shows approved confirmation message', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalApproved);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Photos Approved/i)).toBeVisible();
    await expect(page.getByText(/proceed.*shipping/i)).toBeVisible();
  });

  test('does not show action buttons when approved', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalApproved);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Request Changes/i })).not.toBeVisible();
  });

  test('shows approval date', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalApproved);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Approved on/i)).toBeVisible();
  });
});

test.describe('Customer Approval - Expired State', () => {
  test('shows expired message', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalExpired);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h2:has-text("Approval Deadline Passed")')).toBeVisible();
  });

  test('does not show action buttons when expired', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalExpired);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).not.toBeVisible();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Customer Approval - Error Handling', () => {
  test('shows error for invalid token', async ({ page }) => {
    await mockApprovalNotFound(page);
    await page.goto('/approve/invalid-token', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/not found|expired/i)).toBeVisible();
  });

  test('shows error for expired link', async ({ page }) => {
    await mockApprovalExpiredToken(page);
    await page.goto('/approve/expired-token', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('shows retry button on error', async ({ page }) => {
    await mockApprovalNotFound(page);
    await page.goto('/approve/invalid-token', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Try Again/i })).toBeVisible();
  });
});

// ============================================================================
// Mobile Responsiveness Tests
// ============================================================================

test.describe('Customer Approval - Mobile View', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('page is mobile responsive', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    // Check key elements are visible
    await expect(page.getByText(/Production Photo Review/i)).toBeVisible();
    await expect(page.getByText('MA-2024-001234')).toBeVisible();

    // Photos grid should be visible
    const photos = page.locator('img[src*="picsum"]');
    await expect(photos.first()).toBeVisible();

    // Action buttons should be visible and tappable
    await expect(page.getByRole('button', { name: /Approve.*Ship/i })).toBeVisible();
  });

  test('gallery works on mobile', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    // Open gallery
    const photo = page.locator('img[src*="picsum"]').first();
    await photo.click();

    // Gallery should be visible and take full screen
    await expect(page.locator('.fixed.inset-0')).toBeVisible();
  });

  test('change request form works on mobile', async ({ page }) => {
    await mockApprovalApi(page, mockApprovalPendingApproval);
    await page.goto('/approve/test-token-001', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Request Changes/i }).click();

    // Form should be visible and usable
    const textarea = page.getByPlaceholder(/describe the changes/i);
    await expect(textarea).toBeVisible();
    await textarea.fill('Mobile test change request');
  });
});
