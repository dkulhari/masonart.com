/**
 * Admin Orders List Page - chobii.art E-commerce Platform
 *
 * Orders management page with:
 * - Order listing with TanStack Table
 * - Filtering by status, payment status, and search
 * - Links to view order details
 * - Quick actions (update status, cancel, refund)
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  RefreshCw,
  AlertCircle,
  Download,
  Calendar,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { OrdersTable, OrdersTableSkeleton, type AdminOrder, type OrderStatus } from '~/components/admin/OrdersTable'

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  status: z
    .enum([
      'pending',
      'pending_payment',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refund_requested',
      'refunded',
      'failed',
    ])
    .optional(),
  paymentStatus: z
    .enum([
      'pending',
      'processing',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled',
    ])
    .optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'total', 'orderNumber']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

type SearchParams = z.infer<typeof searchParamsSchema>

export const Route = createFileRoute('/admin/orders/')({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Orders | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminOrdersPage,
})

// ============================================================================
// Types
// ============================================================================

interface PaginatedResponse {
  items: AdminOrder[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

interface OrderStats {
  byStatus: Record<string, number>
  byPaymentStatus: Record<string, number>
  totalRevenue: string
  todayOrders: number
  monthRevenue: string
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchOrders(params: SearchParams): Promise<PaginatedResponse> {
  const queryParams = new URLSearchParams()

  queryParams.set('page', String(params.page))
  queryParams.set('pageSize', String(params.pageSize))
  queryParams.set('sortBy', params.sortBy)
  queryParams.set('sortOrder', params.sortOrder)

  if (params.status) {
    queryParams.set('status', params.status)
  }

  if (params.paymentStatus) {
    queryParams.set('paymentStatus', params.paymentStatus)
  }

  if (params.search) {
    queryParams.set('search', params.search)
  }

  if (params.dateFrom) {
    queryParams.set('dateFrom', params.dateFrom)
  }

  if (params.dateTo) {
    queryParams.set('dateTo', params.dateTo)
  }

  const response = await fetch(
    `${getApiUrl()}/api/admin/orders?${queryParams.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch orders')
  }

  return response.json()
}

async function fetchOrderStats(): Promise<OrderStats> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/stats`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch order statistics')
  }

  return response.json()
}

async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  reason?: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, reason }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update order status')
  }
}

async function initiateRefund(orderId: string, reason: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to initiate refund')
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminOrdersPage() {
  const navigate = useNavigate()
  const searchParams = Route.useSearch()

  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch orders
  const loadOrders = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchOrders(searchParams)
      setOrders(data.items)
      setPagination({
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        hasPreviousPage: data.hasPreviousPage,
      })
    } catch (err) {
      setError('Failed to load orders. Please try again.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [searchParams])

  // Fetch stats
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchOrderStats()
      setStats(data)
    } catch (err) {
      // Stats are non-critical, so we don't show an error
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    loadOrders()
    loadStats()
  }, [loadOrders, loadStats])

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true)
    loadOrders()
    loadStats()
  }

  // Update URL params
  const updateSearch = (updates: Partial<SearchParams>) => {
    navigate({
      to: '/admin/orders',
      search: (prev: SearchParams) => ({
        ...prev,
        ...updates,
        page:
          updates.page ||
          (updates.status !== undefined ||
          updates.paymentStatus !== undefined ||
          updates.search !== undefined
            ? 1
            : prev.page),
      }),
    })
  }

  // Navigation handlers
  const handleViewOrder = (order: AdminOrder) => {
    navigate({
      to: '/admin/orders/$id',
      params: { id: order.id },
    })
  }

  // Status update handler
  const handleUpdateStatus = async (order: AdminOrder) => {
    const newStatus = prompt(
      'Enter new status (pending, confirmed, processing, shipped, delivered, cancelled):'
    )
    if (!newStatus) return

    const validStatuses: OrderStatus[] = [
      'pending',
      'pending_payment',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refund_requested',
      'refunded',
      'failed',
    ]

    if (!validStatuses.includes(newStatus as OrderStatus)) {
      setError('Invalid status. Please enter a valid status.')
      return
    }

    try {
      await updateOrderStatus(order.id, newStatus as OrderStatus)
      loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order status.')
    }
  }

  // Cancel handler
  const handleCancelOrder = async (order: AdminOrder) => {
    if (!confirm(`Are you sure you want to cancel order ${order.orderNumber}?`)) {
      return
    }

    try {
      await updateOrderStatus(order.id, 'cancelled', 'Cancelled by admin')
      loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order.')
    }
  }

  // Refund handler
  const handleRefundOrder = async (order: AdminOrder) => {
    const reason = prompt('Enter refund reason:')
    if (!reason) return

    try {
      await initiateRefund(order.id, reason)
      loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate refund.')
    }
  }

  // Format currency
  const formatCurrency = (value: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(parseFloat(value))
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage customer orders ({pagination.total} total)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Filter */}
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={searchParams.dateFrom || ''}
              onChange={(e) => updateSearch({ dateFrom: e.target.value || undefined })}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={searchParams.dateTo || ''}
              onChange={(e) => updateSearch({ dateTo: e.target.value || undefined })}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export Button (placeholder) */}
          <button
            onClick={() => alert('Export functionality coming soon')}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Today's Orders"
            value={String(stats.todayOrders)}
            subtext="Orders placed today"
          />
          <StatCard
            label="Pending Orders"
            value={String(
              (stats.byStatus.pending || 0) +
                (stats.byStatus.pending_payment || 0) +
                (stats.byStatus.confirmed || 0)
            )}
            subtext="Awaiting processing"
            variant="warning"
          />
          <StatCard
            label="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
            subtext="All time"
            variant="success"
          />
          <StatCard
            label="This Month"
            value={formatCurrency(stats.monthRevenue)}
            subtext="Revenue this month"
            variant="info"
          />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-sm font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Orders Table */}
      {isLoading && !isRefreshing ? (
        <OrdersTableSkeleton />
      ) : (
        <OrdersTable
          orders={orders}
          isLoading={isRefreshing}
          onView={handleViewOrder}
          onUpdateStatus={handleUpdateStatus}
          onCancel={handleCancelOrder}
          onRefund={handleRefundOrder}
        />
      )}

      {/* Pagination */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          {/* Page Info */}
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>

          {/* Page Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSearch({ page: pagination.page - 1 })}
              disabled={!pagination.hasPreviousPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => updateSearch({ page: pagination.page + 1 })}
              disabled={!pagination.hasNextPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  label: string
  value: string
  subtext: string
  variant?: 'default' | 'success' | 'warning' | 'info'
}

function StatCard({ label, value, subtext, variant = 'default' }: StatCardProps) {
  const variants = {
    default: 'border-border',
    success: 'border-green-200 bg-green-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
    info: 'border-blue-200 bg-blue-50/50',
  }

  const textVariants = {
    default: 'text-foreground',
    success: 'text-green-700',
    warning: 'text-amber-700',
    info: 'text-blue-700',
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4', variants[variant])}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold', textVariants[variant])}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
    </div>
  )
}

export default AdminOrdersPage
