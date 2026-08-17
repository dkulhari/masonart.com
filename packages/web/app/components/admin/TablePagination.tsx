import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

const PAGE_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'

interface TablePaginationProps<TData> {
  table: Table<TData>
  /**
   * Plural noun for the row count — "of 128 orders". Named rather than derived
   * so each table reads in its own language.
   */
  itemNoun: string
}

/**
 * The footer under an admin table: which slice is on screen, and the four
 * controls that move it.
 *
 * The range counts against the FILTERED row model, not the raw one — a search
 * that narrows 128 orders to 3 has to say "1 to 3 of 3", or the operator reads
 * the filter as broken.
 */
export function TablePagination<TData>({ table, itemNoun }: TablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const filteredRows = table.getFilteredRowModel().rows.length

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      {/* Info */}
      <div className="text-sm text-muted-foreground">
        Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, filteredRows)} of{' '}
        {filteredRows} {itemNoun}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          className={PAGE_BUTTON}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className={PAGE_BUTTON}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1} of {table.getPageCount()}
        </span>

        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className={PAGE_BUTTON}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          className={PAGE_BUTTON}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
