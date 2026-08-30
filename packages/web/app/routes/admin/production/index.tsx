/**
 * Admin — the production queue.
 *
 * What is out being made, who is making it, what it will cost and where it has
 * got to. `GET /api/admin/production` is gated with `requireAdmin`, not
 * `requireContentManager`, because a job carries what we pay a supplier — and
 * `admin-nav.ts` keeps `/admin/production` out of
 * `CONTENT_MANAGER_ALLOWED_PREFIXES` so the route guard agrees with the API.
 *
 * ## Nothing here writes the vocabulary down
 *
 * `PRODUCTION_STATUSES` used to be a verbatim copy of the enum, under a comment
 * admitting it was "a vocabulary, not a state machine". Both halves of that are
 * now false: the tuple and the matrix live in
 * `@chobii/shared/schemas/production-transitions`, and this screen derives
 * everything it offers from them.
 *
 * - The filter is `PRODUCTION_JOB_STATUSES` minus `UNREACHABLE_STATUSES`. A
 *   status with no in-edge and no out-edge is retired, so filtering by it would
 *   offer a view that is empty by construction. That is decision 9 read off the
 *   matrix rather than restated: the retirement moves when the matrix moves.
 * - `ASSIGNABLE_STATUSES` is every status the matrix gives an admin an edge to
 *   `assigned` from. Ticking a box on any other job would be offering an action
 *   the API answers with a 409.
 *
 * #696 is why this matters more than tidiness: the enum grew `qc_submitted` and
 * `dispatched`, the hardcoded seven-value list here did not, and the result was
 * a blank badge and a filter that silently dropped the row. A derived list
 * cannot fall behind that way, and `StatusPill` still refuses to index blind —
 * a status with no label renders its raw value, so an unfamiliar row is legible
 * rather than invisible.
 *
 * The labels are this screen's own, and deliberately not the schema's words.
 * "Sent"/"Received" was the neutral wording that let the sent/received
 * ambiguity survive two tickets, so each label names what is true and who is
 * blocked: `received` is the vendor holding everything it needs, `qc_submitted`
 * is work finished and the ball in OUR court, `dispatched` is this vendor's
 * custody ended.
 *
 * ## The search schema is the fragile part
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every value a STRING coming in (`URLSearchParams` entries) and `String(value)`
 * going out. So `validateSearch` receives `{ page: '2' }`, never `{ page: 2 }`,
 * and a schema written against real numbers throws on the first navigation. A
 * throw inside `validateSearch` is not a validation message — the route
 * error-boundaries and the admin gets a blank page with nothing to read.
 *
 * Three rules in `productionSearchSchema`, all covered by
 * `tests/routes/admin/production-queue.test.tsx`:
 *
 * 1. Every non-string param is `z.coerce`-d.
 * 2. Every field `.catch(...)`es to a usable default, so a stale bookmark
 *    degrades to the default view rather than to a blank one.
 * 3. Enum params are split on the comma FIRST. Nothing here is a real
 *    multi-select — the API takes one `stage` and one `status` — but a URL can
 *    still arrive carrying `?status=draft,dispatched` from a hand edit or from
 *    something that joined an array, and both of the other options are wrong:
 *    dropping it shows an unfiltered queue that looks filtered, and throwing
 *    blanks the route. `scopeListParam` in `routes/admin/promotions/index.tsx`
 *    is the same preprocessor for a param the API really does take as a list.
 *
 * ## Assigning many jobs at once, with no batch entity
 *
 * Decision 2: the queue multi-selects and assigns many jobs to one vendor in
 * one action, and each job stays independent with its own status, dates and
 * payable. There is no `production_batches` table and there must not be one, so
 * this is N calls to `POST /:jobId/assign` — the route that already takes
 * `FOR UPDATE`, prices from the rate card live at that instant, and refuses an
 * unpriced item with a 422 rather than writing a zero.
 *
 * That shape dictates the error handling. **Per job atomic, batch level
 * partial**: one unpriced job must not block nine good ones, so the loop never
 * aborts and `assignJobsToVendor` returns an outcome per job. `BulkAssignResults`
 * then names each refusal and each unpriced item with its size, mirroring
 * `AssignmentFailure` on the detail screen — a refusal an admin cannot act on
 * is a support ticket, and "add a rate band for 36×48" is a thirty-second fix
 * only if the screen says which size.
 *
 * The confirm step is inline and two-step. Native `confirm()`/`alert()` block
 * the automation harness outright (`reviews.tsx:269`), which is how nine admin
 * destructive paths ended up with no E2E coverage at all.
 *
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error, mutually exclusive — on the queue itself and on
 * the supplier picker inside the bulk bar. On failure the body renders the
 * error and nothing else: no zero jobs, no ₹0 payable, no dash standing in for
 * a count. #602 and #606 are both open bugs about an admin surface printing a
 * confident zero that was really a failed request.
 *
 * ## Paginated from day one
 *
 * The API defaults to 20 rows and caps at 100; the page number lives in the URL
 * so a filtered page is a link an admin can send to someone else.
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw } from 'lucide-react'
import {
  PRODUCTION_JOB_STATUSES,
  UNREACHABLE_STATUSES,
  nextStatuses,
  type ProductionJobStatus,
} from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { PRODUCTION_PAGE_SIZE } from '~/lib/admin-nav'

// ============================================================================
// Vocabulary — derived from the shared matrix, written down nowhere
// ============================================================================

export const PRODUCTION_STAGES = ['print', 'frame'] as const
export type ProductionStage = (typeof PRODUCTION_STAGES)[number]

/**
 * Re-exported so the detail screen and this one cannot disagree about what a
 * status IS. The tuple itself belongs to
 * `@chobii/shared/schemas/production-transitions`, which mirrors the pgEnum in
 * enum order and is asserted against it on the API side.
 */
