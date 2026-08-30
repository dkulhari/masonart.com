/**
 * Filter and sort, as the phone gets them: one bottom sheet, one floating pill.
 *
 * Replaces MobileFiltersSheet (#470), which was a 85vw panel sliding in from
 * the RIGHT, opened by a bordered "Filters" button sitting in the page flow
 * above the grid, and carried filters only — sort stayed in the toolbar pill,
 * which at phone width is a 56px control competing with the result count for
 * one row.
 *
 * Measured on mesonart's own `FacetDrawerSticky` at 390px:
 *
 *   - the trigger is a FIXED near-black pill, centred, 20px off the bottom of
 *     the viewport, 56px tall, `border-radius: 60px`, label "Filter And Sort"
 *     at 16px/400 — it follows the shopper down the grid rather than scrolling
 *     away with the toolbar;
 *   - the panel is anchored to the bottom edge, full width, capped at
 *     `calc(100% - 60px)`, `border-radius: 20px 20px 0 0`, and moves on
 *     `transform 0.6s cubic-bezier(.7, 0, .2, 1)` — the same `--ease-drawer`
 *     the cart and menu drawers use;
 *   - the overlay is `rgba(23,23,23,0.7)` — our `bg-foreground/70`;
 *   - sort leads the panel as a single select, above the facet accordions;
 *   - a pinned footer closes it with the result count on the button
 *     ("View Results (3991)"), so the shopper sees what the filters did before
 *     dismissing the sheet.
 *
 * OUR DEPARTURES
 *
 *   - The trigger clears our bottom tab bar via MOBILE_TAB_BAR_OFFSET_CLASS
 *     plus their 20px. mesonart has no dock to clear; we do, and a pill at a
 *     bare `bottom-5` lands on the Search tab.
 *   - The close control is the storefront's outline circle, as on the cart and
 *     menu drawers, rather than their bare 48px X.
 */

import { useCallback, useEffect, useId } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  countActiveFilters,
  type ActiveFilterKey,
} from '~/lib/activeFilters'
import { Button } from '~/components/ui/Button'
import { ActiveFilterTags } from './ActiveFilterTags'
import { MOBILE_TAB_BAR_OFFSET_CLASS } from '~/components/layout/MobileTabBar'
import { SORT_OPTIONS } from './CollectionToolbar'
import { ProductFilters, type FilterState } from './ProductFilters'

/** The id the trigger points `aria-controls` at, and the sheet answers to. */
export const FILTER_SORT_DRAWER_ID = 'filter-sort-drawer'

// ============================================================================
// Trigger
// ============================================================================

export interface FilterSortButtonProps {
  onClick: () => void
  /** Hidden while the sheet it opens is up — see the note in the component. */
  isOpen?: boolean
  className?: string
}

/**
 * The floating pill.
 *
 * `fixed`, so it survives the scroll: the collection toolbar is sticky under
 * the header and carries the count, but filters on a phone are wanted at the
 * point the grid disappoints — a thousand pixels down, where an in-flow button
 * at the top of the column is long gone.
 *
 * Deliberately carries NO active-filter badge. The chips row above the grid
 * already names every applied value and can clear them; a count on the pill is
 * a second, vaguer voice saying the same thing, and theirs does without it.
 */
export function FilterSortButton({
  onClick,
  isOpen = false,
  className,
}: FilterSortButtonProps) {
  return (
    <div
      className={cn(
        // z-30, the tab bar's own layer: above page content, below every scrim
        // (z-40) and panel (z-50) in the app. See the z-30 note on MobileTabBar
        // — a control that paints over an open drawer offers taps that go
        // nowhere.
        'pointer-events-none fixed inset-x-0 z-30 flex justify-center lg:hidden',
        // Their 20px gap, measured from the viewport bottom. Ours measures from
        // the top of the tab bar instead, which is what the offset class is
        // for; `mb-5` is the 20px.
        MOBILE_TAB_BAR_OFFSET_CLASS,
        'mb-5',
        // Once the sheet is open the pill is behind its scrim anyway. Fading it
        // out keeps a near-black pill from ghosting through 30% of the overlay.
        isOpen && 'invisible opacity-0',
        'transition-opacity duration-300 motion-reduce:transition-none',
        className
      )}
    >
      <Button
        type="button"
        data-testid="filter-sort-button"
        onClick={onClick}
        size="pill"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={FILTER_SORT_DRAWER_ID}
        className="pointer-events-auto shadow-lg"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filter and sort
      </Button>
    </div>
  )
}

