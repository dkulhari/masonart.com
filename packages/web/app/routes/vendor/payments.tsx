/**
 * `/vendor/payments` — what we owe, and what we have paid.
 *
 * `GET /api/vendor/payments` returns settlements plus a `payableTotal` that is
 * DERIVED from unsettled jobs rather than stored, so there is no parallel
 * ledger here to disagree with the admin side.
 *
 * ## An error is never a zero
 *
 * This is the screen where that rule earns its keep. "₹0.00 outstanding" over a
 * failed request tells a print shop we owe them nothing, which is both false
 * and the single most annoying thing this page could do. So:
 *
 * - The outstanding figure renders only on a successful read.
 * - A failed read renders the error and no amount at all — the error block is
 *   digit-free, and the test asserts that.
 * - An amount that will not parse renders "Unavailable", not a fallback zero.
 *
 * #602 and #606 are both open bugs about an admin surface printing a confident
 * zero that was really a failed request.
 *
 * Settlements are history and history does not paginate away — but the list is
 * paginated in the URL from day one anyway, because "how much have you paid me
 * since 2024" is exactly the query that grows.
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { formatVendorAmount, formatVendorDate } from '~/lib/vendor-nav'

// ============================================================================
// Search schema — coercing, because router.tsx hands us strings
// ============================================================================

const PAYMENTS_PAGE_SIZE = 20
const PAYMENTS_MAX_PAGE_SIZE = 100

export const vendorPaymentsSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .catch(PAYMENTS_PAGE_SIZE)
    .default(PAYMENTS_PAGE_SIZE)
    .transform((n) => Math.min(n, PAYMENTS_MAX_PAGE_SIZE)),
})

export type VendorPaymentsSearch = z.infer<typeof vendorPaymentsSearchSchema>

export const Route = createFileRoute('/vendor/payments')({
  validateSearch: (search) => vendorPaymentsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'My payments | Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorPaymentsPage,
})

// ============================================================================
// Types — the GET /api/vendor/payments payload, verbatim
// ============================================================================

export interface VendorSettlement {
  id: string
  vendorId: string
  /** decimal(10,2) INR as a string. */
  amount: string
  reference: string | null
  note: string | null
  paidAt: string
  createdAt: string
}

export interface VendorPaymentsResponse {
  settlements: VendorSettlement[]
  /** Derived from unsettled jobs; a string decimal like every other amount. */
  payableTotal: string
}

// ============================================================================
// Fetch
// ============================================================================

export async function fetchVendorPayments(): Promise<VendorPaymentsResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/payments`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load your payments')
  }

  return (await response.json()) as VendorPaymentsResponse
}

// ============================================================================
// Outstanding
// ============================================================================

export interface OutstandingProps {
  payableTotal: string | null
  isLoading: boolean
  error: string | null
}

/**
 * The headline number, or explicitly no number.
 *
 * Three outcomes and only three: loading shows a pulse, a failure shows a
 * refusal to state a figure, and success shows the figure. There is no fourth
 * branch that falls through to zero.
 */
export function OutstandingAmount({ payableTotal, isLoading, error }: OutstandingProps) {
  if (error) {
    return (
      <div
        data-testid="vendor-payments-outstanding-unknown"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
      >
        <div className="text-xs font-medium text-muted-foreground">Outstanding</div>
        <div className="mt-1 text-lg font-medium text-destructive">
          {/* Deliberately wordy and deliberately digit-free. */}
          Not known right now
        </div>
      </div>
    )
  }

  if (isLoading || payableTotal === null) {
    return (
      <div
        data-testid="vendor-payments-outstanding-loading"
        className="rounded-lg border border-border p-4"
        aria-busy="true"
      >
        <div className="text-xs font-medium text-muted-foreground">Outstanding</div>
        <div className="mt-2 h-6 w-32 animate-pulse rounded bg-muted" aria-hidden="true" />
      </div>
    )
  }

  const amount = formatVendorAmount(payableTotal)

  return (
    <div data-testid="vendor-payments-outstanding" className="rounded-lg border border-border p-4">
      <div className="text-xs font-medium text-muted-foreground">Outstanding</div>
      <div className="mt-1 text-2xl font-medium tabular-nums">
        {amount ?? <span className="text-base text-destructive">Unavailable</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Across jobs we have not settled yet.
      </p>
    </div>
  )
}

// ============================================================================
// The three list states
// ============================================================================

function PaymentsSkeleton() {
  return (
    <div
      data-testid="vendor-payments-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading payments"
    >
      {['a', 'b', 'c'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

function PaymentsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-payments-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        No settlements are listed because none were loaded, and no amount is
        shown above for the same reason.
      </p>
      <Button type="button" variant="outline" data-testid="vendor-payments-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function PaymentsEmpty() {
  return (
    <div
      data-testid="vendor-payments-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">No settlements recorded</p>
      <p className="text-sm text-muted-foreground">
        Payments we make to you are recorded here once they go out.
      </p>
    </div>
  )
}

export interface VendorPaymentsBodyProps {
  settlements: VendorSettlement[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export function VendorPaymentsBody({
  settlements,
  isLoading,
  error,
  onRetry,
}: VendorPaymentsBodyProps) {
  if (error) return <PaymentsError message={error} onRetry={onRetry} />
  if (isLoading) return <PaymentsSkeleton />
  if (settlements.length === 0) return <PaymentsEmpty />

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="vendor-payments-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Paid</th>
            <th className="px-4 py-3 font-medium">Reference</th>
            <th className="px-4 py-3 font-medium">Note</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((settlement) => {
            const amount = formatVendorAmount(settlement.amount)
            return (
              <tr
                key={settlement.id}
                data-testid={`vendor-settlement-row-${settlement.id}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">{formatVendorDate(settlement.paidAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{settlement.reference ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{settlement.note ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {amount ?? <span className="text-destructive">Unavailable</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function VendorPaymentsPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [data, setData] = useState<VendorPaymentsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setData(await fetchVendorPayments())
      setError(null)
    } catch (loadError) {
      // Dropped along with the error: a stale outstanding figure under a
      // failure banner is the number people remember.
      setData(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The endpoint returns the whole settlement history in one response, so the
  // page window is applied here. The URL still carries it, so a page is a link
  // and the day this endpoint grows a limit nothing about the URL changes.
  const all = data?.settlements ?? []
  const start = (search.page - 1) * search.pageSize
  const visible = all.slice(start, start + search.pageSize)
  const totalPages = Math.max(1, Math.ceil(all.length / search.pageSize))

  const goToPage = (page: number) => {
    void navigate({ to: '/vendor/payments', search: { ...search, page } })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">My payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What is outstanding, and everything we have settled.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <OutstandingAmount
        payableTotal={data?.payableTotal ?? null}
        isLoading={isLoading}
        error={error}
      />

      <VendorPaymentsBody
        settlements={visible}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
      />

      {!isLoading && !error && totalPages > 1 && (
        <div
          data-testid="vendor-payments-pagination"
          className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
        >
          <span className="text-muted-foreground">
            Page {search.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={search.page <= 1}
              onClick={() => goToPage(search.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={search.page >= totalPages}
              onClick={() => goToPage(search.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
