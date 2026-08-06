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
 * ## Arrow disable state
 *
 * `updateEdges` reads the track's actual scroll geometry, but a track that
 * has never been laid out reports `scrollWidth === clientWidth === 0`, which
 * is indistinguishable from "fits, nothing to scroll" — the mount effect
 * skips measuring in that case and keeps the optimistic initial state (start
 * of track, more to scroll) rather than disabling the forward arrow on a
 * container that just hasn't painted yet. The scroll handler has no such
 * guard: a real scroll event only fires once the track has real geometry.
 *
 * ## prefers-reduced-motion
 *
 * Checked at call time (not baked into a class) because it gates the
 * *programmatic* `scrollBy` calls from both the arrows and the keyboard
 * handler — `motion-reduce:scroll-auto` on the track covers the CSS
 * `scroll-behavior` side (wheel/native scroll), this covers the JS side.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductCard, type ProductCardData } from './ProductCard'
import { buttonVariants } from '~/components/ui/Button'

export interface ProductCarouselProps {
  /** e.g. "Visually Similar Artworks" or "More to Love" (§ ticket #522). */
  heading: string
  products: ProductCardData[]
  className?: string
}

/** Fraction of a mocked/mismeasured scroll position that still counts as "at rest". */
const EDGE_SLACK_PX = 1

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function ProductCarousel({ heading, products, className }: ProductCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null)
  const headingId = useId()
  // Optimistic defaults: assume the track starts at its left edge with more
  // to scroll, until a real measurement says otherwise (see module comment).
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    const scrollable = maxScroll > EDGE_SLACK_PX
    setAtStart(track.scrollLeft <= EDGE_SLACK_PX)
    setAtEnd(!scrollable || track.scrollLeft >= maxScroll - EDGE_SLACK_PX)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // An unlaid-out track (jsdom always; a real browser only for one frame)
    // reports 0x0 — that is "unknown", not "nothing to scroll".
    if (track.scrollWidth === 0 && track.clientWidth === 0) return
    updateEdges()
  }, [updateEdges, products])

  useEffect(() => {
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  const scrollByDirection = useCallback((direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({
      left: direction * track.clientWidth * 0.8,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  const handleTrackKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      scrollByDirection(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      scrollByDirection(-1)
    }
  }

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
