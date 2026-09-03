/**
 * `applyStatusPush` (#733): a verified, attributed, first-seen push becomes
 * a shipment status, an order status, an audit row and a notification — or
 * a recorded refusal to guess.
 *
 * The receiver (#732, `tests/routes/webhooks/shiprocket.test.ts`) proves what
 * reaches this function. This file proves what it does with it:
 *
 * - a known status writes the shipment and moves the order through the SAME
 *   tables the admin route uses, in one transaction with its audit row;
 * - an unknown status is RECORDED (an audit row an admin can see), changes
 *   nothing, and does not crash the webhook;
 * - a status the shipment is already in, or one that would move it
 *   backwards, is a no-op — replays and late scans are the ordinary case;
 * - RTO and NDR each fire their own notification, after the answer.
 *
 * @see packages/api/src/services/shiprocket-webhook.ts
 * @see packages/api/src/lib/shipment-status.ts
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

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }))
const notify = vi.hoisted(() => ({ sendOrderNotification: vi.fn() }))

vi.mock('../../src/database', () => ({ db: recorder.db }))
vi.mock('../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}))
vi.mock('../../src/lib/audit', () => audit)
vi.mock('../../src/services/notifications', () => notify)

import { orders } from '../../src/database/schema/orders'
import { orderShipments } from '../../src/database/schema/shipping'
import { applyStatusPush, type AttributedStatusPush } from '../../src/services/shiprocket-webhook'

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const AWB = '141123221084922'

function push(over: Partial<AttributedStatusPush> = {}): AttributedStatusPush {
  return {
    shipmentId: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    awb: AWB,
    status: 'DELIVERED',
    statusId: 7,
    srOrderId: '812345678',
    reference: null,
    at: '2026-09-04 10:00:00',
    courierName: 'Delhivery Surface',
    ...over,
  }
}

/** The locked read inside the transaction, in the function's own projection. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    status: 'out_for_delivery',
    orderStatus: 'out_for_delivery',
    ...over,
  }
}

function queue({
  shipment = row(),
  shipmentWrite = [{ id: SHIPMENT_ROW_ID }],
  orderWrite = [{ id: ORDER_ID }],
}: { shipment?: unknown; shipmentWrite?: unknown[]; orderWrite?: unknown[] } = {}) {
  recorder.queueRows({
    'select:order_shipments': [[shipment]],
    'update:order_shipments': [shipmentWrite],
    'update:orders': [orderWrite],
  })
}

const actor = () => ({
  get: () => undefined,
  set: vi.fn(),
  req: { method: 'POST', path: '/api/webhooks/shiprocket', header: () => undefined },
})

beforeEach(() => {
  recorder.reset()
  vi.clearAllMocks()
  notify.sendOrderNotification.mockResolvedValue({ success: true, channels: {}, notificationIds: [], errors: [] })
  audit.recordAudit.mockResolvedValue(undefined)
})

describe('a known status', () => {
  it('writes the shipment, moves the order, and audits — in one transaction', async () => {
    queue()

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({
      applied: true,
      shipmentStatus: 'delivered',
      orderStatus: 'delivered',
      orderMoved: true,
      notification: 'delivered',
    })

    const [read] = recorder.selects(orderShipments)
    expect(read?.inTx).toBe(true)

    const shipmentWrite = recorder.survivors('update', orderShipments)[0]!
    expect(shipmentWrite.txId).toBe(1)
    expect(shipmentWrite.values).toMatchObject({ status: 'delivered', deliveredAt: expect.any(Date) })
    expect(recorder.params(shipmentWrite.where)).toContain(SHIPMENT_ROW_ID)

    const orderWrite = recorder.survivors('update', orders)[0]!
    expect(orderWrite.txId).toBe(1)
    expect(orderWrite.values).toMatchObject({ status: 'delivered', deliveredAt: expect.any(Date) })
    // The predicate repeats the status the row was read at, as the route does.
    expect(recorder.params(orderWrite.where)).toEqual(expect.arrayContaining([ORDER_ID, 'out_for_delivery']))

    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
    const [, entry, tx] = audit.recordAudit.mock.calls[0] as [unknown, Record<string, unknown>, unknown]
    expect(entry.action).toBe('shipment.tracking_updated')
    expect(entry.entityId).toBe(SHIPMENT_ROW_ID)
    expect(entry.before).toMatchObject({ status: 'out_for_delivery' })
    expect(entry.after).toMatchObject({ status: 'delivered' })
    expect(entry.metadata).toMatchObject({
      orderId: ORDER_ID,
      source: 'shiprocket_webhook',
      shiprocketStatus: 'DELIVERED',
      shiprocketStatusId: 7,
    })
    expect(tx).toBeDefined()
    expect(tx).not.toBe(recorder.db)
    expect(recorder.tx.commits).toBe(1)
  })

  it('shipped stamps shipped_at on the shipment and the order', async () => {
    queue({ shipment: row({ status: 'label_created', orderStatus: 'processing' }) })

    const outcome = await applyStatusPush(push({ status: 'SHIPPED', statusId: 6 }), actor())

    expect(outcome).toMatchObject({ shipmentStatus: 'shipped', orderStatus: 'shipped', orderMoved: true })
    expect(recorder.survivors('update', orderShipments)[0]!.values).toMatchObject({
      status: 'shipped',
      shippedAt: expect.any(Date),
    })
    expect(recorder.survivors('update', orders)[0]!.values).toMatchObject({
      status: 'shipped',
      shippedAt: expect.any(Date),
    })
  })

  it('in_transit moves the shipment and leaves the order alone', async () => {
    queue({ shipment: row({ status: 'shipped', orderStatus: 'shipped' }) })

    const outcome = await applyStatusPush(push({ status: 'IN TRANSIT', statusId: 18 }), actor())

    expect(outcome).toMatchObject({ applied: true, shipmentStatus: 'in_transit', orderMoved: false })
    expect(recorder.survivors('update', orders)).toEqual([])
    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
  })

  it('does not drive an order that has left the fulfilment track, but still records the parcel', async () => {
    queue({ shipment: row({ status: 'out_for_delivery', orderStatus: 'cancelled' }) })

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({ applied: true, shipmentStatus: 'delivered', orderMoved: false })
    expect(recorder.survivors('update', orderShipments)).toHaveLength(1)
    expect(recorder.survivors('update', orders)).toEqual([])
  })

  it('when the order moved under us, the shipment write still lands and the order is reported unmoved', async () => {
    queue({ orderWrite: [] })

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({ applied: true, orderMoved: false })
    expect(recorder.survivors('update', orderShipments)).toHaveLength(1)
    expect(recorder.tx.commits).toBe(1)
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('a shipment that vanished between the receiver and here is a refusal to guess, not a crash', async () => {
    recorder.queueRows({ 'select:order_shipments': [[]] })

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({ applied: false, reason: 'shipment_not_found' })
    expect(recorder.tx.rollbacks + recorder.tx.commits).toBe(1)
    expect(audit.recordAudit).not.toHaveBeenCalled()
  })
})

describe('an unknown status', () => {
  it('is recorded as an audit row an admin can see, and changes nothing', async () => {
    queue()

    const outcome = await applyStatusPush(push({ status: 'Teleported', statusId: 31337 }), actor())

    expect(outcome).toMatchObject({ applied: false, reason: 'unmapped_status' })
    expect(recorder.survivors('update', orderShipments)).toEqual([])
    expect(recorder.survivors('update', orders)).toEqual([])
    expect(audit.recordAudit).toHaveBeenCalledTimes(1)
    const [, entry] = audit.recordAudit.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe('shipment.status_unmapped')
    expect(entry.entityId).toBe(SHIPMENT_ROW_ID)
    expect(entry.metadata).toMatchObject({
      orderId: ORDER_ID,
      awb: AWB,
      shiprocketStatus: 'Teleported',
      shiprocketStatusId: 31337,
    })
    expect(loggerMock.warn).toHaveBeenCalled()
    expect(notify.sendOrderNotification).not.toHaveBeenCalled()
  })

  it('a known-but-ignored status is acknowledged without an audit row', async () => {
    queue()

    const outcome = await applyStatusPush(push({ status: 'Packed', statusId: 62 }), actor())

    expect(outcome).toMatchObject({ applied: false, reason: 'ignored_status' })
    expect(audit.recordAudit).not.toHaveBeenCalled()
    expect(recorder.survivors('update', orderShipments)).toEqual([])
  })
})

describe('replays and late scans', () => {
  it('a status the shipment is already in is a no-op: no write, no audit, no notification', async () => {
    queue({ shipment: row({ status: 'delivered', orderStatus: 'delivered' }) })

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({ applied: false, reason: 'already_there' })
    expect(recorder.survivors('update', orderShipments)).toEqual([])
    expect(audit.recordAudit).not.toHaveBeenCalled()
    expect(notify.sendOrderNotification).not.toHaveBeenCalled()
  })

  it('a late scan does not move a delivered shipment backwards', async () => {
    queue({ shipment: row({ status: 'delivered', orderStatus: 'delivered' }) })

    const outcome = await applyStatusPush(push({ status: 'IN TRANSIT', statusId: 18 }), actor())

    expect(outcome).toMatchObject({ applied: false, reason: 'out_of_order' })
    expect(recorder.survivors('update', orderShipments)).toEqual([])
    expect(notify.sendOrderNotification).not.toHaveBeenCalled()
  })
})

describe('notifications', () => {
  it('NDR fires delivery_attempt_failed', async () => {
    queue({ shipment: row({ status: 'out_for_delivery', orderStatus: 'out_for_delivery' }) })

    const outcome = await applyStatusPush(push({ status: 'UNDELIVERED', statusId: 21 }), actor())

    expect(outcome).toMatchObject({ shipmentStatus: 'undelivered', orderMoved: false, notification: 'delivery_attempt_failed' })
    await vi.waitFor(() => expect(notify.sendOrderNotification).toHaveBeenCalledTimes(1))
    expect(notify.sendOrderNotification).toHaveBeenCalledWith({ orderId: ORDER_ID, type: 'delivery_attempt_failed' })
  })

  it('RTO fires returning_to_sender, which is a different message', async () => {
    queue({ shipment: row({ status: 'in_transit', orderStatus: 'shipped' }) })

    const outcome = await applyStatusPush(push({ status: 'RTO INITIATED', statusId: 9 }), actor())

    expect(outcome).toMatchObject({ shipmentStatus: 'rto_initiated', notification: 'returning_to_sender' })
    await vi.waitFor(() => expect(notify.sendOrderNotification).toHaveBeenCalledTimes(1))
    expect(notify.sendOrderNotification).toHaveBeenCalledWith({ orderId: ORDER_ID, type: 'returning_to_sender' })
  })

  it('shipped, out for delivery and delivered fire theirs; in transit fires none', async () => {
    queue({ shipment: row({ status: 'label_created', orderStatus: 'processing' }) })
    expect(await applyStatusPush(push({ status: 'SHIPPED', statusId: 6 }), actor())).toMatchObject({
      notification: 'shipped',
    })

    recorder.reset()
    queue({ shipment: row({ status: 'in_transit', orderStatus: 'shipped' }) })
    expect(await applyStatusPush(push({ status: 'OUT FOR DELIVERY', statusId: 17 }), actor())).toMatchObject({
      notification: 'out_for_delivery',
    })

    recorder.reset()
    queue({ shipment: row({ status: 'shipped', orderStatus: 'shipped' }) })
    expect(await applyStatusPush(push({ status: 'IN TRANSIT', statusId: 18 }), actor())).toMatchObject({
      applied: true,
      notification: null,
    })

    await vi.waitFor(() => expect(notify.sendOrderNotification).toHaveBeenCalledTimes(2))
  })

  it('is not awaited: a slow mail does not delay the answer', async () => {
    queue()
    notify.sendOrderNotification.mockReturnValue(new Promise(() => undefined))

    const outcome = await Promise.race([
      applyStatusPush(push(), actor()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('apply waited on the mail')), 500)),
    ])

    expect(outcome).toMatchObject({ applied: true })
  })

  it('a notification failure is logged, never thrown', async () => {
    queue()
    notify.sendOrderNotification.mockRejectedValue(new Error('smtp down'))

    const outcome = await applyStatusPush(push(), actor())

    expect(outcome).toMatchObject({ applied: true })
    await vi.waitFor(() => expect(loggerMock.error).toHaveBeenCalled())
  })

  it('fires only after the transaction has committed', async () => {
    queue()
    let commitsWhenNotified = -1
    notify.sendOrderNotification.mockImplementation(async () => {
      commitsWhenNotified = recorder.tx.commits
      return { success: true, channels: {}, notificationIds: [], errors: [] }
    })

    await applyStatusPush(push(), actor())

    await vi.waitFor(() => expect(commitsWhenNotified).toBe(1))
  })
})
