/**
 * Admin — the payables tab on one vendor: what is outstanding, and recording
 * a payment against it.
 *
 * Rendered by `$id.tsx`. This module deliberately exports a component and no
 * `Route`, so the file router leaves it alone (the same arrangement as
 * `VendorForm.tsx`): payables is a tab on the vendor screen, not a URL of its
 * own.
 *
 * ## Nothing here invents a number
 *
 * A failed `GET /payables` renders the error and stops. There is no zero
 * total, no dash standing in for one, and no settlement form offered against a
 * figure nobody read. `₹0.00` beside a supplier's name is not a neutral
 * placeholder — it is the sentence "we owe this vendor nothing", which is a
 * claim about money that no request actually made. #602 and #606 are both open
 * bugs of exactly that shape on other admin surfaces.
 *
 * ## The confirming click lands on the real number
 *
 * Recording a settlement stamps `settlementId` on the selected rows and is not
 * undoable from this screen. So it is a two-step inline control — never a
 * native dialog, which blocks the browser automation harness outright and is
 * why nine admin files have no E2E cover on their destructive paths — and the
 * second step restates the exact job count and the exact amount rather than
 * relying on the admin remembering what they selected. Any change to the
 * selection or the amount disarms it, because a restatement that has gone
 * stale is worse than no restatement at all.
 *
 * ## The amount is editable, and disagreement is shown
 *
 * The field defaults to the selected jobs' derived total but stays editable: a
 * vendor is often paid a rounded figure, and the settlement should record what
 * actually left the bank. When the entered amount and the derived total
 * disagree the difference is spelled out — silently accepting it is how a
 * short payment becomes invisible.
 *
 * ## Rupees, both directions
 *
 * `amount` and `total` are decimal(10,2) INR strings on the wire and stay that
 * way here. There is NO minor-unit conversion at either boundary; the repo
 * already carries a documented 100x hazard from mixing the two. `sumRupees`
 * adds in exact hundredths purely so that repeated `0.1 + 0.2` does not leak a
 * float artefact into a number an admin is about to pay — it converts back
 * before anything is displayed or sent.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, IndianRupee, Loader2 } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { formatRupees } from './index'

// ============================================================================
// Types — GET /api/admin/vendors/:id/payables, verbatim
// ============================================================================

export interface AdminPayableJob {
  id: string
  orderId: string | null
  stage: string
  status: string
  dueAt: string | null
  sentAt: string | null
  receivedAt: string | null
  /** decimal(10,2) INR as a string. Never a minor unit. */
  amountExpected: string | null
  /** The re-price on receipt, when there was one. Wins over the expectation. */
  amountActual: string | null
  settlementId: string | null
  createdAt: string
  /** What this one job is worth, already resolved server-side. */
  amount: string
}

export interface VendorPayablesPayload {
  vendorId: string
  jobs: AdminPayableJob[]
  jobCount: number
  /** SUM over the unsettled rows, derived — there is no balance column. */
  total: string
}

// ============================================================================
// Money — exact decimal rupees
// ============================================================================

/** "12500.00" → 1250000 hundredths. Internal arithmetic only. */
function toHundredths(value: string): number {
  const parsed = Math.round(Number(value) * 100)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 1250000 hundredths → "12500.00", the decimal rupee string the API speaks. */
function fromHundredths(units: number): string {
  const sign = units < 0 ? '-' : ''
  const abs = Math.abs(units)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Adds decimal rupee strings exactly. The mirror of the API's `sumPayable`, so
 * the selection total the admin sees agrees with the total the server derived
 * over the same rows.
 */
export function sumRupees(values: string[]): string {
  return fromHundredths(values.reduce((acc, value) => acc + toHundredths(value), 0))
}

/** What the API's amount schema accepts, so a refusal is caught before the POST. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

function isPayableAmount(value: string): boolean {
  const trimmed = value.trim()
  return AMOUNT_PATTERN.test(trimmed) && Number(trimmed) > 0
}

/** A rupee string for display, or the honest admission that it did not parse. */
function rupees(value: string): string {
  return formatRupees(value) ?? 'Unavailable'
}

// ============================================================================
// Shared bits
// ============================================================================

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    // Without this every request is a 401 — the session cookie is the only
    // thing requireAdmin reads.
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(
      (body.error as string | undefined) ?? `Request failed (${response.status})`
    ) as Error & { status: number }
    error.status = response.status
    throw error
  }
  return body as T
}

const field =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground'

/** ISO instant → something an admin reads. Never a bare timestamp. */
function dayLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

/** Today as a `date` input value. The payment usually happened this morning. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** A `date` input value → an ISO instant, or undefined for the API default. */
function dateInputToIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function jobCountLabel(count: number): string {
  return count === 1 ? '1 job' : `${count} jobs`
}

