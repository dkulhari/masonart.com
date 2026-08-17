/**
 * ProductCarousel
 *
 * Ticket #522 — the PDP's related-products rows ("Visually Similar Artworks",
 * "More to Love") are a horizontal carousel on mesonart, not a grid: 5 cards
 * in a track, circular prev/next arrows at the top right. `heading` is a prop
 * rather than baked in text so one component backs both sections.
 *
 * The card itself is untouched — every cell is a real `ProductCard`, sized
 * via its own `className` prop. This file only owns the track, the arrows
 * and the heading row around it.
 *
 * ## Why this differs from DiscoverChips' rail
 *
 * DiscoverChips (the collections rail) reaches keyboard users purely through
 * its arrow buttons and the focusable links inside each chip — its `<ul>`
 * carries no `tabIndex`. Ticket #522 asks for more: "the track must be
 * reachable and scrollable by keyboard" on its own. So the track here is a
 * tab stop (`tabIndex={0}`) with its own ArrowLeft/ArrowRight handling that
 * calls the same `scrollBy` the buttons use — native horizontal
 * arrow-key-scrolling of a focused overflow element is inconsistent across
 * browsers, so this makes it deterministic rather than hopeful.
 *
 * ## Arrow disable state and reduced motion
 *
 * Both live in `useScrollTrack` (#629), shared with home/ProductRail — see that
 * hook for why an unlaid-out track keeps the optimistic state and why
 * `prefers-reduced-motion` is read at call time rather than baked into a class.
 */

import { useId } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductCard, type ProductCardData } from './ProductCard'
import { buttonVariants } from '~/components/ui/Button'
import { useScrollTrack } from '~/hooks/useScrollTrack'

export interface ProductCarouselProps {
  /** e.g. "Visually Similar Artworks" or "More to Love" (§ ticket #522). */
  heading: string
  products: ProductCardData[]
  className?: string
}

export function ProductCarousel({ heading, products, className }: ProductCarouselProps) {
  const headingId = useId()
  const { trackRef, atStart, atEnd, updateEdges, scrollByDirection, handleTrackKeyDown } =
    useScrollTrack<HTMLUListElement>(products)

  // Nothing to recommend is not an empty rail with dead arrows — it is no
  // rail, matching the section it replaces (posters/$slug.tsx's
  // RelatedProductsSection).
  if (products.length === 0) return null

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl text-foreground">
          {heading}
        </h2>

        {/* Circular prev/next pair, top right of the section (measured on
            mesonart — see docs/design/pdp-parity-reference.md). */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={`Previous ${heading} item`}
            disabled={atStart}
            onClick={() => scrollByDirection(-1)}
            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Next ${heading} item`}
            disabled={atEnd}
            onClick={() => scrollByDirection(1)}
            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul
        ref={trackRef}
        aria-labelledby={headingId}
        // A real tab stop, not just a visual scroller — see module comment.
        tabIndex={0}
        onScroll={updateEdges}
        onKeyDown={handleTrackKeyDown}
        className={cn(
          'flex list-none gap-5 overflow-x-auto',
          'snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto',
          'scrollbar-hide',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            className="w-[calc((100%-20px)/2)] shrink-0 snap-start sm:w-[calc((100%-40px)/3)] lg:w-[calc((100%-80px)/5)]"
          />
        ))}
      </ul>
    </div>
  )
}

export default ProductCarousel
