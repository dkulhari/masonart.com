/**
 * /admin/dispatch/$shipmentId — one shipment: the courier it was bought with,
 * the AWB that courier assigned, the label, and the one thing an admin can
 * undo.
 *
 * ## One courier, or none
 *
 * Serviceability on the live account answers exactly one courier (#725), and
 * the purchase picks it inside its own transaction (#728, #729) — by the time
 * a row reaches this screen the choice has been made. So this screen shows the
 * row AS BOUGHT: the courier's name and the AWB. The panel is a table with one
 * row rather than a comparison grid, because a grid with one row looks broken
 * in production and a table with one row grows the day a second courier
 * appears. A row with neither name nor AWB is an ordinary state — a claim the
 * purchase has not completed — with its own sentence, rendered as a status and
 * never as an error card.
 *
 * There is no courier picker here. No admin route lists serviceability options
 * today: the quote is asked for inside the purchase, and the purchase is the
 * queue's (#734). If a picker is ever wanted before buying, it needs a
 * read-only quote route first; this screen does not fake one.
 *
 * ## The label is a BUTTON, and the bytes go to the operating system
 *
 * `GET /api/admin/shipments/:id/label` answers the PDF as bytes behind the
 * admin session — no signed URL exists anywhere on this path. The button
 * fetches on the click, wraps the bytes in a local `blob:` URL, hands the file
 * to the OS through a detached anchor and revokes the URL a second later.
 * Nothing about the file is stored in state or an `href`, and nothing is
 * rendered inline: no `iframe`, `embed` or `object`, ever. A label is a
 * customer's name, address and phone, and an inline viewer would put all three
 * into this page's markup. `vendor/jobs/$id.tsx` is the pattern, applied one
 * boundary in.
 *
 * The courier's `trackingUrl` is deliberately not rendered either, as a link
 * or as text. The AWB is the handle an admin chases a courier with, and the
 * customer's tracking page already carries the link.
 *
 * ## A void needs a reason
 *
 * `POST /:id/void` cancels with the courier FIRST and marks the row only once
 * the courier agreed (#731), and refuses a reason under three characters. The
 * form enforces the same floor before sending, disables whole while the
 * request is in flight, and renders every refusal by what the admin should do
 * next: a courier that said no comes back with its own reason and the label
 * still live; a courier that did not answer must NOT be retried blind; nothing
 * to void means the row moved under them and a reload is the remedy.
 *
 * ## The hint sits OUTSIDE the <label>
 *
 * A label wrapping its control contributes every word inside it to the
 * control's accessible name, so a hint inside it becomes part of the name the
 * field answers to. The hint is a sibling wired by `aria-describedby`
 * (`VendorForm.tsx`, #723). Nothing on this screen is hydrated-and-saved, so
 * the #707 hazard — an empty field written back as null — has no surface here.
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { useLatestOnly } from '~/lib/latest-request'

export const Route = createFileRoute('/admin/dispatch/$shipmentId')({
  head: () => ({
    meta: [
      { title: 'Shipment | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminShipmentPage,
})

// ============================================================================
// Types — the API payloads, verbatim
// ============================================================================

/** `shipment_status` on the API, in its own order. */
export const SHIPMENT_STATUSES = [
  'pending',
  'label_created',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'undelivered',
  'delivered',
  'rto_initiated',
  'rto_delivered',
  'lost',
  'cancelled',
  'failed',
] as const

export type AdminShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export interface AdminShipmentCustomer {
  id: string
  name: string | null
  email: string | null
}

export interface AdminShipmentOrder {
  id: string
  orderNumber: string
  status: string
  userId: string | null
  /** The order's `shipping_address` JSON. Read defensively; see `addressLines`. */
  shippingAddress: unknown
  customer: AdminShipmentCustomer | null
}

export interface AdminShipmentOption {
  id: string
  name: string
  carrier: string
  baseCost: string | null
}

/** `GET /api/admin/shipments/:id` — `SHIPMENT_RESPONSE_COLUMNS` plus the order. */
export interface AdminShipmentDetail {
  id: string
  orderId: string
  shippingOptionId: string | null
  trackingNumber: string | null
  carrier: string | null
  courierName: string | null
  awbNumber: string | null
  trackingUrl: string | null
  status: AdminShipmentStatus
  shippedAt: string | null
  estimatedDeliveryAt: string | null
  deliveredAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  order: AdminShipmentOrder
  shippingOption: AdminShipmentOption | null
}

