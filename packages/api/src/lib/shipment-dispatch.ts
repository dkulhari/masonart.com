/**
 * Buying a shipping label for an order (#728).
 *
 * The one place in this codebase that turns "the goods are assembled at the
 * consolidator" into a courier collecting a parcel: a courier order, a
 * waybill, a label PDF stored under an identity-free token, and a pickup.
 *
 * ## The shape is lock → claim → COMMIT → call → reconcile
 *
 * The ticket offered two shapes and the decision on it chose the second. A
 * courier call inside an open transaction holds `FOR UPDATE` on the order's
 * production job rows for as long as Shiprocket takes to answer — an external
 * service with no latency guarantee, on a pool this app shares with a dev box
 * running many sessions. So nothing here talks to a courier while holding a
 * lock. The claim transaction is short and does four things:
 *
 * 1. takes `FOR UPDATE` on the order's job rows and its open shipment rows;
 * 2. asks `getOrderLabelReadiness(orderId, tx)` THROUGH that transaction —
 *    readiness read outside the lock is the concurrency bug this module exists
 *    to prevent (two admins both read "ready", both buy);
 * 3. refuses if a live label exists, or if a claim is already in flight;
 * 4. writes the claim and commits.
 *
 * Only then is a courier asked anything, and every answer is written back to
 * the row before the next question is asked.
 *
 * ## The claim IS the token
 *
 * The intent marker is `order_shipments.label_object_token`, minted before the
 * purchase and written under the lock with its predicate repeated
 * (`label_object_token IS NULL AND voided_at IS NULL`). Three things follow:
 *
 * - **Exactly one purchase per order, in one process or twenty.** The lock
 *   serialises claimants; the guarded update refuses a claim that raced past
 *   it; and `order_shipments_live_label_idx` — the partial unique index #703
 *   added — refuses a second live token at the database, for a path that
 *   bypassed both. `tests/database/shipment-dispatch-concurrency.test.ts`
 *   drives two real transactions at this and counts labels.
 * - **A crash leaves a row that says "we may have bought this."** A token with
 *   `status = 'pending'` is a purchase that started and did not finish. It is
 *   never read as "done" (that is `label_created`, written last) and never as
 *   "never started" (that is a null token). `findUnfinishedLabelPurchases`
 *   lists such rows, `reconcileLabelPurchase` resumes one by id, and
 *   `buyLabelForOrder` resumes one itself once it is older than
 *   `STALE_LABEL_CLAIM_MS` — a younger one is refused as in progress, because
 *   the process that claimed it is most likely still on the phone to the
 *   courier.
 * - **Nothing is bought twice on a resume.** Each courier step is skipped when
 *   the row already carries its answer: ids present → the create's own lookup
 *   returns them; a waybill present → no assign and no re-quote; the label
 *   object present in storage → the label is HELD and the client sends
 *   nothing. The one crash that can cost money is between the label answer
 *   and the upload: the file never landed, and fetching it again is billed
 *   (premise 4 in `services/shiprocket.ts`). That is stated here rather than
 *   hidden, and it is the price of never storing a label URL.
 *
 * ## What the token is not
 *
 * It is never the order id and never derived from it. It rides in the path of
 * a signed URL a vendor opens (`lib/vendor-scope.ts`), which is the one place
 * an assertion about JSON keys can never reach, so it is 24 random bytes,
 * base64url. The object lives at `fulfilment/labels/<token>.pdf` and the key
 * carries nothing else — no order number, no name, no metadata.
 *
 * ## Money
 *
 * The courier is quoted with the order's REAL cod status, read from
 * `orders.payment_details.method`, because #725 measured the same route at
 * ₹153.15 prepaid and ₹208.80 COD: a quote is only valid for the flag it was
 * asked with. Every money term is handed to the client as a named field in
 * paise, and gift-card tender is folded into the courier's discount — the
 * schema is right that tender is not a discount, and the courier has exactly
 * one field for "everything that reduces what is collected at the door".
 *
 * ## The seam
 *
 * `lib/shipment-*` is admitted in `LABEL_READINESS_CONSUMERS` for precisely
 * this file, and `tests/lib/production-seam.test.ts` holds it to that: this
 * module may ask readiness, and nothing under `lib/production-*` may import
 * anything named shiprocket. The carrier is imported HERE, under `lib/`, and
 * production facts cross into it as values.
 *
 * @see packages/api/src/services/shiprocket.ts
 * @see packages/api/src/lib/production-readiness.ts
 * @see packages/api/tests/lib/shipment-dispatch.test.ts
 * @see packages/api/tests/database/shipment-dispatch-concurrency.test.ts
 */

