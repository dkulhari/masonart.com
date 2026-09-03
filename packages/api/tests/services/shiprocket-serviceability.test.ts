/**
 * Which couriers can carry this parcel, and which one we pick (#725).
 *
 * ## Written around what the live account actually returns
 *
 * A probe against the real account on 2026-08-31 offered exactly ONE courier:
 *
 *   { courier_name: "Blue Dart Air", rate: 153.15, etd: "Sep 03, 2026",
 *     cod: 1, courier_company_id: 1 }
 *
 * That is not an edge case here, it is the normal case: a fresh, un-KYC'd
 * account is offered almost nothing, and a selector written against a rich list
 * of competing couriers would fail on its first real call. So zero and one are
 * the cases these tests lead with, and "several, pick the cheapest" comes after.
 *
 * ## Zero couriers is an answer, not a fault
 *
 * It means "we cannot ship this route today" — a fact an admin can act on by
 * choosing a different courier account or telling the customer. It must not
 * surface as something indistinguishable from Shiprocket being down, which is
 * why it has its own error type carrying both pincodes rather than a generic
 * throw or a null that a caller can walk past.
 *
 * ## What is deliberately NOT used
 *
 * Each courier record carries ~50 fields including SLA_Adherence, SLA_Breach,
 * RTO w/o_Attempt and Attempt_Speed. None of them tie-break the selection. We
 * have no evidence they mean what their names suggest, and a ranking built on
 * a misread field is worse than one built on price alone, because it looks
 * considered.
 *
 * @see packages/api/src/services/shiprocket.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  checkServiceability,
  selectCourier,
  selectCourierFor,
  ShiprocketError,
  ShiprocketNotServiceableError,
  READ_TIMEOUT_MS,
  resetShiprocketAuthCacheForTests,
  type CourierOption,
} from '../../src/services/shiprocket';

const FROM = '400072';
const TO = '560001';

/** Shaped exactly like the live response, trimmed to the fields we read. */
function courier(over: Record<string, unknown> = {}) {
  return {
    courier_company_id: 1,
    courier_name: 'Blue Dart Air',
    rate: 153.15,
    etd: 'Sep 03, 2026',
    cod: 1,
    blocked: 0,
    SLA_Adherence: 99,
    'RTO w/o_Attempt': 0,
    ...over,
  };
}

function serviceabilityResponse(couriers: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { available_courier_companies: couriers } }),
  } as unknown as Response;
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

let fetchMock: ReturnType<typeof vi.fn>;

/** Answers login, then serviceability with whatever the test queued. */
function stubFetch(couriers: Array<Record<string, unknown>>) {
  fetchMock.mockImplementation(async (url: unknown) => {
    if (String(url).includes('/auth/login')) return authResponse();
    return serviceabilityResponse(couriers);
  });
}

