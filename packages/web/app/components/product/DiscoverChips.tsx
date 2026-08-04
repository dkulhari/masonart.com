/**
 * DiscoverChips — the collection rail mesonart runs between the page header
 * and the grid (analysis §1.3.2).
 *
 * Ours had no equivalent: before this, the only "discover" on /posters was a
 * word in the SEO paragraph.
 *
 * ## Presentational
 *
 * It receives collections and reports a selection upward. Fetching stays in
 * the route — a self-fetching rail refires on every filter change, and the
 * collection list does not depend on the filters.
 *
 * ## Selection goes through the route's filter handler
 *
 * The chips call `onSelect` with a style id or `undefined`; the route folds
 * that into `handleFiltersChange`. They must not navigate directly:
 * router.tsx overrides TanStack's search serialisation, so `styles` travels
 * as a comma-joined string that `validateSearch` splits back apart. A
 * hand-built search object skips that and error-boundaries the route to a
 * blank page.
 *
 * ## Imagery
 *
 * There are no per-collection assets. Each chip carries the main image of a
 * representative product in that style, supplied by
 * GET /api/products/collections. When a collection has none, the chip shows
 * its initial on the mat colour rather than an empty `<img>`, which renders
 * as the browser's broken-file icon.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '~/lib/utils'
import { buttonVariants } from '~/components/ui/Button'

export interface DiscoverCollection {
  id: string
  label: string
  count: number
  image: string | null
}

export interface DiscoverChipsProps {
  collections: DiscoverCollection[]
  /** The style currently filtering the grid, if any. */
  activeStyle: string | undefined
  /** Called with a style id, or `undefined` to clear the filter. */
  onSelect: (styleId: string | undefined) => void
  className?: string
}

export function DiscoverChips({
  collections,
  activeStyle,
  onSelect,
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
          const isActive = collection.id === activeStyle

          return (
            <li key={collection.id} className="snap-start">
              <button
                type="button"
                /**
                 * A toggle, not a link: clicking the active chip clears the
                 * filter. aria-pressed says so; aria-current would claim this
                 * is the page you are on.
                 */
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? undefined : collection.id)}
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
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl text-muted-foreground">
                      {collection.label.charAt(0)}
                    </span>
                  )}
                </span>

                <span className="flex flex-col leading-tight">
                  <span className={cn('text-sm', isActive && 'font-medium')}>
                    {collection.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{collection.count}</span>
                </span>
              </button>
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
