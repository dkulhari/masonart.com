/**
 * Order History Page - chobii.art E-commerce Platform
 *
 * Displays user's complete order history with filtering and pagination.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Package,
  ArrowLeft,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { authApi, ordersApi } from '~/lib/api'
import { OrderList, type Order } from '~/components/account/OrderList'

// ============================================================================
// Route Definition
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().optional().default(1),
  status: z.string().optional(),
})

export const Route = createFileRoute('/_authed/account/orders/')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'Order History | chobii.art' },
      {
        name: 'description',
        content: 'View your complete order history and track your chobii.art purchases.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OrderHistoryPage,
})

// ============================================================================
// Types
// ============================================================================

interface OrdersResponse {
  items: Order[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// ============================================================================
// Status Filter Options
// ============================================================================

interface StatusFilterOption {
  value: string
  label: string
}

const STATUS_FILTERS: StatusFilterOption[] = [
  { value: '', label: 'All Orders' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PAGE_SIZE = 10

// ============================================================================
// Main Component
// ============================================================================

function OrderHistoryPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authed/account/orders/' })

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const currentPage = search.page || 1
  const currentStatus = search.status || ''

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const session = await authApi.getSession()
        if (!session?.user) {
          navigate({
            to: '/auth/login',
            search: { redirect: '/account/orders' },
          })
          return
        }
        setIsAuthenticated(true)
      } catch {
        navigate({
          to: '/auth/login',
          search: { redirect: '/account/orders' },
        })
      }
    }

    checkAuth()
  }, [navigate])

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    setError(null)

    try {
      const response: OrdersResponse = await ordersApi.list({
        page: currentPage,
        pageSize: PAGE_SIZE,
        ...(currentStatus && { status: currentStatus }),
      })

      setOrders(response.items || [])
      setPagination({
        total: response.total,
        page: response.page,
        totalPages: response.totalPages,
        hasNextPage: response.hasNextPage,
        hasPreviousPage: response.hasPreviousPage,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, currentPage, currentStatus])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Handle filter change
  const handleStatusChange = (status: string) => {
    navigate({
      to: '/account/orders',
      search: {
        page: 1,
        status: status || undefined,
      },
    })
    setShowFilters(false)
  }

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    navigate({
      to: '/account/orders',
      search: {
        page: newPage,
        status: currentStatus || undefined,
      },
    })
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Clear filter
  const handleClearFilter = () => {
    navigate({
      to: '/account/orders',
      search: { page: 1 },
    })
  }

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/account"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </a>

        {/* Page Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl text-foreground sm:text-3xl">
              <Package className="h-7 w-7 text-foreground" />
              Order History
            </h1>
            <p className="mt-2 text-muted-foreground">
              {pagination.total > 0
                ? `${pagination.total} ${pagination.total === 1 ? 'order' : 'orders'} found`
                : 'View and track your orders'}
            </p>
          </div>

          {/* Filter Toggle (Mobile) */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:hidden"
          >
            <Filter className="h-4 w-4" />
            Filter
            {currentStatus && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                1
              </span>
            )}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar Filters (Desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Filter by Status</h3>
              <div className="space-y-1">
                {STATUS_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleStatusChange(option.value)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      currentStatus === option.value
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Mobile Filters (Slide-down) */}
          {showFilters && (
            <div className="rounded-xl border border-border bg-card p-4 lg:hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Filter by Status</h3>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleStatusChange(option.value)}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm transition-colors',
                      currentStatus === option.value
                        ? 'bg-primary font-medium text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Active Filter Badge */}
            {currentStatus && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filtered by:</span>
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-medium text-foreground hover:bg-accent"
                >
                  {STATUS_FILTERS.find((f) => f.value === currentStatus)?.label}
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Orders List */}
            <OrderList orders={orders} isLoading={isLoading} error={error} />

            {/* Pagination */}
            {!isLoading && !error && pagination.totalPages > 1 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                hasNextPage={pagination.hasNextPage}
                hasPreviousPage={pagination.hasPreviousPage}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Pagination Component
// ============================================================================

interface PaginationProps {
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  onPageChange: (page: number) => void
}

function Pagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}: PaginationProps) {
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const delta = 1 // Number of pages to show on each side of current

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis')
      }
    }

    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      {/* Previous Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPreviousPage}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
          hasPreviousPage
            ? 'border-border bg-background text-foreground hover:bg-muted'
            : 'cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground'
        )}
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
                  ? 'border-primary bg-primary text-primary-foreground'
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
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
          hasNextPage
            ? 'border-border bg-background text-foreground hover:bg-muted'
            : 'cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground'
        )}
        aria-label="Next page"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
