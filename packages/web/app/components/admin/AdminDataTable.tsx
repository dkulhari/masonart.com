import type { LucideIcon } from 'lucide-react'
import { flexRender, type Row, type Table } from '@tanstack/react-table'
import { TablePagination } from './TablePagination'
import { cn } from '~/lib/utils'

const TABLE_ROW = 'border-b border-border transition-colors hover:bg-muted/50'

/** How many placeholder rows stand in for the data while it loads. */
const SKELETON_ROWS = 5

interface AdminDataTableProps<TData> {
  table: Table<TData>
  /**
   * Column count, for the skeleton cells and the empty state's colSpan. Taken
   * as a prop rather than off the table so the skeleton can be drawn before
   * any row model exists.
   */
  columnCount: number
  isLoading: boolean
  /** Drawn above the empty-state copy. */
  emptyIcon: LucideIcon
  emptyTitle: string
  /**
   * Whether a search or filter is narrowing the rows. An empty table means two
   * different things — nothing exists, or nothing matched — and only the
   * second one is worth offering advice about.
   */
  isFiltered: boolean
  /** Plural noun for the pagination footer's row count. */
  itemNoun: string
  /** Extra classes per row, e.g. the tint on a selected product. */
  rowClassName?: (row: Row<TData>) => string | false | undefined
}

/**
 * The shell both admin tables sit in: the header row, the loading skeleton,
 * the empty state, the body, and the pagination footer.
 *
 * Everything specific to a table lives in its column definitions, which this
 * renders through `flexRender` without knowing anything about them. What is
 * left over is what the two tables genuinely had in common — and had two
 * copies of, free to drift, until #634.
 */
export function AdminDataTable<TData>({
  table,
  columnCount,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyTitle,
  isFiltered,
  itemNoun,
  rowClassName,
}: AdminDataTableProps<TData>) {
  const rows = table.getRowModel().rows

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-medium text-muted-foreground"
                    style={{ width: header.column.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              // Empty state
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <EmptyIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-3">{emptyTitle}</p>
                  {isFiltered && (
                    <p className="mt-1 text-sm">
                      Try adjusting your search or filter to find what you&apos;re looking for.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              // Data rows
              rows.map((row) => (
                <tr key={row.id} className={cn(TABLE_ROW, rowClassName?.(row))}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 text-sm"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && rows.length > 0 && (
        <TablePagination table={table} itemNoun={itemNoun} />
      )}
    </div>
  )
}

/**
 * The route-level placeholder, shown before the table component itself has
 * anything to render.
 *
 * It draws pulse bars at the real column widths rather than a generic grey
 * block, so the layout does not jump when the data lands. The widths are the
 * caller's, because they are the `size` values from its column definitions.
 */
export function AdminTableSkeleton({ widths }: { widths: number[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex gap-4">
          {widths.map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: w }}
            />
          ))}
        </div>
      </div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-4">
            {widths.map((w, j) => (
              <div
                key={j}
                className="h-6 animate-pulse rounded bg-muted"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