export type ProductionStatus = ProductionJobStatus

/**
 * A list derived from a filter is an array, and `z.enum` needs a non-empty
 * tuple. Narrowing here rather than casting at the call site means a matrix
 * that ever retired *everything* fails loudly at module load instead of
 * producing a filter with no options and no explanation.
 */
function nonEmpty<T>(values: readonly T[], what: string): [T, ...T[]] {
  const [first, ...rest] = values
  if (first === undefined) throw new Error(`admin production queue: ${what} derived empty`)
  return [first, ...rest]
}

/**
 * The statuses this screen offers as a filter: the shared vocabulary, minus
 * whatever the matrix has retired.
 *
 * `UNREACHABLE_STATUSES` is "no in-edges and no out-edges" — nothing can
 * produce one and nothing can leave one — which is precisely decision 9's
 * retirement. Deriving it means the day a value is retired or un-retired in the
 * matrix, this filter follows without an edit here.
 */
export const PRODUCTION_STATUSES = nonEmpty(
  PRODUCTION_JOB_STATUSES.filter((status) => !UNREACHABLE_STATUSES.includes(status)),
  'PRODUCTION_STATUSES'
)

/**
 * The statuses an admin can assign FROM, read straight off the matrix.
 *
 * Today: `draft`, `assigned` (reassignment before work starts, which re-prices)
 * and `qc_failed` (rework sent elsewhere, which also re-prices). Written as a
 * question to `nextStatuses` rather than as those three words, because a list
 * of three words is a fourth copy of the state machine and #684 is the standing
 * bill for one of those.
 */
export const ASSIGNABLE_STATUSES: readonly ProductionStatus[] =
  PRODUCTION_JOB_STATUSES.filter((from) => nextStatuses(from, 'admin').includes('assigned'))

export const STAGE_LABELS: Record<ProductionStage, string> = {
  print: 'Print',
  frame: 'Frame',
}

/**
 * What each status means to the person reading the queue.
 *
 * Deliberately not the schema's words. The old labels said "Sent" and
 * "Received" — neutral enough that nobody had to decide who had what, which is
 * how the ambiguity survived two tickets. Each label below is read off the
 * transition matrix rather than invented:
 *
 * - `assigned` — a vendor holds it and has been priced; work has not started.
 * - `received` — re-meant. It no longer means a piece came back to us; it means
 *   the vendor has everything needed to start (artwork for a print job, the
 *   printed sheet for a frame job) and is making it.
 * - `qc_submitted` — work finished, shot list uploaded, **blocked on us**. It is
 *   the only status where the ball is in our court, and it is the entire content
 *   of the admin QC queue, so the label says so.
 * - `dispatched` — this vendor's custody has ended, to the next vendor or to the
 *   courier. Terminal: a lost parcel creates a new job, never resurrects this one.
 *
 * The retired status has no entry, because the screen offers no view of it. The
 * assertion below is the price of that: the map is a total `Record` to every
 * caller — `$id.tsx` indexes it straight into JSX and needs a `string` — while
 * carrying only the keys this screen actually renders.
 *
 * That trades a compile-time exhaustiveness check for a test-time one, and the
 * test is the stronger of the two here: `PRODUCTION_STATUSES` is derived at
 * runtime from the matrix, so `it.each([...PRODUCTION_STATUSES])` in
 * `production-queue.test.tsx` asserts a label and a style for whatever the
 * matrix currently reaches — including a status added after this file was last
 * opened, which a `Record` over a runtime-derived list could never catch.
 * `StatusPill` covers the gap in the meantime by falling back to the raw value.
 */
