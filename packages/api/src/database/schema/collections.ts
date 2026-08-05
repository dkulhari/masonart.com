// Curated collections schema.
//
// A collection is a destination page with its own slug, title and imagery,
// not a projection of the style vocabulary. See
// `packages/shared/src/schemas/collection.ts` for why — measured on mesonart,
// their Discover rail spans style, subject and orientation plus two entries
// (Latest Work, Bestseller) that are a date window and a sort, and no facet
// vocabulary can name those.

import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uuid,
  pgEnum,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { products } from "./products";

// ============================================================================
// Enums
// ============================================================================

/**
 * How a collection decides which products belong to it.
 *
 * - `rule`: a stored filter payload, re-resolved on every request, so the
 *   collection follows the catalogue as it grows.
 * - `manual`: an explicit ordered list in `collection_products`.
 *
 * Both, because neither covers the other. Rule-only cannot curate; manual-only
 * means re-picking members every time a product is added.
 */
export const collectionKindEnum = pgEnum("collection_kind", ["rule", "manual"]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Collections — admin-authored destinations.
 */
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * The URL. Admin-authored rather than derived from a facet id, because a
     * collection may span several facet groups or none at all.
     */
    slug: text("slug").notNull().unique(),

    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),

    kind: collectionKindEnum("kind").notNull(),

    /**
     * The stored query, validated by `collectionRuleSchema` in
     * `@chobii/shared` before it ever reaches this column.
     *
     * jsonb rather than text: the resolver reads it field by field, and text
     * would put a JSON.parse at every call site until one of them forgot.
     *
     * Null for `manual` collections. The empty object is legal and meaningful
     * — "every active product, default order" — which is what makes a
     * sort-only collection expressible.
     */
    rule: jsonb("rule"),

    /**
     * An image the admin chose. Null falls back to a representative product's
     * artwork, which is how #410 gave the rail imagery without a photo shoot.
     *
     * Consumers must be told which of the two they received: product `main`
     * images are matted at a fixed fraction of the longest side and the chip
     * compensates with `chipArtScale()`, while an admin upload is not matted
     * and the same factor crops into it.
     */
    imageUrl: text("image_url"),

    isActive: boolean("is_active").notNull().default(true),

    /**
     * Whether this collection appears in the Discover rail, and where.
     *
     * Two columns rather than one nullable order, because "in the rail" and
     * "in position 3" are different facts and an admin toggling visibility
     * should not lose the position they chose.
     */
    showInDiscover: boolean("show_in_discover").notNull().default(false),
    discoverOrder: integer("discover_order"),

    /** Ordering in the admin list and anywhere else collections are enumerated. */
    sortOrder: integer("sort_order").notNull().default(0),

    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // The rail's own query: active, in-discover, ordered.
    discoverIdx: index("collections_discover_idx").on(
      table.showInDiscover,
      table.discoverOrder
    ),
    activeIdx: index("collections_active_idx").on(table.isActive),
  })
);

/**
 * Manual membership. `kind = 'manual'` only.
 *
 * `position` is not decoration — it is the entire reason this table exists.
 * A rule can express "everything tagged pop-art"; only an ordered list can
 * express "these six, in this order".
 */
export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: uuid("collection_id")
      .references(() => collections.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.productId] }),
    // Reading a collection's members in order is the only access pattern.
    orderIdx: index("collection_products_order_idx").on(
      table.collectionId,
      table.position
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

export const collectionsRelations = relations(collections, ({ many }) => ({
  members: many(collectionProducts),
}));

export const collectionProductsRelations = relations(
  collectionProducts,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionProducts.collectionId],
      references: [collections.id],
    }),
    product: one(products, {
      fields: [collectionProducts.productId],
      references: [products.id],
    }),
  })
);

// ============================================================================
// Types
// ============================================================================

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type CollectionProduct = typeof collectionProducts.$inferSelect;
export type NewCollectionProduct = typeof collectionProducts.$inferInsert;