import { randomBytes } from 'node:crypto'

import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { db } from '../database'
import { orderItems, orders, type OrderShippingAddress } from '../database/schema/orders'
import { productionJobs } from '../database/schema/production-jobs'
import { orderShipments, type ShipmentStatus } from '../database/schema/shipping'
import { users } from '../database/schema/users'
import { vendors } from '../database/schema/vendors'
import { recordAudit } from './audit'
import { logger } from './logger'
import { isUniqueViolation } from './pg-errors'
import { getOrderLabelReadiness, type LabelBlocker } from './production-readiness'
import { toPaise, toRupees } from './razorpay'
import { fileExists, uploadFile } from './storage'
import {
  assignAwb,
  createCourierOrder,
  generateLabel,
  schedulePickup,
  selectCourierFor,
  ShiprocketPickupNotScheduledError,
  type CourierOrderLookup,
  type CreateCourierOrderInput,
  type PickupSchedule,
} from '../services/shiprocket'

// ============================================================================
// Vocabulary
// ============================================================================

/** The aggregator every label here is bought through. `courier_name` is who carries it. */
export const LABEL_CARRIER = 'Shiprocket'

/** Where label objects live. The token is the whole of the file name. */
export const LABEL_OBJECT_PREFIX = 'fulfilment/labels/'

export function labelObjectKey(token: string): string {
  return `${LABEL_OBJECT_PREFIX}${token}.pdf`
}

/**
 * How old a claim has to be before a second `buyLabelForOrder` resumes it
 * rather than refusing it as in progress.
 *
 * Five minutes is ten write timeouts of the courier client. A purchase still
 * running after that has no process behind it.
 */
export const STALE_LABEL_CLAIM_MS = 5 * 60 * 1000

export const DISPATCH_REFUSAL_CODES = [
  /** No `orders` row for that id. */
  'ORDER_NOT_FOUND',
  /** Production says the goods are not assembled. The blockers travel with it. */
  'ORDER_NOT_READY',
  /** A live label already exists. Void it before buying another. */
  'ORDER_HAS_LIVE_LABEL',
  /** Somebody claimed this order's label moments ago and has not finished. */
  'LABEL_PURCHASE_IN_PROGRESS',
  /** The consolidating vendor has no postcode, so no courier can be asked. */
  'PICKUP_VENDOR_UNQUOTABLE',
  /** `reconcileLabelPurchase` was pointed at a row that is not an unfinished claim. */
  'NOTHING_TO_RECONCILE',
] as const

export type DispatchRefusalCode = (typeof DISPATCH_REFUSAL_CODES)[number]

/**
 * What a route answers each refusal with.
 *
 * 409 for every state of the world the caller did not make and cannot change
 * by re-sending the same request; 422 for the one thing an admin can go and
 * fix; 404 for an id that names nothing.
 */
export const DISPATCH_REFUSAL_STATUS: Record<DispatchRefusalCode, number> = {
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_READY: 409,
  ORDER_HAS_LIVE_LABEL: 409,
  LABEL_PURCHASE_IN_PROGRESS: 409,
  PICKUP_VENDOR_UNQUOTABLE: 422,
  NOTHING_TO_RECONCILE: 409,
}

export class ShipmentDispatchError extends Error {
  readonly code: DispatchRefusalCode
  /** Present on `ORDER_NOT_READY`: every reason, for the screen to render as-is. */
  readonly blockers?: readonly LabelBlocker[]
  /** The row the refusal is about, when there is one an admin can address. */
  readonly shipmentId?: string

  constructor(
    message: string,
    code: DispatchRefusalCode,
    extra: { blockers?: readonly LabelBlocker[]; shipmentId?: string } = {}
  ) {
    super(message)
    this.name = 'ShipmentDispatchError'
    this.code = code
    if (extra.blockers) this.blockers = extra.blockers
    if (extra.shipmentId) this.shipmentId = extra.shipmentId
  }
}

// ============================================================================
// Inputs and outputs
// ============================================================================