export const STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Assigned to vendor',
  received: 'In production',
  qc_submitted: 'Awaiting our QC',
  qc_passed: 'QC passed',
  qc_failed: 'QC failed — rework',
  dispatched: 'Dispatched by vendor',
  cancelled: 'Cancelled',
} as Record<ProductionStatus, string>

/**
 * Colour follows the same reading. Amber is reserved for the one status that is
 * waiting on us, so scanning the queue for our own backlog is a glance.
 */
export const STATUS_STYLES = {
  draft: 'bg-muted text-muted-foreground border-border',
  assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  received: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  qc_submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  qc_passed: 'bg-green-50 text-green-700 border-green-200',
  qc_failed: 'bg-red-50 text-red-700 border-red-200',
  dispatched: 'bg-slate-100 text-slate-700 border-slate-300',
  cancelled: 'bg-muted text-muted-foreground border-border line-through',
} as Record<ProductionStatus, string>

/**
 * What a status this screen has no label for gets.
 *
 * There is one today — the retired value, on rows in an environment where
 * `db:retire-sent-status` has not run — and there will be another the moment
 * the enum grows again. Either way the row renders its raw value in a neutral,
 * dashed pill: legible, and obviously unfamiliar. #696 is the alternative, an
 * empty badge that reads as a rendering fault rather than as a status.
 */
const UNKNOWN_STATUS_STYLE = 'bg-muted text-muted-foreground border-dashed border-border'

// ============================================================================
// Route configuration
// ============================================================================

/** The API's own cap. Asking beyond it just gets clamped there anyway. */
const MAX_PAGE_SIZE = 100

/**
 * Split on the comma, keep the first member the enum recognises, and fall back
 * to undefined. See rule 3 in the header: this is the difference between a
 * usable queue and a blank error boundary.
 */
function firstOfCommaList<T extends string>(allowed: readonly T[]) {
  return (raw: unknown): T | undefined => {
    if (typeof raw !== 'string') return undefined
    for (const part of raw.split(',')) {
      const candidate = part.trim() as T
      if (allowed.includes(candidate)) return candidate
    }
    return undefined
  }
}

export const productionSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .catch(PRODUCTION_PAGE_SIZE)
    .default(PRODUCTION_PAGE_SIZE)
    // Clamped rather than rejected: `?pageSize=100000` should show a page, not
    // a blank error boundary.
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  stage: z.preprocess(
    firstOfCommaList(PRODUCTION_STAGES),
    z.enum(PRODUCTION_STAGES).optional().catch(undefined)
  ),
  status: z.preprocess(
    firstOfCommaList(PRODUCTION_STATUSES),
    z.enum(PRODUCTION_STATUSES).optional().catch(undefined)
  ),
  /**
   * Dropped rather than forwarded when it is not a uuid: the API answers a
   * malformed `vendorId` with a 400, which this screen would then have to
   * render as a failure the admin cannot act on.
   */
  vendorId: z.string().uuid().optional().catch(undefined),
})

export type ProductionSearch = z.infer<typeof productionSearchSchema>

export const Route = createFileRoute('/admin/production/')({
  validateSearch: (search) => productionSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Production | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminProductionQueuePage,
})

// ============================================================================
// Types — the GET /api/admin/production payload, verbatim
// ============================================================================

export interface AdminProductionJobListItem {
  id: string
  orderId: string
  stage: ProductionStage
  /**
   * The whole shared vocabulary, retired values included. Rows carry the retired
   * one until `db:retire-sent-status` has run in that environment, and a row
   * type that pretended otherwise would make the blank badge a compile-time
   * impossibility and a runtime certainty — which is #696, exactly.
   */
  status: ProductionStatus
  vendorId: string | null
  /** From the LEFT join — null while the job is still a draft. */
  vendorName: string | null
  assignedAt: string | null
  sentAt: string | null
  dueAt: string | null
  receivedAt: string | null
  /** decimal(10,2) INR as strings, exactly as lib/vendor-payables formats them. */
  amountExpected: string | null
  amountActual: string | null
  settlementId: string | null
  createdAt: string
  updatedAt: string
  /** COALESCE(actual, expected), computed by the payables module. */
  payableAmount: string
}

