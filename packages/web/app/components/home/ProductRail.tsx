/**
 * ProductRail — the home page's one horizontally-scrolling product band.
 *
 * Tickets #530 (Best Seller) and #534 (New In). Both bands on mesonart are the
 * same object with different copy and a different sort behind them, so this is
 * one primitive and the two band files are thin.
 *
 * THE MEASURED BAND (mesonart.com home, 1440x900 and 390x844):
 *
 *   heading row     display heading left, a pair of ~56px circular outline
 *                   prev/next buttons at the far right. Prev is greyed at the
 *                   start of the track. Hidden on mobile, which swipes.
 *   track           four cards across at 1440 with a 20px gutter, flush with
 *                   the page container on both sides. At 390 one card takes
 *                   ~73% of the viewport and the next peeks past the right
 *                   edge — the peek is the whole affordance there, since
 *                   there are no arrows to say the row continues.
 *   footer          ONE centred outline pill, "View All", with a small
 *                   leading icon. Not a text link, and not in the heading row.
 *
 * WHY THIS IS NOT ProductCarousel
 *
 * `product/ProductCarousel.tsx` is the PDP's related-products row (#522). It
 * is close — same scroll mechanics, same disabled-edge logic — but it is a
 * five-up track under a small `text-xl` heading with no View All pill, and it
 * is live on `/posters/$slug`. Widening it with four new props to serve a
 * different band would put the PDP's two rows one prop-default away from
 * changing shape. So the two remain separate components, and share only the
 * part that was genuinely identical: the scroll/edge mechanics, now in
 * `useScrollTrack` (#629).
 *
 * WHY THE CARD IS UNTOUCHED
 *
 * Every cell is a real `product/ProductCard`, sized only through its own
 * `className`. That card is shared with `/posters` and `/collections/$slug`,
 * and it already draws mesonart's exact anatomy — stars + `(count)` left with
 * the wishlist heart right, then the title left with `From ₹X` right-aligned
 * on the same baseline, dropping to its own line below `lg`. The reason the
 * home page showed no stars was never the card: it was the endpoint behind it
 * (see BestSellersRail.tsx).
 *
 * The Featured badge is the one thing turned off. mesonart puts no badge on
 * these cards, and on a rail that is *entirely* best sellers or *entirely*
 * new arrivals a per-card "Featured" chip labels nothing.
 */

import { useId } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductCard, type ProductCardData } from '~/components/product/ProductCard'
import type {
  SortOption,
  SortOrder,
} from '~/components/product/ProductFilters'
import { buttonVariants } from '~/components/ui/Button'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { SectionBand, type SectionBandProps } from '~/components/ui/SectionBand'
import { useScrollTrack } from '~/hooks/useScrollTrack'

/**
 * Where the View All pill lands.
 *
 * Typed as the collection page's own sort params rather than a free string:
 * `/posters` validates search into `PostersSearchParams`, and a key it does
 * not know is dropped rather than honoured — a rail whose pill silently
 * landed on the unsorted grid would be worse than no pill.
 */
export interface RailViewAllSearch {
  sortBy: SortOption
  sortOrder: SortOrder
}

export interface ProductCategoryChip {
  id: string
  label: string
}

export interface ProductRailProps {
  /** Band title, e.g. "Best Seller" or "New In". */
  heading: string
  products: ProductCardData[]
  /** Sort the centred View All pill carries into `/posters`. */
  viewAllSearch: RailViewAllSearch
  /** Category/Style filter chips row (#564). */
  categoryChips?: readonly ProductCategoryChip[]
  selectedCategory?: string
  onSelectCategory?: (id: string) => void
  /** Band fill. Both home rails are plain white on the bar. */
  tone?: SectionBandProps['tone']
  /**
   * This rail is the first band under the hero — load its first card eagerly.
   *
   * That card's artwork is the LCP candidate, and `loading="lazy"` on it costs
   * the measurement a round trip the preload scanner would otherwise have
   * started. Only the FIRST card: making the whole track eager would trade one
   * good number for four unnecessary downloads and a worse one.
   */
  priority?: boolean
  /** Hook for the band's own test id, e.g. `best-sellers-rail`. */
  testId?: string
  className?: string
}

/**
 * Card width per breakpoint, against a 20px (`gap-5`) gutter.
 *
 * 82% at mobile is measured: their card is 286px inside a 390px viewport, and
 * the percentage resolves against this track's 350px content box (the viewport
 * less the two 20px page gutters), not the viewport — 286/350 = 82%. That
 * leaves ~63px of the next card showing. Three up from `sm`, four up from
 * `lg` — four is what 1440 shows, and it is the count the bar's own grid uses.
 */
const CARD_WIDTH =
  'w-[82%] shrink-0 snap-start sm:w-[calc((100%-40px)/3)] lg:w-[calc((100%-60px)/4)]'

