/**
 * OrdersTable Component - chobii.art E-commerce Platform
 *
 * Admin orders data table using TanStack Table for:
 * - Sorting, filtering, and pagination
 * - Status badges and action menus
 * - Order details and customer info display
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
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type Row,
  type Column,
  type HeaderContext,
  type CellContext,
  type FilterFn,
} from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  MoreHorizontal,
  Eye,
  Truck,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package,
  DollarSign,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface AdminOrderCustomer {
  name?: string | null
  email: string
  phone?: string | null
}

export interface AdminOrder {
  id: string
  orderNumber: string
  userId?: string | null
  guestEmail?: string | null
  guestPhone?: string | null
  status: OrderStatus
  paymentStatus: PaymentStatus
  orderType: 'regular' | 'ai_generated' | 'trade'
  shippingMethod?: string | null
  shippingCost: string
  subtotal: string
  discount: string
  tax: string
  total: string
  itemCount: number
  currency: string
  createdAt: string
  updatedAt: string
  paidAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  customer?: AdminOrderCustomer | null
}

export type OrderStatus =
  | 'pending'
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded'
  | 'failed'

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled'

export interface OrdersTableProps {
  orders: AdminOrder[]
  isLoading?: boolean
  onView?: (order: AdminOrder) => void
  onUpdateStatus?: (order: AdminOrder) => void
  onCancel?: (order: AdminOrder) => void
  onRefund?: (order: AdminOrder) => void
}

// ============================================================================
// Status Badge Components
// ============================================================================

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    pending_payment: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
    processing: 'bg-purple-100 text-purple-700 border-purple-200',
    shipped: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    out_for_delivery: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    delivered: 'bg-green-100 text-green-700 border-green-200',
    cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
    refund_requested: 'bg-orange-100 text-orange-700 border-orange-200',
    refunded: 'bg-gray-100 text-gray-600 border-gray-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
  }

  const labels: Record<OrderStatus, string> = {
    pending: 'Pending',
    pending_payment: 'Payment Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    shipped: 'Shipped',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refund_requested: 'Refund Requested',
    refunded: 'Refunded',
    failed: 'Failed',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  )
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    processing: 'bg-blue-100 text-blue-700 border-blue-200',
    paid: 'bg-green-100 text-green-700 border-green-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    refunded: 'bg-gray-100 text-gray-600 border-gray-200',
    partially_refunded: 'bg-orange-100 text-orange-700 border-orange-200',
    cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  const labels: Record<PaymentStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    partially_refunded: 'Partial Refund',
    cancelled: 'Cancelled',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  )
}

// ============================================================================
// Action Menu Component
// ============================================================================

interface ActionMenuProps {
  order: AdminOrder
  onView?: (order: AdminOrder) => void
  onUpdateStatus?: (order: AdminOrder) => void
  onCancel?: (order: AdminOrder) => void
  onRefund?: (order: AdminOrder) => void
}

function ActionMenu({
  order,
  onView,
  onUpdateStatus,
  onCancel,
  onRefund,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const canCancel = ![
    'delivered',
    'cancelled',
    'refunded',
    'failed',
  ].includes(order.status)

  const canRefund =
    order.paymentStatus === 'paid' &&
    !['refunded', 'cancelled'].includes(order.status)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        /*
         * Named, because an icon-only trigger is unreachable by name to a
         * screen reader and to anything driving this table (#625).
         */
        aria-label={`Order actions for ${order.orderNumber}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
            {onView && (
              <button
                type="button"
                onClick={() => {
                  onView(order)
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <Eye className="h-4 w-4" />
                View Details
              </button>
            )}

            {onUpdateStatus && (
              <button
                type="button"
                onClick={() => {
                  onUpdateStatus(order)
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <Truck className="h-4 w-4" />
                Update Status
              </button>
            )}

            {canCancel && onCancel && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    onCancel(order)
                    setIsOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Order
                </button>
              </>
            )}

            {canRefund && onRefund && (
              <button
                type="button"
                onClick={() => {
                  onRefund(order)
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4" />
                Initiate Refund
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Column Header Component
// ============================================================================

function SortableHeader({
  column,
  children,
}: {
  column: Column<AdminOrder, unknown>
  children: React.ReactNode
}) {
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

// ============================================================================
// Main OrdersTable Component
// ============================================================================

export function OrdersTable({
  orders,
  isLoading = false,
  onView,
  onUpdateStatus,
  onCancel,
  onRefund,
}: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // Column definitions
  const columns = useMemo<ColumnDef<AdminOrder>[]>(
    () => [
      // Order Number column
      {
        accessorKey: 'orderNumber',
        header: ({ column }: HeaderContext<AdminOrder, unknown>) => (
          <SortableHeader column={column}>Order</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminOrder, unknown>) => {
          const order = row.original
          const date = new Date(order.createdAt)
          return (
            <div className="min-w-0">
              <p className="font-mono font-medium text-foreground">
                {order.orderNumber}
              </p>
              <p className="text-xs text-muted-foreground">
                {date.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          )
        },
        size: 150,
      },
      // Customer column
      {
        id: 'customer',
        accessorFn: (row) => row.customer?.email || row.guestEmail || '',
        header: 'Customer',
        cell: ({ row }: CellContext<AdminOrder, unknown>) => {
          const order = row.original
          const customer = order.customer
          return (
            <div className="min-w-0">
              {customer?.name && (
                <p className="truncate font-medium text-foreground">
                  {customer.name}
                </p>
              )}
              <p className="truncate text-sm text-muted-foreground">
                {customer?.email || order.guestEmail || 'Guest'}
              </p>
            </div>
          )
        },
        size: 200,
      },
      // Order Status column
      {
        accessorKey: 'status',
        header: ({ column }: HeaderContext<AdminOrder, unknown>) => (
          <SortableHeader column={column}>Status</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminOrder, unknown>) => (
          <OrderStatusBadge status={row.original.status} />
        ),
        filterFn: ((row: Row<AdminOrder>, _columnId: string, filterValue: string) => {
          if (!filterValue) return true
          return row.original.status === filterValue
        }) as FilterFn<AdminOrder>,
        size: 140,
      },
      // Payment Status column
      {
        accessorKey: 'paymentStatus',
        header: ({ column }: HeaderContext<AdminOrder, unknown>) => (
          <SortableHeader column={column}>Payment</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminOrder, unknown>) => (
          <PaymentStatusBadge status={row.original.paymentStatus} />
        ),
        filterFn: ((row: Row<AdminOrder>, _columnId: string, filterValue: string) => {
          if (!filterValue) return true
          return row.original.paymentStatus === filterValue
        }) as FilterFn<AdminOrder>,
        size: 120,
      },
      // Items column
      {
        accessorKey: 'itemCount',
        header: 'Items',
        cell: ({ row }: CellContext<AdminOrder, unknown>) => (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>{row.original.itemCount}</span>
          </div>
        ),
        size: 70,
      },
      // Total column
      {
        accessorKey: 'total',
        header: ({ column }: HeaderContext<AdminOrder, unknown>) => (
          <SortableHeader column={column}>Total</SortableHeader>
        ),
        cell: ({ row }: CellContext<AdminOrder, unknown>) => (
          <div className="flex items-center gap-1 font-medium text-foreground">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            {formatPrice(parseFloat(row.original.total))}
          </div>
        ),
        sortingFn: (rowA: Row<AdminOrder>, rowB: Row<AdminOrder>) => {
          return parseFloat(rowA.original.total) - parseFloat(rowB.original.total)
        },
        size: 100,
      },
      // Actions column
      {
        id: 'actions',
        header: '',
        cell: ({ row }: CellContext<AdminOrder, unknown>) => (
          <ActionMenu
            order={row.original}
            onView={onView}
            onUpdateStatus={onUpdateStatus}
            onCancel={onCancel}
            onRefund={onRefund}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
    ],
    [onView, onUpdateStatus, onCancel, onRefund]
  )

  // Table instance
  const table = useReactTable({
    data: orders,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  // Get filter values
  const statusFilterValue = columnFilters.find((f) => f.id === 'status')?.value as string | undefined
  const paymentFilterValue = columnFilters.find((f) => f.id === 'paymentStatus')?.value as string | undefined

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search orders..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Order Status Filter */}
          <select
            value={statusFilterValue || ''}
            onChange={(e) => {
              const value = e.target.value
              const newFilters = columnFilters.filter((f) => f.id !== 'status')
              if (value) {
                newFilters.push({ id: 'status', value })
              }
              setColumnFilters(newFilters)
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="pending_payment">Payment Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="refund_requested">Refund Requested</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
          </select>

          {/* Payment Status Filter */}
          <select
            value={paymentFilterValue || ''}
            onChange={(e) => {
              const value = e.target.value
              const newFilters = columnFilters.filter((f) => f.id !== 'paymentStatus')
              if (value) {
                newFilters.push({ id: 'paymentStatus', value })
              }
              setColumnFilters(newFilters)
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Payment</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partial Refund</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
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
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {columns.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-6 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                // Empty state
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-3">No orders found</p>
                    {globalFilter && (
                      <p className="mt-1 text-sm">
                        Try adjusting your search or filter to find what you&apos;re looking for.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                // Data rows
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border transition-colors hover:bg-muted/50"
                  >
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
        {!isLoading && table.getRowModel().rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            {/* Info */}
            <div className="text-sm text-muted-foreground">
              Showing{' '}
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{' '}
              of {table.getFilteredRowModel().rows.length} orders
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>

              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function OrdersTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex gap-4">
            {[150, 200, 140, 120, 70, 100, 50].map((w, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-4">
              {[150, 200, 140, 120, 70, 100, 50].map((w, j) => (
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
    </div>
  )
}

export default OrdersTable
