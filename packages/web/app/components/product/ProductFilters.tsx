/**
 * ProductFilters Component
 *
 * Filter panel for product listings with support for styles, subjects,
 * colors, orientation, rooms, and price range filtering.
 * Supports both desktop sidebar and mobile sheet layouts.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { X, SlidersHorizontal, ChevronUp, Check } from 'lucide-react'
import { cn } from '~/lib/utils'
import { FACET_GROUPS, type FacetOption } from '@chobii/shared'

// ============================================================================
// Types
// ============================================================================

export type Orientation = 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
/** Mirrors the `sortBy` enum on GET /api/products. */
export type SortOption =
  | 'createdAt'
  | 'updatedAt'
  | 'title'
  | 'basePrice'
  | 'featuredOrder'
  /** Real units sold from settled orders, with the curator pin above it. */
  | 'salesCount'
export type SortOrder = 'asc' | 'desc'

export interface FilterState {
  styles: string[]
  subjects: string[]
  colors: string[]
  rooms: string[]
  /** Expanded facets — see FACET_GROUPS in @chobii/shared. */
  vibe: string[]
  aesthetic: string[]
  medium: string[]
  uniqueness?: string
  availability?: string
  orientation?: Orientation
  priceMin?: number
  priceMax?: number
  isAiGenerated?: boolean
  isFeatured?: boolean
  sortBy?: SortOption
  sortOrder?: SortOrder
}

export interface FilterOption {
  id: string
  name: string
  description?: string
  hex?: string
  /**
   * How many products carry this value under the currently applied filters.
   * Undefined until the facets endpoint has responded — the label renders
   * bare rather than flashing "(0)".
   */
  count?: number
}

export interface ProductFiltersProps {
  /** Current filter state */
  filters: FilterState
  /** Callback when filters change */
  onFiltersChange: (filters: FilterState) => void
  /** Available style options */
  /**
   * Per-facet counts keyed by option id, from GET /api/products/facets.
   * Null until the request lands; options render without counts until then
   * rather than flashing zeros.
   */
  facetCounts?: Record<string, Map<string, number>> | null
  /** Whether to show in mobile mode */
  isMobile?: boolean
  /** Callback to close mobile filters */
  onClose?: () => void
  /** Custom className */
  className?: string
}


// ============================================================================
// Default Filter Options
// ============================================================================

// ============================================================================
// Component
// ============================================================================

/**
 * ProductFilters - Filter panel for product listings
 */
