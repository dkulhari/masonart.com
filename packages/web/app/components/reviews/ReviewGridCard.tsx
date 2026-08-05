/**
 * ReviewGridCard — one review, media and words fused into a single card.
 *
 * This is the card mesonart's Loox wall renders
 * (docs/design/mesonart/mesonart-reviews-page-loox.png and
 * mesonart-pdp-reviews-loox.png), top to bottom:
 *
 *   media slot (photo, or clip with poster + play overlay, `+N` in the corner
 *   when the review carries more than one attachment)
 *     → author name + Verified badge
 *     → date
 *     → star row
 *     → body text
 *     → "Item type:" line
 *     → product chip (thumbnail, title, sku)
 *
 * A review with no photos is THIS card with the media slot omitted — not a
 * different component and not a different list. The wall/list split that
 * preceded this was invented; mesonart has no such thing.
 *
 * Two rules are load-bearing:
 *
 *  - The media slot reserves its aspect ratio BEFORE the image decodes. In a
 *    CSS-columns masonry a slot that grows to fit its decoded image reflows
 *    every card below it in the same column as the photos land.
 *  - A clip costs one poster frame: `preload="none"`, a `poster`, never
 *    `autoPlay`. A page of this grid can hold dozens of cards; clips that
 *    preload themselves are tens of megabytes before anyone asks for one.
 *    (Carried over from #488.)
 */

import { Link } from '@tanstack/react-router'
import { CheckCircle2, Play } from 'lucide-react'
import { cn } from '~/lib/utils'
import { StarRating } from './StarRating'
import type {
  ReviewItemType,
  ReviewMediaItem,
  ReviewProductChip,
} from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

/**
 * What a card needs from a review.
 *
 * Structural rather than an alias of `ReviewFeedItem`, because the same card
 * renders rows from two reads — the site-wide feed and the product-scoped
 * list — and the product-scoped one can hand back a review whose product row
 * has gone.
 */
export interface ReviewCardData {
  id: string
  rating: number
  title?: string | null
  content: string
  createdAt: string
  author?: { id?: string; name?: string | null } | null
  /** Derived server-side: a review row IS a purchase. */
  verified?: boolean
  /** Parts, not a string — composed here by `composeItemType`. */
  itemType?: ReviewItemType | null
  product?: ReviewProductChip | null
  media?: ReviewMediaItem[]
}

export interface ReviewGridCardProps {
  review: ReviewCardData
  /**
   * Called with the review and the index of the attachment that was clicked.
   * The grid owns the lightbox — a card that owned one would trap prev/next
   * inside a single review.
   */
  onOpenMedia?: (review: ReviewCardData, index: number) => void
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * The slot's shape when the media row carries no dimensions — rows written
 * before the probe worker, mostly. Portrait, because a customer photo of a
 * framed print on a wall usually is.
 */
const FALLBACK_ASPECT_RATIO = '4 / 5'

/** Beyond this the slot is taller than the card is wide and dominates it. */
const MIN_ASPECT_RATIO = 0.6

/** Beyond this a panorama shrinks to a strip and reads as a rendering bug. */
const MAX_ASPECT_RATIO = 1.8

// ============================================================================
// Helpers
// ============================================================================

/**
 * "Item type:" — the exact variant the reviewer bought.
 *
 * The API returns the parts and leaves the joining to the surface (#495), so
 * this is where the separator lives. Prefers the frame's name over its type:
 * "Stretch+Black Frame" is what mesonart prints, "stretched" is a category.
 *
 * Null when there is nothing to say, so the caller drops the line rather than
 * rendering a label followed by blank space.
 */
export function composeItemType(
  itemType: ReviewItemType | null | undefined
): string | null {
  if (!itemType) return null

  const parts = [itemType.sizeLabel, itemType.frameName ?? itemType.frameType]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' / ') : null
}

/**
 * The CSS `aspect-ratio` the slot reserves.
 *
 * Clamped: the stored dimensions come from customer uploads, and one 9:21
 * screen recording would otherwise reserve a column-height column of nothing.
 */
function slotAspectRatio(media: ReviewMediaItem | undefined): string {
  const width = media?.width ?? null
  const height = media?.height ?? null

  if (!width || !height || width <= 0 || height <= 0) {
    return FALLBACK_ASPECT_RATIO
  }

  const ratio = width / height
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) {
    return FALLBACK_ASPECT_RATIO
  }

  return `${width} / ${height}`
}

