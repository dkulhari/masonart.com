/**
 * Payment Button Component - chobii.art E-commerce Platform
 *
 * Handles Razorpay checkout integration including:
 * - Order creation
 * - Payment initiation
 * - Razorpay checkout modal
 * - Payment verification
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect, useCallback } from 'react'
import { CreditCard, Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { ordersApi, type OrderInput } from '~/lib/api'
import { useCartActions } from '~/hooks/useCartActions'

// ============================================================================
// Types
// ============================================================================

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance
  }
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  notes?: Record<string, string>
  theme?: {
    color?: string
  }
  handler: (response: RazorpayResponse) => void
  modal?: {
    ondismiss?: () => void
    escape?: boolean
    animation?: boolean
  }
}

interface RazorpayInstance {
  open: () => void
  close: () => void
  on: (event: string, callback: () => void) => void
}

interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type PaymentStatus = 'idle' | 'creating_order' | 'initiating_payment' | 'processing' | 'verifying' | 'success' | 'error'

interface PaymentButtonProps {
  /** Order input data. Not needed when `existingOrderId` is given. */
  orderData?: OrderInput
  /**
   * Pay for an order that already exists, skipping creation.
   *
   * Used by the gift card flow, which builds its own order because a gift
   * card cannot go through the cart.
   */
  existingOrderId?: string
  /** Gift card codes to spend on this order. Debited at initiation. */
  giftCardCodes?: string[]
  /** Total amount to be paid */
  totalAmount: number
  /** Whether the payment button should be disabled */
  disabled?: boolean
  /** Customer phone number for Razorpay prefill */
  customerPhone?: string
  /** Callback when payment is successful */
  onSuccess: (orderId: string, orderNumber: string) => void
  /** Callback when payment fails or is cancelled */
  onError: (error: string) => void
  /** Additional className for styling */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
const COMPANY_NAME = 'chobii.art'
const THEME_COLOR = '#C89B5E' // brand-500 color

// ============================================================================
// Razorpay Script Loader
// ============================================================================

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if already loaded
    if (window.Razorpay) {
      resolve(true)
      return
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true))
      existingScript.addEventListener('error', () => resolve(false))
      return
    }

    // Load script
    const script = document.createElement('script')
    script.src = RAZORPAY_SCRIPT_URL
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

// ============================================================================
// Main Component
// ============================================================================

