/**
 * Curated collections — the contracts.
 *
 * WHY THIS FILE EXISTS
 *
 * A collection is not a facet value, and this module is where that stops being
 * ambiguous.
 *
 * Measured on mesonart 2026-08-05 (fetched HTML from `/collections/artworks`,
 * `/collections/style_pollock-art`, `/collections/subject_city`): their
 * Discover rail is one hand-curated list of 18 links, identical on every
 * collection page, spanning **style x8**, **subject x7**, **orientation x1**,
 * and two entries — `Latest Work` -> `/collections/new` and `Bestseller` ->
 * `/collections/best-selling` — that are a date window and a sort. Those last
 * two have no facet to map to in any vocabulary, ours or theirs.
 *
 * Ours generated the same rail from `STYLE_OPTIONS` and typed the payload to a
 * style id (#406, #410), which is why it could never carry them. So a
 * collection carries its own filter payload instead of being one.
 *
 * THE RULE IS THE EXISTING FILTER PAYLOAD
 *
 * `collectionRuleSchema` names only fields `/api/products` already validates,
 * and its facet arrays validate against the same zod enums in
 * `../constants/facets` that the list endpoint, the seed and the sidebar read.
 * That is deliberate: a collection page is the product list with a pre-applied
 * base filter, not a second query language. Two vocabularies is the failure
 * `facets.ts` was written to end, and a rule that names a style nothing can be
 * tagged with is a rule that renders an empty page.
 *
 * SUPERSEDES `collectionSchema` in `./product.ts`
 *
 * That one models a collection as one of six fixed marketing labels
 * (`new-arrivals` | `best-sellers` | `staff-picks` | `seasonal` | `sale` |
 * `ai-generated-gallery`) and cannot express a collection an admin authored.
 * It is referenced by nothing but its own test. Use this module.
 */

import { z } from 'zod';
import {
  styleSchema,
  subjectSchema,
  colorSchema,
  roomSchema,
  vibeSchema,
  aestheticSchema,
  mediumSchema,
  uniquenessSchema,
  availabilitySchema,
  orientationSchema,
} from '../constants/facets';

// ============================================================================
// Membership kind
// ============================================================================

/**
 * How a collection decides which products are in it.
 *
 * - `rule` — a stored filter payload, re-resolved on every request, so the
 *   collection follows the catalogue as it grows.
 * - `manual` — an explicitly ordered list of products. The order IS the data;
 *   nothing else can express "these six, in this order".
 *
 * Both exist because neither covers the other. Rule-only cannot curate;
 * manual-only means re-picking every time a product is added.
 */
export const collectionKindSchema = z.enum(['rule', 'manual']);
export type CollectionKind = z.infer<typeof collectionKindSchema>;

// ============================================================================
// The rule
// ============================================================================

/**
 * Sort fields the product list can actually order by.
 *
 * Mirrors the enum in `packages/api/src/routes/products.ts`. A field that
 * module does not know would pass validation here and then fail at request
 * time, which turns an authoring mistake into a runtime error.
 */
export const collectionSortFieldSchema = z.enum([
  'createdAt',
  'updatedAt',
  'title',
  'basePrice',
  'featuredOrder',
  'salesCount',
]);

export const collectionSortOrderSchema = z.enum(['asc', 'desc']);

/**
 * The stored query behind a `rule` collection.
 *
 * Every field is one `/api/products` already accepts and validates. The empty
 * rule is legal and means "every active product in the default order" — which
 * is exactly what a sort-only collection like Latest Work is.
 */
export const collectionRuleSchema = z.object({
  styles: z.array(styleSchema).optional(),
  subjects: z.array(subjectSchema).optional(),
  colors: z.array(colorSchema).optional(),
  rooms: z.array(roomSchema).optional(),
  vibe: z.array(vibeSchema).optional(),
  aesthetic: z.array(aestheticSchema).optional(),
  medium: z.array(mediumSchema).optional(),
  uniqueness: uniquenessSchema.optional(),
  availability: availabilitySchema.optional(),
  orientation: orientationSchema.optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  isAiGenerated: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortBy: collectionSortFieldSchema.optional(),
  sortOrder: collectionSortOrderSchema.optional(),
});

