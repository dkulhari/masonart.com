/**
 * DiscoverChips — the collection rail mesonart runs between the page header
 * and the grid (analysis §1.3.2).
 *
 * ## These are links, not filter toggles
 *
 * Measured on mesonart 2026-08-05: their chips are `<a href="/collections/…">`
 * — destinations, one hand-curated list identical on every collection page,
 * spanning style, subject, orientation, and two entries (`Latest Work`,
 * `Bestseller`) that are a date window and a sort.
 *
 * Ours toggled `styles` on the current grid, with the payload typed to a style
 * id. That could never carry Bestseller or Set of 2/3 — not for want of
 * plumbing, but because a facet id cannot name a sort. Hence the collections
 * table, and hence a chip that navigates.
 *
 * The comment that stood here explained why selection went through the route's
 * filter handler: router.tsx overrides TanStack's search serialisation, so a
 * hand-built search object error-boundaries the route. That reasoning is gone
 * with the toggle — a link to a path carries no search at all.
 *
 * ## Presentational
 *
 * It receives collections and renders links. Fetching stays in the route — a
 * self-fetching rail refires on every filter change, and the collection list
 * does not depend on the filters.
 *
 * ## Imagery
 *
 * A collection may carry its own image, or borrow the main image of a
 * representative product (#410). The two are NOT interchangeable: product
 * images are matted, an admin upload is not, and `imageIsMatted` from the API
 * is what decides whether the mat-compensation scale applies. Guessing here
 * crops into an uploaded picture.
 *
 * With neither, the chip shows its initial on the mat colour rather than an
 * empty `<img>`, which renders as the browser's broken-file icon.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '~/lib/utils'
import { buttonVariants } from '~/components/ui/Button'

/**
 * Roughly how wide each orientation family's artwork is relative to its
 * longest side. Square is 1; a 3:4 portrait is 0.75; our panoramic ladder is
 * 3:1, so 0.33.
 *
 * Approximations on purpose — the exact aspect of a given painting is not
 * stored anywhere, and the chip only needs enough to keep mat out of an 80px
 * circle.
 */
const NARROW_SIDE_RATIO: Record<string, number> = {
  square: 1,
  portrait: 0.75,
  landscape: 0.75,
  panoramic: 0.34,
  round: 1,
}

/** Mirrors MAT_ART_INSET in @chobii/shared — artwork fraction of the longest side. */
const MAT_ART_INSET = 0.88

/** A little past the mat edge, so antialiasing at the circle never shows white. */
const CROP_MARGIN = 1.08

/**
 * How far into the artwork the circle cuts, per orientation.
 *
 * `main` product images are **matted**: sharp contains the artwork at
 * MAT_ART_INSET of the LONGEST side on a #fafafa square at upload time.
 * Dropping that square into the chip at 1:1 puts the whole matted picture
 * inside the circle — the artwork shrinks to fit and floats on white, which
 * is a thumbnail, not a collection chip.
 *
 * Scaling past the mat makes the circle a window *inside* the picture. How
 * far depends on the aspect, because the inset applies to the longest side:
 * a square needs ~1.14, a 3:4 portrait ~1.5, and a 3:1 panoramic ~3.3 before
 * the short edge clears the circle. A single constant cannot serve all three
 * — 1.5 leaves white arcs on the panoramic representatives (wabi-sabi and
 * plaster-and-texture both are) while already cropping squares hard.
 *
 * The image is never downscaled to fit; it is enlarged and centre-cropped.
 */
export function chipArtScale(orientation: string | null | undefined): number {
  const ratio = NARROW_SIDE_RATIO[orientation ?? 'square'] ?? 1
  return +(CROP_MARGIN / (MAT_ART_INSET * ratio)).toFixed(3)
}

export interface DiscoverCollection {
  id: string
  /** The URL segment. `/collections/$slug`. */
  slug: string
  title: string
  subtitle?: string | null
  count: number
  image: string | null
  /**
   * Whether `image` is a matted product photo rather than one the admin
   * uploaded. Decides whether the crop scale applies at all — see the module
   * comment.
   */
  imageIsMatted: boolean
  /** Orientation of the product the image came from — drives the crop depth. */
  orientation?: string | null
}

export interface DiscoverChipsProps {
  collections: DiscoverCollection[]
  /** Slug of the collection currently being viewed, if this is a collection page. */
  activeSlug?: string
  className?: string
}

export function DiscoverChips({
  collections,
  activeSlug,
  className,
}: DiscoverChipsProps) {
  const railRef = useRef<HTMLUListElement>(null)

  // Nothing to discover is not an empty rail with arrows — it is no rail.
  if (collections.length === 0) return null

  const scrollBy = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'shrink-0')}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <ul
        ref={railRef}
        aria-label="Discover collections"
        className="flex flex-1 snap-x snap-mandatory list-none gap-5 overflow-x-auto scroll-smooth py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {collections.map((collection) => {
          const isActive = collection.slug === activeSlug

          return (
            <li key={collection.id} className="snap-start">
              <Link
                to="/collections/$slug"
                params={{ slug: collection.slug }}
                /**
                 * A destination, not a toggle. `aria-current="page"` is the
                 * truthful attribute now — `aria-pressed` described a button
                 * that could be un-pressed, and these navigate.
                 */
                aria-current={isActive ? 'page' : undefined}
                className="flex w-24 flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    'relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-mat',
                    'transition-[box-shadow,transform] duration-500 [transition-timing-function:var(--ease-primary)]',
                    'hover:scale-[1.03]',
                    isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  )}
                >
                  {collection.image ? (
                    <img
                      src={collection.image}
                      alt=""
                      loading="lazy"
                      /**
                       * Matted product images are enlarged and centre-cropped
                       * so the circle cuts INSIDE the artwork — see
                       * chipArtScale. An admin's own image has no mat, so it
                       * is left alone; scaling it would crop into the picture
                       * they chose.
                       */
                      style={
                        collection.imageIsMatted
                          ? {
                              transform: `scale(${chipArtScale(collection.orientation)})`,
                            }
                          : undefined
                      }
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <span className="text-xl text-muted-foreground">
                      {collection.title.charAt(0)}
                    </span>
                  )}
                </span>

                <span className="flex flex-col leading-tight">
                  <span className={cn('text-sm', isActive && 'font-medium')}>
                    {collection.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{collection.count}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'shrink-0')}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export default DiscoverChips