export function PaymentButton({
  orderData,
  existingOrderId,
  giftCardCodes,
  totalAmount,
  disabled = false,
  customerPhone,
  onSuccess,
  onError,
  className,
}: PaymentButtonProps) {
  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const { refreshCart, resetLocalCart } = useCartActions()

  /**
   * Take the server's word for what is still in the cart (#511).
   *
   * `ordersApi.create` empties the database cart before Razorpay's modal even
   * opens. Every way out of this flow other than a verified payment therefore
   * leaves the page promising a basket the server has already taken: the
   * customer dismisses the modal, the store still shows their items, and "Try
   * Again" calls `ordersApi.create` again and gets "Cart is empty" — for good,
   * against a cart the UI insists is full.
   *
   * Whether the cart should be consumed here or at verification is a bigger
   * question and is not answered here. This only stops the UI insisting.
   */
  const syncCartWithServer = useCallback(() => {
    void refreshCart()
  }, [refreshCart])

  // Load Razorpay script on mount
  useEffect(() => {
    loadRazorpayScript().then((loaded) => {
      setScriptLoaded(loaded)
      if (!loaded) {
        setErrorMessage('Failed to load payment gateway. Please refresh the page.')
      }
    })
  }, [])

  // Handle payment process
  const handlePayment = useCallback(async () => {
    if (!scriptLoaded) {
      onError('Payment gateway not loaded. Please refresh the page.')
      return
    }

    setErrorMessage(null)

    try {
      /**
       * Step 1: Create order in our system.
       *
       * Skipped when the order already exists. A gift card purchase creates
       * its own order — it cannot come from the cart, which needs a real
       * product and variant behind every line — and then reuses the rest of
       * this flow rather than growing a second Razorpay integration.
       */
      let resolvedOrderId = existingOrderId
      if (!resolvedOrderId) {
        setStatus('creating_order')
        const orderResponse = await ordersApi.create(orderData!)
        resolvedOrderId = orderResponse.order.id
      }
      // Definite from here on; the callbacks below close over it. A payment
      // with no order behind it is a bug worth failing loudly on rather than
      // sending an undefined id to Razorpay.
      if (!resolvedOrderId) {
        throw new Error('Could not determine which order to pay for')
      }
      const orderId: string = resolvedOrderId

      // Step 2: Initiate payment with Razorpay
      setStatus('initiating_payment')
      const paymentData = await ordersApi.initiatePayment(orderId, giftCardCodes)

      // Step 3: Open Razorpay checkout modal
      setStatus('processing')

      const razorpayOptions: RazorpayOptions = {
        key: paymentData.razorpayKeyId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        name: COMPANY_NAME,
        description: `Order #${paymentData.orderNumber}`,
        order_id: paymentData.razorpayOrderId,
        prefill: {
          name: paymentData.prefill.name || orderData?.shippingAddress.fullName,
          email: paymentData.prefill.email,
          contact: customerPhone || orderData?.shippingAddress.phone,
        },
        notes: {
          orderNumber: paymentData.orderNumber,
          orderId: orderId,
        },
        theme: {
          color: THEME_COLOR,
        },
        handler: async (response: RazorpayResponse) => {
          // Step 4: Verify payment
          try {
            setStatus('verifying')
            const verifyResult = await ordersApi.verifyPayment(orderId, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })

            if (verifyResult.success) {
              setStatus('success')
              // The order has already consumed these lines server-side
              // (routes/orders.ts); this only needs to catch up the local
              // projection, not send a DELETE that could take out anything
              // added since.
              resetLocalCart()
              onSuccess(verifyResult.order.id, verifyResult.order.orderNumber)
            } else {
              throw new Error('Payment verification failed')
            }
          } catch (verifyError) {
            setStatus('error')
            const errorMsg = verifyError instanceof Error ? verifyError.message : 'Payment verification failed'
            setErrorMessage(errorMsg)
            syncCartWithServer()
            onError(errorMsg)
          }
        },
        modal: {
          ondismiss: () => {
            setStatus('idle')
            setErrorMessage('Payment was cancelled')
            syncCartWithServer()
          },
          escape: true,
          animation: true,
        },
      }

      const razorpay = new window.Razorpay(razorpayOptions)
      razorpay.on('payment.failed', () => {
        setStatus('error')
        setErrorMessage('Payment failed. Please try again.')
        syncCartWithServer()
        onError('Payment failed. Please try again.')
      })

      razorpay.open()
    } catch (error) {
      setStatus('error')
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred'
      setErrorMessage(errorMsg)
      // Order creation may well have succeeded and emptied the cart before
      // whatever came next failed.
      syncCartWithServer()
      onError(errorMsg)
    }
  }, [
    scriptLoaded,
    orderData,
    existingOrderId,
    giftCardCodes,
    customerPhone,
    onSuccess,
    onError,
    resetLocalCart,
    syncCartWithServer,
  ])

  // Get button text based on status
  const getButtonText = () => {
    switch (status) {
      case 'creating_order':
        return 'Creating Order...'
      case 'initiating_payment':
        return 'Initiating Payment...'
      case 'processing':
        return 'Processing...'
      case 'verifying':
        return 'Verifying Payment...'
      case 'success':
        return 'Payment Successful!'
      case 'error':
        return 'Try Again'
      default:
        return `Pay ${formatPrice(totalAmount)}`
    }
  }

  // Check if button should be in loading state
  const isLoading = ['creating_order', 'initiating_payment', 'processing', 'verifying'].includes(status)
  const isDisabled = disabled || isLoading || !scriptLoaded || status === 'success'

  return (
    <div className={cn('space-y-4', className)}>
      {/* Error Message */}
      {errorMessage && status === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Payment Button */}
      <button
        type="button"
        onClick={handlePayment}
        disabled={isDisabled}
        className={cn(
          'flex w-full items-center justify-center gap-3 rounded-lg px-6 py-4 text-base font-semibold transition-all',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          status === 'success'
            ? 'bg-green-500 text-white'
            : isDisabled
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/85 active:scale-[0.98]'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : status === 'success' ? (
          <ShieldCheck className="h-5 w-5" />
        ) : (
          <CreditCard className="h-5 w-5" />
        )}
        {getButtonText()}
      </button>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Secured by Razorpay. Your payment information is encrypted.</span>
      </div>

      {/* Accepted Payment Methods */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {['UPI', 'Cards', 'Net Banking', 'Wallets'].map((method) => (
          <span
            key={method}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
          >
            {method}
          </span>
        ))}
      </div>
    </div>
  )
}

export default PaymentButton
