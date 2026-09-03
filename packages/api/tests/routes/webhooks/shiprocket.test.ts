/**
 * The Shiprocket webhook receiver (#732): verify, then look up, then accept.
 *
 * An unverified webhook is an open endpoint that lets anyone move any order
 * to delivered, so the ORDER of this route is the whole ticket: the key is
 * checked before the body is parsed, the body is parsed before the database
 * is touched, and the payload's own claims about which order it is are
 * checked against the row the AWB maps to before anything is applied.
 *
 * What is applied is #733's — the status mapping and the notifications. This
 * file drives the seam (`applyStatusPush`) and asserts when it is and is not
 * reached; it does not assert what it does.
 *
 * @see packages/api/src/routes/webhooks/shiprocket.ts
 * @see packages/api/src/services/shiprocket-webhook.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
);

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  connected: true,
}));

const seam = vi.hoisted(() => ({
  applyStatusPush: vi.fn(),
}));

vi.mock('../../../src/database', () => ({ db: recorder.db }));
vi.mock('../../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}));
vi.mock('../../../src/lib/redis', () => ({
  redis: { set: redisMock.set, del: redisMock.del },
  isRedisConnected: () => redisMock.connected,
}));
vi.mock('../../../src/services/shiprocket-webhook', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/services/shiprocket-webhook')>();
  return { ...actual, applyStatusPush: seam.applyStatusPush };
});

import { orderShipments } from '../../../src/database/schema/shipping';
import { courierOrderReference, SHIPROCKET_ENV_VARS } from '../../../src/services/shiprocket';
import {
  SHIPROCKET_WEBHOOK_SECRET_VAR,
  WEBHOOK_EVENT_TTL_SECONDS,
  webhookKeyMatches,
  parseStatusPush,
  statusPushEventId,
} from '../../../src/services/shiprocket-webhook';
import { shiprocketWebhookApp } from '../../../src/routes/webhooks/shiprocket';

// ============================================================================
// Fixtures
// ============================================================================

const SECRET = 'whsec_9f7b3ce7a49b49ada1fdfbfc4dea8038';
const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const ORDER_NUMBER = 'CA-2026-000412';
const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31';
const AWB = '141123221084922';
const SR_ORDER_ID = '812345678';

/** The row the AWB maps to, in the route's own projection. */
function shipmentRow(over: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ROW_ID,
    orderId: ORDER_ID,
    externalOrderId: SR_ORDER_ID,
    orderNumber: ORDER_NUMBER,
    ...over,
  };
}

/** A push as Shiprocket documents it, trimmed to what is read plus noise. */
function push(over: Record<string, unknown> = {}) {
  return {
    awb: AWB,
    current_status: 'DELIVERED',
    current_status_id: 7,
    shipment_status: 'DELIVERED',
    shipment_status_id: 7,
    current_timestamp: '2026-09-04 10:00:00',
    order_id: courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID),
    sr_order_id: Number(SR_ORDER_ID),
    courier_name: 'Delhivery Surface',
    etd: '2026-09-04',
    scans: [{ date: '2026-09-04 09:55:00', activity: 'Delivered', location: 'Mumbai' }],
    is_return: 0,
    ...over,
  };
}