export interface AdminProductionPage {
  items: AdminProductionJobListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Rupees. Returns null rather than a zero when the string is not a number —
 * the caller shows "unavailable" instead, because a wrong ₹0 beside a job reads
 * as "this one is free".
 */
export function formatRupees(value: string | null | undefined): string | null {
  if (value == null) return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * A status, in words as well as in colour — a coloured pill alone is invisible
 * to a screen reader and to a colourblind admin.
 *
 * Takes a plain string rather than `ProductionStatus`, because the value comes
 * off a row and a row may carry a status this screen has not been taught. The
 * lookups both fall back, so the worst case is an unfamiliar word in a neutral
 * pill rather than an empty badge nobody can explain.
 */
export function StatusPill({ status }: { status: string }) {
  // `?? `, not a plain lookup: STATUS_LABELS is a total Record by assertion and
  // not by construction, and this is the one place that has to survive being
  // handed a status it has no entry for.
  const label = (STATUS_LABELS as Partial<Record<string, string>>)[status] ?? status
  const style =
    (STATUS_STYLES as Partial<Record<string, string>>)[status] ?? UNKNOWN_STATUS_STYLE

  return (
    <span
      data-testid={`admin-production-status-${status}`}
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        style
      )}
    >
      {label}
    </span>
  )
}

/**
 * Whether an admin could assign THIS job to a vendor right now.
 *
 * Two refusals, both the API's:
 *
 * 1. The transition matrix — only the `ASSIGNABLE_STATUSES` rows carry an admin
 *    edge to `assigned`. Anything else is a 409.
 * 2. Settlement. A settled job is frozen because payables are DERIVED with no
 *    stored total, so re-pricing one makes the settlement's amount disagree
 *    with the sum of its jobs, silently. The assign route refuses it with a 409
 *    before it reads anything else, and a tick box that leads only to that
 *    refusal is a worse control than no tick box.
 */
export function isAssignable(job: AdminProductionJobListItem): boolean {
  if (job.settlementId !== null) return false
  return ASSIGNABLE_STATUSES.includes(job.status)
}

/** "24x36" as the API spells it, "24×36" as a person reads it. */
function prettySize(size: string | null): string | null {
  if (!size) return null
  return size.replace(/x/i, '×')
}

// ============================================================================
// The three list states
// ============================================================================