export interface DispatchParcel {
  /** Integer grams. What actually goes out, which is not what the cart estimated. */
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface BuyLabelInput {
  parcel: DispatchParcel
  /**
   * A courier preference. Omitted, the cheapest serviceable courier for the
   * route and the order's cod status is chosen. Shiprocket may assign a
   * different one regardless; what is stored is the one that answered.
   */
  courierCompanyId?: number
}

/**
 * The part of a request context `recordAudit` reads. Structural on purpose,
 * as `lib/audit.ts` declares it: a reconcile run from a script hands over a
 * stub rather than faking a request.
 */
export interface DispatchActor {
  get(key: string): unknown
  set(key: string, value: unknown): void
  req: {
    method: string
    path: string
    header(name: string): string | undefined
  }
}

export type PickupOutcome =
  | {
      readonly scheduled: true
      readonly scheduledFor: string | null
      readonly tokenNumber: string | null
      readonly alreadyScheduled: boolean
    }
  /**
   * The label is bought and recorded; only the collection is not booked.
   * `retryable` is the courier client's word for it: true means ask again as
   * it stands, false means somebody has to look. Never a reason to void.
   */
  | { readonly scheduled: false; readonly retryable: boolean; readonly reason: string }

export interface LabelPurchase {
  readonly shipmentId: string
  readonly orderId: string
  readonly labelObjectToken: string
  readonly awbNumber: string
  readonly courierName: string
  /** Known when this run assigned the waybill; null on a resume that found one recorded. */
  readonly courierCompanyId: number | null
  readonly costPaise: number | null
  readonly externalOrderId: string
  readonly externalShipmentId: string
  readonly pickupVendorId: string
  /** True when this call picked up a claim an earlier run left unfinished. */
  readonly resumed: boolean
  readonly pickup: PickupOutcome
}

export interface UnfinishedLabelPurchase {
  shipmentId: string
  orderId: string
  /** The last time the purchase made progress, which is what the staleness rule reads. */
  claimedAt: Date
  /** Present when the crash came after the waybill, which is most of the way. */
  awbNumber: string | null
}

// ============================================================================
// What the claim carries out of its transaction
// ============================================================================

/** The shipment row, in the columns the purchase reads and writes back. */
interface ShipmentRow {
  id: string
  orderId: string
  status: ShipmentStatus
  labelObjectToken: string | null
  voidedAt: Date | null
  awbNumber: string | null
  courierName: string | null
  externalOrderId: string | null
  externalShipmentId: string | null
  costPaise: number | null
  pickupVendorId: string | null
  updatedAt: Date
}

const SHIPMENT_COLUMNS = {
  id: orderShipments.id,
  orderId: orderShipments.orderId,
  status: orderShipments.status,
  labelObjectToken: orderShipments.labelObjectToken,
  voidedAt: orderShipments.voidedAt,
  awbNumber: orderShipments.awbNumber,
  courierName: orderShipments.courierName,
  externalOrderId: orderShipments.externalOrderId,
  externalShipmentId: orderShipments.externalShipmentId,
  costPaise: orderShipments.costPaise,
  pickupVendorId: orderShipments.pickupVendorId,
  updatedAt: orderShipments.updatedAt,
} as const

/** Everything the courier order is built from, read once under the lock. */
interface OrderFacts {
  orderId: string
  orderNumber: string
  orderDate: Date
  cod: boolean
  consignee: CreateCourierOrderInput['consignee']
  items: CreateCourierOrderInput['items']
  charges: CreateCourierOrderInput['charges']
  deliveryPincode: string
}

interface VendorFacts {
  id: string
  pickupLocation: string | null
  pickupPincode: string | null
}

interface Claim {
  row: ShipmentRow
  token: string
  order: OrderFacts
  vendor: VendorFacts
  parcel: DispatchParcel
  courierCompanyId: number | undefined
  resumed: boolean
}

/** The read surface a transaction handle and the root db share. */
type Reader = { select: typeof db.select }

// ============================================================================
// Reading the order into courier terms
// ============================================================================

/** ISO 3166 alpha-2 to the name Shiprocket's payload takes. */
const COUNTRY_NAMES: Readonly<Record<string, string>> = { IN: 'India' }

function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code
}

function joinPresent(parts: ReadonlyArray<string | null | undefined>): string | null {
  const present = parts.map((p) => (p ?? '').trim()).filter((p) => p !== '')
  return present.length === 0 ? null : present.join(', ')
}

/**
 * Whether a courier collects cash at the door for this order.
 *
 * Read from the order rather than assumed: nothing writes `'cod'` into
 * `payment_details.method` today, and this is still the right place to ask,
 * because a quote is only valid for the flag it was requested with (#725
 * measured ₹55 between the two on one route) and the day cash on delivery is
 * offered is not the day anyone will remember this function.
 */