async function post(body: unknown, headers: Record<string, string> = { 'x-api-key': SECRET }) {
  return shiprocketWebhookApp.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function loggedText(): string {
  return JSON.stringify([
    ...loggerMock.error.mock.calls,
    ...loggerMock.warn.mock.calls,
    ...loggerMock.info.mock.calls,
    ...loggerMock.debug.mock.calls,
  ]);
}

beforeEach(() => {
  recorder.reset();
  vi.clearAllMocks();
  redisMock.connected = true;
  redisMock.set.mockResolvedValue('OK');
  redisMock.del.mockResolvedValue(1);
  seam.applyStatusPush.mockResolvedValue({ applied: true });
  process.env.SHIPROCKET_WEBHOOK_SECRET = SECRET;
  recorder.queueRows({ 'select:order_shipments': [[shipmentRow()]] });
});

afterEach(() => {
  delete process.env.SHIPROCKET_WEBHOOK_SECRET;
});

// ============================================================================
// Verification — before parsing, before the database
// ============================================================================

describe('verification', () => {
  it('rejects a missing key with 401, touches nothing, and logs nothing of the payload', async () => {
    const res = await post(push({ order_id: 'SECRET-SENTINEL-ORDER' }), {});

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(recorder.queries).toEqual([]);
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain('SECRET-SENTINEL-ORDER');
    expect(loggedText()).not.toContain(AWB);
  });

  it('rejects a wrong key of the same length with 401 and no detail', async () => {
    const wrong = SECRET.slice(0, -1) + (SECRET.endsWith('8') ? '9' : '8');

    const res = await post(push(), { 'x-api-key': wrong });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(recorder.queries).toEqual([]);
  });

  it('rejects a key of a different length without throwing', async () => {
    const res = await post(push(), { 'x-api-key': 'short' });
    expect(res.status).toBe(401);
  });

  it('refuses with 503 naming the variable when no secret is configured, even to an empty key', async () => {
    delete process.env.SHIPROCKET_WEBHOOK_SECRET;

    const res = await post(push(), { 'x-api-key': '' });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('SHIPROCKET_WEBHOOK_NOT_CONFIGURED');
    expect(body.error).toContain(SHIPROCKET_WEBHOOK_SECRET_VAR);
    expect(recorder.queries).toEqual([]);
  });

  it('treats a whitespace-only secret as unset', async () => {
    process.env.SHIPROCKET_WEBHOOK_SECRET = '   ';
    const res = await post(push(), { 'x-api-key': '   ' });
    expect(res.status).toBe(503);
  });

  it('the variable is in SHIPROCKET_ENV_VARS, so .env.example is held to it', () => {
    expect(SHIPROCKET_ENV_VARS).toContain(SHIPROCKET_WEBHOOK_SECRET_VAR);
    expect(SHIPROCKET_WEBHOOK_SECRET_VAR).toBe('SHIPROCKET_WEBHOOK_SECRET');
  });

  describe('webhookKeyMatches', () => {
    it('is true for the secret and false for anything else', () => {
      expect(webhookKeyMatches(SECRET, SECRET)).toBe(true);
      expect(webhookKeyMatches(SECRET.toUpperCase(), SECRET)).toBe(false);
      expect(webhookKeyMatches(`${SECRET} `, SECRET)).toBe(false);
      expect(webhookKeyMatches(undefined, SECRET)).toBe(false);
      expect(webhookKeyMatches('', SECRET)).toBe(false);
    });

    it('compares digests of equal length, so a length mismatch neither throws nor short-circuits', () => {
      // `timingSafeEqual` throws on buffers of different length, and a guard
      // that returned early on length would leak the secret's length. Both
      // sides are hashed first, so the comparison is always over 32 bytes.
      expect(() => webhookKeyMatches('x', SECRET)).not.toThrow();
      expect(webhookKeyMatches('x', SECRET)).toBe(false);
    });
  });
});

// ============================================================================
// The payload — untrusted, including the fields that say which order it is
// ============================================================================

describe('the payload', () => {
  it('accepts a valid push, looks the row up by OUR awb column, and hands the seam the row it found', async () => {
    const res = await post(push());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, applied: true, shipmentId: SHIPMENT_ROW_ID });

    const read = recorder.selects(orderShipments)[0];
    expect(read, 'the row was never read').toBeDefined();
    const { sql, params } = recorder.render(read!.where);
    expect(sql).toContain('"awb_number" = $');
    expect(sql).toContain('"voided_at" is null');
    expect(params).toContain(AWB);

    expect(seam.applyStatusPush).toHaveBeenCalledTimes(1);
    expect(seam.applyStatusPush).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: SHIPMENT_ROW_ID,
        orderId: ORDER_ID,
        awb: AWB,
        status: 'DELIVERED',
        statusId: 7,
        at: '2026-09-04 10:00:00',
        courierName: 'Delhivery Surface',
      }),
      // The request context, so the audit rows the apply step writes carry
      // the route's method and path.
      expect.objectContaining({ req: expect.anything() })
    );
  });

  it('400 on a body that is not JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect(recorder.queries).toEqual([]);
  });

  it('400 on JSON with no awb or no status, before the database', async () => {
    expect((await post(push({ awb: '' }))).status).toBe(400);
    expect((await post(push({ current_status: undefined }))).status).toBe(400);
    expect(recorder.queries).toEqual([]);
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
  });

  it('an AWB we do not hold is acknowledged (so Shiprocket stops retrying) and nothing is applied', async () => {
    recorder.queueRows({ 'select:order_shipments': [[]] });

    const res = await post(push());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, applied: false, reason: 'unknown_awb' });
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('refuses a push whose sr_order_id is not the order this AWB belongs to', async () => {
    const res = await post(push({ sr_order_id: 999888777 }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'SHIPROCKET_WEBHOOK_MISMATCH' });
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(recorder.survivors('update', orderShipments)).toEqual([]);
  });

  it('refuses a push whose order_id reference names a different shipment of the same order', async () => {
    const otherRow = 'c0ffee00-1111-4000-8000-000000000009';
    const res = await post(push({ order_id: courierOrderReference(ORDER_NUMBER, otherRow) }));

    expect(res.status).toBe(409);
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
  });

  it('refuses a push whose order_id reference names a different order number', async () => {
    const res = await post(push({ order_id: courierOrderReference('CA-2026-000999', SHIPMENT_ROW_ID) }));

    expect(res.status).toBe(409);
    expect(seam.applyStatusPush).not.toHaveBeenCalled();
  });

  it('the control: a push naming no order at all is accepted on the AWB alone', async () => {
    const res = await post(push({ order_id: undefined, sr_order_id: undefined }));

    expect(res.status).toBe(200);
    expect(seam.applyStatusPush).toHaveBeenCalledTimes(1);
  });

  it('never logs the payload’s free text', async () => {
    await post(push({ scans: [{ activity: 'Delivered to SENTINEL-PERSON at SENTINEL-STREET' }] }));

    expect(loggedText()).not.toContain('SENTINEL-PERSON');
    expect(loggedText()).not.toContain('SENTINEL-STREET');
  });

  describe('parseStatusPush', () => {
    it('reads the documented fields and drops everything else', () => {
      const parsed = parseStatusPush(push());
      expect(parsed).toEqual({
        awb: AWB,
        status: 'DELIVERED',
        statusId: 7,
        srOrderId: SR_ORDER_ID,
        reference: courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID),
        at: '2026-09-04 10:00:00',
        courierName: 'Delhivery Surface',
      });
    });

    it('takes sr_order_id as a string or a number, and a missing id as null', () => {
      expect(parseStatusPush(push({ sr_order_id: '812345678' }))?.srOrderId).toBe(SR_ORDER_ID);
      expect(parseStatusPush(push({ sr_order_id: undefined }))?.srOrderId).toBeNull();
      expect(parseStatusPush(push({ current_status_id: undefined }))?.statusId).toBeNull();
    });

    it('is null for anything that is not a push', () => {
      expect(parseStatusPush(null)).toBeNull();
      expect(parseStatusPush('DELIVERED')).toBeNull();
      expect(parseStatusPush({ current_status: 'DELIVERED' })).toBeNull();
      expect(parseStatusPush({ awb: AWB })).toBeNull();
    });
  });
});

