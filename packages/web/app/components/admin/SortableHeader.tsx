import type { ReactNode } from 'react'
import type { Column } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

interface SortableHeaderProps<TData> {
  column: Column<TData, unknown>
  children: ReactNode
}

/**
 * A column header that sorts on click.
 *
 * The chevron is the whole affordance, so all three rungs of the ladder are
 * drawn: up for ascending, down for descending, and a muted double chevron for
 * "sortable, not currently sorted". Dropping the third rung would leave an
 * unsorted column looking like plain text.
 *
 * Generic over the row type so one header serves every admin table; the column
 * carries the sort state, not this component.
 */
export function SortableHeader<TData>({ column, children }: SortableHeaderProps<TData>) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting()}
      className="flex items-center gap-1 font-medium"
    >
      {children}
      {column.getIsSorted() === 'asc' ? (
        <ChevronUp className="h-4 w-4" />
      ) : column.getIsSorted() === 'desc' ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  )
}
