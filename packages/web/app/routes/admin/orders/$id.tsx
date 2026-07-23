/**
 * Admin Order Detail Page - chobii.art E-commerce Platform
 *
 * Order detail page with:
 * - Full order information display
 * - Status update functionality
 * - Shipping details management
 * - Refund initiation
 * - Internal notes editing
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import {
  OrderDetail,
  OrderDetailSkeleton,
  type FullOrder,
  type ShippingDetails,
} from '~/components/admin/OrderDetail'
import type { OrderStatus } from '~/components/admin/OrdersTable'

// ============================================================================
// Route Configuration
// ============================================================================

export const Route = createFileRoute('/admin/orders/$id')({
  head: () => ({
    meta: [
      { title: 'Order Details | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminOrderDetailPage,
})

// ============================================================================
// API Functions
// ============================================================================

async function fetchOrder(id: string): Promise<FullOrder> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Order not found')
    }
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch order')
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

async function updateShippingDetails(
  orderId: string,
  details: Partial<ShippingDetails>
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/shipping`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(details),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update shipping details')
  }
}

async function updateOrderNotes(orderId: string, notes: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ internalNotes: notes }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update order notes')
  }
}

async function initiateRefund(
  orderId: string,
  amount?: number,
  reason?: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, reason: reason || 'Admin initiated refund' }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to initiate refund')
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminOrderDetailPage() {
  const navigate = useNavigate()
  const { id } = Route.useParams()

  const [order, setOrder] = useState<FullOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch order
  const loadOrder = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchOrder(id)
      setOrder(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // Handle status update
  const handleUpdateStatus = async (status: OrderStatus, reason?: string) => {
    setIsUpdating(true)
    try {
      await updateOrderStatus(id, status, reason)
      await loadOrder()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle shipping update
  const handleUpdateShipping = async (details: Partial<ShippingDetails>) => {
    setIsUpdating(true)
    try {
      await updateShippingDetails(id, details)
      await loadOrder()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update shipping')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle notes update
  const handleUpdateNotes = async (notes: string) => {
    setIsUpdating(true)
    try {
      await updateOrderNotes(id, notes)
      await loadOrder()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notes')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle refund
  const handleInitiateRefund = async (amount?: number, reason?: string) => {
    setIsUpdating(true)
    try {
      await initiateRefund(id, amount, reason)
      await loadOrder()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate refund')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle back navigation
  const handleBack = () => {
    navigate({ to: '/admin/orders' })
  }

  // Handle refresh
  const handleRefresh = () => {
    setIsLoading(true)
    loadOrder()
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Order Details</h1>
            <p className="text-sm text-muted-foreground">
              View and manage order information
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

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

      {/* Order Detail or Loading */}
      {isLoading ? (
        <OrderDetailSkeleton />
      ) : order ? (
        <OrderDetail
          order={order}
          onUpdateStatus={handleUpdateStatus}
          onUpdateShipping={handleUpdateShipping}
          onUpdateNotes={handleUpdateNotes}
          onInitiateRefund={handleInitiateRefund}
          isUpdating={isUpdating}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Order Not Found</h2>
          <p className="mt-2 text-muted-foreground">
            The order you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <button
            onClick={handleBack}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminOrderDetailPage
