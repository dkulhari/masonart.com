/**
 * `buyLabelForOrder` (#728): lock, claim, commit, buy, reconcile.
 *
 * The decision this file guards was made on the ticket: the transaction is
 * SPLIT. A courier call inside an open transaction holds `FOR UPDATE` on the
 * order's job rows for as long as Shiprocket takes to answer, so the shape is
 * lock → mark intent → commit → call → reconcile, never one long transaction
 * wrapped around the network.
 *
 * ## What a mock can and cannot prove here
 *
 * The recorder cannot serialise anything, so the lock is proved the only way a
 * mock can (`tests/helpers/query-recorder.ts` on `for`): the job rows are read
 * inside the claim transaction, readiness is asked THROUGH that transaction's
 * handle, and the claim write repeats its predicate. What the recorder CAN
 * prove, and what nothing else can, is ORDER: that the claim is committed
 * before the first courier call, that each courier answer is written before
 * the next courier question is asked, and that the file is stored before the
 * row says it is. The property two real transactions have to demonstrate —
 * exactly one label from two simultaneous callers — is
 * `tests/database/shipment-dispatch-concurrency.test.ts`.
 *
 * @see packages/api/src/lib/shipment-dispatch.ts
 * @see plan/tracker-data/tickets/ticket-0728-dispatch-library-buylabelforor.yaml
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const recorder = await vi.hoisted(async () =>
  (await import('../helpers/query-recorder')).createQueryRecorder()
)

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}))

const readiness = vi.hoisted(() => ({
  getOrderLabelReadiness: vi.fn(),
  isOrderReadyToLabel: vi.fn(),
}))

const courier = vi.hoisted(() => ({
  selectCourierFor: vi.fn(),
  createCourierOrder: vi.fn(),
  assignAwb: vi.fn(),
  generateLabel: vi.fn(),
  schedulePickup: vi.fn(),
}))

const storage = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  fileExists: vi.fn(),
}))

const audit = vi.hoisted(() => ({
  recordAudit: vi.fn(),
}))

vi.mock('../../src/database', () => ({ db: recorder.db }))
vi.mock('../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}))
vi.mock('../../src/lib/production-readiness', async (importActual) => {
  const actual = await importActual<typeof import('../../src/lib/production-readiness')>()
  return { ...actual, ...readiness }
})
vi.mock('../../src/services/shiprocket', async (importActual) => {
  const actual = await importActual<typeof import('../../src/services/shiprocket')>()
  return { ...actual, ...courier }
})
vi.mock('../../src/lib/storage', () => storage)
vi.mock('../../src/lib/audit', () => audit)

import { orders } from '../../src/database/schema/orders'
import { productionJobs } from '../../src/database/schema/production-jobs'
import { orderShipments } from '../../src/database/schema/shipping'
import {
  ShiprocketPickupNotScheduledError,
  type CreateCourierOrderInput,
  type CourierOrderLookup,
} from '../../src/services/shiprocket'
import {
  buyLabelForOrder,
  reconcileLabelPurchase,
  findUnfinishedLabelPurchases,
  labelObjectKey,
  DISPATCH_REFUSAL_STATUS,
  STALE_LABEL_CLAIM_MS,
  ShipmentDispatchError,
  type BuyLabelInput,
} from '../../src/lib/shipment-dispatch'

// ============================================================================
// Fixtures
// ============================================================================

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const ORDER_NUMBER = 'CA-2026-000412'
const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const VENDOR_ID = 'c0ffee00-0000-4000-8000-000000000002'
const JOB_ID = 'd00d0000-0000-4000-8000-000000000003'
const CLAIMED_TOKEN = 'held-token-7f0c2a6e1d3b4c5a9e8f2b1a0c9d8e7f'

const SR_ORDER_ID = '812345678'
const SR_SHIPMENT_ID = '912345678'
const AWB = '141123221084922'
const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n')

const PARCEL = { weightGrams: 850, lengthCm: 40, widthCm: 30, heightCm: 6 }

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    status: 'processing',
    orderType: 'regular',
    createdAt: new Date('2026-08-31T09:15:00.000Z'),
    shippingAddress: {
      fullName: 'Ananya Iyer',
      phone: '9820011223',
      addressLine1: '12 Turner Road',
      addressLine2: 'Bandra West',
      landmark: 'Opposite the bakery',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      countryCode: 'IN',
    },
    paymentDetails: { provider: 'razorpay', method: 'upi' },
    paymentStatus: 'paid',
    subtotal: '3897.00',
    discount: '300.00',
    shippingCost: '49.00',
    tax: '0.00',
    total: '3646.00',
    giftCardAmount: '0.00',
    email: 'ananya@example.test',
    guestEmail: null,
    ...over,
  }
}

const ITEM_ROWS = [
  {
    id: 'item-1',
    snapshot: { title: 'A2 Poster - Kerala Backwaters', sku: 'PST-A2-KER' },
    quantity: 2,
    unitPrice: '1499.00',
  },
  {
    id: 'item-2',
    snapshot: { title: 'Oak Frame A2', sku: 'FRM-A2-OAK' },
    quantity: 1,
    unitPrice: '899.00',
  },
]

/**
 * The vendor, in the library's own projection. The recorder hands fixture
 * rows back as they were queued, so a row is shaped as the read that asks for
 * it, not as the table.
 */
