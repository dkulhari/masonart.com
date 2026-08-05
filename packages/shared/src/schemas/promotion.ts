/**
 * Promotions — the contracts.
 *
 * The discount maths lives in one place, and this module is the shape it hands
 * out. `resolvedSalePriceSchema` is what every storefront surface consumes:
 * card, PDP, cart and checkout all read the same resolved payload rather than
 * each re-deriving a sale price from a discount rule.
 *
 * NOT `discountTypeSchema` FROM `./checkout`
 *
 * That enum carries a third arm, `free-shipping`, which is a shipping waiver
 * rather than a price change and which promotions do not implement. Reusing it
 * would let an admin create a promotion the pricing resolver has no branch for.
 * Promotions are `percentage | fixed`, and that is enforced here.
 */

import { z } from 'zod';

/** Promotions discount by percentage or a flat amount. No free-shipping arm. */
export const promotionDiscountTypeSchema = z.enum(['percentage', 'fixed']);
export const promotionScopeTypeSchema = z.enum(['all', 'filter', 'products']);
export const countdownModeSchema = z.enum(['real', 'rolling']);

/** Strict: an unknown axis is a typo, and silently ignoring it prices the wrong products. */
export const promotionScopeFilterSchema = z
  .object({
    styles: z.array(z.string()).optional(),
    subjects: z.array(z.string()).optional(),
    rooms: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict();

export const createPromotionInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    headline: z.string().min(1).max(160),
    discountType: promotionDiscountTypeSchema,
    discountValue: z.number().int().positive(),
    scopeType: promotionScopeTypeSchema,
    scopeFilter: promotionScopeFilterSchema.optional(),
    productIds: z.array(z.string().uuid()).optional(),
    excludedProductIds: z.array(z.string().uuid()).optional(),
    membersOnly: z.boolean().default(true),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    isEnabled: z.boolean().default(false),
    priority: z.number().int().default(0),
    perCustomerOrderLimit: z.number().int().positive().optional(),
    countdownMode: countdownModeSchema.default('rolling'),
    rollingWindowMinutes: z.number().int().positive().default(720),
    rollingJitterMinutes: z.number().int().nonnegative().default(90),
  })
  .refine((input) => input.discountType !== 'percentage' || input.discountValue <= 100, {
    message: 'A percentage discount cannot exceed 100',
    path: ['discountValue'],
  })
  .refine((input) => input.scopeType !== 'filter' || input.scopeFilter !== undefined, {
    message: 'scopeType "filter" requires a scopeFilter',
    path: ['scopeFilter'],
  })
  .refine((input) => input.scopeType !== 'products' || (input.productIds?.length ?? 0) > 0, {
    message: 'scopeType "products" requires at least one product',
    path: ['productIds'],
  })
  .refine((input) => !input.endsAt || input.endsAt > input.startsAt, {
    message: 'endsAt must follow startsAt',
    path: ['endsAt'],
  });

export const updatePromotionInputSchema = createPromotionInputSchema;

/**
 * What a storefront surface receives. No endsAt: the real end date stays
 * server-side, and the countdown ships as an already-resolved deadline.
 */
export const resolvedSalePriceSchema = z.object({
  promotionId: z.string().uuid(),
  headline: z.string(),
  percentOff: z.number().int().nonnegative(),
  basePrice: z.string(),
  salePrice: z.string(),
  /** A sale price exists but the viewer is not a member: show it, charge base. */
  locked: z.boolean(),
});

export type PromotionDiscountType = z.infer<typeof promotionDiscountTypeSchema>;
export type PromotionScopeType = z.infer<typeof promotionScopeTypeSchema>;
export type CountdownMode = z.infer<typeof countdownModeSchema>;
export type PromotionScopeFilter = z.infer<typeof promotionScopeFilterSchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionInputSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionInputSchema>;
export type ResolvedSalePrice = z.infer<typeof resolvedSalePriceSchema>;
