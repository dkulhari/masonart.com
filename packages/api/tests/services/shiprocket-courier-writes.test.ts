/**
 * The two calls that write to a real courier (#726).
 *
 * `createCourierOrder` puts a real order in Shiprocket's dashboard and
 * `assignAwb` mints a real waybill a courier expects to collect against. Every
 * other Shiprocket call so far — login, serviceability — is readable and
 * repeatable; these two are neither. A duplicate here is not a failed
 * assertion, it is a parcel a courier turns up for twice and an invoice.
 *
 * ## Nothing in this file may reach apiv2.shiprocket.in
 *
 * Three mechanisms, deliberately overlapping, because one of them being
 * silently uninstalled is exactly the accident that would spend money:
 *
 * 1. `fetch` is replaced with a `vi.fn()` in `beforeEach`, the same stubbing
 *    setup `shiprocket-serviceability.test.ts` uses.
 * 2. `SHIPROCKET_BASE_URL` is pointed at `https://shiprocket.invalid/...`.
 *    `.invalid` is reserved by RFC 2606 and never resolves, so a request that
 *    escaped the stub would fail DNS rather than arrive.
 * 3. `EVERY_URL` accumulates every URL the stub is handed across the WHOLE
 *    file, and the last describe block asserts none of them names the live
 *    host. On its own that assertion passes on an EMPTY list, so it is paired
 *    with a test that drives the client itself and then reads the recorder —
 *    which is the check that catches mechanism 1 or 2 having been quietly
 *    removed, not the recorder.
 *
 * ## Why these fixtures are transcribed, not measured
 *
 * `shiprocket-serviceability.test.ts` opens by quoting a live probe of the real
 * account, and that was the right thing to do there. It is the wrong thing here:
 * the probe that would produce a measured `createOrder` fixture IS the write
 * this ticket exists to keep out of the test suite. So these bodies are
 * transcribed from Shiprocket's documented response shape and the parser is
 * written to be sceptical of them — every field is checked before it is used,
 * and an unreadable success is treated as "the order exists and we lost its
 * id", never as a failure that may be retried.
 *
 * ## The three properties the ticket names
 *
 * - a successful create returns both ids (`external_order_id`, `external_shipment_id`);
 * - a create that times out and is retried does NOT make a second order;
 * - an AWB assignment that comes back with a DIFFERENT courier than the one
 *   requested yields the one that came back.
 *
 * ## Why the logger is mocked and the database is not
 *
 * The client has no database import at all — the idempotency lookup is passed
 * in — so there is nothing to mock on that side. The LOGGER is mocked because
 * two properties of this client are about the log line rather than about the
 * return value: that a courier's refusal text reaches an operator (a parcel
 * with no diagnosable cause is a parcel nobody can unstick), and that the
 * customer's name, street, phone and email do NOT travel with it. `pino`'s
 * `redact` list is a list of literal KEY PATHS (`lib/logger.paths.ts`) and
 * matches nothing inside a string value, so "the logger will scrub it" is not
 * a thing this module gets to assume.
 *
 * The scrubbing itself is tested where it lives —
 * `tests/lib/payload-echo-scrub.test.ts` drives every pass directly, with a
 * planted input each must catch and a paired input each must leave alone. What
 * is asserted HERE is the part only a courier write can show: that the scrub
 * is applied at all, to both writes, against the payload that was actually
 * sent rather than a second copy of it.
 *
 * @see packages/api/src/services/shiprocket.ts
 * @see plan/tracker-data/tickets/ticket-0726-shiprocket-client-create-the-o.yaml
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Hoisted above the module import, because `vi.mock`'s factory runs before it.
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

import * as shiprocket from '../../src/services/shiprocket';
import {
  createCourierOrder,
  assignAwb,
  generateLabel,
  schedulePickup,
  cancelCourierShipment,
  checkServiceability,
  selectCourierFor,
  courierOrderReference,
  orderedClauses,
  COURIER_ADHOC_PAYLOAD_KEYS,
  COURIER_WRITE_CLAUSES,
  EXTERNAL_ID_MAX_LENGTH,
  SHIPROCKET_REFUSAL_CODES,
  SHIPROCKET_REFUSAL_STATUS,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  ShiprocketAwbRefusedError,
  ShiprocketError,
  ShiprocketLabelRefusedError,
  ShiprocketOrderTotalMismatchError,
  ShiprocketPickupLocationError,
  ShiprocketWriteOutcomeUnknownError,
  resetShiprocketAuthCacheForTests,
  type CreateCourierOrderInput,
  type ExistingCourierOrder,
  type ShiprocketRefusalCode,
} from '../../src/services/shiprocket';

// ============================================================================
// Fixtures — shaped like the live responses, trimmed to the fields we read
// ============================================================================

/** A uuid-shaped row id. Only its first 8 characters ever leave the process. */
const SHIPMENT_ROW_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31';

/**
 * An order number this store actually issues.
 *
 * It was `CHB-2026-000412`, a prefix `lib/order-number.ts` has never issued —
 * so the reference builder, whose whole job is to make one token out of an
 * order number and a row id, was never once exercised against a shape the shop
 * produces. `ORDER_NUMBER_PREFIX` is `CA` (legacy `MA`), and the coupling is
 * asserted rather than remembered: see the describe block on the reference.
 */
const ORDER_NUMBER = 'CA-2026-000412';
const PICKUP_NICKNAME = 'warehouse';

/**
 * What Shiprocket answers a successful `orders/create/adhoc` with.
 *
 * Two visibly different numbers, deliberately. A fixture that used one value
 * for both would pass a client that wrote the order id into
 * `external_shipment_id` — and that client would then hand the wrong id to
 * `assignAwb` and mint a waybill against somebody else's shipment.
 */
const SR_ORDER_ID = 812345678;
const SR_SHIPMENT_ID = 912345678;

/**
 * The courier we ASK for, and the different one the fixture answers with.
 *
 * Different on purpose and in both fields — id AND name. This is the ticket's
 * third property, and a fixture that echoed the request back would let a client
 * that stores the request pass every assertion in this file.
 */
const REQUESTED_COURIER_ID = 1;
const REQUESTED_COURIER_NAME = 'Blue Dart Air';
const ASSIGNED_COURIER_ID = 51;
const ASSIGNED_COURIER_NAME = 'Delhivery Surface';
const ASSIGNED_AWB = '141123221084922';

/**
 * The money on the fixture order, in paise, and the identity that binds it.
 *
 * `schema/orders.ts:229-247` states the store's own arithmetic:
 *
 *     subtotal - promotionDiscount - couponDiscount + shipping + tax = total
 *     total - giftCardAmount = what is still owed
 *
 * The lines here are 2 x 1499 + 1 x 899 = 3897. With 49 of shipping and 300 of
 * coupon, the customer owes 3646 — and on a COD parcel that is the number a
 * courier collects at somebody's door. The gap between 3897 and 3646 is 251
 * rupees of overcharge if the client sends the line sum as the collectible,
 * which is exactly why every term is a named field here rather than a total
 * the client derives for itself.
 */
const LINE_SUM_PAISE = 2 * 149900 + 89900;
const SHIPPING_PAISE = 4900;
const DISCOUNT_PAISE = 30000;
const AMOUNT_DUE_PAISE = LINE_SUM_PAISE + SHIPPING_PAISE - DISCOUNT_PAISE;

/**
 * A complete, valid input. Tests override only the field they are about, so a
 * new required field breaks every test at once rather than silently defaulting.
 */
function input(over: Partial<CreateCourierOrderInput> = {}): CreateCourierOrderInput {
  return {
    shipmentRowId: SHIPMENT_ROW_ID,
    orderNumber: ORDER_NUMBER,
    orderDate: new Date('2026-08-31T09:15:00.000Z'),
    pickupLocation: PICKUP_NICKNAME,
    cod: false,
    consignee: {
      name: 'Ananya Iyer',
      addressLine1: '12 Turner Road',
      addressLine2: 'Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      country: 'India',
      phone: '9820011223',
      email: 'ananya@example.test',
    },
    items: [
      { name: 'A2 Poster - Kerala Backwaters', sku: 'PST-A2-KER', units: 2, sellingPricePaise: 149900 },
      { name: 'Oak Frame A2', sku: 'FRM-A2-OAK', units: 1, sellingPricePaise: 89900 },
    ],
    parcel: { weightGrams: 850, lengthCm: 40, widthCm: 30, heightCm: 6 },
    charges: {
      shippingPaise: SHIPPING_PAISE,
      discountPaise: DISCOUNT_PAISE,
      taxPaise: 0,
      transactionPaise: 0,
      giftwrapPaise: 0,
      amountDuePaise: AMOUNT_DUE_PAISE,
    },
    ...over,
  };
}

/**
 * A created order.
 *
 * Note the empty `awb_code` / `courier_name`: creating the order does NOT mint
 * a waybill, which is the whole reason `assignAwb` is a second call and a
 * second real write. Bodies are served through `text()` rather than `json()`
 * because the client reads the body once, as text, and parses it itself — a
 * fixture that only offered `json()` would pass a client that read the body
 * twice and threw on the second read.
 */
function createdResponse() {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        order_id: SR_ORDER_ID,
        shipment_id: SR_SHIPMENT_ID,
        status: 'NEW',
        status_code: 1,
        onboarding_completed_now: 0,
        awb_code: '',
        courier_company_id: '',
        courier_name: '',
      }),
  } as unknown as Response;
}

function awbAssignedResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        awb_assign_status: 1,
        response: {
          data: {
            courier_company_id: ASSIGNED_COURIER_ID,
            courier_name: ASSIGNED_COURIER_NAME,
            awb_code: ASSIGNED_AWB,
            shipment_id: SR_SHIPMENT_ID,
            order_id: SR_ORDER_ID,
            ...over,
          },
        },
      }),
  } as unknown as Response;
}

/**
 * The same assignment, with the fields at the ROOT rather than inside
 * `response.data`.
 *
 * Not a hypothetical: this module already knows the endpoint answers
 * `awb_assign_error` unwrapped — `REFUSAL_MESSAGE_PATHS` carries that path and
 * says so. The success half had no such fallback, so a client that read only
 * the wrapped envelope classified this — a body naming a REAL waybill — as
 * "no waybill exists, so it is safe to ask again", which is an instruction to
 * mint a second one against a shipment that already has one.
 */
function unwrappedAwbResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        awb_assign_status: 1,
        courier_company_id: ASSIGNED_COURIER_ID,
        courier_name: ASSIGNED_COURIER_NAME,
        awb_code: ASSIGNED_AWB,
        shipment_id: SR_SHIPMENT_ID,
        ...over,
      }),
  } as unknown as Response;
}

/**
 * HTTP 200 carrying something that is not our body at all.
 *
 * What an edge proxy or a WAF answers with when it decides to interpose, and
 * what a truncated response looks like from here. The status line says the
 * request was accepted; the body says nothing we can read. Whether a waybill
 * was minted is simply not knowable from this, which is the whole point.
 */
function unreadable200() {
  return {
    ok: true,
    status: 200,
    text: async () => '<html><body>502 Bad Gateway</body></html>',
  } as unknown as Response;
}

function refusedResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * A generated label (#727), on a `.invalid` file host so the recorder stays
 * clean. The label's own suite is `shiprocket-label-pickup.test.ts`; it is
 * here because the clause account and the refusal vocabulary are total over
 * the module, and the label's clauses have to be enrolled where the account
 * lives.
 */
function labelGeneratedResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        label_created: 1,
        label_url: 'https://labels.shiprocket.invalid/label/912345678.pdf',
        response: 'Label generated successfully',
        not_created: [],
        ...over,
      }),
  } as unknown as Response;
}

/**
 * Headers arrived; the body never finished.
 *
 * The exact shape `AbortSignal.timeout` produces when it fires while the body
 * is still streaming — the response object exists and `text()` rejects. Real
 * because it is the same signal that bounds the request: a create whose status
 * line lands at 29s and whose body is still arriving at 30s ends here, and the
 * order EXISTS in every one of those cases.
 */
function bodyNeverArrives(status: number, ok: boolean) {
  return {
    ok,
    status,
    text: async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    },
  } as unknown as Response;
}

/** Everything the logger was handed, flattened, so a leak is one `toContain`. */
function loggedText(): string {
  return JSON.stringify(loggerMock.error.mock.calls);
}

/**
 * Only the part of the log line that is Shiprocket's own sentence.
 *
 * `loggedText()` is the whole call, which deliberately carries OUR context —
 * the reference, the shipment id, the HTTP status. Those are ours to log and
 * are the point of logging at all. The scrubbing property is about the
 * courier's words: what we chose to put in the line is not a leak, what they
 * quoted back at us is the thing that can be.
 */
function loggedMessages(): string {
  return loggerMock.error.mock.calls
    .map((call) => (call[0] as { shiprocketMessage?: unknown } | undefined)?.shiprocketMessage)
    .filter((message): message is string => typeof message === 'string')
    .join(' || ');
}

/** Every string leaf of a value, however deeply nested. */
function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap(stringLeaves);
  }
  return [];
}

function authResponse() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60 })
  ).toString('base64url');
  return {
    ok: true,
    status: 200,
    json: async () => ({ token: `${header}.${payload}.sig` }),
  } as unknown as Response;
}

/**
 * Every URL the stub has been handed since the file started.
 *
 * Deliberately NOT reset in `beforeEach`: its whole job is to be read once, at
 * the end, by the assertion that the live host was never addressed.
 */
const EVERY_URL: string[] = [];

let fetchMock: ReturnType<typeof vi.fn>;

/** Login always answers; everything else is the test's to decide. */
function stubFetch(handler: (url: string) => Promise<Response>) {
  fetchMock.mockImplementation(async (url: unknown) => {
    EVERY_URL.push(String(url));
    if (String(url).includes('/auth/login')) return authResponse();
    return handler(String(url));
  });
}

/**
 * The lookup every call must be given.
 *
 * A `vi.fn` rather than a bare arrow so a test can assert WHICH shipment was
 * asked about: a client that looked up a constant, or the order number, would
 * short-circuit correctly in these tests and cross-talk between two shipments
 * of the same order in production.
 */
function lookupReturning(existing: ExistingCourierOrder | null) {
  return vi.fn(async (_shipmentRowId: string) => existing);
}

/**
 * The JSON body of the nth request whose URL contains `fragment`.
 *
 * Read off `fetch.mock.calls`, so every payload assertion is about what was
 * actually serialised and handed to the network layer — not about the input
 * object the test built, which would be a test of the fixture.
 */
function bodyOf(fragment: string, nth = 0): Record<string, unknown> {
  const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes(fragment));
  const init = calls[nth]?.[1] as RequestInit | undefined;
  expect(init, `no request ${nth} to ${fragment}`).toBeDefined();
  return JSON.parse(String(init!.body)) as Record<string, unknown>;
}

/**
 * Every request that would have made a real order.
 *
 * Its LENGTH is the idempotency property. "Did it return the right ids" is
 * satisfiable by a client that creates a duplicate and then returns the new
 * one's ids; only the call count can tell those apart.
 */
const createCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('orders/create/adhoc'));

/**
 * Every login the module issued, across the whole test.
 *
 * Its length is the only way to see the token cache from out here. "Did the
 * call succeed" is satisfiable by a client that logs in on every request and
 * by one that never logs in again after the first; only the count separates a
 * cache that can be invalidated from one that cannot.
 */
const logins = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/login'));