export function ProductFilters({
  filters,
  onFiltersChange,
  facetCounts,
  isMobile = false,
  onClose,
  className,
}: ProductFiltersProps) {
  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    /**
     * Four of ten open by default. Opening all ten makes the rail thousands of
     * pixels tall; opening none hides that filtering exists. 'sort' used to be
     * in this list and is no longer a section — it moved to the toolbar in
     * #391.
     */
    new Set(['orientation', 'styles', 'subjects', 'colors'])
  )

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }, [])

  // Toggle a multi-select filter value
  const toggleMultiFilter = useCallback(
    (key: keyof FilterState, value: string) => {
      const currentValues = (filters[key] as string[]) || []
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value]
      onFiltersChange({
        ...filters,
        [key]: newValues,
      })
    },
    [filters, onFiltersChange]
  )

  // Set a single-select filter value
  // Handle sort change
  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFiltersChange({
      styles: [],
      subjects: [],
      colors: [],
      rooms: [],
      vibe: [],
      aesthetic: [],
      medium: [],
      uniqueness: undefined,
      availability: undefined,
      orientation: undefined,
      priceMin: undefined,
      priceMax: undefined,
      isAiGenerated: undefined,
      isFeatured: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
  }, [onFiltersChange])

  // Count active filters
  const activeFilterCount =
    filters.styles.length +
    filters.subjects.length +
    filters.colors.length +
    filters.rooms.length +
    (filters.orientation ? 1 : 0) +
    (filters.priceMin !== undefined ? 1 : 0) +
    (filters.priceMax !== undefined ? 1 : 0) +
    (filters.isAiGenerated !== undefined ? 1 : 0)


  return (
    <div
      className={cn(
        'flex flex-col bg-background',
        isMobile && 'h-full',
        className
      )}
    >
      {/* Header — mobile only.
       *
       * mesonart's rail carries no header at all (analysis §1.3.4): no title,
       * no active count, no "Clear all". It does not need one — active values
       * render as removable chips above the grid, so a second clear affordance
       * inside the rail is redundant furniture.
       *
       * The drawer is a different case. It has no chips above it and no other
       * way out, so it keeps the row. */}
      {isMobile && (
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Sections
       *
       * Driven by FACET_GROUPS from @chobii/shared rather than a section
       * hand-written per facet. That is the whole point: one vocabulary,
       * consumed by the schema, the API, the seed and here. Nine groups
       * written out by hand is also where the previous copy started drifting
       * from the API's idea of the same values. */}
      <div className={cn('flex-1', isMobile && 'overflow-y-auto px-4')}>
        {FACET_GROUPS.map((group) => {
          const counts = facetCounts?.[group.key]
          const options: FilterOption[] = group.options.map(
            (option: FacetOption) => ({
              id: option.id,
              name: option.label,
              hex: option.hex,
              count: counts?.get(option.id),
            })
          )

          const raw = filters[group.key as keyof FilterState]
          const selected: string[] = group.multi
            ? ((raw as string[]) ?? [])
            : raw
              ? [raw as string]
              : []

          return (
            <FilterSection
              key={group.key}
              title={group.label}
              sectionKey={group.key}
              isExpanded={expandedSections.has(group.key)}
              onToggle={toggleSection}
            >
              <div className="space-y-3">
                {options.map((option) => (
                  <FilterCheckbox
                    key={option.id}
                    id={`${group.key}-${option.id}`}
                    label={option.name}
                    count={option.count}
                    checked={selected.includes(option.id)}
                    onChange={() => {
                      if (group.multi) {
                        toggleMultiFilter(
                          group.key as keyof FilterState,
                          option.id
                        )
                        return
                      }
                      // Single-valued: ticking the current value clears it.
                      onFiltersChange({
                        ...filters,
                        [group.key]: selected.includes(option.id)
                          ? undefined
                          : option.id,
                      })
                    }}
                  />
                ))}
              </div>
            </FilterSection>
          )
        })}
      </div>

      {/* Mobile Apply Button */}
      {isMobile && (
        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Apply Filters
            {activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Filter Section Component
// ============================================================================

interface FilterSectionProps {
  title: string
  sectionKey: string
  isExpanded: boolean
  onToggle: (key: string) => void
  children: React.ReactNode
}

/**
 * A facet group.
 *
 * Measured against mesonart: the divider is a warm hairline at 6% of the
 * foreground rather than `--border`, whose cool slate reads blue next to the
 * beige band; the title sits at the body weight, not `font-medium`; and there
 * is no active-count badge — the chips above the grid already say which values
 * are on, and a filled pill in a monochrome rail is a second voice saying it.
 *
 * One chevron that rotates, rather than two that swap, so the state change is
 * a movement on `--ease-primary` instead of a substitution.
 */
function FilterSection({
  title,
  sectionKey,
  isExpanded,
  onToggle,
  children,
}: FilterSectionProps) {
  return (
    <div className="border-b border-foreground/[0.06]">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between py-4 text-left"
        aria-expanded={isExpanded}
      >
        <span className="text-foreground">{title}</span>
        <ChevronUp
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform duration-500 [transition-timing-function:var(--ease-primary)]',
            !isExpanded && 'rotate-180'
          )}
        />
      </button>
      {isExpanded && <div className="pb-6">{children}</div>}
    </div>
  )
}

// ============================================================================
// Filter Checkbox Component
// ============================================================================

interface FilterCheckboxProps {
  id: string
  label: string
  checked: boolean
  onChange: () => void
  count?: number
}

function FilterCheckbox({
  id,
  label,
  checked,
  onChange,
  count,
}: FilterCheckboxProps) {
  /**
   * Zero-count options are DISABLED, not hidden. Hiding them makes the list
   * jump and reflow every time the shopper ticks a box, and removes the
   * information that the value exists at all.
   *
   * A checked option is never disabled — the shopper must be able to untick
   * the thing that emptied the results.
   */
  const isEmpty = count === 0 && !checked

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3',
        isEmpty ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      )}
    >
      <div
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-foreground/40'
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </div>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={isEmpty}
        className="sr-only"
      />
      {/* Count sits inline against the label, not pinned to the far edge.
       * Theirs reads "Wabi-Sabi Art (788)" as one phrase; a right-aligned
       * column of numbers reads as a separate table. */}
      <span className="flex items-baseline gap-1">
        <span className="text-sm">{label}</span>
        {count !== undefined && (
          <span className="text-sm tabular-nums text-foreground/60">
            ({count})
          </span>
        )}
      </span>
    </label>
  )
}

// ============================================================================
// Mobile Filter Button Component
// ============================================================================

export interface MobileFilterButtonProps {
  activeCount?: number
  onClick: () => void
  className?: string
}

export function MobileFilterButton({
  activeCount = 0,
  onClick,
  className,
}: MobileFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
        className
      )}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  )
}

export default ProductFilters
