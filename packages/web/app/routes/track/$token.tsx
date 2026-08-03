/**
 * Token-Based Order Tracking Page - chobii.art E-commerce Platform
 *
 * Allows direct access to order tracking via a token link from confirmation emails.
 * No order number or email required - the token validates access.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Package,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Truck,
  MapPin,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react'
import { cn, formatDate } from '~/lib/utils'
import { trackingApi, type GuestOrderLookupResponse, type ShipmentStatus } from '~/lib/api'
import { TrackingTimeline } from '~/components/order/TrackingTimeline'

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
// Types
// ============================================================================

type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

interface StatusConfig {
  label: string
  icon: typeof Package
  color: string
  bgColor: string
}

// ============================================================================
// Status Configuration
// ============================================================================

const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  pending_payment: {
    label: 'Pending Payment',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  confirmed: {
    label: 'Confirmed',
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  processing: {
    label: 'Processing',
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  shipped: {
    label: 'Shipped',
    icon: Truck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    icon: MapPin,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  delivered: {
    label: 'Delivered',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  refunded: {
    label: 'Refunded',
    icon: RefreshCw,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

// Carrier display names
const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  usps: 'USPS',
  fedex: 'FedEx',
  ups: 'UPS',
  dhl: 'DHL',
  delhivery: 'Delhivery',
  bluedart: 'Blue Dart',
  dtdc: 'DTDC',
  shiprocket: 'Shiprocket',
  'india post': 'India Post',
}

function getCarrierDisplayName(carrier: string): string {
  return CARRIER_DISPLAY_NAMES[carrier.toLowerCase()] || carrier
}

// ============================================================================
// Main Component
// ============================================================================

function TokenTrackingPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
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

  const statusConfig = ORDER_STATUS_CONFIG[orderData.status as OrderStatus] || ORDER_STATUS_CONFIG.confirmed
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build timeline steps from order data
 */
function buildTimelineSteps(order: GuestOrderLookupResponse) {
  const steps = [
    {
      status: 'confirmed',
      label: 'Order Confirmed',
      completed: true,
      timestamp: order.timeline.orderedAt,
    },
    {
      status: 'processing',
      label: 'Processing',
      completed: ['processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(order.status),
      timestamp: null,
    },
    {
      status: 'shipped',
      label: 'Shipped',
      completed: !!order.timeline.shippedAt || ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(order.tracking?.status || ''),
      timestamp: order.timeline.shippedAt || order.tracking?.shippedAt || null,
    },
    {
      status: 'in_transit',
      label: 'In Transit',
      completed: ['in_transit', 'out_for_delivery', 'delivered'].includes(order.tracking?.status || ''),
      timestamp: null,
    },
    {
      status: 'out_for_delivery',
      label: 'Out for Delivery',
      completed: ['out_for_delivery', 'delivered'].includes(order.tracking?.status || ''),
      timestamp: null,
    },
    {
      status: 'delivered',
      label: 'Delivered',
      completed: !!order.timeline.deliveredAt || order.tracking?.status === 'delivered',
      timestamp: order.timeline.deliveredAt || order.tracking?.deliveredAt || null,
    },
  ]

  return steps
}

export default TokenTrackingPage
