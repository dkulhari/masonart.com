/**
 * The shipment status vocabulary: theirs onto ours, ours onto the order, and
 * what may follow what.
 *
 * Three tables, and each is data rather than a chain of conditionals, for
 * the reason the ticket (#733) gives: a mapping written as `if`s has no
 * inspectable "unmapped set", and a mapping table that quietly ignores the
 * unexpected is how a stuck order becomes invisible.
 *
 * ## `SHIPROCKET_STATUSES` — theirs onto ours
 *
 * One row per Shiprocket status this codebase knows, keyed by their numeric
 * id (stable) with their text beside it (drifts, and is the fallback when a
 * push carries no id). `ours` is the `shipment_status` it means, or `null`
 * for a status that is KNOWN and deliberately mapped to nothing — the
 * fulfilment-centre states of a warehouse we do not run. A status in neither
 * column is unknown, and `mapShiprocketStatus` says which of the two it was:
 * an ignored status is acknowledged in silence, an unknown one is recorded
 * where an admin will see it.
 *
 * Transcribed from Shiprocket's documented status list. Where their
 * vocabulary is finer than ours, several of theirs land on one of ours; where
 * theirs is a state ours has no word for (partial delivery), it is listed as
 * ignored rather than forced onto the nearest value.
 *
 * ## `ORDER_STATUS_FOR_SHIPMENT_STATUS` / `ORDER_FOLLOWS_ITS_SHIPMENT`
 *
 * Moved here from `routes/admin/shipments.ts` (#730), where they were born,
 * so the admin route and the courier webhook read ONE table. The route
 * re-exports them; `tests/routes/admin/shipments-status-propagation.test.ts`
 * holds both to the enums through that re-export.
 *
 * ## `shipmentMayMoveTo` — what a courier fact is allowed to do
 *
 * Scans arrive out of order and are replayed. The delivery path is ordered,
 * and a shipment only moves forward along it; trouble (an NDR, an RTO, a
 * loss) may be reported from anywhere that is not already the end; and a
 * terminal state is terminal. A late "in transit" after "delivered" is noise
 * to acknowledge, not a regression to apply.
 *
 * @see packages/api/tests/lib/shipment-status.test.ts
 */

import type { OrderStatus } from '../database/schema/orders'
import type { ShipmentStatus } from '../database/schema/shipping'

// ============================================================================
// Ours onto the order (moved from routes/admin/shipments.ts)
// ============================================================================

/**
 * What a shipment status means for `orders.status`, or `null` for nothing.
 *
 * `null` is a decision, not an omission: `in_transit` is already covered by
 * `shipped`, and re-stamping `shipped` on every scan would move
 * `orders.shipped_at` each time. `undelivered` leaves the order at
 * `out_for_delivery`, the truest thing the order enum can say about a parcel
 * the courier still holds. RTO, lost, cancelled and failed are courier facts
 * recorded on the shipment; what happens to the ORDER (a refund, a re-ship)
 * is an admin's decision, not a scan's.
 */
export const ORDER_STATUS_FOR_SHIPMENT_STATUS: Record<ShipmentStatus, OrderStatus | null> = {
  /** A row exists, no label bought. The order is still `processing` at most. */
  pending: null,
  /** We hold a label. Nothing has been handed to a courier yet. */
  label_created: null,
  shipped: 'shipped',
  /** Already covered by `shipped`; a second write would move `shipped_at`. */
  in_transit: null,
  out_for_delivery: 'out_for_delivery',
  /** NDR: the courier still holds it. `out_for_delivery` remains the truest word. */
  undelivered: null,
  delivered: 'delivered',
  rto_initiated: null,
  rto_delivered: null,
  lost: null,
  cancelled: null,
  failed: null,
}

/**
 * Whether a courier fact may move the order at all, by where the order is.
 *
 * An order that has left the fulfilment track — cancelled, refunding,
 * refunded, failed, or never paid — is not driven forward by a scan. The
 * delivery is still recorded on the shipment either way.
 */
export const ORDER_FOLLOWS_ITS_SHIPMENT: Record<OrderStatus, boolean> = {
  /** No payment yet. A parcel moving on one of these is a bug worth leaving visible. */
  pending: false,
  pending_payment: false,
  confirmed: true,
  processing: true,
  shipped: true,
  out_for_delivery: true,
  delivered: true,
  /** The order was called off. A courier scan does not un-call it. */
  cancelled: false,
  /** A refund is being decided. Moving to `delivered` would erase the request. */
  refund_requested: false,
  refunded: false,
  failed: false,
}

