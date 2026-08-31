/**
 * `/vendor` — my jobs.
 *
 * The one question this screen answers is "what do I work on next". It shows
 * the jobs assigned to the signed-in vendor, soonest due first in the eye even
 * though the API orders by creation, and nothing else. No customer, no order,
 * no retail price — `GET /api/vendor/jobs` does not send any of it, and
 * `tests/routes/vendor/no-customer-data.test.tsx` asserts this screen would not
 * render it if a future endpoint regressed and started to.
 *
 * ## The search schema is the fragile part
 *
 * `router.tsx` swaps TanStack's search serialisation for a pair that keeps every
 * incoming value a STRING (`URLSearchParams` entries) and `String(value)` on the
 * way out. `validateSearch` therefore receives `{ page: '2' }`, never
 * `{ page: 2 }`, and a schema written against real numbers throws on the first
 * navigation — a throw there is not a validation message, it error-boundaries
 * the route into a blank page. Hence: coerce everything, and `.catch()` every
 * field to a usable default so a stale bookmark degrades to the default view.
 *
 * ## Paginated from day one
 *
 * `GET /api/vendor/jobs` is limit/offset and returns no total, so there is no
 * page count to print and none is invented. "Next" is offered when a full page
 * came back, which is the only thing the response actually supports.
 *
 * ## The status filter is derived, because a hand-written one was wrong
 *
 * The options are `VENDOR_JOB_STATUSES` from `lib/vendor-nav`, which is the
 * closure of the shared transition matrix from `assigned`. The hand-written
 * tuple it replaced offered "Sent back" — a retired status, so a view empty by
 * construction — and had no option for `qc_submitted` or `dispatched`, the two
 * statuses a vendor actually produces. A vendor could not filter to their own
 * finished work.
 *
 * ## Parcels, above the queue
 *
 * `VendorTransferStrip` is the vendor's own legs at either end, from
 * `GET /api/vendor/transfers`. It lives on this screen rather than on a job,
 * because a parcel is a fact about the VENDOR: the API withholds the order a
 * parcel belongs to (R1), and in the consolidation case the receiving vendor has
 * no job for the piece at all. Confirming an arrival is therefore only reachable
 * from here, which is also the screen a vendor lands on.
 *
 * **Because it is the only place, the confirmable set is read in full.** One
 * unfiltered page of twenty rows ordered `created_at DESC` across both
 * directions is not a strip, it is a cap: a print shop despatches more than it
 * receives, so twenty outbound legs push the parcel actually sitting on its
 * bench off the page, and there is nowhere else to confirm it from. The
 * actionable rows therefore come from a `direction=inbound` walk with no
 * truncation (`fetchInboundAwaitingArrival`) and sort first; a page of recent
 * history follows them, because nothing on those rows is a control.
 *
 * What the strip says about the other end is **the direction and nothing else**.
 * No vendor name, no vendor id, no order, no cost — `lib/vendor-scope.ts`
 * computes `direction` as a SQL `case` over the caller's own id precisely so
 * that neither vendor column is ever selected, and this screen must not put the
 * difference back.
 *
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error, mutually exclusive, error winning over both. A
 * failed load renders the error and drops the rows — an empty state after a
 * failed request is a lie about the data, and a `₹0` beside it is #602/#606 on
 * a surface where it would read as "we owe you nothing".
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { ProductionJobStatus } from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'
import { useLatestOnly } from '~/lib/latest-request'
import { Button } from '~/components/ui/Button'
import {
  VENDOR_JOBS_MAX_PAGE_SIZE,
  VENDOR_JOBS_PAGE_SIZE,
  VENDOR_JOB_STAGES,
  VENDOR_JOB_STATUSES,
  daysUntil,
  formatVendorAmount,
  formatVendorDate,
  vendorStatusLabel,
  vendorStatusStyle,
  type VendorJobStage,
  type VendorJobStatus,
} from '~/lib/vendor-nav'

// ============================================================================
// Search schema
// ============================================================================

export const vendorJobsSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .catch(VENDOR_JOBS_PAGE_SIZE)
    .default(VENDOR_JOBS_PAGE_SIZE)
    // Clamped rather than rejected: `?pageSize=100000` should show a page, not
    // an error boundary. The API clamps at the same number.
    .transform((n) => Math.min(n, VENDOR_JOBS_MAX_PAGE_SIZE)),
  status: z.enum(VENDOR_JOB_STATUSES).optional().catch(undefined),
})

export type VendorJobsSearch = z.infer<typeof vendorJobsSearchSchema>

export const Route = createFileRoute('/vendor/')({
  validateSearch: (search) => vendorJobsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'My jobs | Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorJobsPage,
})

// ============================================================================
// Types — the GET /api/vendor/jobs payload, verbatim
// ============================================================================

/**
 * Exactly the column list `lib/vendor-scope.ts#listVendorJobs` selects.
 *
 * There is no `orderId` and no customer field, and that is not an omission for
 * brevity — the scoped module does not select them, on purpose, so that a
 * vendor never holds a handle that joins back to a buyer.
 */
export interface VendorJobListItem {
  id: string
  stage: VendorJobStage
  /**
   * The COLUMN's type, not the filter's.
   *
   * `VENDOR_JOB_STATUSES` is what this screen offers as a filter — the matrix
   * closure, which excludes the retired `sent`. The column is the pgEnum, which
   * still carries it, because retiring a value in the matrix is a statement
   * about transitions and not a rewrite of every row. So a read can hand this
   * screen a status the filter has no option for, and `VendorJobStatusPill` is
   * what makes that legible instead of blank.
   */
  status: ProductionJobStatus
  dueAt: string | null
  sentAt: string | null
  receivedAt: string | null
  /** decimal(10,2) INR as a string. */
  amountExpected: string | null
  amountActual: string | null
  createdAt: string
}

export interface VendorJobsResponse {
  items: VendorJobListItem[]
  limit: number
  offset: number
}

// ============================================================================
// Bits
// ============================================================================