// ============================================================================
// Replays — the same event twice applies once
// ============================================================================

describe('replays', () => {
  it('applies a first-seen event and acknowledges a replay without applying it', async () => {
    redisMock.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    recorder.queueRows({ 'select:order_shipments': [[shipmentRow()], [shipmentRow()]] });

    const first = await post(push());
    const second = await post(push());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ received: true, applied: false, duplicate: true });
    expect(seam.applyStatusPush).toHaveBeenCalledTimes(1);
  });

  it('marks the event with SET NX and a TTL, keyed on the event and not the order', async () => {
    await post(push());

    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const [key, value, ex, ttl, nx] = redisMock.set.mock.calls[0] as [string, string, string, number, string];
    expect(key).toBe(`webhook:shiprocket:${statusPushEventId(parseStatusPush(push())!)}`);
    expect(value).toBe('1');
    expect(ex).toBe('EX');
    expect(ttl).toBe(WEBHOOK_EVENT_TTL_SECONDS);
    expect(nx).toBe('NX');
    expect(key).not.toContain(ORDER_NUMBER);
    expect(key).not.toContain(ORDER_ID);
  });

  it('releases the mark when applying fails, so the retry is not deduplicated into silence', async () => {
    seam.applyStatusPush.mockRejectedValueOnce(new Error('deadlock detected'));

    const res = await post(push());

    expect(res.status).toBe(500);
    expect(redisMock.del).toHaveBeenCalledTimes(1);
    expect(redisMock.del.mock.calls[0]![0]).toBe(redisMock.set.mock.calls[0]![0]);
  });

  it('with Redis down, applies anyway — at-least-once beats never — and says so', async () => {
    redisMock.connected = false;

    const res = await post(push());

    expect(res.status).toBe(200);
    expect(seam.applyStatusPush).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  describe('statusPushEventId', () => {
    it('is stable for one event and different for another status or time', () => {
      const base = parseStatusPush(push())!;
      expect(statusPushEventId(base)).toBe(statusPushEventId(parseStatusPush(push())!));
      expect(statusPushEventId(base)).not.toBe(
        statusPushEventId(parseStatusPush(push({ current_status: 'RTO INITIATED', current_status_id: 9 }))!)
      );
      expect(statusPushEventId(base)).not.toBe(
        statusPushEventId(parseStatusPush(push({ current_timestamp: '2026-09-04 11:00:00' }))!)
      );
      expect(statusPushEventId(base)).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
