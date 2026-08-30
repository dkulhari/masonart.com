/**
 * ProductsTable Component - chobii.art E-commerce Platform
 *
 * Admin products data table using TanStack Table for:
 * - Sorting, filtering, and pagination
 * - Row selection for bulk actions
 * - Status badges and action menus
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
  type Row,
  type HeaderContext,
  type CellContext,
  type FilterFn,
} from '@tanstack/react-table'
import {
  Search,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Archive,
  ExternalLink,
  ImageIcon,
} from 'lucide-react'
import { AdminDataTable, AdminTableSkeleton } from './AdminDataTable'
import {
  RowActionsMenu,
  ROW_ACTION_ITEM,
  ROW_ACTION_SEPARATOR,
} from './RowActionsMenu'
import { SortableHeader } from './SortableHeader'
import { StatusBadge } from './StatusBadge'
import { formatPrice } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

import { mainImage, type ProductImage } from '@chobii/shared'
export type { ProductImage }

export interface AdminProduct {
  id: string
  sku: string
  title: string
  slug: string
  description?: string | null
  basePrice: string
  styles: string[]
  subjects: string[]
  colors: string[]
  rooms: string[]
  orientation: string
  images: ProductImage[]
  status: 'draft' | 'active' | 'archived'
  isFeatured: boolean
  featuredOrder?: number | null
  /** Curator pin for the Best-selling sort. Reorders; never rewrites a total. */
  isPopular?: boolean
  popularOrder?: number | null
  /** Real units sold from settled orders — the figure the pin overrides. */
  unitsSold?: number
  isAiGenerated: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductsTableProps {
  products: AdminProduct[]
  isLoading?: boolean
  onEdit?: (product: AdminProduct) => void
  onDelete?: (product: AdminProduct) => void
  onView?: (product: AdminProduct) => void
  onArchive?: (product: AdminProduct) => void
  onDuplicate?: (product: AdminProduct) => void
  onBulkDelete?: (products: AdminProduct[]) => void
  onBulkArchive?: (products: AdminProduct[]) => void
}

// ============================================================================
// Status Badge Component
// ============================================================================

const PRODUCT_STATUS_STYLES: Record<AdminProduct['status'], string> = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  archived: 'bg-gray-100 text-gray-700 border-gray-200',
}

// ============================================================================
// Action Menu Component
// ============================================================================

interface ActionMenuProps {
  product: AdminProduct
  onEdit?: (product: AdminProduct) => void
  onDelete?: (product: AdminProduct) => void
  onView?: (product: AdminProduct) => void
  onArchive?: (product: AdminProduct) => void
  onDuplicate?: (product: AdminProduct) => void
}

