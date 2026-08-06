/**
 * Active-promotion selection.
 *
 * Two rules are worth a test each. Active state is *derived* from the row, so a
 * sale ends on its own — no job flips a column, and the window between "sale
 * over" and "job ran" cannot exist. And promotions never stack: however many
 * windows overlap a product, exactly one row wins.
 *
 * `now` is injected rather than read from the clock, so none of this needs fake
 * timers and none of it goes stale in 2027.
 */

import { describe, it, expect } from 'vitest';
import {
  isPromotionActive,
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