/**
 * What this job is worth to the vendor, in rupees, or null if we cannot say.
 *
 * `amountExpected` is what the rate card said the work WOULD cost;
 * `amountActual` is what a human said we owe. On a CANCELLED job only the
 * second is real — the first is a bill for work that never happened, and it is
 * the vendor's own screen it lands on, permanently, with no way to clear it
 * (#695). So a cancellation with nothing agreed is a definite `'0.00'`, not a
 * fallback to the expectation and not a blank: the status pill on the same row
 * says why, which is what makes the zero an answer instead of a mystery.
 *
 * The mirror of the API's `lib/vendor-payables.jobPayableAmount`. Both ends
 * have to agree or the portal and the settlement screen show two numbers.
 */
export function vendorJobPayableAmount(job: {
  status: ProductionJobStatus
  amountExpected: string | null
  amountActual: string | null
}): string | null {
  if (job.status === 'cancelled') return job.amountActual ?? '0.00'
  return job.amountActual ?? job.amountExpected
}

/**
 * A status, in words and in colour.
 *
 * Both come from `vendor-nav`'s fallback-carrying helpers rather than a blind
 * index, because rows still carry the retired `sent`: an unfamiliar status
 * renders its humanised raw value in a neutral dashed pill, which is legible
 * and obviously not one of ours. An empty badge would read as a bug in the page
 * rather than as a status nobody has migrated yet.
 */
export function VendorJobStatusPill({ status }: { status: ProductionJobStatus }) {
  return (
    // Named in words as well as coloured — a pill that only signals in colour
    // says nothing to a screen reader or a colourblind printer.
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        vendorStatusStyle(status)
      )}
    >
      {vendorStatusLabel(status)}
    </span>
  )
}

