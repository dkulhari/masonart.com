/**
 * GET /api/admin/shipments/:id/label (#735): the label PDF, as bytes, for the
 * admin screen to hand to the operating system.
 *
 * Three properties, and each one is the reason this route exists rather than
 * the admin screen being given a signed URL:
 *
 * 1. **The read decides before any bytes are fetched.** A miss — no such
 *    shipment, no label bought, label voided, a token outside its alphabet —
 *    ends the request at a 404 and `getFile` is never asked. That ordering is
 *    the property, not the status code.
 * 2. **Nothing about the object leaves.** The response is the bytes and three
 *    headers; no token, no key, no URL in the body or the headers. The screen
 *    fetches through this route with the session cookie and never sees where
 *    the object lives.
 * 3. **Only a LIVE label.** `voided_at IS NULL` and a token present — the same
 *    two conditions `getVendorJobLabelKey` puts in its WHERE. A voided label is
 *    kept for disputes and is not served: the courier would refuse it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
)

const storage = vi.hoisted(() => ({ getFile: vi.fn() }))
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }))

vi.mock('../../../src/database', () => ({ db: recorder.db }))
vi.mock('../../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}))
vi.mock('../../../src/lib/storage', () => ({
  getFile: (...args: unknown[]) => storage.getFile(...args),
}))

const mockGetSession = vi.fn()
vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

import { orderShipments } from '../../../src/database/schema/shipping'
import { adminShipmentsApp } from '../../../src/routes/admin/shipments'

const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const TOKEN = 'Qk9xZ1lOaXhlUFZtN0g0Zg'
const AWB = '141123221084922'
const PDF = Buffer.from('%PDF-1.4 label bytes')

const app = () => buildRouteApp('/api/admin/shipments', adminShipmentsApp)

function labelRow(over: Record<string, unknown> = {}) {
  return { token: TOKEN, voidedAt: null, awbNumber: AWB, ...over }
}

async function getLabel(id = SHIPMENT_ROW_ID) {
  return app().request(`/api/admin/shipments/${id}/label`)
}

beforeEach(() => {
  recorder.reset()
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(adminSessionFor('admin'))
  storage.getFile.mockResolvedValue(PDF)
  recorder.queueRows({ 'select:order_shipments': [[labelRow()]] })
})

describe('the gates', () => {
  it('401 with no session, 403 for a non-admin, and neither the row nor the object is read', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await getLabel()).status).toBe(401)
    mockGetSession.mockResolvedValue(adminSessionFor('customer'))
    expect((await getLabel()).status).toBe(403)
    expect(recorder.selects(orderShipments)).toHaveLength(0)
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it('400 for an id that is not a uuid, before any query', async () => {
    const res = await getLabel('nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'SHIPMENT_ID_INVALID' })
    expect(recorder.selects(orderShipments)).toHaveLength(0)
    expect(storage.getFile).not.toHaveBeenCalled()
  })
})

describe('the read comes first, and decides', () => {
  it('404 SHIPMENT_NOT_FOUND when there is no such shipment, and the object is never fetched', async () => {
    recorder.reset()
    recorder.queueRows({ 'select:order_shipments': [[]] })
    const res = await getLabel()
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'SHIPMENT_NOT_FOUND' })
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it('404 when no label was ever bought for the row', async () => {
    recorder.reset()
    recorder.queueRows({ 'select:order_shipments': [[labelRow({ token: null })]] })
    const res = await getLabel()
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string; code?: string }
    expect(body.error).toMatch(/no live label/i)
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it('404 when the label has been voided — the courier would refuse it', async () => {
    recorder.reset()
    recorder.queueRows({
      'select:order_shipments': [[labelRow({ voidedAt: new Date('2026-09-03T11:00:00Z') })]],
    })
    const res = await getLabel()
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toMatch(/no live label/i)
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it('404 for a token outside its alphabet, so a stored value can never name a path', async () => {
    for (const token of ['../products/secret', 'a/b', 'tok en', '']) {
      recorder.reset()
      vi.clearAllMocks()
      storage.getFile.mockResolvedValue(PDF)
      recorder.queueRows({ 'select:order_shipments': [[labelRow({ token })]] })
      const res = await getLabel()
      expect(res.status, JSON.stringify(token)).toBe(404)
      expect(storage.getFile, JSON.stringify(token)).not.toHaveBeenCalled()
    }
  })

  it('reads the token, the void mark and the AWB — and nothing else — for exactly this row', async () => {
    await getLabel()
    const read = recorder.selects(orderShipments)[0]!
    expect(read.fields, 'the read is wholesale').not.toBeNull()
    expect([...(read.fields as string[])].sort()).toEqual(['awbNumber', 'token', 'voidedAt'])
    expect(recorder.params(read.where)).toContain(SHIPMENT_ROW_ID)
  })
})

describe('the bytes', () => {
  it('answers the PDF as an attachment, uncached, from the key the token names', async () => {
    const res = await getLabel()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="label-${AWB}.pdf"`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)

    expect(storage.getFile).toHaveBeenCalledTimes(1)
    expect(storage.getFile).toHaveBeenCalledWith(`fulfilment/labels/${TOKEN}.pdf`)
  })

  it('names the file by the shipment when the AWB is missing or unsafe for a header', async () => {
    for (const awbNumber of [null, 'a"b', 'x y']) {
      recorder.reset()
      recorder.queueRows({ 'select:order_shipments': [[labelRow({ awbNumber })]] })
      const res = await getLabel()
      expect(res.status, JSON.stringify(awbNumber)).toBe(200)
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="label-${SHIPMENT_ROW_ID.slice(0, 8)}.pdf"`
      )
    }
  })

  it('lets nothing about the object out: no token, no key, no URL in the headers', async () => {
    const res = await getLabel()
    const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
    expect(headers).not.toContain(TOKEN)
    expect(headers).not.toContain('fulfilment/labels')
    expect(headers).not.toContain('https://')
    expect(headers).not.toContain('X-Amz-Signature')
  })

  it('500 with a fixed string, and no code, when storage has no bytes for a row that claims a label', async () => {
    storage.getFile.mockResolvedValue(null)
    const res = await getLabel()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to read the label' })
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('500 with the same fixed string when the read itself throws', async () => {
    recorder.reset()
    recorder.failNext('select:order_shipments')
    const res = await getLabel()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to read the label' })
    expect(storage.getFile).not.toHaveBeenCalled()
  })
})
