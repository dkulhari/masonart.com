/**
 * Admin — the dispatch queue.
 *
 * The orders an admin could put a carrier label on right now, and for the rest,
 * what is stopping them — on the row. Making an admin click into an order to
 * discover it is waiting on QC is the friction this screen exists to remove.
 *
 * `GET /api/admin/shipments/ready` and `POST /api/admin/orders/:orderId/ship`
 * are both gated with `requireAdmin`, and `admin-nav.ts` keeps `/admin/dispatch`
 * out of `CONTENT_MANAGER_ALLOWED_PREFIXES` so the route guard agrees with the
 * API. Pressing Buy label here spends money.
 *
 * ## The row says why, and offers Ship only where it can work
 *
 * `ready` on a row IS `blockers.length === 0` — the API says so, and this screen
 * does not form a second opinion. A ready row offers Ship; a blocked row lists
 * every blocker the readiness seam named, each one the seam's own sentence, and
 * offers nothing. A blocker that names a job links to that job, so the fix is
 * one click away rather than a hunt through the production queue.
 *
 * The queue is advisory (see the header of `routes/admin/shipments.ts`): the
 * verdict that matters is asked again under a lock by the purchase itself. So
 * a Ship this screen offered can still come back `ORDER_NOT_READY` with fresh
 * blockers, and the row renders those in place rather than pretending the
 * earlier read was the truth.
 *
 * ## Buying a label is slow and costs money
 *
 * Three rules, all pinned by `tests/routes/admin/dispatch-queue.test.tsx`:
 *
 * 1. **Two steps, inline.** Ship opens the parcel form; Buy label is the click
 *    that spends. Native `confirm()` blocks the automation harness outright
 *    (`reviews.tsx:269`), so the second step is markup.
 * 2. **Once.** Buy label disables on click, and a ref guards the handler as
 *    well — two clicks in one tick both see the pre-render state, and only the
 *    ref is ahead of React. The API refuses a second live label under its lock
 *    regardless (`ORDER_HAS_LIVE_LABEL`, `LABEL_PURCHASE_IN_PROGRESS`), which is
 *    the reason a retry after an unanswered request is safe to offer.
 * 3. **No optimistic UI.** Nothing says "bought" until the server has. The
 *    receipt — AWB, courier, a pointer to the shipment — is kept at page level
 *    because the reload that follows a purchase drops the row from the queue,
 *    and an AWB that vanished with the row is an AWB the admin has to go and
 *    find again.
 *
 * ## The refusals are in our words
 *
 * `describeShipRefusal` turns each code the purchase can answer with into a
 * headline and a remedy. `SHIPROCKET_NOT_CONFIGURED` in particular is a state
 * an admin can fix — nobody finished the setup — and it names the setup step
 * rather than reading like a carrier outage.
 *
 * ## The search schema is the fragile part
 *
 * `router.tsx` keeps every search value a STRING, so `validateSearch` receives
 * `{ page: '2' }` and a schema written against numbers throws on the first
 * navigation — and a throw inside `validateSearch` error-boundaries the route
 * to a blank page. Every non-string param is `z.coerce`-d, every field
 * `.catch()`es to a usable default, and the scan cursor is dropped rather than
 * forwarded when it is not one the API would read (the API answers a bad cursor
 * with a 400, which this screen could only render as a failure). There is no
 * enum param here; if one arrives, split it on the comma FIRST, the way
 * `productionSearchSchema` does.
 *
 * ## Two axes of pagination
 *
 * The API ranks up to `scanLimit` (200) candidate orders per WINDOW and pages
 * within that. `page` walks the ranked window; `scanAfter` opens the next
 * window when `scanTruncated` says the backlog is deeper. Both live in the URL
 * so a view is a link. `hasNextPage` is about the page axis only — the API's
 * own comment on that key records the non-terminating walk that conflating the
 * two produced.
 *
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error, mutually exclusive. On failure the body renders
 * the error and nothing else: no zero orders, no zero ready. #602 and #606 are
 * both open bugs about an admin surface printing a confident zero that was
 * really a failed request.
 *
 * ## Not here, on purpose
 *
 * A purchase that crashed between the claim and the finish — a row with a
 * token and `status = 'pending'` — is read by the queue's live-label predicate
 * as labelled, so the order leaves this list. `findUnfinishedLabelPurchases`
 * and `reconcileLabelPurchase` in `lib/shipment-dispatch.ts` are the remedy,
 * and neither has an API route yet; this ticket adds none. When one lands,
 * the natural place for those rows is a section above this queue.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { useLatestOnly } from '~/lib/latest-request'
import { Button } from '~/components/ui/Button'
import { DISPATCH_PAGE_SIZE } from '~/lib/admin-nav'

// ============================================================================
// Route configuration
// ============================================================================

/** The API's own cap. Asking beyond it just gets clamped there anyway. */
const MAX_PAGE_SIZE = 100

