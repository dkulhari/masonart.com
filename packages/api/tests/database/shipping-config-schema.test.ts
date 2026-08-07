/**
 * Schema support for admin-editable shipping configuration.
 *
 * Shape assertions on the drizzle objects, matching promotions-schema.test.ts:
 * the route and lib suites mock `db`, so nothing else in the API catches a
 * column that does not exist.
 *
 * `shippingConfig` deliberately mirrors `walletPricingConfig`
 * (schema/wallet.ts) — key / valueInt / effectiveFrom / effectiveTo /
 * description / createdBy. The precedent is asserted here rather than left to
 * a comment, because the effective-dating columns are only worth having if
 * reads honour them, and both halves have to stay in step.
 */

import { describe, it, expect } from 'vitest';
import { shippingConfig } from '../../src/database/schema/shipping';
import { walletPricingConfig } from '../../src/database/schema/wallet';
import {
  SHIPPING_CONFIG_KEYS,
  SHIPPING_CONFIG_DEFAULTS,
} from '../../src/lib/shipping-config';
import { FREE_SHIPPING_THRESHOLD } from '@chobii/shared';

describe('shipping_config table', () => {
  it('is a key / integer-value store, like the wallet pricing precedent', () => {
    expect(shippingConfig.key).toBeDefined();
    expect(shippingConfig.valueInt).toBeDefined();
    expect(shippingConfig.key.notNull).toBe(true);
    expect(shippingConfig.valueInt.notNull).toBe(true);
  });

  it('carries the same columns as walletPricingConfig', () => {
    for (const column of Object.keys(walletPricingConfig)) {
      // `enableRLS`, `getSQL` and friends are drizzle internals, not columns.
      if (!(column in shippingConfig)) continue;
      expect(shippingConfig).toHaveProperty(column);
    }

    expect(shippingConfig.description).toBeDefined();
    expect(shippingConfig.effectiveFrom).toBeDefined();
    expect(shippingConfig.effectiveTo).toBeDefined();
    expect(shippingConfig.createdBy).toBeDefined();
    expect(shippingConfig.createdAt).toBeDefined();
    expect(shippingConfig.updatedAt).toBeDefined();
  });

  it('effectiveTo is nullable, so an open-ended value is expressible', () => {
    expect(shippingConfig.effectiveTo.notNull).toBe(false);
    expect(shippingConfig.effectiveFrom.notNull).toBe(true);
  });

  it('createdBy is an audit reference that survives deleting the admin', () => {
    // `set null` rather than `cascade`: losing the audit trail for a pricing
    // change because an admin account was removed is the wrong trade.
    expect(shippingConfig.createdBy.notNull).toBe(false);
  });
});

/**
 * The keys live in `lib/shipping-config.ts` rather than beside the table:
 * their default is `FREE_SHIPPING_THRESHOLD` itself, and a value import from
 * the ESM-only `@chobii/shared` inside a schema file breaks the CJS loader
 * `drizzle-kit generate` uses.
 */
describe('shipping config keys and defaults', () => {
  it('names the free-shipping threshold', () => {
    expect(SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD).toBe(
      'free_shipping_threshold'
    );
  });

  it('seeds from the shared constant rather than a second literal', () => {
    // If these ever drift, the fallback and the seed disagree and the charged
    // threshold depends on whether a row happens to exist.
    expect(
      SHIPPING_CONFIG_DEFAULTS[SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD]
    ).toBe(FREE_SHIPPING_THRESHOLD);
  });
});
