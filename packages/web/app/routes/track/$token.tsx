/**
 * Token-Based Order Tracking Page - chobii.art E-commerce Platform
 *
 * Allows direct access to order tracking via a token link from confirmation emails.
 * No order number or email required - the token validates access.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Loader2,
  AlertCircle,
  MapPin,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { trackingApi, type GuestOrderLookupResponse } from '~/lib/api'
import { TrackingTimeline } from '~/components/order/TrackingTimeline'
import {
  getOrderStatusConfig,
  getCarrierDisplayName,
  buildTimelineSteps,
} from '~/lib/orderTracking'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/track/$token')({
  head: () => ({
    meta: [
      { title: 'Track Your Order | chobii.art' },
      { name: 'description', content: 'Track your chobii.art order status and shipping progress.' },
      { name: 'robots', content: 'noindex' }, // Don't index token URLs
    ],
  }),
  component: TokenTrackingPage,
})

// ============================================================================
// Main Component
// ============================================================================

function TokenTrackingPage() {
  const params = Route.useParams()
  const token = params.token

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orderData, setOrderData] = useState<GuestOrderLookupResponse | null>(null)

  // Fetch order data on mount
  const fetchOrder = useCallback(async () => {
    if (!token) {
      setError('Invalid tracking link')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await trackingApi.lookupByToken(token)
      setOrderData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order tracking')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-foreground" />
              <p className="mt-4 text-muted-foreground">Loading your order...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
              <h2 className="mt-4 text-lg font-semibold text-red-900">
                Unable to Load Order
              </h2>
              <p className="mt-2 text-sm text-red-700">
                {error || 'This tracking link may have expired or is invalid.'}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => fetchOrder()}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </button>
                <a
                  href="/track"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  Track with Order Number
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const statusConfig = getOrderStatusConfig(orderData.status)
  const StatusIcon = statusConfig.icon

  // Build timeline steps
  const timelineSteps = buildTimelineSteps(orderData)

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/track"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Track Another Order
        </a>

        <div className="mx-auto max-w-2xl">
          {/* Order Header Card */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {/* Status Banner */}
            <div className={cn('px-6 py-4', statusConfig.bgColor)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/50">
                    <StatusIcon className={cn('h-5 w-5', statusConfig.color)} />
                  </div>
                  <div>
                    <p className={cn('font-semibold', statusConfig.color)}>
                      {statusConfig.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Order {orderData.orderNumber}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {orderData.itemCount} {orderData.itemCount === 1 ? 'item' : 'items'}
                </p>
              </div>
            </div>

            {/* Order Details */}
            <div className="p-6">
              {/* Timeline */}
              <div className="mb-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Order Progress
                </h3>
                <TrackingTimeline
                  currentStatus={orderData.tracking?.status || orderData.status}
                  steps={timelineSteps}
                  estimatedDelivery={orderData.tracking?.estimatedDeliveryAt || null}
                />
              </div>

              {/* Shipping Info */}
              {orderData.tracking && (
                <div className="border-t border-border pt-6">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Shipping Details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Carrier
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {getCarrierDisplayName(orderData.tracking.carrier)}
                      </p>
                    </div>
                    {orderData.tracking.trackingNumber && (
                      <div className="rounded-lg bg-muted/50 p-4">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Tracking Number
                        </p>
                        <p className="mt-1 font-mono text-sm font-medium text-foreground">
                          {orderData.tracking.trackingNumber}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* External Tracking Link */}
                  {orderData.tracking.trackingUrl && (
                    <a
                      href={orderData.tracking.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/85"
                    >
                      Track on {getCarrierDisplayName(orderData.tracking.carrier)}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}

              {/* Delivery Location */}
              {orderData.shippingAddress?.city && (
                <div className="mt-6 border-t border-border pt-6">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Delivery Location
                  </h3>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-foreground">
                      {orderData.shippingAddress.city}
                      {orderData.shippingAddress.state && `, ${orderData.shippingAddress.state}`}
                      {orderData.shippingAddress.postalCode && ` - ${orderData.shippingAddress.postalCode}`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Refresh Button */}
          <div className="mt-6 text-center">
            <button
              onClick={() => fetchOrder()}
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/60"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </button>
          </div>

          {/* Need Help */}
          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <h3 className="text-sm font-semibold text-foreground">Need Help?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              If you have questions about your order, please contact our support team.
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
  )
}

export default TokenTrackingPage
