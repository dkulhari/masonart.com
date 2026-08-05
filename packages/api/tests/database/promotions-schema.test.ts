/**
 * Schema support for sale promotions.
 *
 * Shape assertions on the drizzle objects, matching
 * product-popularity-columns.test.ts: the route suites mock `db`, so nothing
 * else in the API catches a column that does not exist.
 */

import { describe, it, expect } from 'vitest';
import {
  promotions,
  promotionProducts,
  promotionExclusions,
} from '../../src/database/schema/promotions';

describe('promotion table', () => {
  it('carries the customer-facing headline and the discount', () => {
    expect(promotions.headline).toBeDefined();
    expect(promotions.discountType).toBeDefined();
    expect(promotions.discountValue).toBeDefined();
  });

  it('has no status column — active state is derived from the dates', () => {
    expect((promotions as Record<string, unknown>).status).toBeUndefined();
    expect(promotions.isEnabled).toBeDefined();
    expect(promotions.startsAt).toBeDefined();
    expect(promotions.endsAt).toBeDefined();
  });

  it('is disabled by default — a live sale is a deliberate act', () => {
    expect(promotions.isEnabled.default).toBe(false);
  });

  it('endsAt is nullable, so an open-ended sale is expressible', () => {
    expect(promotions.endsAt.notNull).toBe(false);
  });

  it('carries scope, membership gate and the per-customer guardrail', () => {
    expect(promotions.scopeType).toBeDefined();
    expect(promotions.scopeFilter).toBeDefined();
    expect(promotions.membersOnly.default).toBe(true);
    expect(promotions.perCustomerOrderLimit.notNull).toBe(false);
  });

  it('carries the countdown configuration rather than hardcoding it', () => {
    expect(promotions.countdownMode.default).toBe('rolling');
    expect(promotions.rollingWindowMinutes.default).toBe(720);
    expect(promotions.rollingJitterMinutes.default).toBe(90);
  });

  it('priority breaks overlap — promotions never stack', () => {
    expect(promotions.priority.default).toBe(0);
  });
});

describe('promotion membership tables', () => {
  it('promotion_product pins an explicit product list', () => {
    expect(promotionProducts.promotionId).toBeDefined();
    expect(promotionProducts.productId).toBeDefined();
  });

  it('promotion_exclusion exists separately — an exclusion beats every scope', () => {
    expect(promotionExclusions.promotionId).toBeDefined();
    expect(promotionExclusions.productId).toBeDefined();
  });
});
