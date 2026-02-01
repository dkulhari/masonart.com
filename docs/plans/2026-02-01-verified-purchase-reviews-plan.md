# Verified Purchase Reviews - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restrict reviews to verified purchasers only - users who have ordered and received the product.

**Architecture:** Add `orderItemId` to reviews schema, create new endpoint for order-based review creation, add review UI to order detail page, remove review form from product pages.

**Tech Stack:** Hono API routes, Drizzle ORM, React components, Playwright E2E tests, Vitest unit tests

---

## Task 1: Add orderItemId to Reviews Schema

**Files:**
- Modify: `packages/api/src/database/schema/reviews.ts`

**Step 1: Read the current schema**

Review the existing reviews schema to understand the structure.

**Step 2: Add orderItemId column**

```typescript
// In packages/api/src/database/schema/reviews.ts
// Add import for orderItems
import { orderItems } from "./orders";

// Add to reviews table definition, after userId field:
    // Order item that authorized this review
    orderItemId: uuid("order_item_id")
      .references(() => orderItems.id, { onDelete: "set null" })
      .notNull(),
```

**Step 3: Add index for orderItemId**

```typescript
// Add to the indexes section:
    orderItemIdIdx: index("reviews_order_item_id_idx").on(table.orderItemId),
```

**Step 4: Update relations**

```typescript
// In reviewsRelations, add:
  orderItem: one(orderItems, {
    fields: [reviews.orderItemId],
    references: [orderItems.id],
  }),
```

**Step 5: Generate migration**

Run: `cd packages/api && bun run db:generate`

**Step 6: Apply migration**

Run: `cd packages/api && bun run db:push`

**Step 7: Commit**

```bash
git add packages/api/src/database/schema/reviews.ts packages/api/drizzle/
git commit -m "feat(reviews): Add orderItemId to reviews schema

Links reviews to specific order items for verified purchase tracking.

Implements verified-purchase-reviews feature."
```

---

## Task 2: Write API Tests for Order-Based Review Creation

**Files:**
- Create: `packages/api/tests/routes/order-reviews.test.ts`

**Step 1: Create test file with imports and setup**

