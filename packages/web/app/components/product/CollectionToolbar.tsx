/**
 * CollectionToolbar — the sticky bar between the header band and the grid.
 *
 * mesonart's (analysis §1.3.3) carries three things: a "Hide filters" outline
 * pill, the result count, and sort as a pill dropdown.
 *
 * Sort used to live as a radio list INSIDE our filter sidebar, which is the
 * one place mesonart does not put it — sort is not a filter, it does not
 * narrow the result set, and burying it under a collapsible section made it
 * the hardest control on the page to reach.
 */

import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'
import { buttonVariants } from '~/components/ui/Button'

/**
 * Eight options. mesonart has nine (analysis §1.3.5).
 *
 * The comment that stood here said all three missing options needed a signal
 * we lacked. That was only true of one of them:
 *
 *   - **Featured** was already reachable through the API — it just sorted
 *     nulls first, and `featuredOrder` is null on most of the catalogue, so
 *     the option would have led with the products nobody featured.
 *   - **Best selling** genuinely had no signal until #405 aggregated units
 *     from `order_items`. Real orders only; the curator pin reorders on top
 *     of that number without changing it.
 *   - **Most relevant** is the one we do not carry, and not for want of a
 *     signal: on a collection page with no search query there is nothing for
 *     relevance to mean. A composite editorial score would be our heuristic
 *     dressed as a measurement.
 *
 * The `sortBy-sortOrder` id shape is a contract — routes/posters/index.tsx
 * splits on the hyphen.
 */
export const SORT_OPTIONS = [
  { id: 'featuredOrder-asc', label: 'Featured' },
  { id: 'salesCount-desc', label: 'Best selling' },
  { id: 'createdAt-desc', label: 'Newest First' },
  { id: 'createdAt-asc', label: 'Oldest First' },
  { id: 'basePrice-asc', label: 'Price: Low to High' },
  { id: 'basePrice-desc', label: 'Price: High to Low' },
  { id: 'title-asc', label: 'Name: A to Z' },
  { id: 'title-desc', label: 'Name: Z to A' },
] as const

/** The id the desktop sidebar carries, so the toggle can point aria-controls at it. */
export const FILTER_SIDEBAR_ID = 'collection-filters'

export interface CollectionToolbarProps {
  totalProducts: number
  sortId: string
  onSortChange: (sortId: string) => void
  filtersHidden: boolean
  onToggleFilters: () => void
  className?: string
}

function formatCount(total: number): string {
  if (total === 0) return 'No products'
  return `${total.toLocaleString('en-IN')} product${total === 1 ? '' : 's'}`
}

export function CollectionToolbar({
  totalProducts,
  sortId,
  onSortChange,
  filtersHidden,
  onToggleFilters,
  className,
}: CollectionToolbarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const current =
    SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0]

  // Close on outside click and on Escape — same expectations as any menu.
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className={cn(
        // The site header is `sticky top-0` at h-16 (4rem). Anything at top-0
        // here would sit behind it.
        'sticky top-16 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 py-3 backdrop-blur',
        className
      )}
    >
      {/* Hide filters — desktop only; mobile already has MobileFilterButton. */}
      <button
        type="button"
        onClick={onToggleFilters}
        aria-expanded={!filtersHidden}
        aria-controls={FILTER_SIDEBAR_ID}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'hidden lg:inline-flex'
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {filtersHidden ? 'Show filters' : 'Hide filters'}
      </button>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {formatCount(totalProducts)}
      </p>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Sort by: {current.label}
          <ChevronDown className="h-4 w-4" />
        </button>

        {isOpen && (
          <div
            role="listbox"
            aria-label="Sort by"
            className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === current.id}
                onClick={() => {
                  onSortChange(option.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  option.id === current.id && 'font-medium'
                )}
              >
                {option.label}
                {option.id === current.id && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CollectionToolbar