beforeEach(() => {
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.info.mockReset();
  loggerMock.debug.mockReset();
  resetShiprocketAuthCacheForTests();
  process.env.SHIPROCKET_EMAIL = 'api-user@example.test';
  process.env.SHIPROCKET_PASSWORD = 'irrelevant-here';
  // Mechanism 2. `.invalid` is reserved and never resolves.
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

// ============================================================================
// createCourierOrder — the ids, and the payload that buys them
// ============================================================================

describe('createCourierOrder', () => {
  // Every test here passes a lookup that answers `null` — that is, a shipment
  // with no courier order yet, the ordinary first-dispatch case. The tests that
  // vary the lookup are in the idempotency block below.
  it('returns both ids Shiprocket answers with, as strings', async () => {
    stubFetch(async () => createdResponse());

    const result = await createCourierOrder(input(), lookupReturning(null));

    // Both columns are varchar, and both ids arrive as JSON numbers. Handing a
    // number to a varchar column is a driver coercion nobody asked for.
    expect(result).toEqual({
      externalOrderId: String(SR_ORDER_ID),
      externalShipmentId: String(SR_SHIPMENT_ID),
      created: true,
    });
  });

  it('posts to orders/create/adhoc with the bearer token', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    const [url, init] = createCalls()[0]!;
    expect(String(url)).toContain('/orders/create/adhoc');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
  });

  it('sends the pickup nickname exactly as the admin typed it', async () => {
    // Shiprocket matches the nickname EXACTLY and rejects a mismatch at
    // dispatch, long after whoever typed it has gone. Case is theirs to
    // decide, not ours to normalise: ours is lowercase `warehouse` today, and
    // a client that lowercased would break the first account that is not.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input({ pickupLocation: 'Primary Warehouse' }), lookupReturning(null));

    expect(bodyOf('orders/create/adhoc').pickup_location).toBe('Primary Warehouse');
  });

  it('trims the nickname, because a pasted trailing space is invisible and fatal', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input({ pickupLocation: '  warehouse \n' }), lookupReturning(null));

    expect(bodyOf('orders/create/adhoc').pickup_location).toBe('warehouse');
  });

  it('refuses BEFORE the network when the vendor has no pickup nickname', async () => {
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(input({ pickupLocation: null }), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketPickupLocationError);
    expect((error as ShiprocketPickupLocationError).code).toBe('SHIPROCKET_PICKUP_LOCATION_INVALID');
    // The remedy, not just the complaint: the reader has to know which screen
    // fixes it and that the value comes from Shiprocket's own dashboard.
    expect(error!.message).toMatch(/pickup location/i);
    expect(error!.message).toContain('shiprocket_pickup_location');
    // And nothing was spent finding out.
    expect(createCalls(), 'a refusable order still reached the courier').toHaveLength(0);
  });

  it('treats a blank nickname as no nickname', async () => {
    stubFetch(async () => createdResponse());

    await expect(
      createCourierOrder(input({ pickupLocation: '   ' }), lookupReturning(null))
    ).rejects.toBeInstanceOf(ShiprocketPickupLocationError);
    expect(createCalls()).toHaveLength(0);
  });

  it('names the nickname it sent when Shiprocket rejects the pickup location', async () => {
    // Classified, never echoed. Shiprocket's own sentence is written to their
    // dashboard user and can quote back whatever we posted, so it goes to the
    // logger; what the caller gets is our sentence naming OUR value.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Wrong Pickup location entered.', status_code: 422 })
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketPickupLocationError);
    expect(error!.message).toContain(PICKUP_NICKNAME);
    expect(error!.message).not.toContain('Wrong Pickup location entered');
  });

  it('does not leak Shiprocket’s refusal text for any other rejection', async () => {
    // Their 4xx bodies quote the payload back. The payload is a customer's
    // name, address and phone, so the body is a PII carrier and belongs in the
    // logger, not in a thrown message an admin screen may render.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Invalid phone for Ananya Iyer at 12 Turner Road' })
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error!.message).not.toContain('Ananya Iyer');
    expect(error!.message).not.toContain('12 Turner Road');
    expect(error!.message).toContain('422');
  });

  it('does not leak it into the LOG either — pino redacts key paths, not values', async () => {
    // The thrown message being clean is half the property and the easier half.
    // `lib/logger.paths.ts` is a list of literal key paths — cookie,
    // authorization, password, token, secret, otp, signature, cardNumber, cvv
    // — and `pino` matches paths, never substrings inside a value. So a
    // `shiprocketMessage` field carrying "Ananya Iyer at 12 Turner Road" is a
    // customer's name and street address in the aggregator, permanently.
    stubFetch(async () =>
      refusedResponse(422, {
        message:
          'Invalid phone for Ananya Iyer at 12 Turner Road, Bandra West, Mumbai 400050 ' +
          '(9820011223 / ananya@example.test)',
      })
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const logged = loggedText();
    for (const pii of [
      'Ananya Iyer',
      '12 Turner Road',
      'Bandra West',
      '400050',
      '9820011223',
      'ananya@example.test',
    ]) {
      expect(logged, `${pii} reached the log`).not.toContain(pii);
    }
  });

  it('keeps the part of their sentence that is diagnostic', async () => {
    // The positive control for the test above. Redacting the whole message
    // would also pass a "no PII in the log" assertion, and would leave an
    // operator staring at a byte count — which is the failure this scrubber
    // exists to avoid, not the one it exists to cause.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Invalid phone for Ananya Iyer at 12 Turner Road' })
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const logged = loggedText();
    expect(logged).toContain('Invalid phone for');
    // ...and it says WHICH field was standing there, so the operator knows
    // which one to go and fix.
    expect(logged).toContain('billing_customer_name');
  });

  it('scrubs every string it put on the wire, not a hand-kept list of them', async () => {
    // The echo list used to be a SECOND enumeration of the consignee, sitting
    // beside the payload builder and documented as "derived from the payload
    // rather than listed a second time". It was not derived: nothing bound the
    // two, so a field added to `CourierConsignee` and sent to the courier could
    // lose its scrubbing with the compiler silent and every test green.
    //
    // This test binds them. It reads the payload that ACTUALLY left the
    // process, then hands every string in it back through a refusal body and
    // asserts none of them survives into the log line. Add a consignee field
    // and a payload key — which the compiler forces you to do together, since
    // `AdhocPayload` is a Record over the key tuple — and this test starts
    // covering it without anyone remembering to enrol it.
    stubFetch(async () => createdResponse());
    await createCourierOrder(input(), lookupReturning(null));
    const sent = stringLeaves(bodyOf('orders/create/adhoc')).filter((v) => v.trim().length >= 3);

    // Non-vacuity: an empty list would make the loop below pass with the
    // scrubber deleted.
    expect(sent.length, 'nothing was read off the wire').toBeGreaterThan(10);
    expect(sent).toContain('Ananya Iyer');

    for (const value of sent) {
      loggerMock.error.mockReset();
      stubFetch(async () => refusedResponse(422, { message: `Rejected because of ${value}` }));
      await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

      expect(loggedMessages(), `${value} reached the log unscrubbed`).not.toContain(value);
    }
  });

  it('survives the whitespace a validator collapses on its way back', async () => {
    // Measured failure, not a hypothetical. A customer types a double space
    // into an address form; nothing in this module normalises it, so we send
    // `12  Turner Road`. Shiprocket refuses and quotes it back COLLAPSED — as
    // validators routinely do — and an exact substring replace finds no match.
    // No shape matches a street name either, so the customer's address reached
    // the aggregator through the one pass that is supposed to be the strong
    // one.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Invalid address: 12 Turner Road, Bandra West' })
    );

    await createCourierOrder(
      input({ consignee: { ...input().consignee, addressLine1: '12  Turner Road' } }),
      lookupReturning(null)
    ).catch(() => null);

    const said = loggedMessages();
    expect(said, 'the street address reached the log').not.toContain('12 Turner Road');
    expect(said).toContain('[billing_address]');
  });

  it('survives a value quoted back in PART', async () => {
    // The other half of the same hole, and the one no full-value replace can
    // close: a refusal that names the consignee by first name only. The
    // whole-value pass sees no match; the shape net sees no shape. A word we
    // ourselves put on the wire is the last thing left to key on.
    stubFetch(async () => refusedResponse(422, { message: 'Consignee Ananya is not deliverable' }));

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const said = loggedMessages();
    expect(said, "the customer's name reached the log").not.toContain('Ananya');
    expect(said).toContain('not deliverable');
  });

  it('survives a digit run quoted back with a separator pushed into it', async () => {
    // The hole the two passes above cannot cover between them, and it sits on
    // the value most likely to be re-formatted on its way back. A validator
    // that formats numbers quotes `9820011223` at us as `98200 11223`, and all
    // three passes miss it: the whole-value pass builds a pattern that
    // tolerates COLLAPSED whitespace and finds none to collapse; the word pass
    // keys on whole words of the value we sent, and that value is ONE word, so
    // `98200` and `11223` are not keys in its map; the shape net wants ten
    // contiguous digits. A customer's mobile number therefore reached the
    // aggregator, permanently, from the endpoint whose module header says that
    // is the failure it exists to prevent.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Invalid phone: 98200 11223 for consignee' })
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const said = loggedMessages();
    expect(said, "the customer's phone number reached the log").not.toContain('98200 11223');
    expect(said).toContain('[billing_phone]');
    // ...and it is still a sentence an operator can act on, which is the whole
    // reason this is a scrubber and not a `delete`.
    expect(said).toContain('Invalid phone');
  });

  it('survives a pincode re-punctuated the same way', async () => {
    // The same mechanism on a second value, kept separate because the three
    // passes fail it for slightly different reasons — the shape net's pincode
    // rule wants EXACTLY six contiguous digits — so a fix for the phone need
    // not be a fix for this.
    stubFetch(async () => refusedResponse(422, { message: 'Bad pincode 400 050 in address' }));

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const said = loggedMessages();
    expect(said, "the customer's pincode reached the log").not.toContain('400 050');
    expect(said).toContain('[billing_pincode]');
  });

  it('reads a refusal reason out of the field bag, not only the envelope sentence', async () => {
    // Shiprocket runs Laravel, and a Laravel 422 puts a generic sentence at
    // `message` and the actual complaint in `errors`. Reading the root
    // `message` alone logged "The given data was invalid." — four words that
    // name nothing — under a refusal whose own text says "the reason is in the
    // API logs".
    stubFetch(async () =>
      refusedResponse(422, {
        message: 'The given data was invalid.',
        errors: { billing_phone: ['The billing phone must be 10 digits.'] },
      })
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    // Still a definite refusal: this one IS a decision taken before anything
    // was created, and correcting the payload is the remedy.
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_ORDER_CREATE_REJECTED');
    expect(loggedMessages(), 'the only line that named a field was dropped').toContain(
      'must be 10 digits'
    );
  });

  it('scrubs the field bag exactly as it scrubs the sentence', async () => {
    // The bag is a second place their body quotes ours back from, so it is a
    // second PII carrier. Reading it without scrubbing it would trade one
    // defect for a worse one.
    stubFetch(async () =>
      refusedResponse(422, {
        message: 'The given data was invalid.',
        errors: { billing_address: ['12 Turner Road is not a deliverable address'] },
      })
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const said = loggedMessages();
    expect(said, 'the street address reached the log').not.toContain('12 Turner Road');
    expect(said).toContain('[billing_address]');
  });

  it('bounds the write with a timeout, so a hung socket is legible', async () => {
    // Nothing else in this file can see the signal, and without this
    // `WRITE_TIMEOUT_MS` could be deleted and every test would stay green —
    // leaving a create to hang until the platform edge kills it with a 502
    // that names neither the order nor the write that was in flight.
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    expect(timeout).toHaveBeenCalledWith(WRITE_TIMEOUT_MS);
    const [, init] = createCalls()[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it('bounds the LOGIN in front of the write, or the write bound bounds nothing', async () => {
    // `WRITE_TIMEOUT_MS` documents itself as "a bound on how long a dispatch
    // request may hold an admin's browser open". It was not one. The token is
    // resolved before the guarded write — correctly, so an auth failure is not
    // reported as a write whose outcome is unknown — and `login()` issued its
    // fetch with no signal at all, so a hung auth endpoint held the dispatch
    // open indefinitely and the write's own 30s never came into it.
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    const loginCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/login'));
    expect(loginCall, 'no login was issued').toBeDefined();
    expect(
      (loginCall![1] as RequestInit).signal,
      'the login that fronts every write is unbounded'
    ).toBeInstanceOf(AbortSignal);
    // Both bounds, named: the ceiling on a dispatch request is their sum, and
    // that is the number the constants have to be read as.
    expect(timeout).toHaveBeenCalledWith(READ_TIMEOUT_MS);
    expect(timeout).toHaveBeenCalledWith(WRITE_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it('a login that never answers is typed, and is not an unknown outcome', async () => {
    // Two properties in one, because they are the same mistake read from two
    // sides. A raw `DOMException` from an unbounded-then-bounded login carries
    // no `code`, so `SHIPROCKET_REFUSAL_STATUS` — whose stated job is to stop a
    // route improvising a 500 — did not cover the path every single call in
    // this module goes through first. And it must NOT be an unknown outcome:
    // nothing was sent to `orders/create/adhoc`, so sending an operator off to
    // reconcile a courier order that cannot exist is its own failure.
    fetchMock.mockImplementation(async (url: unknown) => {
      EVERY_URL.push(String(url));
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect(error).not.toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_UNREACHABLE');
    expect(createCalls(), 'a create was attempted without a token').toHaveLength(0);
  });

  it('refuses a parcel with no weight before spending a courier write', async () => {
    // The pickup nickname and the arithmetic both get the cost-nothing
    // treatment this function's own design statement promises; the parcel did
    // not. A courier quotes and bills on the parcel, so `weightGrams: 0` buys a
    // real label for a parcel that cannot exist and finds out at the courier.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input({ parcel: { weightGrams: 0, lengthCm: 40, widthCm: 30, heightCm: 6 } }),
      lookupReturning(null)
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_PARCEL_INVALID');
    // Names the field the caller has to fix, not "invalid parcel".
    expect(error!.message).toContain('weightGrams');
    expect(createCalls(), 'a weightless parcel reached the courier').toHaveLength(0);
  });

  it('names every bad measurement at once, and none of the good ones', async () => {
    // The paired control on both sides: a negative dimension is refused too,
    // the message lists all of them so the caller fixes the shipment once, and
    // a parcel whose measurements are merely SMALL still ships.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input({ parcel: { weightGrams: 850, lengthCm: -1, widthCm: 30, heightCm: 0 } }),
      lookupReturning(null)
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error!.message).toContain('lengthCm');
    expect(error!.message).toContain('heightCm');
    expect(error!.message).not.toContain('widthCm');

    const ok = await createCourierOrder(
      input({ parcel: { weightGrams: 1, lengthCm: 1, widthCm: 1, heightCm: 1 } }),
      lookupReturning(null)
    );
    expect(ok.created).toBe(true);
  });

  it('refuses a consignee with no pincode before spending a courier write', async () => {
    // Clause 0 of the module header says "everything refusable before a byte
    // is sent is refused there", and the consignee was the one input that did
    // not get that treatment: a blank pincode, phone or email was posted to a
    // real courier and the refusal learned from Shiprocket. The direction was
    // safe — a 4xx create is a definite refusal — but the clause was false,
    // and a clause a reader cannot rely on is worse than one that is missing.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input({ consignee: { ...input().consignee, pincode: '   ' } }),
      lookupReturning(null)
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_CONSIGNEE_INVALID');
    expect(error!.message).toContain('pincode');
    expect(createCalls(), 'an undeliverable consignee reached the courier').toHaveLength(0);
  });

  it('names every empty consignee field at once, and none of the values', async () => {
    // Two properties in one, and the second is the one that could go wrong
    // quietly: the message names the FIELDS so the caller fixes the address in
    // one pass, and it names none of the customer's actual values — this
    // sentence is rendered on an admin screen and copied into support
    // threads, which is exactly how a street address gets somewhere it was
    // never meant to be. Same rule as `logCourierAnswer`, one layer earlier.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input({ consignee: { ...input().consignee, phone: '', email: '  ', city: '' } }),
      lookupReturning(null)
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error!.message).toContain('phone');
    expect(error!.message).toContain('email');
    expect(error!.message).toContain('city');
    // ...and not the fields that were filled in, so it is a check and not a
    // blanket refusal.
    expect(error!.message).not.toContain('pincode');

    for (const value of stringLeaves(input().consignee)) {
      expect(error!.message, `${value} was quoted back into the refusal`).not.toContain(value);
    }
  });

  it('treats an addressLine2 nobody filled in as the ordinary thing it is', async () => {
    // The paired positive control. `addressLine2` is `string | null` on the
    // input type and blank on most Indian addresses; refusing it would refuse
    // most orders. Every other consignee field is required by the courier.
    stubFetch(async () => createdResponse());

    const ref = await createCourierOrder(
      input({ consignee: { ...input().consignee, addressLine2: null } }),
      lookupReturning(null)
    );

    expect(ref.created).toBe(true);
    expect(bodyOf('orders/create/adhoc').billing_address_2).toBe('');
  });

  it('a body that never finishes arriving is an unknown outcome, on 200 and on 4xx alike', async () => {
    // `AbortSignal.timeout` aborts the body stream too, so a create whose
    // status line lands at 29s and whose body is still streaming at 30s
    // rejects INSIDE the body read. The order exists at Shiprocket in both
    // cases; a raw DOMException escaping here is not even a ShiprocketError,
    // and a caller applying the retry rule to it makes a second real order.
    stubFetch(async () => bodyNeverArrives(200, true));
    const onOk = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);
    expect(onOk).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(onOk!.message).toContain(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID));

    stubFetch(async () => bodyNeverArrives(422, false));
    const onRefusal = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);
    expect(onRefusal).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });
});

// ============================================================================
// Idempotency — the reason this client takes a lookup instead of a flag
// ============================================================================

describe('createCourierOrder idempotency', () => {
  it('makes no courier order at all when the shipment already has one', async () => {
    stubFetch(async () => createdResponse());
    const lookup = lookupReturning({
      externalOrderId: '700000001',
      externalShipmentId: '800000002',
    });

    const result = await createCourierOrder(input(), lookup);

    expect(result).toEqual({
      externalOrderId: '700000001',
      externalShipmentId: '800000002',
      created: false,
    });
    expect(lookup).toHaveBeenCalledWith(SHIPMENT_ROW_ID);
    expect(createCalls(), 'a second courier order was created').toHaveLength(0);
  });

  it('answers from the record even when the pickup nickname has since been cleared', async () => {
    // Ordering, stated as a property: the lookup runs FIRST. An order that
    // already exists is not made less real by a vendor whose nickname was
    // wiped afterwards, and refusing here would strand a parcel that is
    // already booked.
    stubFetch(async () => createdResponse());

    const result = await createCourierOrder(
      input({ pickupLocation: null }),
      lookupReturning({ externalOrderId: '700000001', externalShipmentId: '800000002' })
    );

    expect(result.created).toBe(false);
    expect(createCalls()).toHaveLength(0);
  });

  it('refuses a half-written record rather than returning a null id', async () => {
    // The create succeeded and only one of the two columns landed. Returning
    // `externalShipmentId: null` here would hand the caller something it must
    // pass to `assignAwb`, so the failure would surface one call later wearing
    // the wrong name.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input(),
      lookupReturning({ externalOrderId: '700000001', externalShipmentId: null })
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain('700000001');
    expect(createCalls()).toHaveLength(0);
  });

  it('refuses the MIRROR half-record too — a shipment id with no order id', async () => {
    // The other half of the same accident, and the one with the worse
    // consequence. It is the state a reconciling admin produces the moment
    // they paste the shipment id first — which is precisely what the
    // unknown-outcome message tells them to go and do. Keying the
    // short-circuit on `external_order_id` alone reads this as "no order
    // exists", makes a SECOND real courier order, reports `created: true`,
    // and overwrites the shipment id that was already recorded.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input(),
      lookupReturning({ externalOrderId: null, externalShipmentId: '800000002' })
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error, 'a second courier order was created for this shipment').toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
    expect(error!.message).toContain('800000002');
    expect(createCalls()).toHaveLength(0);
  });

  it('an empty record is not a half-record — it creates, as it must', async () => {
    // The paired positive control. A guard that refused every record shaped
    // like "not both ids" would also refuse the ordinary first dispatch, and
    // dispatch would stop working entirely.
    stubFetch(async () => createdResponse());

    const result = await createCourierOrder(
      input(),
      lookupReturning({ externalOrderId: null, externalShipmentId: null })
    );

    expect(result.created).toBe(true);
    expect(createCalls()).toHaveLength(1);
  });

  it('a 4xx that says the order already exists is an unknown outcome', async () => {
    // The one 4xx where something DOES exist, and the deterministic reference
    // is what makes it reachable: retrying after an unanswered attempt
    // presents the same `order_id`, so "already exists" is the expected shape
    // of that retry. Reading it as "nothing was created, correct and retry"
    // would send the operator round the loop that made the duplicate.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Order already exists with this order id' })
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID));
  });

  it('a create that times out and is then retried does not make a second order', async () => {
    // The property the ticket names. The first attempt never gets a response,
    // so nobody — not us, not the caller — knows whether Shiprocket made the
    // order. The client says exactly that, and the retry is answered from the
    // record the reconciliation wrote.
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    stubFetch(async () => {
      throw timeout;
    });

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect((error as ShiprocketWriteOutcomeUnknownError).code).toBe(
      'SHIPROCKET_WRITE_OUTCOME_UNKNOWN'
    );
    // The refusal has to be actionable: it names the reference to search the
    // dashboard for, and says a blind retry may duplicate.
    expect(error!.message).toContain(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID));
    expect(error!.message).toMatch(/may already exist/i);
    expect(createCalls()).toHaveLength(1);

    // ...reconciliation finds the order and records its ids, then the caller
    // retries. Same input, same client, no second order.
    stubFetch(async () => createdResponse());
    const retried = await createCourierOrder(
      input(),
      lookupReturning({ externalOrderId: String(SR_ORDER_ID), externalShipmentId: String(SR_SHIPMENT_ID) })
    );

    expect(retried).toEqual({
      externalOrderId: String(SR_ORDER_ID),
      externalShipmentId: String(SR_SHIPMENT_ID),
      created: false,
    });
    expect(createCalls(), 'the retry created a second courier order').toHaveLength(1);
  });

  it('the control: with nothing reconciled, the retry DOES create a second order', async () => {
    // The paired positive control for the test above, and the honest limit of
    // this client. With the outcome unknown and nothing recorded, a second
    // create duplicates — the lookup is what prevents it, not anything
    // incidental, and the test above would pass for the wrong reason without
    // this one next to it.
    //
    // We do not paper over it by asking Shiprocket "did you already make
    // this": that needs a read endpoint we have not exercised, and this ticket
    // forbids the live probe that would tell us how it behaves. So the client
    // refuses to guess and says so in the error instead.
    stubFetch(async () => {
      throw new Error('socket hang up');
    });
    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    stubFetch(async () => createdResponse());
    await createCourierOrder(input(), lookupReturning(null));

    expect(createCalls()).toHaveLength(2);
  });

  it('is deterministic about the reference it hands the courier', async () => {
    // A retry must present the SAME reference, or the duplicate it may create
    // is not even findable next to the original. Derived from the two ids, not
    // generated, and never a timestamp or a random.
    const a = courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID);
    const b = courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID);
    expect(a).toBe(b);
    // Human-searchable by order number...
    expect(a.startsWith(ORDER_NUMBER)).toBe(true);
    // ...and distinct per shipment row, so a re-buy after a voided label does
    // not collide with the shipment it replaced.
    expect(courierOrderReference(ORDER_NUMBER, '00000000-1111-2222-3333-444444444444')).not.toBe(a);
  });

  it('a 5xx is an unknown outcome; a 4xx is a definite refusal', async () => {
    // The split that decides whether a retry is safe. Shiprocket answering 500
    // may still have written the order; 422 means it did not.
    stubFetch(async () => refusedResponse(503, { message: 'Service Unavailable' }));
    const unknown = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);
    expect(unknown).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);

    stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));
    const definite = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);
    expect(definite).not.toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('an un-followed redirect is not a 4xx, and is not treated as one', async () => {
    // `response.ok` is false for a 3xx too, so a redirect loop or an upstream
    // configured `redirect: 'manual'` landed in the branch whose own sentence
    // is "a 4xx is normally a decision taken before anything was created". It
    // is not a 4xx and we have no evidence about it either way, so the safe
    // classification — the one that does not invite a retry — is the only one
    // available.
    stubFetch(async () => refusedResponse(302, { message: 'Found' }));

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('an accepted create whose ids we cannot read is unknown, not failed', async () => {
    // The worst response there is: the order EXISTS and we did not learn its
    // id. Reporting this as a failure invites the retry that duplicates.
    stubFetch(
      async () =>
        ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'NEW' }) }) as unknown as Response
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID));
  });

  it('refuses an id too long for the column that has to store it', async () => {
    // `external_order_id` is varchar(64). An id we cannot store is an order we
    // cannot find again, which is the same accident as losing it entirely.
    const tooLong = '9'.repeat(EXTERNAL_ID_MAX_LENGTH + 1);
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ order_id: tooLong, shipment_id: SR_SHIPMENT_ID }),
        }) as unknown as Response
    );

    await expect(createCourierOrder(input(), lookupReturning(null))).rejects.toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('says what Shiprocket answered when it accepts and we cannot store the ids', async () => {
    // The money path's worst outcome, and the branch that told an operator
    // least. The refusal sends them to reconcile — "search the dashboard for
    // this reference" — while the log line carried two booleans and NOTHING
    // about the answer itself: not its length, not a scrubbed word of it. So
    // the two cases this branch covers, and they are the only two, could not
    // be told apart: "a proxy interposed and nothing was created" reads
    // exactly like "the order exists and we lost its handle". The AWB twin has
    // logged both since it was written, on the identical shape; the file's own
    // design statement claims one rule for both writes, not two.
    const html = '<html><body>502 Bad Gateway</body></html>';
    stubFetch(async () => unreadable200());

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const [context] = (loggerMock.error.mock.calls.at(-1) ?? []) as [Record<string, unknown>];
    expect(context?.bodyLength, 'their answer was discarded, not even measured').toBe(html.length);
  });

  it('distinguishes an id that was too long from one that never came', async () => {
    // `asText` says a blank value is "NOT interchangeable with a value we could
    // not fit". On this path it was: both ids were logged as a boolean, so an
    // id Shiprocket sent and we refused reads exactly like an id Shiprocket
    // never sent — and the two have different remedies. One means their body
    // is not the shape we think it is; the other means the id is sitting in
    // the dashboard waiting to be copied.
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ order_id: '9'.repeat(EXTERNAL_ID_MAX_LENGTH + 1) }),
        }) as unknown as Response
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const [context] = (loggerMock.error.mock.calls.at(-1) ?? []) as [Record<string, unknown>];
    expect(context?.orderId).toBe('too long');
    expect(context?.shipmentId).toBe('absent');
  });

  it('an "already exists" hiding in the field bag is an unknown outcome', async () => {
    // The reason reading the bag is not cosmetic. "The order id has already
    // been taken." is Shiprocket telling us the create it just refused is one
    // it ALREADY HAS — the single 4xx on this path where something exists.
    // Read at the root only, that sentence was invisible, `saysAlreadyExists`
    // never fired, and the refusal that came back instructed an operator to
    // correct the payload and re-send: a second real order for one parcel.
    stubFetch(async () =>
      refusedResponse(422, {
        message: 'The given data was invalid.',
        errors: { order_id: ['The order id has already been taken.'] },
      })
    );

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID));
  });

  it('a lookup that throws is a typed refusal, and nothing is sent', async () => {
    // The first line of the only function in this module that spends money,
    // and the one line whose failure escaped untyped: a `pg` connection
    // dropping arrives as a bare `Error` with no `code`, so a route mapping
    // this client's codes to statuses answers it with an improvised 500. The
    // direction is safe — nothing was sent — but the module states that every
    // failure it produces shares one `catch`, and that was false.
    const lookup = vi.fn(async () => {
      throw new Error('connection terminated unexpectedly');
    });
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(input(), lookup)
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_ORDER_LOOKUP_FAILED');
    expect(createCalls(), 'a courier order was made without checking for one').toHaveLength(0);
    // The driver's own words stay in the log. They name our schema.
    expect(error!.message).not.toContain('connection terminated');
  });
});

