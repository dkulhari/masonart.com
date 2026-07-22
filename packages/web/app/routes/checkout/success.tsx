/**
 * Order Confirmation (Success) Page - chobi.art E-commerce Platform
 *
 * Displays order confirmation after successful payment completion.
 * Shows order summary, shipping details, and next steps.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import {
  CheckCircle,
  Package,
  Truck,
  Mail,
  Clock,
  ArrowRight,
  ShoppingBag,
  User,
  Copy,
  Check,
  MapPin,
  CreditCard,
  Receipt,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { ordersApi } from '~/lib/api'

// ============================================================================
// Route Definition
// ============================================================================

const searchSchema = z.object({
  orderNumber: z.string().optional(),
  orderId: z.string().optional(),
})

export const Route = createFileRoute('/checkout/success')({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: 'Order Confirmed | chobi.art' },
      {
        name: 'description',
        content: 'Your order has been placed successfully. Thank you for shopping with chobi.art.',
      },
      { name: 'robots', content: 'noindex' }, // Don't index success pages
    ],
  }),
  component: OrderSuccessPage,
})

// ============================================================================
// Types
// ============================================================================

interface OrderDetails {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  total: number
  subtotal: number
  shippingCost: number
  discountAmount?: number
  customerNotes?: string
  shippingAddress?: {
    fullName: string
    phone: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    postalCode: string
  }
  shippingMethod?: string
  estimatedDelivery?: string
  items?: Array<{
    id: string
    productTitle: string
    thumbnailUrl?: string
    sizeLabel?: string
    frameName?: string
    quantity: number
    unitPrice: number
    framePrice?: number
  }>
  payment?: {
    method?: string
    status?: string
  }
  userEmail?: string
}

// ============================================================================
// Main Component
// ============================================================================

function OrderSuccessPage() {
  const search = useSearch({ from: '/checkout/success' })
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch order details
  useEffect(() => {
    async function fetchOrder() {
      const identifier = search.orderNumber || search.orderId
      if (!identifier) {
        setIsLoading(false)
        return
      }

      try {
        const response = await ordersApi.getById(identifier)
        if (response) {
          setOrder(response.order || response)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order details')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [search.orderNumber, search.orderId])

  // Copy order number to clipboard
  const handleCopyOrderNumber = async () => {
    if (!order?.orderNumber) return
    try {
      await navigator.clipboard.writeText(order.orderNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your order details...</p>
        </div>
      </div>
    )
  }

  // No order identifier provided
  if (!search.orderNumber && !search.orderId) {
    return <GenericSuccessState />
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-16">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground">Unable to Load Order</h1>
            <p className="mb-8 text-muted-foreground">{error}</p>
            <a
              href="/account/orders"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              View All Orders
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Order not found
  if (!order) {
    return <GenericSuccessState />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Success Header */}
        <div className="mx-auto max-w-3xl">
          <SuccessHeader
            orderNumber={order.orderNumber}
            userEmail={order.userEmail}
            onCopy={handleCopyOrderNumber}
            copied={copied}
          />

          {/* Order Details */}
          <div className="mt-8 space-y-6">
            {/* Order Items */}
            {order.items && order.items.length > 0 && (
              <OrderItemsSection items={order.items} />
            )}

            {/* Shipping & Payment Info */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Shipping Address */}
              {order.shippingAddress && (
                <ShippingSection
                  address={order.shippingAddress}
                  method={order.shippingMethod}
                  estimatedDelivery={order.estimatedDelivery}
                />
              )}

              {/* Order Summary */}
              <OrderSummarySection
                subtotal={order.subtotal}
                shippingCost={order.shippingCost}
                discountAmount={order.discountAmount}
                total={order.total}
                paymentStatus={order.payment?.status}
              />
            </div>

            {/* What's Next */}
            <WhatNextSection />

            {/* Action Buttons */}
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:justify-center">
              <a
                href="/posters"
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <ShoppingBag className="h-4 w-4" />
                Continue Shopping
              </a>
              <a
                href="/account/orders"
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                <User className="h-4 w-4" />
                View All Orders
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Success Header Component
// ============================================================================

interface SuccessHeaderProps {
  orderNumber: string
  userEmail?: string
  onCopy: () => void
  copied: boolean
}

