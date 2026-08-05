/**
 * Promotion contracts — where the discount maths is allowed to live.
 *
 * Two rules these tests exist to hold. First, a scope filter that quietly
 * swallows an unknown axis prices the wrong products, so the filter is strict.
 * Second, the payload a storefront surface receives carries a resolved
 * countdown, never the promotion's real end date — an `endsAt` on the wire is
 * the whole sale schedule, readable by anyone with devtools.
 */

import { describe, it, expect } from 'vitest';
import {
  promotionScopeFilterSchema,
  createPromotionInputSchema,
  resolvedSalePriceSchema,
} from '../../src/schemas/promotion';

describe('promotionScopeFilterSchema', () => {
  it('accepts a partial filter — every axis is optional', () => {
    expect(promotionScopeFilterSchema.parse({ styles: ['wabi-sabi'] })).toEqual({
      styles: ['wabi-sabi'],
    });
  });

  it('rejects unknown axes rather than silently ignoring them', () => {
    expect(() => promotionScopeFilterSchema.parse({ colours: ['red'] })).toThrow();
  });
});

describe('createPromotionInputSchema', () => {
  const base = {
    name: 'Summer Sale 2026',
    headline: 'SUMMER SALE — 40% OFF',
    discountType: 'percentage' as const,
    discountValue: 40,
    scopeType: 'all' as const,
    startsAt: '2026-08-05T00:00:00.000Z',
  };

  it('accepts a minimal sitewide promotion', () => {
    expect(createPromotionInputSchema.parse(base).membersOnly).toBe(true);
  });

  it('caps a percentage at 100', () => {
    expect(() => createPromotionInputSchema.parse({ ...base, discountValue: 140 })).toThrow();
  });

  it('requires a filter when scopeType is filter', () => {
    expect(() => createPromotionInputSchema.parse({ ...base, scopeType: 'filter' })).toThrow();
  });

  it('rejects an end date that precedes the start', () => {
    expect(() =>
      createPromotionInputSchema.parse({
        ...base,
        endsAt: '2026-08-04T00:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('resolvedSalePriceSchema', () => {
  it('carries what a surface needs and nothing more', () => {
    const resolved = resolvedSalePriceSchema.parse({
      promotionId: '0b6c2f7e-6f0e-4a9b-9a52-2a6d3f9c1e11',
      headline: 'SUMMER SALE — 40% OFF',
      percentOff: 40,
      basePrice: '25300.00',
      salePrice: '15180.00',
      locked: true,
    });
    expect(resolved.locked).toBe(true);
  });

  it('never carries the real end date', () => {
    expect('endsAt' in resolvedSalePriceSchema.shape).toBe(false);
  });
});