// ============================================================================
// The payload — an allow-list, because it leaves the building
// ============================================================================

describe('the adhoc payload', () => {
  it('sends exactly the fields the courier needs and no others', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    expect(Object.keys(bodyOf('orders/create/adhoc')).sort()).toEqual(
      [...COURIER_ADHOC_PAYLOAD_KEYS].sort()
    );
  });

  it('never ships a field that was merely present on the input', async () => {
    // The allow-list has to be a list, not "the input minus a few keys". These
    // are the shapes a caller in phase 7 will plausibly be holding when it
    // builds this input, and none of them is a courier's business.
    stubFetch(async () => createdResponse());

    await createCourierOrder(
      {
        ...input(),
        costPaise: 15315,
        labelObjectToken: 'lbl_c0ffee',
        pickupVendorId: 'ven-99',
        customerUserId: 'usr-77',
      } as CreateCourierOrderInput,
      lookupReturning(null)
    );

    const wire = JSON.stringify(bodyOf('orders/create/adhoc'));
    for (const planted of ['costPaise', '15315', 'lbl_c0ffee', 'ven-99', 'usr-77']) {
      expect(wire, `${planted} reached the courier`).not.toContain(planted);
    }
    // The row id is ours, and only the 8 characters that make the reference
    // collision-resistant travel. The whole handle does not.
    expect(wire).not.toContain(SHIPMENT_ROW_ID);
  });

  it('carries the consignee the courier has to knock on the door of', async () => {
    // The positive control for the test above: an allow-list that dropped the
    // address would also pass a "nothing leaked" assertion.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    const body = bodyOf('orders/create/adhoc');
    expect(body.billing_customer_name).toBe('Ananya Iyer');
    expect(body.billing_address).toBe('12 Turner Road');
    expect(body.billing_pincode).toBe('400050');
    expect(body.billing_phone).toBe('9820011223');
    expect(body.shipping_is_billing).toBe(true);
  });

  it('does not split the name on a space', async () => {
    // Splitting mangles single-token names and multi-part surnames alike, and
    // the courier prints the concatenation anyway.
    stubFetch(async () => createdResponse());

    await createCourierOrder(
      input({ consignee: { ...input().consignee, name: 'Sri Lakshmi Venkata Rao' } }),
      lookupReturning(null)
    );

    const body = bodyOf('orders/create/adhoc');
    expect(body.billing_customer_name).toBe('Sri Lakshmi Venkata Rao');
    expect(body.billing_last_name).toBe('');
  });

  it('converts grams to kilograms and paise to rupees at the boundary', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    const body = bodyOf('orders/create/adhoc');
    expect(body.weight).toBe(0.85);
    expect(body.length).toBe(40);
    expect(body.breadth).toBe(30);
    expect(body.height).toBe(6);
    expect((body.order_items as Array<Record<string, unknown>>)[0]!.selling_price).toBe(1499);
  });

  it('hands the courier the per-SHIPMENT-ROW reference, on the wire', async () => {
    // The headline property of `courierOrderReference`, asserted where it
    // matters: what actually left the process. Exercising the helper directly
    // proves it is deterministic; it does not prove its output is what the
    // courier was given, and `order_id: input.orderNumber` passes every other
    // assertion in this file.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    expect(bodyOf('orders/create/adhoc').order_id).toBe(
      courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID)
    );
  });

  it('gives a re-bought shipment on the SAME order a different reference', async () => {
    // A voided label is re-bought as a new `order_shipments` row on the same
    // order — `order_shipments_live_label_idx` exists to allow exactly that —
    // so an order-number-only reference would make the replacement collide
    // with the parcel it replaces, at the courier, under one name.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));
    await createCourierOrder(
      input({ shipmentRowId: '00000000-1111-2222-3333-444444444444' }),
      lookupReturning(null)
    );

    const first = bodyOf('orders/create/adhoc', 0).order_id;
    const second = bodyOf('orders/create/adhoc', 1).order_id;
    expect(first).not.toBe(second);
    // ...and both are still findable by the number the customer quotes.
    expect(String(first).startsWith(ORDER_NUMBER)).toBe(true);
    expect(String(second).startsWith(ORDER_NUMBER)).toBe(true);
  });

  it('sends the goods as sub_total and every other charge as its own field', async () => {
    // 2 x 1499 + 1 x 899 of goods, 49 of shipping, 300 of coupon. Each term
    // goes to the Shiprocket field that means it, because on a COD parcel
    // their sum is the money a courier collects at somebody's door.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    const body = bodyOf('orders/create/adhoc');
    expect(body.sub_total).toBe(3897);
    expect(body.shipping_charges).toBe(49);
    expect(body.total_discount).toBe(300);
    expect(body.transaction_charges).toBe(0);
    expect(body.giftwrap_charges).toBe(0);
  });

  it('the COD collectible is what the customer owes, not the line sum', async () => {
    // The failure this arithmetic exists to prevent, stated as money: the
    // lines come to 3897 and the customer owes 3646, so a client that told
    // the courier to collect the line sum would take 251 rupees too much at
    // the door, on every COD parcel, and nobody downstream would ever see it.
    stubFetch(async () => createdResponse());

    await createCourierOrder(input({ cod: true }), lookupReturning(null));

    const body = bodyOf('orders/create/adhoc');
    const collected =
      Number(body.sub_total) +
      Number(body.shipping_charges) +
      Number(body.transaction_charges) +
      Number(body.giftwrap_charges) -
      Number(body.total_discount);

    expect(collected).toBe(AMOUNT_DUE_PAISE / 100);
    expect(collected).not.toBe(LINE_SUM_PAISE / 100);
  });

  it('refuses BEFORE the network when the charges do not reconcile', async () => {
    // A caller that passed the line sum as the amount due — the exact mistake
    // that produces the overcharge above — is refused rather than sent. The
    // refusal costs nothing because it happens before the write, and it names
    // both numbers so the caller can see which side is wrong.
    stubFetch(async () => createdResponse());

    const error = await createCourierOrder(
      input({
        cod: true,
        charges: {
          shippingPaise: SHIPPING_PAISE,
          discountPaise: DISCOUNT_PAISE,
          taxPaise: 0,
          transactionPaise: 0,
          giftwrapPaise: 0,
          amountDuePaise: LINE_SUM_PAISE,
        },
      }),
      lookupReturning(null)
    )
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketOrderTotalMismatchError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_ORDER_TOTAL_MISMATCH');
    expect(error!.message).toContain('3646');
    expect(error!.message).toContain('3897');
    expect(createCalls(), 'a create with the wrong collectible reached the courier').toHaveLength(0);
  });

  it('counts tax into the goods, because Shiprocket has no order-level tax field', async () => {
    // Named as a decision rather than left as an omission: the store carries
    // `orders.tax` as its own column and the adhoc payload has nowhere to put
    // it, so it rides in `sub_total` with the goods. Dropping it instead would
    // understate a COD collectible by the tax.
    stubFetch(async () => createdResponse());

    await createCourierOrder(
      input({
        charges: {
          shippingPaise: 0,
          discountPaise: 0,
          taxPaise: 10000,
          transactionPaise: 0,
          giftwrapPaise: 0,
          amountDuePaise: LINE_SUM_PAISE + 10000,
        },
      }),
      lookupReturning(null)
    );

    expect(bodyOf('orders/create/adhoc').sub_total).toBe(3997);
  });

  it('marks a COD order COD and a prepaid order Prepaid', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input({ cod: true }), lookupReturning(null));
    expect(bodyOf('orders/create/adhoc').payment_method).toBe('COD');

    await createCourierOrder(input({ cod: false }), lookupReturning(null));
    expect(bodyOf('orders/create/adhoc', 1).payment_method).toBe('Prepaid');
  });

  it('sends the order date in UTC, unshifted', async () => {
    stubFetch(async () => createdResponse());

    await createCourierOrder(input(), lookupReturning(null));

    expect(bodyOf('orders/create/adhoc').order_date).toBe('2026-08-31 09:15');
  });
});

