// Products database schema for the Poster & Frame E-Commerce Platform
// Following the patterns defined in docs/poster-app-tech-stack.md

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  decimal,
  jsonb,
  pgEnum,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Product image structure stored as JSONB.
 *
 * Single source of truth lives in @chobii/shared — re-exported here so the
 * Drizzle `$type<ProductImage[]>()` annotation stays readable at the call-site.
 * The old local shape (`alt`, `isPrimary`, optional dimensions) is gone:
 * `isPrimary` is superseded by `type: 'main'` + `sortOrder`, and width/height
 * are now required because the pipeline guarantees them.
 */
export type { ProductImage } from "@chobii/shared";
import type { ProductImage } from "@chobii/shared";

// ============================================================================
// Enums
// ============================================================================

/**
 * Product orientation enum for poster aspect ratios
 */
export const orientationEnum = pgEnum("orientation", [
  "square",
  "portrait",
  "landscape",
  "panoramic",
  "round",
  /**
   * Panel count, not proportion — mesonart exposes "Set of 2/3" as an
   * orientation facet (analysis §5.2) and we match so filtering behaves the
   * same. It has no size ladder; getSizesForOrientation returns empty and the
   * seed falls back rather than emitting a variant-less product.
   *
   * Postgres cannot drop an enum value, so this is effectively permanent.
   */
  "set-of-2-3",
]);

/**
 * Product status enum for catalog management
 */
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

/**
 * Which rung of the format axis a frame sits on.
 *
 * `rolled` and `frameless` are formats rather than mouldings — the print
 * shipped in a tube, and the print stretched on bars with no moulding at all.
 * Both are real rows so the cart can carry a frameId for them like any other
 * choice, and the storefront sells the three as one axis, "Rolled Canvas /
 * Frameless / Framed" (#420).
 *
 * Unlike `frames.type`, which an admin invents freely, this set is closed —
 * which is why it stays an enum. The storefront used to DERIVE the rung from
 * the type string, mapping `rolled` and `frameless` to themselves and letting
 * everything else fall through to "Framed". That could only work while every
 * type was seeded in code and known in advance: an admin-created moulding
 * lands in the right group by accident, and an admin-created FORMAT lands in
 * the wrong one with nothing anywhere to signal it. A column the admin picks
 * turns that guess into data.
 */
export const frameCategoryEnum = pgEnum("frame_category", [
  "rolled",
  "frameless",
  "framed",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Products table - main product catalog
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").unique().notNull(),
    title: text("title").notNull(),
    slug: text("slug").unique().notNull(),
    description: text("description"),
    basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),

    // Taxonomy / Categorization
    styles: text("styles").array(),
    subjects: text("subjects").array(),
    colors: text("colors").array(),
    rooms: text("rooms").array(),

    /**
     * Expanded facets (mesonart parity, analysis §1.3 / §4).
     *
     * Values come from the vocabularies in @chobii/shared/constants/facets —
     * that module is the single source of truth and the API validates against
     * it. Do not write free text here.
     *
     * vibe/aesthetic/medium are arrays because a piece can genuinely be both
     * Japandi and Organic Modern.
     */
    vibe: text("vibe").array(),
    aesthetic: text("aesthetic").array(),
    medium: text("medium").array(),

    /**
     * Scalar, unlike the four above: a product has exactly one edition type
     * and one availability. Arrays here would permit a row that is both open
     * and limited edition.
     */
    uniqueness: text("uniqueness"),
    availability: text("availability"),
    tags: text("tags").array(),
    orientation: orientationEnum("orientation").notNull(),

    // Relations (artistId will reference artists table when created)
    artistId: uuid("artist_id"),

    // Images (stored as JSON array for flexibility)
    images: jsonb("images").$type<ProductImage[]>().default([]),

    // SEO metadata
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    // Status and ordering
    status: productStatusEnum("status").default("draft").notNull(),
    featuredOrder: integer("featured_order"),
    isFeatured: boolean("is_featured").default(false).notNull(),

    /**
     * Curator popularity pin (mesonart parity, analysis §1.3.5).
     *
     * The Best-selling sort is driven by real units sold, aggregated from
     * order_items at query time. These two columns let a curator lift a
     * product above that ordering — a merchandising decision, deliberately
     * kept separate from the measurement so the admin can see the two
     * disagree. Pinning never writes a sales figure.
     *
     * Same shape as the featured pair above so the admin form, the query and
     * the index all follow a path the codebase already has.
     */
    popularOrder: integer("popular_order"),
    isPopular: boolean("is_popular").default(false).notNull(),

    // AI generation metadata (for AI-generated posters)
    isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
    aiGenerationId: uuid("ai_generation_id"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for common query patterns
    slugIdx: index("products_slug_idx").on(table.slug),
    statusIdx: index("products_status_idx").on(table.status),
    featuredIdx: index("products_featured_idx").on(
      table.isFeatured,
      table.featuredOrder
    ),
    popularIdx: index("products_popular_idx").on(
      table.isPopular,
      table.popularOrder
    ),
    createdAtIdx: index("products_created_at_idx").on(table.createdAt),
  })
);

