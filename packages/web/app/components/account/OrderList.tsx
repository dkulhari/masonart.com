/**
 * OrderList Component
 *
 * Displays a list of user orders with status indicators, order details,
 * and navigation to order detail pages.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  ChevronRight,
  AlertCircle,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react'
import { cn, formatPrice, formatDate } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface OrderItem {
  id: string
  productTitle: string
  thumbnailUrl?: string
  sizeLabel?: string
  frameName?: string
  quantity: number
  unitPrice: number
  framePrice?: number
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  createdAt: string
  total: number
  subtotal: number
  shippingCost: number
  discountAmount?: number
  items?: OrderItem[]
  itemCount?: number
  shippingAddress?: {
    fullName: string
    city: string
    state: string
  }
  estimatedDelivery?: string
}

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface OrderListProps {
  /** List of orders to display */
  orders: Order[]
  /** Whether the list is loading */
  isLoading?: boolean
  /** Error message if any */
  error?: string | null
  /** Show compact version (less details) */
  compact?: boolean
  /** Maximum number of orders to show (for dashboard preview) */
  limit?: number
  /** Optional className */
  className?: string
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

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
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
    icon: AlertCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

// ============================================================================
// OrderList Component
// ============================================================================

/**
 * OrderList - Displays a list of user orders
 *
 * @example
 * <OrderList
 *   orders={orders}
 *   isLoading={isLoading}
 *   error={error}
 * />
 */
export function OrderList({
  orders,
  isLoading = false,
  error = null,
  compact = false,
  limit,
  className,
}: OrderListProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: limit || 3 }).map((_, i) => (
          <OrderCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 bg-red-50 p-6 text-center', className)}>
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg text-red-900">Unable to load orders</h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    )
  }

  // Empty state
  if (orders.length === 0) {
    return <EmptyOrdersState className={className} />
  }

  // Apply limit if specified
  const displayOrders = limit ? orders.slice(0, limit) : orders

  return (
    <div className={cn('space-y-4', className)}>
      {displayOrders.map((order) => (
        <OrderCard key={order.id} order={order} compact={compact} />
      ))}
    </div>
  )
}

// ============================================================================
// OrderCard Component
// ============================================================================

interface OrderCardProps {
  order: Order
  compact?: boolean
}

function OrderCard({ order, compact = false }: OrderCardProps) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed
  const StatusIcon = statusConfig.icon
  const itemCount = order.itemCount || order.items?.length || 0

  return (
    <a
      href={`/account/orders/${order.orderNumber}`}
      className={cn(
        'block rounded-xl border border-border bg-card transition-all hover:border-foreground/30 hover:shadow-md',
        compact ? 'p-4' : 'p-4 sm:p-6'
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Order</span>
            <span className="font-medium text-foreground">{order.orderNumber}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Placed on {formatDate(order.createdAt)}
          </p>
        </div>

        {/* Status Badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {statusConfig.label}
        </div>
      </div>

      {/* Order Items Preview */}
      {!compact && order.items && order.items.length > 0 && (
        <div className="mt-4 flex items-center gap-3 overflow-hidden">
          {/* Thumbnails */}
          <div className="flex -space-x-3">
            {order.items.slice(0, 4).map((item, idx) => (
              <div
                key={item.id}
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 border-background bg-muted"
                style={{ zIndex: 4 - idx }}
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.productTitle}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            ))}
            {order.items.length > 4 && (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-background bg-muted text-xs font-medium text-muted-foreground">
                +{order.items.length - 4}
              </div>
            )}
          </div>

          {/* Item Summary */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">
              {order.items?.[0]?.productTitle}
              {(order.items?.length ?? 0) > 1 && (
                <span className="text-muted-foreground">
                  {' '}
                  and {(order.items?.length ?? 1) - 1} more
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>
      )}

      {/* Compact item count */}
      {compact && (
        <p className="mt-2 text-sm text-muted-foreground">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-foreground">{formatPrice(order.total)}</p>
          {order.estimatedDelivery && order.status !== 'delivered' && order.status !== 'cancelled' && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Est. delivery: {order.estimatedDelivery}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm font-medium text-foreground">
          View Details
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </a>
  )
}

// ============================================================================
// OrderCardSkeleton Component
// ============================================================================

interface OrderCardSkeletonProps {
  compact?: boolean
}

export function OrderCardSkeleton({ compact = false }: OrderCardSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-border bg-card',
        compact ? 'p-4' : 'p-4 sm:p-6'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="mt-2 h-3 w-24 rounded bg-muted" />
        </div>
        <div className="h-6 w-24 rounded-full bg-muted" />
      </div>

      {/* Items */}
      {!compact && (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex -space-x-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-12 w-12 rounded-lg bg-muted"
                style={{ zIndex: 3 - idx }}
              />
            ))}
          </div>
          <div className="flex-1">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="mt-1 h-3 w-1/4 rounded bg-muted" />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div>
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="mt-1 h-3 w-24 rounded bg-muted" />
        </div>
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
    </div>
  )
}

// ============================================================================
// EmptyOrdersState Component
// ============================================================================

interface EmptyOrdersStateProps {
  className?: string
}

function EmptyOrdersState({ className }: EmptyOrdersStateProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-8 text-center', className)}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg text-foreground">No orders yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Start shopping to see your order history here.
      </p>
      <a
        href="/posters"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/85"
      >
        Browse Posters
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default OrderList