function SuccessHeader({ orderNumber, userEmail, onCopy, copied }: SuccessHeaderProps) {
  return (
    <div className="text-center">
      {/* Success Icon */}
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100 animate-in zoom-in-50 duration-300">
        <CheckCircle className="h-12 w-12 text-green-600" />
      </div>

      {/* Title */}
      <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
        Order Confirmed!
      </h1>

      <p className="mb-4 text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        Thank you for your purchase. Your order has been placed successfully.
      </p>

      {/* Order Number */}
      <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
        <Receipt className="h-5 w-5 text-brand-500" />
        <div className="text-left">
          <p className="text-xs text-muted-foreground">Order Number</p>
          <p className="text-lg font-semibold text-foreground">{orderNumber}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            'ml-2 rounded-lg p-2 transition-colors',
            copied
              ? 'bg-green-100 text-green-600'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          )}
          title={copied ? 'Copied!' : 'Copy order number'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {/* Email Confirmation Notice */}
      {userEmail && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
          <Mail className="h-4 w-4" />
          Confirmation email sent to <span className="font-medium text-foreground">{userEmail}</span>
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Order Items Section
// ============================================================================

interface OrderItem {
  id: string
  productTitle: string
  thumbnailUrl?: string
  sizeLabel?: string
  frameName?: string
  quantity: number
  unitPrice: number
  framePrice?: number
}

interface OrderItemsSectionProps {
  items: OrderItem[]
}

function OrderItemsSection({ items }: OrderItemsSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Package className="h-5 w-5 text-brand-500" />
          Order Items ({items.length})
        </h2>
      </div>

      <div className="divide-y divide-border">
        {items.map((item) => {
          const itemTotal = (item.unitPrice + (item.framePrice || 0)) * item.quantity
          return (
            <div key={item.id} className="flex gap-4 p-4">
              {/* Thumbnail */}
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
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
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h4 className="text-sm font-medium text-foreground line-clamp-1">
                    {item.productTitle}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {item.sizeLabel}
                    {item.frameName && ` • ${item.frameName}`}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatPrice(itemTotal)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Shipping Section
// ============================================================================

interface ShippingSectionProps {
  address: {
    fullName: string
    phone: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    postalCode: string
  }
  method?: string
  estimatedDelivery?: string
}

function ShippingSection({ address, method, estimatedDelivery }: ShippingSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <MapPin className="h-5 w-5 text-brand-500" />
          Shipping Details
        </h2>
      </div>

      <div className="p-6 space-y-4">
        {/* Address */}
        <div>
          <p className="text-sm font-medium text-foreground">{address.fullName}</p>
          <p className="text-sm text-muted-foreground">{address.addressLine1}</p>
          {address.addressLine2 && (
            <p className="text-sm text-muted-foreground">{address.addressLine2}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {address.city}, {address.state} - {address.postalCode}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{address.phone}</p>
        </div>

        {/* Delivery Method */}
        {method && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
            <Truck className="h-4 w-4 text-brand-500" />
            <div>
              <p className="text-sm font-medium text-foreground capitalize">{method} Delivery</p>
              {estimatedDelivery && (
                <p className="text-xs text-muted-foreground">Est. delivery: {estimatedDelivery}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Order Summary Section
// ============================================================================

interface OrderSummarySectionProps {
  subtotal: number
  shippingCost: number
  discountAmount?: number
  total: number
  paymentStatus?: string
}

function OrderSummarySection({
  subtotal,
  shippingCost,
  discountAmount,
  total,
  paymentStatus,
}: OrderSummarySectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CreditCard className="h-5 w-5 text-brand-500" />
          Payment Summary
        </h2>
      </div>

      <div className="p-6 space-y-3">
        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-foreground">{formatPrice(subtotal)}</span>
        </div>

        {/* Discount */}
        {discountAmount && discountAmount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-{formatPrice(discountAmount)}</span>
          </div>
        )}

        {/* Shipping */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          <span className={shippingCost === 0 ? 'text-green-600' : 'text-foreground'}>
            {shippingCost === 0 ? 'FREE' : formatPrice(shippingCost)}
          </span>
        </div>

        {/* Total */}
        <div className="flex justify-between border-t border-border pt-3">
          <span className="text-base font-semibold text-foreground">Total Paid</span>
          <span className="text-lg font-bold text-foreground">{formatPrice(total)}</span>
        </div>

        {/* Payment Status Badge */}
        {paymentStatus && (
          <div className="flex items-center justify-end gap-2 pt-2">
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" />
              Payment {paymentStatus === 'captured' ? 'Complete' : paymentStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// What's Next Section
// ============================================================================

function WhatNextSection() {
  const steps = [
    {
      icon: Mail,
      title: 'Confirmation Email',
      description: "You'll receive an email with your order details and receipt.",
    },
    {
      icon: Package,
      title: 'Order Processing',
      description: 'Our team will prepare your order with care and attention to detail.',
    },
    {
      icon: Truck,
      title: 'Shipping Updates',
      description: "We'll send you tracking information once your order ships.",
    },
    {
      icon: Clock,
      title: 'Delivery',
      description: 'Your beautiful artwork will arrive at your doorstep.',
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">What Happens Next?</h2>
      </div>

      <div className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="flex items-start gap-3 rounded-lg bg-muted/30 p-4"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                <step.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-medium text-white">
                    {index + 1}
                  </span>
                  <h3 className="text-sm font-medium text-foreground">{step.title}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Generic Success State (when no order number provided)
// ============================================================================

function GenericSuccessState() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-16">
        <div className="mx-auto max-w-md text-center">
          {/* Success Icon */}
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>

          {/* Title */}
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Order Confirmed!
          </h1>

          <p className="mb-8 text-muted-foreground">
            Thank you for your purchase. Your order has been placed successfully.
            You will receive a confirmation email shortly.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <a
              href="/posters"
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ShoppingBag className="h-4 w-4" />
              Continue Shopping
            </a>
            <a
              href="/account/orders"
              className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <User className="h-4 w-4" />
              View Orders
            </a>
          </div>

          {/* Help Text */}
          <p className="mt-8 text-sm text-muted-foreground">
            Need help?{' '}
            <a href="/contact" className="text-brand-600 hover:text-brand-700 font-medium">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
