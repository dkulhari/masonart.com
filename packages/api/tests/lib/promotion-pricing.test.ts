/**
 * Active-promotion selection and sale pricing.
 *
 * Two rules are worth a test each. Active state is *derived* from the row, so a
 * sale ends on its own — no job flips a column, and the window between "sale
 * over" and "job ran" cannot exist. And promotions never stack: however many
 * windows overlap a product, exactly one row wins.
 *
 * `now` is injected rather than read from the clock, so none of this needs fake
 * timers and none of it goes stale in 2027.
 *
 * The database is mocked. Everything the resolver decides — scope, exclusions,
 * the member gate, rounding — is pure, and the one function that does read
 * (`loadPromotionProductSets`) is asserted on the queries it issues rather than
 * on a live table.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../../src/database', () => ({
  db: { select: () => ({ from: fromMock }) },
}));

import {
  promotionExclusions,
  promotionProducts,
} from '../../src/database/schema/promotions';
import {
  getActivePromotions,
  getNextPromotionStart,
  invalidateActivePromotions,
  isPromotionActive,
  loadPromotionProductSets,
  resolveSalePrice,
  saleCacheTtl,
  selectPromotion,
} from '../../src/lib/promotion-pricing';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function promo(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b6c2f7e-6f0e-4a9b-9a52-2a6d3f9c1e11',
    headline: 'SALE',
    discountType: 'percentage',
    discountValue: 40,
    scopeType: 'all',
    scopeFilter: null,
    membersOnly: true,
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: new Date('2026-08-31T00:00:00.000Z'),
    isEnabled: true,
    priority: 0,
    ...overrides,
  } as never;
}

describe('isPromotionActive', () => {
  it('is active inside its window when enabled', () => {
    expect(isPromotionActive(promo(), NOW)).toBe(true);
  });

  it('is inactive when disabled, whatever the dates say', () => {
    expect(isPromotionActive(promo({ isEnabled: false }), NOW)).toBe(false);
  });

  it('is inactive before it starts', () => {
    expect(
      isPromotionActive(
        promo({ startsAt: new Date('2026-09-01T00:00:00.000Z') }),
        NOW
      )
    ).toBe(false);
  });

  it('is inactive once it has ended — no job has to switch it off', () => {
    expect(
      isPromotionActive(
        promo({ endsAt: new Date('2026-08-09T00:00:00.000Z') }),
        NOW
      )
    ).toBe(false);
  });

  it('runs open-ended when endsAt is null', () => {
    expect(isPromotionActive(promo({ endsAt: null }), NOW)).toBe(true);
  });
});

describe('selectPromotion', () => {
  it('returns null when nothing is active', () => {
    expect(selectPromotion([])).toBeNull();
  });

  it('picks the highest priority — promotions never stack', () => {
    const chosen = selectPromotion([
      promo({ id: 'a', priority: 1, discountValue: 10 }),
      promo({ id: 'b', priority: 5, discountValue: 5 }),
    ]);
    expect(chosen?.id).toBe('b');
  });

  it('breaks a priority tie with the deeper discount', () => {
    const chosen = selectPromotion([
      promo({ id: 'a', priority: 3, discountValue: 20 }),
      promo({ id: 'b', priority: 3, discountValue: 45 }),
    ]);
    expect(chosen?.id).toBe('b');
  });
});

const product = {
  id: 'p1',
  basePrice: '25300.00',
  style: 'wabi-sabi',
  subject: 'abstract',
  room: 'living-room',
  isFeatured: false,
} as never;

describe('resolveSalePrice', () => {
  it('returns null when no promotion is active', () => {
    expect(resolveSalePrice(product, [], { isMember: true })).toBeNull();
  });

  it('prices a sitewide promotion', () => {
    const resolved = resolveSalePrice(product, [promo()], { isMember: true });
    expect(resolved?.salePrice).toBe('15180.00');
    expect(resolved?.percentOff).toBe(40);
    expect(resolved?.basePrice).toBe('25300.00');
  });

  it('locks the price for a non-member when membersOnly', () => {
    const resolved = resolveSalePrice(product, [promo()], { isMember: false });
    expect(resolved?.locked).toBe(true);
    // The price is still shown — locked means "charge base", not "hide the sale".
    expect(resolved?.salePrice).toBe('15180.00');
  });

  it('is unlocked for everyone when membersOnly is false', () => {
    const resolved = resolveSalePrice(product, [promo({ membersOnly: false })], {
      isMember: false,
    });
    expect(resolved?.locked).toBe(false);
  });

  it('an exclusion beats a sitewide scope', () => {
    const resolved = resolveSalePrice(product, [promo()], {
      isMember: true,
      excludedIds: new Set(['p1']),
    });
    expect(resolved).toBeNull();
  });

  it('an exclusion beats a pinned products scope too', () => {
    const resolved = resolveSalePrice(product, [promo({ scopeType: 'products' })], {
      isMember: true,
      includedIds: new Set(['p1']),
      excludedIds: new Set(['p1']),
    });
    expect(resolved).toBeNull();
  });

  it('filter scope matches on style', () => {
    const p = promo({ scopeType: 'filter', scopeFilter: { styles: ['wabi-sabi'] } });
    expect(resolveSalePrice(product, [p], { isMember: true })).not.toBeNull();
  });

  it('filter scope skips a product outside it', () => {
    const p = promo({ scopeType: 'filter', scopeFilter: { styles: ['pop-art'] } });
    expect(resolveSalePrice(product, [p], { isMember: true })).toBeNull();
  });

  it('filter scope matches a catalogue row, whose facets are arrays', () => {
    // products.styles/subjects/rooms are text[] — a real row never carries the
    // singular scalars, so matching has to read both shapes or the filter scope
    // silently prices nothing in production.
    const row = {
      id: 'p2',
      basePrice: '1000.00',
      styles: ['japandi', 'wabi-sabi'],
      subjects: ['abstract'],
      rooms: ['bedroom'],
      isFeatured: false,
    } as never;
    const p = promo({ scopeType: 'filter', scopeFilter: { styles: ['wabi-sabi'] } });
    expect(resolveSalePrice(row, [p], { isMember: true })?.salePrice).toBe('600.00');
  });

  it('filter scope needs every named axis to match, not just one', () => {
    const p = promo({
      scopeType: 'filter',
      scopeFilter: { styles: ['wabi-sabi'], rooms: ['bedroom'] },
    });
    expect(resolveSalePrice(product, [p], { isMember: true })).toBeNull();
  });

  it('filter scope matches on isFeatured', () => {
    const p = promo({ scopeType: 'filter', scopeFilter: { isFeatured: true } });
    expect(resolveSalePrice(product, [p], { isMember: true })).toBeNull();
    const featured = { ...(product as object), isFeatured: true } as never;
    expect(resolveSalePrice(featured, [p], { isMember: true })).not.toBeNull();
  });

  it('an empty filter matches nothing — scope "all" is how you price everything', () => {
    const p = promo({ scopeType: 'filter', scopeFilter: {} });
    expect(resolveSalePrice(product, [p], { isMember: true })).toBeNull();
  });

  it('products scope matches only the pinned list', () => {
    const p = promo({ scopeType: 'products' });
    expect(
      resolveSalePrice(product, [p], {
        isMember: true,
        includedIds: new Set(['other']),
      })
    ).toBeNull();
    expect(
      resolveSalePrice(product, [p], {
        isMember: true,
        includedIds: new Set(['p1']),
      })
    ).not.toBeNull();
  });

  it('rounds half-up to two decimals', () => {
    const odd = { ...(product as object), basePrice: '1999.99' } as never;
    const resolved = resolveSalePrice(odd, [promo({ discountValue: 33 })], {
      isMember: true,
    });
    expect(resolved?.salePrice).toBe('1339.99');
  });

  it('rounds a half-paise line up, not to even', () => {
    // 10.01 less 50% is exactly 5.005. Half-up is 5.01; banker's rounding and a
    // naive float round both give 5.00, and the line stops reconciling.
    const odd = { ...(product as object), basePrice: '10.01' } as never;
    const resolved = resolveSalePrice(odd, [promo({ discountValue: 50 })], {
      isMember: true,
    });
    expect(resolved?.salePrice).toBe('5.01');
  });

  it('a fixed discount is paise off the line', () => {
    // discountValue is paise when the type is fixed: 500000 paise = ₹5000.
    const p = promo({ discountType: 'fixed', discountValue: 500000 });
    const resolved = resolveSalePrice(product, [p], { isMember: true });
    expect(resolved?.salePrice).toBe('20300.00');
  });

  it('a fixed discount never prices below zero', () => {
    const p = promo({ discountType: 'fixed', discountValue: 9999999 });
    expect(resolveSalePrice(product, [p], { isMember: true })?.salePrice).toBe(
      '0.00'
    );
  });

  it('still never stacks — one winner across overlapping scopes', () => {
    const resolved = resolveSalePrice(
      product,
      [
        promo({ id: 'a', priority: 1, discountValue: 10 }),
        promo({ id: 'b', priority: 5, discountValue: 20 }),
      ],
      { isMember: true }
    );
    expect(resolved?.promotionId).toBe('b');
    expect(resolved?.salePrice).toBe('20240.00');
  });
});

describe('loadPromotionProductSets', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('reads nothing when no promotion is active', async () => {
    const sets = await loadPromotionProductSets([]);
    expect(sets.includedIds.size).toBe(0);
    expect(sets.excludedIds.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('loads pinned and excluded ids in one query each', async () => {
    fromMock.mockImplementation((table: unknown) => ({
      where: async () =>
        table === promotionProducts
          ? [{ productId: 'p1' }, { productId: 'p2' }]
          : [{ productId: 'p9' }],
    }));

    const sets = await loadPromotionProductSets([promo({ id: 'a' })]);

    expect([...sets.includedIds].sort()).toEqual(['p1', 'p2']);
    expect([...sets.excludedIds]).toEqual(['p9']);
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(fromMock).toHaveBeenCalledWith(promotionProducts);
    expect(fromMock).toHaveBeenCalledWith(promotionExclusions);
  });
});

// ============================================================================
// saleCacheTtl — the half of staleness no write can reach
// ============================================================================

/**
 * A promotion write can purge the caches it invalidates. A promotion crossing a
 * boundary *on the clock* cannot: active state is derived rather than stored, so
 * at the moment a sale lapses — or the moment a scheduled one begins — nothing
 * runs, nothing writes, and there is no hook to purge from. The only defence
 * available at write time is to refuse to cache a priced body past the instant
 * that will make it wrong, whichever end that instant sits at.
 */
