/**
 * ReviewFilters Component
 *
 * Filter and sort controls for product reviews.
 * Supports filtering by star rating and sorting by date/rating.
 *
 * Following patterns from ProductFilters.tsx
 */

import { useState, useCallback } from "react";
import { Star, ChevronDown, Check, X } from "lucide-react";
import { cn } from "~/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type ReviewSortOption = "newest" | "oldest" | "highest" | "lowest";

export interface ReviewFilterState {
  /** Filter by specific rating (1-5) or null for all */
  rating: number | null;
  /** Sort order */
  sortBy: ReviewSortOption;
}

export interface ReviewFiltersProps {
  /** Current filter state */
  filters: ReviewFilterState;
  /** Callback when filters change */
  onFiltersChange: (filters: ReviewFilterState) => void;
  /** Total reviews count */
  totalCount?: number;
  /** Filtered reviews count */
  filteredCount?: number;
  /** Custom className */
  className?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

// ============================================================================
// Sort Options
// ============================================================================

const SORT_OPTIONS: { id: ReviewSortOption; label: string }[] = [
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "highest", label: "Highest Rated" },
  { id: "lowest", label: "Lowest Rated" },
];

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewFilters - Filter and sort controls for reviews
 *
 * @example
 * <ReviewFilters
 *   filters={{ rating: null, sortBy: 'newest' }}
 *   onFiltersChange={setFilters}
 *   totalCount={128}
 * />
 */
export function ReviewFilters({
  filters,
  onFiltersChange,
  totalCount = 0,
  filteredCount,
  className,
  compact = false,
}: ReviewFiltersProps) {
  // Handle rating filter change
  const handleRatingChange = useCallback(
    (rating: number | null) => {
      onFiltersChange({ ...filters, rating });
    },
    [filters, onFiltersChange]
  );

  // Handle sort change
  const handleSortChange = useCallback(
    (sortBy: ReviewSortOption) => {
      onFiltersChange({ ...filters, sortBy });
    },
    [filters, onFiltersChange]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    onFiltersChange({ rating: null, sortBy: "newest" });
  }, [onFiltersChange]);

  const hasActiveFilters = filters.rating !== null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {/* Left side: Rating filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All reviews button */}
        <button
          type="button"
          onClick={() => handleRatingChange(null)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition-colors",
            filters.rating === null
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border hover:border-muted-foreground"
          )}
        >
          All
          {totalCount > 0 && <span className="ml-1 text-muted-foreground">({totalCount})</span>}
        </button>

        {/* Rating filter buttons */}
        {[5, 4, 3, 2, 1].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => handleRatingChange(rating)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
              filters.rating === rating
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border hover:border-muted-foreground"
            )}
            aria-pressed={filters.rating === rating}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                filters.rating === rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              )}
            />
            {rating}
          </button>
        ))}

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Right side: Sort dropdown */}
      <div className="flex items-center gap-2">
        {/* Filtered count indicator */}
        {filteredCount !== undefined && hasActiveFilters && (
          <span className="text-sm text-muted-foreground">
            Showing {filteredCount} of {totalCount}
          </span>
        )}

        {/* Sort dropdown */}
        <SortDropdown value={filters.sortBy} onChange={handleSortChange} compact={compact} />
      </div>
    </div>
  );
}

// ============================================================================
// Sort Dropdown Component
// ============================================================================

interface SortDropdownProps {
  value: ReviewSortOption;
  onChange: (value: ReviewSortOption) => void;
  compact?: boolean;
}

function SortDropdown({ value, onChange, compact = false }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentOption = SORT_OPTIONS.find((opt) => opt.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent",
          compact && "px-2 py-1.5"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-muted-foreground">Sort:</span>
        <span className="font-medium">{currentOption?.label}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown menu */}
          <div
            className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg"
            role="listbox"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors hover:bg-accent",
                  value === option.id && "bg-primary/5 font-medium text-primary"
                )}
                role="option"
                aria-selected={value === option.id}
              >
                {option.label}
                {value === option.id && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Default Export
// ============================================================================

export default ReviewFilters;