/**
 * The shape of a scan cursor, mirroring `READY_QUEUE_CURSOR_PATTERN` on the
 * API: `<placed-at ISO>|<order id>`. The pattern vouches for the shape and the
 * `Date` check for the date, because `2026-13-45T09:00:00.000Z` is a
 * well-shaped string with no date in it — the same two-part check the API's
 * `parseScanCursor` makes, so nothing this schema forwards is refused there.
 */
const SCAN_CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function isScanCursor(raw: string): boolean {
  const placedAt = SCAN_CURSOR_PATTERN.exec(raw)?.[1]
  if (placedAt === undefined) return false
  return Number.isFinite(new Date(placedAt).getTime())
}

export const dispatchSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .catch(DISPATCH_PAGE_SIZE)
    .default(DISPATCH_PAGE_SIZE)
    // Clamped rather than rejected: `?pageSize=100000` should show a page, not
    // a blank error boundary.
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  /**
   * Dropped rather than forwarded when it is not a cursor: the API answers a
   * malformed `scanAfter` with a 400, which this screen would then have to
   * render as a failure the admin cannot act on. The first window is a queue.
   */
  scanAfter: z.string().refine(isScanCursor).optional().catch(undefined),
})

export type DispatchSearch = z.infer<typeof dispatchSearchSchema>

export const Route = createFileRoute('/admin/dispatch/')({
  validateSearch: (search) => dispatchSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Dispatch | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminDispatchQueuePage,
})

// ============================================================================
// Types — the GET /api/admin/shipments/ready payload, verbatim
// ============================================================================

/**
 * `LabelBlockerCode` in `lib/production-readiness.ts`, as the API spells it.
 * Widened with `string` because a row may carry a code this screen has not been
 * taught, and the message beside it is what gets rendered either way.
 */
export type DispatchBlockerCode =
  | 'order_not_found'
  | 'no_jobs'
  | 'no_consolidator'
  | 'consolidator_holds_no_job'
  | 'item_uncovered'
  | 'job_not_qc_passed'
  | 'goods_not_at_consolidator'

export interface DispatchBlocker {
  code: DispatchBlockerCode | (string & {})
  /** One sentence the seam wrote for this screen to render as-is. */
  message: string
  jobId?: string
  orderItemId?: string
  transferId?: string
  stage?: 'print' | 'frame'
}

/**
 * A shipment somebody already opened on this order, as a POINTER. The queue
 * reports it rather than hiding the order (see `openShipmentsOf` on the API);
 * the screen for it is `/admin/dispatch/$shipmentId`.
 */
export interface DispatchOpenShipment {
  id: string
  status: string
}

export interface DispatchQueueItem {
  orderId: string
  orderNumber: string
  orderStatus: string
  /** ISO string — a `Date` on the API side, serialised on the way out. */
  placedAt: string
  /** A QUANTITY sum, the same number the orders list shows. */
  itemCount: number
  ready: boolean
  consolidatorVendorId: string | null
  blockers: DispatchBlocker[]
  openShipment: DispatchOpenShipment | null
}

export interface DispatchQueuePage {
  items: DispatchQueueItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  readyCount: number
  scanLimit: number
  scanTruncated: boolean
  nextScanCursor: string | null
}

// ============================================================================
// Reads and writes
// ============================================================================

