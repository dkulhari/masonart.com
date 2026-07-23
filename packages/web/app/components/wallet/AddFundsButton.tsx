/**
 * Add Funds Button Component - chobi.art E-commerce Platform
 *
 * Handles Razorpay wallet top-up integration including:
 * - Top-up order creation
 * - Payment initiation
 * - Razorpay checkout modal
 * - Payment verification & balance update
 *
 * Following patterns from PaymentButton.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { Wallet, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { walletApi } from '~/lib/api'

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

type TopUpStatus = 'idle' | 'creating_order' | 'processing' | 'verifying' | 'success' | 'error'

interface AddFundsButtonProps {
  /** Amount to add in paise */
  amountPaise: number
  /** Display label (optional, defaults to formatted amount) */
  label?: string
  /** Whether the button should be disabled */
  disabled?: boolean
  /** User details for Razorpay prefill */
  userDetails?: {
    name?: string
    email?: string
    phone?: string
  }
  /** Callback when payment is successful */
  onSuccess?: (newBalance: number, transactionId: string) => void
  /** Callback when payment fails or is cancelled */
  onError?: (error: string) => void
  /** Additional className for styling */
  className?: string
  /** Button variant */
  variant?: 'default' | 'outline' | 'compact'
  /** Show icon */
  showIcon?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
const COMPANY_NAME = 'chobi.art'
const THEME_COLOR = '#10B981' // emerald-500 for wallet

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

export function AddFundsButton({
  amountPaise,
  label,
  disabled = false,
  userDetails,
  onSuccess,
  onError,
  className,
  variant = 'default',
  showIcon = true,
}: AddFundsButtonProps) {
  const [status, setStatus] = useState<TopUpStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  // Load Razorpay script on mount
  useEffect(() => {
    loadRazorpayScript().then((loaded) => {
      setScriptLoaded(loaded)
      if (!loaded) {
        setErrorMessage('Failed to load payment gateway. Please refresh the page.')
      }
    })
  }, [])

  // Handle top-up process
  const handleTopUp = useCallback(async () => {
    if (!scriptLoaded) {
      onError?.('Payment gateway not loaded. Please refresh the page.')
      return
    }

    setErrorMessage(null)

    try {
      // Step 1: Create top-up order
      setStatus('creating_order')
      const topUpResponse = await walletApi.createTopUp(amountPaise)

      // Step 2: Open Razorpay checkout modal
      setStatus('processing')

      const razorpayOptions: RazorpayOptions = {
        key: topUpResponse.keyId,
        amount: topUpResponse.amount.paise,
        currency: topUpResponse.currency,
        name: COMPANY_NAME,
        description: 'Wallet Top-up',
        order_id: topUpResponse.orderId,
        prefill: {
          name: userDetails?.name || topUpResponse.prefill?.name,
          email: userDetails?.email || topUpResponse.prefill?.email,
          contact: userDetails?.phone || topUpResponse.prefill?.contact,
        },
        notes: {
          ...topUpResponse.notes,
          purpose: 'wallet_topup',
        },
        theme: {
          color: THEME_COLOR,
        },
        handler: async (response: RazorpayResponse) => {
          // Step 3: Verify payment
          try {
            setStatus('verifying')
            const verifyResult = await walletApi.verifyTopUp({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })

            // Success if we get a transaction back
            if (verifyResult.transaction) {
              setStatus('success')
              onSuccess?.(verifyResult.balance.paise, verifyResult.transaction.id)
              // Reset to idle after showing success briefly
              setTimeout(() => setStatus('idle'), 2000)
            } else {
              throw new Error('Payment verification failed')
            }
          } catch (verifyError) {
            setStatus('error')
            const errorMsg = verifyError instanceof Error ? verifyError.message : 'Payment verification failed'
            setErrorMessage(errorMsg)
            onError?.(errorMsg)
          }
        },
        modal: {
          ondismiss: () => {
            setStatus('idle')
            setErrorMessage('Payment was cancelled')
          },
          escape: true,
          animation: true,
        },
      }

      const razorpay = new window.Razorpay(razorpayOptions)
      razorpay.on('payment.failed', () => {
        setStatus('error')
        setErrorMessage('Payment failed. Please try again.')
        onError?.('Payment failed. Please try again.')
      })

      razorpay.open()
    } catch (error) {
      setStatus('error')
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred'
      setErrorMessage(errorMsg)
      onError?.(errorMsg)
    }
  }, [scriptLoaded, amountPaise, userDetails, onSuccess, onError])

  // Get button text based on status
  const getButtonText = () => {
    switch (status) {
      case 'creating_order':
        return 'Processing...'
      case 'processing':
        return 'Opening Payment...'
      case 'verifying':
        return 'Verifying...'
      case 'success':
        return 'Added!'
      case 'error':
        return 'Try Again'
      default:
        return label || `Add ${formatPrice(amountPaise)}`
    }
  }

  // Check if button should be in loading state
  const isLoading = ['creating_order', 'processing', 'verifying'].includes(status)
  const isDisabled = disabled || isLoading || !scriptLoaded

  // Button styles based on variant
  const buttonStyles = {
    default: cn(
      'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
      'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
      status === 'success'
        ? 'bg-emerald-500 text-white'
        : isDisabled
          ? 'cursor-not-allowed bg-muted text-muted-foreground'
          : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]'
    ),
    outline: cn(
      'flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all',
      'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
      status === 'success'
        ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
        : isDisabled
          ? 'cursor-not-allowed border-muted bg-muted/50 text-muted-foreground'
          : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50 active:scale-[0.98]'
    ),
    compact: cn(
      'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
      'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1',
      status === 'success'
        ? 'bg-emerald-500 text-white'
        : isDisabled
          ? 'cursor-not-allowed bg-muted text-muted-foreground'
          : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]'
    ),
  }

  // Icon component based on status
  const IconComponent = () => {
    if (isLoading) return <Loader2 className={cn('animate-spin', variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4')} />
    if (status === 'success') return <CheckCircle className={variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4'} />
    if (status === 'error') return <AlertCircle className={variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4'} />
    return <Wallet className={variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4'} />
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleTopUp}
        disabled={isDisabled}
        className={buttonStyles[variant]}
      >
        {showIcon && <IconComponent />}
        {getButtonText()}
      </button>

      {/* Error tooltip */}
      {errorMessage && status === 'error' && variant !== 'compact' && (
        <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {errorMessage}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Quick Top-up Buttons Component
// ============================================================================

interface QuickTopUpButtonsProps {
  /** User details for Razorpay prefill */
  userDetails?: {
    name?: string
    email?: string
    phone?: string
  }
  /** Callback when payment is successful */
  onSuccess?: (newBalance: number, transactionId: string) => void
  /** Callback when payment fails */
  onError?: (error: string) => void
  /** Additional className */
  className?: string
}

const QUICK_AMOUNTS = [
  { paise: 10000, label: '₹100' },
  { paise: 20000, label: '₹200' },
  { paise: 50000, label: '₹500' },
  { paise: 100000, label: '₹1,000' },
]

export function QuickTopUpButtons({
  userDetails,
  onSuccess,
  onError,
  className,
}: QuickTopUpButtonsProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
      {QUICK_AMOUNTS.map((amount) => (
        <AddFundsButton
          key={amount.paise}
          amountPaise={amount.paise}
          label={amount.label}
          userDetails={userDetails}
          onSuccess={onSuccess}
          onError={onError}
          variant="outline"
          showIcon={false}
        />
      ))}
    </div>
  )
}

export default AddFundsButton
