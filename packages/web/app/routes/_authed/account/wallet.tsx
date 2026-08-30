/**
 * Wallet Page - chobii.art E-commerce Platform
 *
 * Wallet management page for adding funds and viewing transaction history.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCcw,
  Gift,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn, formatDate } from '~/lib/utils'
import {
  walletApi,
  type WalletBalance,
  type WalletTransaction,
} from '~/lib/api'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/_authed/account/wallet')({
  head: () => ({
    meta: [
      { title: 'My Wallet | chobii.art' },
      {
        name: 'description',
        content: 'Add funds to your chobii.art wallet for AI art generation.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: WalletPage,
})

// ============================================================================
// Razorpay Types
// ============================================================================

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: {
    name?: string
    email?: string
    contact?: string
  }
  notes: Record<string, string>
  theme: {
    color: string
  }
  handler: (response: RazorpayResponse) => void
  modal: {
    ondismiss: () => void
  }
}

interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

// Note: Window.Razorpay type is declared in AddFundsButton.tsx

// ============================================================================
// Main Component
// ============================================================================

function WalletPage() {
  const [walletData, setWalletData] = useState<WalletBalance | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  // Fetch wallet data
  const fetchWalletData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await walletApi.getBalance()
      setWalletData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch transactions
  const fetchTransactions = useCallback(async (pageNum: number) => {
    try {
      setIsLoadingTransactions(true)
      const response = await walletApi.getTransactions({
        page: pageNum,
        pageSize: 10,
      })
      setTransactions(response.items)
      setTotalPages(response.totalPages)
      setPage(pageNum)
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
    } finally {
      setIsLoadingTransactions(false)
    }
  }, [])

  useEffect(() => {
    fetchWalletData()
    fetchTransactions(1)
  }, [fetchWalletData, fetchTransactions])

  // Handle top-up
  const handleTopUp = async (amountPaise: number) => {
    if (!walletData?.isPaymentConfigured) {
      setError('Payment gateway is not configured')
      return
    }

    try {
      setIsProcessingPayment(true)
      setError(null)

      // Create top-up order
      const order = await walletApi.createTopUp(amountPaise)

      // Open Razorpay checkout
      const options: RazorpayOptions = {
        key: order.keyId,
        amount: order.amount.paise,
        currency: order.currency,
        name: 'chobii.art',
        description: 'Wallet Top-up',
        order_id: order.orderId,
        prefill: {
          name: order.prefill.name,
          email: order.prefill.email,
          contact: order.prefill.contact,
        },
        notes: order.notes,
        theme: {
          color: '#0F766E', // brand-600
        },
        handler: async (response: RazorpayResponse) => {
          try {
            // Verify payment
            await walletApi.verifyTopUp({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })

            // Refresh wallet data
            await fetchWalletData()
            await fetchTransactions(1)
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Payment verification failed'
            )
          } finally {
            setIsProcessingPayment(false)
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false)
          },
        },
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate payment')
      setIsProcessingPayment(false)
    }
  }

  // Handle custom amount top-up
  const handleCustomTopUp = () => {
    const amount = parseFloat(customAmount)
    if (isNaN(amount) || amount < 100) {
      setError('Minimum top-up amount is Rs 100')
      return
    }
    if (amount > 100000) {
      setError('Maximum top-up amount is Rs 1,00,000')
      return
    }
    handleTopUp(Math.round(amount * 100)) // Convert to paise
    setCustomAmount('')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="h-48 rounded-xl bg-muted" />
            <div className="h-64 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <a
            href="/account"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Account
          </a>
          <h1 className="text-2xl text-foreground sm:text-3xl">
            My Wallet
          </h1>
          <p className="mt-2 text-muted-foreground">
            Add funds to generate AI art
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Balance Card */}
            <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-50 to-teal-50 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Available Balance
                  </p>
                  <p className="mt-1 text-4xl font-medium text-foreground">
                    {walletData?.balance.formatted || '₹0.00'}
                  </p>
                </div>
                <div className="rounded-full bg-emerald-100 p-3">
                  <Wallet className="h-6 w-6 text-emerald-600" />
                </div>
              </div>

              {/* Free Generations Badge */}
              {walletData && walletData.freeGenerationsRemaining > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1.5">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">
                    {walletData.freeGenerationsRemaining} free generation
                    {walletData.freeGenerationsRemaining !== 1 ? 's' : ''}{' '}
                    remaining
                  </span>
                </div>
              )}
            </div>

            {/* Quick Top-up */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-lg text-foreground">
                Add Funds
              </h2>

              {/* Preset Amounts */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {walletData?.topUpPresets.map((preset) => (
                  <button
                    key={preset.amountPaise}
                    type="button"
                    onClick={() => handleTopUp(preset.amountPaise)}
                    disabled={isProcessingPayment}
                    className="rounded-lg border border-border bg-background px-4 py-3 text-center font-medium text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Amount */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Enter amount"
                    min="100"
                    max="100000"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCustomTopUp}
                  disabled={isProcessingPayment || !customAmount}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" />
                  Add
                </button>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Minimum: ₹100 | Maximum: ₹1,00,000
              </p>
            </div>

            {/* Transaction History */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-lg text-foreground">
                  Transaction History
                </h2>
                <button
                  type="button"
                  onClick={() => fetchTransactions(page)}
                  disabled={isLoadingTransactions}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  <RefreshCcw
                    className={cn('h-4 w-4', isLoadingTransactions && 'animate-spin')}
                  />
                </button>
              </div>

              <div className="divide-y divide-border">
                {isLoadingTransactions ? (
                  <div className="p-6">
                    <div className="animate-pulse space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-muted" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 rounded bg-muted" />
                            <div className="h-3 w-24 rounded bg-muted" />
                          </div>
                          <div className="h-4 w-16 rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-muted-foreground">No transactions yet</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <TransactionRow key={tx.id} transaction={tx} />
                  ))
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-6 py-4">
                  <button
                    type="button"
                    onClick={() => fetchTransactions(page - 1)}
                    disabled={page === 1 || isLoadingTransactions}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchTransactions(page + 1)}
                    disabled={page === totalPages || isLoadingTransactions}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats Card */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-base text-foreground">
                Wallet Stats
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total Added
                  </span>
                  <span className="font-medium text-emerald-600">
                    +₹{walletData?.stats.totalTopUpsRupees.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total Spent
                  </span>
                  <span className="font-medium text-red-600">
                    -₹{walletData?.stats.totalSpentRupees.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Exchange Rate Info */}
            {walletData?.exchangeRate && (
              <div className="rounded-xl border border-border bg-muted/30 p-6">
                <h3 className="mb-2 text-base text-foreground">
                  Exchange Rate
                </h3>
                <p className="text-sm text-muted-foreground">
                  1 USD = ₹{walletData.exchangeRate.usdToInr.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last updated:{' '}
                  {formatDate(new Date(walletData.exchangeRate.fetchedAt), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}

            {/* How it works */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-base text-foreground">
                How it works
              </h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-700">
                    1
                  </span>
                  <span>Add funds to your wallet using any payment method</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-700">
                    2
                  </span>
                  <span>
                    Generate AI art - cost is automatically deducted
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-700">
                    3
                  </span>
                  <span>Failed generations are automatically refunded</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TransactionRow Component
// ============================================================================

interface TransactionRowProps {
  transaction: WalletTransaction
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const getIcon = () => {
    switch (transaction.type) {
      case 'credit':
        return <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
      case 'debit':
        return <ArrowUpRight className="h-5 w-5 text-red-600" />
      case 'refund':
        return <RefreshCcw className="h-5 w-5 text-blue-600" />
      case 'bonus':
        return <Gift className="h-5 w-5 text-purple-600" />
      default:
        return <Wallet className="h-5 w-5 text-gray-600" />
    }
  }

  const getIconBg = () => {
    switch (transaction.type) {
      case 'credit':
        return 'bg-emerald-100'
      case 'debit':
        return 'bg-red-100'
      case 'refund':
        return 'bg-blue-100'
      case 'bonus':
        return 'bg-purple-100'
      default:
        return 'bg-gray-100'
    }
  }

  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return null
    }
  }

  const isPositive =
    transaction.type === 'credit' ||
    transaction.type === 'refund' ||
    transaction.type === 'bonus'

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className={cn('rounded-full p-2.5', getIconBg())}>{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">
          {transaction.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {formatDate(new Date(transaction.createdAt), {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {getStatusIcon()}
        </div>
      </div>

      <div className="text-right">
        <p
          className={cn(
            'font-medium',
            isPositive ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          {transaction.amount.formatted}
        </p>
        <p className="text-xs text-muted-foreground">
          Bal: ₹{transaction.balanceAfter.rupees.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