function orderIsCod(paymentDetails: { method?: string } | null | undefined): boolean {
  return (paymentDetails?.method ?? '').toLowerCase() === 'cod'
}

async function readOrderFacts(reader: Reader, orderId: string): Promise<OrderFacts | null> {
  const [order] = await reader
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      shippingAddress: orders.shippingAddress,
      paymentDetails: orders.paymentDetails,
      subtotal: orders.subtotal,
      discount: orders.discount,
      shippingCost: orders.shippingCost,
      tax: orders.tax,
      total: orders.total,
      giftCardAmount: orders.giftCardAmount,
      guestEmail: orders.guestEmail,
      email: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) return null

  const lines = await reader
    .select({
      id: orderItems.id,
      snapshot: orderItems.snapshot,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  const address = order.shippingAddress as OrderShippingAddress
  const giftCardPaise = toPaise(order.giftCardAmount ?? '0')

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    cod: orderIsCod(order.paymentDetails),
    consignee: {
      name: address.fullName,
      addressLine1: address.addressLine1,
      addressLine2: joinPresent([address.addressLine2, address.landmark]),
      city: address.city,
      state: address.state,
      pincode: address.postalCode,
      country: countryName(address.countryCode),
      phone: address.phone,
      email: order.email ?? order.guestEmail ?? '',
    },
    items: lines.map((line) => ({
      name: line.snapshot.title,
      sku: line.snapshot.sku,
      units: line.quantity,
      sellingPricePaise: toPaise(line.unitPrice),
    })),
    charges: {
      shippingPaise: toPaise(order.shippingCost ?? '0'),
      // The schema is right that tender is not a discount. The courier has one
      // field for everything that reduces what is collected at the door, and
      // on a COD parcel part-paid by gift card that is where the tender goes —
      // or a courier collects money the customer has already paid.
      discountPaise: toPaise(order.discount ?? '0') + giftCardPaise,
      taxPaise: toPaise(order.tax ?? '0'),
      transactionPaise: 0,
      giftwrapPaise: 0,
      amountDuePaise: toPaise(order.total) - giftCardPaise,
    },
    deliveryPincode: address.postalCode,
  }
}

async function readVendorFacts(reader: Reader, vendorId: string): Promise<VendorFacts | null> {
  const [vendor] = await reader
    .select({
      id: vendors.id,
      pickupLocation: vendors.shiprocketPickupLocation,
      pickupPincode: vendors.postalCode,
    })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1)

  return vendor ?? null
}

function assertVendorQuotable(vendor: VendorFacts | null, vendorId: string): VendorFacts {
  if (vendor && (vendor.pickupPincode ?? '').trim() !== '') return vendor
  throw new ShipmentDispatchError(
    `The consolidating vendor ${vendorId} has no postcode on record, so no courier can be asked ` +
      'whether it serves the route. Open the vendor and set their postal code, then dispatch again. ' +
      'Nothing has been claimed or sent.',
    'PICKUP_VENDOR_UNQUOTABLE'
  )
}

/** 24 random bytes, base64url: 32 characters inside `LABEL_TOKEN_PATTERN`, and nobody's id. */
function mintLabelToken(): string {
  return randomBytes(24).toString('base64url')
}

function isFinished(row: ShipmentRow): boolean {
  return row.labelObjectToken !== null && row.status === 'label_created'
}

function isUnfinishedClaim(row: ShipmentRow): boolean {
  return row.labelObjectToken !== null && row.status === 'pending' && row.voidedAt === null
}

function claimAgeMs(row: ShipmentRow, now: number): number {
  return now - row.updatedAt.getTime()
}

function inProgress(row: ShipmentRow): ShipmentDispatchError {
  return new ShipmentDispatchError(
    `A label for this order is being bought right now on shipment ${row.id}. Wait for it to ` +
      `finish; if it is still unfinished after ${Math.round(STALE_LABEL_CLAIM_MS / 60000)} ` +
      'minutes, dispatching again will resume it.',
    'LABEL_PURCHASE_IN_PROGRESS',
    { shipmentId: row.id }
  )
}

// ============================================================================
// The claim
// ============================================================================

/**
 * Lock, ask readiness through the lock, refuse or claim, commit.
 *
 * Returns the claim to purchase against. When the order carries a stale
 * unfinished claim, that claim is returned with `resumed: true` and NOTHING is
 * written — the resume is decided here, under the same lock, so two resumers
 * cannot both take it up.
 */