/** `POST /api/admin/shipments/:id/void`, 200. */
export interface VoidLabelResult {
  message: string
  shipment: Omit<AdminShipmentDetail, 'order' | 'shippingOption'> | null
  alreadyCancelledAtCourier: boolean
}

// ============================================================================
// The pure halves
// ============================================================================

/**
 * Whether the row carries a label the courier will still honour.
 *
 * The detail response deliberately carries neither the label token nor the
 * void mark, so this is read off the two facts it does carry: an AWB exists
 * (the purchase completed) and the row is not `cancelled` (the void sets that
 * status, #731). A claim with no AWB has no label whatever its status says.
 */
export function hasLiveLabel(shipment: AdminShipmentDetail): boolean {
  return shipment.status !== 'cancelled' && shipment.awbNumber !== null
}

/**
 * The courier the row was bought with, or null for NONE — not an empty one.
 *
 * Either handle alone still names a courier: a purchase that assigned an AWB
 * before the name was stored is a courier with a blank name, not no courier.
 */
export function courierOf(
  shipment: AdminShipmentDetail
): { name: string | null; awb: string | null } | null {
  if (shipment.courierName === null && shipment.awbNumber === null) return null
  return { name: shipment.courierName, awb: shipment.awbNumber }
}

const STATUS_LABELS: Record<AdminShipmentStatus, string> = {
  pending: 'Pending',
  label_created: 'Label created',
  shipped: 'Shipped',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  undelivered: 'Undelivered',
  delivered: 'Delivered',
  rto_initiated: 'Returning to sender',
  rto_delivered: 'Returned to sender',
  lost: 'Lost',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function statusLabel(status: AdminShipmentStatus): string {
  return STATUS_LABELS[status] ?? status
}

/** ISO instant → something an admin reads. Never a bare timestamp. */
function whenLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

/** A date with no time, for an ETA the courier quoted as a day. */
function dayLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

/**
 * The shipping address as lines, from whatever shape the order stored.
 *
 * The column is JSON and two address shapes have been written into it over
 * time (`pincode` and `postalCode`, `fullName` and `name`). Read both, drop
 * what is missing, and never render `undefined`.
 */
export function addressLines(address: unknown): string[] {
  if (!address || typeof address !== 'object') return []
  const a = address as Record<string, unknown>
  const text = (key: string): string | null => {
    const value = a[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const locality = [text('city'), text('state')].filter(Boolean).join(', ')
  const postal = text('pincode') ?? text('postalCode')
  return [
    text('fullName') ?? text('name'),
    text('addressLine1'),
    text('addressLine2'),
    [locality, postal].filter(Boolean).join(' '),
    text('country'),
    text('phone'),
  ].filter((line): line is string => Boolean(line))
}

// ============================================================================
// The API
// ============================================================================

async function fetchShipment(shipmentId: string): Promise<AdminShipmentDetail> {
  const response = await fetch(`${getApiUrl()}/api/admin/shipments/${shipmentId}`, {
    // Without this every request is a 401 — the session cookie is the only
    // thing requireAdmin reads.
    credentials: 'include',
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error((body.error as string | undefined) ?? `Request failed (${response.status})`)
  }
  return body as unknown as AdminShipmentDetail
}

/** A refused label fetch, with the status intact and nothing else. */
export class LabelDownloadError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Label fetch failed (${status})`)
    this.name = 'LabelDownloadError'
    this.status = status
    Object.setPrototypeOf(this, LabelDownloadError.prototype)
  }
}

/**
 * How long the object URL outlives the click that used it.
 *
 * Revoking on the next task is a known way to abort an `<a download>` save —
 * Safari consistently, Chrome once the blob is large enough that the write has
 * not started by the time the queue drains — and a label is a PDF. A second is
 * the usual mitigation: the tab holds the bytes for that long and then does
 * not, and every path through `downloadShipmentLabel` revokes.
 */
const LABEL_BLOB_REVOKE_DELAY_MS = 1_000

/**
 * Fetch the bytes through OUR API and hand the FILE to the operating system.
 *
 * Not `window.open`, not an `<a href>` in the tree, and above all not an
 * `<iframe>`: the request carries the session cookie to our own route, the
 * bytes become a `blob:` URL that means nothing outside this tab, a detached
 * anchor clicks it, and the URL is revoked. Nothing is returned and nothing is
 * kept — a caller that wanted the URL back would be the beginning of parking
 * it somewhere.
 */
export async function downloadShipmentLabel(shipmentId: string, filename: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/shipments/${shipmentId}/label`, {
    credentials: 'include',
  })
  if (!response.ok) throw new LabelDownloadError(response.status)
  const blob = await response.blob()

  if (typeof document === 'undefined') return
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), LABEL_BLOB_REVOKE_DELAY_MS)
}

