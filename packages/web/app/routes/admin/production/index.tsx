/**
 * Admin — the production queue.
 *
 * What has been sent out to be made, who is making it, what it will cost and
 * whether it came back. `GET /api/admin/production` is gated with
 * `requireAdmin`, not `requireContentManager`, because a job carries what we
 * pay a supplier — and `admin-nav.ts` keeps `/admin/production` out of
 * `CONTENT_MANAGER_ALLOWED_PREFIXES` so the route guard agrees with the API.
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
 *    still arrive carrying `?status=draft,sent` from a hand edit or from
 *    something that joined an array, and both of the other options are wrong:
 *    dropping it shows an unfiltered queue that looks filtered, and throwing
 *    blanks the route. `scopeListParam` in `routes/admin/promotions/index.tsx`
 *    is the same preprocessor for a param the API really does take as a list.
 *
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error, mutually exclusive. On failure the body renders
 * the error and nothing else: no zero jobs, no ₹0 payable, no dash standing in
 * for a count. #602 and #606 are both open bugs about an admin surface printing
 * a confident zero that was really a failed request.
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
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { PRODUCTION_PAGE_SIZE } from '~/lib/admin-nav'

// ============================================================================
// Vocabulary — `database/schema/production-jobs.ts`, verbatim
// ============================================================================

export const PRODUCTION_STAGES = ['print', 'frame'] as const

/**
 * A vocabulary, not a state machine. The schema says so and the API PATCH has
 * no transition guard, so this screen offers every value as a filter and makes
 * no claim about which follows which — the workflow belongs to
 * production-pipeline.
 */
export const PRODUCTION_STATUSES = [
  'draft',
  'assigned',
  'sent',
  'received',
  'qc_passed',
  'qc_failed',
  'cancelled',
] as const

export type ProductionStage = (typeof PRODUCTION_STAGES)[number]
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number]

export const STAGE_LABELS: Record<ProductionStage, string> = {
  print: 'Print',
  frame: 'Frame',
}

export const STATUS_LABELS: Record<ProductionStatus, string> = {
  draft: 'Draft',
  assigned: 'Assigned',
  sent: 'Sent',
  received: 'Received',
  qc_passed: 'QC passed',
  qc_failed: 'QC failed',
  cancelled: 'Cancelled',
}

const STATUS_STYLES: Record<ProductionStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  qc_passed: 'bg-green-50 text-green-700 border-green-200',
  qc_failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-muted text-muted-foreground border-border line-through',
}

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

export function StatusPill({ status }: { status: ProductionStatus }) {
  return (
    // In words as well as in colour — a coloured pill alone is invisible to a
    // screen reader and to a colourblind admin.
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
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
}

/**
 * Exactly one of skeleton / error / empty / table. Split out from the page so
 * each state can be asserted without standing up a router or a fetch mock.
 */
export function ProductionQueueBody({
  jobs,
  isLoading,
  error,
  onRetry,
}: ProductionQueueBodyProps) {
  // Error wins over loading and over emptiness: an empty state after a failed
  // request is a lie about the data.
  if (error) return <ProductionError message={error} onRetry={onRetry} />
  if (isLoading) return <ProductionSkeleton />
  if (jobs.length === 0) return <ProductionEmpty />

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="admin-production-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
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

            return (
              <tr
                key={job.id}
                data-testid={`admin-production-row-${job.id}`}
                className="border-b border-border last:border-0"
              >
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

      <ProductionQueueBody
        jobs={page?.items ?? []}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
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