async function claimLabel(
  orderId: string,
  input: BuyLabelInput,
  now: number
): Promise<Claim> {
  return db.transaction(async (tx) => {
    // 1. The lock. Every job row on the order, so a QC pass, a despatch or a
    // consolidator change landing during this transaction waits behind it.
    await tx
      .select({ id: productionJobs.id })
      .from(productionJobs)
      .where(eq(productionJobs.orderId, orderId))
      .for('update')

    // ...and the order's live shipment rows, so two claimants on an order with
    // no jobs at all still queue. Newest first: the row an admin opened last
    // is the one they mean.
    const live = (await tx
      .select(SHIPMENT_COLUMNS)
      .from(orderShipments)
      .where(and(eq(orderShipments.orderId, orderId), isNull(orderShipments.voidedAt)))
      .orderBy(desc(orderShipments.createdAt), desc(orderShipments.id))
      .for('update')) as ShipmentRow[]

    // 2. Readiness, THROUGH the transaction. `getOrderLabelReadiness` rather
    // than `isOrderReadyToLabel` because the refusal carries the blockers; the
    // verdict is the same `blockers.length === 0` the gate function is.
    const readiness = await getOrderLabelReadiness(orderId, tx)
    if (readiness.blockers.length > 0) {
      const notFound = readiness.blockers.some((b) => b.code === 'order_not_found')
      throw new ShipmentDispatchError(
        notFound
          ? `Order ${orderId} does not exist.`
          : `Order ${orderId} is not ready to label: ${readiness.blockers.map((b) => b.message).join(' ')}`,
        notFound ? 'ORDER_NOT_FOUND' : 'ORDER_NOT_READY',
        { blockers: readiness.blockers }
      )
    }

    // 3. What already exists. A finished label refuses outright; an unfinished
    // claim is either somebody else's work in progress or a crash to resume.
    const finished = live.find(isFinished)
    if (finished) {
      throw new ShipmentDispatchError(
        `Order ${orderId} already has a live label on shipment ${finished.id}` +
          (finished.awbNumber ? ` (AWB ${finished.awbNumber})` : '') +
          '. Void it before buying another.',
        'ORDER_HAS_LIVE_LABEL',
        { shipmentId: finished.id }
      )
    }

    const unfinished = live.find(isUnfinishedClaim)
    if (unfinished && claimAgeMs(unfinished, now) < STALE_LABEL_CLAIM_MS) {
      throw inProgress(unfinished)
    }

    // 4. The facts the courier order is built from, read under the same lock.
    const order = await readOrderFacts(tx, orderId)
    if (!order) {
      throw new ShipmentDispatchError(`Order ${orderId} does not exist.`, 'ORDER_NOT_FOUND')
    }

    // The consolidator is who the courier collects from — the claim's own
    // record of it if resuming, readiness's otherwise. Readiness has already
    // refused an order with no consolidator, so the fallback is for the type.
    const vendorId = unfinished?.pickupVendorId ?? readiness.consolidatorVendorId
    if (!vendorId) {
      throw new ShipmentDispatchError(
        `Order ${orderId} has no consolidating vendor to collect from.`,
        'ORDER_NOT_READY',
        { blockers: readiness.blockers }
      )
    }
    const vendor = assertVendorQuotable(await readVendorFacts(tx, vendorId), vendorId)

    if (unfinished) {
      return {
        row: unfinished,
        token: unfinished.labelObjectToken!,
        order,
        vendor,
        parcel: input.parcel,
        courierCompanyId: input.courierCompanyId,
        resumed: true,
      }
    }

    // 5. The row to claim: the newest open unlabelled one, or a new one. Then
    // the claim itself — a guarded update whose predicate repeats what the
    // locked read established, so a claim that somehow raced past the lock
    // matches nothing rather than overwriting a token.
    const target = live.find((row) => row.status === 'pending' && row.labelObjectToken === null)
    const rowId = target?.id ?? (await openShipmentRow(tx, orderId))
    const token = mintLabelToken()

    let claimed: { id: string }[]
    try {
      claimed = await tx
        .update(orderShipments)
        .set({
          labelObjectToken: token,
          carrier: LABEL_CARRIER,
          pickupVendorId: vendorId,
          shippedWeightGrams: input.parcel.weightGrams,
          lengthCm: input.parcel.lengthCm,
          widthCm: input.parcel.widthCm,
          heightCm: input.parcel.heightCm,
          updatedAt: new Date(now),
        })
        .where(
          and(
            eq(orderShipments.id, rowId),
            isNull(orderShipments.labelObjectToken),
            isNull(orderShipments.voidedAt)
          )
        )
        .returning({ id: orderShipments.id })
    } catch (error) {
      // `order_shipments_live_label_idx`: a second live token on this order
      // reached the database. Only reachable past the lock; refused the same.
      if (isUniqueViolation(error)) {
        throw inProgress({ ...(target ?? emptyRow(rowId, orderId)), id: rowId })
      }
      throw error
    }

    if (claimed.length !== 1) {
      throw inProgress({ ...(target ?? emptyRow(rowId, orderId)), id: rowId })
    }

    return {
      row: {
        ...(target ?? emptyRow(rowId, orderId)),
        id: rowId,
        labelObjectToken: token,
        pickupVendorId: vendorId,
        updatedAt: new Date(now),
      },
      token,
      order,
      vendor,
      parcel: input.parcel,
      courierCompanyId: input.courierCompanyId,
      resumed: false,
    }
  })
}

