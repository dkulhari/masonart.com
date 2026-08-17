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
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error, mutually exclusive, error winning over both. A
 * failed load renders the error and drops the rows — an empty state after a
 * failed request is a lie about the data, and a `₹0` beside it is #602/#606 on
 * a surface where it would read as "we owe you nothing".
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import {
  VENDOR_JOBS_MAX_PAGE_SIZE,
  VENDOR_JOBS_PAGE_SIZE,
  VENDOR_JOB_STAGES,
  VENDOR_JOB_STATUSES,
  VENDOR_JOB_STATUS_LABELS,
  VENDOR_JOB_STATUS_STYLES,
  daysUntil,
  formatVendorAmount,
  formatVendorDate,
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
  status: VendorJobStatus
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

export function VendorJobStatusPill({ status }: { status: VendorJobStatus }) {
  return (
    // Named in words as well as coloured — a pill that only signals in colour
    // says nothing to a screen reader or a colourblind printer.
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        VENDOR_JOB_STATUS_STYLES[status] ?? 'border-border bg-muted text-muted-foreground'
      )}
    >
      {VENDOR_JOB_STATUS_LABELS[status] ?? status}
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
// The three list states
// ============================================================================

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
            const amount = formatVendorAmount(job.amountActual ?? job.amountExpected)

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

  useEffect(() => {
    void load()
  }, [load])

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
                {VENDOR_JOB_STATUS_LABELS[status]}
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
