/**
 * ProductCard
 *
 * A thin shell around ProductCardMedia. All the interesting mechanics live
 * there; this file is layout and text.
 *
 * WHY THIS FILE IS SO PLAIN — and must stay that way:
 *
 * The card takes no ratio prop and consults no orientation lookup, because every
 * stored product image is square (guaranteed by the upload pipeline, enforced by
 * productImageSchema and asserted in dev by ProductCardMedia). The previous
 * ASPECT_RATIO_MAP + uniformAspectRatio machinery existed to manage variation
 * that no longer exists.
 *
 * Row alignment comes from CSS Grid stretch alone: the <li> is a grid item and
 * stretches to the tallest card in its row; the content block carries `grow` and
 * absorbs the slack. There is deliberately NO min-height and NO line-clamp —
 * card heights genuinely differ between rows and that is fine, because rows are
 * what need to align, not cards.
 *
 * `product.orientation` remains on the product for filters and the detail page,
 * but no longer touches layout.
 *
 * See docs/superpowers/specs/2026-07-30-product-grid-alignment-design.md
 */

import { Link } from '@tanstack/react-router'
import { Palette, Sparkles } from 'lucide-react'
import type { ProductImage } from '@chobii/shared'
import { cn, formatPrice } from '~/lib/utils'
import { ProductCardMedia } from './ProductCardMedia'
import { WishlistButton } from './WishlistButton'
import { ProductRating } from './ProductRating'
import { MEDIA_RATIO } from './productCardTokens'

export type { ProductImage }

export interface ProductCardData {
  id: string
  title: string
  slug: string
  basePrice: string
  images: ProductImage[]
  /** Merchandising metadata — drives filters and the detail page, never layout. */
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  styles?: string[]
  isFeatured?: boolean
  isAiGenerated?: boolean
  /** Null when the product has no approved reviews — see ProductRating. */
  averageRating?: number | null
  reviewCount?: number
}

export interface ProductCardProps {
  product: ProductCardData
  showFeaturedBadge?: boolean
  showAiBadge?: boolean
  className?: string
}

export function ProductCard({
  product,
  showFeaturedBadge = true,
  showAiBadge = true,
  className,
}: ProductCardProps) {
  const price = parseFloat(product.basePrice)
  const hasMedia = (product.images?.length ?? 0) > 0

  return (
    <li
      data-testid="product-card"
      className={cn('group/card relative flex flex-col leading-none', className)}
    >
      <div className="relative h-auto">
        {hasMedia ? (
          <ProductCardMedia
            images={product.images}
            slug={product.slug}
            title={product.title}
          />
        ) : (
          <div
            className={cn(
              'flex w-full items-center justify-center rounded-[var(--card-radius)] bg-mat',
              MEDIA_RATIO
            )}
          >
            <Palette className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}

        {/* Badges sit over the media, so they cannot affect the box.
         *
         * Both were saturated fills — orange Featured, purple AI — sitting a
         * few pixels from the artwork, which is the worst place on the page
         * for a colour that is not the artwork's. Featured inverts to the page
         * ink; AI keeps its icon but becomes a light chip, so it reads as a
         * marker of provenance rather than a second brand. */}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
          {showFeaturedBadge && product.isFeatured && (
            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
              Featured
            </span>
          )}
          {showAiBadge && product.isAiGenerated && (
            <span className="flex items-center gap-1 rounded-full border border-foreground/15 bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground">
              <Sparkles className="h-3 w-3" />
              AI
            </span>
          )}
        </div>
      </div>

      {/* Rating row — mesonart puts stars and the review count left, the
          wishlist heart right (§1.3.6). Renders nothing at all when the
          product has no reviews, so unrated cards simply lose the row rather
          than showing an invented score. */}
      {(product.reviewCount ?? 0) > 0 && (
        <div className="mt-[11px] flex items-center justify-between">
          <ProductRating
            averageRating={product.averageRating ?? null}
            reviewCount={product.reviewCount ?? 0}
          />
        </div>
      )}

      {/* `grow` is what absorbs the slack when the grid stretches this card to
          its row height. That is the entire alignment mechanism on this side. */}
      <div
        data-testid="card-content"
        className="mt-[11px] flex w-full grow flex-col items-baseline gap-2 text-center lg:flex-row lg:text-left"
      >
        <p className="grow">
          <Link
            to="/posters/$slug"
            params={{ slug: product.slug }}
            className="text-product font-medium leading-tight text-foreground transition-colors hover:text-foreground/60"
          >
            {product.title}
          </Link>
        </p>

        {/* Heart + price share the right column.
         *
         * mesonart puts the heart on its own row above the title, opposite the
         * star rating (analysis §1.3.6). We have no star row yet — it lands
         * with collection-page-parity — so it rides here until then.
         *
         * Nothing added here may introduce min-height or line-clamp: the row
         * alignment is grid stretch plus `grow` on this block, and both would
         * fight it. Guarded by ProductCard.tokens.test.ts. */}
        <div className="flex items-center gap-2 lg:flex-col lg:items-end">
          <WishlistButton productId={product.id} />
          <span className="whitespace-nowrap text-product font-light lg:text-right">
            <small className="text-[0.8em]">From</small> {formatPrice(price)}
          </span>
        </div>
      </div>
    </li>
  )
}

export { ProductCardSkeleton } from './ProductCardSkeleton'
export default ProductCard
