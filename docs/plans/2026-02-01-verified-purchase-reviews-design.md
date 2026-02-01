# Verified Purchase Reviews - Design Document

**Date:** 2026-02-01
**Status:** Approved

## Overview

Only customers who have purchased AND received a product can write reviews. Reviews are initiated exclusively from order history, not from product pages.

## Requirements

| Requirement | Decision |
|-------------|----------|
| Who can review | Only users with delivered orders containing the product |
| Entry point | Order detail page (`/account/orders/:id`) |
| Product page behavior | Review form removed; review list remains |
| Time limit | None |
| Review form UI | Modal dialog on order detail page |
| Duplicate reviews | One review per user per product; show "Edit Review" if exists |

## Data Model

### Reviews Table Changes

Add `orderItemId` column to link reviews to specific purchases:

```sql
ALTER TABLE reviews
ADD COLUMN order_item_id UUID NOT NULL REFERENCES order_items(id);
```

**Schema update in Drizzle:**

```typescript
// packages/api/src/database/schema/reviews.ts
orderItemId: uuid("order_item_id")
  .notNull()
  .references(() => orderItems.id),
```

## API Changes

### Remove

- `POST /api/products/:productId/reviews` - No longer accepting reviews from product pages

### New Endpoint

**`POST /api/orders/:orderId/items/:itemId/review`**

Creates a review for a specific order item.

Request:
```json
{
  "rating": 5,
  "title": "Great quality!",
  "content": "The poster arrived perfectly..."
}
```

Validations:
1. User owns the order (403 if not)
2. Order status is `delivered` (400 if not)
3. Order item exists in order (404 if not)
4. User hasn't reviewed this product yet (409 if duplicate)

Response: Created review object with `201` status.

### Modified Responses

**`GET /api/orders/:id`** - Order detail response

Add to each order item:
```json
{
  "items": [
    {
      "id": "item-uuid",
      "productId": "product-uuid",
      "productTitle": "Mountain Sunset Poster",
      "review": {
        "id": "review-uuid",
        "status": "approved"
      }
      // ... other fields
    }
  ]
}
```

`review` is `null` if no review exists for this product by this user.

### Unchanged

- `GET /api/products/:productId/reviews` - Fetches reviews for display
- `GET /api/reviews/:reviewId` - Get single review
- `PATCH /api/reviews/:reviewId` - Edit own review
- `DELETE /api/reviews/:reviewId` - Delete own review

## Frontend Changes

### Order Detail Page (`/account/orders/:id`)

For each order item in a delivered order, display:

| Has Review? | Review Status | Button |
|-------------|---------------|--------|
| No | - | "Write Review" (primary) |
| Yes | pending | "Edit Review" (muted) |
| Yes | approved | "Edit Review" |
| Yes | rejected | "Edit Review" |

Non-delivered orders show no review button.

### New Component: `ReviewModal.tsx`

Modal dialog containing the review form:
- Star rating (1-5, required)
- Title (optional, max 255 chars)
- Content (required, 10-5000 chars)
- Submit button
- Cancel button

Opens over order detail page. On successful submission:
- Close modal
- Update order item's review state
- Show success toast

For editing: pre-populate with existing review data.

### Product Page (`/posters/:slug`)

- Remove `ReviewForm` component
- Keep `ReviewList` component for displaying reviews
- Add text: "Purchased this item? Leave a review from your order history."

## Component Structure

```
packages/web/app/components/
├── reviews/
│   ├── ReviewModal.tsx      # NEW - Modal wrapper for form
│   ├── ReviewForm.tsx       # MODIFY - Accept orderItemId prop
│   ├── ReviewList.tsx       # UNCHANGED
│   ├── ReviewCard.tsx       # UNCHANGED
│   └── ...
└── orders/
    └── OrderItemCard.tsx    # MODIFY - Add review button
```

## Testing

### API Tests

| Test Case | Expected |
|-----------|----------|
| Create review for delivered order item | 201, review created |
| Create review for pending order | 400 error |
| Create review for shipped order | 400 error |
| Create review for other user's order | 403 error |
| Create review for non-existent item | 404 error |
| Create duplicate review (same product) | 409 error |
| Edit own review | 200, status reset to pending |
| Order detail includes review status | review object in items |

### E2E Tests

| Test Case | Expected |
|-----------|----------|
| Delivered order shows "Write Review" | Button visible |
| Non-delivered order hides button | No button |
| Click "Write Review" opens modal | Modal appears |
| Submit review updates button | Shows "Edit Review" |
| Product page has no review form | Form absent |
| Product page shows review list | List visible |
| Edit review pre-populates form | Data shown |

### Tests to Update

- `tests/e2e/reviews.spec.ts` - Rewrite for order-based flow
- `packages/api/tests/routes/reviews.test.ts` - Remove product-based creation tests
- `packages/web/tests/components/reviews/ReviewForm.test.tsx` - Update for modal context

## Migration Notes

No data migration needed - system is in development with no existing reviews.

## Files to Modify

### Backend
- `packages/api/src/database/schema/reviews.ts` - Add orderItemId column
- `packages/api/src/routes/reviews.ts` - Remove POST endpoint for products
- `packages/api/src/routes/orders.ts` - Add review creation endpoint, extend item response

### Frontend
- `packages/web/app/components/reviews/ReviewModal.tsx` - New component
- `packages/web/app/components/reviews/ReviewForm.tsx` - Accept orderItemId, support edit mode
- `packages/web/app/routes/_authed/account/orders.$id.tsx` - Add review button + modal
- `packages/web/app/routes/posters/$slug.tsx` - Remove review form
- `packages/web/app/components/product/ProductReviews.tsx` - Remove form, add guidance text