// ============================================================================
// assignAwb — store what came back, never what was asked for
// ============================================================================

describe('assignAwb', () => {
  // No lookup argument here, and the asymmetry with `createCourierOrder` is
  // the design: assignment is keyed on Shiprocket's own shipment id, so a
  // second call names the same shipment rather than making a second one.
  it('posts the Shiprocket shipment id and the courier we chose', async () => {
    stubFetch(async () => awbAssignedResponse());

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID), courierCompanyId: REQUESTED_COURIER_ID });

    const [url, init] = fetchMock.mock.calls.find((c) => String(c[0]).includes('courier/assign/awb'))!;
    expect(String(url)).toContain('/courier/assign/awb');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
    expect(bodyOf('courier/assign/awb')).toEqual({
      shipment_id: String(SR_SHIPMENT_ID),
      courier_id: REQUESTED_COURIER_ID,
    });
  });

  it('omits the courier id entirely when we have no preference', async () => {
    // Not `courier_id: null`. Shiprocket reads a present-but-empty field as a
    // choice, and the choice it makes of it is not ours.
    stubFetch(async () => awbAssignedResponse());

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    expect(Object.keys(bodyOf('courier/assign/awb'))).toEqual(['shipment_id']);
  });

  it('omits it too when the id is not a real number, rather than sending null', async () => {
    // `typeof NaN === 'number'`, so a `courier_id` that failed to parse
    // upstream satisfied the presence check and went on the wire as
    // `"courier_id": null` — the exact thing the comment two lines above it
    // says is never sent. This was the only numeric input in the module that
    // did not go through `finiteNumber`, the helper written about precisely
    // this mistake.
    stubFetch(async () => awbAssignedResponse());

    const assignment = await assignAwb({
      shipmentId: String(SR_SHIPMENT_ID),
      courierCompanyId: Number('not a courier'),
    });

    expect(Object.keys(bodyOf('courier/assign/awb'))).toEqual(['shipment_id']);
    // ...and it is not reported back as a request either: NaN survives a
    // `?? null` and would reach `order_shipments` as a number nobody asked for.
    expect(assignment.requestedCourierCompanyId).toBeNull();
  });

  it('returns the courier that ANSWERED, not the one requested', async () => {
    // The property the ticket names. Shiprocket routinely assigns a different
    // courier than the one asked for; storing the request would put a courier
    // on the customer's tracking page who never had the parcel.
    stubFetch(async () => awbAssignedResponse());

    const assignment = await assignAwb({
      shipmentId: String(SR_SHIPMENT_ID),
      courierCompanyId: REQUESTED_COURIER_ID,
    });

    expect(assignment.awbNumber).toBe(ASSIGNED_AWB);
    expect(assignment.courierName).toBe(ASSIGNED_COURIER_NAME);
    expect(assignment.courierCompanyId).toBe(ASSIGNED_COURIER_ID);
    // Stated the other way round too, so the assertion cannot pass because the
    // fixture happens to agree with the request.
    expect(assignment.courierName).not.toBe(REQUESTED_COURIER_NAME);
    expect(assignment.courierCompanyId).not.toBe(REQUESTED_COURIER_ID);
    // What we asked for survives only as a distinctly-named field, so a caller
    // that stores `courierName` cannot store the request by accident.
    expect(assignment.requestedCourierCompanyId).toBe(REQUESTED_COURIER_ID);
  });

  it('reports no requested courier as null rather than as the assigned one', async () => {
    stubFetch(async () => awbAssignedResponse());

    const assignment = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    expect(assignment.requestedCourierCompanyId).toBeNull();
    expect(assignment.courierCompanyId).toBe(ASSIGNED_COURIER_ID);
  });

  it('reads a waybill that came back UNWRAPPED, not only the documented envelope', async () => {
    // The success read used to name exactly one path, `response.data`, while
    // the refusal read already named two — the wrapped path and the same field
    // at the root, "when the endpoint answers it unwrapped". So a 200 carrying
    // a real waybill at the root resolved to an empty container, an empty
    // `awb_code`, and the refusal whose words are "no waybill exists, so it is
    // safe to correct the shipment and ask again". A waybill DID exist; the
    // caller follows that advice and the courier gets two collections and two
    // billing events for one parcel.
    stubFetch(async () => unwrappedAwbResponse());

    const assignment = await assignAwb({
      shipmentId: String(SR_SHIPMENT_ID),
      courierCompanyId: REQUESTED_COURIER_ID,
    });

    expect(assignment.awbNumber).toBe(ASSIGNED_AWB);
    expect(assignment.courierName).toBe(ASSIGNED_COURIER_NAME);
    expect(assignment.courierCompanyId).toBe(ASSIGNED_COURIER_ID);
  });

  it('a 200 whose body we cannot read is an unknown outcome, never "ask again"', async () => {
    // One level up from the case above: not an envelope we do not know, but no
    // envelope at all — an edge proxy's HTML page, a truncated body. Nothing
    // in it says a waybill was NOT minted, so the only honest answer is that we
    // do not know. Classifying it as a refusal is the single most dangerous
    // sentence this module can produce, because the remedy it names is "ask
    // again" and asking again mints a second waybill.
    stubFetch(async () => unreadable200());

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error).not.toBeInstanceOf(ShiprocketAwbRefusedError);
    expect(error!.message).not.toMatch(/safe to .*ask again/i);
    // ...and it says where to look, because reconciling is now a human job.
    expect(error!.message).toContain(String(SR_SHIPMENT_ID));
  });

  it('a 200 that says in as many words that nothing was minted IS a refusal', async () => {
    // The paired positive control for the two tests above. A client that
    // answered every unmappable 200 with "unknown outcome" would also answer
    // Shiprocket's ordinary "no courier available" that way, and every
    // undeliverable route would land on an operator's desk as a reconciliation
    // job. The signal is theirs and explicit: `awb_assign_status: 0` with
    // their own error string, and no `awb_code` field anywhere.
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              awb_assign_status: 0,
              response: { data: { awb_assign_error: 'No courier available for this pincode' } },
            }),
        }) as unknown as Response
    );

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketAwbRefusedError);
    expect((error as ShiprocketAwbRefusedError).code).toBe('SHIPROCKET_AWB_REFUSED');
  });

  it('masks by SHAPE on this endpoint, where no echo list can help', async () => {
    // `assignAwb` posts a shipment id and nothing else, so the shape net is the
    // only thing standing between a customer and the log aggregator here — and
    // this endpoint is precisely the one that quotes back data we never sent
    // it. Without this test the whole `PERSONAL_SHAPES` loop could be deleted
    // and every other test in this file would stay green, which is the
    // definition of a guard that reads as coverage.
    stubFetch(async () =>
      awbAssignedResponse({
        awb_code: '',
        courier_name: '',
        awb_assign_error:
          'No courier available for pincode 400050 / weight 0.85 — contact ' +
          'ananya@example.test or 9820011223',
      })
    );

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch(() => null);

    const said = loggedMessages();
    expect(said, 'the pincode reached the log').not.toContain('400050');
    expect(said, 'the email reached the log').not.toContain('ananya@example.test');
    expect(said, 'the phone reached the log').not.toContain('9820011223');
    // ...and the operator still gets a diagnosable sentence, which is the
    // reason this is a scrubber and not a `delete`.
    expect(said).toContain('No courier available');
    expect(said).toContain('[pincode]');
    expect(said).toContain('[email]');
    expect(said).toContain('[phone]');
  });

  it('masks them here even when a formatter has been at them', async () => {
    // The same property as above against the form the values actually arrive
    // in. This endpoint quotes back numbers we never sent, so there is no echo
    // list to fall back on and `PERSONAL_SHAPES` is the whole defence — and a
    // shape that wants CONTIGUOUS digits does not see `400 050` or
    // `98200 11223`, which is how a courier's own system prints them. Without
    // this test the separator tolerance in those two patterns could be deleted
    // and every other test in this file would stay green.
    stubFetch(async () =>
      awbAssignedResponse({
        awb_code: '',
        courier_name: '',
        awb_assign_error: 'No courier for 400 050 — consignee on 98200 11223 is unreachable',
      })
    );

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch(() => null);

    const said = loggedMessages();
    expect(said, 'the pincode reached the log').not.toContain('400 050');
    expect(said, 'the phone number reached the log').not.toContain('98200 11223');
    expect(said).toContain('[pincode]');
    expect(said).toContain('[phone]');
    expect(said).toContain('No courier for');
  });

  it('refuses when Shiprocket assigns no waybill AT ALL', async () => {
    // `awb_code` empty is the one AWB answer that is a definite refusal:
    // nothing was minted, so correcting the cause and asking again is safe.
    stubFetch(async () =>
      awbAssignedResponse({
        awb_code: '',
        courier_name: '',
        awb_assign_error: 'No courier available for pincode 400050 / weight 0.85',
      })
    );

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketAwbRefusedError);
    expect((error as ShiprocketAwbRefusedError).code).toBe('SHIPROCKET_AWB_REFUSED');
    // Names our handle on the parcel so a support call can be traced...
    expect(error!.message).toContain(String(SR_SHIPMENT_ID));
    // ...and does not echo their sentence, which quotes the customer's pincode.
    expect(error!.message).not.toContain('400050');
  });

  it('sends the operator to a log line that actually holds the reason', async () => {
    // The refusal above says "the reason is in the API logs". That sentence is
    // a lie unless the reason is there: on this endpoint Shiprocket puts it at
    // `response.data.awb_assign_error`, NOT at the root `message` a 4xx body
    // carries, so a client that reads only `message` logs an empty string and
    // a byte count and strands the parcel with no diagnosable cause.
    stubFetch(async () =>
      awbAssignedResponse({
        awb_code: '',
        courier_name: '',
        awb_assign_error: 'No courier available for pincode 400050 / weight 0.85',
      })
    );

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch(() => null);

    expect(loggerMock.error).toHaveBeenCalled();
    expect(loggedText(), 'the only diagnostic Shiprocket sent was thrown away').toContain(
      'No courier available'
    );
  });

  it('an AWB with no courier name is an UNKNOWN OUTCOME — the waybill exists', async () => {
    // The distinction this whole module is built on, applied to the case that
    // gets it backwards most easily. `awb_code` is populated, so a real waybill
    // was minted and a courier is expecting to collect against it; only the
    // attribution is missing. Calling that a refusal — "no waybill exists, it
    // is safe to ask again" — is an instruction to mint a SECOND waybill
    // against the same shipment.
    stubFetch(async () => awbAssignedResponse({ courier_name: '' }));

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error).not.toBeInstanceOf(ShiprocketAwbRefusedError);
    // The waybill's number is the remedy: reconciliation is a copy-paste
    // rather than a hunt through the dashboard. Discarding it is what makes
    // the second AWB the easy thing to do.
    expect(error!.message, 'the minted waybill was discarded').toContain(ASSIGNED_AWB);
    expect(error!.message).not.toMatch(/safe to .*ask again/i);
  });

  it('reports a missing courier id as null, never as courier 0', async () => {
    // `Number(null)` is 0, and 0 is finite. A client that trusted that would
    // offer phase 7 "courier company 0" as the id that took the parcel.
    stubFetch(async () => awbAssignedResponse({ courier_company_id: null }));

    const assignment = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    expect(assignment.courierCompanyId).toBeNull();
    expect(assignment.awbNumber).toBe(ASSIGNED_AWB);
  });

  it('refuses a blank shipment id before spending a courier call', async () => {
    // The sibling write guards every input it has; this one used to guard
    // none. `shipment_id: ''` is a request whose effect at Shiprocket nobody
    // here has established, and establishing it means making a real waybill.
    stubFetch(async () => awbAssignedResponse());

    const error = await assignAwb({ shipmentId: '  ' })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_SHIPMENT_ID_MISSING');
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('courier/assign/awb')),
      'a blank shipment id reached the courier'
    ).toHaveLength(0);
  });

  it('a 4xx saying a waybill is already assigned is an unknown outcome', async () => {
    // The same exception the create side makes, made here too rather than
    // left to be discovered as an inconsistency. A 4xx on this endpoint is
    // normally a refusal that minted nothing — but "already assigned" is the
    // shape of a retry after an attempt that never answered, and it is the one
    // 4xx here that means a waybill EXISTS.
    stubFetch(async () =>
      refusedResponse(422, { message: 'AWB is already assigned to this shipment' })
    );

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error).not.toBeInstanceOf(ShiprocketAwbRefusedError);
  });

  it('a body that never finishes arriving is an unknown outcome', async () => {
    // The timeout that bounds the request also aborts the body stream, so a
    // 200 whose `text()` rejects is an assignment that may well have happened.
    // Letting that escape as a raw DOMException hands the caller something
    // that is not even a ShiprocketError, and the retry mints a second AWB.
    stubFetch(async () => bodyNeverArrives(200, true));

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain(String(SR_SHIPMENT_ID));
  });

  it('treats a dropped connection as an unknown outcome, not a refusal', async () => {
    // A waybill may have been minted. A caller that retried on a plain error
    // would mint a second one against the same shipment.
    stubFetch(async () => {
      throw new Error('socket hang up');
    });

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain(String(SR_SHIPMENT_ID));
  });

  it('an AWB too long for the column is an unknown outcome, not a refusal', async () => {
    // Same rule as the create side: the waybill EXISTS and we could not record
    // it. Calling that a refusal invites the retry that mints a second one.
    stubFetch(async () => awbAssignedResponse({ awb_code: '4'.repeat(EXTERNAL_ID_MAX_LENGTH + 1) }));

    await expect(assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })).rejects.toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('will not read a waybill out of an envelope that names another shipment', async () => {
    // The module already refuses to take the courier from a different envelope
    // than the waybill, on an attribution argument. This is that argument one
    // field further out, and the envelope carries the fact needed to make it:
    // an answer about somebody else's shipment is not an answer about ours.
    // Storing it writes one parcel's waybill onto another parcel's row — and
    // the AWB is what a customer tracks and what a courier bills against.
    stubFetch(async () => awbAssignedResponse({ shipment_id: 111111, awb_code: 'AWB-OTHER' }));

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    // A waybill exists — for something. "Ask again" is not available here.
    expect(error!.message).not.toMatch(/safe to .*ask again/i);
  });

  it('accepts an envelope that names no shipment at all', async () => {
    // The paired positive control, and the reason the check is on a PRESENT
    // and different id rather than on a missing one. `AWB_ENVELOPE_PATHS` reads
    // an unwrapped body too, and nothing establishes that every shape carries
    // the id back. Refusing on absence would turn a documented answer into an
    // unknown outcome and strand a waybill that is really ours.
    stubFetch(async () => unwrappedAwbResponse({ shipment_id: undefined }));

    const assignment = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    expect(assignment.awbNumber).toBe(ASSIGNED_AWB);
    expect(assignment.courierName).toBe(ASSIGNED_COURIER_NAME);
  });
});

