/**
 * `/vendor/jobs/$id` — one job.
 *
 * Its items, its artwork, its QC history, and the two status changes a vendor
 * is allowed to make. Everything on this page comes from
 * `GET /api/vendor/jobs/:id`, which is scoped by `vendorId` in the WHERE — a
 * job belonging to someone else is a 404 here, not a 403, and this screen shows
 * that 404 as plainly "not found" rather than "not yours". Confirming the job
 * exists is the one fact the API deliberately withholds; the UI must not put it
 * back.
 *
 * ## Artwork URLs are requested AT CLICK TIME
 *
 * `GET /api/vendor/jobs/:id/artwork/:itemId` returns a signed URL that lives
 * five minutes. This screen therefore holds no URL at all: the click calls the
 * endpoint, and the URL it gets back is used immediately and dropped.
 *
 * Fetching them at page load would mean a page left open over lunch has a
 * grid of dead links — and the fix that suggests itself, a longer expiry, is
 * precisely the incident signing exists to prevent. A vendor's artwork link is
 * a customer's commissioned image; a long-lived one stays readable by anyone
 * who ever saw the URL, in a chat log or a proxy log, forever.
 * `tests/routes/vendor/no-customer-data.test.tsx` asserts nothing is fetched
 * from the artwork endpoint on render.
 *
 * ## The two writes, and no native dialogs
 *
 * `sent` and `received` are the only statuses the API will accept from a vendor
 * — passing QC is our verdict to record, not theirs to claim, and amounts are
 * absent from the PATCH schema entirely. Both controls are the two-step inline
 * confirm from `routes/admin/vendors/$id.tsx`: no `window.confirm`, which
 * blocks the browser automation harness and is why nine admin files have no E2E
 * coverage on their destructive paths.
 *
 * ## Nothing here invents a number
 *
 * A failed load renders the error and stops: no ₹0, no dash standing in for an
 * amount, no empty item list for a job that simply failed to fetch.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Download } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import {
  VENDOR_JOBS_SEARCH,
  formatVendorAmount,
  formatVendorDate,
  type VendorJobStage,
  type VendorJobStatus,
} from '~/lib/vendor-nav'
import { DueCell, VendorJobStatusPill } from '~/routes/vendor/index'

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute('/vendor/jobs/$id')({
  head: () => ({
    meta: [
      { title: 'Job | Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorJobDetailPage,
})

// ============================================================================
// Types — the GET /api/vendor/jobs/:id payload, verbatim
// ============================================================================

export interface VendorJob {
  id: string
  stage: VendorJobStage
  status: VendorJobStatus
  dueAt: string | null
  sentAt: string | null
  receivedAt: string | null
  amountExpected: string | null
  amountActual: string | null
}

/**
 * An item is an ID and nothing else.
 *
 * `getVendorJobItems` selects `{ id }` alone — `orderItemId` was removed by the
 * isolation suite in #617 because it joins straight to `order_items.order_id`
 * and from there to the buyer. The artwork route keys on this id, so nothing is
 * missing.
 */
export interface VendorJobItem {
  id: string
}

export interface VendorJobReview {
  id: string
  verdict: 'pass' | 'fail'
  defects: string[] | null
  notes: string | null
  createdAt: string
}

export interface VendorJobDetailResponse {
  job: VendorJob
  items: VendorJobItem[]
  reviews: VendorJobReview[]
}

export interface VendorArtworkResponse {
  itemId: string
  url: string
  expiresInSeconds: number
  expiresAt: string
}

// ============================================================================
// Fetchers
// ============================================================================

export async function fetchVendorJob(id: string): Promise<VendorJobDetailResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${id}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    // 404 is passed through as written. The API refuses to distinguish "no such
    // job" from "not your job", and repeating that here is the point.
    throw new Error(body.error ?? 'Failed to load this job')
  }

  return (await response.json()) as VendorJobDetailResponse
}

/**
 * The signed artwork URL, requested for ONE item, at the moment it is wanted.
 *
 * Exported so a test can assert both halves of the rule: that a click calls it,
 * and that a render does not.
 */