function vendorRow(over: Record<string, unknown> = {}) {
  return {
    id: VENDOR_ID,
    pickupLocation: 'warehouse',
    pickupPincode: '400072',
    ...over,
  }
}

/** An open, unlabelled shipment row, as `POST /orders/:orderId/ship` leaves one. */
function openRow(over: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    status: 'pending',
    labelObjectToken: null,
    voidedAt: null,
    awbNumber: null,
    courierName: null,
    externalOrderId: null,
    externalShipmentId: null,
    costPaise: null,
    pickupVendorId: null,
    updatedAt: new Date(),
    ...over,
  }
}

/** A row a crashed purchase left behind: claimed, ids and waybill written, never finished. */
function crashedRow(over: Record<string, unknown> = {}) {
  return openRow({
    labelObjectToken: CLAIMED_TOKEN,
    externalOrderId: SR_ORDER_ID,
    externalShipmentId: SR_SHIPMENT_ID,
    awbNumber: AWB,
    courierName: 'Delhivery Surface',
    costPaise: 15315,
    pickupVendorId: VENDOR_ID,
    updatedAt: new Date(Date.now() - STALE_LABEL_CLAIM_MS - 60_000),
    ...over,
  })
}

const actor = () => ({
  get: (key: string) =>
    key === 'user' ? { id: 'admin-1', email: 'ops@example.test', role: 'admin' } : undefined,
  set: vi.fn(),
  req: { method: 'POST', path: '/api/admin/orders/x/ship', header: () => undefined },
})

const input = (over: Partial<BuyLabelInput> = {}): BuyLabelInput => ({ parcel: PARCEL, ...over })

/**
 * The happy path's rows, queued in the order the library reads them.
 *
 * `select:order_shipments` answers TWICE: the locked read of the order's open
 * rows inside the claim, then the idempotency lookup the courier client is
 * handed. `update:order_shipments` answers once per step that writes the row
 * back — the claim, the ids, the waybill, the finish.
 */
function queueHappyPath({
  shipments = [openRow()],
  lookup = [openRow({ labelObjectToken: CLAIMED_TOKEN })],
  order = orderRow(),
  items = ITEM_ROWS,
  vendor = vendorRow(),
  claimReturns = [{ id: SHIPMENT_ROW_ID }],
}: {
  shipments?: unknown[]
  lookup?: unknown[]
  order?: unknown
  items?: unknown[]
  vendor?: unknown
  claimReturns?: unknown[]
} = {}) {
  recorder.queueRows({
    'select:production_jobs': [[{ id: JOB_ID }]],
    'select:order_shipments': [shipments, lookup],
    'select:orders': [[order]],
    'select:order_items': [items],
    'select:vendors': [[vendor]],
    'insert:order_shipments': [[{ id: SHIPMENT_ROW_ID }]],
    'update:order_shipments': [
      claimReturns,
      [{ id: SHIPMENT_ROW_ID }],
      [{ id: SHIPMENT_ROW_ID }],
      [{ id: SHIPMENT_ROW_ID }],
    ],
  })
}

function ready(consolidatorVendorId: string | null = VENDOR_ID) {
  readiness.getOrderLabelReadiness.mockResolvedValue({
    ready: true,
    consolidatorVendorId,
    blockers: [],
  })
}

/** What each courier mock saw when it was called, for ordering assertions. */
const seen = {
  commitsAtCreate: -1,
  lastUpdateAtAssign: null as Record<string, unknown> | null,
  lastUpdateAtLabel: null as Record<string, unknown> | null,
  uploadsAtFinish: -1,
}

const lastShipmentUpdate = () =>
  (recorder.updates(orderShipments).at(-1)?.values ?? null) as Record<string, unknown> | null