/** What the void route refuses with — `code` decides the sentence. */
interface VoidRefusalBody {
  error?: string
  code?: string
}

/**
 * A refused void, as the sentence an admin can act on.
 *
 * Split where the REMEDY splits. The courier's own reason travels on the 422
 * because it is the one fact the admin cannot get anywhere else; the unknown
 * outcome is the one case where "try again" is the wrong advice, so it says
 * so in as many words.
 */
export function voidRefusalMessage(status: number, body: VoidRefusalBody): string {
  switch (body.code) {
    case 'SHIPROCKET_CANCEL_REFUSED':
      return (
        `${body.error ?? 'The courier would not cancel this label.'} ` +
        'The label is still live and nothing was changed here.'
      )
    case 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN':
      return (
        'The courier did not answer. The label has NOT been marked void here — ' +
        'check the Shiprocket dashboard before trying again, so a cancellation ' +
        'that did go through is not sent twice.'
      )
    case 'NOTHING_TO_VOID':
      return (
        'There is no live label to void on this shipment — it may already have ' +
        'been voided. Reload to see the current state.'
      )
    case 'SHIPMENT_NOT_FOUND':
      return 'This shipment no longer exists.'
    case 'SHIPMENT_BODY_INVALID':
      return 'A reason is required — 3 to 500 characters saying why.'
    default:
      if (status === 401 || status === 403) return 'Your session has expired. Sign in again and retry.'
      return body.error ?? `Failed to void the label (${status})`
  }
}

// ============================================================================
// Shared bits
// ============================================================================

