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

import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  /**
   * The desktop active-filter chips (#454), rendered between the count and
   * sort. A slot rather than props of its own: the chips are the route's
   * `ActiveFilterTags`, which already knows the filter shape and the handlers,
   * and this bar has no business learning either.
   *
   * They live here because the toolbar is the only row that survives the rail
   * collapsing — see the comment on the chips row below.
   */
  chips?: ReactNode
  className?: string
}

function formatCount(total: number): string {
  if (total === 0) return 'No products'
  return `${total.toLocaleString('en-IN')} product${total === 1 ? '' : 's'}`
}

/**
 * The open panel's geometry, in pixels.
 *
 * Their panel animates to a measured size rather than to `auto`, because
 * neither width nor height transitions from a keyword. Ours is derived from
 * the content instead of hardcoded to their 320x469: same header, same 32px
 * option rows, eight options instead of nine.
 */
const PILL_HEIGHT = 56
const PANEL_WIDTH = 320
const PANEL_PADDING = 40
const PANEL_HEADER = 40
const PANEL_ROW = 32

export function CollectionToolbar({
  totalProducts,
  sortId,
  onSortChange,
  filtersHidden,
  onToggleFilters,
  chips,
  className,
}: CollectionToolbarProps) {
  const [isOpen, setIsOpen] = useState(false)
  /**
   * Second frame of the open transition. The panel mounts at the pill's size
   * and only then grows, so the browser has two states to interpolate between
   * — mounting straight into the open size would just appear.
   */
  const [expanded, setExpanded] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const current =
    SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0]

  useEffect(() => {
    if (!isOpen) {
      setExpanded(false)
      return
    }
    const frame = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

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
      data-testid="collection-toolbar"
      className={cn(
        // The site header is `sticky top-0` at h-16 (4rem). Anything at top-0
        // here would sit behind it.
        //
        // `--chrome-offset` rather than a fixed `top-16` (#421): the header's
        // styles row reveals on scroll up, and pinned to the collapsed height
        // this row keeps its place while the revealed nav lands on top of the
        // Hide-filters button. The variable is the bar plus whatever is
        // currently revealed, measured by useChromeOffset; globals.css carries
        // the 4rem fallback for the server-rendered pass.
        //
        // No bottom rule: theirs has none, and the count reads as a caption to
        // the row above it once a line is drawn under it.
        'sticky top-[var(--chrome-offset)] z-30 flex items-center gap-4 bg-background/95 py-3 backdrop-blur',
        'transition-[top] duration-200 motion-reduce:transition-none',
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
          buttonVariants({ variant: 'outline', size: 'pill' }),
          'hidden lg:inline-flex'
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {filtersHidden ? 'Show filters' : 'Hide filters'}
      </button>

      {/* `grow` rather than a `justify-between` row: theirs sits against the
       * toggle and lets the empty space fall before the sort pill. Centred, it
       * reads as a page heading instead of a caption on the toggle.
       *
       * With chips present the chips take that space instead, or a count that
       * never shrinks squeezes them to nothing. Below `lg` the chips row is
       * hidden, so the count goes back to being the thing that grows. */}
      <p
        className={cn(
          'grow whitespace-nowrap text-lg text-foreground',
          chips && 'lg:grow-0'
        )}
        aria-live="polite"
      >
        {formatCount(totalProducts)}
      </p>

      {/* Active filters (#454), desktop only — the mobile copy stays with the
       * sheet button.
       *
       * They rendered in the products column, after the `</aside>`, which read
       * as a caption on the grid. The rail was the obvious home and the wrong
       * one: it is `lg:hidden` once filters are hidden, so chips nested inside
       * would leave a shopper with an active filter, a reduced count, and no
       * way to see or clear it. A deliberate departure from mesonart, which
       * puts theirs in the lane.
       *
       * One line, scrolling sideways. The rail is pinned at
       * `calc(var(--chrome-offset) + 5rem)` and the 5rem is this bar: a row
       * that wraps grows the bar and drops the rail behind it, which is the
       * #401 overlap all over again. Scrolling keeps that constant true
       * without a second height to keep in sync. */}
      {chips && (
        <div
          data-testid="toolbar-active-filters"
          className={cn(
            'hidden min-w-0 grow items-center gap-2 overflow-x-auto flex-nowrap lg:flex',
            // A visible scrollbar would add its own height to the row, which
            // is the very thing this row must not do.
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          {chips}
        </div>
      )}

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'pill' }),
            'gap-6'
          )}
        >
          <span>Sort by: {current.label}</span>
          {/* Their marker is a dot, not a chevron. A chevron promises a menu
           * that drops below; this one opens in place. */}
          <span aria-hidden="true">•</span>
        </button>

        {isOpen && (
          <div
            role="listbox"
            aria-label="Sort by"
            style={{
              width: expanded ? PANEL_WIDTH : '100%',
              height: expanded
                ? PANEL_PADDING + PANEL_HEADER + SORT_OPTIONS.length * PANEL_ROW
                : PILL_HEIGHT,
            }}
            className={cn(
              // The panel is the pill: same top-right corner, same overflow
              // clip, growing out of it rather than dropping below it. No
              // shadow — theirs sits flat on the page.
              'absolute right-0 top-0 z-40 overflow-hidden bg-primary px-[26px] py-5 text-primary-foreground',
              'transition-[width,height,border-radius] duration-500 [transition-timing-function:var(--ease-primary)]',
              expanded ? 'rounded-[32px]' : 'rounded-pill'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.1em] text-primary-foreground/80">
                Sort by
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close sort"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex flex-col items-start">
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
                    'flex h-8 items-center whitespace-nowrap text-left transition-opacity',
                    // The current option is dimmed, not ticked. A checkmark
                    // needs a legend; a dimmed row reads as "already applied"
                    // on its own.
                    option.id === current.id
                      ? 'text-primary-foreground/50'
                      : 'text-primary-foreground hover:opacity-70'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CollectionToolbar
