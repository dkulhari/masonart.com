/**
 * The cached Shiprocket token, and when it is thrown away (#724).
 *
 * Shiprocket issues a JWT and rate-limits the login endpoint, so logging in per
 * request is both slower and a way to get locked out. The token is cached and
 * refreshed shortly before it expires.
 *
 * ## Why `exp` is parsed rather than assumed
 *
 * The live account was observed handing back a token valid for 10 days. That is
 * an observation, not a contract: the TTL is Shiprocket's to change, and a
 * hardcoded 10 would keep serving a dead token for the difference. Every
 * assertion here therefore drives the clock against the `exp` claim in the token
 * the fake login returns, never against a constant in the test.
 *
 * ## The 403 case is the one with teeth
 *
 * Wrong credentials answer 403, not 401 (measured). A 403 that gets cached as
 * though it were a token turns a fixable configuration mistake into a silent
 * outage lasting until a restart, so the refusal must leave the cache empty.
 * Equally it must not retry in a loop: the endpoint is rate-limited, and a
 * retry storm against auth is how the whole integration stops working.
 *
 * @see packages/api/src/services/shiprocket.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  getShiprocketAuthToken,
  resetShiprocketAuthCacheForTests,
  ShiprocketAuthError,
  ShiprocketNotConfiguredError,
} from '../../src/services/shiprocket';

const EMAIL = 'api-user@example.test';
const SECRET = 'sr-p@ssw0rd-never-in-a-message';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A JWT whose payload carries the given expiry. Only `exp` is ever read. */
function tokenExpiringAt(when: Date): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ id: 1, exp: Math.floor(when.getTime() / 1000) })
  ).toString('base64url');
  return `${header}.${payload}.not-a-real-signature`;
}

function loginOk(expiry: Date) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ token: tokenExpiringAt(expiry), company_id: 11422984 }),
  } as unknown as Response;
}

function loginRejected() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ message: 'Invalid email and password combination', status_code: 403 }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetShiprocketAuthCacheForTests();

  process.env.SHIPROCKET_EMAIL = EMAIL;
  process.env.SHIPROCKET_PASSWORD = SECRET;
  delete process.env.SHIPROCKET_BASE_URL;

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.SHIPROCKET_EMAIL;
  delete process.env.SHIPROCKET_PASSWORD;
});

describe('getShiprocketAuthToken', () => {
  it('logs in once and returns the token', async () => {
    fetchMock.mockResolvedValue(loginOk(new Date(NOW.getTime() + 10 * DAY)));

    const token = await getShiprocketAuthToken();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/auth/login');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('reuses the cached token instead of logging in again', async () => {
    fetchMock.mockResolvedValue(loginOk(new Date(NOW.getTime() + 10 * DAY)));

    const first = await getShiprocketAuthToken();
    vi.setSystemTime(new Date(NOW.getTime() + 2 * DAY));
    const second = await getShiprocketAuthToken();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the token is inside the margin of its own expiry', async () => {
    const expiry = new Date(NOW.getTime() + 10 * DAY);
    fetchMock.mockResolvedValue(loginOk(expiry));

    const first = await getShiprocketAuthToken();

    // Twelve hours before it expires — inside any sane margin.
    vi.setSystemTime(new Date(expiry.getTime() - 12 * HOUR));
    fetchMock.mockResolvedValue(loginOk(new Date(expiry.getTime() + 10 * DAY)));
    const second = await getShiprocketAuthToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('reads the expiry from the token, not from a constant', async () => {
    // A SHORT-lived token. If the margin were measured against an assumed
    // 10-day life, this would be treated as fresh for days after it died.
    const shortLived = new Date(NOW.getTime() + 2 * HOUR);
    fetchMock.mockResolvedValue(loginOk(shortLived));

    await getShiprocketAuthToken();
    vi.setSystemTime(new Date(NOW.getTime() + HOUR));
    await getShiprocketAuthToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not log in again while the token is comfortably fresh', async () => {
    const expiry = new Date(NOW.getTime() + 10 * DAY);
    fetchMock.mockResolvedValue(loginOk(expiry));

    await getShiprocketAuthToken();
    for (const days of [1, 3, 5, 7]) {
      vi.setSystemTime(new Date(NOW.getTime() + days * DAY));
      await getShiprocketAuthToken();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when Shiprocket refuses the credentials', () => {
  it('throws ShiprocketAuthError on a 403', async () => {
    fetchMock.mockResolvedValue(loginRejected());

    await expect(getShiprocketAuthToken()).rejects.toBeInstanceOf(ShiprocketAuthError);
  });

  it('names neither the password nor the token in the message', async () => {
    fetchMock.mockResolvedValue(loginRejected());

    let message = '';
    try {
      await getShiprocketAuthToken();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain(SECRET);
    expect(message.length).toBeGreaterThan(0);
  });

  it('caches nothing, so fixing the credentials does not need a restart', async () => {
    fetchMock.mockResolvedValue(loginRejected());
    await expect(getShiprocketAuthToken()).rejects.toBeInstanceOf(ShiprocketAuthError);

    // The operator corrects the API user. No process restart.
    fetchMock.mockResolvedValue(loginOk(new Date(NOW.getTime() + 10 * DAY)));
    const token = await getShiprocketAuthToken();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('does not retry a 403 in a loop', async () => {
    // The auth endpoint is rate-limited. A refusal is the operator's to fix, so
    // hammering it converts a wrong password into a locked-out integration.
    fetchMock.mockResolvedValue(loginRejected());

    await expect(getShiprocketAuthToken()).rejects.toBeInstanceOf(ShiprocketAuthError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when Shiprocket is not configured', () => {
  it('refuses before it reaches the network', async () => {
    delete process.env.SHIPROCKET_EMAIL;
    delete process.env.SHIPROCKET_PASSWORD;

    await expect(getShiprocketAuthToken()).rejects.toBeInstanceOf(ShiprocketNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('concurrent callers on a cold cache', () => {
  it('log in once between them, not once each', async () => {
    // A burst of dispatches all starting with no token would otherwise answer
    // its own request storm with 429s from a rate-limited endpoint.
    let resolveLogin: (r: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      })
    );

    const all = Promise.all([
      getShiprocketAuthToken(),
      getShiprocketAuthToken(),
      getShiprocketAuthToken(),
      getShiprocketAuthToken(),
    ]);

    resolveLogin!(loginOk(new Date(NOW.getTime() + 10 * DAY)));
    const tokens = await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(tokens).size).toBe(1);
  });

  it('lets a later caller retry after a shared failure', async () => {
    // The in-flight promise must be cleared on rejection too, or one bad login
    // poisons every subsequent call for the life of the process.
    fetchMock.mockResolvedValue(loginRejected());
    await expect(
      Promise.all([getShiprocketAuthToken(), getShiprocketAuthToken()])
    ).rejects.toBeInstanceOf(ShiprocketAuthError);

    fetchMock.mockResolvedValue(loginOk(new Date(NOW.getTime() + 10 * DAY)));
    await expect(getShiprocketAuthToken()).resolves.toEqual(expect.any(String));
  });
});

describe('a token whose expiry cannot be read', () => {
  it('is used, but trusted only briefly', async () => {
    // Shiprocket changing their token format should not be a total outage. It
    // should cost an extra login an hour.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'not.a.jwt', company_id: 1 }),
    } as unknown as Response);

    const first = await getShiprocketAuthToken();
    expect(first).toBe('not.a.jwt');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Well past any short fallback, and nowhere near ten days.
    vi.setSystemTime(new Date(NOW.getTime() + 2 * DAY));
    await getShiprocketAuthToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