function Section({
  title,
  description,
  testId,
  children,
}: {
  title: string
  description?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <section data-testid={testId} className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function StatusPill({ status }: { status: AdminShipmentStatus }) {
  const tone =
    status === 'delivered'
      ? 'border-green-200 bg-green-50 text-green-700'
      : status === 'cancelled' || status === 'failed' || status === 'lost'
        ? 'border-red-200 bg-red-50 text-red-700'
        : status === 'pending'
          ? 'border-border bg-muted text-muted-foreground'
          : 'border-brand-200 bg-brand-50 text-brand-600'
  return (
    <span
      data-testid="shipment-status"
      data-status={status}
      className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', tone)}
    >
      {statusLabel(status)}
    </span>
  )
}

// ============================================================================
// The courier — one row, or none
// ============================================================================

export function CourierPanel({ shipment }: { shipment: AdminShipmentDetail }) {
  const courier = courierOf(shipment)

  return (
    <Section
      title="Courier"
      description="Who is carrying the parcel, and the waybill they assigned."
      testId="shipment-courier"
    >
      {courier === null ? (
        <p
          role="status"
          data-testid="shipment-courier-none"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No courier yet. The label is bought from the dispatch queue; once a courier
          accepts the parcel, its name and AWB appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="shipment-courier-table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Courier</th>
                <th className="py-2 pr-4 font-medium">AWB</th>
                <th className="py-2 pr-4 font-medium">Estimated delivery</th>
              </tr>
            </thead>
            <tbody>
              <tr data-testid="shipment-courier-row">
                <td className="py-2 pr-4 font-medium">
                  {courier.name ?? <span className="text-muted-foreground">Unnamed</span>}
                </td>
                <td className="py-2 pr-4 font-mono">
                  {courier.awb ?? <span className="text-muted-foreground">Not assigned</span>}
                </td>
                <td className="py-2 pr-4">{dayLabel(shipment.estimatedDeliveryAt, '—')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ============================================================================
// The label — a button, and the void beside it
// ============================================================================

function LabelDownloadButton({ shipment }: { shipment: AdminShipmentDetail }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        data-testid="shipment-label-download"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            // Same tick, and nothing about the file is kept anywhere.
            await downloadShipmentLabel(
              shipment.id,
              `label-${shipment.awbNumber ?? shipment.id.slice(0, 8)}.pdf`
            )
          } catch (downloadError) {
            if (downloadError instanceof LabelDownloadError && downloadError.status === 404) {
              setError(
                'There is no live label on this shipment any more — it may have been ' +
                  'voided. Reload to see the current state.'
              )
            } else if (
              downloadError instanceof LabelDownloadError &&
              (downloadError.status === 401 || downloadError.status === 403)
            ) {
              setError('Your session has expired. Sign in again and retry.')
            } else {
              // OUR sentence on every other path: the bytes or the save were
              // not had, and a fresh press is the whole remedy.
              setError('The label did not download. Try again in a moment.')
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {busy ? 'Getting the label…' : 'Download the label'}
      </Button>

      {error && (
        <p data-testid="shipment-label-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const VOID_REASON_MIN = 3
const VOID_REASON_MAX = 500

export function VoidLabelForm({
  shipmentId,
  onVoided,
}: {
  shipmentId: string
  onVoided: (result: VoidLabelResult) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonId = `shipment-void-reason-${shipmentId}`
  const hintId = `${reasonId}-hint`

  const trimmed = reason.trim()
  const canSubmit =
    !busy && trimmed.length >= VOID_REASON_MIN && trimmed.length <= VOID_REASON_MAX

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return

    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/shipments/${shipmentId}/void`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>

      if (!response.ok) {
        // The reason is kept: the admin adjusts it rather than retyping it.
        setError(voidRefusalMessage(response.status, body as VoidRefusalBody))
        return
      }

      setReason('')
      await onVoided(body as unknown as VoidLabelResult)
    } catch {
      setError(
        'The request did not reach the server, so nothing was changed. Check the ' +
          'connection and try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form data-testid="shipment-void-form" onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-1">
        {/* The hint sits OUTSIDE the label on purpose. A <label> that wraps
            its control contributes all of its text to that control's
            accessible name, so help text inside it becomes part of the name
            the field answers to — and every getByLabel for it. */}
        <label htmlFor={reasonId} className="text-sm font-medium">
          Reason
        </label>
        <textarea
          id={reasonId}
          rows={3}
          required
          minLength={VOID_REASON_MIN}
          maxLength={VOID_REASON_MAX}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={hintId}
          data-testid="shipment-void-reason"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <span id={hintId} className="text-xs text-muted-foreground">
          Recorded on the shipment and in the audit log — 3 to 500 characters saying
          why. The courier is asked to cancel first; the label is marked void here only
          once they agree.
        </span>
      </div>

      {error && (
        <p data-testid="shipment-void-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" variant="outline" disabled={!canSubmit} data-testid="shipment-void-submit">
        {busy ? 'Voiding…' : 'Void this label'}
      </Button>
    </form>
  )
}

export function LabelPanel({
  shipment,
  onVoided,
}: {
  shipment: AdminShipmentDetail
  onVoided: (result: VoidLabelResult) => void | Promise<void>
}) {
  if (hasLiveLabel(shipment)) {
    return (
      <Section
        title="Label"
        description="Downloads as a file to print and stick on the box — nothing about it is kept on this page."
        testId="shipment-label"
      >
        <LabelDownloadButton shipment={shipment} />
        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-medium">Void this label</h3>
          <p className="text-sm text-muted-foreground">
            For a wrong parcel size, a changed address or a cancelled order. The
            shipment is marked cancelled and a new label can be bought from the queue.
          </p>
          <VoidLabelForm shipmentId={shipment.id} onVoided={onVoided} />
        </div>
      </Section>
    )
  }

  if (shipment.status === 'cancelled') {
    return (
      <Section title="Label" testId="shipment-label">
        <p
          role="status"
          data-testid="shipment-label-voided"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          This label was voided. The row stays as the record of it; buy a new label
          from the dispatch queue when the order is ready to go again.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Label" testId="shipment-label">
      <p
        role="status"
        data-testid="shipment-label-none"
        className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No label yet. It appears here once the courier accepts the purchase.
      </p>
    </Section>
  )
}

// ============================================================================
// The body — three states, exactly one of them shown
// ============================================================================

export interface ShipmentDetailBodyProps {
  data: AdminShipmentDetail | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onVoided: (result: VoidLabelResult) => void | Promise<void>
  /** What the last write came back with, rendered above the panels. */
  notice: string | null
}

export function ShipmentDetailBody({
  data,
  isLoading,
  error,
  onRetry,
  onVoided,
  notice,
}: ShipmentDetailBodyProps) {
  if (error) {
    return (
      <div
        data-testid="shipment-error"
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <div className="mb-1 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
        <p className="text-muted-foreground">
          Nothing about this shipment is shown below — it has not been read, which is
          not the same as it being empty.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          data-testid="shipment-retry"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        data-testid="shipment-skeleton"
        className="space-y-2"
        aria-busy="true"
        aria-label="Loading the shipment"
      >
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="h-20 animate-pulse rounded bg-muted" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div data-testid="shipment-error" role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          This shipment could not be loaded.
        </div>
        <Button type="button" variant="outline" className="mt-3" data-testid="shipment-retry" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  const lines = addressLines(data.order.shippingAddress)

  return (
    <div className="space-y-6">
      {notice && (
        <p
          role="status"
          data-testid="shipment-notice"
          className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-600"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Summary" testId="shipment-summary">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Order</dt>
            <dd>
              <Link
                to="/admin/orders/$id"
                params={{ id: data.orderId }}
                className="text-brand-600 hover:underline"
              >
                {data.order.orderNumber}
              </Link>
            </dd>

            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusPill status={data.status} />
            </dd>

            <dt className="text-muted-foreground">Carrier</dt>
            <dd>{data.carrier ?? data.shippingOption?.carrier ?? '—'}</dd>

            <dt className="text-muted-foreground">Created</dt>
            <dd>{whenLabel(data.createdAt, '—')}</dd>

            <dt className="text-muted-foreground">Shipped</dt>
            <dd>{whenLabel(data.shippedAt, 'Not yet')}</dd>

            <dt className="text-muted-foreground">Delivered</dt>
            <dd>{whenLabel(data.deliveredAt, 'Not yet')}</dd>
          </dl>
          {data.notes && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">{data.notes}</p>
          )}
        </Section>

        <Section
          title="Going to"
          description="The address on the order, which is the address on the label."
          testId="shipment-destination"
        >
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shipping address on the order.</p>
          ) : (
            <address className="text-sm not-italic">
              {lines.map((line, index) => (
                <div key={`${index}-${line}`}>{line}</div>
              ))}
            </address>
          )}
          {data.order.customer && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              {[data.order.customer.name, data.order.customer.email].filter(Boolean).join(' · ')}
            </p>
          )}
        </Section>

        <CourierPanel shipment={data} />
        <LabelPanel shipment={data} onVoided={onVoided} />
      </div>
    </div>
  )
}

// ============================================================================
// The page
// ============================================================================

function AdminShipmentPage() {
  const { shipmentId } = Route.useParams()

  const [detail, setDetail] = useState<AdminShipmentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const claim = useLatestOnly()

  // Guarded: navigating between shipments keeps this component mounted, so a
  // slow earlier read could land after the current one and show the wrong
  // parcel's label controls.
  const load = useCallback(async () => {
    const isCurrent = claim()
    setIsLoading(true)
    try {
      const result = await fetchShipment(shipmentId)
      if (!isCurrent()) return
      setDetail(result)
      setError(null)
    } catch (loadError) {
      // The stale row goes with the error — a void form rendered under a
      // failure banner is an action somebody will take.
      if (!isCurrent()) return
      setDetail(null)
      setError((loadError as Error).message)
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [shipmentId, claim])

  useEffect(() => {
    setNotice(null)
    void load()
  }, [load])

  const handleVoided = async (result: VoidLabelResult) => {
    setNotice(
      result.alreadyCancelledAtCourier
        ? 'Label voided. The courier had already cancelled it on their side.'
        : 'Label voided. The courier has cancelled it and the shipment is marked cancelled.'
    )
    // Re-read rather than patch: the row the void answered with is the
    // shipment alone, and the order beside it is the API's to re-project.
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* A plain anchor, not a typed Link: the queue route is #734's and
              is being built alongside this screen, and a Link to a path the
              route tree does not yet know does not compile. Swap it for
              `<Link to="/admin/dispatch">` once the queue has landed. */}
          <a
            href="/admin/dispatch"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border"
            aria-label="Back to the dispatch queue"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-2xl font-medium">Shipment</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{shipmentId}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={isLoading}
          data-testid="shipment-refresh"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <ShipmentDetailBody
        data={detail}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
        onVoided={handleVoided}
        notice={notice}
      />
    </div>
  )
}