```typescript
/**
 * Order-Based Review Creation Tests
 *
 * Tests for POST /api/orders/:orderId/items/:itemId/review
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testClient } from 'hono/testing'
import { app } from '../../src/app'
import { db } from '../../src/database'
import { orders, orderItems } from '../../src/database/schema/orders'
import { reviews } from '../../src/database/schema/reviews'
import { products, productVariants } from '../../src/database/schema/products'
import { users } from '../../src/database/schema/users'
import { eq } from 'drizzle-orm'

describe('Order-Based Review Creation', () => {
  let testUser: { id: string; email: string }
  let otherUser: { id: string; email: string }
  let testProduct: { id: string }
  let testVariant: { id: string }
  let deliveredOrder: { id: string }
  let deliveredOrderItem: { id: string }
  let pendingOrder: { id: string }
  let pendingOrderItem: { id: string }

  beforeAll(async () => {
    // Create test users
    const [user1] = await db.insert(users).values({
      id: 'test-user-reviews-1',
      email: 'reviewer1@test.com',
      name: 'Test Reviewer',
      emailVerified: true,
    }).returning()
    testUser = user1

    const [user2] = await db.insert(users).values({
      id: 'test-user-reviews-2',
      email: 'reviewer2@test.com',
      name: 'Other User',
      emailVerified: true,
    }).returning()
    otherUser = user2

    // Create test product
    const [product] = await db.insert(products).values({
      title: 'Test Review Product',
      slug: 'test-review-product',
      sku: 'TEST-REV-001',
      status: 'active',
    }).returning()
    testProduct = product

    // Create variant
    const [variant] = await db.insert(productVariants).values({
      productId: testProduct.id,
      sizeLabel: 'A4',
      widthInches: 8.27,
      heightInches: 11.69,
      price: '599.00',
      isInStock: true,
    }).returning()
    testVariant = variant

    // Create delivered order
    const [order1] = await db.insert(orders).values({
      orderNumber: 'MA-TEST-001',
      userId: testUser.id,
      status: 'delivered',
      paymentStatus: 'paid',
      total: '599.00',
      subtotal: '599.00',
      shippingCost: '0.00',
      discount: '0.00',
      tax: '0.00',
      itemCount: 1,
      currency: 'INR',
      shippingAddress: {
        fullName: 'Test User',
        phone: '1234567890',
        addressLine1: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
        countryCode: 'IN',
      },
      deliveredAt: new Date(),
    }).returning()
    deliveredOrder = order1

    const [item1] = await db.insert(orderItems).values({
      orderId: deliveredOrder.id,
      productId: testProduct.id,
      variantId: testVariant.id,
      unitPrice: '599.00',
      quantity: 1,
      lineTotal: '599.00',
      snapshot: {
        title: 'Test Review Product',
        sku: 'TEST-REV-001',
        sizeLabel: 'A4',
        widthInches: 8.27,
        heightInches: 11.69,
      },
    }).returning()
    deliveredOrderItem = item1

    // Create pending order
    const [order2] = await db.insert(orders).values({
      orderNumber: 'MA-TEST-002',
      userId: testUser.id,
      status: 'processing',
      paymentStatus: 'paid',
      total: '599.00',
      subtotal: '599.00',
      shippingCost: '0.00',
      discount: '0.00',
      tax: '0.00',
      itemCount: 1,
      currency: 'INR',
      shippingAddress: {
        fullName: 'Test User',
        phone: '1234567890',
        addressLine1: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
        countryCode: 'IN',
      },
    }).returning()
    pendingOrder = order2

    const [item2] = await db.insert(orderItems).values({
      orderId: pendingOrder.id,
      productId: testProduct.id,
      variantId: testVariant.id,
      unitPrice: '599.00',
      quantity: 1,
      lineTotal: '599.00',
      snapshot: {
        title: 'Test Review Product',
        sku: 'TEST-REV-001',
        sizeLabel: 'A4',
        widthInches: 8.27,
        heightInches: 11.69,
      },
    }).returning()
    pendingOrderItem = item2
  })

  afterAll(async () => {
    // Cleanup in correct order
    await db.delete(reviews).where(eq(reviews.userId, testUser.id))
    await db.delete(orderItems).where(eq(orderItems.orderId, deliveredOrder.id))
    await db.delete(orderItems).where(eq(orderItems.orderId, pendingOrder.id))
    await db.delete(orders).where(eq(orders.userId, testUser.id))
    await db.delete(productVariants).where(eq(productVariants.productId, testProduct.id))
    await db.delete(products).where(eq(products.id, testProduct.id))
    await db.delete(users).where(eq(users.id, testUser.id))
    await db.delete(users).where(eq(users.id, otherUser.id))
  })

  beforeEach(async () => {
    // Clean up reviews before each test
    await db.delete(reviews).where(eq(reviews.userId, testUser.id))
  })

  describe('POST /api/orders/:orderId/items/:itemId/review', () => {
    it('should create review for delivered order item', async () => {
      // Test will be implemented with actual endpoint
    })

    it('should reject review for non-delivered order', async () => {
      // Test will be implemented with actual endpoint
    })

    it('should reject review for other user order', async () => {
      // Test will be implemented with actual endpoint
    })

    it('should reject duplicate review for same product', async () => {
      // Test will be implemented with actual endpoint
    })

    it('should reject review for non-existent order', async () => {
      // Test will be implemented with actual endpoint
    })

    it('should reject review for non-existent item', async () => {
      // Test will be implemented with actual endpoint
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/api && bun test order-reviews`
Expected: Tests should fail (endpoint doesn't exist yet)

**Step 3: Commit test file**

```bash
git add packages/api/tests/routes/order-reviews.test.ts
git commit -m "test(reviews): Add order-based review creation tests

TDD setup for verified purchase reviews endpoint.

Implements verified-purchase-reviews feature."
```

---

## Task 3: Create Order-Based Review API Endpoint

**Files:**
- Modify: `packages/api/src/routes/orders.ts`

**Step 1: Add imports for reviews**

```typescript
// Add to imports at top of file:
import { reviews } from "../database/schema/reviews";
```

**Step 2: Add validation schema for review creation**

```typescript
// Add after verifyPaymentSchema:
/**
 * Schema for creating a review from order
 */
const createOrderReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000),
});
```

**Step 3: Add the review creation endpoint**

```typescript
// Add before the export at the end of the file:

// ============================================================================
// POST /api/orders/:orderId/items/:itemId/review - Create Review for Order Item
// ============================================================================

ordersApp.post(
  "/:orderId/items/:itemId/review",
  zValidator("json", createOrderReviewSchema),
  async (c) => {
    const user = c.get("user");
    const { orderId, itemId } = c.req.param();
    const { rating, title, content } = c.req.valid("json");

    try {
      // Validate orderId and itemId are UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId) || !uuidRegex.test(itemId)) {
        return c.json({ error: "Invalid order or item ID" }, 400);
      }

      // Get order and verify ownership
      const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.userId, user.id)),
      });

      if (!order) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Check order is delivered
      if (order.status !== "delivered") {
        return c.json(
          { error: "Reviews can only be submitted for delivered orders" },
          400
        );
      }

      // Get order item and verify it belongs to the order
      const orderItem = await db.query.orderItems.findFirst({
        where: and(
          eq(orderItems.id, itemId),
          eq(orderItems.orderId, orderId)
        ),
      });

      if (!orderItem) {
        return c.json({ error: "Order item not found" }, 404);
      }

      if (!orderItem.productId) {
        return c.json({ error: "Product no longer available" }, 400);
      }

      // Check if user already has a review for this product
      const existingReview = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(
          and(
            eq(reviews.productId, orderItem.productId),
            eq(reviews.userId, user.id)
          )
        )
        .limit(1);

      if (existingReview.length > 0) {
        return c.json(
          { error: "You have already reviewed this product" },
          409
        );
      }

      // Create the review
      const [newReview] = await db
        .insert(reviews)
        .values({
          productId: orderItem.productId,
          userId: user.id,
          orderItemId: itemId,
          rating,
          title: title || null,
          content,
          status: "pending",
        })
        .returning();

      return c.json(
        {
          message: "Review submitted successfully",
          review: {
            id: newReview.id,
            rating: newReview.rating,
            title: newReview.title,
            content: newReview.content,
            status: newReview.status,
            createdAt: newReview.createdAt,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error creating review:", error);
      return c.json({ error: "Failed to create review" }, 500);
    }
  }
);
```

**Step 4: Run tests**

Run: `cd packages/api && bun test order-reviews`
Expected: Tests should pass

**Step 5: Commit**

```bash
git add packages/api/src/routes/orders.ts
git commit -m "feat(reviews): Add order-based review creation endpoint

POST /api/orders/:orderId/items/:itemId/review
- Validates order belongs to user
- Validates order status is delivered
- Validates order item exists
- Prevents duplicate reviews per product

Implements verified-purchase-reviews feature."
```

---

## Task 4: Remove Product-Based Review Creation

**Files:**
- Modify: `packages/api/src/routes/reviews.ts`

**Step 1: Remove the createReviewApp export and route**

Delete or comment out the `createReviewApp` const and its `post` handler (lines 235-314).

**Step 2: Update exports**

```typescript
// Change the exports at the bottom to remove createReviewApp:
export {
  productReviewsApp,
  // createReviewApp, // REMOVED - reviews now created via orders
  reviewsApp,
  protectedReviewsApp,
  // Keep schemas for potential reuse
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
};
```

**Step 3: Update app.ts to remove the route**

Find where createReviewApp is mounted and remove it.

**Step 4: Run all review tests**

Run: `cd packages/api && bun test reviews`
Expected: Some tests may fail - update tests that relied on product-based creation

**Step 5: Commit**

```bash
git add packages/api/src/routes/reviews.ts packages/api/src/app.ts
git commit -m "feat(reviews): Remove product-based review creation

Reviews can now only be created via order items endpoint.
Existing GET, PATCH, DELETE endpoints unchanged.

Implements verified-purchase-reviews feature."
```

---

## Task 5: Extend Order Detail API Response with Review Status

**Files:**
- Modify: `packages/api/src/routes/orders.ts`

**Step 1: Update GET /api/orders/:id to include review info**

In the order detail endpoint, after fetching order items, also fetch review status:

```typescript
// After fetching the order, add:
// Fetch reviews for products in this order by this user
const userReviews = await db
  .select({
    id: reviews.id,
    productId: reviews.productId,
    status: reviews.status,
  })
  .from(reviews)
  .where(eq(reviews.userId, user.id));

// Create a map for quick lookup
const reviewsByProductId = new Map(
  userReviews.map((r) => [r.productId, { id: r.id, status: r.status }])
);
```

**Step 2: Add review info to item response**

```typescript
// In the items mapping, add review property:
items: order.items.map((item) => ({
  // ... existing fields
  review: item.productId
    ? reviewsByProductId.get(item.productId) || null
    : null,
})),
```

**Step 3: Run tests**

Run: `cd packages/api && bun test orders`

**Step 4: Commit**

```bash
git add packages/api/src/routes/orders.ts
git commit -m "feat(orders): Include review status in order detail response

Each order item now includes review.id and review.status if user
has reviewed that product.

Implements verified-purchase-reviews feature."
```

---

## Task 6: Create ReviewModal Component

**Files:**
- Create: `packages/web/app/components/reviews/ReviewModal.tsx`

**Step 1: Create the modal component**

```typescript
/**
 * ReviewModal Component
 *
 * Modal dialog for writing/editing reviews from order pages.
 * Wraps ReviewForm in a dialog overlay.
 */

import { useCallback } from 'react'
import { X } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ReviewForm, type ReviewFormData } from './ReviewForm'

// ============================================================================
// Types
// ============================================================================

export interface ReviewModalProps {
  /** Whether modal is open */
  isOpen: boolean
  /** Callback to close modal */
  onClose: () => void
  /** Order ID */
  orderId: string
  /** Order item ID */
  orderItemId: string
  /** Product ID */
  productId: string
  /** Product name for display */
  productName: string
  /** Product thumbnail URL */
  productThumbnail?: string
  /** Existing review data (for editing) */
  existingReview?: {
    id: string
    rating: number
    title?: string
    content: string
  }
  /** Callback on successful submission */
  onSuccess?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ReviewModal({
  isOpen,
  onClose,
  orderId,
  orderItemId,
  productId,
  productName,
  productThumbnail,
  existingReview,
  onSuccess,
}: ReviewModalProps) {
  // Handle form submission
  const handleSubmit = useCallback(
    async (data: ReviewFormData) => {
      const url = existingReview
        ? `/api/reviews/${existingReview.id}`
        : `/api/orders/${orderId}/items/${orderItemId}/review`

      const method = existingReview ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to submit review')
      }
    },
    [orderId, orderItemId, existingReview]
  )

  // Handle success
  const handleSuccess = useCallback(() => {
    onSuccess?.()
    // Close after a short delay to show success message
    setTimeout(() => {
      onClose()
    }, 1500)
  }, [onSuccess, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg mx-4',
          'bg-card rounded-xl shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-xl">
          <div className="flex items-center gap-3">
            {productThumbnail && (
              <img
                src={productThumbnail}
                alt={productName}
                className="h-10 w-10 rounded-lg object-cover"
              />
            )}
            <div>
              <h2 id="review-modal-title" className="text-lg font-semibold text-foreground">
                {existingReview ? 'Edit Review' : 'Write a Review'}
              </h2>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {productName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6">
          <ReviewForm
            productId={productId}
            isAuthenticated={true}
            initialData={existingReview ? {
              rating: existingReview.rating,
              title: existingReview.title || '',
              content: existingReview.content,
            } : undefined}
            onSubmit={handleSubmit}
            onSuccess={handleSuccess}
            onCancel={onClose}
            variant="inline"
          />
        </div>
      </div>
    </div>
  )
}

export default ReviewModal
```

**Step 2: Export from index**

Add to `packages/web/app/components/reviews/index.ts`:

```typescript
export { ReviewModal } from './ReviewModal'
export type { ReviewModalProps } from './ReviewModal'
```

**Step 3: Commit**

```bash
git add packages/web/app/components/reviews/ReviewModal.tsx packages/web/app/components/reviews/index.ts
git commit -m "feat(reviews): Add ReviewModal component for order pages

Modal wrapper for ReviewForm with product info header.
Supports both create and edit modes.

Implements verified-purchase-reviews feature."
```

---

## Task 7: Add Review Button to Order Detail Page

**Files:**
- Modify: `packages/web/app/routes/_authed/account/orders.$id.tsx`

**Step 1: Add imports**

```typescript
import { Star, PenLine } from 'lucide-react'
import { ReviewModal } from '~/components/reviews'
```

**Step 2: Add state for modal**

Inside `OrderDetailPage` function, add:

```typescript
const [reviewModalState, setReviewModalState] = useState<{
  isOpen: boolean
  orderItemId: string
  productId: string
  productName: string
  productThumbnail?: string
  existingReview?: {
    id: string
    rating: number
    title?: string
    content: string
  }
} | null>(null)
```

**Step 3: Add review type to OrderItem interface**

```typescript
interface OrderItem {
  // ... existing fields
  review?: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
  } | null
}
```

**Step 4: Add handler functions**

```typescript
const handleWriteReview = (item: OrderItem) => {
  setReviewModalState({
    isOpen: true,
    orderItemId: item.id,
    productId: item.productId,
    productName: item.productTitle,
    productThumbnail: item.thumbnailUrl,
  })
}

const handleEditReview = (item: OrderItem) => {
  if (!item.review) return
  // Fetch full review data for editing
  // For now, open modal - it will fetch data
  setReviewModalState({
    isOpen: true,
    orderItemId: item.id,
    productId: item.productId,
    productName: item.productTitle,
    productThumbnail: item.thumbnailUrl,
    existingReview: item.review ? {
      id: item.review.id,
      rating: 0, // Will be fetched
      content: '', // Will be fetched
    } : undefined,
  })
}

const handleCloseReviewModal = () => {
  setReviewModalState(null)
}

const handleReviewSuccess = () => {
  // Refresh order data
  fetchOrder()
}
```

**Step 5: Add review button to order item card**

In the order items mapping, after the price div, add:

```tsx
{/* Review Button - only for delivered orders */}
{order.status === 'delivered' && (
  <div className="mt-2 flex justify-end">
    {item.review ? (
      <button
        onClick={() => handleEditReview(item)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
          item.review.status === 'pending'
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        )}
      >
        <Star className="h-3.5 w-3.5" />
        {item.review.status === 'pending' ? 'Review Pending' : 'Edit Review'}
      </button>
    ) : (
      <button
        onClick={() => handleWriteReview(item)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <PenLine className="h-3.5 w-3.5" />
        Write Review
      </button>
    )}
  </div>
)}
```

**Step 6: Add modal at end of component**

Before the closing `</div>` of the main component:

```tsx
{/* Review Modal */}
{reviewModalState && (
  <ReviewModal
    isOpen={reviewModalState.isOpen}
    onClose={handleCloseReviewModal}
    orderId={order.id}
    orderItemId={reviewModalState.orderItemId}
    productId={reviewModalState.productId}
    productName={reviewModalState.productName}
    productThumbnail={reviewModalState.productThumbnail}
    existingReview={reviewModalState.existingReview}
    onSuccess={handleReviewSuccess}
  />
)}
```

**Step 7: Commit**

```bash
git add packages/web/app/routes/_authed/account/orders.\$id.tsx
git commit -m "feat(orders): Add review button to order detail page

Shows 'Write Review' for delivered items without reviews.
Shows 'Edit Review' for items with existing reviews.
Opens ReviewModal for submission.

Implements verified-purchase-reviews feature."
```

---

## Task 8: Remove Review Form from Product Page

**Files:**
- Modify: `packages/web/app/components/product/ProductReviews.tsx`

**Step 1: Remove form-related imports and state**

Remove:
- `useState` for `showForm`
- `useCreateReview` hook
- `ReviewForm` import
- Form-related handlers

**Step 2: Remove "Write Review" button**

Delete the button that shows `showForm`.

**Step 3: Add purchase guidance message**

Replace the button with:

```tsx
{/* Purchase Guidance */}
<div className="text-sm text-muted-foreground">
  Purchased this item?{' '}
  <a
    href="/account/orders"
    className="font-medium text-primary hover:underline"
  >
    Leave a review from your order history
  </a>
</div>
```

**Step 4: Remove form rendering**

Remove the `{showForm && ...}` block entirely.

**Step 5: Update props interface**

Remove `isAuthenticated` prop as it's no longer needed.

**Step 6: Commit**

```bash
git add packages/web/app/components/product/ProductReviews.tsx
git commit -m "feat(reviews): Remove review form from product pages

Reviews can now only be submitted from order history.
Added guidance link to order history page.

Implements verified-purchase-reviews feature."
```

---

## Task 9: Update E2E Tests for Verified Purchase Reviews

**Files:**
- Modify: `tests/e2e/reviews.spec.ts`

**Step 1: Update test structure**

Remove tests for product-page review creation. Add tests for order-based review flow.

**Step 2: Add order-based review tests**

```typescript
test.describe('Verified Purchase Reviews', () => {
  test('should show Write Review button on delivered order item', async ({ page }) => {
    // Login as test customer
    await page.goto('/auth/login')
    await page.fill('[name="email"]', 'test-customer@example.com')
    await page.fill('[name="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/account/)

    // Go to orders
    await page.goto('/account/orders')

    // Click on a delivered order
    await page.click('text=Delivered >> xpath=ancestor::a')

    // Should see Write Review button
    await expect(page.locator('button:has-text("Write Review")')).toBeVisible()
  })

  test('should not show Write Review button on non-delivered order', async ({ page }) => {
    // Similar test for processing/shipped orders
  })

  test('should open review modal when clicking Write Review', async ({ page }) => {
    // Click Write Review, verify modal opens
  })

  test('should submit review successfully', async ({ page }) => {
    // Fill and submit review form in modal
  })

  test('product page should not have review form', async ({ page }) => {
    await page.goto('/posters/some-product')
    await expect(page.locator('text=Write a Review')).not.toBeVisible()
    await expect(page.locator('text=Leave a review from your order history')).toBeVisible()
  })
})
```

**Step 3: Run E2E tests**

Run: `bunx playwright test tests/e2e/reviews.spec.ts`

**Step 4: Commit**

```bash
git add tests/e2e/reviews.spec.ts
git commit -m "test(e2e): Update review tests for verified purchase flow

Tests order-based review creation and verifies product page
no longer has review form.

Implements verified-purchase-reviews feature."
```

---

## Task 10: Update ReviewForm for Modal Context

**Files:**
- Modify: `packages/web/app/components/reviews/ReviewForm.tsx`

**Step 1: Update default API call**

The ReviewForm currently calls `/api/products/${productId}/reviews` by default. Since we now pass `onSubmit` prop from ReviewModal, this code path won't be used, but we should remove it to prevent confusion:

```typescript
// Remove the default API call section that calls /api/products/${productId}/reviews
// The form should always receive an onSubmit prop now
```

**Step 2: Make productId optional**

Since the form is now used only in modal context where onSubmit is provided:

```typescript
export interface ReviewFormProps {
  /** Product ID - only used if no onSubmit provided */
  productId?: string
  // ... rest
}
```

**Step 3: Add warning for missing handler**

```typescript
if (!onSubmit && !productId) {
  console.warn('ReviewForm: Either onSubmit or productId must be provided')
}
```

**Step 4: Commit**

```bash
git add packages/web/app/components/reviews/ReviewForm.tsx
git commit -m "refactor(reviews): Update ReviewForm for modal-only usage

- Make productId optional (onSubmit now always provided)
- Remove default API call to product endpoint
- Add warning for invalid prop combinations

Implements verified-purchase-reviews feature."
```

---

## Task 11: Run Full Test Suite and Fix Issues

**Files:**
- Various test files

**Step 1: Run all unit tests**

Run: `bun run test`

**Step 2: Fix any failing tests**

Update tests that relied on old review creation flow.

**Step 3: Run E2E tests**

Run: `bun run test:e2e`

**Step 4: Fix any E2E failures**

Update selectors and flows as needed.

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(tests): Update tests for verified purchase reviews

Fixed tests affected by review flow changes.

Implements verified-purchase-reviews feature."
```

---

## Task 12: Final Review and Cleanup

**Files:**
- All modified files

**Step 1: Review all changes**

Run: `git diff main...HEAD --stat`

**Step 2: Run type check**

Run: `bun run typecheck`

**Step 3: Run linter**

Run: `bun run lint`

**Step 4: Fix any issues**

**Step 5: Create final commit if needed**

```bash
git add -A
git commit -m "chore: Cleanup and type fixes for verified purchase reviews"
```

---

## Summary of Files Changed

**Backend:**
- `packages/api/src/database/schema/reviews.ts` - Add orderItemId column
- `packages/api/src/routes/orders.ts` - Add review creation endpoint + include review in response
- `packages/api/src/routes/reviews.ts` - Remove product-based creation

**Frontend:**
- `packages/web/app/components/reviews/ReviewModal.tsx` - New modal component
- `packages/web/app/components/reviews/ReviewForm.tsx` - Update for modal usage
- `packages/web/app/components/reviews/index.ts` - Export new component
- `packages/web/app/components/product/ProductReviews.tsx` - Remove form, add guidance
- `packages/web/app/routes/_authed/account/orders.$id.tsx` - Add review button + modal

**Tests:**
- `packages/api/tests/routes/order-reviews.test.ts` - New API tests
- `tests/e2e/reviews.spec.ts` - Updated E2E tests

**Database:**
- New migration for orderItemId column