export function orderFollowsItsShipment(orderStatus: OrderStatus): boolean {
  return ORDER_FOLLOWS_ITS_SHIPMENT[orderStatus] === true
}

export function orderShouldMoveTo(
  current: OrderStatus,
  next: OrderStatus | null
): next is OrderStatus {
  return next !== null && next !== current && orderFollowsItsShipment(current)
}

// ============================================================================
// Theirs onto ours
// ============================================================================

export interface ShiprocketStatus {
  /** Their numeric status id. Stable; the primary key of this table. */
  readonly id: number
  /** Their text, as documented. The fallback key when a push carries no id. */
  readonly text: string
  /** The `shipment_status` it means, or null for a known status mapped to nothing. */
  readonly ours: ShipmentStatus | null
}

export const SHIPROCKET_STATUSES: readonly ShiprocketStatus[] = [
  // Before the parcel leaves: a label exists, nothing has been collected.
  { id: 1, text: 'AWB Assigned', ours: 'label_created' },
  { id: 2, text: 'Label Generated', ours: 'label_created' },
  { id: 3, text: 'Pickup Scheduled', ours: 'label_created' },
  { id: 4, text: 'Pickup Queued', ours: 'label_created' },
  { id: 5, text: 'Manifest Generated', ours: 'label_created' },
  { id: 11, text: 'Pending', ours: 'pending' },
  { id: 13, text: 'Pickup Error', ours: 'label_created' },
  { id: 15, text: 'Pickup Rescheduled', ours: 'label_created' },
  { id: 19, text: 'Out For Pickup', ours: 'label_created' },
  { id: 20, text: 'Pickup Exception', ours: 'label_created' },

  // Collected and moving.
  { id: 6, text: 'Shipped', ours: 'shipped' },
  { id: 42, text: 'Picked Up', ours: 'shipped' },
  { id: 51, text: 'Handover to Courier', ours: 'shipped' },
  { id: 52, text: 'Shipment Booked', ours: 'shipped' },
  { id: 18, text: 'In Transit', ours: 'in_transit' },
  { id: 22, text: 'Delayed', ours: 'in_transit' },
  { id: 38, text: 'Reached at Destination Hub', ours: 'in_transit' },
  { id: 39, text: 'Misrouted', ours: 'in_transit' },
  { id: 48, text: 'Reached Warehouse', ours: 'in_transit' },
  { id: 49, text: 'Custom Cleared', ours: 'in_transit' },
  { id: 50, text: 'In Flight', ours: 'in_transit' },
  { id: 54, text: 'In Transit Overseas', ours: 'in_transit' },
  { id: 55, text: 'Connection Aligned', ours: 'in_transit' },
  { id: 56, text: 'Reached Destination', ours: 'in_transit' },
  { id: 17, text: 'Out For Delivery', ours: 'out_for_delivery' },

  // The door.
  { id: 7, text: 'Delivered', ours: 'delivered' },
  { id: 26, text: 'Fulfilled', ours: 'delivered' },
  { id: 21, text: 'Undelivered', ours: 'undelivered' },
  { id: 77, text: 'Issue Related to the Recipient', ours: 'undelivered' },

  // Coming back. The pickup location is the consolidating vendor, so an RTO
  // parcel lands back with the vendor who despatched it.
  { id: 9, text: 'RTO Initiated', ours: 'rto_initiated' },
  { id: 14, text: 'RTO Acknowledged', ours: 'rto_initiated' },
  { id: 40, text: 'RTO NDR', ours: 'rto_initiated' },
  { id: 41, text: 'RTO OFD', ours: 'rto_initiated' },
  { id: 46, text: 'RTO In Transit', ours: 'rto_initiated' },
  { id: 75, text: 'RTO Lock', ours: 'rto_initiated' },
  { id: 10, text: 'RTO Delivered', ours: 'rto_delivered' },
  { id: 78, text: 'Reached Back at Seller City', ours: 'rto_delivered' },

  // The end of the line.
  { id: 12, text: 'Lost', ours: 'lost' },
  { id: 76, text: 'Untraceable', ours: 'lost' },
  { id: 8, text: 'Cancelled', ours: 'cancelled' },
  { id: 45, text: 'Cancelled Before Dispatched', ours: 'cancelled' },
  { id: 24, text: 'Destroyed', ours: 'failed' },
  { id: 25, text: 'Damaged', ours: 'failed' },
  { id: 44, text: 'Disposed Off', ours: 'failed' },

  // Known, and mapped to nothing. A request to cancel is not a cancellation;
  // a partial delivery is a state our enum has no word for and forcing it
  // onto `delivered` would tell a customer the whole order arrived; the rest
  // are the states of a fulfilment centre we do not use.
  { id: 16, text: 'Cancellation Requested', ours: null },
  { id: 23, text: 'Partial Delivered', ours: null },
  { id: 43, text: 'Self Fulfilled', ours: null },
  { id: 47, text: 'QC Failed', ours: null },
  { id: 57, text: 'Box Packing', ours: null },
  { id: 59, text: 'FC Allocated', ours: null },
  { id: 60, text: 'Picklist Generated', ours: null },
  { id: 61, text: 'Ready To Pack', ours: null },
  { id: 62, text: 'Packed', ours: null },
  { id: 67, text: 'FC Manifest Generated', ours: null },
  { id: 68, text: 'Processed at Warehouse', ours: null },
  { id: 71, text: 'Handover Exception', ours: null },
  { id: 72, text: 'Packed Exception', ours: null },
]