export type CollectionRule = z.infer<typeof collectionRuleSchema>;

// ============================================================================
// The collection
// ============================================================================

/**
 * Slugs are admin-authored, not derived from a facet id — a collection may
 * span several facet groups or none at all. It lands in a URL, so it is
 * lowercase kebab and nothing else.
 */
export const collectionSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case');

const collectionFields = {
  slug: collectionSlugSchema,
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullish(),
  description: z.string().max(4000).nullish(),
  kind: collectionKindSchema,
  rule: collectionRuleSchema.nullish(),
  /**
   * An image the admin chose. Null falls back to a representative product's
   * artwork, which is how #410 solved chip imagery without a photo shoot.
   *
   * Consumers must know which of the two they got: product `main` images are
   * matted at a fixed fraction of the longest side and the chip compensates
   * with `chipArtScale()`. An admin upload is not matted, and scaling it by
   * the same factor crops into it.
   */
  imageUrl: z.string().max(2000).nullish(),
  isActive: z.boolean(),
  showInDiscover: z.boolean(),
  /** Null when the collection is not in the rail. Ordering is a property of the rail. */
  discoverOrder: z.number().int().nonnegative().nullish(),
  sortOrder: z.number().int().nonnegative(),
  seoTitle: z.string().max(200).nullish(),
  seoDescription: z.string().max(500).nullish(),
};

/**
 * `kind` and `rule` must agree.
 *
 * A manual collection that also carries a rule has two sources of membership,
 * and whichever the resolver picks, the other one is a lie the admin can still
 * see and edit. A rule collection with no rule resolves to nothing.
 *
 * Applied to every shape below, including the partial patch — `undefined`
 * there means "not being changed", which is why the check reads `!== undefined`
 * rather than truthiness.
 */
const kindAndRuleAgree = <T extends { kind?: CollectionKind; rule?: unknown }>(
  value: T,
  ctx: z.RefinementCtx
): void => {
  if (value.kind === undefined) return;

  if (value.kind === 'rule' && (value.rule === null || value.rule === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rule'],
      message: 'a rule collection must carry a rule',
    });
  }

  if (value.kind === 'manual' && value.rule !== null && value.rule !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rule'],
      message: 'a manual collection must not carry a rule',
    });
  }
};

export const curatedCollectionSchema = z
  .object({
    id: z.string().min(1),
    ...collectionFields,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .superRefine(kindAndRuleAgree);

export type CuratedCollection = z.infer<typeof curatedCollectionSchema>;

// ============================================================================
// Admin write shapes
// ============================================================================

/**
 * What the admin form posts to create a collection.
 *
 * The flags default rather than being required: a new collection is live and
 * out of the rail until somebody says otherwise, which is the safe direction —
 * an accidental blank chip is more visible than an accidentally hidden page.
 */
export const createCollectionSchema = z
  .object({
    ...collectionFields,
    isActive: z.boolean().default(true),
    showInDiscover: z.boolean().default(false),
    discoverOrder: z.number().int().nonnegative().nullish(),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .superRefine(kindAndRuleAgree);

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/** Partial patch. Absent means "leave it alone"; explicit null means "clear it". */
export const updateCollectionSchema = z
  .object(collectionFields)
  .partial()
  .superRefine(kindAndRuleAgree);

export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

// ============================================================================
// Manual membership
// ============================================================================

/**
 * Replacing a manual collection's members is a whole-list operation.
 *
 * Per-row add and remove would make position arithmetic the client's problem,
 * and the position is the only thing distinguishing a curated list from a set.
 */
export const collectionMembersSchema = z.object({
  productIds: z.array(z.string().min(1)),
});

export type CollectionMembersInput = z.infer<typeof collectionMembersSchema>;

/** Rewrites the rail's order in one transaction, so it is never half-reordered. */
export const discoverOrderSchema = z.object({
  collectionIds: z.array(z.string().min(1)),
});

export type DiscoverOrderInput = z.infer<typeof discoverOrderSchema>;