/**
 * Product variants table - size variations with pricing
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),

    // Size information
    sizeLabel: text("size_label").notNull(), // e.g., "24x24 inches", "A3"
    widthInches: integer("width_inches").notNull(),
    heightInches: integer("height_inches").notNull(),

    // Alternative measurements (for convenience)
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),

    // Pricing
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),

    // Inventory management
    stockQuantity: integer("stock_quantity").default(0).notNull(),
    lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
    isInStock: boolean("is_in_stock").default(true).notNull(),

    // Variant-specific SKU (optional, for unique size SKUs)
    variantSku: text("variant_sku"),

    // Sort order for display
    sortOrder: integer("sort_order").default(0).notNull(),

    // Status
    isActive: boolean("is_active").default(true).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("product_variants_product_id_idx").on(table.productId),
    sortOrderIdx: index("product_variants_sort_order_idx").on(table.sortOrder),
  })
);

/**
 * Frames table - frame options with pricing
 */
export const frames = pgTable(
  "frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),

    /**
     * Slug identifying this moulding, e.g. `gold`, `stretch-maple`.
     *
     * Text rather than an enum because the admin creates frames, and a
     * Postgres enum cannot gain a value without a migration — an enum here is
     * a ceiling on the catalogue. Unique because the storefront's swatch
     * colour fallback is keyed on it, so two frames sharing a type are
     * indistinguishable to that lookup.
     */
    type: text("type").notNull(),

    /** Which rung of the format axis the storefront groups this under. */
    category: frameCategoryEnum("category").notNull(),

    description: text("description"),

    // Material details
    material: text("material"), // e.g., "Pine wood", "Aluminum"
    thickness: decimal("thickness", { precision: 4, scale: 2 }), // in inches
    color: text("color"), // Display color name

    // Pricing (as a modifier, e.g., 1.40 means 40% price increase)
    priceModifier: decimal("price_modifier", { precision: 5, scale: 2 })
      .default("1.00")
      .notNull(),

    // Alternative: flat price addition
    priceAddition: decimal("price_addition", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    // Display image
    imageUrl: text("image_url"),
    thumbnailUrl: text("thumbnail_url"),

    // Available sizes (which product sizes this frame works with)
    // If null, available for all sizes
    availableSizes: text("available_sizes").array(),

    // Status and ordering
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: uniqueIndex("frames_type_idx").on(table.type),
    activeIdx: index("frames_active_idx").on(table.isActive),
    sortOrderIdx: index("frames_sort_order_idx").on(table.sortOrder),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Products relations
 */
export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
}));

/**
 * Product variants relations
 */
export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
  })
);

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

export type Frame = typeof frames.$inferSelect;
export type NewFrame = typeof frames.$inferInsert;

export type Orientation = (typeof orientationEnum.enumValues)[number];
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type FrameCategory = (typeof frameCategoryEnum.enumValues)[number];