beforeEach(() => {
  resetShiprocketAuthCacheForTests();
  process.env.SHIPROCKET_EMAIL = 'api-user@example.test';
  process.env.SHIPROCKET_PASSWORD = 'irrelevant-here';
  // Backported from `shiprocket-courier-writes.test.ts`, which argues it at
  // length. Everything here is a repeatable READ and `fetch` is stubbed, so
  // nothing in this file could spend money even if the stub came off — but
  // the stubbed URLs literally spelled the live host, which is a bad habit to
  // leave lying next to a file that must never address it. `.invalid` is
  // reserved by RFC 2606 and never resolves.
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

describe('checkServiceability', () => {
  it('asks with the pincodes, weight and COD flag', async () => {
    stubFetch([courier()]);

    await checkServiceability({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 0.5, cod: false });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('serviceability'));
    expect(call, 'no serviceability request was made').toBeDefined();
    const url = String(call![0]);
    expect(url).toContain(`pickup_postcode=${FROM}`);
    expect(url).toContain(`delivery_postcode=${TO}`);
    expect(url).toContain('weight=0.5');
    expect(url).toContain('cod=0');
  });

  it('carries the bearer token', async () => {
    stubFetch([courier()]);

    await checkServiceability({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('serviceability'));
    const headers = (call![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
  });

  it('maps the live shape onto our own', async () => {
    stubFetch([courier()]);

    const [option] = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 0.5, cod: false,
    });

    expect(option).toEqual<CourierOption>({
      courierCompanyId: 1,
      courierName: 'Blue Dart Air',
      ratePaise: 15315,
      etd: 'Sep 03, 2026',
      supportsCod: true,
      blocked: false,
    });
  });

  it('converts the rupee rate to paise without float drift', async () => {
    // 153.15 * 100 is 15314.999... in binary floating point. Truncating gives
    // 15314 and loses a paisa on every shipment; `cost_paise` is an integer
    // column so the rounding has to happen here, deliberately.
    stubFetch([courier({ rate: 153.15 })]);
    const [a] = await checkServiceability({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false });
    expect(a!.ratePaise).toBe(15315);

    stubFetch([courier({ rate: 0.1 + 0.2 })]);
    const [b] = await checkServiceability({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false });
    expect(b!.ratePaise).toBe(30);
  });

  it('drops a courier that quoted no rate, rather than pricing it at zero', async () => {
    // `Number(null)` is 0 and `Number('')` is 0, and 0 is finite — so a courier
    // whose `rate` was missing used to arrive as a courier costing nothing,
    // which then WON `selectCourier`'s cheapest-option loop and was quoted to
    // an admin as free. A rate we did not receive is not a rate of zero.
    stubFetch([
      courier({ courier_company_id: 7, courier_name: 'No Rate Express', rate: null }),
      courier({ courier_company_id: 8, courier_name: 'Blank Rate Ltd', rate: '' }),
      courier({ courier_company_id: null, courier_name: 'Missing Id Ltd' }),
    ]);

    const options = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false,
    });

    expect(options).toEqual([]);
  });

  it('keeps a courier that quoted a real zero, because free shipping is a rate', async () => {
    // The paired positive control: the guard is about a MISSING rate, not
    // about a cheap one, and a filter that dropped both would silently hide a
    // promotional courier from selection.
    stubFetch([courier({ rate: 0 })]);

    const [option] = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false,
    });

    expect(option!.ratePaise).toBe(0);
  });

  it('returns an empty list when nothing serves the route', async () => {
    stubFetch([]);

    const options = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false,
    });

    expect(options).toEqual([]);
  });

  it('bounds the read, and answers a timeout with a code rather than a DOMException', async () => {
    // The bound arrived with #726 and its failure was never wrapped. When
    // `AbortSignal.timeout` fires it throws a `DOMException`, which is not a
    // `ShiprocketError` and carries no `code` — so a route doing
    // `if (e instanceof ShiprocketError) return c.json({ code: e.code },
    // SHIPROCKET_REFUSAL_STATUS[e.code])` falls through to a 500, and the 502
    // this exact condition is declared to answer with never applies.
    // `selectCourierFor` sits directly in front of the courier write on the
    // dispatch path, so this is the read that fails first.
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).includes('/auth/login')) return authResponse();
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    const error = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false,
    })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_SERVICEABILITY_FAILED');
    // ...and the bound is actually attached. Without this the constant could
    // be deleted and every other test in this file would stay green.
    expect(timeout).toHaveBeenCalledWith(READ_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it('answers a login that never returns with a code too', async () => {
    // Every call in this module logs in first, so an unbounded, untyped login
    // makes the two properties above true of a path nothing reaches. A refusal
    // vocabulary that does not cover the most-exercised path in the file is a
    // route improvising a 500.
    fetchMock.mockImplementation(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    const error = await checkServiceability({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false,
    })
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ShiprocketError);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_UNREACHABLE');
  });

  it('survives a response with no data envelope', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).includes('/auth/login')) return authResponse();
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });

    await expect(
      checkServiceability({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false })
    ).resolves.toEqual([]);
  });
});