describe('saleCacheTtl', () => {
  const FULL = 600;

  it('leaves the TTL alone when nothing is on sale', () => {
    expect(saleCacheTtl([], null, FULL, NOW)).toBe(FULL);
  });

  it('leaves the TTL alone for an open-ended promotion', () => {
    // No endsAt, no deadline to outlive.
    expect(saleCacheTtl([promo({ endsAt: null })], null, FULL, NOW)).toBe(FULL);
  });

  it('leaves the TTL alone when the sale outlasts it', () => {
    // Ends three weeks out; a 10-minute entry cannot survive into the wrong era.
    expect(saleCacheTtl([promo()], null, FULL, NOW)).toBe(FULL);
  });

  it('clamps to the seconds left when the sale ends first', () => {
    const endsAt = new Date(NOW.getTime() + 90_000); // 90s
    expect(saleCacheTtl([promo({ endsAt })], null, FULL, NOW)).toBe(90);
  });

  it('clamps to the soonest deadline when several promotions run', () => {
    const soon = new Date(NOW.getTime() + 30_000);
    const later = new Date(NOW.getTime() + 120_000);
    expect(
      saleCacheTtl(
        [promo({ id: 'a', endsAt: later }), promo({ id: 'b', endsAt: soon })],
        null,
        FULL,
        NOW
      )
    ).toBe(30);
  });

  it('rounds down, so an entry never outlives the sale by a part second', () => {
    const endsAt = new Date(NOW.getTime() + 45_900); // 45.9s
    expect(saleCacheTtl([promo({ endsAt })], null, FULL, NOW)).toBe(45);
  });

  it('floors at one second for a promotion the resolver has not noticed ending', () => {
    // getActivePromotions memoises for 60s, so a row whose window closed can
    // still be handed to a route as active. setex rejects a TTL of zero, and
    // caching a body that is already wrong for a full 10 minutes is worse than
    // caching it for one second.
    const endsAt = new Date(NOW.getTime() - 30_000);
    expect(saleCacheTtl([promo({ endsAt })], null, FULL, NOW)).toBe(1);
  });

  it('never lengthens a short TTL to reach a distant deadline', () => {
    expect(saleCacheTtl([promo()], null, 60, NOW)).toBe(60);
  });

  // -- the start boundary (#528) --------------------------------------------

  it('clamps to a scheduled start with nothing on sale yet', () => {
    // The bug in one line: no active promotion means no `endsAt` to clamp
    // against, and the entry used to run its full 600s straight through the
    // start of a sale 30s away.
    const startsAt = new Date(NOW.getTime() + 30_000);
    expect(saleCacheTtl([], startsAt, FULL, NOW)).toBe(30);
  });

  it('leaves the TTL alone when the next sale starts after it lapses', () => {
    const startsAt = new Date(NOW.getTime() + 7_200_000); // two hours
    expect(saleCacheTtl([], startsAt, FULL, NOW)).toBe(FULL);
  });

  it('takes the soonest of a running end and an upcoming start', () => {
    const endsAt = new Date(NOW.getTime() + 120_000);
    const startsAt = new Date(NOW.getTime() + 45_000);
    expect(saleCacheTtl([promo({ endsAt })], startsAt, FULL, NOW)).toBe(45);
  });

  it('keeps the end clamp when the running sale finishes first', () => {
    // The #525 half has to survive the #528 half.
    const endsAt = new Date(NOW.getTime() + 20_000);
    const startsAt = new Date(NOW.getTime() + 300_000);
    expect(saleCacheTtl([promo({ endsAt })], startsAt, FULL, NOW)).toBe(20);
  });

  it('rounds a start boundary down too', () => {
    const startsAt = new Date(NOW.getTime() + 45_900);
    expect(saleCacheTtl([], startsAt, FULL, NOW)).toBe(45);
  });

  it('floors at one second for a start the memo has not caught up with', () => {
    const startsAt = new Date(NOW.getTime() - 5_000);
    expect(saleCacheTtl([], startsAt, FULL, NOW)).toBe(1);
  });
});