function ProductionSkeleton() {
  return (
    <div
      data-testid="admin-production-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading production jobs"
    >
      {['a', 'b', 'c', 'd', 'e'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * The error state carries no numbers at all, on purpose. A failed request that
 * still prints "0 jobs" is #602; the test asserts this block is digit-free.
 */
function ProductionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="admin-production-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is shown below because nothing was loaded — the queue has not been
        read, which is not the same as it being empty.
      </p>
      <Button
        type="button"
        variant="outline"
        data-testid="admin-production-retry"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  )
}

function ProductionEmpty() {
  return (
    <div
      data-testid="admin-production-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">No production jobs match this view</p>
      <p className="text-sm text-muted-foreground">
        Clear the filters, or raise a job from an order&rsquo;s production panel.
      </p>
    </div>
  )
}

export interface ProductionQueueBodyProps {
  jobs: AdminProductionJobListItem[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  /** Which jobs are ticked. Optional so each list state renders standalone. */
  selectedIds?: ReadonlySet<string>
  onToggleJob?: (jobId: string) => void
  /**
   * Handed every assignable id ON THIS PAGE, and nothing else. Select-all that
   * silently reached the other 400 rows of a filtered query would be a batch
   * write nobody asked for; select-all that ticked a `dispatched` job would be
   * ten refusals the admin has to read.
   */
  onToggleAll?: (assignableIds: string[]) => void
}

const NOTHING_SELECTED: ReadonlySet<string> = new Set()

/**
 * Exactly one of skeleton / error / empty / table. Split out from the page so
 * each state can be asserted without standing up a router or a fetch mock.
 */
export function ProductionQueueBody({
  jobs,
  isLoading,
  error,
  onRetry,
  selectedIds = NOTHING_SELECTED,
  onToggleJob,
  onToggleAll,
}: ProductionQueueBodyProps) {
  // Error wins over loading and over emptiness: an empty state after a failed
  // request is a lie about the data.
  if (error) return <ProductionError message={error} onRetry={onRetry} />
  if (isLoading) return <ProductionSkeleton />
  if (jobs.length === 0) return <ProductionEmpty />

  const assignableIds = jobs.filter(isAssignable).map((job) => job.id)
  const allAssignableSelected =
    assignableIds.length > 0 && assignableIds.every((id) => selectedIds.has(id))

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="admin-production-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                data-testid="admin-production-select-all"
                aria-label="Select every assignable job on this page"
                className="h-4 w-4 rounded border-border align-middle"
                disabled={assignableIds.length === 0}
                checked={allAssignableSelected}
                onChange={() => onToggleAll?.(assignableIds)}
              />
            </th>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 text-right font-medium">Payable</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const payable = formatRupees(job.payableAmount)
            const assignable = isAssignable(job)

            return (
              <tr
                key={job.id}
                data-testid={`admin-production-row-${job.id}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">
                  {/* Rendered disabled rather than omitted: a missing box in
                      one row of a column of boxes reads as a rendering fault.
                      The title says which of the two refusals applies, so the
                      admin does not go and find out from a 409. */}
                  <input
                    type="checkbox"
                    data-testid={`admin-production-select-${job.id}`}
                    aria-label={`Select job ${job.id.slice(0, 8)} for assignment`}
                    className="h-4 w-4 rounded border-border align-middle"
                    disabled={!assignable}
                    checked={selectedIds.has(job.id)}
                    title={
                      assignable
                        ? undefined
                        : job.settlementId !== null
                          ? 'Settled jobs are frozen and cannot be re-priced'
                          : `A job in ${(STATUS_LABELS as Partial<Record<string, string>>)[job.status] ?? job.status} cannot be assigned`
                    }
                    onChange={() => onToggleJob?.(job.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/admin/production/$id"
                    params={{ id: job.id }}
                    className="font-mono text-xs font-medium text-brand-600 hover:underline"
                  >
                    {job.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3">{STAGE_LABELS[job.stage]}</td>
                <td className="px-4 py-3">
                  <StatusPill status={job.status} />
                </td>
                <td className="px-4 py-3">
                  {/* "Unassigned" in words: an empty cell reads as a rendering
                      bug rather than as work waiting for a supplier. */}
                  {job.vendorName ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(job.dueAt)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {/* Never a fallback zero: an unreadable amount says so. */}
                  {payable ?? <span className="text-destructive">Unavailable</span>}
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
// Assigning many jobs to one vendor
// ============================================================================

/** One item the vendor has no rate band for, as the 422 names it. */
export interface UnpricedItem {
  orderItemId: string
  longestEdge: number | null
  size: string | null
}

/** What the bulk bar needs of a vendor. `GET /api/admin/vendors`, narrowed. */
export interface AssignableVendor {
  id: string
  name: string
}

/**
 * What happened to ONE job. There is no batch-level verdict, because there is
 * no batch — each POST is its own transaction and its own audit row.
 */
export interface AssignOutcome {
  jobId: string
  assigned: boolean
  /** The API's own sentence, kept verbatim. Null only when it was assigned. */
  error: string | null
  /** `JOB_SETTLED`, `VENDOR_MISMATCH`, `ILLEGAL_TRANSITION` … when the API sent one. */
  code: string | null
  /** Empty for anything that is not the 422. */
  unpriced: UnpricedItem[]
}

interface AssignFailureBody {
  error?: string
  code?: string
  unpriced?: UnpricedItem[]
}

async function assignOneJob(jobId: string, vendorId: string): Promise<AssignOutcome> {
  try {
    const response = await fetch(`${getApiUrl()}/api/admin/production/${jobId}/assign`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // No `expectedVendorId`. The compare-and-swap is for a screen that has
      // been staring at one job; a queue row read seconds ago would turn every
      // concurrent edit into a 409 the admin cannot interpret from here.
      body: JSON.stringify({ vendorId }),
    })

    if (response.ok) {
      return { jobId, assigned: true, error: null, code: null, unpriced: [] }
    }

    const body = (await response.json().catch(() => ({}))) as AssignFailureBody
    return {
      jobId,
      assigned: false,
      error: body.error ?? `Failed to assign this job (HTTP ${response.status})`,
      code: body.code ?? null,
      unpriced: body.unpriced ?? [],
    }
  } catch (failure) {
    // A thrown request is THIS job's refusal, not the batch's. Letting it
    // propagate would abandon every job after it with no record of whether it
    // was written — the one outcome worse than a refusal.
    return {
      jobId,
      assigned: false,
      error: (failure as Error).message,
      code: null,
      unpriced: [],
    }
  }
}

/**
 * Assign N jobs to one vendor. Per job atomic, batch level partial.
 *
 * Sequential on purpose. Each POST takes `FOR UPDATE` on its job and may write
 * the order's consolidator row, so two jobs of one order contend; serialising
 * here keeps the outcomes in the order the admin ticked them and keeps a
 * twenty-job batch from arriving as twenty simultaneous transactions.
 *
 * Never throws. The caller renders outcomes, and an outcome exists for every
 * job id it was given, in that order.
 */
export async function assignJobsToVendor(
  jobIds: readonly string[],
  vendorId: string
): Promise<AssignOutcome[]> {
  const outcomes: AssignOutcome[] = []
  for (const jobId of jobIds) {
    outcomes.push(await assignOneJob(jobId, vendorId))
  }
  return outcomes
}

/** The active suppliers, for the picker. The API clamps pageSize at 100. */
export async function fetchActiveVendors(): Promise<AssignableVendor[]> {
  const query = new URLSearchParams({
    status: 'active',
    page: '1',
    pageSize: '100',
  })

  const response = await fetch(`${getApiUrl()}/api/admin/vendors?${query.toString()}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load vendors')
  }

  const page = (await response.json()) as { items: AssignableVendor[] }
  return page.items.map((vendor) => ({ id: vendor.id, name: vendor.name }))
}

export interface BulkAssignBarProps {
  selectedCount: number
  vendors: AssignableVendor[]
  vendorsLoading: boolean
  vendorsError: string | null
  onRetryVendors: () => void
  vendorId: string | null
  onVendorChange: (vendorId: string | null) => void
  onAssign: () => void
  isAssigning: boolean
  onClearSelection: () => void
}

/**
 * The multi-select action bar.
 *
 * Two things it is not: a native dialog, and a batch. `confirm()` blocks the
 * automation harness outright — `reviews.tsx:270` is the write-up, and nine
 * admin destructive paths with no E2E coverage is the bill — so the second step
 * is inline. And the bar assigns N independent jobs; it creates nothing that
 * groups them, because decision 2 says the grouping would have to be a table
 * and the table would have to be maintained.
 */
export function BulkAssignBar({
  selectedCount,
  vendors,
  vendorsLoading,
  vendorsError,
  onRetryVendors,
  vendorId,
  onVendorChange,
  onAssign,
  isAssigning,
  onClearSelection,
}: BulkAssignBarProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  // Nothing ticked, nothing to say. Rendered as null rather than hidden so the
  // bar cannot be reached by a keyboard tab into an invisible control.
  if (selectedCount === 0) return null

  const vendorName = vendors.find((v) => v.id === vendorId)?.name ?? null

  return (
    <div
      data-testid="admin-production-bulk-bar"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4"
    >
      <p className="text-sm font-medium">
        {selectedCount} job(s) selected
      </p>

      {/* The picker's own three states. An empty select would read as "we have
          no suppliers", which is a different claim from "the list did not
          load". */}
      {vendorsError ? (
        <div
          data-testid="admin-production-bulk-vendors-error"
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          <span>{vendorsError}</span>
          <Button
            type="button"
            variant="outline"
            data-testid="admin-production-bulk-vendors-retry"
            onClick={onRetryVendors}
          >
            Try again
          </Button>
        </div>
      ) : vendorsLoading ? (
        <div
          data-testid="admin-production-bulk-vendors-skeleton"
          className="h-9 w-56 animate-pulse rounded bg-muted"
          aria-busy="true"
          aria-label="Loading suppliers"
        />
      ) : vendors.length === 0 ? (
        <p
          data-testid="admin-production-bulk-vendors-empty"
          className="text-sm text-muted-foreground"
        >
          No active supplier to assign to. Activate one on the vendor directory
          first.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Assign to
          <select
            data-testid="admin-production-bulk-vendor"
            value={vendorId ?? ''}
            disabled={isAssigning || isConfirming}
            onChange={(e) => onVendorChange(e.target.value || null)}
            className="h-9 w-56 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Choose a supplier</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isConfirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Assign {selectedCount} job(s) to {vendorName ?? 'this supplier'}? Each is
            priced from its rate card at the moment it is written, and any that
            cannot be priced are refused on their own.
          </p>
          <Button
            type="button"
            variant="solid"
            data-testid="admin-production-bulk-confirm"
            disabled={isAssigning}
            onClick={() => {
              setIsConfirming(false)
              onAssign()
            }}
          >
            {isAssigning ? 'Assigning…' : 'Yes, assign'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-testid="admin-production-bulk-cancel"
            onClick={() => setIsConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="solid"
          data-testid="admin-production-bulk-assign"
          disabled={vendorId === null || isAssigning}
          onClick={() => setIsConfirming(true)}
        >
          {isAssigning ? 'Assigning…' : `Assign ${selectedCount} job(s)`}
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        data-testid="admin-production-bulk-clear"
        disabled={isAssigning}
        onClick={() => {
          setIsConfirming(false)
          onClearSelection()
        }}
      >
        Clear selection
      </Button>
    </div>
  )
}

export interface BulkAssignResultsProps {
  outcomes: AssignOutcome[]
  vendorName: string | null
  onDismiss: () => void
}

/**
 * What the batch actually did, per job.
 *
 * A refusal a user cannot act on is a support ticket, so this mirrors
 * `AssignmentFailure` on the detail screen: it names the job, it names the
 * API's own sentence, and for the 422 it names each item WITH ITS SIZE. "Add a
 * rate band covering 36×48" is a thirty-second fix; "assignment failed" is a
 * database query.
 */
export function BulkAssignResults({
  outcomes,
  vendorName,
  onDismiss,
}: BulkAssignResultsProps) {
  if (outcomes.length === 0) return null

  const assigned = outcomes.filter((o) => o.assigned)
  const refused = outcomes.filter((o) => !o.assigned)

  return (
    <div
      data-testid="admin-production-bulk-results"
      role="status"
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">
            {assigned.length} job(s) assigned{vendorName ? ` to ${vendorName}` : ''}.
          </p>
          {refused.length > 0 && (
            <p className="text-destructive">
              {refused.length} job(s) refused — nothing was written for those. Each
              job is written on its own, so the ones above stand.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          data-testid="admin-production-bulk-results-dismiss"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>

      {refused.length > 0 && (
        <ul data-testid="admin-production-bulk-refusals" className="space-y-3">
          {refused.map((outcome) => (
            <li
              key={outcome.jobId}
              data-testid={`admin-production-bulk-result-${outcome.jobId}`}
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3"
            >
              <p className="mb-1">
                <span className="font-mono text-xs font-medium">
                  {outcome.jobId.slice(0, 8)}
                </span>{' '}
                — {outcome.error}
              </p>

              {outcome.unpriced.length > 0 && (
                <>
                  <p className="mb-1 text-muted-foreground">
                    No rate band covers these item(s):
                  </p>
                  <ul className="space-y-1">
                    {outcome.unpriced.map((miss) => {
                      // The size the API echoed back, then an explicit
                      // "unknown" — never a blank and never a 0, which beside a
                      // job reads as "this one is free".
                      const size =
                        prettySize(miss.size) ??
                        'Unknown size (no dimensions recorded)'
                      const edge =
                        miss.longestEdge === null
                          ? 'unknown longest edge'
                          : `${miss.longestEdge}″ longest edge`

                      return (
                        <li
                          key={miss.orderItemId}
                          data-testid={`admin-production-bulk-unpriced-${outcome.jobId}-${miss.orderItemId}`}
                          className="font-medium"
                        >
                          {size}{' '}
                          <span className="text-muted-foreground">— {edge}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export async function fetchProductionJobs(
  params: ProductionSearch
): Promise<AdminProductionPage> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  if (params.stage) query.set('stage', params.stage)
  if (params.status) query.set('status', params.status)
  if (params.vendorId) query.set('vendorId', params.vendorId)

  const response = await fetch(
    `${getApiUrl()}/api/admin/production?${query.toString()}`,
    // Without this every request is a 401 — the session cookie is the only
    // thing the role gate reads.
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load production jobs')
  }

  return (await response.json()) as AdminProductionPage
}

function AdminProductionQueuePage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [page, setPage] = useState<AdminProductionPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- multi-select assign ---------------------------------------------------
  // The selection is NOT in the URL. Every filter is, because a filtered page is
  // a link worth sending; twenty job ids in a query string is not a link anyone
  // would send, and it would survive a browser back into a page where half of
  // them have since been assigned by somebody else.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [vendors, setVendors] = useState<AssignableVendor[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [vendorsError, setVendorsError] = useState<string | null>(null)
  const [assignVendorId, setAssignVendorId] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [outcomes, setOutcomes] = useState<AssignOutcome[]>([])
  const [outcomeVendorName, setOutcomeVendorName] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchProductionJobs(search)
      setPage(data)
      setError(null)
    } catch (loadError) {
      // The stale page is dropped along with the error: showing last page's
      // rows under a failure banner is how a stale number gets believed.
      setPage(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    void load()
  }, [load])

  const loadVendors = useCallback(async () => {
    setVendorsLoading(true)
    try {
      setVendors(await fetchActiveVendors())
      setVendorsError(null)
    } catch (vendorFailure) {
      // The list is dropped with the error, for the same reason the queue drops
      // its rows: a half-read directory under a failure banner is a shortlist
      // somebody will assign from.
      setVendors([])
      setVendorsError((vendorFailure as Error).message)
    } finally {
      setVendorsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadVendors()
  }, [loadVendors])

  /**
   * A filter or page change drops the selection.
   *
   * Keeping it would let an admin tick three jobs, filter to a different view,
   * and assign rows they can no longer see — the batch equivalent of acting on
   * a stale page.
   */
  useEffect(() => {
    setSelectedIds(new Set())
  }, [search])

  const toggleJob = (jobId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (!next.delete(jobId)) next.add(jobId)
      return next
    })
  }

  const toggleAll = (assignableIds: string[]) => {
    setSelectedIds((current) => {
      const allSelected = assignableIds.every((id) => current.has(id))
      const next = new Set(current)
      for (const id of assignableIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const handleBulkAssign = async () => {
    if (assignVendorId === null || selectedIds.size === 0) return

    const jobIds = [...selectedIds]
    setIsAssigning(true)
    setOutcomes([])
    setOutcomeVendorName(vendors.find((v) => v.id === assignVendorId)?.name ?? null)

    try {
      const results = await assignJobsToVendor(jobIds, assignVendorId)
      setOutcomes(results)
      // The refused jobs stay ticked. Fixing a rate band and pressing Assign
      // again is the remedy the results panel names, and re-ticking six of ten
      // rows by hand first is how that remedy stops being taken.
      setSelectedIds(new Set(results.filter((r) => !r.assigned).map((r) => r.jobId)))
      await load()
    } finally {
      setIsAssigning(false)
    }
  }

  const updateSearch = (updates: Partial<ProductionSearch>) => {
    void navigate({
      to: '/admin/production',
      // A merged object rather than the `(prev) => ...` reducer form — the
      // reducer's return type does not typecheck against TanStack's
      // `ParamsReducerFn` here, and `search` already IS `prev`.
      search: {
        ...search,
        ...updates,
        // Any filter change resets to page one; otherwise page 4 of the old
        // result set silently becomes an empty page of the new one.
        page: updates.page ?? 1,
      },
    })
  }

  const total = page?.total ?? null
  const totalPages = page?.totalPages ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">Production</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* `total` is null until a page actually loads, so the count is
                absent rather than zero while the request is in flight. */}
            Work out with suppliers
            {total === null ? '.' : ` — ${total} job(s) in this view.`}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters — every one of them lives in the URL */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Stage
          <select
            data-testid="admin-production-filter-stage"
            value={search.stage ?? ''}
            onChange={(e) =>
              updateSearch({
                stage: (e.target.value || undefined) as ProductionStage | undefined,
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Any stage</option>
            {PRODUCTION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            data-testid="admin-production-filter-status"
            value={search.status ?? ''}
            onChange={(e) =>
              updateSearch({
                status: (e.target.value || undefined) as ProductionStatus | undefined,
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Any status</option>
            {PRODUCTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Vendor ID
          <input
            type="text"
            data-testid="admin-production-filter-vendor"
            placeholder="Paste a vendor id"
            defaultValue={search.vendorId ?? ''}
            onBlur={(e) => {
              const value = e.target.value.trim()
              if (value === (search.vendorId ?? '')) return
              updateSearch({ vendorId: value || undefined })
            }}
            className="h-9 w-72 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {(search.stage || search.status || search.vendorId) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              updateSearch({ stage: undefined, status: undefined, vendorId: undefined })
            }
          >
            Clear filters
          </Button>
        )}
      </div>

      <BulkAssignBar
        selectedCount={selectedIds.size}
        vendors={vendors}
        vendorsLoading={vendorsLoading}
        vendorsError={vendorsError}
        onRetryVendors={() => void loadVendors()}
        vendorId={assignVendorId}
        onVendorChange={setAssignVendorId}
        onAssign={() => void handleBulkAssign()}
        isAssigning={isAssigning}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      <BulkAssignResults
        outcomes={outcomes}
        vendorName={outcomeVendorName}
        onDismiss={() => setOutcomes([])}
      />

      <ProductionQueueBody
        jobs={page?.items ?? []}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
        selectedIds={selectedIds}
        onToggleJob={toggleJob}
        onToggleAll={toggleAll}
      />

      {/* Pagination. Hidden while loading or failed — a page indicator over a
          failed request is another confident number that is not true. */}
      {!isLoading && !error && page && totalPages > 1 && (
        <div
          data-testid="admin-production-pagination"
          className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
        >
          <span className="text-muted-foreground">
            Page {page.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page.page <= 1}
              onClick={() => updateSearch({ page: page.page - 1 })}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={page.page >= totalPages}
              onClick={() => updateSearch({ page: page.page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
