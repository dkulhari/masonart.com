/**
 * POST /api/admin/shipments/:id/void (#731): cancel with the courier, then
 * mark the row voided.
 *
 * The route owns the gate, the body (a reason is required — a void with no
 * reason is unanswerable in a dispute) and the mapping of the library's
 * refusals onto responses. The ordering that matters — courier first, row
 * second, and NO row write when the courier call fails — is the library's,
 * proved in `tests/lib/shipment-dispatch.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
)

const dispatch = vi.hoisted(() => ({ voidLabel: vi.fn() }))
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }))

vi.mock('../../../src/database', () => ({ db: recorder.db }))
vi.mock('../../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}))
vi.mock('../../../src/lib/shipment-dispatch', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/lib/shipment-dispatch')>()
  return { ...actual, voidLabel: dispatch.voidLabel }
})

const mockGetSession = vi.fn()
vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

import { orderShipments } from '../../../src/database/schema/shipping'
import { ShipmentDispatchError } from '../../../src/lib/shipment-dispatch'
import { ShiprocketCancelRefusedError, ShiprocketWriteOutcomeUnknownError } from '../../../src/services/shiprocket'
import { adminShipmentsApp, voidLabelSchema } from '../../../src/routes/admin/shipments'

const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const REASON = 'Customer changed the delivery address after the label was bought'

const app = () => buildRouteApp('/api/admin/shipments', adminShipmentsApp)

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
    status: 'cancelled',
    shippedAt: null,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    notes: null,
    createdAt: new Date('2026-09-03T10:00:00Z'),
    updatedAt: new Date('2026-09-03T11:00:00Z'),
    ...over,
  }
}

async function voidIt(body: unknown = { reason: REASON }, id = SHIPMENT_ROW_ID) {
  return app().request(`/api/admin/shipments/${id}/void`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  recorder.reset()
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(adminSessionFor('admin'))
  dispatch.voidLabel.mockResolvedValue({
    shipmentId: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    awbNumber: '141123221084922',
    voidedAt: new Date('2026-09-03T11:00:00Z'),
    alreadyCancelledAtCourier: false,
  })
  recorder.queueRows({ 'select:order_shipments': [[responseRow()]] })
})

describe('the gates', () => {
  it('401 with no session, 403 for a non-admin, and the library is never asked', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await voidIt()).status).toBe(401)
    mockGetSession.mockResolvedValue(adminSessionFor('customer'))
    expect((await voidIt()).status).toBe(403)
    expect(dispatch.voidLabel).not.toHaveBeenCalled()
  })

  it('400 for an id that is not a uuid', async () => {
    const res = await voidIt({ reason: REASON }, 'nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'SHIPMENT_ID_INVALID' })
  })

  it('requires a reason, and says so', async () => {
    for (const body of [{}, { reason: '' }, { reason: '  ' }, { reason: 'x'.repeat(501) }]) {
      const res = await voidIt(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      const json = (await res.json()) as { code: string; error: string }
      expect(json.code).toBe('SHIPMENT_BODY_INVALID')
      expect(json.error).toContain('reason')
    }
    expect(dispatch.voidLabel).not.toHaveBeenCalled()
  })

  it('voidLabelSchema trims and bounds the reason', () => {
    expect(voidLabelSchema.safeParse({ reason: '  changed address  ' }).data?.reason).toBe('changed address')
    expect(voidLabelSchema.safeParse({ reason: 'ab' }).success).toBe(false)
    expect(voidLabelSchema.safeParse({ reason: 'abc' }).success).toBe(true)
  })
})

describe('the refusals', () => {
  it('404 when there is no such shipment', async () => {
    dispatch.voidLabel.mockRejectedValue(new ShipmentDispatchError('No shipment b3d9…', 'SHIPMENT_NOT_FOUND', { shipmentId: SHIPMENT_ROW_ID }))
    const res = await voidIt()
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'SHIPMENT_NOT_FOUND' })
  })

  it('409 when there is nothing to void — no live label, or already voided', async () => {
    dispatch.voidLabel.mockRejectedValue(
      new ShipmentDispatchError('Shipment b3d9… has no live label to void.', 'NOTHING_TO_VOID', { shipmentId: SHIPMENT_ROW_ID })
    )
    const res = await voidIt()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'NOTHING_TO_VOID', shipmentId: SHIPMENT_ROW_ID })
  })

  it('422 when the courier will not cancel, with its reason, and the row was not touched', async () => {
    dispatch.voidLabel.mockRejectedValue(
      new ShiprocketCancelRefusedError('Shiprocket would not cancel AWB 141123221084922: already picked up.')
    )
    const res = await voidIt()
    expect(res.status).toBe(422)
    const body = (await res.json()) as { code: string; error: string }
    expect(body.code).toBe('SHIPROCKET_CANCEL_REFUSED')
    expect(body.error).toContain('already picked up')
    expect(recorder.survivors('update', orderShipments)).toEqual([])
  })

  it('409 when the courier did not answer: not void, not retry-blind', async () => {
    dispatch.voidLabel.mockRejectedValue(
      new ShiprocketWriteOutcomeUnknownError('Shiprocket did not answer the cancellation. Check the dashboard.')
    )
    const res = await voidIt()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN' })
  })

  it('anything else is a fixed 500', async () => {
    dispatch.voidLabel.mockRejectedValue(new Error('boom'))
    const res = await voidIt()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to void the label' })
  })
})

describe('success', () => {
  it('hands the library the id, the trimmed reason and the request context, and answers with the row', async () => {
    const res = await voidIt({ reason: `  ${REASON}  ` })

    expect(res.status).toBe(200)
    expect(dispatch.voidLabel).toHaveBeenCalledTimes(1)
    const [id, reason, actor] = dispatch.voidLabel.mock.calls[0] as [string, string, { req: unknown }]
    expect(id).toBe(SHIPMENT_ROW_ID)
    expect(reason).toBe(REASON)
    expect(actor.req).toBeDefined()

    const body = (await res.json()) as { message: string; shipment: Record<string, unknown> }
    expect(body.message).toBe('Label voided')
    expect(body.shipment).toMatchObject({ id: SHIPMENT_ROW_ID, status: 'cancelled', awbNumber: '141123221084922' })
    const text = JSON.stringify(body)
    for (const internal of ['labelObjectToken', 'costPaise', 'pickupVendorId', 'voidedReason']) {
      expect(text).not.toContain(internal)
    }
  })

  it('re-reads the row through the response allow-list', async () => {
    await voidIt()
    const reread = recorder.selects(orderShipments)[0]!
    expect(reread.fields).not.toContain('labelObjectToken')
    expect(recorder.params(reread.where)).toContain(SHIPMENT_ROW_ID)
  })

  it('says when the courier had already cancelled it', async () => {
    dispatch.voidLabel.mockResolvedValue({
      shipmentId: SHIPMENT_ROW_ID,
      orderId: ORDER_ID,
      awbNumber: '141123221084922',
      voidedAt: new Date(),
      alreadyCancelledAtCourier: true,
    })
    const res = await voidIt()
    expect(await res.json()).toMatchObject({ message: 'Label voided', alreadyCancelledAtCourier: true })
  })
})
