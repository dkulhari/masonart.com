/**
 * `/vendor/rates` — my rate card, read-only.
 *
 * What we pay this vendor per band, as it stands today and as it stood before.
 * Read-only is not a UI decision to revisit later: `GET /api/vendor/rates` is
 * the only rate route on the vendor side — there is no POST, PATCH or DELETE
 * beside it — because a rate is negotiated with us and written on the admin
 * side. A vendor may not price their own work.
 *
 * Three states, and no invented numbers: a failed read renders the error and
 * nothing else. An empty rate card and a rate card that failed to load look
 * identical if you let them, and the difference is whether the vendor thinks we
 * pay them nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { formatVendorAmount, formatVendorDate, type VendorJobStage } from '~/lib/vendor-nav'

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute('/vendor/rates')({
  head: () => ({
    meta: [
      { title: 'My rates | Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorRatesPage,
})

// ============================================================================
// Types — the GET /api/vendor/rates payload, verbatim
// ============================================================================

export interface VendorRate {
  id: string
  vendorId: string
  kind: VendorJobStage
  longestEdgeMinInches: number | null
  longestEdgeMaxInches: number | null
  finish: string | null
  /** decimal(10,2) INR as a string. */
  amount: string
  effectiveFrom: string
  effectiveTo: string | null
}

export interface VendorRatesResponse {
  items: VendorRate[]
}

// ============================================================================
// Fetch
// ============================================================================

export async function fetchVendorRates(): Promise<VendorRatesResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/rates`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load your rate card')
  }

  return (await response.json()) as VendorRatesResponse
}

// ============================================================================
// Bits
// ============================================================================

/** "Up to 24″", "24–36″", "Over 36″", or "Any size". Never a bare null. */
export function bandLabel(rate: VendorRate): string {
  const min = rate.longestEdgeMinInches
  const max = rate.longestEdgeMaxInches
  if (min === null && max === null) return 'Any size'
  if (min === null) return `Up to ${max}″`
  if (max === null) return `Over ${min}″`
  return `${min}–${max}″`
}

/**
 * A band is current when it has started and has not been superseded.
 *
 * Computed rather than asked for: the API sends the whole card, history and
 * all, and hiding the expired rows would hide the reason a rate changed.
 */
export function isCurrentBand(rate: VendorRate, now = new Date()): boolean {
  const from = new Date(rate.effectiveFrom)
  if (!Number.isNaN(from.getTime()) && from.getTime() > now.getTime()) return false
  if (!rate.effectiveTo) return true
  const to = new Date(rate.effectiveTo)
  if (Number.isNaN(to.getTime())) return true
  return to.getTime() > now.getTime()
}

// ============================================================================
// The three states
// ============================================================================

function RatesSkeleton() {
  return (
    <div
      data-testid="vendor-rates-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading rates"
    >
      {['a', 'b', 'c'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/** Digit-free: a failed read must not print an amount of any kind. */
function RatesError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-rates-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        No rates are shown because none were loaded — that is not the same as
        having none agreed.
      </p>
      <Button type="button" variant="outline" data-testid="vendor-rates-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function RatesEmpty() {
  return (
    <div
      data-testid="vendor-rates-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">No rates agreed yet</p>
      <p className="text-sm text-muted-foreground">
        Your rate card is set by us when we agree pricing. Get in touch if you
        expected to see bands here.
      </p>
    </div>
  )
}

export interface VendorRatesBodyProps {
  rates: VendorRate[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export function VendorRatesBody({ rates, isLoading, error, onRetry }: VendorRatesBodyProps) {
  if (error) return <RatesError message={error} onRetry={onRetry} />
  if (isLoading) return <RatesSkeleton />
  if (rates.length === 0) return <RatesEmpty />

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="vendor-rates-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Work</th>
            <th className="px-4 py-3 font-medium">Size band</th>
            <th className="px-4 py-3 font-medium">Finish</th>
            <th className="px-4 py-3 font-medium">In force</th>
            <th className="px-4 py-3 text-right font-medium">We pay</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => {
            const amount = formatVendorAmount(rate.amount)
            const current = isCurrentBand(rate)

            return (
              <tr
                key={rate.id}
                data-testid={`vendor-rate-row-${rate.id}`}
                className={cn(
                  'border-b border-border last:border-0',
                  !current && 'text-muted-foreground'
                )}
              >
                <td className="px-4 py-3 capitalize">{rate.kind}</td>
                <td className="px-4 py-3">{bandLabel(rate)}</td>
                <td className="px-4 py-3">{rate.finish ?? 'Any'}</td>
                <td className="px-4 py-3">
                  {formatVendorDate(rate.effectiveFrom)}
                  {rate.effectiveTo ? ` → ${formatVendorDate(rate.effectiveTo)}` : ''}
                  {current && (
                    <span className="ml-2 inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Current
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {/* An unreadable amount says so rather than showing ₹0.00. */}
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

function VendorRatesPage() {
  const [rates, setRates] = useState<VendorRate[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchVendorRates()
      setRates(data.items)
      setError(null)
    } catch (loadError) {
      setRates(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">My rates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What we pay you, per band. Set by us — get in touch to change it.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <VendorRatesBody
        rates={rates ?? []}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
      />
    </div>
  )
}
