/**
 * ProductDetail Component
 *
 * Main product detail display with image gallery, size/frame selectors,
 * pricing, and add-to-cart functionality.
 *
 * ## Geometry (#512)
 *
 * The two columns are deliberately ASYMMETRIC and deliberately not fluid.
 * Measured off the reference at 1440 (docs/design/pdp-parity-reference.md):
 * thumbnail rail 58px, 12px gutter, 658px square image — a 728px gallery
 * block — then a 48px gap, then a 485px buy column that starts at x=796.
 * A symmetric `lg:grid-cols-2` cannot produce that at any gap, which is why
 * the tracks carry the measured maxima instead.
 *
 * `minmax(0, …)` rather than a flat `728px 485px`: between `lg` and 1440 the
 * fixed pair overflows the container and the whole page gains a horizontal
 * scrollbar. With a floor of 0 the track-sizing algorithm hands the buy
 * column its 485px first and lets the gallery take what is left, so the
 * layout degrades by narrowing the artwork rather than by escaping the page.
 * Above 1440 the tracks stop growing and the slack sits on the right, which
 * is what the reference does too.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Star,
  Sparkles,
  Palette,
  X,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { WishlistButton } from './WishlistButton'
import { useCartActions } from '~/hooks/useCartActions'
import { SizeSelector, type SizeVariant } from './SizeSelector'
import { FrameSelector, calculateFramePrice, type FrameOptionData } from './FrameSelector'
import { DeliveryEstimate } from './DeliveryEstimate'
import { ShareRow } from './ShareRow'
import { TrustList } from './TrustList'
import { SalePrice, type SalePricing } from './SalePrice'
import { useGalleryMembership } from '~/hooks/useGalleryMembership'
import {
  useActivePromotion,
  useCountdown,
  type ActivePromotion,
} from '~/hooks/useActivePromotion'

// ============================================================================
// Types
// ============================================================================

import { mainImage, type ProductImage } from '@chobii/shared'
export type { ProductImage }

export interface ProductDetailData {
  /** Product ID */
  id: string
  /** SKU */
  sku: string
  /** Product title */
  title: string
  /** URL slug */
  slug: string
  /** Rich description */
  description: string
  /** Short description */
  shortDescription?: string
  /** Product images */
  images: ProductImage[]
  /** Size variants */
  variants: SizeVariant[]
  /** Available frame options */
  frames?: FrameOptionData[]
  /** Orientation */
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  /** Styles */
  styles?: string[]
  /** Subjects */
  subjects?: string[]
  /** Primary color */
  primaryColor?: string
  /** Room suggestions */
  roomSuggestions?: string[]
  /** Artist info */
  artist?: {
    id: string
    name: string
    slug?: string
  }
  /** Rating info */
  rating?: {
    averageRating: number
    reviewCount: number
  }
  /** Is featured */
  isFeatured?: boolean
  /** Is AI generated */
  isAiGenerated?: boolean
  /** SEO title */
  seoTitle?: string
  /** SEO description */
  seoDescription?: string
  /**
   * The resolved sale, or null when this poster is not discounted (#428).
   *
   * Read, never recomputed — see SalePrice. The frame is deliberately not part
   * of it: the sale is on the artwork, which is the same rule the cart prices
   * a line by.
   */
  sale?: SalePricing | null
}

export interface ProductDetailProps {
  /** Product data */
  product: ProductDetailData
  /**
   * The running promotion, when the caller already holds it. Omit to let the
   * shared lookup answer; pass `null` to say explicitly that none is running.
   * Only the countdown echo reads it — the price comes from `product.sale`.
   */
  promotion?: ActivePromotion | null
  /** Optional className */
  className?: string
}

// ============================================================================
// Measured literals
// ============================================================================

/**
 * Two colours from the parity measurement that have no token yet.
 *
 * `--foreground` is rgb(23 23 23) and `--sale` is rose-600; the reference's
 * H1 is rgb(29 29 29) and its price is rgb(187 0 0). Both are close enough to
 * an existing token to be tempting and far enough to be visible side by side
 * in a diff of the two pages, so they are spelled out here rather than
 * rounded onto a token that means something else. Promoting them to
 * globals.css is a separate change — this file does not own that file.
 */
