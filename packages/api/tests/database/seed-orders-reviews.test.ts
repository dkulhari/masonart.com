/**
 * Invariants of the orders/reviews fixture.
 *
 * The fixture exists to give two real-signal features something true to
 * report — Best selling (#405) and the catalogue review aggregate (#407).
 * These assertions guard the properties those features depend on, so a
 * careless edit to the fixture cannot quietly turn a public number into
 * nonsense.
 */

import { describe, it, expect } from 'vitest';
import { SEED_ORDERS, VOIDED_ONLY_SLUG } from '../../src/database/seed-orders-reviews';

const SETTLED = SEED_ORDERS.filter(
  (order) =>
    order.paymentStatus === 'paid' &&
    !['cancelled', 'refunded', 'failed'].includes(order.status)
);

const APPROVED = SEED_ORDERS.flatMap((order) =>
  order.reviews.filter((review) => review.status === 'approved')
);

describe('settled orders', () => {
  it('there are some — otherwise Best selling has nothing to sort by', () => {
    expect(SETTLED.length).toBeGreaterThan(0);
  });

  it('spread sales across several products, not one', () => {
    const sold = new Set(SETTLED.flatMap((o) => o.items.map((i) => i.slug)));
    expect(sold.size).toBeGreaterThanOrEqual(5);
  });

  it('vary quantity, so the ordering is a real ranking rather than a tie', () => {
    const totals = new Map<string, number>();
    for (const order of SETTLED) {
      for (const item of order.items) {
        totals.set(item.slug, (totals.get(item.slug) ?? 0) + item.quantity);
      }
    }
    expect(new Set(totals.values()).size).toBeGreaterThan(1);
  });
});

describe('voided orders', () => {
  it('includes at least one cancelled and one refunded order', () => {
    const statuses = SEED_ORDERS.map((o) => o.status);
    expect(statuses).toContain('cancelled');
    expect(statuses).toContain('refunded');
  });

  it('has a product that appears ONLY in voided orders', () => {
    // The canary: if a regression starts counting voided orders, this
    // product gains sales out of nothing and the cause is unambiguous.
    const settledSlugs = new Set(SETTLED.flatMap((o) => o.items.map((i) => i.slug)));
    const voidedSlugs = new Set(
      SEED_ORDERS.filter((o) => !SETTLED.includes(o)).flatMap((o) =>
        o.items.map((i) => i.slug)
      )
    );

    expect(voidedSlugs.has(VOIDED_ONLY_SLUG)).toBe(true);
    expect(settledSlugs.has(VOIDED_ONLY_SLUG)).toBe(false);
  });
});

describe('reviews', () => {
  it('clears the promo tile threshold of ten approved reviews', () => {
    expect(APPROVED.length).toBeGreaterThanOrEqual(10);
  });

  it('includes pending reviews, so the status filter is exercised', () => {
    const pending = SEED_ORDERS.flatMap((o) =>
      o.reviews.filter((r) => r.status === 'pending')
    );
    expect(pending.length).toBeGreaterThan(0);
  });

  it('spans more than one rating, so the average is a distribution', () => {
    expect(new Set(APPROVED.map((r) => r.rating)).size).toBeGreaterThan(1);
  });

  it('keeps every rating inside the 1-5 range the column allows', () => {
    for (const review of SEED_ORDERS.flatMap((o) => o.reviews)) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
    }
  });

  it('authorises each review with an order item that exists on its order', () => {
    // A review's orderItemId is NOT NULL and FK-checked. An itemIndex past
    // the end of the order silently drops the review at seed time.
    for (const order of SEED_ORDERS) {
      for (const review of order.reviews) {
        expect(review.itemIndex).toBeLessThan(order.items.length);
      }
    }
  });

  it('attributes each review to the customer who placed the order', () => {
    // Reviews are verified purchases. A review by someone who did not buy
    // it is exactly the fabricated social proof this feature refuses.
    for (const order of SEED_ORDERS) {
      for (const review of order.reviews) {
        expect(review.customerIndex).toBe(order.customerIndex);
      }
    }
  });
});

describe('determinism', () => {
  it('uses unique, fixed order numbers', () => {
    const numbers = SEED_ORDERS.map((o) => o.orderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('hardcodes every rating — a random one would move a public number on each reseed', () => {
    for (const review of SEED_ORDERS.flatMap((o) => o.reviews)) {
      expect(Number.isInteger(review.rating)).toBe(true);
    }
  });
});