function stubCourierHappyPath() {
  courier.selectCourierFor.mockResolvedValue({
    courierCompanyId: 51,
    courierName: 'Delhivery Surface',
    ratePaise: 15315,
    etd: 'Sep 05, 2026',
    supportsCod: true,
    blocked: false,
  })
  courier.createCourierOrder.mockImplementation(
    async (cin: CreateCourierOrderInput, lookup: CourierOrderLookup) => {
      seen.commitsAtCreate = recorder.tx.commits
      const existing = await lookup(cin.shipmentRowId)
      if (existing?.externalOrderId && existing.externalShipmentId) {
        return {
          externalOrderId: existing.externalOrderId,
          externalShipmentId: existing.externalShipmentId,
          created: false,
        }
      }
      return { externalOrderId: SR_ORDER_ID, externalShipmentId: SR_SHIPMENT_ID, created: true }
    }
  )
  courier.assignAwb.mockImplementation(async () => {
    seen.lastUpdateAtAssign = lastShipmentUpdate()
    return {
      awbNumber: AWB,
      courierName: 'Delhivery Surface',
      courierCompanyId: 51,
      requestedCourierCompanyId: 51,
    }
  })
  courier.generateLabel.mockImplementation(
    async ({ heldLabelObjectToken }: { heldLabelObjectToken: string | null }) => {
      seen.lastUpdateAtLabel = lastShipmentUpdate()
      return heldLabelObjectToken
        ? { generated: false, labelObjectToken: heldLabelObjectToken }
        : { generated: true, pdf: PDF }
    }
  )
  courier.schedulePickup.mockResolvedValue({
    scheduledFor: '2026-09-04 14:00:00',
    tokenNumber: 'PKP-20260904-0042',
    alreadyScheduled: false,
  })
  storage.fileExists.mockResolvedValue(false)
  storage.uploadFile.mockResolvedValue({ url: 'unused', key: 'unused', bucket: 'unused' })
  audit.recordAudit.mockImplementation(async () => {
    seen.uploadsAtFinish = storage.uploadFile.mock.calls.length
  })
}

async function failureOf(run: () => Promise<unknown>): Promise<ShipmentDispatchError> {
  const error = await run()
    .then(() => null)
    .catch((e: Error) => e)
  expect(error, 'the call did not fail').toBeInstanceOf(ShipmentDispatchError)
  return error as ShipmentDispatchError
}

beforeEach(() => {
  recorder.reset()
  vi.clearAllMocks()
  seen.commitsAtCreate = -1
  seen.lastUpdateAtAssign = null
  seen.lastUpdateAtLabel = null
  seen.uploadsAtFinish = -1
  stubCourierHappyPath()
  ready()
})

// ============================================================================
// The claim — lock, readiness, intent, commit
// ============================================================================