export async function fetchDispatchQueue(params: DispatchSearch): Promise<DispatchQueuePage> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  if (params.scanAfter) query.set('scanAfter', params.scanAfter)

  const response = await fetch(
    `${getApiUrl()}/api/admin/shipments/ready?${query.toString()}`,
    // Without this every request is a 401 — the session cookie is the only
    // thing the role gate reads.
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load the dispatch queue')
  }

  return (await response.json()) as DispatchQueuePage
}

/** What buying a label needs from the admin. Integer grams and centimetres. */
export interface Parcel {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

/**
 * What happened to ONE purchase. `bought: true` only when the server said so.
 *
 * The success half carries exactly what the row and the receipt render: the
 * shipment id (a pointer), the AWB and courier (the carrier handles an admin
 * screen exists to show), whether an unfinished purchase was resumed rather
 * than repeated, and whether the pickup got scheduled. Never the label URL,
 * the cost, or the pickup vendor — the API does not send them and this type
 * has no field to catch them in.
 */
export type ShipOutcome =
  | {
      bought: true
      shipmentId: string | null
      awbNumber: string | null
      courierName: string | null
      resumed: boolean
      pickupScheduled: boolean
    }
  | {
      bought: false
      /** 0 when the request itself failed and no status was ever received. */
      status: number
      code: string | null
      message: string
      /** `ORDER_NOT_READY` names every unmet condition; empty otherwise. */
      blockers: DispatchBlocker[]
      /** The row a conflict refusal is about, when the API named one. */
      shipmentId: string | null
    }

export type ShipRefusal = Extract<ShipOutcome, { bought: false }>
export type ShipSuccess = Extract<ShipOutcome, { bought: true }>

interface ShipSuccessBody {
  shipment?: { id?: string; awbNumber?: string | null; courierName?: string | null } | null
  pickup?: { scheduled?: boolean } | null
  resumed?: boolean
}

interface ShipRefusalBody {
  error?: string
  code?: string
  blockers?: DispatchBlocker[]
  shipmentId?: string
}

/**
 * Buy a label for one order. Never throws: a thrown request is an outcome the
 * row has to render, and it is the one outcome where whether money was spent
 * is not known — `describeShipRefusal` says so.
 */
export async function buyLabel(orderId: string, parcel: Parcel): Promise<ShipOutcome> {
  try {
    const response = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/ship`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel }),
    })

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as ShipSuccessBody
      return {
        bought: true,
        shipmentId: body.shipment?.id ?? null,
        awbNumber: body.shipment?.awbNumber ?? null,
        courierName: body.shipment?.courierName ?? null,
        resumed: body.resumed === true,
        pickupScheduled: body.pickup?.scheduled === true,
      }
    }

    const body = (await response.json().catch(() => ({}))) as ShipRefusalBody
    return {
      bought: false,
      status: response.status,
      code: body.code ?? null,
      message: body.error ?? `Failed to buy the label (HTTP ${response.status})`,
      blockers: body.blockers ?? [],
      shipmentId: body.shipmentId ?? null,
    }
  } catch (failure) {
    return {
      bought: false,
      status: 0,
      code: null,
      message: (failure as Error).message,
      blockers: [],
      shipmentId: null,
    }
  }
}

// ============================================================================
// The refusal vocabulary — our words
// ============================================================================

export type ShipRefusalKind =
  /** Nobody finished the setup. An operator's job, not an outage. */
  | 'setup'
  /** Production moved; the purchase saw blockers this row did not. */
  | 'blocked'
  /** Another label, or another purchase, is already on this order. */
  | 'conflict'
  /** The courier refused or did not answer. */
  | 'carrier'
  /** The request itself was wrong — the parcel, the order's status. */
  | 'request'
  /** No answer at all, so nothing is known. */
  | 'fault'

export interface ShipRefusalDescription {
  kind: ShipRefusalKind
  headline: string
  detail: string | null
  blockers: DispatchBlocker[]
  shipmentId: string | null
}

/**
 * A refusal, as the sentence the row shows.
 *
 * The API's message is kept where it is the best sentence available (an order
 * that is not shippable, a courier's own reason) and replaced where this
 * screen knows more about what the admin should do next. It is never dropped
 * silently, and `undefined` never reaches the screen.
 */
export function describeShipRefusal(refusal: ShipRefusal): ShipRefusalDescription {
  const message = refusal.message.trim()
  const base = { blockers: refusal.blockers, shipmentId: refusal.shipmentId }

  switch (refusal.code) {
    case 'SHIPROCKET_NOT_CONFIGURED':
      return {
        ...base,
        kind: 'setup',
        headline: 'Shiprocket has not been set up on the API yet, so no label was bought.',
        detail:
          'Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in the API environment, from the ' +
          'credentials in the Shiprocket dashboard, then press Buy label again once the API ' +
          'has picked them up. Nothing was charged.' +
          (message ? ` The API reports: ${message}` : ''),
      }
    case 'ORDER_NOT_READY':
      return {
        ...base,
        kind: 'blocked',
        headline: 'This order is not ready to ship — production has moved since this row was read.',
        detail:
          'Nothing was bought. The blockers below are what the purchase saw under its lock; ' +
          'refresh the queue to see the row as it is now.',
      }
    case 'ORDER_HAS_LIVE_LABEL':
      return {
        ...base,
        kind: 'conflict',
        headline: 'This order already has a live label, so a second one was not bought.',
        detail: message || null,
      }
    case 'LABEL_PURCHASE_IN_PROGRESS':
      return {
        ...base,
        kind: 'conflict',
        headline: 'A label is already being bought for this order — probably by someone else, just now.',
        detail: 'Nothing was bought twice. Open the shipment to see where that purchase got to.',
      }
    case 'SHIPMENT_BODY_INVALID':
      return {
        ...base,
        kind: 'request',
        headline: 'The parcel was refused.',
        detail: message || null,
      }
    default:
      if (refusal.status === 0) {
        return {
          ...base,
          kind: 'fault',
          headline: 'The request did not complete, so whether a label was bought is not known.',
          detail:
            (message ? `${message}. ` : '') +
            'Refresh the queue before trying again: if a label was bought the order will have ' +
            'left this queue, and the API refuses a second label for an order that has one.',
        }
      }
      if (refusal.code?.startsWith('SHIPROCKET_')) {
        return {
          ...base,
          kind: 'carrier',
          headline: 'Shiprocket refused, or did not answer, so no label was bought.',
          detail: message || null,
        }
      }
      return {
        ...base,
        kind: 'request',
        headline: message || `The label was not bought (HTTP ${refusal.status}).`,
        detail: null,
      }
  }
}

// ============================================================================
// Formatting
// ============================================================================

function formatPlacedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The order statuses the queue can carry (`SHIPPABLE_ORDER_STATUSES` on the
 * API), in the words the orders list uses. Anything else renders its raw
 * value — legible, and obviously unfamiliar (#696).
 */
const ORDER_STATUS_LABELS: Partial<Record<string, string>> = {
  confirmed: 'Confirmed',
  processing: 'Processing',
}

/**
 * What an open shipment's status means on THIS screen. Every row the queue
 * reports here is one with no carrier handle yet — a labelled one would have
 * taken the order out of the queue — so `pending` is the ordinary case.
 */
const OPEN_SHIPMENT_LABELS: Partial<Record<string, string>> = {
  pending: 'opened, no label yet',
}

/** The stage a blocker names, in words. */
const STAGE_LABELS: Record<'print' | 'frame', string> = {
  print: 'print',
  frame: 'frame',
}

function OrderStatusPill({ status }: { status: string }) {
  return (
    <span
      data-testid={`admin-dispatch-order-status-${status}`}
      className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function ReadinessPill({ item }: { item: DispatchQueueItem }) {
  if (item.ready) {
    return (
      <span
        data-testid={`admin-dispatch-ready-${item.orderId}`}
        className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
      >
        Ready to ship
      </span>
    )
  }
  return (
    <span
      data-testid={`admin-dispatch-blocked-${item.orderId}`}
      className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
    >
      {item.blockers.length === 1 ? 'Waiting on 1 thing' : `Waiting on ${item.blockers.length} things`}
    </span>
  )
}

// ============================================================================
// The three list states
// ============================================================================

function DispatchSkeleton() {
  return (
    <div
      data-testid="admin-dispatch-skeleton"
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading the dispatch queue"
    >
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * The error state carries no numbers at all, on purpose. A failed request that
 * still prints "0 ready" is #602; the test asserts this block is digit-free.
 */
function DispatchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="admin-dispatch-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is shown below because nothing was loaded — the queue has not been
        read, which is not the same as it being empty.
      </p>
      <Button type="button" variant="outline" data-testid="admin-dispatch-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function DispatchEmpty() {
  return (
    <div
      data-testid="admin-dispatch-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">Nothing is waiting to be shipped</p>
      <p className="text-sm text-muted-foreground">
        Every shippable order either has its label already or has nothing to
        produce. New work shows up here once an order is confirmed.
      </p>
    </div>
  )
}

// ============================================================================
// Blockers, on the row
// ============================================================================

function BlockerList({ item, blockers }: { item: DispatchQueueItem; blockers: DispatchBlocker[] }) {
  if (blockers.length === 0) return null
  return (
    <ul
      data-testid={`admin-dispatch-blockers-${item.orderId}`}
      className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm"
    >
      {blockers.map((blocker, index) => (
        <li key={`${blocker.code}-${blocker.jobId ?? ''}-${blocker.orderItemId ?? ''}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
          <span>{blocker.message}</span>
          {blocker.stage && (
            <span className="text-xs text-muted-foreground">({STAGE_LABELS[blocker.stage]} stage)</span>
          )}
          {blocker.jobId && (
            <Link
              to="/admin/production/$id"
              params={{ id: blocker.jobId }}
              className="font-mono text-xs font-medium text-brand-600 hover:underline"
            >
              Open job {blocker.jobId.slice(0, 8)}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

// ============================================================================
// Ship — two steps, once, and nothing said before the server says it
// ============================================================================

interface ParcelDraft {
  weightGrams: string
  lengthCm: string
  widthCm: string
  heightCm: string
}

const EMPTY_PARCEL: ParcelDraft = { weightGrams: '', lengthCm: '', widthCm: '', heightCm: '' }

/** The API's own bounds (`buyLabelSchema`), so a fat-fingered field is caught here. */
const PARCEL_LIMITS: Record<keyof ParcelDraft, number> = {
  weightGrams: 50_000,
  lengthCm: 300,
  widthCm: 300,
  heightCm: 300,
}

const PARCEL_FIELDS: { key: keyof ParcelDraft; label: string }[] = [
  { key: 'weightGrams', label: 'Weight (g)' },
  { key: 'lengthCm', label: 'Length (cm)' },
  { key: 'widthCm', label: 'Width (cm)' },
  { key: 'heightCm', label: 'Height (cm)' },
]

/** A draft as the parcel the API accepts, or the one sentence saying why not. */
export function parseParcel(draft: ParcelDraft): { parcel: Parcel } | { error: string } {
  const parcel = {} as Parcel
  for (const { key } of PARCEL_FIELDS) {
    const raw = draft[key].trim()
    if (!/^\d+$/.test(raw) || Number(raw) < 1) {
      return {
        error:
          'Enter the parcel weight in grams and its length, width and height in ' +
          'centimetres, each as a whole number above zero.',
      }
    }
    const value = Number(raw)
    if (value > PARCEL_LIMITS[key]) {
      return {
        error: `That is more than the API accepts — the cap is ${PARCEL_LIMITS[key].toLocaleString('en-IN')} for ${key === 'weightGrams' ? 'weight in grams' : 'a side in centimetres'}.`,
      }
    }
    parcel[key] = value
  }
  return { parcel }
}

function ShipRefusalPanel({ orderId, refusal }: { orderId: string; refusal: ShipRefusal }) {
  const described = describeShipRefusal(refusal)
  return (
    <div
      data-testid={`admin-dispatch-refusal-${orderId}`}
      role="alert"
      className={cn(
        'space-y-2 rounded-lg border p-3 text-sm',
        described.kind === 'setup'
          ? 'border-blue-200 bg-blue-50 text-blue-900'
          : 'border-destructive/40 bg-destructive/10'
      )}
    >
      <p className="font-medium">{described.headline}</p>
      {described.detail && <p className="text-muted-foreground">{described.detail}</p>}
      {described.blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {described.blockers.map((blocker, index) => (
            <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
          ))}
        </ul>
      )}
      {described.shipmentId && (
        // A plain anchor rather than a typed `Link`: the shipment screen is
        // #735's and may not be in the route tree when this file is read.
        <a
          href={`/admin/dispatch/${described.shipmentId}`}
          className="font-medium text-brand-600 hover:underline"
        >
          Open the shipment
        </a>
      )}
    </div>
  )
}

interface ShipActionProps {
  item: DispatchQueueItem
  onBuy: (orderId: string, parcel: Parcel) => Promise<ShipOutcome>
}

function ShipAction({ item, onBuy }: ShipActionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<ParcelDraft>(EMPTY_PARCEL)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [isBuying, setIsBuying] = useState(false)
  const [refusal, setRefusal] = useState<ShipRefusal | null>(null)
  const [isBought, setIsBought] = useState(false)

  // Ahead of React on purpose: two clicks in one tick both render against the
  // same `isBuying`, and only this ref has been flipped by the first.
  const inFlight = useRef(false)

  const handleBuy = async () => {
    if (inFlight.current) return

    const parsed = parseParcel(draft)
    if ('error' in parsed) {
      setInvalid(parsed.error)
      return
    }

    inFlight.current = true
    setIsBuying(true)
    setInvalid(null)
    setRefusal(null)
    try {
      const outcome = await onBuy(item.orderId, parsed.parcel)
      if (outcome.bought) setIsBought(true)
      else setRefusal(outcome)
    } finally {
      inFlight.current = false
      setIsBuying(false)
    }
  }

  if (isBought) {
    return (
      <p
        data-testid={`admin-dispatch-row-bought-${item.orderId}`}
        className="text-sm font-medium text-green-700"
      >
        Label bought — the receipt is at the top of the page. This row clears on the
        next refresh.
      </p>
    )
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="solid"
        size="sm"
        data-testid={`admin-dispatch-ship-${item.orderId}`}
        onClick={() => setIsOpen(true)}
      >
        Ship
      </Button>
    )
  }

  return (
    <form
      data-testid={`admin-dispatch-parcel-${item.orderId}`}
      className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void handleBuy()
      }}
    >
      <p className="text-sm">
        Measure the packed parcel. Buying the label charges the carrier account and
        cannot be undone from this screen.
      </p>
      <div className="flex flex-wrap gap-3">
        {PARCEL_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {label}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              data-testid={`admin-dispatch-parcel-${key}-${item.orderId}`}
              value={draft[key]}
              disabled={isBuying}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {invalid}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="solid"
          size="sm"
          data-testid={`admin-dispatch-buy-${item.orderId}`}
          disabled={isBuying}
          onClick={() => void handleBuy()}
        >
          {isBuying ? 'Buying label…' : 'Buy label'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`admin-dispatch-cancel-${item.orderId}`}
          disabled={isBuying}
          onClick={() => {
            setIsOpen(false)
            setInvalid(null)
            setRefusal(null)
          }}
        >
          Cancel
        </Button>
      </div>
      {refusal && <ShipRefusalPanel orderId={item.orderId} refusal={refusal} />}
    </form>
  )
}

// ============================================================================
// The receipt — kept after the row has gone
// ============================================================================

export interface ShipReceipt {
  orderId: string
  orderNumber: string
  outcome: ShipSuccess
}

export interface DispatchReceiptsProps {
  receipts: ShipReceipt[]
  onDismiss: (orderId: string) => void
}

/**
 * What was bought this session. Page-level rather than on the row because the
 * reload that follows a purchase drops the order from the queue, and an AWB
 * that vanished with its row is one the admin has to go and find again.
 */
export function DispatchReceipts({ receipts, onDismiss }: DispatchReceiptsProps) {
  if (receipts.length === 0) return null

  return (
    <div className="space-y-2" data-testid="admin-dispatch-receipts">
      {receipts.map(({ orderId, orderNumber, outcome }) => (
        <div
          key={orderId}
          data-testid={`admin-dispatch-bought-${orderId}`}
          role="status"
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm"
        >
          <div className="space-y-1">
            <p className="font-medium text-green-800">
              Label bought for {orderNumber}
              {outcome.awbNumber ? ` — AWB ${outcome.awbNumber}` : ''}
              {outcome.courierName ? ` with ${outcome.courierName}` : ''}.
            </p>
            <p className="text-muted-foreground">
              {outcome.pickupScheduled
                ? 'Pickup scheduled.'
                : 'Pickup was not scheduled — schedule it from the shipment.'}
              {outcome.resumed
                ? ' An earlier, unfinished purchase was resumed rather than repeated.'
                : ''}
            </p>
            {outcome.shipmentId && (
              // A plain anchor rather than a typed `Link`: the shipment screen
              // is #735's and may not be in the route tree when this file is
              // read.
              <a
                href={`/admin/dispatch/${outcome.shipmentId}`}
                className="font-medium text-brand-600 hover:underline"
              >
                Open the shipment
              </a>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid={`admin-dispatch-bought-dismiss-${orderId}`}
            onClick={() => onDismiss(orderId)}
          >
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// The list
// ============================================================================

export interface DispatchQueueBodyProps {
  items: DispatchQueueItem[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onBuy: (orderId: string, parcel: Parcel) => Promise<ShipOutcome>
}

function DispatchRow({ item, onBuy }: { item: DispatchQueueItem; onBuy: DispatchQueueBodyProps['onBuy'] }) {
  return (
    <li
      data-testid={`admin-dispatch-row-${item.orderId}`}
      className={cn(
        'space-y-3 rounded-lg border p-4',
        item.ready ? 'border-green-200' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/admin/orders/$id"
            params={{ id: item.orderId }}
            className="font-medium text-brand-600 hover:underline"
          >
            {item.orderNumber}
          </Link>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Placed {formatPlacedAt(item.placedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{item.itemCount === 1 ? '1 item' : `${item.itemCount} items`}</span>
            <OrderStatusPill status={item.orderStatus} />
          </p>
        </div>
        <ReadinessPill item={item} />
      </div>

      <BlockerList item={item} blockers={item.blockers} />

      {item.openShipment && (
        <p className="text-sm text-muted-foreground">
          A shipment is already open on this order (
          {OPEN_SHIPMENT_LABELS[item.openShipment.status] ?? item.openShipment.status}
          ) —{' '}
          {/* A plain anchor rather than a typed `Link`: the shipment screen is
              #735's and may not be in the route tree when this file is read. */}
          <a
            href={`/admin/dispatch/${item.openShipment.id}`}
            data-testid={`admin-dispatch-open-shipment-${item.orderId}`}
            className="font-medium text-brand-600 hover:underline"
          >
            open the shipment
          </a>
          . Buying a label here continues it rather than opening a second.
        </p>
      )}

      {/* Ship is offered on `ready` and on nothing else. A blocked row has no
          button at all — a control that leads only to a 409 is worse than no
          control, and the blockers above are the remedy. */}
      {item.ready && <ShipAction item={item} onBuy={onBuy} />}
    </li>
  )
}

/**
 * Exactly one of skeleton / error / empty / list. Split out from the page so
 * each state can be asserted without standing up a router or a fetch mock.
 */
export function DispatchQueueBody({ items, isLoading, error, onRetry, onBuy }: DispatchQueueBodyProps) {
  // Error wins over loading and over emptiness: an empty state after a failed
  // request is a lie about the data.
  if (error) return <DispatchError message={error} onRetry={onRetry} />
  if (isLoading) return <DispatchSkeleton />
  if (items.length === 0) return <DispatchEmpty />

  return (
    <ul data-testid="admin-dispatch-list" className="space-y-3">
      {items.map((item) => (
        <DispatchRow key={item.orderId} item={item} onBuy={onBuy} />
      ))}
    </ul>
  )
}

// ============================================================================
// Page
// ============================================================================

export function AdminDispatchQueuePage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [page, setPage] = useState<DispatchQueuePage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<ShipReceipt[]>([])

  const claimQueue = useLatestOnly()

  // Guarded because the queue is reloaded by every page change and every
  // purchase, and the response that ARRIVES last is not the one asked for
  // last — see `useLatestOnly`.
  const load = useCallback(async () => {
    const isCurrent = claimQueue()
    setIsLoading(true)
    try {
      const data = await fetchDispatchQueue(search)
      if (!isCurrent()) return
      setPage(data)
      setError(null)
    } catch (loadError) {
      // The stale page is dropped along with the error: showing last page's
      // rows under a failure banner is how a stale row gets shipped.
      if (!isCurrent()) return
      setPage(null)
      setError((loadError as Error).message)
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [search, claimQueue])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * The purchase, then the reload. The receipt is recorded BEFORE the reload
   * starts, so the AWB is on screen before the row that earned it is gone.
   */
  const handleBuy = useCallback(
    async (orderId: string, parcel: Parcel): Promise<ShipOutcome> => {
      const outcome = await buyLabel(orderId, parcel)
      if (outcome.bought) {
        const row = page?.items.find((item) => item.orderId === orderId)
        setReceipts((current) => [
          { orderId, orderNumber: row?.orderNumber ?? orderId, outcome },
          ...current.filter((receipt) => receipt.orderId !== orderId),
        ])
        void load()
      }
      return outcome
    },
    [page, load]
  )

  const updateSearch = (updates: Partial<DispatchSearch>) => {
    void navigate({
      to: '/admin/dispatch',
      // A merged object rather than the `(prev) => ...` reducer form — the
      // reducer's return type does not typecheck against TanStack's
      // `ParamsReducerFn` here, and `search` already IS `prev`.
      search: {
        ...search,
        ...updates,
        // A window change resets to page one; otherwise page 4 of the old
        // window silently becomes an empty page of the new one.
        page: updates.page ?? 1,
      },
    })
  }

  const loaded = !isLoading && !error && page !== null
  const showPagination =
    loaded && (page.totalPages > 1 || page.scanTruncated || search.scanAfter !== undefined)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">Dispatch</h1>
          <p data-testid="admin-dispatch-summary" className="mt-1 text-sm text-muted-foreground">
            {/* The counts are absent, not zero, until a page actually loads —
                and absent again after a failed one. */}
            Orders that can be labelled now, and what is holding the rest.
            {loaded
              ? ` ${page.total === 1 ? '1 order' : `${page.total} orders`} in this view, ${page.readyCount} ready to ship.`
              : ''}
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <DispatchReceipts
        receipts={receipts}
        onDismiss={(orderId) =>
          setReceipts((current) => current.filter((receipt) => receipt.orderId !== orderId))
        }
      />

      <DispatchQueueBody
        items={page?.items ?? []}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
        onBuy={handleBuy}
      />

      {/* Pagination. Hidden while loading or failed — a page indicator over a
          failed request is another confident number that is not true. */}
      {showPagination && (
        <div
          data-testid="admin-dispatch-pagination"
          className="space-y-3 rounded-lg border border-border px-4 py-3 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Page {page.page} of {Math.max(page.totalPages, 1)}
              {search.scanAfter ? ' of a later window' : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!page.hasPreviousPage}
                onClick={() => updateSearch({ page: page.page - 1 })}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!page.hasNextPage}
                onClick={() => updateSearch({ page: page.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>

          {/* The second axis. `scanTruncated` says the backlog is deeper than
              one scan; `nextScanCursor` is how the next window is opened. */}
          {(page.scanTruncated || search.scanAfter) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-muted-foreground">
                {page.scanTruncated
                  ? `The backlog is deeper than one scan of ${page.scanLimit} orders; this view ranks the ${page.total} it read.`
                  : 'This is a later window of the backlog.'}
              </span>
              <div className="flex items-center gap-2">
                {search.scanAfter && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="admin-dispatch-first-window"
                    onClick={() => updateSearch({ scanAfter: undefined, page: 1 })}
                  >
                    Back to the first window
                  </Button>
                )}
                {page.nextScanCursor && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="admin-dispatch-next-window"
                    onClick={() => updateSearch({ scanAfter: page.nextScanCursor ?? undefined, page: 1 })}
                  >
                    Next window
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
