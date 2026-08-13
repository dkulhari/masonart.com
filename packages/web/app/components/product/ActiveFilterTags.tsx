/**
 * The chips saying what is currently filtering the grid.
 *
 * Lifted out of `routes/posters/index.tsx` when `/collections/$slug` arrived
 * (#470). Both pages filter the same way, so both need this — and a second
 * copy is how one page ends up clearing a facet the other forgets, which is
 * exactly the class of bug #453 and #454 were.
 */

import { X } from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  buildActiveFilterTags,
  type ActiveFilterKey,
} from '~/lib/activeFilters'
import type { FilterState } from './ProductFilters'

export interface ActiveFilterTagsProps {
  filters: FilterState
  onRemoveFilter: (key: ActiveFilterKey, value?: string) => void
  onClearAll: () => void
  /**
   * `wrap` is the sheet's stacked block. `row` is the toolbar's single line
   * (#454): it may not wrap, because the bar's height is the 5rem the rail's
   * sticky offset is pinned against, and a second line puts the rail behind
   * the bar. Overflow scrolls sideways instead — see CollectionToolbar.
   */
  variant?: 'wrap' | 'row'
  /**
   * Whether the row ends with its own "Clear all".
   *
   * False only where a caller pins that control itself: FilterSortDrawer's
   * chips lane scrolls sideways, and a Clear all at the end of the scroll is a
   * Clear all the shopper has to go looking for.
   */
  showClearAll?: boolean
}

export function ActiveFilterTags({
  filters,
  onRemoveFilter,
  onClearAll,
  variant = 'wrap',
  showClearAll = true,
}: ActiveFilterTagsProps) {
  /**
   * One derivation, shared with the badge (#453). Written out by hand here,
   * this list covered four of the ten facet groups and neither of the two
   * booleans — and the badge that gated it covered a different subset again.
   */
  const tags = buildActiveFilterTags(filters)

  if (tags.length === 0) return null

  const isRow = variant === 'row'

  return (
    <div
      data-testid="active-filter-tags"
      className={cn(
        'flex items-center gap-2',
        isRow ? 'flex-nowrap' : 'flex-wrap'
      )}
    >
      <span
        className={cn(
          'text-sm text-muted-foreground',
          isRow && 'shrink-0 whitespace-nowrap'
        )}
      >
        Active filters:
      </span>
      {tags.map((tag, index) => (
        <button
          key={`${tag.key}-${tag.value}-${index}`}
          type="button"
          onClick={() => onRemoveFilter(tag.key, tag.value)}
          className={cn(
            'flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-sm capitalize transition-colors hover:bg-muted',
            // A chip that shrinks to fit the row loses its label before it
            // loses the row; the row scrolls instead.
            isRow && 'shrink-0 whitespace-nowrap'
          )}
        >
          {tag.label}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
      {showClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className={cn(
            'text-sm text-muted-foreground hover:text-foreground',
            isRow && 'shrink-0 whitespace-nowrap'
          )}
        >
          Clear all
        </button>
      )}
    </div>
  )
}

export default ActiveFilterTags