describe('the claim', () => {
  it('locks the order’s job rows inside the claim transaction, before readiness is asked', async () => {
    queueHappyPath()
    // The readiness mock below reads `orders` through the handle it is given,
    // and the recorder answers reads in queue order — so its read is queued
    // ahead of the library's own.
    recorder.queueRows({ 'select:orders': [[{ id: ORDER_ID }], [orderRow()]] })
    // The readiness mock reads through the handle it is given, so the recorder
    // can say WHICH transaction that handle belongs to.
    readiness.getOrderLabelReadiness.mockImplementation(
      async (_orderId: string, reader?: { select: (f?: unknown) => unknown }) => {
        expect(reader, 'readiness was asked without a transaction handle').toBeDefined()
        await (reader!.select({ id: orders.id }) as { from: (t: unknown) => Promise<unknown> }).from(
          orders
        )
        return { ready: true, consolidatorVendorId: VENDOR_ID, blockers: [] }
      }
    )

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const [lock] = recorder.selects(productionJobs)
    expect(lock, 'the job rows were never read').toBeDefined()
    expect(lock!.inTx).toBe(true)
    expect(lock!.txId).toBe(1)
    expect(recorder.render(lock!.where).sql).toContain('"order_id" = $1')

    const readinessRead = recorder.selects(orders).find((q) => q.fields?.length === 1)
    expect(readinessRead, 'readiness did not read through the transaction').toBeDefined()
    expect(readinessRead!.txId).toBe(1)
    expect(recorder.queries.indexOf(lock!)).toBeLessThan(recorder.queries.indexOf(readinessRead!))
    expect(readiness.getOrderLabelReadiness).toHaveBeenCalledWith(ORDER_ID, expect.anything())
  })

  it('reads the order’s live rows newest first — the order the ready queue reports them in', async () => {
    // The queue (`routes/admin/shipments.ts`, `NEWEST_OPEN_SHIPMENT_FIRST`)
    // reports the newest open row; this claim picks the newest open unlabelled
    // row and refuses on the newest labelled one. Both read `created_at desc,
    // id desc`, so the row the queue shows is the row the write acts on — and
    // a same-tick tie does not fall back to the planner.
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const liveRead = recorder.selects(orderShipments)[0]!
    expect(liveRead.txId).toBe(1)
    const ordering = (liveRead.orderByTerms ?? []).map((term) => recorder.render(term).sql.toLowerCase())
    expect(ordering).toEqual(['"order_shipments"."created_at" desc', '"order_shipments"."id" desc'])
    const { sql } = recorder.render(liveRead.where)
    expect(sql).toContain('"order_id" = $')
    expect(sql).toContain('"voided_at" is null')
  })

  it('refuses with the blockers when the order is not ready, and writes nothing', async () => {
    queueHappyPath()
    readiness.getOrderLabelReadiness.mockResolvedValue({
      ready: false,
      consolidatorVendorId: VENDOR_ID,
      blockers: [{ code: 'job_not_qc_passed', message: 'Job x has not passed QC.', jobId: JOB_ID }],
    })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('ORDER_NOT_READY')
    expect(DISPATCH_REFUSAL_STATUS.ORDER_NOT_READY).toBe(409)
    expect(error.blockers?.map((b) => b.code)).toEqual(['job_not_qc_passed'])
    expect(recorder.survivors('update', orderShipments)).toEqual([])
    expect(recorder.survivors('insert', orderShipments)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)
    expect(courier.selectCourierFor).not.toHaveBeenCalled()
    expect(courier.createCourierOrder).not.toHaveBeenCalled()
  })

  it('claims the label — token written and COMMITTED — before the first courier call', async () => {
    queueHappyPath()

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    // The commit happened before createCourierOrder was entered.
    expect(seen.commitsAtCreate).toBe(1)
    const claim = recorder.survivors('update', orderShipments)[0]
    expect(claim, 'no claim was written').toBeDefined()
    expect(claim!.txId).toBe(1)
    const values = claim!.values as Record<string, unknown>
    expect(typeof values.labelObjectToken).toBe('string')
    expect(values.labelObjectToken).toBe(result.labelObjectToken)
    expect(values.pickupVendorId).toBe(VENDOR_ID)
    expect(values.carrier).toBe('Shiprocket')
    expect(values.shippedWeightGrams).toBe(PARCEL.weightGrams)
  })

  it('the token is random and identity-free: never the order id, never the order number', async () => {
    queueHappyPath()

    const first = await buyLabelForOrder(ORDER_ID, input(), actor())
    recorder.reset()
    queueHappyPath()
    const second = await buyLabelForOrder(ORDER_ID, input(), actor())

    for (const token of [first.labelObjectToken, second.labelObjectToken]) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(token).not.toContain(ORDER_ID)
      expect(token).not.toContain(ORDER_NUMBER)
      expect(token.length).toBeGreaterThanOrEqual(32)
    }
    expect(first.labelObjectToken).not.toBe(second.labelObjectToken)
  })

  it('the claim repeats its predicate: only a live, unlabelled row can be claimed', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const claim = recorder.survivors('update', orderShipments)[0]!
    const { sql, params } = recorder.render(claim.where)
    expect(sql).toContain('"id" = $')
    expect(sql).toContain('"label_object_token" is null')
    expect(sql).toContain('"voided_at" is null')
    expect(params).toContain(SHIPMENT_ROW_ID)
  })

  it('refuses when another claim landed first — the guarded update matched nothing', async () => {
    queueHappyPath({ claimReturns: [] })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('LABEL_PURCHASE_IN_PROGRESS')
    expect(DISPATCH_REFUSAL_STATUS.LABEL_PURCHASE_IN_PROGRESS).toBe(409)
    expect(recorder.tx.rollbacks).toBe(1)
    expect(courier.createCourierOrder).not.toHaveBeenCalled()
  })

  it('refuses when the order already has a live label', async () => {
    queueHappyPath({
      shipments: [openRow({ labelObjectToken: CLAIMED_TOKEN, status: 'label_created' })],
    })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('ORDER_HAS_LIVE_LABEL')
    expect(DISPATCH_REFUSAL_STATUS.ORDER_HAS_LIVE_LABEL).toBe(409)
    expect(error.shipmentId).toBe(SHIPMENT_ROW_ID)
    expect(courier.createCourierOrder).not.toHaveBeenCalled()
  })

  it('a claim another process took moments ago is in progress, not a re-buy', async () => {
    queueHappyPath({ shipments: [crashedRow({ updatedAt: new Date() })] })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('LABEL_PURCHASE_IN_PROGRESS')
    expect(error.shipmentId).toBe(SHIPMENT_ROW_ID)
    expect(courier.createCourierOrder).not.toHaveBeenCalled()
  })

  it('opens a shipment row when the order has none, and claims that one', async () => {
    queueHappyPath({ shipments: [] })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const opened = recorder.survivors('insert', orderShipments)[0]
    expect(opened, 'no row was opened').toBeDefined()
    expect(opened!.txId).toBe(1)
    const values = opened!.values as Record<string, unknown>
    expect(values.orderId).toBe(ORDER_ID)
    expect(values.carrier).toBe('Shiprocket')
    expect(values.status).toBe('pending')
    // The claim is a separate, guarded write on the row just opened — the same
    // path whether the row was found or made.
    const claim = recorder.survivors('update', orderShipments)[0]!
    expect(recorder.params(claim.where)).toContain(SHIPMENT_ROW_ID)

    // ...and the opening is audited, in the claim transaction, the way an
    // admin opening one by hand always was.
    const opened_audit = audit.recordAudit.mock.calls.find(
      (call) => (call[1] as { action: string }).action === 'shipment.created'
    )
    expect(opened_audit, 'the opened row was not audited').toBeDefined()
    expect((opened_audit![1] as { entityId: string }).entityId).toBe(SHIPMENT_ROW_ID)
    expect(opened_audit![2]).toBeDefined()
    expect(opened_audit![2]).not.toBe(recorder.db)
  })

  it('refuses before the network when the consolidator has no pickup postcode to quote from', async () => {
    queueHappyPath({ vendor: vendorRow({ pickupPincode: null }) })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('PICKUP_VENDOR_UNQUOTABLE')
    expect(DISPATCH_REFUSAL_STATUS.PICKUP_VENDOR_UNQUOTABLE).toBe(422)
    expect(error.message).toContain(VENDOR_ID)
    expect(courier.selectCourierFor).not.toHaveBeenCalled()
    // Nothing was claimed: the refusal is decided inside the transaction, so
    // a vendor an admin fixes in a minute does not leave a claim behind.
    expect(recorder.survivors('update', orderShipments)).toEqual([])
  })
})