// ============================================================================
// A token can die before its `exp`, and the cache has to be able to hear that
// ============================================================================

describe('a cached token Shiprocket has stopped honouring', () => {
  /**
   * The gap this block closes.
   *
   * `cached` was written only by `login()` and cleared only by a function
   * documented "nothing in `src/` should call it", and there was no 401
   * handling anywhere in the module. So a token revoked in the dashboard, or a
   * password rotated — which is exactly what `ShiprocketAuthError`'s own
   * message tells an admin to go and do — left every later call presenting the
   * dead token until its `exp`: up to nine days on the live account, with a
   * process restart as the only remedy, and that sentence appeared nowhere.
   * Worse, the refusal misdescribed itself. A 401 on a write fell through to
   * the final 4xx branch as `SHIPROCKET_ORDER_CREATE_REJECTED`, whose message
   * is "a 4xx is normally a decision taken before anything was created, so
   * correcting it and re-sending is the next step" — advice that nothing the
   * operator corrects can act on.
   */
  it('is dropped when a write comes back 401, so the next attempt logs in again', async () => {
    let writes = 0;
    stubFetch(async () => {
      writes += 1;
      return writes === 1 ? refusedResponse(401, { message: 'Unauthorized' }) : createdResponse();
    });

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
    // ...and it does not carry the advice that belongs to a payload refusal.
    expect(error!.message).not.toMatch(/re-send/i);

    // The property: the second attempt does not present the dead token.
    const ref = await createCourierOrder(input(), lookupReturning(null));
    expect(ref.created).toBe(true);
    expect(logins(), 'the dead token was presented again').toHaveLength(2);
  });

  it('is dropped when an AWB request comes back 401', async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      return calls === 1
        ? refusedResponse(401, { message: 'Unauthorized' })
        : awbAssignedResponse();
    });

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');

    const assignment = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    expect(assignment.awbNumber).toBe(ASSIGNED_AWB);
    expect(logins()).toHaveLength(2);
  });

  it('is dropped when the repeatable READ comes back 401 too', async () => {
    // Serviceability sits directly in front of the write on the dispatch path,
    // so it is usually the call that meets a dead token first. One rule for
    // every authenticated call in the module, not one per endpoint.
    const query = {
      pickupPincode: '400072',
      deliveryPincode: '560001',
      weightKg: 0.85,
      cod: false,
    };
    let reads = 0;
    stubFetch(async () => {
      reads += 1;
      return reads === 1
        ? ({ ok: false, status: 401, text: async () => '{}' } as unknown as Response)
        : ({
            ok: true,
            status: 200,
            json: async () => ({ data: { available_courier_companies: [] } }),
          } as unknown as Response);
    });

    const error = await checkServiceability(query)
      .then(() => null)
      .catch((e: Error) => e);

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');

    await checkServiceability(query);
    expect(logins()).toHaveLength(2);
  });

  it('the control: an ordinary 4xx leaves the cached token alone', async () => {
    // A rejected payload is not an authentication failure, and re-logging-in
    // on every refusal would answer a rate-limited endpoint with a request
    // storm. Only 401 drops the cache. 403 deliberately does not: the live
    // account answers 403 for WRONG credentials at the login itself, and on an
    // authenticated endpoint it means the account may not do this — which no
    // fresh token fixes.
    stubFetch(async () => refusedResponse(422, { message: 'Bad Request' }));

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);
    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    expect(logins(), 'a refusal was treated as a dead token').toHaveLength(1);
  });
});

// ============================================================================
// The classification is a money decision, so nothing that tidies a log may
// decide it
// ============================================================================

describe('what their body says reaches the classifier whole', () => {
  /** A Laravel 422: a generic sentence at the root, the real complaint in a bag. */
  function laravel422(entries: ReadonlyArray<readonly [string, string]>) {
    const errors: Record<string, string[]> = {};
    for (const [field, sentence] of entries) errors[field] = [sentence];
    return { message: 'The given data was invalid.', errors };
  }

  /** Laravel's `unique` rule — the one 4xx on this path where an order EXISTS. */
  const TAKEN = ['order_id', 'The order id has already been taken.'] as const;

  /**
   * Eight complaints that are not the one that matters.
   *
   * Not a hypothetical bag: two per order item plus the consignee's fields is
   * what a create rejected on its payload actually answers with. `errors` is a
   * JSON object, so the position of the entry that decides whether a real
   * order exists is Shiprocket's to choose and ours to survive.
   */
  const NOISE: ReadonlyArray<readonly [string, string]> = [
    ['order_items.0.name', 'The order items.0.name field is required.'],
    ['order_items.0.sku', 'The order items.0.sku field is required.'],
    ['order_items.1.name', 'The order items.1.name field is required.'],
    ['order_items.1.sku', 'The order items.1.sku field is required.'],
    ['billing_phone', 'The billing phone must be 10 digits.'],
    ['billing_city', 'The billing city field is required.'],
    ['billing_address', 'The billing address may not be greater than 100 characters.'],
    ['billing_pincode', 'The billing pincode must be a valid 6 digit pincode.'],
  ];

  async function createRefusedWith(body: Record<string, unknown>): Promise<Error> {
    stubFetch(async () => refusedResponse(422, body));
    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error, 'the create was not refused at all').not.toBeNull();
    return error!;
  }

  it('finds "already been taken" however far down the bag it sits', async () => {
    // The defect this replaces: the classifier read a CAPPED list of the bag,
    // so the sentence that says a real order exists was dropped whenever it
    // was the sixth entry — and the client answered with "correcting it and
    // re-sending is the next step", which is an instruction to make a second
    // real courier order. Which entry Shiprocket puts first is not a thing
    // this client gets to depend on.
    expect(await createRefusedWith(laravel422([...NOISE, TAKEN]))).toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('the control: the identical bag with that entry FIRST classifies the same', async () => {
    // Same body, one key moved. If these two ever disagree, the classification
    // of the one 4xx where a real order exists is being decided by a third
    // party's JSON key order.
    expect(await createRefusedWith(laravel422([TAKEN, ...NOISE]))).toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('says in the log how much of their sentence it did not show', async () => {
    // The cap that used to sit on the classifier is still needed on the LOG —
    // a bag with one entry per order item would otherwise become the log line.
    // It is legitimate there and only there, and the line has to say it
    // happened: a reader who cannot tell a truncated line from a whole one
    // cannot tell whether the classifier saw more than they are looking at.
    await createRefusedWith(laravel422([...NOISE, TAKEN]));

    const line = loggerMock.error.mock.calls
      .map((call) => call[0] as { shiprocketMessage?: unknown; shiprocketMessageDropped?: unknown })
      .find((fields) => typeof fields?.shiprocketMessage === 'string');

    expect(line, 'nothing of their answer was logged at all').toBeDefined();
    expect(String(line!.shiprocketMessage).length).toBeLessThanOrEqual(300);
    expect(
      line!.shiprocketMessageDropped,
      'a truncated log line that does not say it was truncated'
    ).toBeGreaterThan(0);
  });

  it('does not read a duplicate SKU complaint as a duplicate ORDER', async () => {
    // `saysAlreadyExists` alternated on the bare word "duplicate", so this
    // body — a validation complaint about the manifest — came back as
    // `ShiprocketWriteOutcomeUnknownError` asserting "Shiprocket says an order
    // with this reference already exists". The direction was safe; the
    // sentence was false, and it sent an operator to reconcile an order that
    // was never created.
    const error = await createRefusedWith({ message: 'Duplicate SKU found in order items' });

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_ORDER_CREATE_REJECTED');
  });

  it('the control: a duplicate ORDER is still an unknown outcome', async () => {
    // The narrowing must not cost the case it was written for. "Duplicate
    // order id" is a sentence about the thing this client is trying to make.
    expect(await createRefusedWith({ message: 'Duplicate order id' })).toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('does not read a TAKEN SKU as a taken ORDER — the field is not the thing', async () => {
    // The same defect as the duplicate-SKU one above, on its siblings. The
    // word "duplicate" was qualified and `already ... been taken` was left
    // bare, so Laravel's `unique` sentence about ANY field came back as
    // `SHIPROCKET_WRITE_OUTCOME_UNKNOWN` — a 409 the caller must not retry,
    // carrying "Shiprocket says an order with this reference already exists"
    // and a dashboard search that finds nothing. Nothing was created here.
    const error = await createRefusedWith(
      laravel422([['order_items.0.sku', 'The order items.0.sku has already been taken.']])
    );

    expect(error).not.toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_ORDER_CREATE_REJECTED');
  });

  it('lets a TAKEN pickup location reach the refusal that can be acted on', async () => {
    // Second confirmed instance of the same bare match, and the one that hid
    // a whole branch: `already ... been taken` was tested ABOVE the pickup
    // clause, so `ShiprocketPickupLocationError` — the class whose own doc
    // says a generic refusal here "would strand a parcel behind a message
    // nobody can act on" — was unreachable for this wording.
    const error = await createRefusedWith(
      laravel422([['pickup_location', 'The pickup location has already been taken.']])
    );

    expect(error).toBeInstanceOf(ShiprocketPickupLocationError);
    expect(error.message).toContain(PICKUP_NICKNAME);
  });

  it('the control: the ORDER ID being taken is still an unknown outcome', async () => {
    // The narrowing is a check, not a blanket refusal to classify. This is the
    // exact body a repeated `order_id` produces — the retry this module's own
    // advice recommends — and it must still come back as "something exists".
    expect(await createRefusedWith(laravel422([TAKEN]))).toBeInstanceOf(
      ShiprocketWriteOutcomeUnknownError
    );
  });

  it('reads the SUBJECT of the sentence, so one taken order id beats eight taken fields', async () => {
    // A bag carrying both. If the classifier read the words rather than what
    // they are about, either entry alone would decide; only reading the
    // subject makes the one that names the order win from anywhere in the bag.
    const error = await createRefusedWith(
      laravel422([
        ['order_items.0.sku', 'The order items.0.sku has already been taken.'],
        ['billing_phone', 'The billing phone has already been taken.'],
        TAKEN,
      ])
    );

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('does not file a dead token as a courier refusing the write', async () => {
    // The log line was written before the 401 branch, so the one condition
    // that is about a credential rather than about a parcel was recorded as
    // "courier write refused" — mislabelling the state whose whole point is
    // that it clears itself.
    stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    const said = loggerMock.error.mock.calls.map((call) => String(call[1] ?? ''));
    expect(said.some((line) => line.includes('refused the API token'))).toBe(true);
    expect(said, 'a 401 was filed as a courier refusing the write').not.toContain(
      'shiprocket: courier write refused'
    );
  });
});

// ============================================================================
// An answer about somebody else's shipment is not an answer about ours —
// on BOTH branches
// ============================================================================

describe('an AWB answer attributed to another shipment', () => {
  /** Shiprocket's own "I minted nothing", stamped with a different shipment id. */
  function declinedFor(shipmentId: number) {
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          awb_assign_status: 0,
          response: {
            data: {
              shipment_id: shipmentId,
              awb_code: '',
              awb_assign_error: 'No courier available for this pickup',
            },
          },
        }),
    } as unknown as Response;
  }

  it('is an unknown outcome even when it says nothing was minted', async () => {
    // The attribution guard was applied on the `assigned` branch and dropped
    // on its sibling, so this body — an answer about shipment 111111 — came
    // back as a confident "No waybill exists, so it is safe to correct the
    // shipment and ask again" about a shipment nobody had answered for. An
    // operator following that mints a second waybill against a shipment that
    // may already have one.
    stubFetch(async () => declinedFor(111111));

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message, 'told an operator it is safe to ask again').not.toContain(
      'safe to correct'
    );
    expect(error!.message, "another parcel's handle at the courier").not.toContain('111111');
  });

  it('the control: the identical body naming OUR shipment IS a definite refusal', async () => {
    stubFetch(async () => declinedFor(SR_SHIPMENT_ID));

    const error = await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketAwbRefusedError);
    expect(error!.message).toContain('safe to correct');
  });

  it('logs the awb_assign_error even when a root message sits in front of it', async () => {
    // `messageAt` returned the FIRST non-blank path and `message` was ahead of
    // `awb_assign_error`, so a body carrying both logged four generic words
    // and dropped the only diagnostic in it — under a refusal whose own remedy
    // is "the reason is in the API logs".
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              message: 'Something went wrong',
              awb_assign_status: 0,
              response: {
                data: {
                  shipment_id: SR_SHIPMENT_ID,
                  awb_code: '',
                  awb_assign_error: 'No courier available for pincode 400050 / weight 0.85',
                },
              },
            }),
        }) as unknown as Response
    );

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch(() => null);

    const said = loggedMessages();
    expect(said, 'the only diagnostic in the body never reached the log').toContain(
      'No courier available'
    );
    expect(said, 'their envelope sentence was dropped instead').toContain('Something went wrong');
    // ...and the pincode they quoted back is still not ours to log. There is
    // no echo list on this endpoint — we sent a shipment id and nothing else —
    // so the shape net is the whole defence.
    expect(said, 'a pincode reached the aggregator').not.toContain('400050');
  });
});

// ============================================================================
// Two dispatches of one shipment, racing
// ============================================================================

describe('concurrent creates for one shipment', () => {
  /**
   * A create the test can hold open, so the second call starts while the first
   * is still in flight.
   *
   * This is the window the idempotency lookup cannot see: neither create has
   * been recorded yet, so a lookup taken twice answers `null` twice.
   */
  function heldCreate() {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(async (url) => {
      if (url.includes('orders/create/adhoc')) await gate;
      return createdResponse();
    });

    return { release: () => release() };
  }

  it('make ONE courier order, not two', async () => {
    // An admin double-click, or a UI retry issued while the first request is
    // still open. Both callers passed the lookup, both passed the local
    // refusals, and both POSTed the identical deterministic reference: two
    // real courier orders for one parcel, with whichever finished second
    // overwriting the other's ids.
    const { release } = heldCreate();
    const lookup = lookupReturning(null);

    const first = createCourierOrder(input(), lookup);
    const second = createCourierOrder(input(), lookup);
    release();

    const [led, followed] = await Promise.all([first, second]);

    expect(createCalls(), 'one parcel, two real courier orders').toHaveLength(1);
    expect(led.externalOrderId).toBe(String(SR_ORDER_ID));
    expect(followed.externalOrderId).toBe(String(SR_ORDER_ID));
    expect(led.created, 'the call that made it did not say so').toBe(true);
    expect(followed.created, 'a follower narrated as a dispatch of its own').toBe(false);
  });

  it('answer a follower with the leader\u2019s failure rather than a second attempt', async () => {
    // The leader's write never answered, so whether an order exists is not
    // known. A follower that went on to make its own attempt would be the
    // blind retry every unknown-outcome message in this file tells an operator
    // not to make — and it would make it inside the same second, before
    // anybody could reconcile anything.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch(async (url) => {
      if (!url.includes('orders/create/adhoc')) return createdResponse();
      await gate;
      throw new Error('socket hang up');
    });

    const lookup = lookupReturning(null);
    const first = createCourierOrder(input(), lookup).catch((e: Error) => e);
    const second = createCourierOrder(input(), lookup).catch((e: Error) => e);
    release();

    const [led, followed] = await Promise.all([first, second]);

    expect(led).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(followed, 'the follower was given a different story').toBe(led);
    expect(createCalls(), 'the follower retried a write whose outcome is unknown').toHaveLength(1);
  });

  it('the control: two DIFFERENT shipments still get an order each', async () => {
    // The coalescing is per shipment row, not a global lock. A version that
    // serialised everything would pass the test above and stall dispatch.
    const { release } = heldCreate();
    const lookup = lookupReturning(null);

    const first = createCourierOrder(input(), lookup);
    const second = createCourierOrder(
      input({ shipmentRowId: '7c1e2f30-9a4b-4c5d-8e6f-1a2b3c4d5e6f' }),
      lookup
    );
    release();
    await Promise.all([first, second]);

    expect(createCalls()).toHaveLength(2);
  });

  it('covers the OVERLAP only — a create that has returned is no longer joined', async () => {
    // The boundary the module's prose has to state exactly, because a
    // phase-7 author will lean on it. The entry is deleted in the `finally`
    // of `createCourierOrder`, which is before the caller has written
    // `external_order_id` — so the window between the lookup and that write
    // is NOT closed by this map, and a second call arriving one millisecond
    // after the first returns makes a second real courier order. The lock
    // `CourierOrderLookup` demands is the only thing that closes it, and the
    // header may not claim otherwise.
    stubFetch(async () => createdResponse());
    const lookup = lookupReturning(null);

    await createCourierOrder(input(), lookup);
    await createCourierOrder(input(), lookup);

    expect(createCalls(), 'the map answered a settled promise — that is a cache').toHaveLength(2);
  });
});

