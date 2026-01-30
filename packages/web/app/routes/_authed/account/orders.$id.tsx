/**
 * Order Detail Page - MasonArt E-commerce Platform
 *
 * Displays detailed information about a specific order including:
 * - Order summary and status
 * - Ordered items
 * - Shipping address
 * - Tracking information
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Package,
  Loader2,
  AlertCircle,
  MapPin,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  RefreshCw,
  FileText,
  Camera,
  Timer,
  ExternalLink,
} from 'lucide-react'
import { cn, formatPrice, formatDate } from '~/lib/utils'
import { authApi, ordersApi } from '~/lib/api'
import { OrderTrackingCard } from '~/components/order'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/_authed/account/orders/$id')({
  head: () => ({
    meta: [
      { title: 'Order Details | MasonArt' },
      { name: 'description', content: 'View your order details and tracking information.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OrderDetailPage,
})

// ============================================================================
// Types
// ============================================================================

interface OrderItem {
  id: string
  productId: string
  productTitle: string
  productSlug?: string
  thumbnailUrl?: string
  sizeLabel?: string
  frameName?: string
  quantity: number
  unitPrice: number
  framePrice?: number
  totalPrice: number
}

interface ShippingAddress {
  fullName: string
  phone: string
  addressLine1: string
  addressLine2?: string
  landmark?: string
  city: string
  state: string
  postalCode: string
  countryCode?: string
}

type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'

type ApprovalStatus = 'pending_upload' | 'pending_approval' | 'changes_requested' | 'approved' | 'expired'

interface OrderApproval {
  id: string
  orderItemId: string
  status: ApprovalStatus
  approvalToken: string
  deadlineAt?: string | null
  approvedAt?: string | null
  createdAt: string
}

interface OrderDetail {
  id: string
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  subtotal: number
  shippingCost: number
  taxAmount: number
  discountAmount: number
  total: number
  shippingAddress: ShippingAddress
  shippingMethod?: string
  customerNotes?: string
  estimatedDelivery?: string
  shippedAt?: string
  deliveredAt?: string
  approvals?: OrderApproval[]
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string
  icon: typeof Package
  color: string
  bgColor: string
}

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
    icon: Truck,
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
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  refunded: {
    label: 'Refunded',
    icon: CreditCard,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, StatusConfig> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  paid: {
    label: 'Paid',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  refunded: {
    label: 'Refunded',
    icon: CreditCard,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  partially_refunded: {
    label: 'Partial Refund',
    icon: CreditCard,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
}

const APPROVAL_STATUS_CONFIG: Record<ApprovalStatus, { label: string; color: string; bgColor: string }> = {
  pending_upload: {
    label: 'Awaiting Photos',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  pending_approval: {
    label: 'Ready for Review',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  changes_requested: {
    label: 'Changes Requested',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  expired: {
    label: 'Expired',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
}

// ============================================================================
// Approval Status Section
// ============================================================================

function ApprovalStatusSection({ approvals }: { approvals: OrderApproval[] }) {
  if (approvals.length === 0) return null

  // Compute overall status
  const getOverallStatus = (): ApprovalStatus => {
    const statusPriority: ApprovalStatus[] = [
      'expired',
      'changes_requested',
      'pending_upload',
      'pending_approval',
      'approved',
    ]

    for (const status of statusPriority) {
      if (approvals.some((a) => a.status === status)) {
        return status
      }
    }
    return 'pending_upload'
  }

  const overallStatus = getOverallStatus()
  const config = APPROVAL_STATUS_CONFIG[overallStatus]
  const pendingCount = approvals.filter(
    (a) => a.status !== 'approved' && a.status !== 'expired'
  ).length
  const approvedCount = approvals.filter((a) => a.status === 'approved').length
  const allApproved = approvedCount === approvals.length

  // Find first pending approval token
  const pendingApproval = approvals.find(
    (a) => a.status === 'pending_approval' || a.status === 'changes_requested'
  )

  // Get deadline info
  const getDeadlineText = () => {
    if (!pendingApproval?.deadlineAt) return null
    const deadline = new Date(pendingApproval.deadlineAt)
    const now = new Date()
    const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60))

    if (hoursRemaining <= 0) return 'Deadline passed'
    if (hoursRemaining <= 24) return `${Math.ceil(hoursRemaining)} hours remaining`
    return `${Math.ceil(hoursRemaining / 24)} days remaining`
  }

  const deadlineText = getDeadlineText()

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Camera className="h-5 w-5 text-brand-500" />
        Production Approval
      </h2>

      <div className="mt-4 space-y-3">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
              config.bgColor,
              config.color
            )}
          >
            {allApproved ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {config.label}
          </div>
        </div>

        {/* Progress */}
        {approvals.length > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Progress</span>
            <span className="text-sm text-foreground">
              {approvedCount} of {approvals.length} approved
            </span>
          </div>
        )}

        {/* Deadline */}
        {deadlineText && pendingCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Deadline</span>
            <span className={cn(
              'flex items-center gap-1 text-sm',
              deadlineText.includes('hours') ? 'text-red-600' : 'text-foreground'
            )}>
              <Timer className="h-3.5 w-3.5" />
              {deadlineText}
            </span>
          </div>
        )}

        {/* Action Button */}
        {pendingApproval && (
          <a
            href={`/approve/${pendingApproval.approvalToken}`}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <ExternalLink className="h-4 w-4" />
            Review & Approve Photos
          </a>
        )}

        {/* Approved Message */}
        {allApproved && (
          <p className="mt-2 text-sm text-green-600">
            All production photos have been approved. Your order is proceeding to shipping.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function OrderDetailPage() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const id = params.id

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const session = await authApi.getSession()
        if (!session?.user) {
          navigate({
            to: '/auth/login',
            search: { redirect: `/account/orders/${id}` },
          })
          return
        }
        setIsAuthenticated(true)
      } catch {
        navigate({
          to: '/auth/login',
          search: { redirect: `/account/orders/${id}` },
        })
      }
    }

    checkAuth()
  }, [navigate, id])

  // Fetch order
  const fetchOrder = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await ordersApi.getById(id)
      if (!data) {
        setError('Order not found')
        return
      }
      setOrder(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, id])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand-500 mx-auto mb-4" />
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
            href="/account/orders"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </a>
          <OrderDetailSkeleton />
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
              We couldn&apos;t load this order. Please try again.
            </p>
            <button
              onClick={() => fetchOrder()}
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

  const orderStatusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.confirmed
  const paymentStatusConfig = PAYMENT_STATUS_CONFIG[order.paymentStatus] || PAYMENT_STATUS_CONFIG.pending
  const OrderStatusIcon = orderStatusConfig.icon

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/account/orders"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </a>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                Order {order.orderNumber}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Placed on {formatDate(order.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Order Status Badge */}
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                  orderStatusConfig.bgColor,
                  orderStatusConfig.color
                )}
              >
                <OrderStatusIcon className="h-4 w-4" />
                {orderStatusConfig.label}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Order Tracking */}
            <OrderTrackingCard
              orderId={order.id}
              defaultExpanded
            />

            {/* Order Items */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Package className="h-5 w-5 text-brand-500" />
                  Items ({order.items.length})
                </h2>
              </div>
              <div className="divide-y divide-border">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-4 p-4">
                    {/* Thumbnail */}
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.productTitle}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    {/* Details */}
                    <div className="flex-1">
                      <a
                        href={`/posters/${item.productSlug || item.productId}`}
                        className="font-medium text-foreground hover:text-brand-600 hover:underline"
                      >
                        {item.productTitle}
                      </a>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.sizeLabel && <span>{item.sizeLabel}</span>}
                        {item.frameName && (
                          <>
                            <span>•</span>
                            <span>{item.frameName}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>Qty: {item.quantity}</span>
                      </div>
                    </div>
                    {/* Price */}
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {formatPrice(item.totalPrice)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(item.unitPrice)} each
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Production Approval Status */}
            {order.approvals && order.approvals.length > 0 && (
              <ApprovalStatusSection approvals={order.approvals} />
            )}

            {/* Order Summary */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="h-5 w-5 text-brand-500" />
                Order Summary
              </h2>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatPrice(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-foreground">
                    {order.shippingCost === 0 ? 'Free' : formatPrice(order.shippingCost)}
                  </span>
                </div>
                {order.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="text-foreground">{formatPrice(order.taxAmount)}</span>
                  </div>
                )}
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(order.discountAmount)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-base font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Payment</span>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      paymentStatusConfig.bgColor,
                      paymentStatusConfig.color
                    )}
                  >
                    {paymentStatusConfig.label}
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <MapPin className="h-5 w-5 text-brand-500" />
                Shipping Address
              </h2>
              <div className="mt-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{order.shippingAddress.fullName}</p>
                <p className="mt-1">{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && (
                  <p>{order.shippingAddress.addressLine2}</p>
                )}
                {order.shippingAddress.landmark && (
                  <p>Near: {order.shippingAddress.landmark}</p>
                )}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                  {order.shippingAddress.postalCode}
                </p>
                <p className="mt-1">{order.shippingAddress.phone}</p>
              </div>
            </div>

            {/* Customer Notes */}
            {order.customerNotes && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Order Notes</h2>
                <p className="mt-2 text-sm text-muted-foreground">{order.customerNotes}</p>
              </div>
            )}

            {/* Need Help */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground">Need Help?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                If you have questions about your order, please contact our support team.
              </p>
              <a
                href="/contact"
                className="mt-3 inline-flex items-center text-sm font-medium text-brand-600 hover:text-brand-700"
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

function OrderDetailSkeleton() {
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
          {/* Tracking Card */}
          <div className="h-48 rounded-xl border border-border bg-card" />
          {/* Items */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="h-6 w-32 rounded bg-muted" />
            </div>
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-4 border-b border-border p-4 last:border-0">
                <div className="h-20 w-20 rounded-lg bg-muted" />
                <div className="flex-1">
                  <div className="h-5 w-3/4 rounded bg-muted" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
                </div>
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="h-48 rounded-xl border border-border bg-card" />
          <div className="h-40 rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
  )
}

export default OrderDetailPage