describe('selectCourier', () => {
  const option = (over: Partial<CourierOption>): CourierOption => ({
    courierCompanyId: 1,
    courierName: 'Blue Dart Air',
    ratePaise: 15315,
    etd: null,
    supportsCod: true,
    blocked: false,
    ...over,
  });

  it('picks the only courier when there is only one', () => {
    // The live account's actual situation today.
    const only = option({ courierCompanyId: 1 });
    expect(selectCourier([only], { cod: false })).toBe(only);
  });

  it('returns null when the list is empty', () => {
    expect(selectCourier([], { cod: false })).toBeNull();
  });

  it('picks the cheapest', () => {
    const cheap = option({ courierCompanyId: 2, courierName: 'Cheap', ratePaise: 9000 });
    const dear = option({ courierCompanyId: 3, courierName: 'Dear', ratePaise: 20000 });
    expect(selectCourier([dear, cheap], { cod: false })).toBe(cheap);
  });

  it('skips a cheaper courier that is blocked', () => {
    const blocked = option({ courierCompanyId: 2, ratePaise: 100, blocked: true });
    const usable = option({ courierCompanyId: 3, ratePaise: 20000 });
    expect(selectCourier([blocked, usable], { cod: false })).toBe(usable);
  });

  it('refuses a courier that cannot do COD when the order is COD', () => {
    const noCod = option({ courierCompanyId: 2, ratePaise: 100, supportsCod: false });
    const doesCod = option({ courierCompanyId: 3, ratePaise: 20000, supportsCod: true });
    expect(selectCourier([noCod, doesCod], { cod: true })).toBe(doesCod);
  });

  it('happily uses a non-COD courier for a prepaid order', () => {
    const noCod = option({ courierCompanyId: 2, ratePaise: 100, supportsCod: false });
    expect(selectCourier([noCod], { cod: false })).toBe(noCod);
  });

  it('returns null when every option is blocked', () => {
    expect(selectCourier([option({ blocked: true })], { cod: false })).toBeNull();
  });

  it('does not tie-break on the SLA fields', () => {
    // Two identical prices. Whichever wins, it must not be because of a metric
    // we never agreed to trust — so the first is kept, deterministically.
    const first = option({ courierCompanyId: 2, courierName: 'First', ratePaise: 10000 });
    const second = option({ courierCompanyId: 3, courierName: 'Second', ratePaise: 10000 });
    expect(selectCourier([first, second], { cod: false })).toBe(first);
  });
});

describe('selectCourierFor', () => {
  it('returns the chosen courier', async () => {
    stubFetch([courier()]);

    const chosen = await selectCourierFor({
      pickupPincode: FROM, deliveryPincode: TO, weightKg: 0.5, cod: false,
    });

    expect(chosen.courierName).toBe('Blue Dart Air');
  });

  it('refuses with both pincodes when nothing serves the route', async () => {
    stubFetch([]);

    let error: Error | null = null;
    try {
      await selectCourierFor({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeInstanceOf(ShiprocketNotServiceableError);
    // An admin reading this has to know which leg failed without a log dive.
    expect(error!.message).toContain(FROM);
    expect(error!.message).toContain(TO);
  });

  it('carries a code distinct from an outage', async () => {
    // Mapped to a 422-style refusal by the admin API, never a 500. "Nobody
    // delivers this route" and "Shiprocket is down" are different sentences.
    stubFetch([]);

    try {
      await selectCourierFor({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: false });
      expect.unreachable('selectCourierFor did not throw');
    } catch (error) {
      expect((error as ShiprocketNotServiceableError).code).toBe('SHIPROCKET_NOT_SERVICEABLE');
    }
  });

  it('refuses when a COD order has only non-COD couriers', async () => {
    stubFetch([courier({ cod: 0 })]);

    await expect(
      selectCourierFor({ pickupPincode: FROM, deliveryPincode: TO, weightKg: 1, cod: true })
    ).rejects.toBeInstanceOf(ShiprocketNotServiceableError);
  });
});