// ============================================================================
// The purchase — quote, create, assign, label, store, finish
// ============================================================================

describe('the purchase', () => {
  it('quotes the courier with the order’s REAL cod status, and tells the create the same', async () => {
    queueHappyPath({ order: orderRow({ paymentDetails: { provider: 'razorpay', method: 'cod' } }) })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(courier.selectCourierFor).toHaveBeenCalledWith({
      pickupPincode: '400072',
      deliveryPincode: '400050',
      weightKg: 0.85,
      cod: true,
    })
    expect((courier.createCourierOrder.mock.calls[0]![0] as CreateCourierOrderInput).cod).toBe(true)
  })

  it('the control: a prepaid order is quoted prepaid', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(courier.selectCourierFor.mock.calls[0]![0]).toMatchObject({ cod: false })
    expect((courier.createCourierOrder.mock.calls[0]![0] as CreateCourierOrderInput).cod).toBe(false)
  })

  it('hands the client the consignee, the lines and every money term from the order, in paise', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const cin = courier.createCourierOrder.mock.calls[0]![0] as CreateCourierOrderInput
    expect(cin.shipmentRowId).toBe(SHIPMENT_ROW_ID)
    expect(cin.orderNumber).toBe(ORDER_NUMBER)
    expect(cin.orderDate).toEqual(new Date('2026-08-31T09:15:00.000Z'))
    expect(cin.pickupLocation).toBe('warehouse')
    expect(cin.consignee).toEqual({
      name: 'Ananya Iyer',
      addressLine1: '12 Turner Road',
      addressLine2: 'Bandra West, Opposite the bakery',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      country: 'India',
      phone: '9820011223',
      email: 'ananya@example.test',
    })
    expect(cin.items).toEqual([
      { name: 'A2 Poster - Kerala Backwaters', sku: 'PST-A2-KER', units: 2, sellingPricePaise: 149900 },
      { name: 'Oak Frame A2', sku: 'FRM-A2-OAK', units: 1, sellingPricePaise: 89900 },
    ])
    expect(cin.parcel).toEqual(PARCEL)
    expect(cin.charges).toEqual({
      shippingPaise: 4900,
      discountPaise: 30000,
      taxPaise: 0,
      transactionPaise: 0,
      giftwrapPaise: 0,
      amountDuePaise: 364600,
    })
  })

  it('folds gift-card tender into the courier’s discount, so a COD collectible is what is still owed', async () => {
    // `orders.gift_card_amount` is tender, not a discount, and the schema says
    // so. The COURIER has one field for "everything that reduces what is
    // collected at the door", and tender belongs in it there: quoting the full
    // total on a COD parcel part-paid by gift card has a courier collect money
    // the customer has already paid.
    queueHappyPath({ order: orderRow({ giftCardAmount: '500.00' }) })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const cin = courier.createCourierOrder.mock.calls[0]![0] as CreateCourierOrderInput
    expect(cin.charges.discountPaise).toBe(30000 + 50000)
    expect(cin.charges.amountDuePaise).toBe(364600 - 50000)
  })

  it('a guest order’s consignee email is the guest email', async () => {
    queueHappyPath({ order: orderRow({ email: null, guestEmail: 'guest@example.test' }) })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const cin = courier.createCourierOrder.mock.calls[0]![0] as CreateCourierOrderInput
    expect(cin.consignee.email).toBe('guest@example.test')
  })

  it('never hands the courier the label token, the vendor id or our cost', async () => {
    queueHappyPath()

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    const sent = JSON.stringify(courier.createCourierOrder.mock.calls[0]![0])
    expect(sent).not.toContain(result.labelObjectToken)
    expect(sent).not.toContain(VENDOR_ID)
    expect(sent).not.toContain('costPaise')
  })

  it('writes the courier ids before asking for a waybill, and the waybill before asking for the label', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(seen.lastUpdateAtAssign).toMatchObject({
      externalOrderId: SR_ORDER_ID,
      externalShipmentId: SR_SHIPMENT_ID,
    })
    expect(seen.lastUpdateAtLabel).toMatchObject({
      awbNumber: AWB,
      trackingNumber: AWB,
      courierName: 'Delhivery Surface',
      costPaise: 15315,
    })
    // The waybill is asked for against Shiprocket's shipment id, with the
    // courier the quote chose.
    expect(courier.assignAwb).toHaveBeenCalledWith({
      shipmentId: SR_SHIPMENT_ID,
      courierCompanyId: 51,
    })
    // And the id writes are OUTSIDE the claim transaction: it has committed.
    for (const update of recorder.survivors('update', orderShipments).slice(1, 3)) {
      expect(update.txId).toBe(0)
    }
  })

  it('the idempotency lookup reads the row’s ids fresh, by the row id the courier was given', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const lookupRead = recorder.selects(orderShipments)[1]
    expect(lookupRead, 'the lookup never read the row').toBeDefined()
    expect(lookupRead!.fields).toEqual(
      expect.arrayContaining(['externalOrderId', 'externalShipmentId'])
    )
    expect(recorder.params(lookupRead!.where)).toContain(SHIPMENT_ROW_ID)
  })

  it('stores the PDF under fulfilment/labels/<token>.pdf with nothing person-linked in the key or metadata', async () => {
    queueHappyPath()

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(courier.generateLabel).toHaveBeenCalledWith({
      shipmentId: SR_SHIPMENT_ID,
      heldLabelObjectToken: null,
    })
    expect(storage.uploadFile).toHaveBeenCalledTimes(1)
    const [buffer, key, options] = storage.uploadFile.mock.calls[0] as [
      Buffer,
      string,
      { contentType: string; cacheControl?: string; metadata?: Record<string, string> },
    ]
    expect(key).toBe(labelObjectKey(result.labelObjectToken))
    expect(key).toBe(`fulfilment/labels/${result.labelObjectToken}.pdf`)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.equals(Buffer.from(PDF))).toBe(true)
    expect(options.contentType).toBe('application/pdf')
    // A label is a customer's address; the CDN must not keep it for a year.
    expect(options.cacheControl).toMatch(/private|no-store/)
    const described = JSON.stringify([key, options])
    expect(described).not.toContain(ORDER_ID)
    expect(described).not.toContain(ORDER_NUMBER)
    expect(described).not.toContain('Ananya')
  })

  it('finishes the row and audits shipment.label_issued in ONE transaction, after the file is stored', async () => {
    queueHappyPath()

    await buyLabelForOrder(ORDER_ID, input(), actor())

    const finish = recorder.survivors('update', orderShipments).at(-1)!
    expect(finish.values).toMatchObject({ status: 'label_created' })
    expect(finish.inTx).toBe(true)
    expect(finish.txId).toBe(2)
    const { sql } = recorder.render(finish.where)
    expect(sql).toContain('"status" = $')
    expect(recorder.params(finish.where)).toEqual(expect.arrayContaining([SHIPMENT_ROW_ID, 'pending']))

    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
    const [, entry, tx] = audit.recordAudit.mock.calls[0] as [unknown, Record<string, unknown>, unknown]
    expect(entry.action).toBe('shipment.label_issued')
    expect(entry.entityType).toBe('order_shipment')
    expect(entry.entityId).toBe(SHIPMENT_ROW_ID)
    expect(entry.after).toMatchObject({ awbNumber: AWB, courierName: 'Delhivery Surface', costPaise: 15315 })
    expect(entry.metadata).toMatchObject({ orderId: ORDER_ID, pickupVendorId: VENDOR_ID })
    // Shares the finishing transaction: a handle, not the root db.
    expect(tx).toBeDefined()
    expect(tx).not.toBe(recorder.db)
    // ...and the upload had already happened when the audit row was written.
    expect(seen.uploadsAtFinish).toBe(1)
  })

  it('the audit row carries no label token and no customer', async () => {
    queueHappyPath()

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    const written = JSON.stringify(audit.recordAudit.mock.calls[0]![1])
    expect(written).not.toContain(result.labelObjectToken)
    expect(written).not.toContain('Ananya')
    expect(written).not.toContain('400050')
  })

  it('returns what the route needs, and nothing the customer is', async () => {
    queueHappyPath()

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(result).toMatchObject({
      shipmentId: SHIPMENT_ROW_ID,
      orderId: ORDER_ID,
      awbNumber: AWB,
      courierName: 'Delhivery Surface',
      courierCompanyId: 51,
      costPaise: 15315,
      externalOrderId: SR_ORDER_ID,
      externalShipmentId: SR_SHIPMENT_ID,
      pickupVendorId: VENDOR_ID,
      resumed: false,
      pickup: {
        scheduled: true,
        scheduledFor: '2026-09-04 14:00:00',
        tokenNumber: 'PKP-20260904-0042',
        alreadyScheduled: false,
      },
    })
    expect(JSON.stringify(result)).not.toContain('Ananya')
    expect(JSON.stringify(result)).not.toContain('400050')
  })

  it('a courier refusal after the claim leaves the claim in place for a resume, and passes the refusal up', async () => {
    queueHappyPath()
    courier.assignAwb.mockRejectedValue(new Error('SHIPROCKET says no'))

    await expect(buyLabelForOrder(ORDER_ID, input(), actor())).rejects.toThrow('SHIPROCKET says no')

    // The claim survived: it was committed before the call, and nothing
    // un-claims on the way out. That row is what `findUnfinishedLabelPurchases`
    // and a later `buyLabelForOrder` recognise.
    expect(recorder.survivors('update', orderShipments)[0]!.values).toMatchObject({
      labelObjectToken: expect.any(String),
    })
    expect(recorder.survivors('update', orderShipments).some((u) => 'voidedAt' in (u.values as object))).toBe(false)
    expect(audit.recordAudit).not.toHaveBeenCalled()
  })
})

