/**
 * Admin Returns Management Page - chobii.art E-commerce Platform
 *
 * Return request management dashboard with:
 * - Stats cards showing pending, approved, refunded counts
 * - Filterable return request list with status, reason, search
 * - Quick approve/reject actions
 * - Refund processing modal
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Search,
  Filter,
  ExternalLink,
  CreditCard,
  Package,
  RotateCcw,
  User,
  X,
  Check,
  DollarSign,
  ArrowDownCircle,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { getApiUrl } from '~/lib/utils'
import { StatsCard, StatsCardGrid, StatsCardSkeleton } from '~/components/admin/StatsCard'

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'shipped_back', 'received', 'processing', 'refunded', 'closed']).optional(),
  reason: z.enum(['defective', 'wrong_item', 'not_as_described', 'damaged', 'quality', 'changed_mind', 'other']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['requestedAt', 'status', 'createdAt']).optional().default('requestedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

type SearchParams = z.infer<typeof searchParamsSchema>

export const Route = createFileRoute('/admin/returns')({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Returns | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminReturnsPage,
})

// ============================================================================
// Types
// ============================================================================

interface Customer {
  id: string
  name: string | null
  email: string
}

interface Order {
  id: string
  orderNumber: string
  total: string
  status: string
}

interface AdminReturn {
  id: string
  orderId: string
  userId: string
  reason: string
  reasonDetails: string | null
  status: string
  requestedAt: string
  approvedAt: string | null
  processedAt: string | null
  refundAmount: string | null
  adminNotes: string | null
  createdAt: string
  order: Order
  customer: Customer | null
}

interface ReturnStats {
  byStatus: {
    pending: number
    approved: number
    rejected: number
    shipped_back: number
    received: number
    refunded: number
    closed: number
  }
  byReason: Record<string, number>
  today: number
  totalRefunded: number
  total: number
}

interface PaginatedResponse {
  items: AdminReturn[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// ============================================================================
// Constants
// ============================================================================

const REASON_LABELS: Record<string, string> = {
  defective: 'Defective Product',
  wrong_item: 'Wrong Item Received',
  not_as_described: 'Not as Described',
  damaged: 'Damaged in Shipping',
  quality: 'Quality Issues',
  changed_mind: 'Changed Mind',
  other: 'Other',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'amber', icon: Clock },
  approved: { label: 'Approved', color: 'green', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'red', icon: XCircle },
  shipped_back: { label: 'Shipped Back', color: 'blue', icon: Package },
  received: { label: 'Received', color: 'purple', icon: ArrowDownCircle },
  processing: { label: 'Processing', color: 'indigo', icon: RefreshCw },
  refunded: { label: 'Refunded', color: 'emerald', icon: CreditCard },
  closed: { label: 'Closed', color: 'gray', icon: CheckCircle2 },
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchReturns(params: SearchParams): Promise<PaginatedResponse> {
  const queryParams = new URLSearchParams()

  queryParams.set('page', String(params.page))
  queryParams.set('pageSize', String(params.pageSize))
  queryParams.set('sortBy', params.sortBy)
  queryParams.set('sortOrder', params.sortOrder)

  if (params.status) {
    queryParams.set('status', params.status)
  }

  if (params.reason) {
    queryParams.set('reason', params.reason)
  }

  if (params.search) {
    queryParams.set('search', params.search)
  }

  const response = await fetch(
    `${getApiUrl()}/api/admin/returns?${queryParams.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch returns')
  }

  return response.json()
}

async function fetchReturnStats(): Promise<ReturnStats> {
  const response = await fetch(`${getApiUrl()}/api/admin/returns/stats`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch return statistics')
  }

  return response.json()
}

async function approveReturn(returnId: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/returns/${returnId}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to approve return')
  }
}

async function rejectReturn(returnId: string, reason: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/returns/${returnId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to reject return')
  }
}

async function processRefund(
  returnId: string,
  refundAmount: number,
  refundType: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/returns/${returnId}/process-refund`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refundAmount, refundType }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to process refund')
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminReturnsPage() {
  const navigate = useNavigate()
  const searchParams = Route.useSearch()

  // State
  const [returns, setReturns] = useState<AdminReturn[]>([])
  const [stats, setStats] = useState<ReturnStats | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isStatsLoading, setIsStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(searchParams.search || '')

  // Modal state
  const [selectedReturn, setSelectedReturn] = useState<AdminReturn | null>(null)
  const [modalMode, setModalMode] = useState<'view' | 'reject' | 'refund' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundType, setRefundType] = useState<'full' | 'partial' | 'store_credit'>('full')
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch returns
  const loadReturns = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchReturns(searchParams)
      setReturns(data.items)
      setPagination({
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        hasPreviousPage: data.hasPreviousPage,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load returns')
    } finally {
      setIsLoading(false)
    }
  }, [searchParams])

  // Fetch stats
  const loadStats = useCallback(async () => {
    setIsStatsLoading(true)

    try {
      const data = await fetchReturnStats()
      setStats(data)
    } catch {
      // Stats error is non-critical
    } finally {
      setIsStatsLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadReturns()
    loadStats()
  }, [loadReturns, loadStats])

  // Update search params
  const updateSearchParams = (updates: Partial<SearchParams>) => {
    navigate({
      to: '/admin/returns',
      search: {
        ...searchParams,
        ...updates,
        page: updates.page || (updates.status !== undefined || updates.reason !== undefined || updates.search !== undefined ? 1 : searchParams.page),
      },
    })
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateSearchParams({ search: searchQuery || undefined })
  }

  // Handle approve
  const handleApprove = async (returnItem: AdminReturn) => {
    setIsProcessing(true)
    try {
      await approveReturn(returnItem.id)
      loadReturns()
      loadStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve return')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle reject
  const handleReject = async () => {
    if (!selectedReturn || rejectReason.length < 10) return

    setIsProcessing(true)
    try {
      await rejectReturn(selectedReturn.id, rejectReason)
      setModalMode(null)
      setSelectedReturn(null)
      setRejectReason('')
      loadReturns()
      loadStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject return')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle refund
  const handleRefund = async () => {
    if (!selectedReturn || !refundAmount) return

    setIsProcessing(true)
    try {
      await processRefund(selectedReturn.id, parseFloat(refundAmount), refundType)
      setModalMode(null)
      setSelectedReturn(null)
      setRefundAmount('')
      setRefundType('full')
      loadReturns()
      loadStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process refund')
    } finally {
      setIsProcessing(false)
    }
  }

  // Open refund modal with pre-filled amount
  const openRefundModal = (returnItem: AdminReturn) => {
    setSelectedReturn(returnItem)
    setRefundAmount(returnItem.order.total)
    setModalMode('refund')
  }

  // Format currency
  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateString))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Returns Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and process return requests
          </p>
        </div>
        <button
          onClick={() => {
            loadReturns()
            loadStats()
          }}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {isStatsLoading ? (
        <StatsCardGrid>
          <StatsCardSkeleton />
          <StatsCardSkeleton />
          <StatsCardSkeleton />
          <StatsCardSkeleton />
        </StatsCardGrid>
      ) : stats ? (
        <StatsCardGrid columns={{ default: 2, sm: 2, lg: 4 }}>
          <StatsCard
            title="Pending"
            value={stats.byStatus.pending}
            icon={Clock}
            variant="warning"
            href="/admin/returns?status=pending"
          />
          <StatsCard
            title="Approved"
            value={stats.byStatus.approved}
            icon={CheckCircle2}
            variant="success"
            href="/admin/returns?status=approved"
          />
          <StatsCard
            title="Refunded"
            value={stats.byStatus.refunded}
            icon={CreditCard}
            variant="success"
            href="/admin/returns?status=refunded"
          />
          <StatsCard
            title="Total Refunded"
            value={formatCurrency(stats.totalRefunded)}
            icon={DollarSign}
            variant="info"
          />
        </StatsCardGrid>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order number..."
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Search
          </button>
        </form>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={searchParams.status || ''}
            onChange={(e) =>
              updateSearchParams({
                status: e.target.value as SearchParams['status'] || undefined,
              })
            }
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="shipped_back">Shipped Back</option>
            <option value="received">Received</option>
            <option value="refunded">Refunded</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Reason Filter */}
        <select
          value={searchParams.reason || ''}
          onChange={(e) =>
            updateSearchParams({
              reason: e.target.value as SearchParams['reason'] || undefined,
            })
          }
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">All Reasons</option>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
        {(searchParams.status || searchParams.reason || searchParams.search) && (
          <button
            onClick={() =>
              navigate({
                to: '/admin/returns',
                search: { page: 1, pageSize: 20, sortBy: 'requestedAt', sortOrder: 'desc' },
              })
            }
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Returns Table */}
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />
            <p className="mt-2 text-sm text-muted-foreground">Loading returns...</p>
          </div>
        ) : returns.length === 0 ? (
          <div className="p-8 text-center">
            <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">No return requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returns.map((returnItem) => {
                  const statusConfig = STATUS_CONFIG[returnItem.status] ?? STATUS_CONFIG.pending
                  const StatusIcon = statusConfig!.icon

                  return (
                    <tr
                      key={returnItem.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/admin/orders/${returnItem.orderId}`}
                            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                          >
                            {returnItem.order.orderNumber}
                          </a>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatCurrency(returnItem.order.total)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {returnItem.customer?.name || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {returnItem.customer?.email || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">
                          {REASON_LABELS[returnItem.reason] || returnItem.reason}
                        </p>
                        {returnItem.reasonDetails && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                            {returnItem.reasonDetails}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                            statusConfig!.color === 'amber' && 'bg-amber-100 text-amber-700',
                            statusConfig!.color === 'green' && 'bg-green-100 text-green-700',
                            statusConfig!.color === 'red' && 'bg-red-100 text-red-700',
                            statusConfig!.color === 'blue' && 'bg-blue-100 text-blue-700',
                            statusConfig!.color === 'purple' && 'bg-purple-100 text-purple-700',
                            statusConfig!.color === 'indigo' && 'bg-indigo-100 text-indigo-700',
                            statusConfig!.color === 'emerald' && 'bg-emerald-100 text-emerald-700',
                            statusConfig!.color === 'gray' && 'bg-gray-100 text-gray-700'
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig!.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {returnItem.refundAmount ? (
                          <span className="text-sm font-medium text-emerald-600">
                            {formatCurrency(returnItem.refundAmount)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(returnItem.requestedAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {returnItem.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(returnItem)}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedReturn(returnItem)
                                  setModalMode('reject')
                                }}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </>
                          )}
                          {['approved', 'shipped_back', 'received'].includes(returnItem.status) && (
                            <button
                              onClick={() => openRefundModal(returnItem)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              Process Refund
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedReturn(returnItem)
                              setModalMode('view')
                            }}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
              {pagination.total} results
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSearchParams({ page: pagination.page - 1 })}
                disabled={!pagination.hasPreviousPage}
                className="inline-flex h-8 items-center justify-center rounded border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => updateSearchParams({ page: pagination.page + 1 })}
                disabled={!pagination.hasNextPage}
                className="inline-flex h-8 items-center justify-center rounded border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h2 className="text-lg text-foreground">Reject Return Request</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Please provide a reason for rejecting this return request.
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground">
                Rejection Reason
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this return is being rejected (min 10 characters)..."
                rows={4}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {rejectReason.length > 0 && rejectReason.length < 10 && (
                <p className="mt-1 text-xs text-red-500">
                  Minimum 10 characters required ({rejectReason.length}/10)
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setModalMode(null)
                  setSelectedReturn(null)
                  setRejectReason('')
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectReason.length < 10 || isProcessing}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {isProcessing ? 'Rejecting...' : 'Reject Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {modalMode === 'refund' && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h2 className="text-lg text-foreground">Process Refund</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Order {selectedReturn.order.orderNumber} - Total:{' '}
              {formatCurrency(selectedReturn.order.total)}
            </p>

            <div className="mt-4 space-y-4">
              {/* Refund Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Refund Amount (₹)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min="0"
                  max={selectedReturn.order.total}
                  step="0.01"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {/* Refund Type */}
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Refund Type
                </label>
                <div className="mt-2 space-y-2">
                  {[
                    { value: 'full', label: 'Full Refund', desc: 'Refund to original payment method' },
                    { value: 'partial', label: 'Partial Refund', desc: 'Partial amount to original payment' },
                    { value: 'store_credit', label: 'Store Credit', desc: 'Add credit to customer wallet' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                        refundType === option.value
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-border hover:border-brand-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="refundType"
                        value={option.value}
                        checked={refundType === option.value}
                        onChange={(e) => setRefundType(e.target.value as typeof refundType)}
                        className="mt-0.5 h-4 w-4 border-border text-brand-500 focus:ring-brand-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setModalMode(null)
                  setSelectedReturn(null)
                  setRefundAmount('')
                  setRefundType('full')
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={!refundAmount || parseFloat(refundAmount) <= 0 || isProcessing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                {isProcessing ? 'Processing...' : `Refund ${formatCurrency(refundAmount || '0')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {modalMode === 'view' && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-foreground">Return Details</h2>
              <button
                onClick={() => {
                  setModalMode(null)
                  setSelectedReturn(null)
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Order Info */}
              <div className="rounded-lg bg-muted/30 p-4">
                <h3 className="text-sm font-medium text-foreground">Order Information</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-medium">{selectedReturn.order.orderNumber}</span>
                  <span className="text-muted-foreground">Order Total:</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.order.total)}</span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="rounded-lg bg-muted/30 p-4">
                <h3 className="text-sm font-medium text-foreground">Customer</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{selectedReturn.customer?.name || 'Unknown'}</span>
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{selectedReturn.customer?.email || '-'}</span>
                </div>
              </div>

              {/* Return Info */}
              <div className="rounded-lg bg-muted/30 p-4">
                <h3 className="text-sm font-medium text-foreground">Return Information</h3>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reason:</span>
                    <span className="font-medium">
                      {REASON_LABELS[selectedReturn.reason] || selectedReturn.reason}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium">{STATUS_CONFIG[selectedReturn.status]?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requested:</span>
                    <span className="font-medium">{formatDate(selectedReturn.requestedAt)}</span>
                  </div>
                  {selectedReturn.refundAmount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Refund Amount:</span>
                      <span className="font-medium text-emerald-600">
                        {formatCurrency(selectedReturn.refundAmount)}
                      </span>
                    </div>
                  )}
                </div>
                {selectedReturn.reasonDetails && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">Details:</p>
                    <p className="mt-1 text-sm text-foreground">{selectedReturn.reasonDetails}</p>
                  </div>
                )}
                {selectedReturn.adminNotes && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">Admin Notes:</p>
                    <p className="mt-1 text-sm text-foreground">{selectedReturn.adminNotes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setModalMode(null)
                  setSelectedReturn(null)
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Close
              </button>
              <a
                href={`/admin/orders/${selectedReturn.orderId}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                <ExternalLink className="h-4 w-4" />
                View Order
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