const TITLE_COLOR = 'text-[rgb(29,29,29)]'
const PRICE_COLOR = 'text-[rgb(187,0,0)]'

// ============================================================================
// Main Component
// ============================================================================

/**
 * ProductDetail - Full product page component with all selection options
 */
export function ProductDetail({ product, promotion, className }: ProductDetailProps) {
  // State for selections
  const [selectedVariant, setSelectedVariant] = useState<SizeVariant | null>(
    product.variants.find((v) => v.isAvailable) || null
  )
  const [selectedFrame, setSelectedFrame] = useState<FrameOptionData | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [isExpanded, setIsExpanded] = useState(false)

  /**
   * The one shared membership signal (#443), not a second read of the session.
   *
   * `product.sale.locked` was resolved before a mid-session join, so somebody
   * who joins from the banner while standing on this page would otherwise keep
   * looking at a gated price. This only ever unlocks the display; the server
   * remains the authority on what is charged.
   */
  const { isMember } = useGalleryMembership()

  /**
   * The countdown echo (parity §1.4 item 6).
   *
   * The deadline is NOT on the product payload and is not derivable here: the
   * server mints this visitor's rolling window into a cookie and clamps it
   * against the real end (#432). It arrives through the same hook the header
   * and /sale read, formatted by the same `formatRemaining` the strip renders
   * through — so the band at the top of the page and the clock in the buy
   * panel cannot print different digits for the same second.
   *
   * Echoed only when the running promotion is the one that priced THIS poster.
   * A promotion this product is excluded from would otherwise hang a clock
   * over a full-price piece, advertising a discount checkout will not honour.
   */
  const { promotion: activePromotion } = useActivePromotion(promotion)
  const countdownPromotion =
    product.sale &&
    activePromotion &&
    activePromotion.promotionId === product.sale.promotionId
      ? activePromotion
      : null

  // Cart store
  const { addItem } = useCartActions()

  // Calculate total price
  const totalPrice = useMemo(() => {
    if (!selectedVariant) return 0

    const basePrice = typeof selectedVariant.price === 'string'
      ? parseFloat(selectedVariant.price)
      : selectedVariant.price

    let total = basePrice

    if (selectedFrame) {
      const frameAddition = calculateFramePrice(
        basePrice,
        selectedFrame.priceModifierType,
        selectedFrame.priceModifierValue
      )
      total += frameAddition
    }

    return total
  }, [selectedVariant, selectedFrame])

  /**
   * The figure the CTA carries (#518).
   *
   * The reference's button reads `Add to cart - Rs. 21,200.00`, so the label
   * has to name a price — and the only defensible price to name is the one
   * printed directly above it. This therefore mirrors SalePrice rather than
   * re-deriving anything: the sale figure when a sale is running, the
   * size-plus-frame total otherwise.
   *
   * The one deliberate divergence is a members-only price the viewer has not
   * unlocked. SalePrice still shows it, tagged `Members`, because that tag is
   * the offer; a button promising the same number would be promising a charge
   * checkout will decline to make, so the button quotes what this visitor
   * actually pays.
   */
  const ctaPrice = useMemo(() => {
    const locked = Boolean(product.sale?.locked) && !isMember
    if (product.sale && !locked) return product.sale.salePrice
    return totalPrice
  }, [product.sale, isMember, totalPrice])

  // Handle add to cart
  const handleAddToCart = useCallback(() => {
    if (!selectedVariant) return

    const basePrice = typeof selectedVariant.price === 'string'
      ? parseFloat(selectedVariant.price)
      : selectedVariant.price

    let framePrice = 0
    if (selectedFrame) {
      framePrice = calculateFramePrice(
        basePrice,
        selectedFrame.priceModifierType,
        selectedFrame.priceModifierValue
      )
    }

    const primaryImage = mainImage(product.images)

    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      frameId: selectedFrame?.id || null,
      quantity,
      productTitle: product.title,
      productSlug: product.slug,
      thumbnailUrl: primaryImage?.url || '',
      sizeLabel: selectedVariant.sizeLabel,
      widthInches: selectedVariant.widthInches,
      heightInches: selectedVariant.heightInches,
      unitPrice: basePrice,
      framePrice,
      frameName: selectedFrame?.name,
      frameType: selectedFrame?.type,
      isAiGenerated: product.isAiGenerated,
    })
  }, [selectedVariant, selectedFrame, quantity, product, addItem])

  // Image navigation
  const handlePrevImage = useCallback(() => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? product.images.length - 1 : prev - 1
    )
  }, [product.images.length])

  const handleNextImage = useCallback(() => {
    setCurrentImageIndex((prev) =>
      prev === product.images.length - 1 ? 0 : prev + 1
    )
  }, [product.images.length])

  // Get primary image
  const currentImage = product.images[currentImageIndex] || product.images[0]

  // Escape closes the expanded view. Registered only while it is open so the
  // page is not carrying a document-level listener for a closed overlay.
  useEffect(() => {
    if (!isExpanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isExpanded])

  return (
    <div className={cn('', className)}>
      <div className="container-wide py-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,728px)_minmax(0,485px)] lg:items-start lg:gap-x-12">
          {/* ----------------------------------------------------------------
              Left column — gallery (#513)

              Sticky, as on the reference: the artwork holds still while the
              buy panel scrolls past it. `lg:self-start` is what makes that
              work — a stretched grid item is exactly as tall as its row and
              has nothing to stick within.

              `lg:z-0` is not decoration either. A sticky element with
              `z-index: auto` has no declared place in the stack, and both the
              site chrome (z-30/z-40) and the parity screenshot harness treat
              "sticky, z-index undeclared, large" as something to lift or hide
              — the harness blanked the whole gallery out of every capture.
              Pinning it to the bottom of the stack says what is true: the
              artwork sticks under the header, never over it.
             ---------------------------------------------------------------- */}
          <div
            data-testid="pdp-gallery"
            className="lg:sticky lg:top-[calc(var(--chrome-offset)+1.5rem)] lg:z-0 lg:self-start"
          >
            {/* DOM order is image-then-rail so the artwork is what a screen
                reader and a mobile viewport reach first; `lg:flex-row-reverse`
                puts the rail back on the left for the desktop measurement. */}
            <div className="flex flex-col gap-3 lg:flex-row-reverse">
              {/* Main image. No border, no padding, no card — the reference
                  has no chrome around the artwork at all.

                  Except at mobile, where it is a rounded card (#523): measured
                  on the reference at 390 the artwork is a 350x350 square — the
                  full content column, so the "~16px of side padding" the spec
                  describes is `container-wide`'s own 20px gutter, not padding
                  this component adds — with a 10px radius. The radius is
                  dropped again from `lg`, where the reference squares the
                  corners off. */}
              <div className="group relative aspect-square min-w-0 flex-1 overflow-hidden rounded-[10px] lg:rounded-none">
                {currentImage?.url ? (
                  <img
                    src={currentImage.url}
                    alt={currentImage.altText || product.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Palette className="h-24 w-24 text-muted-foreground/30" />
                  </div>
                )}

                {/* Expand — circular, pinned inside the top-right corner. */}
                {currentImage?.url && (
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Expand image"
                  >
                    <Expand className="h-4 w-4" />
                  </button>
                )}

                {/* Prev / next.
                    The reference paints no arrows over the artwork, so these
                    fade in on hover — but they stay real, focusable buttons
                    with their labels intact, because fading a control out is
                    not the same as taking the keyboard route away. Opacity
                    rather than `hidden`: a hidden button cannot be tabbed to,
                    and `focus-visible:opacity-100` is what brings it back for
                    the person who needs it. */}
                {product.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevImage}
                      className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnail rail — vertical and 58px wide on desktop, a
                  horizontal scroll strip under the image on mobile (#523).
                  Measured on the reference at 390: 62px squares on a 78px
                  pitch, so a 16px gutter, 10px radius, scrolling past the
                  right edge of the column rather than wrapping. (The parity
                  doc says "~72px" for these; the page itself says 62, and the
                  page is the thing being matched.)

                  `snap-x`/`snap-start` because a strip that scrolls should
                  come to rest on a thumbnail rather than halfway through one;
                  `scrollbar-hide` because the reference shows no bar and a
                  62px-tall strip loses a third of itself to one on the
                  platforms that paint them. */}
              {product.images.length > 1 && (
                <ul className="scrollbar-hide flex snap-x gap-4 overflow-x-auto pb-1 lg:w-[58px] lg:shrink-0 lg:snap-none lg:flex-col lg:gap-3 lg:overflow-x-visible lg:pb-0">
                  {product.images.map((image, index) => {
                    const isCurrent = index === currentImageIndex
                    return (
                      <li key={image.id} className="shrink-0 snap-start lg:snap-align-none">
                        <button
                          type="button"
                          onClick={() => setCurrentImageIndex(index)}
                          aria-label={`Show image ${index + 1} of ${product.images.length}`}
                          aria-current={isCurrent ? 'true' : undefined}
                          data-testid="pdp-thumbnail"
                          className={cn(
                            'block h-[62px] w-[62px] overflow-hidden rounded-[10px] border transition-colors lg:h-[58px] lg:w-[58px] lg:rounded-none',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isCurrent
                              ? 'border-foreground'
                              : 'border-border hover:border-foreground/40'
                          )}
                        >
                          <img
                            src={image.url}
                            alt={image.altText || `${product.title} view ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Right column — buy panel (#514, #518)
             ---------------------------------------------------------------- */}
          <div data-testid="buy-panel" className="space-y-6">
            {/* Header */}
            <div>
              {/* The reference's social-proof row: `● 89 saves · In 7 carts
                  now` on the left, the wishlist heart on the right.
                  We hold no saves counter, no live cart counter and no
                  sold-in-the-last-N-hours counter, and inventing them would
                  be inventing evidence, so the row carries the one piece of
                  real social proof we do have — the review score, which is
                  also the way down to the wall. The heart keeps its measured
                  position. */}
              <div className="flex items-center justify-between gap-4">
                {product.rating && product.rating.reviewCount > 0 ? (
                  <a
                    href="#reviews"
                    data-testid="buybox-reviews-link"
                    className="flex items-center gap-2 rounded-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star className="h-4 w-4 fill-rating text-rating" />
                    <span className="font-medium text-foreground">
                      {product.rating.averageRating.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground underline-offset-4 hover:underline">
                      ({product.rating.reviewCount} reviews)
                    </span>
                  </a>
                ) : (
                  <span aria-hidden="true" />
                )}
                <WishlistButton
                  productId={product.id}
                  variant="card"
                  className="h-9 w-9 shrink-0"
                />
              </div>

              {/* H1 — Urbanist 300 at 42px, SKU inline in the title text.
                  Stepped down on small screens: 42px of Urbanist across a
                  390px viewport is four words a line.

                  The step is a single one at `md`, not a ramp, because that is
                  what the reference does — probed at 390 it is 24px, and at
                  768, 1024 and 1440 it is already 42px. Ours sat at 30px until
                  1024, which made the title the one element on the tablet page
                  that was smaller than the page it is copying. */}
              <h1
                className={cn(
                  'mt-3 font-heading text-[24px] font-light leading-[1.15] md:text-[42px]',
                  TITLE_COLOR
                )}
              >
                {product.title}{' '}
                <span className="whitespace-nowrap">#{product.sku}</span>
              </h1>

              {/* The slot the reference fills with `3 sold in last 84 hours`.
                  We have no such counter; attribution and the AI disclosure
                  are real and belong close to the title, so they take the
                  line rather than leaving a gap in the rhythm. */}
              {(product.artist || product.isAiGenerated) && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {product.artist && (
                    <span>
                      by{' '}
                      <span className="font-medium text-foreground">
                        {product.artist.name}
                      </span>
                    </span>
                  )}
                  {product.artist && product.isAiGenerated && (
                    <span aria-hidden="true">·</span>
                  )}
                  {product.isAiGenerated && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Generated
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Price Display.
             *
             * One component prints this whether or not a sale is running, so
             * the panel and the grid card cannot drift apart about what a
             * discounted price looks like. With no sale it renders exactly the
             * figure this box always showed — the selected size plus frame.
             *
             * With a sale it shows what the payload resolved, which is priced
             * off the artwork and not off the frame. That is not an oversight:
             * `priceCartLine` adds the frame back at full price, so quoting a
             * frame-inclusive discount here would promise a saving the cart
             * then declines to give. The variance note below already says the
             * figure moves with the selection.
             *
             * No card, no border, no background (#514): the grey rounded panel
             * this used to sit in is the loudest thing our page had and the
             * reference has nothing there at all. Poppins 500 at 24px, red.
             */}
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <SalePrice
                  sale={product.sale ?? null}
                  basePrice={totalPrice}
                  isMember={isMember}
                  className={cn('font-sans text-[24px] font-medium', PRICE_COLOR)}
                />
                {selectedFrame && !product.sale && (
                  <span className="text-sm text-muted-foreground">
                    (includes frame)
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Price varies by size and frame selection
              </p>

              {countdownPromotion && (
                <SaleCountdownEcho
                  headline={countdownPromotion.headline}
                  deadline={countdownPromotion.deadline}
                />
              )}
            </div>

            {/* Size Selector */}
            <SizeSelector
              variants={product.variants}
              selectedVariantId={selectedVariant?.id || null}
              onVariantSelect={setSelectedVariant}
            />

            {/* Frame Selector */}
            {product.frames && product.frames.length > 0 && selectedVariant && (
              <FrameSelector
                frames={product.frames}
                selectedFrameId={selectedFrame?.id || null}
                onFrameSelect={setSelectedFrame}
                basePrice={
                  typeof selectedVariant.price === 'string'
                    ? parseFloat(selectedVariant.price)
                    : selectedVariant.price
                }
              />
            )}

            {/* Delivery estimate (#517) — the line the reference puts directly
                under the swatches. Rendered unconditionally, unlike the frame
                block above it: the "printed to order, then shipped" promise is
                true of every poster, framed or not, so it is not the frame
                selector's dependent. */}
            <DeliveryEstimate />

            {/* Quantity and Add to Cart — ONE row (#518).
                130 + 12 + 343 = 485, which is the measured button width
                inside the measured column. The stepper is fixed and the
                button takes the remainder, so the pair keeps that ratio as
                the column narrows instead of the button collapsing first.

                The reference keeps that row intact at 390 too (#523): stepper
                ~99, button ~234. Ours could not, because a 130px stepper plus
                a label carrying a rupee price left the button under its own
                min-content on a 350px column. So the stepper shrinks with the
                page — 32px arrows and a narrower readout make 100px — and the
                button gives up 6px of its padding either side. That is enough
                slack that a five-figure price still fits on the row rather
                than tipping it.

                `flex-wrap` and `basis-0` rather than `flex-1`: the label
                cannot wrap mid-word (Button is `whitespace-nowrap`), so a row
                that cannot fit it must BREAK, not squeeze — squeezing pushes
                the text out of the button and the document gains a horizontal
                scrollbar, which it did. `basis-0` leaves the button's own
                min-content as its hypothetical size, which is exactly the
                width the wrap decision should be made on; deliberately no
                `min-w-0`, since that would switch that floor off again and
                bring the overflow back. */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-[60px] w-[100px] shrink-0 items-center justify-between rounded-pill border border-border px-1 sm:w-[130px]">
                {/* The reference labels this stepper with nothing but its
                    arrows. Sighted users read `‹ 1 ›`; everyone else needs
                    the noun, so it is said once, out of the layout. */}
                <span className="sr-only">Quantity</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent sm:h-9 sm:w-9"
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[1.75rem] text-center text-base tabular-nums text-foreground sm:min-w-[3rem]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted sm:h-9 sm:w-9"
                  aria-label="Increase quantity"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <Button
                variant="solid"
                size="pill"
                onClick={handleAddToCart}
                disabled={!selectedVariant}
                className="h-[60px] grow basis-0 px-5 text-[16px] sm:px-[26px]"
              >
                {selectedVariant
                  ? `Add to cart - ${formatPrice(ctaPrice)}`
                  : 'Add to cart'}
              </Button>
            </div>

            {/* Share (#520). The button that used to sit here had an
                aria-label and no onClick — this row actually shares. */}
            <ShareRow title={product.title} />

            {/* Trust list (#519) — four stacked rows, replacing the three
                centred badges. */}
            <TrustList className="border-t border-border pt-6" />

            {/* Description and Perfect For used to live here as two flat
                sections. They are now the About The Artwork panel of
                ProductTabs, which routes/posters/$slug.tsx renders below the
                buy panel — the reference puts that long-form copy under the
                page, not inside the 485px buy column. */}
          </div>
        </div>
      </div>

      {/* Expanded view. The expand affordance is on the reference, and a
          button that does nothing is worse than no button — so it opens the
          artwork over the page and Escape closes it again. */}
      {isExpanded && currentImage?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${product.title} — full size`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm"
        >
          <img
            src={currentImage.url}
            alt={currentImage.altText || product.title}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close expanded image"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The buy panel's echo of the strip's clock.
 *
 * Its own component purely so the tick lives behind a conditional render
 * rather than a conditional hook — the panel drops the clock when the window
 * runs out, and a hook cannot be dropped with it.
 *
 * Reaching zero mid-session is ordinary rather than an error: the rolling
 * window can expire while the sale is still live. The timer disappears, the
 * price stays, and the next navigation picks up a freshly minted deadline.
 */
function SaleCountdownEcho({
  headline,
  deadline,
}: {
  headline: string
  deadline: string
}) {
  const remaining = useCountdown(deadline)
  if (!remaining) return null

  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>{headline}</span>
      {/* Not a live region: a screen reader interrupting itself once a second
          to re-read a clock is worse than no clock at all. The accessible name
          carries the units the colon-separated digits leave to the layout. */}
      <time
        dateTime={deadline}
        aria-label={remaining.label}
        data-testid="buybox-sale-countdown"
        className="font-medium tabular-nums text-sale"
      >
        {remaining.display}
      </time>
    </p>
  )
}

/**
 * ProductDetail skeleton for loading states.
 *
 * Tracks the real layout, including the asymmetric columns — a skeleton on a
 * different grid from the page it stands in for reads as a jump on every
 * load, which is the one thing a skeleton exists to prevent.
 */
export function ProductDetailSkeleton() {
  return (
    <div className="container-wide py-6 lg:py-10">
      <div className="grid animate-pulse gap-8 lg:grid-cols-[minmax(0,728px)_minmax(0,485px)] lg:items-start lg:gap-x-12">
        {/* Gallery: square artwork with the rail beside it on desktop. */}
        <div className="flex flex-col gap-3 lg:flex-row-reverse">
          <div className="aspect-square min-w-0 flex-1 rounded-[10px] bg-muted lg:rounded-none" />
          <div className="flex gap-4 overflow-hidden lg:w-[58px] lg:shrink-0 lg:flex-col lg:gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[62px] w-[62px] shrink-0 rounded-[10px] bg-muted lg:h-[58px] lg:w-[58px] lg:rounded-none"
              />
            ))}
          </div>
        </div>

        {/* Buy panel */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-9 w-9 rounded-full bg-muted" />
            </div>
            <div className="h-7 w-3/4 rounded bg-muted md:h-12" />
            <div className="h-4 w-40 rounded bg-muted" />
          </div>

          <div className="h-7 w-36 rounded bg-muted" />

          <div className="h-[52px] rounded-md bg-muted" />

          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[92px] w-[92px] rounded-full bg-muted" />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="h-[60px] w-[100px] shrink-0 rounded-pill bg-muted sm:w-[130px]" />
            <div className="h-[60px] grow basis-[200px] rounded-pill bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductDetail
