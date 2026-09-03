/**
 * POST /api/admin/orders/:orderId/ship (#729): the label purchase, as a route.
 *
 * The route owns three things and delegates the rest: the admin gate (real
 * middleware, mocked session — `tests/routes/admin/vendors.test.ts` says why a
 * mocked middleware proves nothing), the order-status gate (the same list the
 * ready queue filters on), and turning the library's refusals into responses
 * an admin can act on. Readiness, the lock, the claim, the courier and the
 * audit rows are `lib/shipment-dispatch.ts`'s, proved in its own suites; here
 * it is a mock that answers or refuses on cue.
 *
 * Two allow-lists are asserted rather than described: the 409 for an unready
 * order names every blocker, and the 201 never carries the token, the cost or
 * the pickup vendor.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
)

const dispatch = vi.hoisted(() => ({ buyLabelForOrder: vi.fn() }))

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }))

vi.mock('../../../src/database', () => ({ db: recorder.db }))
vi.mock('../../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}))
vi.mock('../../../src/lib/shipment-dispatch', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/lib/shipment-dispatch')>()
  return { ...actual, buyLabelForOrder: dispatch.buyLabelForOrder }
})

const mockGetSession = vi.fn()
vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

import { orderShipments } from '../../../src/database/schema/shipping'
import { ShipmentDispatchError } from '../../../src/lib/shipment-dispatch'
import {
  ShiprocketError,
  ShiprocketNotConfiguredError,
  ShiprocketNotServiceableError,
  ShiprocketWriteOutcomeUnknownError,
} from '../../../src/services/shiprocket'
import { adminOrderShipmentsApp, buyLabelSchema, SHIPPABLE_ORDER_STATUSES } from '../../../src/routes/admin/shipments'

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const JOB_ID = 'd00d0000-0000-4000-8000-000000000003'
const VENDOR_ID = 'c0ffee00-0000-4000-8000-000000000002'
const TOKEN = 'held-token-7f0c2a6e1d3b4c5a9e8f2b1a0c9d8e7f'

const PARCEL = { weightGrams: 850, lengthCm: 40, widthCm: 30, heightCm: 6 }

const app = () => buildRouteApp('/api/admin', adminOrderShipmentsApp)

function orderRow(over: Record<string, unknown> = {}) {
  return { id: ORDER_ID, orderNumber: 'CA-2026-000412', status: 'processing', ...over }
}

/** The row as SHIPMENT_RESPONSE_COLUMNS projects it — no token, no cost, no vendor. */
function responseRow(over: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    shippingOptionId: null,
    trackingNumber: '141123221084922',
    carrier: 'Shiprocket',
    courierName: 'Delhivery Surface',
    awbNumber: '141123221084922',
    trackingUrl: null,
    status: 'label_created',
    shippedAt: null,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    notes: null,
    createdAt: new Date('2026-09-03T10:00:00Z'),
    updatedAt: new Date('2026-09-03T10:05:00Z'),
    ...over,
  }
}

function purchase(over: Record<string, unknown> = {}) {
  return {
    shipmentId: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    labelObjectToken: TOKEN,
    awbNumber: '141123221084922',
    courierName: 'Delhivery Surface',
    courierCompanyId: 51,
    costPaise: 15315,
    externalOrderId: '812345678',
    externalShipmentId: '912345678',
    pickupVendorId: VENDOR_ID,
    resumed: false,
    pickup: { scheduled: true, scheduledFor: '2026-09-04 14:00:00', tokenNumber: 'PKP-1', alreadyScheduled: false },
    ...over,
  }
}

