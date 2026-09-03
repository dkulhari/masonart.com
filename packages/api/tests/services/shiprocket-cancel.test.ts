/**
 * Cancelling a shipment with the courier (#731).
 *
 * The write that unmints. It is not decided by `COURIER_WRITE_CLAUSES`,
 * because the question those tables keep in order — "was something minted,
 * and is it safe to ask again?" — inverts here: asking a courier to cancel
 * something already cancelled is the goal already met, and their "already
 * cancelled" is read as SUCCESS. What still matters is the direction of doubt:
 * a cancel that did not ANSWER may or may not have happened, and the caller
 * must not mark a label void on a guess — so a non-answer is the unknown
 * outcome, and a refusal is its own code.
 *
 * Nothing in this file reaches apiv2.shiprocket.in: `fetch` is stubbed and
 * the base URL is on the reserved `.invalid` host, as the sibling suites do.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}));

import {
  cancelCourierShipment,
  SHIPROCKET_REFUSAL_STATUS,
  ShiprocketCancelRefusedError,
  ShiprocketError,
  ShiprocketWriteOutcomeUnknownError,
  resetShiprocketAuthCacheForTests,
} from '../../src/services/shiprocket';

const AWB = '141123221084922';
const EVERY_URL: string[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function authResponse() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60 })
  ).toString('base64url');
  return { ok: true, status: 200, json: async () => ({ token: `${header}.${payload}.sig` }) } as unknown as Response;
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Promise<Response>) {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    EVERY_URL.push(String(url));
    if (String(url).includes('/auth/login')) return authResponse();
    return handler(String(url), init);
  });
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(body) }) as unknown as Response;

const callsTo = (fragment: string) => fetchMock.mock.calls.filter((c) => String(c[0]).includes(fragment));

async function failureOf(run: () => Promise<unknown>): Promise<Error> {
  const error = await run()
    .then(() => null)
    .catch((e: Error) => e);
  expect(error, 'the call did not fail').not.toBeNull();
  return error!;
}

beforeEach(() => {
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  resetShiprocketAuthCacheForTests();
  process.env.SHIPROCKET_EMAIL = 'api-user@example.test';
  process.env.SHIPROCKET_PASSWORD = 'irrelevant-here';
  process.env.SHIPROCKET_BASE_URL = 'https://shiprocket.invalid/v1/external';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SHIPROCKET_EMAIL;
  delete process.env.SHIPROCKET_PASSWORD;
  delete process.env.SHIPROCKET_BASE_URL;
});

describe('cancelCourierShipment', () => {
  it('posts the AWB to orders/cancel/shipment/awbs with the bearer token, and reports cancelled', async () => {
    stubFetch(async () => jsonResponse(200, { message: 'Shipment(s) cancelled successfully' }));

    const result = await cancelCourierShipment({ awb: AWB });

    expect(result).toEqual({ cancelled: true, alreadyCancelled: false });
    const [url, init] = callsTo('orders/cancel/shipment/awbs')[0]!;
    expect(String(url)).toContain('/orders/cancel/shipment/awbs');
    expect((init as RequestInit).method).toBe('POST');
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toMatch(/^Bearer .+/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ awbs: [AWB] });
  });

  it('reads "already cancelled" as the goal already met, not as a refusal', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Shipment is already cancelled' }));

    const result = await cancelCourierShipment({ awb: AWB });

    expect(result).toEqual({ cancelled: true, alreadyCancelled: true });
  });

  it('a refusal is SHIPROCKET_CANCEL_REFUSED, 422, and nothing was voided by this call', async () => {
    stubFetch(async () => jsonResponse(400, { message: 'Shipment already picked up, cannot be cancelled' }));

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect(error).toBeInstanceOf(ShiprocketCancelRefusedError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_CANCEL_REFUSED');
    expect(SHIPROCKET_REFUSAL_STATUS.SHIPROCKET_CANCEL_REFUSED).toBe(422);
    expect(error.message).toContain(AWB);
  });

  it('a request that never answers is an unknown outcome: the label must NOT be marked void on it', async () => {
    stubFetch(async () => {
      throw new Error('socket hang up');
    });

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error.message).toContain('dashboard');
  });

  it('a 5xx is an unknown outcome too', async () => {
    stubFetch(async () => jsonResponse(502, { message: 'Bad Gateway' }));

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('an HTTP 200 that is not our body is an unknown outcome, not a cancellation', async () => {
    stubFetch(
      async () =>
        ({ ok: true, status: 200, text: async () => '<html>502</html>' }) as unknown as Response
    );

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('a 200 whose body says the cancellation did not happen is a refusal', async () => {
    stubFetch(async () => jsonResponse(200, { status: 0, message: 'Cancellation failed for AWB' }));

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect(error).toBeInstanceOf(ShiprocketCancelRefusedError);
  });

  it('a dead token drops the cache and refuses with the credential code', async () => {
    stubFetch(async () => jsonResponse(401, { message: 'Unauthorized' }));

    const error = await failureOf(() => cancelCourierShipment({ awb: AWB }));

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
  });

  it('refuses a blank AWB before the network', async () => {
    stubFetch(async () => jsonResponse(200, { message: 'ok' }));

    const error = await failureOf(() => cancelCourierShipment({ awb: '  ' }));

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_SHIPMENT_ID_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('addressed only the reserved .invalid host', () => {
    expect(EVERY_URL.filter((u) => u.includes('apiv2.shiprocket.in'))).toEqual([]);
    expect(EVERY_URL.some((u) => u.includes('orders/cancel/shipment/awbs'))).toBe(true);
  });
});