/** "Due in 3 days" / "2 days late" / "No due date". Never a bare date alone. */
export function DueCell({ dueAt }: { dueAt: string | null }) {
  const days = daysUntil(dueAt)
  if (days === null) {
    return <span className="text-muted-foreground">No due date</span>
  }

  const label =
    days < 0
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`
      : days === 0
        ? 'Due today'
        : `Due in ${days} day${days === 1 ? '' : 's'}`

  return (
    <span className={cn(days < 0 && 'font-medium text-destructive')}>
      {label}
      <span className="ml-2 text-xs text-muted-foreground">
        {formatVendorDate(dueAt)}
      </span>
    </span>
  )
}

// ============================================================================
// Two-step confirm — no native dialogs anywhere in this tree
// ============================================================================

/**
 * Asks before acting, inline.
 *
 * The pattern is `ReviewMediaStrip`'s and `routes/admin/vendors/$id.tsx`'s, for
 * the reason documented in both: a native `confirm()` blocks the automation
 * harness, so any path guarded by one can never be covered end to end.
 *
 * It lives HERE rather than on the job screen because both screens now need it
 * — the job screen for its status moves, this one for confirming a parcel
 * arrived — and `jobs/$id.tsx` already imports from this module. Putting it the
 * other way round would make the two route files import each other, and
 * `tests/routes/vendor/vendor-screens.test.tsx` forbids a fifth file to hold it
 * in ("exactly four screens under one layout"). `jobs/$id.tsx` re-exports it, so
 * every existing importer is unaffected.
 */
export function InlineConfirm({
  label,
  question,
  onConfirm,
  busy = false,
  testId,
  icon,
}: {
  label: string
  question: string
  onConfirm: () => void | Promise<void>
  busy?: boolean
  testId: string
  icon?: ReactNode
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <Button type="button" variant="outline" data-testid={testId} onClick={() => setArmed(true)}>
        {icon}
        {label}
      </Button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{question}</span>
      <button
        type="button"
        data-testid={`${testId}-confirm`}
        disabled={busy}
        onClick={async () => {
          await onConfirm()
          setArmed(false)
        }}
        className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Confirm'}
      </button>
      <button
        type="button"
        data-testid={`${testId}-cancel`}
        disabled={busy}
        onClick={() => setArmed(false)}
        className="rounded px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  )
}

// ============================================================================
// Parcels between benches — and the seven fields a vendor is told about one
// ============================================================================

/**
 * A parcel, exactly as `GET /api/vendor/transfers` answers it.
 *
 * Seven fields, plus `direction`. What is ABSENT is the design (§5) rather than
 * an omission for brevity, and none of it can be added here because none of it
 * is sent: no `fromVendorId`/`toVendorId`, no vendor NAME, no `orderId`, no
 * `costAmount`, no `lostAt`. **Vendor B does not learn the parcel came from
 * vendor A.** `lib/vendor-scope.ts` computes `direction` as a SQL `case` over
 * the caller's own vendor id precisely so that neither vendor column is ever
 * selected — the answer is "is this coming to me", never "who is at the other
 * end" — and this screen must not reconstruct the difference. If a vendor needs
 * to chase a carrier, an admin chases it; the admin sees both ends.
 *
 * The dates are ISO strings here and `Date`s in the API: they cross as JSON.
 */
export interface VendorTransfer {
  id: string
  /** The A→B docket. Null until a carrier issues one. */
  reference: string | null
  carrier: string | null
  pieceCount: number
  dispatchedAt: string | null
  /** The carrier's promise, off the docket. The one date that is not ours. */
  expectedBy: string | null
  receivedAt: string | null
  /**
   * Whether this parcel has been written off. The FACT, not `lostAt` — when it
   * happened is not the vendor's business, but that it will never arrive is.
   */
  isLost?: boolean
  /** Relative to the CALLER, and the only thing they learn about the other end. */
  direction: 'inbound' | 'outbound'
}

export interface VendorTransfersResponse {
  items: VendorTransfer[]
  limit: number
  offset: number
}

/**
 * Everything the parcel strip needs, in one prop.
 *
 * One object rather than seven flat props, following the shot-list panel added
 * in #692 and for the same reason: every prop on the screens that host this is
 * a thing the next ticket has to read past.
 */
export interface VendorTransferPanelState {
  data: VendorTransfer[] | null
  isLoading: boolean
  /** A failed READ. It replaces the list, because there is no list. */
  error: string | null
  onRetry: () => void
  /** Absent on a screen that only reports parcels rather than acting on them. */
  onReceived?: (id: string) => void | Promise<void>
  /** The parcel with a write in flight. Locks that row, not the page. */
  busyId?: string | null
  /** A failed WRITE, keyed by the parcel that caused it. */
  rowErrors?: Record<string, string>
  /**
   * The walk for confirmable parcels stopped at its page cap, so there may be
   * older ones below this list. Said out loud rather than swallowed: this strip
   * is the only place an arrival can be confirmed, and a silent partial answer
   * to "everything you have to confirm" is the defect it was widened to fix.
   */
  olderNotListed?: boolean
}

/**
 * Is this parcel one this vendor can confirm the arrival of?
 *
 * Four conditions, and the last two were each added after the control had
 * already shipped without them: **inbound**
 * (`received_at` is settable only by the receiving end — the API answers the
 * sender 404), **not already arrived**, and **actually despatched**.
 *
 * `dispatched_at IS NULL` is a first-class transfer state, not a null nobody
 * produces: `routes/admin/transfers.ts#transferState` names it `pending` and
 * filters on it, and an admin can create the parcel before the sending
 * workshop hands it to a courier. A parcel in that state has not left anyone's
 * bench, so it cannot have reached this one, and `lib/vendor-scope.ts` refuses
 * the confirmation with a 409 `TRANSFER_NOT_DISPATCHED`. A control whose only
 * possible outcome is a refusal is a support ticket rather than an affordance —
 * the same rule that decides the upload window and the action strip.
 *
 * The same predicate answers "is something on its way to me", because those are
 * the same parcels: in transit is exactly despatched-and-not-yet-arrived.
 */
export function transferAwaitsArrival(transfer: VendorTransfer): boolean {
  return (
    transfer.direction === 'inbound' &&
    transfer.dispatchedAt !== null &&
    transfer.receivedAt === null &&
    transfer.isLost !== true
  )
}

/**
 * The parcels genuinely on their way TO this vendor.
 *
 * `null`/`undefined` — the parcels have not been read — is deliberately EMPTY
 * rather than "waiting". The screens use this to decide whether to say a job is
 * blocked on a parcel, and a page that announces an inbound parcel because a
 * request has not come back yet is inventing one.
 *
 * A parcel nobody has despatched is EMPTY for the same reason it gets no
 * confirm button: announcing "something is in transit to you" about a box still
 * on the sender's bench sends a vendor to look for a courier who was never
 * called. A parcel written off as lost is empty for the same reason again: it
 * stays inbound, despatched and unreceived for the rest of time, so without
 * that clause it drove a permanent "Waiting on an inbound parcel" banner on
 * every job it carried.
 */
export function inboundAwaitingArrival(
  transfers: VendorTransfer[] | null | undefined
): VendorTransfer[] {
  if (!transfers) return []
  return transfers.filter(transferAwaitsArrival)
}

/** `3 pieces`, `1 piece`. A count nobody has to decode. */
function piecesLabel(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}

export async function fetchVendorTransfers(
  opts: { direction?: 'inbound' | 'outbound'; limit?: number; offset?: number } = {}
): Promise<VendorTransfersResponse> {
  const query = new URLSearchParams()
  if (opts.direction) query.set('direction', opts.direction)
  if (opts.limit) query.set('limit', String(opts.limit))
  if (opts.offset) query.set('offset', String(opts.offset))

  const response = await fetch(
    `${getApiUrl()}/api/vendor/transfers${query.toString() ? `?${query.toString()}` : ''}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load your parcels')
  }

  return (await response.json()) as VendorTransfersResponse
}

/**
 * The API's clamp, asked for by name. `?limit=101` is answered with 100 rows,
 * so asking for more than this only wastes the round trip's honesty.
 */
export const VENDOR_TRANSFERS_MAX_LIMIT = 100

/**
 * How many parcels of recent HISTORY the strip shows alongside the actionable
 * ones. The API's own default page, and nothing on these rows is a control.
 */
export const VENDOR_TRANSFERS_RECENT_LIMIT = 20

/**
 * The runaway guard on the walk below. Ten pages of a hundred is a thousand
 * inbound legs — far past any real print shop — and it exists so a server that
 * ignored `offset` would cost ten requests rather than an infinite loop.
 */
export const VENDOR_TRANSFERS_MAX_PAGES = 10

/**
 * EVERY parcel still awaiting this vendor's confirmation, however old.
 *
 * This is the one read on the portal that has to be complete rather than
 * recent, and the reason is that `/vendor` is the ONLY place an arrival can be
 * confirmed. The strip used to be a single unfiltered page: twenty rows,
 * `created_at DESC`, across both directions. A print shop that despatches more
 * than it receives — which is what a print shop is — fills all twenty with its
 * own outbound legs, and the inbound parcel sitting on its bench is then
 * confirmable from nowhere at all, while the job screen goes on telling them to
 * confirm it on their job list. A dead end with no "load more" is worse than a
 * missing feature, because the vendor can see they are being asked for
 * something and cannot find where.
 *
 * So the actionable set is fetched on its own terms: `direction=inbound`, so
 * outbound legs cannot crowd it out of the page, and paged to exhaustion rather
 * than truncated, so age cannot either. Only the parcels a vendor can act on
 * survive the walk — an inbound parcel already confirmed, or not yet
 * despatched, is history or somebody else's move, and both are covered by the
 * recent page the strip shows underneath.
 *
 * `truncated` is not decoration. If the walk hits its page cap there may be
 * older parcels it never saw, and the strip says so; silently showing a partial
 * answer to "everything you have to confirm" is the same lie one page down.
 */
export async function fetchInboundAwaitingArrival(): Promise<{
  items: VendorTransfer[]
  truncated: boolean
}> {
  const items: VendorTransfer[] = []

  for (let page = 0; page < VENDOR_TRANSFERS_MAX_PAGES; page++) {
    const { items: batch } = await fetchVendorTransfers({
      direction: 'inbound',
      limit: VENDOR_TRANSFERS_MAX_LIMIT,
      offset: page * VENDOR_TRANSFERS_MAX_LIMIT,
    })

    items.push(...batch.filter(transferAwaitsArrival))

    // A short page is the end of the list — the only end-of-list signal this
    // endpoint gives, since it returns no total.
    if (batch.length < VENDOR_TRANSFERS_MAX_LIMIT) return { items, truncated: false }
  }

  return { items, truncated: true }
}

/**
 * The actionable parcels first, then recent history, and nothing twice.
 *
 * Order is the point: the rows a vendor has to DO something about are the
 * reason the strip exists, and a parcel that has been waiting a fortnight sorts
 * below yesterday's despatch under `created_at DESC`. Deduplicated on id
 * because the two reads overlap on purpose — a parcel that is both recent and
 * awaiting confirmation is one parcel.
 */
export function mergeTransferRows(
  awaiting: VendorTransfer[],
  recent: VendorTransfer[]
): VendorTransfer[] {
  const already = new Set(awaiting.map((transfer) => transfer.id))
  return [...awaiting, ...recent.filter((transfer) => !already.has(transfer.id))]
}

/**
 * Confirm a parcel arrived. **There is no body**, and that is the API's design:
 * `received_at` is stamped from our clock, and the only other thing a vendor
 * could put in one is `cost_amount`, which is not theirs to set. A request with
 * no payload cannot be talked into carrying a field it does not have.
 */
export async function markVendorTransferReceived(id: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/vendor/transfers/${id}/received`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    // Passed through as written. A 404 covers "no such parcel" and "neither end
    // is yours" alike, and the API refuses to distinguish them on purpose.
    throw new Error(body.error ?? 'Failed to confirm this parcel')
  }
}

// ============================================================================
// The parcel strip
// ============================================================================

function TransfersSkeleton() {
  return (
    <div
      data-testid="vendor-transfers-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading parcels"
    >
      {['a', 'b'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/** Digit-free, for the same reason every error block on this surface is. */
function TransfersError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-transfers-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-8 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is listed below because nothing was read — that is not the same
        as there being no parcels.
      </p>
      <Button
        type="button"
        variant="outline"
        data-testid="vendor-transfers-retry"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  )
}

function TransfersEmpty() {
  return (
    <div
      data-testid="vendor-transfers-empty"
      className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground"
    >
      No parcels are on their way to you or away from you.
    </div>
  )
}

/**
 * Parcels at either end of this vendor, and the one act they have on them.
 *
 * BOTH directions, because the API answers both by default and each is
 * load-bearing: a list showing only outbound legs leaves a vendor unable to
 * confirm anything they were sent, and one showing only inbound legs hides the
 * legs they are still on the hook for. `direction` is how the strip tells them
 * apart, and it is the ONLY thing said about the other end — never a name,
 * never an id, never which order the parcel belongs to.
 *
 * "Confirm arrival" is offered on a parcel `transferAwaitsArrival` accepts and
 * nowhere else: inbound, despatched, not already confirmed. Each of the three
 * is a refusal the API would otherwise hand back — a 404 to the sending end
 * (`received_at` is settable only by the receiving one, and the status does not
 * confirm the row exists), a 409 `TRANSFER_ALREADY_RECEIVED`, and a 409
 * `TRANSFER_NOT_DISPATCHED` on a parcel still on the sender's bench. A control
 * whose only possible outcome is a refusal is a support ticket rather than an
 * affordance.
 *
 * A parcel that has not been despatched says so instead, in both of its dates
 * and in a sentence where the button would be. `pending` is a real state of the
 * row — `routes/admin/transfers.ts` names and filters it — so the strip printing
 * "Left on —" above "In transit, due —" was not a null-handling wobble, it was
 * the screen asserting a despatch that has not happened.
 *
 * Skeleton, error and empty are mutually exclusive with error winning, and the
 * error block carries no digits: an empty state after a failed read says "no
 * parcels are coming", which is a different fact from "we did not find out" and
 * the only one of the two a vendor would act on.
 */
export function VendorTransferStrip({
  transfers,
}: {
  transfers: VendorTransferPanelState
}) {
  const { data, isLoading, error, onRetry, onReceived, busyId, rowErrors, olderNotListed } =
    transfers

  if (error) return <TransfersError message={error} onRetry={onRetry} />
  if (isLoading) return <TransfersSkeleton />
  if (!data || data.length === 0) return <TransfersEmpty />

  return (
    <>
      <ul
        data-testid="vendor-transfers"
        className="divide-y divide-border rounded-lg border border-border"
      >
        {data.map((transfer) => {
          const inbound = transfer.direction === 'inbound'
          const arrived = transfer.receivedAt !== null
          const despatched = transfer.dispatchedAt !== null
          const lost = transfer.isLost === true
          const rowError = rowErrors?.[transfer.id]

          return (
            <li
              key={transfer.id}
              data-testid={`vendor-transfer-row-${transfer.id}`}
              className="space-y-2 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      {/* Never a blank cell: a parcel can genuinely leave before
                          the carrier issues a docket. */}
                      {transfer.reference ?? (
                        <span className="font-sans text-muted-foreground">No docket reference</span>
                      )}
                    </span>
                    <span
                      data-testid={`vendor-transfer-direction-${transfer.id}`}
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        inbound
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-border bg-muted text-muted-foreground'
                      )}
                    >
                      {/* The whole of what a vendor learns about the other end. */}
                      {inbound ? 'Coming to you' : 'Sent by you'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {transfer.carrier ?? 'Carrier not recorded'} · {piecesLabel(transfer.pieceCount)}
                  </div>
                </div>

                <div
                  data-testid={`vendor-transfer-dates-${transfer.id}`}
                  className="text-xs text-muted-foreground sm:text-right"
                >
                  {/* Not "Left on —". A parcel nobody has despatched has no
                      departure date to print, and a dash under that label reads
                      as a missing value rather than as a state of the row. */}
                  <div>
                    {despatched ? `Left on ${formatVendorDate(transfer.dispatchedAt)}` : 'Not sent yet'}
                  </div>
                  <div>
                    {arrived
                      ? `Arrived ${formatVendorDate(transfer.receivedAt)}`
                      : lost
                        ? 'Written off as lost'
                        : despatched
                          ? `In transit, due ${formatVendorDate(transfer.expectedBy)}`
                          : 'Still with the sending workshop'}
                  </div>
                </div>
              </div>

              {inbound && !arrived && lost && (
                // Same rule as below: never drop a control without saying why.
                // This one will never arrive, and `markVendorTransferReceived`
                // answers 409 `TRANSFER_LOST` to anyone who insists.
                <p
                  data-testid={`vendor-transfer-lost-${transfer.id}`}
                  className="text-xs text-muted-foreground"
                >
                  This parcel has been written off as lost, so there is nothing
                  to confirm. A replacement job covers the work — nothing is owed
                  by you for the loss.
                </p>
              )}

              {inbound && !arrived && !lost && !despatched && (
                // The strip never simply drops a control without saying why —
                // an absent button is indistinguishable from one that failed to
                // render, which is the same rule the action strip follows.
                <p
                  data-testid={`vendor-transfer-pending-${transfer.id}`}
                  className="text-xs text-muted-foreground"
                >
                  This has not been sent yet, so there is nothing to confirm. It
                  will be here to confirm once it is on its way.
                </p>
              )}

              {transferAwaitsArrival(transfer) && onReceived && (
                <InlineConfirm
                  testId={`vendor-transfer-received-${transfer.id}`}
                  label="Confirm arrival"
                  question="Confirm this parcel is on your bench?"
                  busy={busyId === transfer.id}
                  onConfirm={() => onReceived(transfer.id)}
                />
              )}

              {rowError && (
                <p
                  data-testid={`vendor-transfer-error-${transfer.id}`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {/* On the ROW. One refused confirmation must not take the rest
                      of the strip down with it. */}
                  {rowError}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {olderNotListed && (
        <p
          data-testid="vendor-transfers-older-not-listed"
          className="mt-2 text-xs text-muted-foreground"
        >
          There may be older parcels than the ones listed here. If one you are
          waiting to confirm is missing, tell us and we will find it.
        </p>
      )}
    </>
  )
}

// ============================================================================
// The three list states
// ============================================================================

// ============================================================================
// Despatching a parcel — the screen that closes the handover loop
// ============================================================================

/** One job that may ride a parcel, and the three things a vendor is told. */
export interface VendorTransferCandidateJob {
  id: string
  stage: VendorJobStage
  dueAt: string | null
}

/**
 * The jobs that can ride ONE parcel together, as the server grouped them.
 *
 * The bucket has no id, and must not be given one here. `POST /transfers`
 * refuses jobs that span orders, and no vendor-facing projection carries
 * `order_id` — so the grouping is the server's, and a synthetic key invented on
 * this side would be a stable handle on an order that a vendor could hold and
 * correlate. The bucket IS its jobs.
 */
export interface VendorTransferCandidateGroup {
  jobs: VendorTransferCandidateJob[]
}

export interface VendorTransferCandidatesResponse {
  groups: VendorTransferCandidateGroup[]
}

/**
 * What `createTransferSchema` accepts for `carrier` and `reference`.
 *
 * The API's own bound, named here rather than guessed: the schema is
 * `.strict()`, so an over-length value comes back as a bare
 * "Invalid request body" with nothing saying which of the two was wrong.
 */
export const VENDOR_TRANSFER_TEXT_MAX = 120

/** What one bucket is called on screen: its first job. Stable, and not new. */
export function despatchGroupKey(group: VendorTransferCandidateGroup): string {
  return group.jobs[0]?.id ?? ''
}

/** What the vendor may say when despatching. The destination is not on it. */
export interface VendorDespatchInput {
  jobIds: string[]
  carrier: string | null
  reference: string | null
  pieceCount: number
  expectedBy: string | null
}

export interface VendorDespatchPanelState {
  data: VendorTransferCandidateGroup[] | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onDespatch: (input: VendorDespatchInput) => void | Promise<void>
  /**
   * The buckets with a write in flight. A SET, not one key: a scalar meant
   * submitting a second bucket cleared the first one's flag and re-enabled its
   * button while its POST was still open, and one more click re-fired it (#714).
   */
  busyGroupIds?: ReadonlySet<string>
  /** A refused despatch, keyed by the bucket that caused it. */
  groupErrors?: Record<string, string>
}

export async function fetchVendorTransferCandidates(): Promise<VendorTransferCandidatesResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/transfers/candidates`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load what you can send')
  }

  return (await response.json()) as VendorTransferCandidatesResponse
}

export async function despatchVendorTransfer(input: VendorDespatchInput): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/vendor/transfers`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    // The API's own sentence, kept whole. Every refusal on this route is
    // written for the vendor who will read it — "we will route it and it will
    // appear in your queue" is not a message this screen could improve on.
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to despatch the parcel')
  }
}

/**
 * The state behind the despatch panel: what can be sent, and what is being sent.
 *
 * A hook rather than four `useState`s in the page, because both of the races
 * #714 filed live HERE and neither is reachable through the presentational
 * panel — a candidates response landing out of order, and a busy flag one send
 * could clear while another was still open.
 *
 * `onDespatched` is what the page uses to re-read its parcel strip: a
 * successful send puts a new outbound leg on it, and the strip is not this
 * hook's business.
 */
export interface VendorDespatchController {
  data: VendorTransferCandidateGroup[] | null
  isLoading: boolean
  error: string | null
  reload: () => void
  despatch: (input: VendorDespatchInput) => Promise<void>
  busyGroupIds: ReadonlySet<string>
  groupErrors: Record<string, string>
}

export function useVendorDespatch(onDespatched?: () => void): VendorDespatchController {
  const [data, setData] = useState<VendorTransferCandidateGroup[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyGroupIds, setBusyGroupIds] = useState<ReadonlySet<string>>(new Set())
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({})

  const claim = useLatestOnly()

  /**
   * Guarded, because this reload is fired by every send and every retry.
   *
   * Send bucket A, then bucket B: B's reload could answer first and A's stale
   * answer land on top of it, putting B back on screen as sendable — where the
   * only outcome is a 409 `JOB_ALREADY_ON_TRANSFER` for work already
   * despatched. Repeated "Try again" clicks have the same shape.
   */
  const load = useCallback(async () => {
    const isCurrent = claim()
    setIsLoading(true)
    // Cleared when the read STARTS, not when it succeeds: a retry whose error
    // banner stays put and whose button stays enabled looks like it did
    // nothing, and the operator clicks again (#715).
    setError(null)
    try {
      const { groups } = await fetchVendorTransferCandidates()
      if (!isCurrent()) return
      setData(groups)
    } catch (loadError) {
      if (!isCurrent()) return
      // Dropped with the error, like the queue and the strip: a half-read list
      // of what can be sent under a failure banner is a parcel somebody packs.
      setData(null)
      setError((loadError as Error).message)
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [claim])

  useEffect(() => {
    void load()
  }, [load])

  const despatch = useCallback(
    async (input: VendorDespatchInput) => {
      const key = input.jobIds[0] ?? ''
      // Added and removed, never assigned: two sends in flight are two locked
      // buckets, and one settling must not unlock the other.
      setBusyGroupIds((current) => new Set(current).add(key))
      setGroupErrors((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })

      try {
        await despatchVendorTransfer(input)
        // The jobs leave the bucket list and the parcel appears on the strip as
        // outbound. Re-read rather than patched — the server stamps
        // `dispatched_at` from its own clock and picks the destination.
        await load()
        onDespatched?.()
      } catch (despatchError) {
        // On the BUCKET. Every refusal this route answers with is written for
        // the vendor reading it, so it is shown whole.
        setGroupErrors((current) => ({ ...current, [key]: (despatchError as Error).message }))
      } finally {
        setBusyGroupIds((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [load, onDespatched]
  )

  return {
    data,
    isLoading,
    error,
    reload: () => void load(),
    despatch,
    busyGroupIds,
    groupErrors,
  }
}

/**
 * A date input answers `2026-09-05`; `createTransferSchema` wants
 * `z.string().datetime()`.
 *
 * The whole date, as an instant, rather than a 400 "Invalid request body" with
 * nothing on screen to explain it. This is the carrier's promise off the
 * docket, not an SLA clock about the vendor — `dispatched_at` is that, and the
 * server stamps it — so a day's precision is all the field ever carries.
 */
function promisedInstant(date: string): string | null {
  if (!date) return null
  return `${date}T00:00:00.000Z`
}

function DespatchSkeleton() {
  return (
    <div
      data-testid="vendor-despatch-skeleton"
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading what you can send"
    >
      {['a', 'b'].map((key) => (
        <div key={key} className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * One bucket, and the docket that goes with it.
 *
 * The form holds its own draft, so two buckets being filled in at once do not
 * share fields, and a refusal on one does not clear the other.
 */
function DespatchGroup({
  group,
  onDespatch,
  busy,
  error,
}: {
  group: VendorTransferCandidateGroup
  onDespatch: (input: VendorDespatchInput) => void | Promise<void>
  busy: boolean
  error?: string
}) {
  const key = despatchGroupKey(group)
  const [carrier, setCarrier] = useState('')
  const [reference, setReference] = useState('')
  const [pieces, setPieces] = useState(String(group.jobs.length))
  const [expectedBy, setExpectedBy] = useState('')

  /**
   * The default follows the bucket when the bucket changes size.
   *
   * The React key is the FIRST job's id, which is stable when a job is ADDED —
   * so a bucket that gains a third job reuses this component, and a `pieces`
   * seeded once by `useState` still read 2. The vendor sent a docket claiming
   * two pieces for a three-job parcel (#714).
   *
   * Keyed on the count rather than on the jobs, so re-reading the same bucket
   * does not overwrite a count the vendor typed.
   */
  const jobCount = group.jobs.length
  useEffect(() => {
    setPieces(String(jobCount))
  }, [jobCount])

  const pieceCount = Number.parseInt(pieces, 10)
  // The API's own bounds, asked here so a doomed round trip is not spent. A
  // parcel of no pieces is not a parcel.
  const piecesValid = Number.isInteger(pieceCount) && pieceCount >= 1 && pieceCount <= 999

  /**
   * Which text field is too long, BY NAME.
   *
   * `maxLength` below stops typing, and neither a paste in some browsers nor a
   * scripted change is typing — so the check exists as well. Naming the field
   * is the whole point: the API's answer is `.strict()`'s bare
   * "Invalid request body", which tells the vendor nothing about which of the
   * two boxes to shorten.
   */
  const overLongField =
    carrier.trim().length > VENDOR_TRANSFER_TEXT_MAX
      ? 'Carrier'
      : reference.trim().length > VENDOR_TRANSFER_TEXT_MAX
        ? 'Docket reference'
        : null

  const canSubmit = piecesValid && overLongField === null && !busy

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return

    void onDespatch({
      jobIds: group.jobs.map((job) => job.id),
      carrier: carrier.trim() || null,
      reference: reference.trim() || null,
      pieceCount,
      expectedBy: promisedInstant(expectedBy),
    })
  }

  return (
    <div
      data-testid={`vendor-despatch-group-${key}`}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <ul className="space-y-1 text-sm">
        {group.jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="capitalize">{job.stage}</span>
            <span className="text-xs text-muted-foreground">
              {job.dueAt ? `Due ${formatVendorDate(job.dueAt)}` : 'No due date'}
            </span>
          </li>
        ))}
      </ul>

      <form
        data-testid={`vendor-despatch-form-${key}`}
        onSubmit={handleSubmit}
        className="space-y-3"
      >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Carrier
          <input
            type="text"
            data-testid={`vendor-despatch-carrier-${key}`}
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            maxLength={VENDOR_TRANSFER_TEXT_MAX}
            placeholder="Delhivery"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Docket reference
          <input
            type="text"
            data-testid={`vendor-despatch-reference-${key}`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={VENDOR_TRANSFER_TEXT_MAX}
            placeholder="DL-9911"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Pieces
          <input
            type="number"
            min={1}
            max={999}
            data-testid={`vendor-despatch-pieces-${key}`}
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Due by, off the docket
          <input
            type="date"
            data-testid={`vendor-despatch-expected-${key}`}
            value={expectedBy}
            onChange={(e) => setExpectedBy(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
      </div>

      {!piecesValid && (
        <p
          data-testid={`vendor-despatch-pieces-invalid-${key}`}
          className="text-xs text-destructive"
        >
          A parcel holds between 1 and 999 pieces.
        </p>
      )}

      {overLongField && (
        <p data-testid={`vendor-despatch-too-long-${key}`} className="text-xs text-destructive">
          {overLongField} is longer than {VENDOR_TRANSFER_TEXT_MAX} characters, which is
          the most we can record. Shorten it.
        </p>
      )}

      <Button
        type="submit"
        data-testid={`vendor-despatch-submit-${key}`}
        disabled={!canSubmit}
      >
        {busy ? 'Sending…' : 'Send this group'}
      </Button>
      </form>

      {error && (
        <p
          data-testid={`vendor-despatch-error-${key}`}
          role="alert"
          className="text-sm text-destructive"
        >
          {/* On the BUCKET. One refused despatch must not take the panel down. */}
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * What this vendor can send right now, and the docket for each parcel.
 *
 * The panel never composes a selection of its own: it renders the buckets the
 * server handed it and sends one back unchanged. That is what makes
 * `JOBS_SPAN_ORDERS` unreachable from the UI, and it is also why nothing here
 * names a destination — the routing is derived server-side, and a vendor
 * choosing one would be a vendor learning who else is working the order.
 */
export function VendorDespatchPanel({ despatch }: { despatch: VendorDespatchPanelState }) {
  const { data, isLoading, error, onRetry, onDespatch, busyGroupIds, groupErrors } = despatch

  return (
    <div
      data-testid="vendor-despatch"
      className="space-y-3"
      // The buckets stay on screen through a refetch, so this is the only thing
      // left that says a read is in flight.
      aria-busy={isLoading}
    >
      {error ? (
        <div
          data-testid="vendor-despatch-error"
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="mb-1 font-medium">{error}</p>
          <p className="mb-4 text-muted-foreground">
            We could not read what you have ready to send. That is not the same
            as having nothing — nothing below is a complete list right now.
          </p>
          <Button
            type="button"
            variant="outline"
            data-testid="vendor-despatch-retry"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : data === null ? (
        // Only when there is nothing to show. Gating on `isLoading` meant every
        // refetch — including the one a successful send triggers — replaced the
        // list with a skeleton, unmounting every OTHER bucket and throwing away
        // a docket somebody had typed into it (#714).
        <DespatchSkeleton />
      ) : data.length === 0 ? (
        <p
          data-testid="vendor-despatch-empty"
          className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground"
        >
          Nothing is ready to send. A job appears here once it has passed our
          inspection and the goods are due somewhere else.
        </p>
      ) : (
        data.map((group) => {
          const key = despatchGroupKey(group)
          return (
            <DespatchGroup
              key={key}
              group={group}
              onDespatch={onDespatch}
              busy={busyGroupIds?.has(key) ?? false}
              error={groupErrors?.[key]}
            />
          )
        })
      )}
    </div>
  )
}

function JobsSkeleton() {
  return (
    <div
      data-testid="vendor-jobs-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading jobs"
    >
      {['a', 'b', 'c', 'd', 'e'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * Digit-free on purpose. A failed request that still prints a count or an
 * amount is the exact shape of #602 and #606, and the isolation/state tests
 * assert there is no number in this block.
 */
function JobsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-jobs-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is listed below because nothing was loaded — your queue has not
        been read, which is not the same as it being empty.
      </p>
      <Button type="button" variant="outline" data-testid="vendor-jobs-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function JobsEmpty() {
  return (
    <div
      data-testid="vendor-jobs-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">Nothing in your queue</p>
      <p className="text-sm text-muted-foreground">
        When we assign you a print or framing job it appears here.
      </p>
    </div>
  )
}

export interface VendorJobsListBodyProps {
  jobs: VendorJobListItem[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * Exactly one of skeleton / error / empty / table. Split out from the page so
 * each state is assertable without a router or a fetch mock.
 */
export function VendorJobsListBody({
  jobs,
  isLoading,
  error,
  onRetry,
}: VendorJobsListBodyProps) {
  if (error) return <JobsError message={error} onRetry={onRetry} />
  if (isLoading) return <JobsSkeleton />
  if (jobs.length === 0) return <JobsEmpty />

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="vendor-jobs-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Work</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 text-right font-medium">You are paid</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            // What we will actually pay: the agreed amount unless a final one
            // has been recorded. Never a zero when neither parses.
            const amount = formatVendorAmount(vendorJobPayableAmount(job))

            return (
              <tr
                key={job.id}
                data-testid={`vendor-job-row-${job.id}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">
                  <Link
                    to="/vendor/jobs/$id"
                    params={{ id: job.id }}
                    className="font-mono text-xs font-medium text-brand-600 hover:underline"
                  >
                    {/* The job id is the only handle a vendor gets, and the only
                        one they need. It joins to nothing person-shaped. */}
                    {job.id.slice(0, 8)}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    Added {formatVendorDate(job.createdAt)}
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">{job.stage}</td>
                <td className="px-4 py-3">
                  <VendorJobStatusPill status={job.status} />
                </td>
                <td className="px-4 py-3">
                  <DueCell dueAt={job.dueAt} />
                </td>
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

export async function fetchVendorJobs(params: VendorJobsSearch): Promise<VendorJobsResponse> {
  const query = new URLSearchParams()
  // The API is limit/offset; the URL is page/pageSize. Converted here so the
  // address bar stays readable and shareable.
  query.set('limit', String(params.pageSize))
  query.set('offset', String((params.page - 1) * params.pageSize))
  if (params.status) query.set('status', params.status)

  const response = await fetch(`${getApiUrl()}/api/vendor/jobs?${query.toString()}`, {
    // The session cookie is the only thing `requireVendor` reads; without this
    // every request is a 401.
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load your jobs')
  }

  return (await response.json()) as VendorJobsResponse
}

function VendorJobsPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [page, setPage] = useState<VendorJobsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The parcels are read SEPARATELY from the queue and their failures stay
  // separate too: a transfer list that would not load must not blank a queue
  // that did, and re-filtering the queue must not re-read the parcels.
  const [transfers, setTransfers] = useState<VendorTransfer[] | null>(null)
  const [transfersLoading, setTransfersLoading] = useState(true)
  const [transfersError, setTransfersError] = useState<string | null>(null)
  const [busyTransferId, setBusyTransferId] = useState<string | null>(null)
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({})
  const [olderNotListed, setOlderNotListed] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchVendorJobs(search)
      setPage(data)
      setError(null)
    } catch (loadError) {
      // The stale page goes with the error. Rows from the last successful load
      // sitting under a failure banner is how a stale queue gets worked.
      setPage(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [search])

  /**
   * Two reads, because the strip answers two different questions.
   *
   * **What must I confirm** has to be complete: this screen is the only place
   * an arrival can be confirmed (`jobs/$id.tsx` deliberately offers no control
   * and points here), so a parcel that falls off the end of a page is
   * confirmable from nowhere. A single unfiltered page of twenty, ordered
   * `created_at DESC` across BOTH directions, is exactly how that happens to a
   * print shop: its own outbound legs fill the page and the box on its bench is
   * not on it. So `fetchInboundAwaitingArrival` walks `direction=inbound` to
   * exhaustion and keeps only the actionable rows.
   *
   * **What has been moving lately** is recent by nature and stays one page.
   * Nothing on those rows is a control, so a row falling off the bottom costs a
   * vendor nothing they cannot get by asking.
   *
   * `Promise.all` rather than two independent states: they render as one list,
   * and a strip that showed half of itself beside an error would be claiming
   * the other half is empty.
   */
  const loadTransfers = useCallback(async () => {
    setTransfersLoading(true)
    try {
      const [awaiting, recent] = await Promise.all([
        fetchInboundAwaitingArrival(),
        // No `direction` here: both ends, which is the API's own default and
        // the only read that shows a vendor their own outbound legs at all.
        fetchVendorTransfers({ limit: VENDOR_TRANSFERS_RECENT_LIMIT }),
      ])
      setTransfers(mergeTransferRows(awaiting.items, recent.items))
      setOlderNotListed(awaiting.truncated)
      setTransfersError(null)
    } catch (transfersLoadError) {
      setTransfers(null)
      setOlderNotListed(false)
      setTransfersError((transfersLoadError as Error).message)
    } finally {
      setTransfersLoading(false)
    }
  }, [])

  // What can be SENT. Its own hook, because both of #714's races live in the
  // loading rather than in the markup; the strip is re-read on success because
  // a despatch puts a new outbound leg on it.
  const despatch = useVendorDespatch(useCallback(() => void loadTransfers(), [loadTransfers]))

  const confirmArrival = async (id: string) => {
    setBusyTransferId(id)
    setTransferErrors((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })

    try {
      await markVendorTransferReceived(id)
      // Re-read rather than patch: the server stamps `received_at` from its own
      // clock, and an optimistic row would print a time nothing recorded.
      await loadTransfers()
    } catch (receiveError) {
      // Kept on the ROW. One refused confirmation must not take the strip down.
      setTransferErrors((current) => ({ ...current, [id]: (receiveError as Error).message }))
    } finally {
      setBusyTransferId(null)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadTransfers()
  }, [loadTransfers])

  const updateSearch = (updates: Partial<VendorJobsSearch>) => {
    void navigate({
      to: '/vendor',
      // A merged object rather than the `(prev) => ...` reducer form: the
      // reducer's return type does not typecheck against TanStack's
      // `ParamsReducerFn` here, and `search` already IS `prev`.
      search: {
        ...search,
        ...updates,
        // Any filter change resets to page one, or page 4 of the old result set
        // silently becomes an empty page of the new one.
        page: updates.page ?? 1,
      },
    })
  }

  const jobs = page?.items ?? []
  // No total comes back from this endpoint, so no page count is printed. A
  // full page means there may be another; that is all the response supports.
  const hasNextPage = !error && !isLoading && jobs.length === search.pageSize

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">My jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What to work on next. Open a job for its items and artwork.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters — in the URL, so a filtered queue is a link */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            data-testid="vendor-jobs-filter-status"
            value={search.status ?? ''}
            onChange={(e) =>
              updateSearch({
                status: (e.target.value || undefined) as VendorJobStatus | undefined,
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Any status</option>
            {VENDOR_JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {vendorStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        {search.status && (
          <Button type="button" variant="ghost" onClick={() => updateSearch({ status: undefined })}>
            Clear filter
          </Button>
        )}
      </div>

      {/* Parcels, above the queue: a piece that has not landed is the reason a
          job in the list below cannot be started, and it is vendor-level news
          rather than job-level, so it belongs on the screen a vendor lands on. */}
      {/* Ready to send, above the parcels already moving: this is the one
          control that turns finished work into a parcel, and without it "Mark
          handed over" on a job could only be satisfied by an order that already
          carried an AWB. */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Ready to send</h2>
        <VendorDespatchPanel
          despatch={{
            data: despatch.data,
            isLoading: despatch.isLoading,
            error: despatch.error,
            onRetry: despatch.reload,
            onDespatch: despatch.despatch,
            busyGroupIds: despatch.busyGroupIds,
            groupErrors: despatch.groupErrors,
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Parcels</h2>
        <VendorTransferStrip
          transfers={{
            data: transfers,
            isLoading: transfersLoading,
            error: transfersError,
            onRetry: () => void loadTransfers(),
            onReceived: confirmArrival,
            busyId: busyTransferId,
            rowErrors: transferErrors,
            olderNotListed,
          }}
        />
      </section>

      <VendorJobsListBody
        jobs={jobs}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
      />

      {/* Pagination. Hidden while loading or failed — a page indicator over a
          failed request is another confident number that is not true. */}
      {!isLoading && !error && (search.page > 1 || hasNextPage) && (
        <div
          data-testid="vendor-jobs-pagination"
          className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
        >
          <span className="text-muted-foreground">Page {search.page}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={search.page <= 1}
              onClick={() => updateSearch({ page: search.page - 1 })}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNextPage}
              onClick={() => updateSearch({ page: search.page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Re-exported so the stage vocabulary has one home the screens agree on. */
export { VENDOR_JOB_STAGES }
