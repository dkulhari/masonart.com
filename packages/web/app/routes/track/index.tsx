/**
 * Public Order Tracking Page - chobii.art E-commerce Platform
 *
 * Allows guests to track their orders without logging in.
 * Requires order number and email/phone for verification.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import {
  Package,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Truck,
  MapPin,
  ExternalLink,
  RefreshCw,
  Mail,
  Phone,
  Hash,
} from 'lucide-react'
import { cn, formatDate } from '~/lib/utils'
import { trackingApi, type GuestOrderLookupResponse, type ShipmentStatus } from '~/lib/api'
import { TrackingStatusBadge } from '~/components/order/TrackingStatusBadge'
import { TrackingTimeline } from '~/components/order/TrackingTimeline'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/track/')({
  validateSearch: (search: Record<string, unknown>) => ({
    orderNumber: (search.orderNumber as string) || '',
    email: (search.email as string) || '',
  }),
  head: () => ({
    meta: [
      { title: 'Track Your Order | chobii.art' },
      { name: 'description', content: 'Track your chobii.art order status and shipping progress.' },
    ],
  }),
  component: TrackOrderPage,
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

function TrackOrderPage() {
  const search = useSearch({ from: '/track/' })

  const [orderNumber, setOrderNumber] = useState(search.orderNumber || '')
  const [contactMethod, setContactMethod] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState(search.email || '')
  const [phone, setPhone] = useState('')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderData, setOrderData] = useState<GuestOrderLookupResponse | null>(null)

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!orderNumber.trim()) {
      setError('Please enter your order number')
      return
    }

    if (contactMethod === 'email' && !email.trim()) {
      setError('Please enter your email address')
      return
    }

    if (contactMethod === 'phone' && !phone.trim()) {
      setError('Please enter your phone number')
      return
    }

    setIsLoading(true)
    setError(null)
    setOrderData(null)

    try {
      const result = await trackingApi.lookup({
        orderNumber: orderNumber.trim(),
        email: contactMethod === 'email' ? email.trim() : undefined,
        phone: contactMethod === 'phone' ? phone.trim() : undefined,
      })
      setOrderData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up order')
    } finally {
      setIsLoading(false)
    }
  }, [orderNumber, contactMethod, email, phone])

  // Reset form
  const handleReset = useCallback(() => {
    setOrderData(null)
    setError(null)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <Package className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl text-foreground sm:text-3xl">
            Track Your Order
          </h1>
          <p className="mt-2 text-muted-foreground">
            Enter your order details to see the latest status and tracking information.
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          {/* Show lookup form or results */}
          {!orderData ? (
            <GuestOrderLookupForm
              orderNumber={orderNumber}
              setOrderNumber={setOrderNumber}
              contactMethod={contactMethod}
              setContactMethod={setContactMethod}
              email={email}
              setEmail={setEmail}
              phone={phone}
              setPhone={setPhone}
              isLoading={isLoading}
              error={error}
              onSubmit={handleSubmit}
            />
          ) : (
            <OrderTrackingResult
              order={orderData}
              onTrackAnother={handleReset}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Guest Order Lookup Form
// ============================================================================

interface GuestOrderLookupFormProps {
  orderNumber: string
  setOrderNumber: (value: string) => void
  contactMethod: 'email' | 'phone'
  setContactMethod: (value: 'email' | 'phone') => void
  email: string
  setEmail: (value: string) => void
  phone: string
  setPhone: (value: string) => void
  isLoading: boolean
  error: string | null
  onSubmit: (e: React.FormEvent) => void
}

function GuestOrderLookupForm({
  orderNumber,
  setOrderNumber,
  contactMethod,
  setContactMethod,
  email,
  setEmail,
  phone,
  setPhone,
  isLoading,
  error,
  onSubmit,
}: GuestOrderLookupFormProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Order Number */}
        <div>
          <label
            htmlFor="orderNumber"
            className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Hash className="h-4 w-4 text-muted-foreground" />
            Order Number
          </label>
          <input
            id="orderNumber"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="e.g., MA-2024-001234"
            className="h-12 w-full rounded-lg border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            You can find this in your order confirmation email.
          </p>
        </div>

        {/* Contact Method Toggle */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Verify with
          </label>
          <div className="flex rounded-lg border border-input p-1">
            <button
              type="button"
              onClick={() => setContactMethod('email')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                contactMethod === 'email'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              disabled={isLoading}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setContactMethod('phone')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                contactMethod === 'phone'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              disabled={isLoading}
            >
              <Phone className="h-4 w-4" />
              Phone
            </button>
          </div>
        </div>

        {/* Email Input */}
        {contactMethod === 'email' && (
          <div>
            <label
              htmlFor="email"
              className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-12 w-full rounded-lg border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Enter the email address used when placing the order.
            </p>
          </div>
        )}

        {/* Phone Input */}
        {contactMethod === 'phone' && (
          <div>
            <label
              htmlFor="phone"
              className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className="h-12 w-full rounded-lg border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Enter the phone number used when placing the order.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Unable to find order</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Looking up order...
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              Track Order
            </>
          )}
        </button>
      </form>

      {/* Help Text */}
      <div className="mt-6 rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Need help?</span>{' '}
          If you&apos;re having trouble tracking your order, please{' '}
          <a href="/contact" className="font-medium text-foreground hover:text-foreground/60">
            contact support
          </a>{' '}
          with your order details.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Order Tracking Result
// ============================================================================

interface OrderTrackingResultProps {
  order: GuestOrderLookupResponse
  onTrackAnother: () => void
}

function OrderTrackingResult({ order, onTrackAnother }: OrderTrackingResultProps) {
  const statusConfig = ORDER_STATUS_CONFIG[order.status as OrderStatus] || ORDER_STATUS_CONFIG.confirmed
  const StatusIcon = statusConfig.icon

  // Build timeline steps for the tracking timeline component
  const timelineSteps = buildTimelineSteps(order)

  return (
    <div className="space-y-6">
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
                  Order {order.orderNumber}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
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
              currentStatus={order.tracking?.status || order.status}
              steps={timelineSteps}
              estimatedDelivery={order.tracking?.estimatedDeliveryAt || null}
            />
          </div>

          {/* Shipping Info */}
          {order.tracking && (
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
                    {getCarrierDisplayName(order.tracking.carrier)}
                  </p>
                </div>
                {order.tracking.trackingNumber && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Tracking Number
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium text-foreground">
                      {order.tracking.trackingNumber}
                    </p>
                  </div>
                )}
              </div>

              {/* External Tracking Link */}
              {order.tracking.trackingUrl && (
                <a
                  href={order.tracking.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/85"
                >
                  Track on {getCarrierDisplayName(order.tracking.carrier)}
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {/* Delivery Location */}
          {order.shippingAddress?.city && (
            <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Delivery Location
              </h3>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  {order.shippingAddress.city}
                  {order.shippingAddress.state && `, ${order.shippingAddress.state}`}
                  {order.shippingAddress.postalCode && ` - ${order.shippingAddress.postalCode}`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Track Another Order */}
      <div className="text-center">
        <button
          onClick={onTrackAnother}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/60"
        >
          <Search className="h-4 w-4" />
          Track Another Order
        </button>
      </div>

      {/* Need Help */}
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
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

export default TrackOrderPage