// ============================================================================
// The tab
// ============================================================================

export function VendorPayablesSection({ vendorId }: { vendorId: string }) {
  const [payables, setPayables] = useState<VendorPayablesPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<string[]>([])
  /**
   * Only what the admin typed. The displayed amount is DERIVED below rather
   * than synced by an effect: an effect leaves one render in which the field
   * is empty and the record button is disabled, which is a real race for a
   * fast click and a flaky one for the harness.
   */
  const [amountDraft, setAmountDraft] = useState('')
  /** Once the admin types their own figure we stop deriving it. */
  const [amountEdited, setAmountEdited] = useState(false)
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(today)
  const [note, setNote] = useState('')

  const [armed, setArmed] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const body = await callApi<VendorPayablesPayload>(
        `/api/admin/vendors/${vendorId}/payables`
      )
      setPayables(body)
      // Everything outstanding, selected: settling the lot is the ordinary
      // case, and a subset is a deselection away.
      setSelected(body.jobs.map((job) => job.id))
      setLoadError(null)
    } catch (error) {
      // Dropped, not kept. A stale total under a failure banner is a number
      // the admin will believe and pay against.
      setPayables(null)
      setSelected([])
      setLoadError((error as Error).message)
    } finally {
      setAmountEdited(false)
      setArmed(false)
      setIsLoading(false)
    }
  }, [vendorId])

  useEffect(() => {
    void load()
  }, [load])

  const jobs = payables?.jobs ?? []
  const selectedJobs = jobs.filter((job) => selected.includes(job.id))
  const derivedTotal = sumRupees(selectedJobs.map((job) => job.amount))

  // The field defaults to the selection's derived total and follows it until
  // the admin types something of their own.
  const amount = amountEdited ? amountDraft : derivedTotal

  const amountValid = isPayableAmount(amount)
  const differenceUnits = amountValid
    ? toHundredths(amount.trim()) - toHundredths(derivedTotal)
    : 0
  const canRecord = selectedJobs.length > 0 && amountValid && !isRecording

  const toggle = (jobId: string) => {
    // Disarm: a restatement of a selection that has since changed is worse
    // than no restatement.
    setArmed(false)
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      // Rebuilt in table order so the posted `jobIds` are stable.
      return jobs.filter((job) => next.has(job.id)).map((job) => job.id)
    })
  }

  const toggleAll = () => {
    setArmed(false)
    setSelected((previous) =>
      previous.length === jobs.length ? [] : jobs.map((job) => job.id)
    )
  }

  const record = async () => {
    setIsRecording(true)
    setRecordError(null)
    const paid = amount.trim()
    const settledCount = selectedJobs.length
    try {
      await callApi(`/api/admin/vendors/${vendorId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({
          // Decimal rupees, exactly as typed and exactly as the API reads
          // them. No conversion, in either direction.
          amount: paid,
          reference: reference.trim() || null,
          paidAt: dateInputToIso(paidAt),
          note: note.trim() || null,
          jobIds: selected,
        }),
      })
      setArmed(false)
      setRecorded(
        `Recorded ${rupees(paid)} against ${jobCountLabel(settledCount)}.`
      )
      setReference('')
      setNote('')
      // Re-read rather than patch: the settled rows leave the list and the
      // outstanding total is the server's to derive, not ours to decrement.
      await load()
    } catch (error) {
      setRecordError((error as Error).message)
    } finally {
      setIsRecording(false)
    }
  }

  // ------------------------------------------------------------------------
  // Failed read — the error, and nothing else
  // ------------------------------------------------------------------------

  if (loadError) {
    return (
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-medium">Payables</h2>
        <div
          role="alert"
          data-testid="vendor-payables-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm"
        >
          <AlertCircle
            className="mx-auto mb-2 h-5 w-5 text-destructive"
            aria-hidden="true"
          />
          <p className="mb-3">{loadError}</p>
          <p className="mb-4 text-muted-foreground">
            No total is shown, because none was read. This is not the same as
            owing this vendor nothing.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            data-testid="vendor-payables-retry"
          >
            Try again
          </Button>
        </div>
      </section>
    )
  }

  if (isLoading && !payables) {
    return (
      <section
        data-testid="vendor-payables-skeleton"
        className="space-y-3 rounded-lg border border-border p-4"
        aria-busy="true"
      >
        <h2 className="text-lg font-medium">Payables</h2>
        <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      </section>
    )
  }

  const outstanding = payables?.total ?? null

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Payables</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Work this vendor has done that has not been paid for. Derived from
            the jobs themselves — there is no balance kept anywhere.
          </p>
        </div>
        {outstanding !== null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Outstanding
            </div>
            <div
              data-testid="vendor-payables-total"
              className="text-2xl font-medium tabular-nums"
            >
              {rupees(outstanding)}
            </div>
          </div>
        )}
      </div>

      {recorded && (
        <p
          role="status"
          data-testid="vendor-settlement-success"
          className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          {recorded}
        </p>
      )}

      {jobs.length === 0 ? (
        <p
          data-testid="vendor-payables-empty"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          Nothing outstanding. Every job this vendor has done is settled.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-testid="vendor-payables-table">
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={selected.length === jobs.length}
                      onChange={toggleAll}
                      data-testid="vendor-payables-select-all"
                      aria-label="Select every unsettled job"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Payable</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isSelected = selected.includes(job.id)
                  const repriced = job.amountActual != null

                  return (
                    <tr
                      key={job.id}
                      data-testid={`vendor-payable-row-${job.id}`}
                      className={cn(
                        'border-b border-border last:border-0',
                        isSelected && 'bg-brand-50/50'
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(job.id)}
                          data-testid={`vendor-payable-select-${job.id}`}
                          aria-label={`Include this ${job.stage} job in the settlement`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium capitalize">{job.stage}</span>
                        <div className="text-xs text-muted-foreground capitalize">
                          {job.status}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {job.orderId ? job.orderId.slice(0, 8) : 'None'}
                      </td>
                      <td className="px-3 py-2">
                        {dayLabel(job.receivedAt ?? job.sentAt, 'Not yet back')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {rupees(job.amount)}
                        {repriced && (
                          <div className="text-xs text-muted-foreground">
                            Re-priced on receipt
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ---- Record a settlement ------------------------------------ */}

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">Record a settlement</h3>
              <p className="text-sm text-muted-foreground">
                {jobCountLabel(selectedJobs.length)} selected ·{' '}
                <span
                  data-testid="vendor-payables-selected-total"
                  className="font-medium tabular-nums text-foreground"
                >
                  {rupees(derivedTotal)}
                </span>
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Amount paid (₹, rupees)
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmountEdited(true)
                    setArmed(false)
                    setAmountDraft(event.target.value)
                  }}
                  className={field}
                  data-testid="vendor-settlement-amount"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Reference (UPI / NEFT)
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className={field}
                  data-testid="vendor-settlement-reference"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Paid on
                <input
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                  className={field}
                  data-testid="vendor-settlement-paid-at"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Note
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={field}
                  data-testid="vendor-settlement-note"
                />
              </label>
            </div>

            {!amountValid && amount.trim() !== '' && (
              <p
                role="alert"
                data-testid="vendor-settlement-amount-invalid"
                className="text-sm text-destructive"
              >
                Enter an amount in rupees with at most two decimal places.
              </p>
            )}

            {/* Disagreement is stated, never absorbed. A short payment that
                nobody sees is a payable that quietly disappears. */}
            {differenceUnits !== 0 && (
              <p
                data-testid="vendor-settlement-difference"
                className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                {rupees(fromHundredths(Math.abs(differenceUnits)))}{' '}
                {differenceUnits < 0 ? 'less' : 'more'} than the{' '}
                {rupees(derivedTotal)} derived from the{' '}
                {jobCountLabel(selectedJobs.length)} selected. The difference is
                recorded as entered — it is not spread across the jobs.
              </p>
            )}

            {recordError && (
              <p
                role="alert"
                data-testid="vendor-settlement-error"
                className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              >
                {recordError}
              </p>
            )}

            {armed ? (
              <div
                data-testid="vendor-settlement-confirm-panel"
                className="space-y-2 rounded border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm"
              >
                <p className="font-medium">
                  Record {rupees(amount.trim())} against{' '}
                  {jobCountLabel(selectedJobs.length)}?
                </p>
                <p className="text-muted-foreground">
                  Those {jobCountLabel(selectedJobs.length)} total{' '}
                  {rupees(derivedTotal)} and will be marked settled. This cannot
                  be undone from this screen.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    disabled={isRecording}
                    onClick={() => void record()}
                    data-testid="vendor-settlement-confirm"
                  >
                    {isRecording ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Recording…
                      </>
                    ) : (
                      `Yes, record ${rupees(amount.trim())}`
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isRecording}
                    onClick={() => setArmed(false)}
                    data-testid="vendor-settlement-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                disabled={!canRecord}
                onClick={() => {
                  setRecorded(null)
                  setRecordError(null)
                  setArmed(true)
                }}
                data-testid="vendor-settlement-submit"
              >
                <IndianRupee className="mr-2 h-4 w-4" aria-hidden="true" />
                Record settlement
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
