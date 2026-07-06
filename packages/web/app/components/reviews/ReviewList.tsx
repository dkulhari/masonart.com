/**
 * ReviewList Component
 *
 * Displays a list of product reviews with pagination support,
 * empty states, and loading skeletons.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useMemo, useCallback } from "react";
import { MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";
import { ReviewCard, ReviewCardSkeleton, type ReviewData } from "./ReviewCard";
import { ReviewFilters, type ReviewFilterState } from "./ReviewFilters";
import {
  ReviewSummary,
  type ReviewStats,
  calculateDistribution,
  calculateAverageRating,
} from "./ReviewSummary";

// ============================================================================
// Types
// ============================================================================

export interface ReviewListProps {
  /** Array of reviews to display */
  reviews: ReviewData[];
  /** Total count of reviews (before filtering) */
  totalCount?: number;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Show summary statistics */
  showSummary?: boolean;
  /** Show filter controls */
  showFilters?: boolean;
  /** Page size for pagination */
  pageSize?: number;
  /** Enable pagination */
  enablePagination?: boolean;
  /** Callback when report is clicked */
  onReport?: (reviewId: string) => void;
  /** Callback when delete is clicked (admin only) */
  onDelete?: (reviewId: string) => void;
  /** Show action menu on reviews */
  showActions?: boolean;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewList - Displays a filterable, paginated list of reviews
 *
 * @example
 * <ReviewList
 *   reviews={reviews}
 *   isLoading={isLoading}
 *   showSummary
 *   showFilters
 *   enablePagination
 * />
 */
export function ReviewList({
  reviews,
  totalCount,
  isLoading = false,
  showSummary = true,
  showFilters = true,
  pageSize = 5,
  enablePagination = true,
  onReport,
  onDelete,
  showActions = false,
  className,
}: ReviewListProps) {
  const [filters, setFilters] = useState<ReviewFilterState>({
    rating: null,
    sortBy: "newest",
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sort reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    // Filter by rating
    if (filters.rating !== null) {
      result = result.filter((review) => review.rating === filters.rating);
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();

      switch (filters.sortBy) {
        case "oldest":
          return dateA - dateB;
        case "highest":
          return b.rating - a.rating;
        case "lowest":
          return a.rating - b.rating;
        case "newest":
        default:
          return dateB - dateA;
      }
    });

    return result;
  }, [reviews, filters]);

  // Paginate reviews
  const paginatedReviews = useMemo(() => {
    if (!enablePagination) return filteredReviews;
    const start = (currentPage - 1) * pageSize;
    return filteredReviews.slice(start, start + pageSize);
  }, [filteredReviews, currentPage, pageSize, enablePagination]);

  // Calculate pagination info
  const totalPages = enablePagination ? Math.ceil(filteredReviews.length / pageSize) : 1;

  // Reset to page 1 when filters change
  const handleFiltersChange = useCallback((newFilters: ReviewFilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  // Calculate statistics from reviews
  const stats: ReviewStats | null = useMemo(() => {
    if (reviews.length === 0) return null;
    return {
      averageRating: calculateAverageRating(reviews),
      totalReviews: totalCount ?? reviews.length,
      distribution: calculateDistribution(reviews),
    };
  }, [reviews, totalCount]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        {showSummary && <ReviewSummarySkeleton showDistribution />}
        {showFilters && <FiltersSkeleton />}
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (reviews.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-8", className)}>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Summary Statistics */}
      {showSummary && stats && <ReviewSummary stats={stats} />}

      {/* Filters */}
      {showFilters && (
        <ReviewFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          totalCount={totalCount ?? reviews.length}
          filteredCount={filteredReviews.length}
        />
      )}

      {/* Reviews List */}
      {filteredReviews.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8">
          <EmptyFilterState rating={filters.rating} />
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              showActions={showActions}
              onReport={onReport}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {enablePagination && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}

// ============================================================================
// Empty States
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium text-foreground">No reviews yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Be the first to share your thoughts about this product.
      </p>
    </div>
  );
}

function EmptyFilterState({ rating }: { rating: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium text-foreground">No {rating}-star reviews</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Try selecting a different rating filter to see more reviews.
      </p>
    </div>
  );
}

// ============================================================================
// Pagination Component
// ============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const showAround = 1; // Show 1 page on each side of current

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - showAround && i <= currentPage + showAround)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "ellipsis") {
        pages.push("ellipsis");
      }
    }

    return pages;
  };

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      {/* Previous button */}
      <button
        type="button"
        onClick={() => canGoPrev && onPageChange(currentPage - 1)}
        disabled={!canGoPrev}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
          canGoPrev
            ? "border-border hover:bg-accent"
            : "cursor-not-allowed border-transparent text-muted-foreground/50"
        )}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Page numbers */}
      {getPageNumbers().map((page, index) =>
        page === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm transition-colors",
              page === currentPage
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border hover:bg-accent"
            )}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </button>
        )
      )}

      {/* Next button */}
      <button
        type="button"
        onClick={() => canGoNext && onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
          canGoNext
            ? "border-border hover:bg-accent"
            : "cursor-not-allowed border-transparent text-muted-foreground/50"
        )}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

// ============================================================================
// Skeletons
// ============================================================================

function FiltersSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 w-16 rounded-full bg-muted" />
        ))}
      </div>
      <div className="h-9 w-40 rounded-md bg-muted" />
    </div>
  );
}

// Import skeleton from ReviewSummary
import { ReviewSummarySkeleton } from "./ReviewSummary";

// ============================================================================
// Default Export
// ============================================================================

export default ReviewList;