function ActionMenu({
  product,
  onEdit,
  onDelete,
  onView,
  onArchive,
  onDuplicate,
}: ActionMenuProps) {
  return (
    <RowActionsMenu>
      {(close) => (
        <>
          {onView && (
            <button
              type="button"
              onClick={() => {
                onView(product)
                close()
              }}
              className={ROW_ACTION_ITEM}
            >
              <Eye className="h-4 w-4" />
              View Details
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onEdit(product)
                close()
              }}
              className={ROW_ACTION_ITEM}
            >
              <Pencil className="h-4 w-4" />
              Edit Product
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                onDuplicate(product)
                close()
              }}
              className={ROW_ACTION_ITEM}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </button>
          )}

          <a
            href={`/posters/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={ROW_ACTION_ITEM}
          >
            <ExternalLink className="h-4 w-4" />
            View in Store
          </a>

          <div className={ROW_ACTION_SEPARATOR} />

          {onArchive && product.status !== 'archived' && (
            <button
              type="button"
              onClick={() => {
                onArchive(product)
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50"
            >
              <Archive className="h-4 w-4" />
              Archive Product
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(product)
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete Product
            </button>
          )}
        </>
      )}
    </RowActionsMenu>
  )
}

// ============================================================================
// Main ProductsTable Component
// ============================================================================

export function ProductsTable({
  products,
  isLoading = false,
  onEdit,
  onDelete,
  onView,
  onArchive,
  onDuplicate,
  onBulkDelete,
  onBulkArchive,
}: ProductsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Column definitions with proper typing
  const columns = useMemo<ColumnDef<AdminProduct>[]>(
    () => [
      // Checkbox column
      {
        id: 'select',
        header: ({ table }: HeaderContext<AdminProduct, unknown>) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
        ),
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      // Product column (image + title)
      {
        accessorKey: 'title',
        header: ({ column }: HeaderContext<AdminProduct, unknown>) => (
          <SortableHeader column={column}>Product</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminProduct, unknown>) => {
          const product = row.original
          const primaryImage = mainImage(product.images)

          return (
            <div className="flex items-center gap-3">
              {/* Thumbnail */}
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {primaryImage?.url ? (
                  <img
                    src={primaryImage.url}
                    alt={primaryImage.altText || product.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Title and SKU */}
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{product.title}</p>
                <p className="text-xs text-muted-foreground">{product.sku}</p>
              </div>
            </div>
          )
        },
        size: 300,
      },
      // Status column
      {
        accessorKey: 'status',
        header: ({ column }: HeaderContext<AdminProduct, unknown>) => (
          <SortableHeader column={column}>Status</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          <StatusBadge
            status={row.original.status}
            styles={PRODUCT_STATUS_STYLES}
            className="capitalize"
          />
        ),
        filterFn: ((row: Row<AdminProduct>, _columnId: string, filterValue: string) => {
          if (!filterValue) return true
          return row.original.status === filterValue
        }) as FilterFn<AdminProduct>,
        size: 100,
      },
      // Price column
      {
        accessorKey: 'basePrice',
        header: ({ column }: HeaderContext<AdminProduct, unknown>) => (
          <SortableHeader column={column}>Price</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          formatPrice(parseFloat(row.original.basePrice))
        ),
        sortingFn: (rowA: Row<AdminProduct>, rowB: Row<AdminProduct>) => {
          return parseFloat(rowA.original.basePrice) - parseFloat(rowB.original.basePrice)
        },
        size: 100,
      },
      // Orientation column
      {
        accessorKey: 'orientation',
        header: 'Orientation',
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          <span className="capitalize text-muted-foreground">
            {row.original.orientation}
          </span>
        ),
        size: 100,
      },
      // Featured column
      {
        accessorKey: 'isFeatured',
        header: 'Featured',
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          row.original.isFeatured ? (
            <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
              Featured
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        ),
        size: 80,
      },
      /**
       * Units sold and the pin, side by side and in that order.
       *
       * The pin lifts a product in the Best-selling sort without touching
       * what it actually sold. Showing only the pin would let a
       * merchandising decision pass for a sales fact; showing them together
       * makes a disagreement visible.
       *
       * Zero is rendered as zero, not hidden. "Nothing has sold yet" is a
       * true and useful statement.
       */
      {
        accessorKey: 'unitsSold',
        header: 'Units sold',
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          <span className="tabular-nums">{row.original.unitsSold ?? 0}</span>
        ),
        size: 90,
      },
      {
        accessorKey: 'isPopular',
        header: 'Popular',
        cell: ({ row }: CellContext<AdminProduct, unknown>) =>
          row.original.isPopular ? (
            <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
              Pinned
              {row.original.popularOrder != null && ` #${row.original.popularOrder}`}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        size: 90,
      },
      // Date column
      {
        accessorKey: 'createdAt',
        header: ({ column }: HeaderContext<AdminProduct, unknown>) => (
          <SortableHeader column={column}>Created</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminProduct, unknown>) => {
          const date = new Date(row.original.createdAt)
          return (
            <span className="text-sm text-muted-foreground">
              {date.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )
        },
        size: 120,
      },
      // Actions column
      {
        id: 'actions',
        header: '',
        cell: ({ row }: CellContext<AdminProduct, unknown>) => (
          <ActionMenu
            product={row.original}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={onView}
            onArchive={onArchive}
            onDuplicate={onDuplicate}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
    ],
    [onEdit, onDelete, onView, onArchive, onDuplicate]
  )

  // Table instance
  // Custom global filter function to search across multiple fields
  const globalFilterFn: FilterFn<AdminProduct> = (row, _columnId, filterValue) => {
    if (!filterValue) return true
    const searchValue = String(filterValue).toLowerCase()
    const product = row.original

    // Search across title, SKU, slug, and description
    return (
      product.title.toLowerCase().includes(searchValue) ||
      product.sku.toLowerCase().includes(searchValue) ||
      product.slug.toLowerCase().includes(searchValue) ||
      (product.description?.toLowerCase().includes(searchValue) ?? false)
    )
  }

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  // Get selected products
  const selectedProducts = table
    .getSelectedRowModel()
    .rows.map((row: Row<AdminProduct>) => row.original)

  // Get status filter value
  const statusFilterValue = columnFilters.find((f) => f.id === 'status')?.value as string | undefined

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilterValue || ''}
            onChange={(e) => {
              const value = e.target.value
              if (value) {
                setColumnFilters([{ id: 'status', value }])
              } else {
                setColumnFilters([])
              }
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>

          {/* Bulk Actions */}
          {selectedProducts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedProducts.length} selected
              </span>
              {onBulkArchive && (
                <button
                  type="button"
                  onClick={() => onBulkArchive(selectedProducts)}
                  className="h-9 rounded-lg bg-amber-100 px-3 text-sm font-medium text-amber-700 hover:bg-amber-200"
                >
                  Archive
                </button>
              )}
              {onBulkDelete && (
                <button
                  type="button"
                  onClick={() => onBulkDelete(selectedProducts)}
                  className="h-9 rounded-lg bg-red-100 px-3 text-sm font-medium text-red-700 hover:bg-red-200"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <AdminDataTable
        table={table}
        columnCount={columns.length}
        isLoading={isLoading}
        emptyIcon={ImageIcon}
        emptyTitle="No products found"
        isFiltered={Boolean(globalFilter)}
        itemNoun="products"
        rowClassName={(row) => row.getIsSelected() && 'bg-brand-50'}
      />
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function ProductsTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Table skeleton */}
      <AdminTableSkeleton widths={[40, 300, 100, 100, 100, 80, 120, 50]} />
    </div>
  )
}

export default ProductsTable