function emptyRow(id: string, orderId: string): ShipmentRow {
  return {
    id,
    orderId,
    status: 'pending',
    labelObjectToken: null,
    voidedAt: null,
    awbNumber: null,
    courierName: null,
    externalOrderId: null,
    externalShipmentId: null,
    costPaise: null,
    pickupVendorId: null,
    updatedAt: new Date(0),
  }
}

/** The row `POST /orders/:orderId/ship` would have opened, opened here instead. */
async function openShipmentRow(tx: { insert: typeof db.insert }, orderId: string): Promise<string> {
  const [opened] = await tx
    .insert(orderShipments)
    .values({ orderId, carrier: LABEL_CARRIER, status: 'pending' })
    .returning({ id: orderShipments.id })
  if (!opened) throw new Error('insert into order_shipments returned no row')
  return opened.id
}

// ============================================================================
// The purchase
// ============================================================================

/**
 * The idempotency lookup the courier client requires. Reads the row's ids
 * FRESH by the row id the courier was given, never from the claim snapshot:
 * on a resume the snapshot is what the crash left, and the row may have moved.
 */
const lookupCourierOrder: CourierOrderLookup = async (shipmentRowId) => {
  const [row] = await db
    .select({
      externalOrderId: orderShipments.externalOrderId,
      externalShipmentId: orderShipments.externalShipmentId,
    })
    .from(orderShipments)
    .where(eq(orderShipments.id, shipmentRowId))
    .limit(1)
  return row ?? null
}

async function writeBack(
  shipmentId: string,
  values: Partial<typeof orderShipments.$inferInsert>,
  what: string
): Promise<void> {
  const written = await db
    .update(orderShipments)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(orderShipments.id, shipmentId))
    .returning({ id: orderShipments.id })
  if (written.length !== 1) {
    throw new Error(`shipment ${shipmentId} vanished while writing ${what}`)
  }
}

/**
 * Every courier step, each skipped when the row already holds its answer.
 *
 * Runs OUTSIDE any transaction. Every answer is written back before the next
 * question is asked, so a crash at any point leaves a row the next run can
 * read its position from.
 */