/**
 * What the slot shows before anything is fetched: the poster for a clip, the
 * thumbnail for a photo. Falls back to the full asset so a row that predates
 * the thumbnail worker still renders something.
 */
function slotSource(media: ReviewMediaItem): string | undefined {
  if (media.mediaType === 'video') {
    return media.posterUrl ?? media.thumbnailUrl ?? undefined
  }
  return media.thumbnailUrl ?? media.url
}

/** `8/4/2026` — the numeric date mesonart's cards print. */
function formatCardDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US')
}

// ============================================================================
// Component
// ============================================================================

export function ReviewGridCard({
  review,
  onOpenMedia,
  className,
}: ReviewGridCardProps) {
  const media = review.media ?? []
  const cover = media[0]
  const extraCount = media.length - 1
  const itemType = composeItemType(review.itemType)
  const product = review.product ?? null

  // The review outlives a deleted account, and an unnamed card reads as a
  // broken row rather than an anonymous one.
  const authorName = review.author?.name?.trim() || 'Verified customer'

  return (
    <article
      data-testid="review-grid-card"
      data-rating={review.rating}
      data-has-media={media.length > 0 ? 'true' : 'false'}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background',
        className
      )}
    >
      {cover ? (
        <div
          data-testid="review-card-media"
          // Reserved before a byte is decoded. Without this every card below
          // this one in the column jumps as the photo lands.
          style={{ aspectRatio: slotAspectRatio(cover) }}
          className="relative w-full overflow-hidden bg-muted"
        >
          <button
            type="button"
            data-testid="review-card-media-trigger"
            onClick={() => onOpenMedia?.(review, 0)}
            aria-label={`Open ${
              cover.mediaType === 'video' ? 'video' : 'photo'
            } from ${authorName}'s ${review.rating}-star review`}
            className="group block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {cover.mediaType === 'video' ? (
              <video
                data-testid="review-card-video"
                src={cover.url}
                poster={slotSource(cover)}
                // Non-negotiable: no autoPlay, no metadata fetch. The poster
                // is the whole slot until a click asks for the bytes.
                preload="none"
                muted
                playsInline
                controls={false}
                tabIndex={-1}
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                data-testid="review-card-photo"
                src={slotSource(cover)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            )}

            {cover.mediaType === 'video' ? (
              <span
                data-testid="review-card-play"
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white ring-2 ring-white/80">
                  <Play className="h-5 w-5 translate-x-[1px] fill-current" />
                </span>
              </span>
            ) : null}
          </button>

          {extraCount > 0 ? (
            <span
              data-testid="review-card-media-count"
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white"
            >
              +{extraCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="p-3">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            data-testid="review-card-author"
            className="text-sm font-medium text-foreground"
          >
            {authorName}
          </span>
          {review.verified ? (
            <span
              data-testid="review-card-verified"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <CheckCircle2
                aria-hidden="true"
                className="h-3.5 w-3.5 fill-foreground text-background"
              />
              Verified
            </span>
          ) : null}
        </div>

        <time
          data-testid="review-card-date"
          dateTime={review.createdAt}
          className="mt-1 block text-xs text-muted-foreground"
        >
          {formatCardDate(review.createdAt)}
        </time>

        <div data-testid="review-card-stars" className="mt-1.5">
          <StarRating rating={review.rating} size="xs" showHalfStars={false} />
        </div>

        {review.title ? (
          <h3 className="mt-2 text-sm font-medium text-foreground">
            {review.title}
          </h3>
        ) : null}

        <p
          data-testid="review-card-body"
          className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80"
        >
          {review.content}
        </p>

        {itemType ? (
          <p
            data-testid="review-card-item-type"
            className="mt-3 text-xs leading-snug text-muted-foreground"
          >
            <span className="block">Item type:</span>
            <span className="block text-foreground/70">{itemType}</span>
          </p>
        ) : null}

        {product ? (
          <Link
            to="/posters/$slug"
            params={{ slug: product.slug }}
            data-testid="review-card-product"
            className="mt-3 flex items-center gap-2 rounded-md border border-border p-1.5 transition-colors hover:bg-muted"
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-9 w-9 shrink-0 rounded-sm object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-sm bg-muted"
              />
            )}
            <span className="min-w-0 text-xs leading-snug text-foreground">
              {product.title} <span className="whitespace-nowrap">#{product.sku}</span>
            </span>
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export default ReviewGridCard