// ============================================================================
// The pickup — a failure here keeps the label
// ============================================================================

describe('the pickup', () => {
  it('a pickup that cannot be scheduled leaves the label bought and reports a retryable pickup', async () => {
    queueHappyPath()
    courier.schedulePickup.mockRejectedValue(
      new ShiprocketPickupNotScheduledError('No pickup slots for shipment 912345678.')
    )

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(result.pickup).toEqual({
      scheduled: false,
      retryable: true,
      reason: 'No pickup slots for shipment 912345678.',
    })
    expect(result.awbNumber).toBe(AWB)
    const finish = recorder.survivors('update', orderShipments).at(-1)!
    expect(finish.values).toMatchObject({ status: 'label_created' })
    expect(recorder.survivors('update', orderShipments).some((u) => 'voidedAt' in (u.values as object))).toBe(false)
    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
  })

  it('a pickup already in the queue is a scheduled pickup', async () => {
    queueHappyPath()
    courier.schedulePickup.mockResolvedValue({
      scheduledFor: '2026-09-04 14:00:00',
      tokenNumber: null,
      alreadyScheduled: true,
    })

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(result.pickup).toMatchObject({ scheduled: true, alreadyScheduled: true })
  })

  it('an unexpected failure at the pickup is reported, not thrown, because the label is already bought', async () => {
    queueHappyPath()
    courier.schedulePickup.mockRejectedValue(new Error('ECONNRESET'))

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(result.pickup).toMatchObject({ scheduled: false, retryable: false })
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('the pickup is asked for AFTER the row says the label exists', async () => {
    queueHappyPath()
    let finishedWhenPickupAsked = false
    courier.schedulePickup.mockImplementation(async () => {
      finishedWhenPickupAsked = lastShipmentUpdate()?.status === 'label_created'
      return { scheduledFor: null, tokenNumber: null, alreadyScheduled: false }
    })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(finishedWhenPickupAsked).toBe(true)
  })
})

// ============================================================================
// Reconcile — the row a crash leaves behind
// ============================================================================

describe('resuming a purchase the process died in the middle of', () => {
  it('a stale claim is resumed, not refused, and nothing is bought twice', async () => {
    queueHappyPath({ shipments: [crashedRow()], lookup: [crashedRow()] })
    storage.fileExists.mockResolvedValue(true)

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(result.resumed).toBe(true)
    expect(result.labelObjectToken).toBe(CLAIMED_TOKEN)
    // No new claim: the only update is the finish.
    expect(recorder.survivors('update', orderShipments).map((u) => u.values)).toEqual([
      expect.objectContaining({ status: 'label_created' }),
    ])
    // The create was asked and answered from the record — the lookup found
    // both ids — so nothing was created.
    expect(courier.createCourierOrder).toHaveBeenCalledTimes(1)
    expect(courier.assignAwb).not.toHaveBeenCalled()
    // The file is there, so the label is HELD and nothing is sent for it.
    expect(storage.fileExists).toHaveBeenCalledWith(labelObjectKey(CLAIMED_TOKEN))
    expect(courier.generateLabel).toHaveBeenCalledWith({
      shipmentId: SR_SHIPMENT_ID,
      heldLabelObjectToken: CLAIMED_TOKEN,
    })
    expect(storage.uploadFile).not.toHaveBeenCalled()
    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
  })

  it('a stale claim whose file never landed fetches the label again — the one crash that can cost a second label', async () => {
    queueHappyPath({ shipments: [crashedRow()], lookup: [crashedRow()] })
    storage.fileExists.mockResolvedValue(false)

    const result = await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(courier.generateLabel).toHaveBeenCalledWith({
      shipmentId: SR_SHIPMENT_ID,
      heldLabelObjectToken: null,
    })
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      labelObjectKey(CLAIMED_TOKEN),
      expect.objectContaining({ contentType: 'application/pdf' })
    )
    expect(result.resumed).toBe(true)
  })

  it('a stale claim with no waybill yet asks for one, then the label', async () => {
    queueHappyPath({
      shipments: [crashedRow({ awbNumber: null, courierName: null, costPaise: null })],
      lookup: [crashedRow()],
    })

    await buyLabelForOrder(ORDER_ID, input(), actor())

    expect(courier.selectCourierFor).toHaveBeenCalledTimes(1)
    expect(courier.assignAwb).toHaveBeenCalledWith({ shipmentId: SR_SHIPMENT_ID, courierCompanyId: 51 })
    expect(courier.generateLabel).toHaveBeenCalledTimes(1)
  })

  it('a stale claim does not re-quote when the waybill is already recorded', async () => {
    queueHappyPath({ shipments: [crashedRow()], lookup: [crashedRow()] })
    storage.fileExists.mockResolvedValue(true)

    await buyLabelForOrder(ORDER_ID, input(), actor())

    // The rate was booked when the waybill was; a second quote is a second
    // price for a parcel that already has one.
    expect(courier.selectCourierFor).not.toHaveBeenCalled()
  })

  it('a stale claim whose row is already finished is a live label, refused', async () => {
    // Belt and braces: finished rows are label_created, and label_created
    // rows are refused before the age is even looked at.
    queueHappyPath({ shipments: [crashedRow({ status: 'label_created', updatedAt: new Date() })] })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))

    expect(error.code).toBe('ORDER_HAS_LIVE_LABEL')
  })

  it('reconcileLabelPurchase resumes by shipment id regardless of the claim’s age', async () => {
    recorder.queueRows({
      // The row by id, then the parcel it recorded, then the courier's lookup.
      'select:order_shipments': [[crashedRow({ updatedAt: new Date() })], [PARCEL], [crashedRow()]],
      'select:orders': [[orderRow()]],
      'select:order_items': [ITEM_ROWS],
      'select:vendors': [[vendorRow()]],
      'update:order_shipments': [[{ id: SHIPMENT_ROW_ID }]],
    })
    storage.fileExists.mockResolvedValue(true)

    const result = await reconcileLabelPurchase(SHIPMENT_ROW_ID, actor())

    expect(result.resumed).toBe(true)
    expect(result.shipmentId).toBe(SHIPMENT_ROW_ID)
    expect(courier.generateLabel).toHaveBeenCalledWith({
      shipmentId: SR_SHIPMENT_ID,
      heldLabelObjectToken: CLAIMED_TOKEN,
    })
    // Readiness is NOT re-asked on a reconcile: the claim was taken under it,
    // and the consolidator's jobs may since have gone `dispatched`, which
    // flips the predicate false for exactly the order that is being shipped.
    expect(readiness.getOrderLabelReadiness).not.toHaveBeenCalled()
  })

  it('reconcileLabelPurchase refuses a row that is not an unfinished claim', async () => {
    recorder.queueRows({ 'select:order_shipments': [[openRow()]] })

    const error = await failureOf(() => reconcileLabelPurchase(SHIPMENT_ROW_ID, actor()))

    expect(error.code).toBe('NOTHING_TO_RECONCILE')
    expect(DISPATCH_REFUSAL_STATUS.NOTHING_TO_RECONCILE).toBe(409)
  })

  it('findUnfinishedLabelPurchases lists claimed rows that never finished, oldest first', async () => {
    const older = {
      shipmentId: 'row-old',
      orderId: ORDER_ID,
      claimedAt: new Date('2026-09-01T00:00:00Z'),
      awbNumber: AWB,
    }
    const newer = { shipmentId: SHIPMENT_ROW_ID, orderId: ORDER_ID, claimedAt: new Date(), awbNumber: null }
    recorder.queueRows({ 'select:order_shipments': [[older, newer]] })

    const rows = await findUnfinishedLabelPurchases()

    expect(rows).toEqual([older, newer])
    const read = recorder.selects(orderShipments)[0]!
    const { sql } = recorder.render(read.where)
    expect(sql).toContain('"label_object_token" is not null')
    expect(sql).toContain('"voided_at" is null')
    expect(sql).toContain('"status" = $')
    expect(recorder.params(read.where)).toContain('pending')
    expect(recorder.render(read.orderBy).sql).toContain('"updated_at" asc')
  })
})

// ============================================================================
// One process, two admins
// ============================================================================

describe('two callers in one process', () => {
  it('share one purchase: one claim, one courier order, one label, two answers', async () => {
    queueHappyPath()

    const [a, b] = await Promise.all([
      buyLabelForOrder(ORDER_ID, input(), actor()),
      buyLabelForOrder(ORDER_ID, input(), actor()),
    ])

    expect(courier.createCourierOrder).toHaveBeenCalledTimes(1)
    expect(courier.generateLabel).toHaveBeenCalledTimes(1)
    expect(recorder.tx.commits).toBe(2)
    expect(a.labelObjectToken).toBe(b.labelObjectToken)
  })

  it('the join covers overlap only: a later call is a new claim attempt', async () => {
    queueHappyPath()
    await buyLabelForOrder(ORDER_ID, input(), actor())

    recorder.reset()
    queueHappyPath({
      shipments: [openRow({ labelObjectToken: CLAIMED_TOKEN, status: 'label_created' })],
    })

    const error = await failureOf(() => buyLabelForOrder(ORDER_ID, input(), actor()))
    expect(error.code).toBe('ORDER_HAS_LIVE_LABEL')
  })
})
