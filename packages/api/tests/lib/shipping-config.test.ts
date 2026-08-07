/**
 * The free-shipping threshold, read from config instead of the bundle.
 *
 * Three properties are worth a test each, and all three are failure modes that
 * are silent in production:
 *
 * 1. **The shared constant is always the floor.** No row, an empty table, or a
 *    database that is simply down must all charge exactly what the storefront
 *    copy promises. The two ways to get this wrong — returning 0 (everything
 *    ships free) or Infinity (nothing does) — are both invisible until the
 *    day's revenue is counted.
 *
 * 2. **Effective dating is honoured on read, not merely stored.** The window is
 *    evaluated against the caller's `now`, so a value scheduled for Friday
 *    starts on Friday with no job to run.
 *
 * 3. **The cache cannot outlive a boundary.** This is the trap #528 fell into
 *    at the other end of the same idea: an entry written at 08:59:50 with a
 *    300s TTL, against a change scheduled for 09:00:00, goes on quoting the old
 *    threshold for the rest of its life, and *reaching a start time* is only
 *    the clock moving — there is no write to purge from. So the TTL is clamped
 *    to the next boundary, and `now` is injected rather than read from the
 *    clock so none of this needs fake timers.
 *
 * The database and Redis are both mocked. Everything the resolver decides is
 * pure once the rows are in hand, and the point of the exercise is which row
 * wins and how long the answer is allowed to live.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
const { getCachedMock, setCachedMock, deleteCachedMock, deleteCachedPatternMock } =
  vi.hoisted(() => ({
    getCachedMock: vi.fn(),
    setCachedMock: vi.fn(),
    deleteCachedMock: vi.fn(),
    deleteCachedPatternMock: vi.fn(),
  }));

vi.mock('../../src/database', () => ({
  db: { query: { shippingConfig: { findMany: findManyMock } } },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: getCachedMock,
  setCached: setCachedMock,
  deleteCached: deleteCachedMock,
  deleteCachedPattern: deleteCachedPatternMock,
}));

import { FREE_SHIPPING_THRESHOLD } from '@chobii/shared';
import {
  FREE_SHIPPING_THRESHOLD_CACHE_KEY,
  SHIPPING_CONFIG_CACHE_TTL_SECONDS,
  SHIPPING_CONFIG_KEYS,
  getFreeShippingThreshold,
  invalidateFreeShippingThreshold,
  resolveFreeShippingThreshold,
} from '../../src/lib/shipping-config';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '6c7f1b02-8d3a-4d21-9d0e-2f5a1c3b7e40',
    key: SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD,
    valueInt: 1499,
    description: null,
    effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    effectiveTo: null,
    createdBy: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nothing cached, so every test that does not say otherwise
  // exercises the database path.
  getCachedMock.mockResolvedValue(null);
  findManyMock.mockResolvedValue([]);
});

describe('getFreeShippingThreshold — the constant is the floor', () => {
  it('falls back to the shared constant when no row exists', async () => {
    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(
      FREE_SHIPPING_THRESHOLD
    );
  });

  it('falls back to the shared constant when the read throws', async () => {
    findManyMock.mockRejectedValue(new Error('connection terminated'));

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(
      FREE_SHIPPING_THRESHOLD
    );
  });

  it('does not cache the fallback after a failed read', async () => {
    // Caching a value produced by an outage extends the outage past its end.
    findManyMock.mockRejectedValue(new Error('connection terminated'));

    await getFreeShippingThreshold(NOW);

    expect(setCachedMock).not.toHaveBeenCalled();
  });

  it('returns the configured value when a row is effective', async () => {
    findManyMock.mockResolvedValue([row({ valueInt: 1499 })]);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(1499);
  });
});

describe('getFreeShippingThreshold — effective dating', () => {
  it('ignores a row that has not started yet', async () => {
    findManyMock.mockResolvedValue([
      row({ effectiveFrom: new Date('2026-08-11T00:00:00.000Z'), valueInt: 1999 }),
    ]);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(
      FREE_SHIPPING_THRESHOLD
    );
  });

  it('ignores a row whose window has closed', async () => {
    // Re-checked in JS rather than trusted to the WHERE clause: the row set is
    // filtered against the caller's `now`, which is the same clock every other
    // decision here is made on.
    findManyMock.mockResolvedValue([
      row({
        effectiveTo: new Date('2026-08-09T00:00:00.000Z'),
        valueInt: 1999,
      }),
    ]);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(
      FREE_SHIPPING_THRESHOLD
    );
  });

  it('takes the most recently started row when windows overlap', async () => {
    findManyMock.mockResolvedValue([
      row({ effectiveFrom: new Date('2026-08-01T00:00:00.000Z'), valueInt: 999 }),
      row({ effectiveFrom: new Date('2026-08-05T00:00:00.000Z'), valueInt: 1499 }),
    ]);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(1499);
  });

  it('switches to a scheduled value once its start time passes', async () => {
    const rows = [
      row({ effectiveFrom: new Date('2026-08-01T00:00:00.000Z'), valueInt: 999 }),
      row({ effectiveFrom: new Date('2026-08-10T18:00:00.000Z'), valueInt: 1499 }),
    ];
    findManyMock.mockResolvedValue(rows);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(999);
    await expect(
      getFreeShippingThreshold(new Date('2026-08-10T18:00:01.000Z'))
    ).resolves.toBe(1499);
  });
});

describe('getFreeShippingThreshold — caching', () => {
  it('returns the cached value without touching the database', async () => {
    getCachedMock.mockResolvedValue(1499);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(1499);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('caches a threshold of zero rather than treating it as a miss', async () => {
    // `0` is a legitimate setting — everything ships free — and a truthiness
    // check here would re-query on every request and, worse, read as "no value".
    getCachedMock.mockResolvedValue(0);

    await expect(getFreeShippingThreshold(NOW)).resolves.toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('caches the resolved value under the exact key', async () => {
    findManyMock.mockResolvedValue([row({ valueInt: 1499 })]);

    await getFreeShippingThreshold(NOW);

    expect(setCachedMock).toHaveBeenCalledWith(
      FREE_SHIPPING_THRESHOLD_CACHE_KEY,
      1499,
      SHIPPING_CONFIG_CACHE_TTL_SECONDS
    );
  });

  it('caches the fallback too, when the table is simply empty', async () => {
    // An empty table is a correct, cheap answer — not an error. Not caching it
    // would leave the most common case querying on every order creation.
    await getFreeShippingThreshold(NOW);

    expect(setCachedMock).toHaveBeenCalledWith(
      FREE_SHIPPING_THRESHOLD_CACHE_KEY,
      FREE_SHIPPING_THRESHOLD,
      SHIPPING_CONFIG_CACHE_TTL_SECONDS
    );
  });
});

describe('getFreeShippingThreshold — the cache cannot outlive a boundary', () => {
  function ttlOfLastWrite(): number {
    const call = setCachedMock.mock.calls.at(-1);
    return call?.[2] as number;
  }

  it('clamps the TTL to a scheduled start (#528, at the other end)', async () => {
    findManyMock.mockResolvedValue([
      row({ effectiveFrom: new Date('2026-08-01T00:00:00.000Z'), valueInt: 999 }),
      row({ effectiveFrom: new Date('2026-08-10T12:01:00.000Z'), valueInt: 1499 }),
    ]);

    await getFreeShippingThreshold(NOW);

    expect(ttlOfLastWrite()).toBe(60);
  });

  it('clamps the TTL to the end of the active window', async () => {
    findManyMock.mockResolvedValue([
      row({
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-08-10T12:00:30.000Z'),
        valueInt: 1499,
      }),
    ]);

    await getFreeShippingThreshold(NOW);

    expect(ttlOfLastWrite()).toBe(30);
  });

  it('clamps to the nearer of the two boundaries', async () => {
    findManyMock.mockResolvedValue([
      row({
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-08-10T12:02:00.000Z'),
        valueInt: 999,
      }),
      row({ effectiveFrom: new Date('2026-08-10T12:00:45.000Z'), valueInt: 1499 }),
    ]);

    await getFreeShippingThreshold(NOW);

    expect(ttlOfLastWrite()).toBe(45);
  });

  it('leaves a distant boundary alone', async () => {
    findManyMock.mockResolvedValue([
      row({ effectiveFrom: new Date('2026-08-01T00:00:00.000Z'), valueInt: 999 }),
      row({ effectiveFrom: new Date('2026-12-25T00:00:00.000Z'), valueInt: 1499 }),
    ]);

    await getFreeShippingThreshold(NOW);

    expect(ttlOfLastWrite()).toBe(SHIPPING_CONFIG_CACHE_TTL_SECONDS);
  });

  it('never writes a non-positive TTL', async () => {
    // `setex` rejects one, and a boundary that has effectively just passed
    // should still cost a second of staleness at most, not an exception.
    findManyMock.mockResolvedValue([
      row({
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-08-10T12:00:00.000Z'),
        valueInt: 999,
      }),
    ]);

    await getFreeShippingThreshold(NOW);

    expect(ttlOfLastWrite()).toBeGreaterThan(0);
  });
});

describe('invalidateFreeShippingThreshold', () => {
  it('deletes one complete key with the exact-key helper', async () => {
    // `shipping-config:free_shipping_threshold` is a whole key, not a prefix.
    // A wildcard sent to `deleteCached` is a silent no-op — the bug that has
    // now shipped three times here (#525, #527, admin/shipping.ts).
    await invalidateFreeShippingThreshold();

    expect(deleteCachedMock).toHaveBeenCalledWith(
      FREE_SHIPPING_THRESHOLD_CACHE_KEY
    );
    expect(FREE_SHIPPING_THRESHOLD_CACHE_KEY).not.toContain('*');
    expect(deleteCachedPatternMock).not.toHaveBeenCalled();
  });
});

describe('resolveFreeShippingThreshold — the shape the admin screen needs', () => {
  it('reports the audit trail of the row in force', async () => {
    const effectiveFrom = new Date('2026-08-05T00:00:00.000Z');
    findManyMock.mockResolvedValue([
      row({ valueInt: 1499, effectiveFrom, createdBy: 'admin-1' }),
    ]);

    const resolved = await resolveFreeShippingThreshold(NOW);

    expect(resolved.value).toBe(1499);
    expect(resolved.source).toBe('config');
    expect(resolved.row?.createdBy).toBe('admin-1');
    expect(resolved.row?.effectiveFrom).toEqual(effectiveFrom);
  });

  it('says so when the answer came from the constant', async () => {
    const resolved = await resolveFreeShippingThreshold(NOW);

    expect(resolved.value).toBe(FREE_SHIPPING_THRESHOLD);
    expect(resolved.source).toBe('default');
    expect(resolved.row).toBeNull();
  });

  it('surfaces the next scheduled change, so the form can show it', async () => {
    const nextChangeAt = new Date('2026-08-15T00:00:00.000Z');
    findManyMock.mockResolvedValue([
      row({ valueInt: 999 }),
      row({ effectiveFrom: nextChangeAt, valueInt: 1499 }),
    ]);

    const resolved = await resolveFreeShippingThreshold(NOW);

    expect(resolved.nextChangeAt).toEqual(nextChangeAt);
  });

  it('reads live — the admin screen must never be shown a cached value', async () => {
    getCachedMock.mockResolvedValue(1);
    findManyMock.mockResolvedValue([row({ valueInt: 1499 })]);

    const resolved = await resolveFreeShippingThreshold(NOW);

    expect(resolved.value).toBe(1499);
  });
});
