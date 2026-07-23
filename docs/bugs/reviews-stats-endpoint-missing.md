# Bug: Product Reviews Stats Endpoint Missing

**Severity:** Medium
**Component:** API → Reviews
**Discovered:** 2026-03-14

## Summary

The frontend product detail page calls `GET /api/products/:productId/reviews/stats` to display the review summary (average rating, total count, star distribution). This endpoint does not exist in the API, causing a 500 error on every product page load.

## How to Reproduce

1. Navigate to any product detail page (e.g. `/posters/digital-cosmos`)
2. Open browser console
3. See 500 error for `/api/products/<uuid>/reviews/stats`

```bash
curl http://localhost:3000/api/products/213e6848-ca68-4276-b9ab-b96eed13f2b6/reviews/stats
# Returns: {"error":"Internal Server Error","message":"An unexpected error occurred"}
```

## Root Cause

The frontend hook (`packages/web/app/hooks/useReviews.ts:107`) calls the endpoint, but no route handler was ever created in `packages/api/src/routes/reviews.ts`. The `productReviewsApp` only has a `GET /` handler for listing reviews — no `/stats` route.

A `/stats` endpoint exists on the **admin** route (`GET /api/admin/reviews/stats`), but it returns moderation counts (pending/approved/rejected) — not per-product review statistics.

## Expected Response

The frontend expects this shape (from `useReviews.ts:54-62`):

```typescript
{
  averageRating: number,      // e.g. 4.3
  totalReviews: number,       // e.g. 47
  distribution: [
    { rating: 5, count: 25, percentage: 53 },
    { rating: 4, count: 12, percentage: 26 },
    { rating: 3, count: 6,  percentage: 13 },
    { rating: 2, count: 3,  percentage: 6 },
    { rating: 1, count: 1,  percentage: 2 }
  ]
}
```

## Fix

Add a `GET /stats` handler to `productReviewsApp` in `packages/api/src/routes/reviews.ts`:

- Query approved reviews for the given `productId`
- Calculate average rating, total count, and per-star distribution
- Cache the result (same pattern as the list endpoint, ~5 min TTL)
- Return the shape expected by `ReviewStatsResponse`

### Files to Change

| File | Change |
|------|--------|
| `packages/api/src/routes/reviews.ts` | Add `productReviewsApp.get("/stats", ...)` handler |

### Important

The `/stats` route must be registered **before** any `/:param` catch-all routes on the same router to avoid Hono interpreting "stats" as a parameter value.