export function ProductRail({
  heading,
  products,
  viewAllSearch,
  categoryChips,
  selectedCategory,
  onSelectCategory,
  tone = 'plain',
  priority = false,
  testId,
  className,
}: ProductRailProps) {
  const headingId = useId()
  const { trackRef, atStart, atEnd, updateEdges, scrollByDirection, handleTrackKeyDown } =
    useScrollTrack<HTMLUListElement>(products)

  /**
   * An empty catalogue is no band, not a heading over an empty track with two
   * dead arrows and a pill pointing at nothing. Same call ProductCarousel and
   * CategoriesSection already make.
   */
  if (products.length === 0 && !categoryChips?.length) return null

  return (
    /**
     * The band's own vertical rhythm, overriding SectionBand's `py-16 sm:py-24`.
     *
     * MEASURED, both sides. The bar's Best Seller band runs 617px from the top
     * of its heading to the foot of its View All pill; ours runs 616 — the
     * content stacks are the same object. What differed was the air: 96 above
     * the heading and 96 below the pill left the pill sitting 48px under the
     * card text and 96px above the band's edge, floating high in its own
     * pocket, and the band 84px taller than a band with the same contents.
     *
     * At py-14 the pocket is 48 above / 56 below, which is the bar's own ratio
     * (it measures 46.5 above its pill and 63.5 below).
     *
     * On a phone that ratio does not hold: measured at 390, the bar's Best
     * Seller band opens 24px under the seam and its rail ends ON the next
     * seam — 643px of band against our 733 for the same stack (#541). `py-6`
     * is that 24, and the desktop pocket above stays exactly as it was.
     *
     * Both breakpoints have to be named: twMerge only resolves a conflict
     * within one variant, so `py-6` alone would leave `sm:py-24` standing.
     */
    <SectionBand
      tone={tone}
      data-testid={testId}
      className={cn('py-6 sm:py-14', className)}
    >
      {/* Heading to artwork: 32px on the bar, and the 56px arrows overhang the
          heading's box by ~6, so the margin is set a step under that. */}
      <div className="mb-4 flex items-center justify-between gap-6 sm:mb-7">
        <DisplayHeading as="h2" id={headingId} className="text-section">
          {heading}
        </DisplayHeading>

        {/* Circular prev/next, far right of the heading row. Hidden below `lg`
            exactly as theirs is — mobile scrolls by thumb, and the peeking
            card is what says the row continues. */}
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <button
            type="button"
            aria-label={`Previous ${heading} products`}
            disabled={atStart}
            onClick={() => scrollByDirection(-1)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon' }),
              'h-14 w-14'
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={`Next ${heading} products`}
            disabled={atEnd}
            onClick={() => scrollByDirection(1)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon' }),
              'h-14 w-14'
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Category filter pills row (#564) */}
      {categoryChips && categoryChips.length > 0 && (
        <div
          data-testid="rail-category-pills"
          className="mb-4 flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-[var(--page-padding)] px-[var(--page-padding)] sm:mb-6 lg:mx-0 lg:px-0"
        >
          {categoryChips.map((chip) => {
            const isSelected = selectedCategory
              ? selectedCategory === chip.id
              : chip.id === 'all'
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onSelectCategory?.(chip.id)}
                className={cn(
                  'flex h-10 min-h-[44px] shrink-0 items-center justify-center rounded-full px-6 text-center text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:h-[52px] lg:px-7 lg:text-base',
                  isSelected
                    ? 'bg-band-strong font-medium text-foreground'
                    : 'bg-[#f5f1e6] font-normal text-foreground hover:bg-band'
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      )}

      <ul
        ref={trackRef}
        data-testid="product-rail-track"
        aria-labelledby={headingId}
        // A real tab stop with its own arrow-key handling: native horizontal
        // arrow-key scrolling of a focused overflow element is inconsistent
        // across browsers, so this makes it deterministic rather than hopeful.
        tabIndex={0}
        onScroll={updateEdges}
        onKeyDown={handleTrackKeyDown}
        className={cn(
          'flex list-none gap-5 overflow-x-auto',
          /**
           * Below `lg` the track bleeds out to the viewport edge and pads its
           * own contents back in, so the peeking card runs off the screen
           * rather than stopping 20px short at the container gutter. The
           * matching `scroll-pl` keeps a snapped card at the gutter — without
           * it the snapport is the padding box and the first card would jump
           * flush to the screen edge. Above `lg` the rail is exactly four
           * cards wide and there is nothing to peek.
           */
          'mx-[calc(var(--page-padding)*-1)] px-[var(--page-padding)]',
          'scroll-pl-[var(--page-padding)] lg:mx-0 lg:px-0 lg:scroll-pl-0',
          'snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto',
          'scrollbar-hide',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            showFeaturedBadge={false}
            // First cell only — see the `priority` prop.
            priority={priority && index === 0}
            className={CARD_WIDTH}
          />
        ))}
      </ul>

      {/* The band's only CTA: one outline pill, centred, under the rail. */}
      <div className="mt-6 flex justify-center sm:mt-12">
        <Link
          to="/posters"
          search={viewAllSearch}
          data-testid="rail-view-all"
          className={buttonVariants({ variant: 'outline', size: 'pill' })}
        >
          <ClipboardList className="h-5 w-5" />
          View All
        </Link>
      </div>
    </SectionBand>
  )
}

export default ProductRail