// ============================================================================
// Sheet
// ============================================================================

export interface FilterSortDrawerProps {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  /** `sortBy-sortOrder`, the same id shape CollectionToolbar trades in. */
  sortId: string
  onSortChange: (sortId: string) => void
  /** Drives the count on the footer button. */
  totalProducts: number
  /**
   * The route's own clear — the same handler the chips row above the grid
   * uses, not a second reset written here that could disagree with it.
   *
   * The sheet needs one of its own because it COVERS that chips row: a filter
   * that emptied the grid is otherwise undone by hunting the ticked boxes back
   * down through ten accordions.
   */
  onClearAll?: () => void
  /**
   * Drops one facet value, for the chips lane below the head. The route's own
   * handler, the same one the chips above the grid use.
   */
  onRemoveFilter?: (key: ActiveFilterKey, value?: string) => void
  /** Per-facet counts, as the desktop rail gets them. */
  facetCounts?: Record<string, Map<string, number>> | null
}

export function FilterSortDrawer({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  sortId,
  onSortChange,
  totalProducts,
  onClearAll,
  onRemoveFilter,
  facetCounts,
}: FilterSortDrawerProps) {
  const titleId = useId()
  const sortSelectId = useId()
  const activeFilterCount = countActiveFilters(filters)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    },
    [onClose]
  )

  // Scroll lock and Escape, as every other drawer in the app has them.
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <>
      <div
        data-testid="filter-sort-scrim"
        className="fixed inset-0 z-40 bg-foreground/70 animate-drawer-backdrop-in lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        id={FILTER_SORT_DRAWER_ID}
        data-testid="filter-sort-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background shadow-2xl lg:hidden',
          // Their cap: the sheet stops 60px short of the top, so the page it
          // filters stays visible behind the overlay. A full-height sheet is a
          // page, and a shopper who has lost sight of the grid has lost the
          // reason they opened it.
          'max-h-[calc(100%-60px)]',
          'overflow-hidden rounded-t-[var(--drawer-radius-sheet)]',
          'animate-drawer-in-bottom'
        )}
        /*
         * THE PANEL MUST NEVER SCROLL ITSELF — this is what made the sheet go
         * blank.
         *
         * `overflow-hidden` (there for the rounded top corners) still makes a
         * scroll container, and Chrome reports this box's scrollHeight as the
         * facet list's full 3,474px rather than the 784px its children
         * actually occupy. Ticking an option far down the list focuses that
         * option's sr-only checkbox, the browser scrolls every scrollable
         * ancestor to reveal it, and this one obliged: scrollTop 2,881, every
         * child dragged above the panel, nothing left but white.
         *
         * Snapping back is the fix that works in every browser — `overflow:
         * clip` would also do it, but Safari only learned it in 16 and the
         * fallback there is unclipped corners.
         */
        onScroll={(event) => {
          event.currentTarget.scrollTop = 0
          event.currentTarget.scrollLeft = 0
        }}
      >
        {/* Head. Drag-handle pill centred as on theirs — decoration, since the
            sheet has no drag gesture, so it stays aria-hidden. */}
        <div className="relative flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-border"
          />
          <h2 id={titleId} className="text-lg">
            Filter and sort
          </h2>
          {/* The cart and menu drawers' close control. */}
          <Button
            variant="outline"
            onClick={onClose}
            className="h-12 w-12 shrink-0 rounded-full p-0"
            aria-label="Close filter and sort"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/*
          The applied filters, in a lane of their own between the head and the
          scrolling body.

          Clear all used to be a bare word in the head beside the close button,
          which said HOW MANY nothing and offered no way to drop one facet —
          the shopper had to find the ticked box again, several accordions
          down. The chips name each value and remove it on tap, and carry the
          same Clear all at the end of the row.

          It is the row variant, not the wrap: this lane sits above a scrolling
          list and must keep one line, or two rows of chips push the facets off
          the sheet. Overflow scrolls sideways, as it does in the toolbar.

          Outside the scroll container on purpose — the chips describe the
          whole sheet, and a lane that scrolls away with the first accordion is
          a lane the shopper cannot find when the grid comes back empty.
        */}
        {onRemoveFilter && onClearAll && activeFilterCount > 0 && (
          <div
            data-testid="filter-sort-chips"
            className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3"
          >
            {/*
              The WRAP variant, not the toolbar's single scrolling line: with
              four facets on, the row ran off the right edge and the values
              past the fold were invisible — on a phone there is no hover
              affordance saying a row scrolls at all. Height is free here;
              the toolbar's is not (the rail's sticky offset is pinned against
              it), which is the whole reason that one may not wrap.

              Its own Clear all is off: it would land at the end of whichever
              line the last chip wrapped onto. Pinned at the lane's top right
              instead, where it does not move as chips come and go.
            */}
            {/*
              CAPPED, and scrolling past the cap — on the chips alone, not on
              the whole lane, or Clear all scrolls away with them.

              Unbounded, a wrapping lane is a lane that eats the sheet: at
              eighteen chips it took 359px of the 784px panel and squeezed the
              facets into 255px; a few more and the list it sits above is gone
              altogether and the sheet reads as blank. Three rows is enough to
              see what is on without burying what it belongs to.
            */}
            <div className="min-w-0 max-h-[7.5rem] flex-1 overflow-y-auto">
              <ActiveFilterTags
                showClearAll={false}
                filters={filters}
                onRemoveFilter={onRemoveFilter}
                onClearAll={onClearAll}
              />
            </div>
            <button
              type="button"
              onClick={onClearAll}
              className="shrink-0 whitespace-nowrap py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}

        {/* `min-h-0` so this actually shrinks: a flex child's default
            `min-height: auto` is its content, which is what lets a long facet
            list push the pinned footer off the sheet instead of scrolling. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {/*
            Sort leads, as it does on theirs, and as a native select: the
            toolbar's pill-that-becomes-a-panel is a pointer control that opens
            over the page, which on a 390px screen inside an already-open sheet
            would be a menu over a menu. The platform's own picker is the one
            control here a phone renders better than we can.

            text-base is load-bearing: iOS zooms the whole page on focus for
            anything under 16px (see mobile-input-zoom.spec.ts).
          */}
          <div className="border-b border-foreground/[0.06] py-4">
            <label
              htmlFor={sortSelectId}
              className="mb-1 block text-xs uppercase tracking-[0.1em] text-muted-foreground"
            >
              Sort by
            </label>
            <select
              id={sortSelectId}
              data-testid="filter-sort-select"
              value={sortId}
              onChange={(event) => onSortChange(event.target.value)}
              className="w-full rounded-xl border border-foreground/20 bg-background px-3 py-3 text-base text-foreground"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <ProductFilters
            filters={filters}
            onFiltersChange={onFiltersChange}
            facetCounts={facetCounts}
          />
        </div>

        {/* Pinned footer. Theirs reads "View Results (3991)" — the count is the
            point: it is the one number that tells the shopper whether the
            filters they just ticked left them anything to look at. */}
        <div className="shrink-0 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
          <Button
            variant="outline"
            size="pill"
            onClick={onClose}
            className="w-full"
            data-testid="filter-sort-apply"
          >
            View results ({totalProducts.toLocaleString('en-IN')})
          </Button>
        </div>
      </div>
    </>
  )
}

export default FilterSortDrawer
