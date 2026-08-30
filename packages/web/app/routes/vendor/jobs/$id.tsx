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
 * ## The actions come from the matrix, not from this file
 *
 * This screen used to hold two hardcoded buttons — "Mark received" and "Mark
 * ready & sent back" — over a `'sent' | 'received'` literal. Both halves of that
 * were wrong by Phase 5: `PATCH /api/vendor/jobs/:id` narrows its body with
 * `z.enum(VENDOR_SETTABLE_STATUSES)`, which is derived from the transition
 * matrix and reads `['received', 'qc_submitted', 'dispatched']`, so the second
 * button could only ever produce a 400 while the two statuses a vendor actually
 * produces had no control at all.
 *
 * `VendorJobActions` renders `nextVendorActions(status, guards)` from
 * `lib/vendor-nav`, which is `nextStatuses(status, 'vendor')` over the same
 * `@chobii/shared` table the API imports. So the buttons cannot disagree with
 * what the API will accept, and three rules need no code here because the
 * matrix already states them: `qc_passed` and `qc_failed` are ours to record
 * (a verdict with no review row is a verdict with no evidence), `cancelled` is
 * ours, and `sent` is retired with no edges in either direction.
 *
 * A status where the matrix gives a vendor no move renders a sentence rather
 * than an empty strip — an action bar that simply vanishes is indistinguishable
 * from one that failed to render.
 *
 * Every action is still the two-step inline confirm from
 * `routes/admin/vendors/$id.tsx`: no `window.confirm`, which blocks the browser
 * automation harness and is why nine admin files have no E2E coverage on their
 * destructive paths.
 *
 * ## A failed write does not blank a good read
 *
 * `actionError` is separate from the page error and renders beside the buttons.
 * Routing a 409 into the page error would destroy a job that loaded perfectly —
 * summary, items, artwork and QC history all at once — which is #684 on the
 * admin side of the same workflow.
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
import type { ProductionJobStatus } from '@chobii/shared'
import {
  VENDOR_JOBS_SEARCH,
  formatVendorAmount,
  formatVendorDate,
  nextVendorActions,
  vendorNoActionReason,
  type VendorGuardState,
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
  /** The pgEnum's type, not the filter's — rows still carry the retired value. */
  status: ProductionJobStatus
  dueAt: string | null
  /**
   * Still selected by `lib/vendor-scope.ts`, and deliberately not rendered.
   *
   * It is the timestamp of the retired `sent`, and the line that used to print
   * it said "Sent back to us" — a sentence about goods returning to our
   * building, which is a workflow that stopped existing at §4. The column keeps
   * its history; the portal stops narrating it.
   */
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

/**
 * The one write a vendor gets, and it names a TRANSITION rather than a patch.
 *
 * The parameter is no longer a `'sent' | 'received'` literal. That literal was
 * the second copy of a vocabulary the matrix already owns, and it had gone
 * stale in both directions — it offered a retired status the API answers with a
 * 400, and it could not name `qc_submitted` or `dispatched`. The only caller is
 * `VendorJobActions`, whose targets come from `nextVendorActions`, so the set
 * this can be handed is the matrix's vendor edges by construction.
 *
 * The body is ONE field. `receivedAt` and `sentAt` used to be sent from the
 * browser's clock; `updateJobSchema` has no date field to receive them any
 * more, and the server stamps `receivedAt`, `qcSubmittedAt` and `dispatchedAt`
 * itself. A vendor back-dating "I had it three days ago" is not a data-entry
 * convenience, it is a lie about an SLA clock. No amount field either: amounts
 * are what we owe, priced from the rate card at assignment.
 */
export async function patchVendorJobStatus(
  id: string,
  status: VendorJobStatus
): Promise<VendorJob> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
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
// The action strip — the matrix, rendered
// ============================================================================

export interface VendorJobActionsProps {
  status: ProductionJobStatus
  onStatus?: (status: VendorJobStatus) => void | Promise<void>
  /** A write is in flight. Locks every confirm rather than only the pressed one. */
  busy?: boolean
  /**
   * What this screen has managed to find out about the matrix's guards.
   *
   * Empty today. #692 fills in `shot-list-complete` from the uploader and #693
   * fills in `open-transfer-or-order-label` from the transfer card; until then
   * every offered move is live and the API answers the guard, which is the
   * correct default — greying out a legal move because the evidence has not
   * loaded is worse than spending a round trip to find out.
   */
  guards?: VendorGuardState
  /**
   * A write that failed. It belongs HERE, beside the button that caused it, and
   * never in the page error: the job below was read successfully, and blanking
   * a good read because a write failed hides the summary, the items, the
   * artwork and the QC history all at once (#684).
   */
  error?: string | null
}

/**
 * Every move a vendor may make on this job, and nothing else.
 *
 * `nextVendorActions(status, guards)` is `nextStatuses(status, 'vendor')` over
 * the shared matrix, so this component holds no vocabulary of its own — which
 * is the point of the whole ticket. Adding an edge to the matrix adds a button
 * here; nobody edits this file.
 */
export function VendorJobActions({
  status,
  onStatus,
  busy = false,
  guards,
  error,
}: VendorJobActionsProps) {
  const actions = nextVendorActions(status, guards)

  return (
    <div
      data-testid="vendor-job-actions"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      {actions.length === 0 ? (
        <p
          data-testid="vendor-job-actions-none"
          className="text-sm text-muted-foreground"
        >
          {vendorNoActionReason(status)}
        </p>
      ) : (
        <ul className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {actions.map((action) =>
            action.blockedReason ? (
              // Shown but not pressable. Hiding the move would make the
              // workflow unguessable; pressing it would spend a round trip on
              // a refusal this screen can already predict.
              <li key={action.to} className="space-y-1">
                <Button type="button" variant="outline" data-testid={action.testId} disabled>
                  {action.label}
                </Button>
                <p
                  data-testid={`vendor-job-guard-${action.to}`}
                  className="max-w-xs text-xs text-muted-foreground"
                >
                  {action.blockedReason}
                </p>
              </li>
            ) : (
              <li key={action.to}>
                <InlineConfirm
                  testId={action.testId}
                  label={action.label}
                  question={action.question}
                  busy={busy}
                  onConfirm={() => onStatus?.(action.to)}
                />
              </li>
            )
          )}
        </ul>
      )}

      {error && (
        <p
          data-testid="vendor-job-action-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
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
  /** A failed READ. It replaces the whole body, because there is no body. */
  error: string | null
  onRetry: () => void
  onStatus?: (status: VendorJobStatus) => void | Promise<void>
  busyStatus?: boolean
  guards?: VendorGuardState
  /** A failed WRITE. It renders beside the buttons and keeps the job on screen. */
  actionError?: string | null
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
  guards,
  actionError = null,
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

      {/* What this vendor can do next, straight off the transition matrix */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          In production since: {formatVendorDate(job.receivedAt)}
        </p>
        <VendorJobActions
          status={job.status}
          onStatus={onStatus}
          busy={busyStatus}
          guards={guards}
          error={actionError}
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
  // Kept apart from `error` on purpose — see the file header. A refused
  // transition must not blank a job that loaded fine.
  const [actionError, setActionError] = useState<string | null>(null)

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

  const setStatus = async (status: VendorJobStatus) => {
    setBusyStatus(true)
    try {
      await patchVendorJobStatus(id, status)
      // Re-read rather than patch local state: the server decides what the job
      // now looks like, and an optimistic edit would show one it does not have.
      // A 409 body carries `{ error, code, from, to, allowed }`, so the reload
      // also brings back the status the refusal was measured against.
      await load()
      setActionError(null)
    } catch (patchError) {
      setActionError((patchError as Error).message)
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
        actionError={actionError}
      />
    </div>
  )
}