/** Their text, reduced to one spelling: lower case, one space, no punctuation. */
export function normaliseShiprocketStatusText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const BY_ID = new Map(SHIPROCKET_STATUSES.map((s) => [s.id, s] as const))
const BY_TEXT = new Map(
  SHIPROCKET_STATUSES.map((s) => [normaliseShiprocketStatusText(s.text), s] as const)
)

export interface ShiprocketStatusMapping {
  ours: ShipmentStatus | null
  /** True when the status is in the table, even if mapped to nothing. */
  known: boolean
}

/**
 * Their status onto ours. The id first, because ids are stable and text
 * drifts; the text when the id is absent or one we have never seen.
 */
export function mapShiprocketStatus(
  push: { statusId: number | null; status: string },
  options?: { detail?: false }
): ShipmentStatus | null
export function mapShiprocketStatus(
  push: { statusId: number | null; status: string },
  options: { detail: true }
): ShiprocketStatusMapping
export function mapShiprocketStatus(
  push: { statusId: number | null; status: string },
  options: { detail?: boolean } = {}
): ShipmentStatus | null | ShiprocketStatusMapping {
  const byId = push.statusId === null ? undefined : BY_ID.get(push.statusId)
  const found = byId ?? BY_TEXT.get(normaliseShiprocketStatusText(push.status))
  const mapping: ShiprocketStatusMapping = found
    ? { ours: found.ours, known: true }
    : { ours: null, known: false }
  return options.detail ? mapping : mapping.ours
}

// ============================================================================
// What may follow what
// ============================================================================

/** The delivery path, in order. A shipment moves forward along it only. */
const DELIVERY_PATH: readonly ShipmentStatus[] = [
  'pending',
  'label_created',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
]

/** Nothing follows these. */
export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'delivered',
  'rto_delivered',
  'cancelled',
  'lost',
  'failed',
]

/** Where a parcel can go once it is coming back: back, or nowhere. */
const AFTER_RTO_INITIATED: readonly ShipmentStatus[] = ['rto_delivered', 'lost', 'failed']

/** After a failed attempt: out again, delivered, still moving, back, or gone. */
const AFTER_UNDELIVERED: readonly ShipmentStatus[] = [
  'in_transit',
  'out_for_delivery',
  'delivered',
  'undelivered',
  'rto_initiated',
  'rto_delivered',
  'lost',
  'cancelled',
  'failed',
]

function pathRank(status: ShipmentStatus): number {
  return DELIVERY_PATH.indexOf(status)
}

/**
 * May a courier fact move a shipment from `current` to `next`?
 *
 * Decided by table, not by trust in arrival order: forward along the path,
 * trouble from anywhere that is not the end, and never out of a terminal
 * state. Equal is never a move.
 */
export function shipmentMayMoveTo(current: ShipmentStatus, next: ShipmentStatus): boolean {
  if (next === current) return false
  if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return false

  if (current === 'rto_initiated') return AFTER_RTO_INITIATED.includes(next)
  if (current === 'undelivered') return AFTER_UNDELIVERED.includes(next) && next !== 'undelivered'

  const from = pathRank(current)
  const to = pathRank(next)
  // Both on the path: forward only.
  if (from >= 0 && to >= 0) return to > from
  // Off the path from on it: trouble may be reported from anywhere not terminal.
  return to < 0
}