// ============================================================================
// Two waybill requests for one shipment, racing
// ============================================================================

describe('concurrent waybill requests for one shipment', () => {
  /** An assign the test can hold open, so a second call starts inside it. */
  function heldAssign(answer: () => Response) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(async (url) => {
      if (url.includes('courier/assign/awb')) await gate;
      return answer();
    });

    return { release: () => release() };
  }

  const assignCalls = () =>
    fetchMock.mock.calls.filter((c) => String(c[0]).includes('courier/assign/awb'));

  it('make ONE waybill request, not two', async () => {
    // The asymmetry this closes: `createCourierOrder` coalesced on the
    // argument that "a second concurrent create costs a real courier order",
    // and `assignAwb` did not — on an unverified claim about what Shiprocket
    // does with a repeated `shipment_id`. A second concurrent assign costs a
    // real waybill, which is the outcome this module opens by saying it exists
    // to prevent, and the defence must not rest on a premise nothing here can
    // check.
    const { release } = heldAssign(() => awbAssignedResponse());

    const first = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    const second = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    release();

    const [led, followed] = await Promise.all([first, second]);

    expect(assignCalls(), 'one shipment, two real waybills').toHaveLength(1);
    expect(led.awbNumber).toBe(ASSIGNED_AWB);
    expect(followed.awbNumber).toBe(ASSIGNED_AWB);
    expect(followed.courierName).toBe(ASSIGNED_COURIER_NAME);
  });

  it('answer a follower with the leader’s failure rather than a second waybill', async () => {
    // The leader's assign never answered, so whether a waybill exists is not
    // known. A follower that asked again would be the blind retry every
    // unknown-outcome message here tells an operator not to make.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch(async (url) => {
      if (!url.includes('courier/assign/awb')) return awbAssignedResponse();
      await gate;
      throw new Error('socket hang up');
    });

    const first = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch((e: Error) => e);
    const second = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) }).catch((e: Error) => e);
    release();

    const [led, followed] = await Promise.all([first, second]);

    expect(led).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(followed, 'the follower was given a different story').toBe(led);
    expect(assignCalls(), 'the follower retried a write whose outcome is unknown').toHaveLength(1);
  });

  it('the control: two DIFFERENT shipments still get a waybill request each', async () => {
    // Per Shiprocket shipment id, never global — the same shape as the create
    // side. A global lock would pass the test above and serialise dispatch.
    const { release } = heldAssign(() => awbAssignedResponse());

    const first = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    const second = assignAwb({ shipmentId: '912345679' }).catch((e: Error) => e);
    release();
    await Promise.all([first, second]);

    expect(assignCalls()).toHaveLength(2);
  });

  it('covers the OVERLAP only — an assign that has returned is no longer joined', async () => {
    // Stated for the same reason as its twin on the create side: the entry is
    // released when the leader settles, so this is not a cache of a courier
    // write and must never be described as one.
    stubFetch(async () => awbAssignedResponse());

    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    expect(assignCalls()).toHaveLength(2);
  });

  it('joins on the id Shiprocket knows, trimmed — not the string the caller passed', async () => {
    // The id is trimmed before the request is built, so two callers holding
    // the same id with different whitespace name the same shipment at
    // Shiprocket. Keying the join on the raw argument would let them race.
    const { release } = heldAssign(() => awbAssignedResponse());

    const first = assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
    const second = assignAwb({ shipmentId: ` ${SR_SHIPMENT_ID} ` });
    release();
    await Promise.all([first, second]);

    expect(assignCalls()).toHaveLength(1);
  });
});

// ============================================================================
// A phone number quoted back with its country code
// ============================================================================

describe('the shape net on a value we did send', () => {
  it('masks a mobile quoted back with a country code and no separators', async () => {
    // Reproduced, and it escaped all three passes: pass 1's digit pattern is
    // bracketed by `(?<!\d)`/`(?!\d)` so the ten-digit value inside a twelve
    // digit run never matches; the word pass has one word and it is the
    // unprefixed number; and the `[phone]` shape wanted a bounded ten-digit
    // run. The `+91 ` form WAS masked, so the gap was specifically the
    // unseparated prefix — the form a validator normalises to.
    //
    // **Two mechanisms now stand behind this line, and neither of them alone
    // is what this test pins.** Measured by breaking each: with the shape's
    // country-code prefix removed it still passes, because the residue pass
    // catches the run; with the residue pass removed it still passes, because
    // the shape does. It goes red with both gone. That is the property worth
    // asserting from out here — the client's log does not carry a customer's
    // mobile — and `tests/lib/payload-echo-scrub.test.ts` is where each
    // mechanism is pinned on its own.
    stubFetch(async () =>
      refusedResponse(422, { message: 'Invalid phone 919820011223 for consignee' })
    );

    await createCourierOrder(input(), lookupReturning(null)).catch(() => null);

    expect(loggedText(), "the customer's mobile reached the aggregator").not.toContain(
      '9820011223'
    );
    expect(loggedMessages(), 'the sentence was dropped rather than scrubbed').toContain(
      'Invalid phone'
    );
  });
});

// ============================================================================
// The codes with no class of their own — counted by a machine, not by a reader
// ============================================================================

describe('the ShiprocketError doc block names the inline-thrown codes', () => {
  const SOURCE = resolve(__dirname, '../../src/services/shiprocket.ts');

  /** Words this file will accept as a count, indexed by the number they spell. */
  const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

  /** Pure: the module's exports in, the code each exported error CLASS carries out. */
  function codesWithAClass(module: Record<string, unknown>): string[] {
    return Object.values(module)
      .filter(
        (value): value is new (message: string) => ShiprocketError =>
          typeof value === 'function' && value.prototype instanceof ShiprocketError
      )
      .map((type) => new type('x').code as string)
      .sort();
  }

  /** Pure: source in, the doc block immediately above a declaration out. */
  function docBlockAbove(source: string, declaration: string): string {
    const at = source.indexOf(declaration);
    if (at < 0) return '';
    const before = source.slice(0, at);
    return before.slice(before.lastIndexOf('/**'));
  }

  /** Pure: a doc block in, the refusal codes it names out. */
  function codesNamedIn(docBlock: string): string[] {
    return [...new Set(docBlock.match(/SHIPROCKET_[A-Z_]+/g) ?? [])].sort();
  }

  it('names exactly the codes no exported class carries, and counts them right', () => {
    // The file's whole warrant is that its prose is true because it is
    // corrected when it goes stale. It said "Two of the codes below are thrown
    // inline with no class of their own" and the number was six — one live
    // counterexample in 1,400 lines of prose a 2am reader cannot check.
    // So the number and the names are derived here rather than counted by
    // hand, and the doc block is held to the derivation.
    const classed = new Set(codesWithAClass(shiprocket as Record<string, unknown>));
    const inline = SHIPROCKET_REFUSAL_CODES.filter((code) => !classed.has(code)).sort();
    const doc = docBlockAbove(readFileSync(SOURCE, 'utf8'), 'export class ShiprocketError');

    expect(doc, 'the ShiprocketError doc block was not found').not.toBe('');
    expect(codesNamedIn(doc)).toEqual([...inline]);
    expect(doc, `the prose does not say ${COUNT_WORDS[inline.length]}`).toContain(
      `${COUNT_WORDS[inline.length]} of the codes`
    );
  });

  it('CAN fail: each reader is checked against a planted corpus', () => {
    expect(codesNamedIn('/** SHIPROCKET_B and SHIPROCKET_A and SHIPROCKET_A. */')).toEqual([
      'SHIPROCKET_A',
      'SHIPROCKET_B',
    ]);
    expect(docBlockAbove('/** first */\nx\n/** second */\nexport class Q {}', 'export class Q')).toBe(
      '/** second */\n'
    );
    expect(docBlockAbove('export class Q {}', 'export class Missing')).toBe('');
    // ...and the class reader answers with the code, not the class name, so a
    // renamed class cannot quietly empty the set.
    expect(codesWithAClass({ AwbRefused: ShiprocketAwbRefusedError })).toEqual([
      'SHIPROCKET_AWB_REFUSED',
    ]);
    expect(codesWithAClass({ NotAnError: () => 'x', Base: ShiprocketError })).toEqual([]);
  });
});

// ============================================================================
// The guards, each proved able to fail
// ============================================================================

// Mechanism 3 from the header, and its limit stated rather than assumed. A
// base URL that silently fell back to `DEFAULT_BASE_URL` shows up here as a
// live host. An UNINSTALLED stub does not: nothing would be pushed, the array
// would stay empty and the predicate would clear it. What catches that is the
// sibling test below, which makes its own traffic and then reads the recorder
// — the recorder is the evidence, the traffic is the check.
describe('nothing in this file reached the live courier', () => {
  /**
   * Pure: a list of URLs in, the ones naming the live host out.
   *
   * ONE implementation, shared by the real assertion and by its planted
   * control. They used to be two — the control re-typed the same `filter`
   * inline — so the control proved a copy of the predicate rather than the
   * predicate, and a real assertion that had drifted would still have had a
   * green control sitting next to it. Same shape as `databaseImports` below,
   * which got this right.
   */
  function liveCourierUrls(urls: readonly string[]): string[] {
    return urls.filter((url) => url.includes('apiv2.shiprocket.in'));
  }

  it('addressed only the reserved .invalid host', () => {
    const live = liveCourierUrls(EVERY_URL);
    expect(live, `live Shiprocket calls: ${live.join(', ')}`).toEqual([]);
  });

  it('is not vacuous: this block drives the client itself and inspects the result', async () => {
    // It used to assert `EVERY_URL.length > 10`, which is a property of
    // whole-file execution order rather than of the client: any filtered run
    // (`-t`) failed it for a reason unrelated to what it is checking. So the
    // block now makes its own traffic — a create and an assign, the two calls
    // that would spend money — and reads the recorder afterwards.
    const before = EVERY_URL.length;
    stubFetch(async (url) =>
      url.includes('orders/create/adhoc') ? createdResponse() : awbAssignedResponse()
    );

    await createCourierOrder(input(), lookupReturning(null));
    await assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });

    const mine = EVERY_URL.slice(before);
    expect(mine.some((url) => url.includes('orders/create/adhoc'))).toBe(true);
    expect(mine.some((url) => url.includes('courier/assign/awb'))).toBe(true);
    expect(mine.every((url) => url.includes('shiprocket.invalid'))).toBe(true);
    expect(liveCourierUrls(mine)).toEqual([]);
  });

  it('CAN fail: the same predicate catches a live URL planted in a corpus', () => {
    expect(
      liveCourierUrls([
        'https://shiprocket.invalid/v1/external/auth/login',
        'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      ])
    ).toEqual(['https://apiv2.shiprocket.in/v1/external/orders/create/adhoc']);
  });
});

// ============================================================================
// The refusal vocabulary — closed, and every member proved reachable
// ============================================================================

describe('every refusal this client can produce is declared and reachable', () => {
  /**
   * One scenario per declared code, and the account below proves the table
   * covers the union exactly.
   *
   * A union nobody exercises is a list of names: `SHIPROCKET_ORDER_CREATE_REJECTED`
   * appeared exactly once in the whole repository — at its own throw site —
   * while being the code a phase-7 route has to switch on. A code that is
   * declared, given a status, and shown to come out of a real call is a
   * contract; anything less is a comment.
   */
  const PRODUCERS: ReadonlyArray<{ code: ShiprocketRefusalCode; produce: () => Promise<unknown> }> = [
    {
      code: 'SHIPROCKET_NOT_CONFIGURED',
      produce: async () => {
        delete process.env.SHIPROCKET_EMAIL;
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_AUTH_REJECTED',
      produce: async () => {
        fetchMock.mockImplementation(async (url: unknown) => {
          EVERY_URL.push(String(url));
          return { ok: false, status: 403, json: async () => ({}) } as unknown as Response;
        });
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_AUTH_UNREACHABLE',
      produce: async () => {
        // The login itself never answers. Distinct from AUTH_REJECTED, which
        // is Shiprocket saying no; this is Shiprocket saying nothing, and it
        // is the path in front of every other call in the module.
        fetchMock.mockImplementation(async (url: unknown) => {
          EVERY_URL.push(String(url));
          throw new Error('socket hang up');
        });
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_AUTH_EXPIRED',
      produce: async () => {
        // The token the cache is holding is dead. Distinct from both auth
        // codes above: Shiprocket answered, and what it refused was the
        // credential rather than the payload.
        stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_ORDER_LOOKUP_FAILED',
      produce: async () => {
        stubFetch(async () => createdResponse());
        return createCourierOrder(
          input(),
          vi.fn(async () => {
            throw new Error('connection terminated unexpectedly');
          })
        );
      },
    },
    {
      code: 'SHIPROCKET_SERVICEABILITY_FAILED',
      produce: async () => {
        stubFetch(async () => ({ ok: false, status: 500 }) as unknown as Response);
        return checkServiceability({
          pickupPincode: '400072',
          deliveryPincode: '560001',
          weightKg: 0.85,
          cod: false,
        });
      },
    },
    {
      code: 'SHIPROCKET_NOT_SERVICEABLE',
      produce: async () => {
        stubFetch(
          async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ data: { available_courier_companies: [] } }),
            }) as unknown as Response
        );
        return selectCourierFor({
          pickupPincode: '400072',
          deliveryPincode: '560001',
          weightKg: 0.85,
          cod: false,
        });
      },
    },
    {
      code: 'SHIPROCKET_PICKUP_LOCATION_INVALID',
      produce: async () => {
        stubFetch(async () => createdResponse());
        return createCourierOrder(input({ pickupLocation: null }), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_PARCEL_INVALID',
      produce: async () => {
        stubFetch(async () => createdResponse());
        return createCourierOrder(
          input({ parcel: { weightGrams: 0, lengthCm: 40, widthCm: 30, heightCm: 6 } }),
          lookupReturning(null)
        );
      },
    },
    {
      code: 'SHIPROCKET_CONSIGNEE_INVALID',
      produce: async () => {
        stubFetch(async () => createdResponse());
        return createCourierOrder(
          input({ consignee: { ...input().consignee, pincode: '' } }),
          lookupReturning(null)
        );
      },
    },
    {
      code: 'SHIPROCKET_ORDER_TOTAL_MISMATCH',
      produce: async () => {
        stubFetch(async () => createdResponse());
        return createCourierOrder(
          input({ charges: { ...input().charges, amountDuePaise: 1 } }),
          lookupReturning(null)
        );
      },
    },
    {
      code: 'SHIPROCKET_ORDER_CREATE_REJECTED',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      code: 'SHIPROCKET_SHIPMENT_ID_MISSING',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse());
        return assignAwb({ shipmentId: '' });
      },
    },
    {
      code: 'SHIPROCKET_AWB_REFUSED',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse({ awb_code: '', courier_name: '' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      code: 'SHIPROCKET_LABEL_REFUSED',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      code: 'SHIPROCKET_LABEL_FETCH_FAILED',
      produce: async () => {
        // The label request is accepted; the file host behind the URL is not
        // answering. The label EXISTS — this code is what says so.
        stubFetch(async (url) => {
          if (url.includes('courier/generate/label')) return labelGeneratedResponse();
          throw new Error('socket hang up');
        });
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      code: 'SHIPROCKET_PICKUP_NOT_SCHEDULED',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'No pickup slots available today' }));
        return schedulePickup({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      code: 'SHIPROCKET_CANCEL_REFUSED',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'Shipment already picked up' }));
        return cancelCourierShipment({ awb: ASSIGNED_AWB });
      },
    },
    {
      code: 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN',
      produce: async () => {
        stubFetch(async () => {
          throw new Error('socket hang up');
        });
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
  ];

  it('the table names every declared code, and no code it does not declare', () => {
    expect([...PRODUCERS.map((p) => p.code)].sort()).toEqual([...SHIPROCKET_REFUSAL_CODES].sort());
  });

  it('gives every code the exact HTTP status a route should answer with', () => {
    // This asserted `toBeGreaterThan(0)`, under which the whole map could have
    // been `1` and stayed green — an argued 400/404/409/422/502/503 split
    // enforced by nothing. The entry that matters most is the unknown outcome:
    // **409, not a 5xx**, because a client that treats it as retryable makes a
    // second real order, and 500 is the value a reader would "tidy" it to. The
    // record literal also refuses an extra key, so a code cannot gain a status
    // here without gaining a scenario in the table above.
    expect(SHIPROCKET_REFUSAL_STATUS).toEqual({
      SHIPROCKET_NOT_CONFIGURED: 422,
      SHIPROCKET_AUTH_REJECTED: 422,
      SHIPROCKET_AUTH_UNREACHABLE: 502,
      SHIPROCKET_AUTH_EXPIRED: 503,
      SHIPROCKET_SERVICEABILITY_FAILED: 502,
      SHIPROCKET_NOT_SERVICEABLE: 503,
      SHIPROCKET_PICKUP_LOCATION_INVALID: 422,
      SHIPROCKET_PARCEL_INVALID: 422,
      SHIPROCKET_CONSIGNEE_INVALID: 422,
      SHIPROCKET_ORDER_TOTAL_MISMATCH: 422,
      SHIPROCKET_ORDER_CREATE_REJECTED: 422,
      SHIPROCKET_ORDER_LOOKUP_FAILED: 500,
      SHIPROCKET_SHIPMENT_ID_MISSING: 500,
      SHIPROCKET_AWB_REFUSED: 422,
      SHIPROCKET_LABEL_REFUSED: 422,
      SHIPROCKET_LABEL_FETCH_FAILED: 502,
      SHIPROCKET_PICKUP_NOT_SCHEDULED: 503,
      SHIPROCKET_CANCEL_REFUSED: 422,
      SHIPROCKET_WRITE_OUTCOME_UNKNOWN: 409,
    });
  });

  it.each(PRODUCERS)('$code comes out of a real call', async ({ code, produce }) => {
    const error = await produce()
      .then(() => null)
      .catch((e: Error) => e);

    expect(error, `${code} was not produced`).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe(code);
  });
});

