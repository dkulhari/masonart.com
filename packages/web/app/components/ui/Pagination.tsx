import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '~/lib/utils'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  onPageChange: (page: number) => void
  /**
   * Classes for the current page's button. Defaults to the primary token; the
   * AI creations page overrides it to stay on its purple accent.
   */
  activeClassName?: string
}

const ARROW_BUTTON = 'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors'
const ARROW_ENABLED = 'border-border bg-background text-foreground hover:bg-muted'
const ARROW_DISABLED = 'cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground'

/**
 * Numbered pagination for the account pages.
 *
 * First and last page are always shown, plus one page either side of the
 * current one; everything between collapses to a single ellipsis. A long
 * history is then a fixed-width control rather than a row that grows past the
 * edge of the screen.
 */
export function Pagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  activeClassName = 'border-primary bg-primary text-primary-foreground',
}: PaginationProps) {
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      {/* Previous Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPreviousPage}
        className={cn(ARROW_BUTTON, hasPreviousPage ? ARROW_ENABLED : ARROW_DISABLED)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="flex h-10 w-10 items-center justify-center text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                page === currentPage
                  ? activeClassName
                  : 'border-border bg-background text-foreground hover:bg-muted'
              )}
            >
              {page}
            </button>
          )
        )}
      </div>

      {/* Next Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage}
        className={cn(ARROW_BUTTON, hasNextPage ? ARROW_ENABLED : ARROW_DISABLED)}
        aria-label="Next page"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}

/** Page numbers to display, with runs longer than one page collapsed. */
function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = []
  const delta = 1 // Number of pages to show on each side of current

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }

  return pages
}