async function purchase(claim: Claim, actor: DispatchActor): Promise<LabelPurchase> {
  const { order, vendor, parcel, token } = claim
  let row = claim.row

  // The quote. Skipped when the waybill is already recorded: the rate was
  // booked when the waybill was, and a second quote is a second price for a
  // parcel that already has one.
  let courierCompanyId: number | null = null
  let costPaise: number | null = row.costPaise
  if (row.awbNumber === null) {
    const chosen = await selectCourierFor({
      pickupPincode: vendor.pickupPincode!,
      deliveryPincode: order.deliveryPincode,
      weightKg: parcel.weightGrams / 1000,
      cod: order.cod,
    })
    courierCompanyId = claim.courierCompanyId ?? chosen.courierCompanyId
    costPaise = chosen.ratePaise
  }

  // The courier order. The client's own lookup short-circuits on recorded ids.
  const ref = await createCourierOrder(
    {
      shipmentRowId: row.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      pickupLocation: vendor.pickupLocation,
      cod: order.cod,
      consignee: order.consignee,
      items: order.items,
      parcel,
      charges: order.charges,
    },
    lookupCourierOrder
  )
  if (ref.created || row.externalOrderId === null || row.externalShipmentId === null) {
    await writeBack(
      row.id,
      { externalOrderId: ref.externalOrderId, externalShipmentId: ref.externalShipmentId },
      'the courier ids'
    )
    row = { ...row, externalOrderId: ref.externalOrderId, externalShipmentId: ref.externalShipmentId }
  }

  // The waybill. Store what came back, never what was asked for.
  if (row.awbNumber === null) {
    const assigned = await assignAwb({
      shipmentId: ref.externalShipmentId,
      ...(courierCompanyId !== null ? { courierCompanyId } : {}),
    })
    await writeBack(
      row.id,
      {
        awbNumber: assigned.awbNumber,
        trackingNumber: assigned.awbNumber,
        courierName: assigned.courierName,
        costPaise,
      },
      'the waybill'
    )
    courierCompanyId = assigned.courierCompanyId
    row = { ...row, awbNumber: assigned.awbNumber, courierName: assigned.courierName, costPaise }
  }

  // The label. HELD when the object is already in storage — the client then
  // sends nothing — and fetched otherwise. Never a URL: bytes, to our key.
  const key = labelObjectKey(token)
  const held = await fileExists(key)
  const label = await generateLabel({
    shipmentId: ref.externalShipmentId,
    heldLabelObjectToken: held ? token : null,
  })
  if (label.generated) {
    await uploadFile(Buffer.from(label.pdf), key, {
      contentType: 'application/pdf',
      // A customer's address. Not for a CDN to keep for a year.
      cacheControl: 'private, no-store',
    })
  }

  // Finished: the row says so and the audit row says why, in one transaction.
  await db.transaction(async (tx) => {
    const finished = await tx
      .update(orderShipments)
      .set({ status: 'label_created', updatedAt: new Date() })
      .where(and(eq(orderShipments.id, row.id), eq(orderShipments.status, 'pending')))
      .returning({ id: orderShipments.id })

    // Zero rows: a concurrent resume finished it first, and recorded it. The
    // audit row is owed once.
    if (finished.length !== 1) return

    await recordAudit(
      actor,
      {
        action: 'shipment.label_issued',
        entityType: 'order_shipment',
        entityId: row.id,
        summary:
          `Label issued for order ${order.orderNumber} via ${row.courierName}` +
          (costPaise !== null ? ` at ₹${toRupees(costPaise).toFixed(2)}` : ''),
        after: {
          status: 'label_created',
          awbNumber: row.awbNumber,
          courierName: row.courierName,
          costPaise,
          externalShipmentId: ref.externalShipmentId,
          resumed: claim.resumed,
        },
        metadata: {
          orderId: order.orderId,
          pickupVendorId: vendor.id,
          externalOrderId: ref.externalOrderId,
        },
      },
      tx
    )
  })

  // The pickup, last, and never fatal: the label is bought and recorded.
  const pickup = await requestPickup(ref.externalShipmentId, row.id)

  return {
    shipmentId: row.id,
    orderId: order.orderId,
    labelObjectToken: token,
    awbNumber: row.awbNumber!,
    courierName: row.courierName!,
    courierCompanyId,
    costPaise,
    externalOrderId: ref.externalOrderId,
    externalShipmentId: ref.externalShipmentId,
    pickupVendorId: vendor.id,
    resumed: claim.resumed,
    pickup,
  }
}