// ============================================================================
// The order of the clauses is a mechanism, and the mechanism is checked here
// ============================================================================

/**
 * The property this block exists for.
 *
 * Every write in this client is decided by a SEQUENCE of clauses, and the
 * correctness of the whole file rests on that sequence: move the token check,
 * the already-exists check or the attribution check by one position and an
 * unknown outcome silently becomes a definite refusal whose text is "it is
 * safe to correct the shipment and ask again" — an instruction that mints a
 * second real courier order or a second real waybill.
 *
 * That used to be held in place by prose alone: a numbered clause list in a
 * two-hundred-line header, which the file itself concedes is "a great deal of
 * prose they cannot independently check". So the sequences are now data —
 * `COURIER_WRITE_CLAUSES` — assembled by `orderedClauses`, which takes the
 * open-verdict clauses and the definite ones as two SEPARATE arrays whose
 * element types differ. A definite refusal cannot be written among the open
 * ones without a typecheck failure, and this block adds the three things a
 * type cannot do: pin the order inside each group, prove the runtime guard can
 * fail, and prove every adjacent boundary actually decides something.
 */
describe('the order of the write clauses is a mechanism, not a comment', () => {
  /** Every clause in the module, flattened, so the account below is total. */
  const allClauses = () =>
    Object.entries(COURIER_WRITE_CLAUSES).flatMap(([table, clauses]) =>
      clauses.map((clause) => `${table} :: ${clause.code}`)
    );

  it('asks every clause that admits a mint before any clause that rules one out', () => {
    // The safety partition, asserted over the REAL tables. `false` is an open
    // verdict (may-have-minted, or the credential exception argued on
    // `tokenWentStale`); `true` concludes nothing was minted and is only ever
    // safe once every open clause has been asked.
    for (const [table, clauses] of Object.entries(COURIER_WRITE_CLAUSES)) {
      const definite = clauses.map((clause) => clause.verdict === 'nothing-minted');
      expect(definite, `${table} asks a definite refusal before an open verdict`).toEqual(
        [...definite].sort((a, b) => Number(a) - Number(b))
      );
    }
  });

  it('carries at most one credential clause per table, and it reads only the status', () => {
    // The credential verdict is the one exception allowed into the open group:
    // a 401 IS a "nothing was minted" claim, but the argument for it is about
    // the credential rather than about their sentence, so it has to be asked
    // before anything that reads their sentence. An exception that could be
    // applied twice, or applied to a clause that reads a body, would be a hole
    // in the partition rather than an argued departure from it.
    for (const [table, clauses] of Object.entries(COURIER_WRITE_CLAUSES)) {
      const credential = clauses.filter((clause) => clause.verdict === 'credential');
      expect(credential.length, `${table} has more than one credential clause`).toBeLessThanOrEqual(
        1
      );
      for (const clause of credential) expect(clause.code).toBe('token-rejected');
    }
  });

  it('names the clauses in the exact order each table asks them', () => {
    // A reorder inside a group cannot change the safety class, but it can
    // change WHICH sentence an operator is given — and two of these
    // boundaries decide between "reconcile before retrying" and "correct it
    // and re-send". Pinned by name so a reorder is a failed assertion rather
    // than a silent change of advice.
    const ordered = Object.fromEntries(
      Object.entries(COURIER_WRITE_CLAUSES).map(([table, clauses]) => [
        table,
        clauses.map((clause) => `${clause.verdict} ${clause.code}`),
      ])
    );

    expect(ordered).toEqual({
      'create: a refused answer': [
        'may-have-minted write-incomplete',
        'credential token-rejected',
        'may-have-minted order-may-already-exist',
        'nothing-minted pickup-location-unknown',
        'nothing-minted create-rejected',
      ],
      'create: an accepted answer': ['may-have-minted ids-unstorable'],
      'assign: a refused answer': [
        'may-have-minted write-incomplete',
        'credential token-rejected',
        'may-have-minted waybill-may-already-exist',
        'nothing-minted awb-refused',
      ],
      'assign: an accepted answer': [
        'may-have-minted answer-unreadable',
        'may-have-minted answered-for-another-shipment',
        'may-have-minted waybill-without-courier',
        'may-have-minted waybill-too-long',
        'nothing-minted awb-declined',
      ],
      'label: a refused answer': [
        'may-have-minted write-incomplete',
        'credential token-rejected',
        'may-have-minted label-may-already-exist',
        'nothing-minted label-refused',
      ],
      'label: an accepted answer': [
        'may-have-minted answer-unreadable',
        'may-have-minted label-without-url',
        'may-have-minted label-url-unusable',
        'nothing-minted label-declined',
      ],
    });
  });

  it('CAN fail: the assembler refuses a definite refusal placed among the open ones', () => {
    // The guard is unreachable through the types — that is the point of the
    // two arrays — so it is reached here with a cast, exactly as
    // `tests/lib/production-seam.test.ts` plants a violation its real corpus
    // cannot contain. A guard nobody has watched fail reads as coverage.
    const open = {
      code: 'open',
      verdict: 'may-have-minted',
      when: () => false,
      refuse: () => new ShiprocketError('x', 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN'),
    };
    const definite = {
      code: 'definite',
      verdict: 'nothing-minted',
      when: () => true,
      refuse: () => new ShiprocketError('x', 'SHIPROCKET_ORDER_CREATE_REJECTED'),
    };

    expect(() => orderedClauses([definite as never], [])).toThrow(/nothing-minted/);
    // ...and it clears a table that is in order, so it is a check and not a
    // blanket refusal.
    expect(orderedClauses([open as never], [definite as never]).map((c) => c.code)).toEqual([
      'open',
      'definite',
    ]);
  });

  /**
   * One scenario per clause, driving the REAL client.
   *
   * The account below holds this table to `COURIER_WRITE_CLAUSES` exactly, so
   * a clause added to the module without a scenario fails here rather than
   * reading as covered — and a clause DELETED from the module leaves a
   * scenario naming nothing, which fails too.
   */
  const CLAUSE_SCENARIOS: ReadonlyArray<{
    table: string;
    clause: string;
    produce: () => Promise<unknown>;
  }> = [
    {
      table: 'create: a refused answer',
      clause: 'write-incomplete',
      produce: async () => {
        stubFetch(async () => refusedResponse(503, { message: 'Service Unavailable' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'create: a refused answer',
      clause: 'token-rejected',
      produce: async () => {
        stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'create: a refused answer',
      clause: 'order-may-already-exist',
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, {
            message: 'The given data was invalid.',
            errors: { order_id: ['The order id has already been taken.'] },
          })
        );
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'create: a refused answer',
      clause: 'pickup-location-unknown',
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, { message: 'Wrong Pickup location.' })
        );
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'create: a refused answer',
      clause: 'create-rejected',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'create: an accepted answer',
      clause: 'ids-unstorable',
      produce: async () => {
        stubFetch(
          async () =>
            ({
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ order_id: SR_ORDER_ID }),
            }) as unknown as Response
        );
        return createCourierOrder(input(), lookupReturning(null));
      },
    },
    {
      table: 'assign: a refused answer',
      clause: 'write-incomplete',
      produce: async () => {
        stubFetch(async () => refusedResponse(500, { message: 'Internal Server Error' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: a refused answer',
      clause: 'token-rejected',
      produce: async () => {
        stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: a refused answer',
      clause: 'waybill-may-already-exist',
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, { message: 'AWB is already assigned to this shipment' })
        );
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: a refused answer',
      clause: 'awb-refused',
      produce: async () => {
        stubFetch(async () => refusedResponse(422, { message: 'No courier available' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: an accepted answer',
      clause: 'answer-unreadable',
      produce: async () => {
        stubFetch(async () => unreadable200());
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: an accepted answer',
      clause: 'answered-for-another-shipment',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse({ shipment_id: 999888777 }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: an accepted answer',
      clause: 'waybill-without-courier',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse({ courier_name: '' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: an accepted answer',
      clause: 'waybill-too-long',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse({ awb_code: 'W'.repeat(65) }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'assign: an accepted answer',
      clause: 'awb-declined',
      produce: async () => {
        stubFetch(async () => awbAssignedResponse({ awb_code: '' }));
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
    },
    {
      table: 'label: a refused answer',
      clause: 'write-incomplete',
      produce: async () => {
        stubFetch(async () => refusedResponse(503, { message: 'Service Unavailable' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: a refused answer',
      clause: 'token-rejected',
      produce: async () => {
        stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: a refused answer',
      clause: 'label-may-already-exist',
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, { message: 'Label already generated for this shipment' })
        );
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: a refused answer',
      clause: 'label-refused',
      produce: async () => {
        stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: an accepted answer',
      clause: 'answer-unreadable',
      produce: async () => {
        stubFetch(async () => unreadable200());
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: an accepted answer',
      clause: 'label-without-url',
      produce: async () => {
        stubFetch(async () => labelGeneratedResponse({ label_url: '' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: an accepted answer',
      clause: 'label-url-unusable',
      produce: async () => {
        stubFetch(async () =>
          labelGeneratedResponse({ label_url: 'http://labels.shiprocket.invalid/plain.pdf' })
        );
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
    {
      table: 'label: an accepted answer',
      clause: 'label-declined',
      produce: async () => {
        stubFetch(async () => labelGeneratedResponse({ label_created: 0, label_url: '' }));
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
    },
  ];

  it('has a scenario for every clause, and names no clause the module does not', () => {
    expect(CLAUSE_SCENARIOS.map((s) => `${s.table} :: ${s.clause}`).sort()).toEqual(
      allClauses().sort()
    );
  });

  it('the account is not vacuous — an unenrolled clause would show up', () => {
    expect(allClauses().length, 'the module declared no clauses at all').toBeGreaterThan(10);
    expect([...allClauses(), 'create: a refused answer :: cancelSomeday'].sort()).not.toEqual(
      allClauses().sort()
    );
  });

  it.each(CLAUSE_SCENARIOS)(
    '$table :: $clause answers with the status its verdict promises',
    async ({ table, clause, produce }) => {
      // The binding a reader most needs and could least check: the verdict
      // written in the table and the HTTP status a phase-7 route will answer
      // with are two statements of the same fact, and nothing but this test
      // stops them disagreeing. 409 means "do not retry"; a clause that says a
      // mint may have happened and resolves to a 422 is an instruction to make
      // a second one.
      const verdict = COURIER_WRITE_CLAUSES[table]!.find((c) => c.code === clause)!.verdict;

      const error = await produce()
        .then(() => null)
        .catch((e: Error) => e);

      expect(error, `${table} :: ${clause} produced no refusal`).toBeInstanceOf(ShiprocketError);
      const status = SHIPROCKET_REFUSAL_STATUS[(error as ShiprocketError).code];

      if (verdict === 'may-have-minted') {
        expect(error, `${clause} is not the unknown-outcome type`).toBeInstanceOf(
          ShiprocketWriteOutcomeUnknownError
        );
        expect(status, `${clause} says a mint may have happened but answers ${status}`).toBe(409);
      } else if (verdict === 'credential') {
        expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
        expect(status).toBe(503);
      } else {
        expect(error, `${clause} rules a mint out but answers the unknown-outcome type`).not.toBeInstanceOf(
          ShiprocketWriteOutcomeUnknownError
        );
        expect(status, `${clause} rules a mint out and still answers 409`).not.toBe(409);
      }
    }
  );

  /**
   * One entry per boundary a single body can stand on BOTH sides of.
   *
   * This is what makes the order load-bearing rather than incidental. A pair
   * no body can satisfy at once is a pair whose order decides nothing, and
   * pinning such an order is theatre; a pair a real body satisfies is a pair
   * where moving one clause changes the sentence a dispatcher acts on. The
   * account below requires every adjacency in every table to be either one of
   * these or an entry in `EXCLUSIVE_ADJACENCIES` with a reason.
   */
  const ORDER_DECIDES: ReadonlyArray<{
    table: string;
    earlier: string;
    later: string;
    produce: () => Promise<unknown>;
    assert: (error: Error) => void;
  }> = [
    {
      table: 'create: a refused answer',
      earlier: 'token-rejected',
      later: 'order-may-already-exist',
      // A 401 whose body ALSO says the order exists. Their sentence on a 401
      // is about the credential, and reading it as evidence about the parcel
      // sends an operator to reconcile an order the request never reached the
      // service to create.
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(401, { message: 'The order id has already been taken.' })
        );
        return createCourierOrder(input(), lookupReturning(null));
      },
      assert: (error) => {
        expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
      },
    },
    {
      table: 'create: a refused answer',
      earlier: 'order-may-already-exist',
      later: 'pickup-location-unknown',
      // One 422 saying both things. If the pickup clause were asked first the
      // caller would be told to fix a nickname and re-send — a second real
      // order for a parcel that already has one.
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, {
            message: 'Wrong Pickup location.',
            errors: { order_id: ['The order id has already been taken.'] },
          })
        );
        return createCourierOrder(input(), lookupReturning(null));
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
        expect(error).not.toBeInstanceOf(ShiprocketPickupLocationError);
      },
    },
    {
      table: 'create: a refused answer',
      earlier: 'pickup-location-unknown',
      later: 'create-rejected',
      // Both clauses accept this body; only the earlier one names the field an
      // admin can go and fix. The generic refusal would strand the parcel
      // behind "the reason is in the API logs".
      produce: async () => {
        stubFetch(async () => refusedResponse(422, { message: 'Wrong Pickup location.' }));
        return createCourierOrder(input(), lookupReturning(null));
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketPickupLocationError);
        expect(error.message).toContain(PICKUP_NICKNAME);
      },
    },
    {
      table: 'assign: a refused answer',
      earlier: 'token-rejected',
      later: 'waybill-may-already-exist',
      // The create side's twin, asserted on the other write rather than
      // assumed from it. Both writes take these three clauses from one factory
      // precisely because every asymmetry this file has been caught with was
      // an argument applied once and dropped once.
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(401, { message: 'AWB is already assigned to this shipment' })
        );
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
      assert: (error) => {
        expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
      },
    },
    {
      table: 'assign: a refused answer',
      earlier: 'waybill-may-already-exist',
      later: 'awb-refused',
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, { message: 'AWB is already assigned to this shipment' })
        );
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
        expect(error).not.toBeInstanceOf(ShiprocketAwbRefusedError);
      },
    },
    {
      table: 'assign: an accepted answer',
      earlier: 'answered-for-another-shipment',
      later: 'waybill-without-courier',
      // An assigned waybill stamped with somebody else's shipment id AND with
      // no courier named. Both clauses are unknown outcomes, so the order
      // decides which sentence an operator reads — and only the attribution
      // one tells them the answer was not about their parcel at all.
      produce: async () => {
        stubFetch(async () =>
          awbAssignedResponse({ courier_name: '', shipment_id: 999888777 })
        );
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
        expect(error.message).toContain('a different shipment');
      },
    },
    {
      table: 'assign: an accepted answer',
      earlier: 'waybill-without-courier',
      later: 'waybill-too-long',
      // A waybill that is both unattributable and unstorable. Both are unknown
      // outcomes, so the order decides only which sentence an operator reads —
      // and the courier one is the one they can act on from the dashboard.
      produce: async () => {
        stubFetch(async () =>
          awbAssignedResponse({ courier_name: '', awb_code: 'W'.repeat(65) })
        );
        return assignAwb({ shipmentId: String(SR_SHIPMENT_ID) });
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
        expect(error.message).toContain('named no courier');
      },
    },
    {
      table: 'label: a refused answer',
      earlier: 'token-rejected',
      later: 'label-may-already-exist',
      // The third write's twin of the same boundary. A 401 whose body also
      // says a label exists is about the credential, not the label.
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(401, { message: 'Label already generated for this shipment' })
        );
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
      assert: (error) => {
        expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
      },
    },
    {
      table: 'label: a refused answer',
      earlier: 'label-may-already-exist',
      later: 'label-refused',
      // The boundary that costs money if it is crossed the wrong way: the
      // floor's sentence is "no label exists, ask again", and a label that
      // exists is billed again on the asking.
      produce: async () => {
        stubFetch(async () =>
          refusedResponse(422, { message: 'Label already generated for this shipment' })
        );
        return generateLabel({ shipmentId: String(SR_SHIPMENT_ID), heldLabelObjectToken: null });
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
        expect(error).not.toBeInstanceOf(ShiprocketLabelRefusedError);
        expect(error.message).toContain('billed');
      },
    },
  ];

  /**
   * The adjacencies no single answer can stand on both sides of, each argued.
   *
   * An account with no exemptions would be a lie — three of these pairs really
   * are mutually exclusive, and demanding a body for them would mean writing
   * one that cannot exist. An account with SILENT exemptions is worse: it is
   * how a boundary that does decide something stops being examined. So the
   * exemption is a named entry with a reason, in the shape
   * `tests/lib/audit-action-waivers.ts` uses for the same problem.
   */
  const EXCLUSIVE_ADJACENCIES: ReadonlyArray<{ at: string; reason: string }> = [
    {
      at: 'create: a refused answer :: write-incomplete -> token-rejected',
      reason:
        '401 sits inside the 4xx range write-incomplete excludes, so no status satisfies both.',
    },
    {
      at: 'assign: a refused answer :: write-incomplete -> token-rejected',
      reason:
        '401 sits inside the 4xx range write-incomplete excludes, so no status satisfies both.',
    },
    {
      at: 'assign: an accepted answer :: answer-unreadable -> answered-for-another-shipment',
      reason:
        'An unreadable answer has no envelope, so it never carries a shipment id to attribute.',
    },
    {
      at: 'assign: an accepted answer :: waybill-too-long -> awb-declined',
      reason:
        'One needs an assigned waybill, the other needs Shiprocket to have said it minted none.',
    },
    {
      at: 'label: a refused answer :: write-incomplete -> token-rejected',
      reason:
        '401 sits inside the 4xx range write-incomplete excludes, so no status satisfies both.',
    },
    {
      at: 'label: an accepted answer :: answer-unreadable -> label-without-url',
      reason:
        'An unreadable body has no label_created flag to read; the other needs that flag at 1.',
    },
    {
      at: 'label: an accepted answer :: label-without-url -> label-url-unusable',
      reason:
        'One needs the label_url blank, the other needs it present and not https; one field, two values.',
    },
    {
      at: 'label: an accepted answer :: label-url-unusable -> label-declined',
      reason:
        'One needs a label_url to judge, the other is only reached when the URL is blank and they said no.',
    },
  ];

  /** Every adjacency in every table, as `table :: earlier -> later`. */
  const adjacencies = (): string[] =>
    Object.entries(COURIER_WRITE_CLAUSES).flatMap(([table, clauses]) =>
      clauses.slice(1).map((clause, i) => `${table} :: ${clauses[i]!.code} -> ${clause.code}`)
    );

  const boundary = (entry: { table: string; earlier: string; later: string }) =>
    `${entry.table} :: ${entry.earlier} -> ${entry.later}`;

  it('names a real precedence for every boundary it claims to decide', () => {
    // Otherwise the table drifts into asserting an ordering nothing has: a
    // pair no longer in the module, or now the other way round, is still green
    // while proving nothing about the sequence that runs.
    for (const entry of ORDER_DECIDES) {
      const clauses = COURIER_WRITE_CLAUSES[entry.table];
      expect(clauses, `${entry.table} is not a table this module declares`).toBeDefined();

      const at = (code: string) => clauses!.findIndex((clause) => clause.code === code);
      expect(at(entry.earlier), `${entry.earlier} is not in ${entry.table}`).toBeGreaterThanOrEqual(
        0
      );
      expect(
        at(entry.earlier),
        `${entry.earlier} is not asked before ${entry.later}`
      ).toBeLessThan(at(entry.later));
    }
  });

  it('examines every adjacency, or says in as many words why it cannot', () => {
    const examined = new Set(ORDER_DECIDES.map(boundary));
    const exempt = new Map(EXCLUSIVE_ADJACENCIES.map((entry) => [entry.at, entry.reason]));

    const unexamined = adjacencies().filter((at) => !examined.has(at) && !exempt.has(at));
    expect(unexamined, `no body and no reason for: ${unexamined.join(', ')}`).toEqual([]);

    // ...and the exemptions are held to the same standard: an entry naming a
    // pair that is no longer adjacent is an argument about nothing, and a
    // one-word reason is not an argument.
    for (const entry of EXCLUSIVE_ADJACENCIES) {
      expect(adjacencies(), `${entry.at} is exempted and is not an adjacency`).toContain(entry.at);
      expect(entry.reason.length, `${entry.at} has no real reason`).toBeGreaterThan(20);
    }
  });

  it('the adjacency account is not vacuous — a new boundary would be unexamined', () => {
    const examined = new Set(ORDER_DECIDES.map(boundary));
    const exempt = new Set(EXCLUSIVE_ADJACENCIES.map((entry) => entry.at));
    const planted = [...adjacencies(), 'create: a refused answer :: create-rejected -> cancelled'];

    expect(planted.filter((at) => !examined.has(at) && !exempt.has(at))).toEqual([
      'create: a refused answer :: create-rejected -> cancelled',
    ]);
  });

  it.each(ORDER_DECIDES)(
    '$table :: $earlier is asked before $later, and it decides',
    async ({ produce, assert }) => {
      const error = await produce()
        .then(() => null)
        .catch((e: Error) => e);

      expect(error, 'the body satisfying both clauses produced no refusal').not.toBeNull();
      assert(error!);
    }
  );

  it('does not file a 5xx carrying an auth sentence as a dead token', async () => {
    // The pair `write-incomplete -> token-rejected` is exempt above because no
    // status satisfies both — but "exempt" must not mean "unchecked". A
    // classifier that read the SENTENCE rather than the status would drop a
    // live token on every upstream 503 that mentions authorisation, and then
    // log in again on the next call for no reason.
    stubFetch(async () => refusedResponse(503, { message: 'Unauthorized upstream' }));

    const error = await createCourierOrder(input(), lookupReturning(null))
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    expect(error!.message).toContain('did not complete');
    expect((error as ShiprocketError).code).not.toBe('SHIPROCKET_AUTH_EXPIRED');
  });
});

// ============================================================================
// The module account — nothing crosses this boundary unexamined
// ============================================================================

describe('the shiprocket module contract', () => {
  /**
   * The calls that make something real at a courier. Three of them cost
   * money; the pickup does not, and is the one whose refusal may be retried.
   */
  const writes = [
    'createCourierOrder',
    'assignAwb',
    'generateLabel',
    'schedulePickup',
    'cancelCourierShipment',
  ] as const;

  /** Repeatable reads and pure selection over their answers. */
  const reads = ['checkServiceability', 'selectCourier', 'selectCourierFor'] as const;

  /** Configuration, credentials and the test-only cache reset. */
  const configAndAuth = [
    'isShiprocketConfigured',
    'assertShiprocketConfigured',
    'getShiprocketConfig',
    'getShiprocketAuthToken',
    'resetShiprocketAuthCacheForTests',
  ] as const;

  /** Pure helpers — no network, no credentials, no state. */
  const pureHelpers = ['courierOrderReference', 'orderedClauses'] as const;

  /**
   * Exported error types. `typeof` a class is `'function'`, so they land in the
   * account and have to be named — which is right: an error a route catches by
   * identity is part of this module's contract.
   */
  const errorTypes = [
    'ShiprocketError',
    'ShiprocketAuthError',
    'ShiprocketNotServiceableError',
    'ShiprocketNotConfiguredError',
    'ShiprocketAuthExpiredError',
    'ShiprocketWriteOutcomeUnknownError',
    'ShiprocketPickupLocationError',
    'ShiprocketAwbRefusedError',
    'ShiprocketOrderTotalMismatchError',
    'ShiprocketLabelRefusedError',
    'ShiprocketLabelFetchFailedError',
    'ShiprocketPickupNotScheduledError',
    'ShiprocketCancelRefusedError',
  ] as const;

  /** Constants and vocabularies other files read. */
  const constants = [
    'SHIPROCKET_ENV_VARS',
    'SHIPROCKET_REFUSAL_CODES',
    'SHIPROCKET_REFUSAL_STATUS',
    'COURIER_ADHOC_PAYLOAD_KEYS',
    'COURIER_WRITE_CLAUSES',
    'EXTERNAL_ID_MAX_LENGTH',
    'READ_TIMEOUT_MS',
    'WRITE_TIMEOUT_MS',
    'LABEL_PDF_MAX_BYTES',
  ] as const;

  const exportedNames = (): string[] => Object.keys(shiprocket);

  /**
   * The names no vocabulary above accounts for.
   *
   * Factored out so the account and its not-vacuous guard share ONE
   * implementation, bound to the REAL export list — the mistake
   * `tests/lib/vendor-scope.test.ts:129-147` records having made, where the
   * guard filtered a literal beside it and passed with the module deleted.
   */
  const unaccounted = (names: readonly string[]): string[] =>
    names.filter(
      (name) =>
        !(writes as readonly string[]).includes(name) &&
        !(reads as readonly string[]).includes(name) &&
        !(configAndAuth as readonly string[]).includes(name) &&
        !(pureHelpers as readonly string[]).includes(name) &&
        !(errorTypes as readonly string[]).includes(name) &&
        !(constants as readonly string[]).includes(name)
    );

  it('exports every name the vocabularies claim', () => {
    for (const name of [...writes, ...reads, ...configAndAuth, ...pureHelpers, ...errorTypes]) {
      expect(typeof (shiprocket as Record<string, unknown>)[name], `${name} missing`).toBe(
        'function'
      );
    }
    for (const name of constants) {
      expect((shiprocket as Record<string, unknown>)[name], `${name} missing`).toBeDefined();
    }
  });

  it('exposes nothing this suite has not examined', () => {
    // Seven runtime exports arrived with #726. Without this, an eighth — a
    // second write, a helper that reaches for `db`, a cache reset with no
    // caller — arrives with nobody noticing.
    expect(unaccounted(exportedNames())).toEqual([]);
  });

  it('the account is not vacuous — an unenrolled export would show up', () => {
    const exported = exportedNames();
    expect(exported, 'the module exported nothing').toContain('createCourierOrder');
    expect(unaccounted([...exported, 'cancelCourierOrderSomeday'])).toEqual([
      'cancelCourierOrderSomeday',
    ]);
  });

  it('every error type is a ShiprocketError, so one catch covers the client', () => {
    for (const name of errorTypes) {
      const type = (shiprocket as Record<string, unknown>)[name] as new (m: string) => Error;
      expect(new type('x'), `${name} escapes the shared catch`).toBeInstanceOf(ShiprocketError);
    }
  });
});

// A source scan, because the property is about what the module IMPORTS, and
// no behavioural fixture can see an import. Comments are stripped first so the
// prose in the module header — which has to name `../database` to explain why
// it is absent — is judged as prose and not as code.
describe('the carrier client stays a carrier client', () => {
  const SOURCE = resolve(__dirname, '../../src/services/shiprocket.ts');

  /** Pure: a file's contents in, the offending import lines out. */
  function databaseImports(contents: string): string[] {
    const code = contents
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    return code
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line))
      .filter((line) => /['"][^'"]*\/database/.test(line) || /\bdrizzle-orm\b/.test(line));
  }

  it('imports no database, so idempotency has to be injected', () => {
    // The client is handed a lookup rather than reaching for `db` itself. That
    // is what keeps the module callable from a test with no database, and what
    // stops a carrier client growing a second responsibility — the same reason
    // `ProductionReader` in lib/production-readiness.ts is one method.
    expect(databaseImports(readFileSync(SOURCE, 'utf8'))).toEqual([]);
  });

  it('CAN fail: it catches a planted database import', () => {
    expect(
      databaseImports("import { db } from '../database';\nimport { eq } from 'drizzle-orm';\n")
    ).toHaveLength(2);
    // ...and clears prose that merely mentions it, so it is a check and not a
    // blanket refusal.
    expect(databaseImports("// see ../database for the schema\nimport { toPaise } from '../lib/razorpay';\n")).toEqual(
      []
    );
  });
});

// The constant cannot import the column without giving this module the
// database import the scan above forbids, so the coupling is asserted here
// instead: the schema source is read from disk and the declared width compared
// to the number the client refuses on.
describe('EXTERNAL_ID_MAX_LENGTH tracks the column', () => {
  const SCHEMA = resolve(__dirname, '../../src/database/schema/shipping.ts');

  /** Pure: schema source in, the declared varchar length out. */
  function declaredLength(contents: string, column: string): number | null {
    const match = contents.match(
      new RegExp(`varchar\\("${column}",\\s*\\{\\s*length:\\s*(\\d+)\\s*\\}\\)`)
    );
    return match ? Number(match[1]) : null;
  }

  it('matches external_order_id, external_shipment_id and awb_number', () => {
    // A constant that drifted from the column turns a refusal we control into
    // a driver error at INSERT time, one layer too late to name the courier.
    const schema = readFileSync(SCHEMA, 'utf8');
    for (const column of ['external_order_id', 'external_shipment_id', 'awb_number']) {
      expect(declaredLength(schema, column), `${column} is not varchar(n)`).toBe(
        EXTERNAL_ID_MAX_LENGTH
      );
    }
  });

  it('CAN fail: the reader returns the real number, not the expected one', () => {
    expect(declaredLength('x: varchar("awb_number", { length: 12 }),', 'awb_number')).toBe(12);
    expect(declaredLength('x: text("awb_number"),', 'awb_number')).toBeNull();
  });
});

// The reference is the one string a support agent searches Shiprocket by, and
// it is built out of an order number this shop issues. `lib/order-number.ts`
// cannot be imported here — it reaches for `db` — so its prefix is read off
// the source, the same way the column width above is.
describe('the reference the courier is given', () => {
  const ORDER_NUMBER_SOURCE = resolve(__dirname, '../../src/lib/order-number.ts');

  /** Pure: the order-number source in, the prefix it issues today out. */
  function issuedPrefix(contents: string): string | null {
    return contents.match(/ORDER_NUMBER_PREFIX\s*=\s*"([A-Z]+)"/)?.[1] ?? null;
  }

  it('is built from an order number this shop actually issues', () => {
    // The fixture used to read `CHB-2026-000412`, a prefix this codebase has
    // never issued, so the builder was never exercised against a shape the
    // store produces — and the doc claiming the result "has one delimiter and
    // reads as one token" was measured against a shape with one dash rather
    // than the real `CA-YYYY-NNNNNN`, which has two of its own.
    const prefix = issuedPrefix(readFileSync(ORDER_NUMBER_SOURCE, 'utf8'));

    expect(prefix, 'the issued prefix could not be read').not.toBeNull();
    expect(ORDER_NUMBER.startsWith(`${prefix}-`), `${ORDER_NUMBER} is not a ${prefix} number`).toBe(
      true
    );
    expect(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID)).toBe(
      `${ORDER_NUMBER}-b3d9f1a4`
    );
    // The whole order number survives verbatim, because that is the string a
    // customer quotes and a support agent pastes into the dashboard search.
    expect(courierOrderReference(ORDER_NUMBER, SHIPMENT_ROW_ID)).toMatch(
      new RegExp(`^${prefix}-\\d{4}-\\d{6}-[0-9a-f]{8}$`)
    );
  });

  it('CAN fail: the reader returns the real prefix, not the expected one', () => {
    expect(issuedPrefix('export const ORDER_NUMBER_PREFIX = "ZZ";')).toBe('ZZ');
    expect(issuedPrefix('export const SOMETHING_ELSE = "CA";')).toBeNull();
  });
});