export async function requestArtworkUrl(
  jobId: string,
  itemId: string
): Promise<VendorArtworkResponse> {
  const response = await fetch(
    `${getApiUrl()}/api/vendor/jobs/${jobId}/artwork/${itemId}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to get the artwork link')
  }

  return (await response.json()) as VendorArtworkResponse
}

export async function patchVendorJobStatus(
  id: string,
  status: 'sent' | 'received'
): Promise<VendorJob> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    // Status and the matching timestamp. No amount field is sent, and the API's
    // schema has none to receive: a vendor may not price their own job.
    body: JSON.stringify({
      status,
      ...(status === 'received'
        ? { receivedAt: new Date().toISOString() }
        : { sentAt: new Date().toISOString() }),
    }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to update this job')
  }

  const body = (await response.json()) as { job: VendorJob }
  return body.job
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
// Artwork
// ============================================================================

/** Hand the browser a URL that is already expiring. Nothing is stored. */
function openSignedUrl(url: string) {
  if (typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/**
 * One item's download control.
 *
 * The signed URL is fetched in the click handler and used in the same tick. It
 * is not put in state, not put in an `href`, and not prefetched — see the file
 * header.
 */
export function ArtworkDownloadButton({
  jobId,
  itemId,
  onError,
}: {
  jobId: string
  itemId: string
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      data-testid={`vendor-artwork-download-${itemId}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const artwork = await requestArtworkUrl(jobId, itemId)
          openSignedUrl(artwork.url)
        } catch (error) {
          onError?.((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
      {busy ? 'Getting link…' : 'Download artwork'}
    </Button>
  )
}

// ============================================================================
// The three states
// ============================================================================

function JobSkeleton() {
  return (
    <div
      data-testid="vendor-job-skeleton"
      className="space-y-3 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading job"
    >
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

function JobError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-job-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is shown below because nothing was loaded.
      </p>
      <Button type="button" variant="outline" data-testid="vendor-job-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function ItemsEmpty() {
  return (
    <div
      data-testid="vendor-job-items-empty"
      className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground"
    >
      This job has no items on it yet.
    </div>
  )
}

// ============================================================================
// Body
// ============================================================================

export interface VendorJobDetailBodyProps {
  data: VendorJobDetailResponse | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onStatus?: (status: 'sent' | 'received') => void | Promise<void>
  busyStatus?: boolean
}

/**
 * Exactly one of skeleton / error / job. Split from the page so every state can
 * be asserted without a router or a fetch mock.
 */
export function VendorJobDetailBody({
  data,
  isLoading,
  error,
  onRetry,
  onStatus,
  busyStatus = false,
}: VendorJobDetailBodyProps) {
  if (error) return <JobError message={error} onRetry={onRetry} />
  if (isLoading) return <JobSkeleton />
  if (!data) return <JobError message="This job could not be loaded." onRetry={onRetry} />

  const { job, items, reviews } = data
  const agreed = formatVendorAmount(job.amountExpected)
  const final = formatVendorAmount(job.amountActual)

  return (
    <div className="space-y-6" data-testid="vendor-job-detail">
      {/* Summary */}
      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Work</div>
          <div className="mt-1 capitalize">{job.stage}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <div className="mt-1">
            <VendorJobStatusPill status={job.status} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Due</div>
          <div className="mt-1">
            <DueCell dueAt={job.dueAt} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">You are paid</div>
          <div className="mt-1 tabular-nums" data-testid="vendor-job-amount">
            {/* Never a fallback zero: an unreadable amount says so. */}
            {final ?? agreed ?? <span className="text-destructive">Unavailable</span>}
            {final && agreed && final !== agreed && (
              <span className="ml-2 text-xs text-muted-foreground">agreed {agreed}</span>
            )}
          </div>
        </div>
      </div>

      {/* The two writes a vendor gets */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <div className="mr-auto text-sm text-muted-foreground">
          <div>Received by you: {formatVendorDate(job.receivedAt)}</div>
          <div>Sent back to us: {formatVendorDate(job.sentAt)}</div>
        </div>

        <InlineConfirm
          testId="vendor-job-mark-received"
          label="Mark received"
          question="Confirm you have this job in hand?"
          busy={busyStatus}
          onConfirm={() => onStatus?.('received')}
        />
        <InlineConfirm
          testId="vendor-job-mark-sent"
          label="Mark ready & sent back"
          question="Confirm the work is done and on its way to us?"
          busy={busyStatus}
          onConfirm={() => onStatus?.('sent')}
        />
      </div>

      {/* Items and their artwork */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Items</h2>
        {items.length === 0 ? (
          <ItemsEmpty />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item, index) => (
              <li
                key={item.id}
                data-testid={`vendor-job-item-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-medium">Item {index + 1}</div>
                  <div className="font-mono text-xs text-muted-foreground">{item.id}</div>
                </div>
                <ArtworkDownloadButton jobId={job.id} itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* QC history — our verdict on their work, so they can see it */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Quality checks</h2>
        {reviews.length === 0 ? (
          <div
            data-testid="vendor-job-reviews-empty"
            className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground"
          >
            No quality check has been recorded on this job.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {reviews.map((review) => (
              <li key={review.id} className="px-4 py-3" data-testid={`vendor-job-review-${review.id}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                      review.verdict === 'pass'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    )}
                  >
                    {review.verdict === 'pass' ? 'Passed' : 'Failed'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatVendorDate(review.createdAt)}
                  </span>
                </div>
                {review.defects && review.defects.length > 0 && (
                  <div className="mt-1 text-sm">Defects: {review.defects.join(', ')}</div>
                )}
                {review.notes && (
                  <p className="mt-1 text-sm text-muted-foreground">{review.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function VendorJobDetailPage() {
  const { id } = Route.useParams()

  const [data, setData] = useState<VendorJobDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyStatus, setBusyStatus] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setData(await fetchVendorJob(id))
      setError(null)
    } catch (loadError) {
      setData(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (status: 'sent' | 'received') => {
    setBusyStatus(true)
    try {
      await patchVendorJobStatus(id, status)
      // Re-read rather than patch local state: the server decides what the job
      // now looks like, and an optimistic edit would show one it does not have.
      await load()
      setError(null)
    } catch (patchError) {
      setError((patchError as Error).message)
    } finally {
      setBusyStatus(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/vendor"
          search={VENDOR_JOBS_SEARCH}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to my jobs
        </Link>
        <h1 className="mt-2 text-2xl font-medium">
          Job <span className="font-mono text-xl">{id.slice(0, 8)}</span>
        </h1>
      </div>

      <VendorJobDetailBody
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
        onStatus={setStatus}
        busyStatus={busyStatus}
      />
    </div>
  )
}
