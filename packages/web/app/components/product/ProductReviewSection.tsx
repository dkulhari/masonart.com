/**
 * The product page's review section — ONE surface.
 *
 * mesonart runs the same Loox grid here that it runs on /reviews; the only
 * difference is that this one is filtered to a product
 * (docs/design/mesonart/mesonart-pdp-reviews-loox.png). Header row, masonry,
 * "Show more reviews".
 *
 * This replaces a split that was invented rather than observed: a media-only
 * wall of square tiles above a written `ProductReviews` list with its own
 * heading, rating summary, filters and pager. The reference has none of that. A
 * review without a photo is the same card with its media slot omitted, sitting
 * in the same grid as the ones with photos.
 *
 * Two things the retired list owned and this section has to keep owning:
 *
 *  - `id="reviews"`. It is the anchor the review section is linked by, and the
 *    e2e suite locates the section through it. It stays on the <section>, with
 *    the grid inside it, so a jump lands on the wall rather than above an empty
 *    container.
 *  - The way in. The written list carried the only "leave a review" link on the
 *    page; the header row's pill is now that link. Both point at the orders
 *    list, because a review is created against an order item — there is no
 *    form to open from here.
 *
 * The aggregate comes from the product the route already loaded. No second
 * fetch, and in particular no fetch through `hooks/useReviews`'s relative
 * `/api` — there is no Vite proxy in this repo, so a relative request passes in
 * jsdom and fails in the browser (#493).
 */

import { ReviewGrid } from '~/components/reviews/ReviewGrid'
import { ReviewSectionHeader } from '~/components/reviews/ReviewSectionHeader'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ProductReviewSectionProps {
  /** The poster whose reviews this wall holds. */
  productId: string
  /** Null when this poster has nothing to average. NOT to be coalesced to 0. */
  averageRating?: number | null
  /** Null when the count is unknown — not the same as zero. */
  reviewCount?: number | null
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

/** Cards per fetch, and the size of each "Show more reviews" step. */
const PAGE_SIZE = 24

// ============================================================================
// Component
// ============================================================================

export function ProductReviewSection({
  productId,
  averageRating = null,
  reviewCount = null,
  className,
}: ProductReviewSectionProps) {
  return (
    <section
      id="reviews"
      data-testid="product-reviews"
      className={cn('border-t border-border bg-background', className)}
    >
      <div className="container-wide py-12">
        {/* The reference carries no visible heading — the wall is the section.
            The heading stays for the screen reader and the crawler. */}
        <h2 className="sr-only">Customer Reviews</h2>

        <ReviewSectionHeader
          averageRating={averageRating}
          reviewCount={reviewCount}
          scopeLabel="for this poster"
        />

        {/* `productId` is the only thing separating this deployment of the grid
            from the unfiltered one on /reviews. */}
        <ReviewGrid productId={productId} pageSize={PAGE_SIZE} className="mt-6" />
      </div>
    </section>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

/**
 * What the route shows while the product loads. Shaped like the section it
 * stands in for — a header row and a masonry of cards — rather than like the
 * rating summary and stacked list that used to be here.
 */
export function ProductReviewSectionSkeleton({
  className,
}: {
  className?: string
}) {
  return (
    <section className={cn('border-t border-border bg-background', className)}>
      <div className="container-wide py-12">
        <div className="flex animate-pulse items-center justify-between gap-4 border-b border-border pb-4">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-10 w-36 rounded-full bg-muted" />
        </div>

        <div className="mt-6 columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
          {[64, 48, 72, 56, 60].map((height, index) => (
            <div
              key={index}
              className="mb-4 block break-inside-avoid animate-pulse rounded-lg bg-muted"
              style={{ height: `${height * 4}px` }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ProductReviewSection