// ============================================================================
// getNextPromotionStart — the boundary saleCacheTtl clamps against
// ============================================================================

/**
 * Both readers share one memo of the enabled, not-yet-ended rows, so these
 * assertions run against a single stubbed `db.select()` and the second call
 * must not reach the database again.
 *
 * The disabled case is the one worth stating out loud: a promotion that is
 * scheduled but switched off must clamp nothing. Nothing happens when the clock
 * passes its `startsAt`, so shortening cache entries against it would throw away
 * live entries for a sale that never arrives.
 */
describe('getNextPromotionStart', () => {
  /** The table read is a memo, so every test starts from an empty one. */
  beforeEach(() => {
    fromMock.mockReset();
    invalidateActivePromotions();
  });

  function givenRows(rows: unknown[]) {
    fromMock.mockReturnValue({ where: () => Promise.resolve(rows) });
  }

  const soon = new Date(NOW.getTime() + 30_000);
  const later = new Date(NOW.getTime() + 300_000);

  it('is null when nothing is scheduled', async () => {
    givenRows([promo()]); // started a week ago
    expect(await getNextPromotionStart(NOW)).toBeNull();
  });

  it('returns the start of a scheduled promotion', async () => {
    givenRows([promo({ startsAt: soon })]);
    expect(await getNextPromotionStart(NOW)).toEqual(soon);
  });

  it('returns the soonest of several', async () => {
    givenRows([
      promo({ id: 'a', startsAt: later }),
      promo({ id: 'b', startsAt: soon }),
    ]);
    expect(await getNextPromotionStart(NOW)).toEqual(soon);
  });

  it('ignores a scheduled promotion that is disabled', async () => {
    givenRows([promo({ startsAt: soon, isEnabled: false })]);
    expect(await getNextPromotionStart(NOW)).toBeNull();
  });

  it('reads the same memo as the active list, not a second query', async () => {
    givenRows([promo({ startsAt: soon })]);

    const active = await getActivePromotions(NOW);
    const next = await getNextPromotionStart(NOW);

    // Not started yet, so it prices nothing — and it is still the boundary.
    expect(active).toEqual([]);
    expect(next).toEqual(soon);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('lets a scheduled promotion become active inside the memo window', async () => {
    // The other half of #528. Clamping the response cache to the start time is
    // useless if the memo, filled before the sale began, goes on reporting an
    // empty active list for the rest of its own 60s.
    givenRows([promo({ startsAt: soon })]);

    expect(await getActivePromotions(NOW)).toEqual([]);

    const afterStart = new Date(NOW.getTime() + 45_000);
    expect(await getActivePromotions(afterStart)).toHaveLength(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
