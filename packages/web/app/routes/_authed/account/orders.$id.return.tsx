/**
 * Return Request Page - chobii.art E-commerce Platform
 *
 * Page for requesting a return for a delivered order.
 * Shows eligibility check, return form, and existing return status.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { authApi, ordersApi, returnsApi, type ReturnRequest } from '~/lib/api'
import {
  ReturnEligibilityCheck,
  ReturnRequestForm,
  ReturnStatusCard,
  ReturnPolicyDisplay,
} from '~/components/returns'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/_authed/account/orders/$id/return')({
  head: () => ({
    meta: [
      { title: 'Request Return | chobii.art' },
      { name: 'description', content: 'Request a return for your order.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ReturnRequestPage,
})

// ============================================================================
// Types
// ============================================================================

interface OrderBasicInfo {
  id: string
  orderNumber: string
  status: string
}

// ============================================================================
// Main Component
// ============================================================================

function ReturnRequestPage() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const orderId = params.id

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [order, setOrder] = useState<OrderBasicInfo | null>(null)
  const [returns, setReturns] = useState<ReturnRequest[]>([])
  const [canRequestReturn, setCanRequestReturn] = useState(false)
  const [eligibilityMessage, setEligibilityMessage] = useState<string | undefined>()
  const [daysRemaining, setDaysRemaining] = useState<number | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const session = await authApi.getSession()
        if (!session?.user) {
          navigate({
            to: '/auth/login',
            search: { redirect: `/account/orders/${orderId}/return` },
          })
          return
        }
        setIsAuthenticated(true)
      } catch {
        navigate({
          to: '/auth/login',
          search: { redirect: `/account/orders/${orderId}/return` },
        })
      }
    }

    checkAuth()
  }, [navigate, orderId])

  // Fetch order and return data
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    setError(null)

    try {
      // Fetch order basic info and returns in parallel
      const [orderData, returnsData] = await Promise.all([
        ordersApi.getById(orderId),
        returnsApi.getOrderReturns(orderId),
      ])

      if (!orderData) {
        setError('Order not found')
        return
      }

      setOrder({
        id: orderData.id,
        orderNumber: orderData.orderNumber,
        status: orderData.status,
      })
      setReturns(returnsData.returns)
      setCanRequestReturn(returnsData.canRequestReturn)
      setEligibilityMessage(returnsData.eligibilityMessage)
      setDaysRemaining(returnsData.daysRemaining)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, orderId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle return creation success
  const handleReturnSuccess = useCallback(
    (newReturn: ReturnRequest) => {
      // Add the new return to the list and disable form
      setReturns((prev) => [newReturn, ...prev])
      setCanRequestReturn(false)
      setEligibilityMessage('A return request already exists for this order')
    },
    []
  )

  // Handle return cancellation
  const handleCancelReturn = useCallback(async (returnId: string) => {
    setIsCancelling(true)
    try {
      await returnsApi.cancelReturn(returnId)
      // Refresh data
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel return')
    } finally {
      setIsCancelling(false)
    }
  }, [fetchData])

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

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <a
            href={`/account/orders/${orderId}`}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Order
          </a>
          <ReturnPageSkeleton />
        </div>
      </div>
    )
  }

  // Error state
  if (error || !order) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <a
            href="/account/orders"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </a>
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
            <h2 className="mt-4 text-lg font-semibold text-red-900">
              {error || 'Order not found'}
            </h2>
            <p className="mt-2 text-sm text-red-700">
              We couldn&apos;t load the return information. Please try again.
            </p>
            <button
              onClick={() => fetchData()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Check if there's an active (non-closed/rejected) return
  const activeReturn = returns.find(
    (r) => !['rejected', 'closed'].includes(r.status)
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href={`/account/orders/${orderId}`}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order
        </a>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl text-foreground sm:text-3xl">
            <RotateCcw className="h-7 w-7 text-foreground" />
            Request Return
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order {order.orderNumber}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Existing Return Status */}
            {activeReturn && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Active Return Request
                </h2>
                <ReturnStatusCard
                  returnRequest={activeReturn}
                  orderNumber={order.orderNumber}
                  defaultExpanded
                  onCancel={() => handleCancelReturn(activeReturn.id)}
                  isCancelling={isCancelling}
                />
              </div>
            )}

            {/* Eligibility Check (only show if no active return) */}
            {!activeReturn && (
              <ReturnEligibilityCheck
                isEligible={canRequestReturn}
                message={eligibilityMessage}
                daysRemaining={daysRemaining}
              />
            )}

            {/* Return Request Form (only if eligible and no active return) */}
            {canRequestReturn && !activeReturn && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Submit Return Request
                </h2>
                <div className="rounded-xl border border-border bg-card p-6">
                  <ReturnRequestForm
                    orderId={orderId}
                    onSuccess={handleReturnSuccess}
                  />
                </div>
              </div>
            )}

            {/* Previous Return Requests (closed/rejected) */}
            {returns.filter((r) => ['rejected', 'closed'].includes(r.status)).length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Previous Return Requests
                </h2>
                <div className="space-y-4">
                  {returns
                    .filter((r) => ['rejected', 'closed'].includes(r.status))
                    .map((returnRequest) => (
                      <ReturnStatusCard
                        key={returnRequest.id}
                        returnRequest={returnRequest}
                        orderNumber={order.orderNumber}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Return Policy */}
            <ReturnPolicyDisplay />

            {/* Help */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground">Need Help?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                If you have questions about our return policy or need assistance with your return, please contact our support team.
              </p>
              <a
                href="/contact"
                className="mt-3 inline-flex items-center text-sm font-medium text-foreground hover:text-foreground/60"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Skeleton Component
// ============================================================================

function ReturnPageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="mt-2 h-4 w-32 rounded bg-muted" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Eligibility */}
          <div className="h-24 rounded-xl border border-border bg-card" />
          {/* Form */}
          <div className="h-96 rounded-xl border border-border bg-card" />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="h-64 rounded-xl border border-border bg-card" />
          <div className="h-32 rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
  )
}

export default ReturnRequestPage