async function requestPickup(externalShipmentId: string, shipmentId: string): Promise<PickupOutcome> {
  let schedule: PickupSchedule
  try {
    schedule = await schedulePickup({ shipmentId: externalShipmentId })
  } catch (error) {
    const retryable = error instanceof ShiprocketPickupNotScheduledError
    logger.error(
      {
        shipmentId,
        retryable,
        errorName: error instanceof Error ? error.name : typeof error,
      },
      'shipment dispatch: label bought, pickup not scheduled'
    )
    return {
      scheduled: false,
      retryable,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  return {
    scheduled: true,
    scheduledFor: schedule.scheduledFor,
    tokenNumber: schedule.tokenNumber,
    alreadyScheduled: schedule.alreadyScheduled,
  }
}

// ============================================================================
// Entry points
// ============================================================================

/**
 * Overlap only, per order: two admins pressing Ship in one process share one
 * purchase and get one answer. Released in a `finally`, because a key left
 * behind would answer the next dispatch from a settled promise — a cache of a
 * courier purchase. Cross-process overlap is the claim's job, not this map's.
 */
const purchasesInFlight = new Map<string, Promise<LabelPurchase>>()

/**
 * Buy the label for an order, or resume buying it.
 *
 * Refuses with `ShipmentDispatchError` before anything is sent; passes the
 * courier client's own refusals up unchanged once the claim is committed —
 * the claim stays, and that row is what the next call resumes.
 */
export async function buyLabelForOrder(
  orderId: string,
  input: BuyLabelInput,
  actor: DispatchActor
): Promise<LabelPurchase> {
  const joined = purchasesInFlight.get(orderId)
  if (joined) return joined

  const run = (async () => {
    const claim = await claimLabel(orderId, input, Date.now())
    return purchase(claim, actor)
  })()
  purchasesInFlight.set(orderId, run)

  try {
    return await run
  } finally {
    purchasesInFlight.delete(orderId)
  }
}

const reconcilesInFlight = new Map<string, Promise<LabelPurchase>>()

/**
 * Resume one unfinished purchase by shipment id, whatever its age.
 *
 * Readiness is NOT re-asked. The claim was taken under it, and the
 * consolidator's own jobs may since have gone `dispatched` — which flips the
 * predicate false for exactly the order that is being shipped.
 */
export async function reconcileLabelPurchase(
  shipmentId: string,
  actor: DispatchActor
): Promise<LabelPurchase> {
  const joined = reconcilesInFlight.get(shipmentId)
  if (joined) return joined

  const run = (async () => {
    const [row] = (await db
      .select(SHIPMENT_COLUMNS)
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId))
      .limit(1)) as ShipmentRow[]

    if (!row || !isUnfinishedClaim(row)) {
      throw new ShipmentDispatchError(
        `Shipment ${shipmentId} is not an unfinished label purchase` +
          (row ? ` (status '${row.status}', ${row.labelObjectToken ? 'claimed' : 'unclaimed'})` : '') +
          '. Only a claimed row that never reached label_created can be reconciled.',
        'NOTHING_TO_RECONCILE',
        { shipmentId }
      )
    }

    const order = await readOrderFacts(db, row.orderId)
    if (!order) {
      throw new ShipmentDispatchError(`Order ${row.orderId} does not exist.`, 'ORDER_NOT_FOUND')
    }
    const vendorId = row.pickupVendorId
    if (!vendorId) {
      throw new ShipmentDispatchError(
        `Shipment ${shipmentId} records no pickup vendor, so there is nowhere to collect from.`,
        'NOTHING_TO_RECONCILE',
        { shipmentId }
      )
    }
    const vendor = assertVendorQuotable(await readVendorFacts(db, vendorId), vendorId)

    return purchase(
      {
        row,
        token: row.labelObjectToken!,
        order,
        vendor,
        // The parcel was recorded at claim time and is only needed for a
        // fresh quote, which a resume with a waybill never makes.
        parcel: await recordedParcel(shipmentId),
        courierCompanyId: undefined,
        resumed: true,
      },
      actor
    )
  })()
  reconcilesInFlight.set(shipmentId, run)

  try {
    return await run
  } finally {
    reconcilesInFlight.delete(shipmentId)
  }
}

async function recordedParcel(shipmentId: string): Promise<DispatchParcel> {
  const [row] = await db
    .select({
      weightGrams: orderShipments.shippedWeightGrams,
      lengthCm: orderShipments.lengthCm,
      widthCm: orderShipments.widthCm,
      heightCm: orderShipments.heightCm,
    })
    .from(orderShipments)
    .where(eq(orderShipments.id, shipmentId))
    .limit(1)
  return {
    weightGrams: row?.weightGrams ?? 0,
    lengthCm: row?.lengthCm ?? 0,
    widthCm: row?.widthCm ?? 0,
    heightCm: row?.heightCm ?? 0,
  }
}

/**
 * Every claimed row that never finished, oldest first.
 *
 * The screen for a stuck order. A row here is a purchase that may have spent
 * money — the courier order, the waybill, the label — and has nothing saying
 * it is done; `reconcileLabelPurchase` is the remedy.
 */
export async function findUnfinishedLabelPurchases(): Promise<UnfinishedLabelPurchase[]> {
  const rows = await db
    .select({
      shipmentId: orderShipments.id,
      orderId: orderShipments.orderId,
      claimedAt: orderShipments.updatedAt,
      awbNumber: orderShipments.awbNumber,
    })
    .from(orderShipments)
    .where(
      and(
        isNotNull(orderShipments.labelObjectToken),
        isNull(orderShipments.voidedAt),
        eq(orderShipments.status, 'pending')
      )
    )
    .orderBy(asc(orderShipments.updatedAt))

  return rows.map((row) => ({
    shipmentId: row.shipmentId,
    orderId: row.orderId,
    claimedAt: row.claimedAt,
    awbNumber: row.awbNumber,
  }))
}
