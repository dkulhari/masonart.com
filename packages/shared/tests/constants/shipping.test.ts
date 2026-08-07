/**
 * Shipping money rules.
 *
 * The threshold moved from a build-time constant to an admin setting (#569),
 * so `qualifiesForFreeShipping` now takes the figure in force rather than
 * always reading the bundled one. Two things must survive that move:
 *
 * - the constant stays the default, so every existing caller — and any caller
 *   that cannot reach the database — charges exactly what the storefront copy
 *   promises rather than nothing or everything;
 * - the threshold is still evaluated on the NET, post-discount amount with
 *   gift cards excluded (design §5, commit 70bfa9dd). A gift card is tender
 *   applied after tax; it is payment, not price.
 */

import { describe, it, expect } from 'vitest';
import {
  FREE_SHIPPING_THRESHOLD,
  FREE_SHIPPING_THRESHOLD_LABEL,
  netAmountForShipping,
  qualifiesForFreeShipping,
} from '../../src/constants/shipping.js';

describe('free shipping threshold', () => {
  it('is the figure every customer-facing surface states', () => {
    expect(FREE_SHIPPING_THRESHOLD).toBe(999);
    expect(FREE_SHIPPING_THRESHOLD_LABEL).toBe('₹999');
  });
});

describe('qualifiesForFreeShipping', () => {
  it('defaults to the bundled constant when no threshold is supplied', () => {
    expect(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD)).toBe(true);
    expect(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD - 1)).toBe(false);
  });

  it('honours a configured threshold when one is supplied', () => {
    // What the server passes once the value comes from `shipping_config`.
    expect(qualifiesForFreeShipping(1499, 1499)).toBe(true);
    expect(qualifiesForFreeShipping(1498, 1499)).toBe(false);
  });

  it('is inclusive at the boundary — "over ₹999" means ₹999 ships free', () => {
    expect(qualifiesForFreeShipping(1499, 1499)).toBe(true);
  });

  it('treats a threshold of zero as everything shipping free', () => {
    // A truthiness check on the parameter would silently fall back to ₹999
    // here, charging shipping the admin has switched off.
    expect(qualifiesForFreeShipping(0, 0)).toBe(true);
  });
});

describe('netAmountForShipping', () => {
  it('subtracts the price-level discount', () => {
    expect(netAmountForShipping(1200, 300)).toBe(900);
  });

  it('never goes below zero', () => {
    expect(netAmountForShipping(200, 500)).toBe(0);
  });

  it('rounds to the paisa so a float tick cannot decide a boundary', () => {
    expect(netAmountForShipping(999.005, 0)).toBe(999.01);
  });

  it('takes two price figures and nothing else, so a gift card cannot leak in', () => {
    // Arity is the guard: a gift card is applied after tax against the amount
    // due and must never move a price-level threshold (design §5). There is no
    // parameter for it to arrive through.
    expect(netAmountForShipping).toHaveLength(2);
  });
});