async function ship(body: unknown = { parcel: PARCEL }, orderId = ORDER_ID) {
  return app().request(`/api/admin/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  recorder.reset()
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(adminSessionFor('admin'))
  dispatch.buyLabelForOrder.mockResolvedValue(purchase())
  recorder.queueRows({
    'select:orders': [[orderRow()]],
    'select:order_shipments': [[responseRow()]],
  })
})

// ============================================================================
// The gates
// ============================================================================

describe('the gates', () => {
  it('refuses a caller with no session, before reading anything', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await ship()

    expect(res.status).toBe(401)
    expect(recorder.queries).toEqual([])
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not an admin', async () => {
    mockGetSession.mockResolvedValue(adminSessionFor('customer'))

    const res = await ship()

    expect(res.status).toBe(403)
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('refuses an order id that is not a uuid', async () => {
    const res = await ship({ parcel: PARCEL }, 'not-a-uuid')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'ORDER_ID_INVALID' })
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('refuses a body with no parcel, and says what a body is', async () => {
    const res = await ship({})

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; error: string }
    expect(body.code).toBe('SHIPMENT_BODY_INVALID')
    expect(body.error).toContain('weightGrams')
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('404 when the order does not exist', async () => {
    recorder.queueRows({ 'select:orders': [[]] })

    const res = await ship()

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' })
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('refuses an order outside the shippable statuses, naming the status, before the library', async () => {
    recorder.queueRows({ 'select:orders': [[orderRow({ status: 'cancelled' })]] })

    const res = await ship()

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; error: string }
    expect(body.code).toBe('ORDER_NOT_SHIPPABLE')
    expect(body.error).toContain("'cancelled'")
    expect(dispatch.buyLabelForOrder).not.toHaveBeenCalled()
  })

  it('reads the order-status gate from the same list the ready queue uses', () => {
    expect(SHIPPABLE_ORDER_STATUSES).toContain('processing')
    expect(SHIPPABLE_ORDER_STATUSES).not.toContain('cancelled')
  })
})

// ============================================================================
// The refusals — each with its own status, code and an actionable message
// ============================================================================

describe('the refusals', () => {
  it('409 with every blocker named when the order is not ready', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShipmentDispatchError('Order is not ready to label: two reasons.', 'ORDER_NOT_READY', {
        blockers: [
          { code: 'job_not_qc_passed', message: 'Job d00d… has not passed QC.', jobId: JOB_ID },
          { code: 'goods_not_at_consolidator', message: 'The frame job is still at Ridgeprint.', jobId: 'job-2' },
        ],
      })
    )

    const res = await ship()

    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; error: string; blockers: { code: string; jobId?: string }[] }
    expect(body.code).toBe('ORDER_NOT_READY')
    expect(body.blockers).toHaveLength(2)
    expect(body.blockers.map((b) => b.code)).toEqual(['job_not_qc_passed', 'goods_not_at_consolidator'])
    expect(body.blockers[0]!.jobId).toBe(JOB_ID)
    expect(body.error).toContain('not ready')
  })

  it('409 and says so when a live label already exists, naming the row', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShipmentDispatchError('Order already has a live label on shipment b3d9…; void it first.', 'ORDER_HAS_LIVE_LABEL', {
        shipmentId: SHIPMENT_ROW_ID,
      })
    )

    const res = await ship()

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'ORDER_HAS_LIVE_LABEL', shipmentId: SHIPMENT_ROW_ID })
  })

  it('409 when somebody else is buying it right now', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShipmentDispatchError('A label is being bought right now.', 'LABEL_PURCHASE_IN_PROGRESS', {
        shipmentId: SHIPMENT_ROW_ID,
      })
    )

    const res = await ship()

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'LABEL_PURCHASE_IN_PROGRESS', shipmentId: SHIPMENT_ROW_ID })
  })

  it('422 when the consolidating vendor cannot be quoted from', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShipmentDispatchError('The consolidating vendor has no postcode on record.', 'PICKUP_VENDOR_UNQUOTABLE')
    )

    const res = await ship()

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'PICKUP_VENDOR_UNQUOTABLE' })
  })

  it('surfaces SHIPROCKET_NOT_CONFIGURED with the client’s own message intact', async () => {
    const original = new ShiprocketNotConfiguredError(
      'Shiprocket is not configured: SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are unset. Set them in .env.'
    )
    dispatch.buyLabelForOrder.mockRejectedValue(original)

    const res = await ship()

    // The status is the client's own table for its code — one source of truth
    // for what a courier refusal answers with, argued on the table itself.
    expect(res.status).toBe(422)
    const body = (await res.json()) as { code: string; error: string }
    expect(body.code).toBe('SHIPROCKET_NOT_CONFIGURED')
    expect(body.error).toBe(original.message)
    expect(body.error).not.toMatch(/password=|[A-Za-z0-9]{32,}/)
  })

  it('503 when no courier serves the route', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShiprocketNotServiceableError('No courier serves 400072 to 560001 for 0.85 kg today.')
    )

    const res = await ship()

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'SHIPROCKET_NOT_SERVICEABLE' })
  })

  it('409 — not 500, and not "try again" — when the courier’s answer is unknown', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShiprocketWriteOutcomeUnknownError('Shiprocket did not answer. Check the dashboard before asking again.')
    )

    const res = await ship()

    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; error: string }
    expect(body.code).toBe('SHIPROCKET_WRITE_OUTCOME_UNKNOWN')
    expect(body.error).toContain('before asking again')
  })

  it('a refusal body never carries a label URL, a token, a cost or a vendor id', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(
      new ShiprocketError('Label host refused.', 'SHIPROCKET_LABEL_FETCH_FAILED')
    )

    const res = await ship()

    expect(res.status).toBe(502)
    const text = await res.text()
    for (const internal of ['labelObjectToken', 'costPaise', 'pickupVendorId', 'label_url', 'https://']) {
      expect(text).not.toContain(internal)
    }
  })

  it('anything else is a fault: a fixed 500, logged', async () => {
    dispatch.buyLabelForOrder.mockRejectedValue(new Error('connection terminated unexpectedly'))

    const res = await ship()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to buy the label' })
    expect(loggerMock.error).toHaveBeenCalled()
  })
})

// ============================================================================
// Success
// ============================================================================

describe('success', () => {
  it('hands the library the order, the parcel and the request context, and answers 201 with the shipment', async () => {
    const res = await ship({ parcel: PARCEL, courierCompanyId: 51 })

    expect(res.status).toBe(201)
    expect(dispatch.buyLabelForOrder).toHaveBeenCalledTimes(1)
    const [orderId, input, actor] = dispatch.buyLabelForOrder.mock.calls[0] as [string, unknown, { req: unknown }]
    expect(orderId).toBe(ORDER_ID)
    expect(input).toEqual({ parcel: PARCEL, courierCompanyId: 51 })
    expect(actor.req).toBeDefined()

    const body = (await res.json()) as { message: string; shipment: Record<string, unknown>; pickup: unknown; resumed: boolean }
    expect(body.message).toBe('Label bought')
    expect(body.shipment).toMatchObject({
      id: SHIPMENT_ROW_ID,
      awbNumber: '141123221084922',
      courierName: 'Delhivery Surface',
      carrier: 'Shiprocket',
      status: 'label_created',
    })
    expect(body.pickup).toEqual({
      scheduled: true,
      scheduledFor: '2026-09-04 14:00:00',
      tokenNumber: 'PKP-1',
      alreadyScheduled: false,
    })
    expect(body.resumed).toBe(false)
  })

  it('omits the courier preference when none was given', async () => {
    await ship({ parcel: PARCEL })

    expect(dispatch.buyLabelForOrder.mock.calls[0]![1]).toEqual({ parcel: PARCEL })
  })

  it('re-reads the row through the response allow-list, by the id the purchase returned', async () => {
    await ship()

    const reread = recorder.selects(orderShipments)[0]
    expect(reread, 'the shipment was not re-read').toBeDefined()
    expect(reread!.fields).not.toContain('labelObjectToken')
    expect(reread!.fields).not.toContain('costPaise')
    expect(reread!.fields).not.toContain('pickupVendorId')
    expect(recorder.params(reread!.where)).toContain(SHIPMENT_ROW_ID)
  })

  it('never puts the token, the cost, the pickup vendor or a label URL in the response', async () => {
    const res = await ship()

    const text = await res.text()
    for (const internal of [TOKEN, 'labelObjectToken', 'costPaise', '15315', 'pickupVendorId', VENDOR_ID, 'https://']) {
      expect(text, `response carries ${internal}`).not.toContain(internal)
    }
  })

  it('says so when the purchase resumed an earlier claim', async () => {
    dispatch.buyLabelForOrder.mockResolvedValue(purchase({ resumed: true }))

    const res = await ship()

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ message: 'Label purchase resumed', resumed: true })
  })

  it('reports a pickup that was not scheduled, as a retryable fact, still with 201', async () => {
    dispatch.buyLabelForOrder.mockResolvedValue(
      purchase({ pickup: { scheduled: false, retryable: true, reason: 'No pickup slots today.' } })
    )

    const res = await ship()

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      pickup: { scheduled: false, retryable: true, reason: 'No pickup slots today.' },
    })
  })
})

describe('buyLabelSchema', () => {
  it('requires a parcel of four positive integers', () => {
    expect(buyLabelSchema.safeParse({ parcel: PARCEL }).success).toBe(true)
    expect(buyLabelSchema.safeParse({}).success).toBe(false)
    expect(buyLabelSchema.safeParse({ parcel: { ...PARCEL, weightGrams: 0 } }).success).toBe(false)
    expect(buyLabelSchema.safeParse({ parcel: { ...PARCEL, lengthCm: 12.5 } }).success).toBe(false)
    expect(buyLabelSchema.safeParse({ parcel: { ...PARCEL, heightCm: -1 } }).success).toBe(false)
  })

  it('takes an optional positive integer courier id', () => {
    expect(buyLabelSchema.safeParse({ parcel: PARCEL, courierCompanyId: 51 }).success).toBe(true)
    expect(buyLabelSchema.safeParse({ parcel: PARCEL, courierCompanyId: 0 }).success).toBe(false)
    expect(buyLabelSchema.safeParse({ parcel: PARCEL, courierCompanyId: '51' }).success).toBe(false)
  })
})
