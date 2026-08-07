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
import { cn } from '~/lib/utils'
import { ProductCardMedia } from './ProductCardMedia'
import { ChooseOptions } from './ChooseOptions'
import { WishlistButton } from './WishlistButton'
import { ProductRating } from './ProductRating'
import { SalePrice, type SalePricing } from './SalePrice'
import { MEDIA_RATIO, PLATE_BG } from './productCardTokens'

export type { ProductImage }

export interface ProductCardData {
  id: string
  /** Catalogue code, rendered under the title as "#ABS-001" (§1.3.6). */
  sku?: string
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
  /**
   * The resolved sale, or null when this poster is not discounted (#428).
   *
   * The list endpoint returns it and `toFeaturedProducts` passes it straight
   * through, so a card that has one prints it. Read, never recomputed — see
   * SalePrice.
   */
  sale?: SalePricing | null
}

export interface ProductCardProps {
  product: ProductCardData
  showFeaturedBadge?: boolean
  showAiBadge?: boolean
  /**
   * This card holds the LCP candidate — load its artwork eagerly.
   *
   * Set by the caller that knows where the fold is, never by the card. On the
   * home page that is the first cell of the Best Seller rail, the first band
   * under the hero; on a grid nothing sets it, because a grid's first row is
   * already above the fold and the browser finds it without help.
   */
  priority?: boolean
  className?: string
}

export function ProductCard({
  product,
  showFeaturedBadge = true,
  showAiBadge = true,
  priority = false,
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
            priority={priority}
          />
        ) : (
          <div
            className={cn(
              // PLATE_BG, matching a card that HAS artwork — see globals.css.
              // The baked mat colour belongs to pixels, not to surfaces.
              'flex w-full items-center justify-center rounded-[var(--card-radius)]',
              PLATE_BG,
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

        {/* Sibling of the media link, never a child of it (#420): a button
            inside an anchor is invalid, and clicking it would navigate. */}
        {hasMedia && <ChooseOptions product={product} />}
      </div>

      {/* Rating row — stars and the review count left, the wishlist heart
          right, exactly as mesonart's `.loomx-hieghtx` row does it (§1.3.6).
          The row ALWAYS renders, because the heart lives here and every card
          has one; ProductRating is the part that disappears on an unrated
          product rather than showing an invented score. `ms-auto` is what
          keeps the heart right when the stars are absent — `justify-between`
          alone would slide a lone child back to the left. */}
      <div className="mt-[11px] flex items-center justify-between gap-2">
        <ProductRating
          averageRating={product.averageRating ?? null}
          reviewCount={product.reviewCount ?? 0}
        />
        {/* -me-2 pulls the 32px hit area's inset back so the glyph, not the
            button box, lines up with the card's right edge. */}
        <WishlistButton productId={product.id} className="-me-2 ms-auto" />
      </div>

      {/* `grow` is what absorbs the slack when the grid stretches this card to
          its row height. That is the entire alignment mechanism on this side. */}
      {/* mt-[13px], and `gap-6` until the price moves beside the title at lg.
       *
       * The meta stack has to read as one rhythm. Measured at 390 it ran
       * 20px plate->stars, 18px stars->title, then 4px title->price: the
       * tightest gap in the stack sat between the two things that most need
       * separating, and at 4px — under the title's own 20px leading — the
       * price read as a third line of the title rather than a different fact.
       * 13px and gap-6 put all three at 20px of ink-to-ink air. The reference's
       * own mobile card measures 28.5 / 27.5 / 25 — three equal gaps, which is
       * the property, not the absolute number.
       *
       * From lg the direction is row and gap-2 is the horizontal gap between
       * the title column and the price, which is unchanged. */}
      <div
        data-testid="card-content"
        className="mt-[13px] flex w-full grow flex-col items-baseline gap-6 text-left lg:flex-row lg:gap-2"
      >
        <p className="grow">
          <Link
            to="/posters/$slug"
            params={{ slug: product.slug }}
            className="text-product font-medium leading-tight text-foreground transition-colors hover:text-foreground/60"
          >
            {product.title}
            {/* mesonart bakes the code into the title string ("Wabi-Sabi Wall
                Art #TX012") and lets the narrow column wrap it onto its own
                line. Ours is a real column, so it gets its own line
                deliberately — same face, size and weight as the title, and
                inside the same link, as theirs is. */}
            {product.sku && <span className="block">#{product.sku}</span>}
          </Link>
        </p>

        {/* Price alone in the right column — the heart moved up to the rating
         * row (§1.3.6), which is where mesonart has it.
         *
         * text-price, not text-product: their `.price__regular` is a step
         * smaller than the title (fluid sm→base against the title's
         * base→xl), which is what stops the price competing with the name.
         *
         * Nothing added here may introduce min-height or line-clamp: the row
         * alignment is grid stretch plus `grow` on this block, and both would
         * fight it. Guarded by ProductCard.tokens.test.ts. */}
        {/* One component prints this whether or not a sale is running, so a
            discounted card and the buy panel cannot describe the same saving
            differently. With no sale it renders exactly what this span always
            did: "From ₹1,999.00" on one unbreakable line.
         *
         * The card does NOT read membership. `sale.locked` is the server's
         * answer, and reaching for the session from a component mounted once
         * per cell would put a context read in every square of the grid — the
         * PDP and the cart, which are single surfaces, do that catching-up. */}
        <div className="flex flex-col gap-2">
          <SalePrice
            sale={product.sale ?? null}
            basePrice={price}
            prefix="From"
            className="text-price font-light lg:justify-end lg:text-right"
          />
        </div>
      </div>
    </li>
  )
}

export { ProductCardSkeleton } from './ProductCardSkeleton'
export default ProductCard
