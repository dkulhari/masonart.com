/**
 * Admin Products API Routes
 *
 * Provides admin API endpoints for product management:
 * - GET /api/admin/products - List all products with pagination (including drafts)
 * - GET /api/admin/products/:id - Get product by ID
 * - POST /api/admin/products - Create a new product
 * - PATCH /api/admin/products/:id - Update a product
 * - DELETE /api/admin/products/:id - Delete a product (soft delete via archive)
 * - POST /api/admin/products/:id/variants - Add variant to product
 * - PATCH /api/admin/products/:id/variants/:variantId - Update variant
 * - DELETE /api/admin/products/:id/variants/:variantId - Delete variant
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, ilike, or } from "drizzle-orm";

import { db } from "../../database";
import {
  products,
  productVariants,
  type ProductImage,
  type Orientation,
  type ProductStatus,
} from "../../database/schema/products";
import {
  requireAuth,
  requireContentManager,
  type AuthVariables,
} from "../../middleware/auth";
import { purgeProductResponseCache } from "../../lib/redis";
import { unitsSoldSql } from "../../lib/product-sales";
import { buildProductMedia } from "../../lib/product-media";
import {
  ADMIN_IMAGE_MIME_TYPES,
  MAX_ADMIN_IMAGE_MB,
  orientationContradictingArt,
  type ProportionOrientation,
} from "@chobii/shared";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Product image schema for validation.
 *
 * Mirrors the ProductImage contract in @chobii/shared. Notably `width` and
 * `height` are required and must be equal — the storefront grid's row alignment
 * depends on every stored image being square, so a non-square record is
 * rejected at the boundary rather than discovered as a visual bug later.
 */
const productImageSchema = z
  .object({
    id: z.string(),
    url: z.string().url(),
    altText: z.string(),
    type: z.enum([
      "main",
      "detail",
      "texture",
      "room-mockup",
      "frame-preview",
      "360-view",
    ]),
    sortOrder: z.number().int().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
    variants: z
      .array(
        z.object({
          name: z.string(),
          width: z.number().positive(),
          url: z.string().url(),
        })
      )
      .optional(),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
      })
      .optional(),
    /**
     * Where the artwork sits on its mat, measured at upload time.
     *
     * Declared here because zod strips what it does not know: the upload
     * endpoint returns this and the admin posts the same object straight back,
     * so leaving it out silently discarded the one measurement the storefront
     * cannot retake — the stored image is 1500x1500 for a 3:1 panorama and a
     * perfect square alike. #545.
     */
    artBox: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
      })
      .optional(),
    originalKey: z.string(),
  })
  .refine((img) => img.width === img.height, {
    message: "Product images must be square (width must equal height)",
    path: ["width"],
  });

/**
 * The orientation the artwork measures, when it contradicts the one declared.
 *
 * Only the matted `main` image is a witness. A room mockup or a texture shot is
 * cropped to fill its square by a human-chosen window, so its box says nothing
 * about the proportion of the piece — `buildProductMedia` does not even measure
 * one.
 *
 * Returns undefined for "no objection", which covers the cases that matter as
 * much as the catch: no artwork, no measurement (the box is dropped for
 * full-bleed sources), or an orientation counting panels rather than shape.
 */
function orientationAgainstArtwork(
  orientation: string | null | undefined,
  images: readonly ProductImage[] | null | undefined
): ProportionOrientation | undefined {
  const artwork = images?.find((image) => image.type === "main");
  return orientationContradictingArt(orientation, artwork?.artBox);
}

/** The 400 an admin gets back, naming both sides so the disagreement is legible. */
const orientationConflict = (declared: string, measured: string) => ({
  error:
    `The artwork measures ${measured}, but this product declares ` +
    `${declared}. The storefront crops from the column, so a wrong value ` +
    `renders a wrong window into the picture. Send ` +
    `orientationOverride: true to store it anyway.`,
  declared,
  measured,
});

/**
 * Query parameters for admin product listing
 */
const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
  status: z.enum(["draft", "active", "archived"]).optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "title", "basePrice", "sku"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * Schema for creating a new product
 */
const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(5000).optional(),
  basePrice: z.string().regex(/^\d+(\.\d{2})?$/, "Invalid price format"),
  styles: z.array(z.string()).optional(),
  subjects: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  rooms: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  orientation: z.enum([
    "square",
    "portrait",
    "landscape",
    "panoramic",
    "round",
    // On the `orientation` postgres enum and in ORIENTATION_OPTIONS since #535,
    // but missing here — which left the two diptychs in the catalogue
    // (digital-cosmos, paper-layers) un-editable through the admin API.
    "set-of-2-3",
  ]),
  artistId: z.string().uuid().optional().nullable(),
  images: z.array(productImageSchema).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
  isFeatured: z.boolean().optional().default(false),
  featuredOrder: z.number().int().optional().nullable(),
  /**
   * Curator pin for the Best-selling sort. Reordering only — the units-sold
   * figure on the list is the measurement and stays untouched by this, which
   * is why an admin sees both side by side.
   *
   * `popularOrder` is nullable on purpose: unpinning is not the same as
   * ranking first.
   */
  isPopular: z.boolean().optional().default(false),
  popularOrder: z.number().int().optional().nullable(),
  isAiGenerated: z.boolean().optional().default(false),
  aiGenerationId: z.string().uuid().optional().nullable(),
  /**
   * Write this orientation even though the artwork measures something else.
   *
   * Not a column — it decides one request. The measurement is a heuristic over
   * a photograph (it trims a wall; it can meet a piece composed as a small mark
   * on white), so an admin who genuinely knows better must not be wedged. It
   * being explicit is the whole value: the catalogue drifted because
   * contradicting the picture took no decision at all. #545.
   */
  orientationOverride: z.boolean().optional(),
});

/**
 * Schema for updating a product
 */
const updateProductSchema = createProductSchema.partial();

/**
 * Schema for creating a product variant
 */
const createVariantSchema = z.object({
  sizeLabel: z.string().min(1).max(50),
  widthInches: z.number().int().positive(),
  heightInches: z.number().int().positive(),
  widthCm: z.number().int().positive().optional(),
  heightCm: z.number().int().positive().optional(),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Invalid price format"),
  stockQuantity: z.number().int().nonnegative().optional().default(0),
  lowStockThreshold: z.number().int().nonnegative().optional().default(5),
  isInStock: z.boolean().optional().default(true),
  variantSku: z.string().max(100).optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

/**
 * Schema for updating a product variant
 */
const updateVariantSchema = createVariantSchema.partial();

// ============================================================================
// Route Handler
// ============================================================================

const adminProductsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and content management role requirement to all routes
// (content-manager, admin, or super-admin)
adminProductsApp.use("*", requireAuth);
adminProductsApp.use("*", requireContentManager);

// ============================================================================
// POST /api/admin/products/upload-image - Upload Product Image
// ============================================================================

/**
 * Text fields accompanying the uploaded file.
 *
 * `crop` arrives as a JSON string because it rides in multipart form data; it
 * is parsed and validated here rather than trusted downstream. cropToSquare
 * clamps defensively too, but a malformed rect should be a 400, not a silent
 * fallback to the centred square.
 */
const uploadImageFieldsSchema = z.object({
  type: z
    .enum(["main", "detail", "texture", "room-mockup", "frame-preview", "360-view"])
    .default("main"),
  altText: z.string().max(300).default(""),
  sortOrder: z.coerce.number().int().min(0).default(0),
  crop: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      try {
        return z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            w: z.number().min(0).max(1),
            h: z.number().min(0).max(1),
          })
          .parse(JSON.parse(s));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "crop must be JSON {x,y,w,h} with values in 0..1",
        });
        return z.NEVER;
      }
    }),
});

adminProductsApp.post("/upload-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (!ADMIN_IMAGE_MIME_TYPES.includes(file.type)) {
    return c.json(
      { error: "Invalid file type. Supported: JPEG, PNG, WebP" },
      400
    );
  }
  if (file.size > MAX_ADMIN_IMAGE_MB * 1024 * 1024) {
    return c.json(
      { error: `File too large. Maximum size is ${MAX_ADMIN_IMAGE_MB}MB` },
      400
    );
  }

  // Text fields alongside the file. `type` decides how the image is squared:
  // 'main' is matted and never cropped; everything else is cropped to the
  // window the admin chose.
  const fields = uploadImageFieldsSchema.safeParse({
    type: formData.get("type") ?? undefined,
    altText: formData.get("altText") ?? undefined,
    sortOrder: formData.get("sortOrder") ?? undefined,
    crop: formData.get("crop") ?? undefined,
  });

  if (!fields.success) {
    return c.json(
      { error: "Invalid upload fields", details: fields.error.flatten() },
      400
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await buildProductMedia(buffer, file.name, file.type, fields.data);

    return c.json({ success: true, image }, 201);
  } catch (error) {
    console.error("[AdminProducts] Image upload failed:", error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
});

// ============================================================================
// GET /api/admin/products - List Products (Admin)
// ============================================================================

adminProductsApp.get(
  "/",
  zValidator("query", listProductsQuerySchema),
  async (c) => {
    const { page, pageSize, status, search, sortBy, sortOrder } =
      c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(products.status, status));
      }

      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          or(
            ilike(products.title, searchPattern),
            ilike(products.sku, searchPattern),
            ilike(products.slug, searchPattern)
          )!
        );
      }

      // Build sort order
      const orderByColumn = {
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        title: products.title,
        basePrice: products.basePrice,
        sku: products.sku,
      }[sortBy];

      const orderByDirection = sortOrder === "asc" ? asc : desc;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Get products with variant count
      const productList = await db
        .select({
          id: products.id,
          sku: products.sku,
          title: products.title,
          slug: products.slug,
          description: products.description,
          basePrice: products.basePrice,
          styles: products.styles,
          subjects: products.subjects,
          colors: products.colors,
          rooms: products.rooms,
          orientation: products.orientation,
          images: products.images,
          status: products.status,
          isFeatured: products.isFeatured,
          featuredOrder: products.featuredOrder,
          isPopular: products.isPopular,
          popularOrder: products.popularOrder,
          /**
           * The real figure, beside the pin that can override it. Curating
           * without seeing what you are overriding is how a merchandising
           * decision quietly becomes a belief about sales.
           */
          unitsSold: unitsSoldSql(),
          isAiGenerated: products.isAiGenerated,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderByDirection(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      return c.json({
        items: productList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      return c.json({ error: "Failed to fetch products" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/products/:id - Get Product by ID (Admin)
// ============================================================================

adminProductsApp.get("/:id", async (c) => {
  const { id } = c.req.param();

  // Validate UUID format
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return c.json({ error: "Invalid product ID format" }, 400);
  }

  try {
    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
      with: {
        variants: {
          orderBy: asc(productVariants.sortOrder),
        },
      },
    });

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    return c.json(product);
  } catch (error) {
    return c.json({ error: "Failed to fetch product" }, 500);
  }
});

// ============================================================================
// POST /api/admin/products - Create Product
// ============================================================================

adminProductsApp.post(
  "/",
  zValidator("json", createProductSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      // Check if SKU already exists
      const existingSku = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, input.sku))
        .limit(1);

      if (existingSku.length > 0) {
        return c.json({ error: "SKU already exists" }, 409);
      }

      // Check if slug already exists
      const existingSlug = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, input.slug))
        .limit(1);

      if (existingSlug.length > 0) {
        return c.json({ error: "Slug already exists" }, 409);
      }

      // The column and the picture have to agree, or the storefront crops the
      // wrong window. #545.
      if (!input.orientationOverride) {
        const measured = orientationAgainstArtwork(
          input.orientation,
          input.images as ProductImage[] | undefined
        );
        if (measured) {
          return c.json(orientationConflict(input.orientation, measured), 400);
        }
      }

      // Create product
      const insertedProducts = await db
        .insert(products)
        .values({
          sku: input.sku,
          title: input.title,
          slug: input.slug,
          description: input.description || null,
          basePrice: input.basePrice,
          styles: input.styles || [],
          subjects: input.subjects || [],
          colors: input.colors || [],
          rooms: input.rooms || [],
          tags: input.tags || [],
          orientation: input.orientation as Orientation,
          artistId: input.artistId || null,
          images: (input.images as ProductImage[]) || [],
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          status: (input.status as ProductStatus) || "draft",
          isFeatured: input.isFeatured || false,
          featuredOrder: input.featuredOrder || null,
          isPopular: input.isPopular || false,
          popularOrder: input.popularOrder ?? null,
          isAiGenerated: input.isAiGenerated || false,
          aiGenerationId: input.aiGenerationId || null,
        })
        .returning();

      const newProduct = insertedProducts[0];
      if (!newProduct) {
        throw new Error("Failed to create product");
      }

      await purgeProductResponseCache();

      return c.json(
        {
          message: "Product created successfully",
          product: newProduct,
        },
        201
      );
    } catch (error) {
      return c.json({ error: "Failed to create product" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/products/:id - Update Product
// ============================================================================

adminProductsApp.patch(
  "/:id",
  zValidator("json", updateProductSchema),
  async (c) => {
    const { id } = c.req.param();
    const input = c.req.valid("json");

    // Validate UUID format
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return c.json({ error: "Invalid product ID format" }, 400);
    }

    try {
      // Check if product exists
      const existing = await db
        .select({
          id: products.id,
          slug: products.slug,
          sku: products.sku,
          // Both sides of the #545 check. A payload may carry a new
          // orientation, new artwork, or neither — the stored row supplies
          // whichever half is missing.
          orientation: products.orientation,
          images: products.images,
        })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Product not found" }, 404);
      }

      const existingProduct = existing[0];
      if (!existingProduct) {
        return c.json({ error: "Product not found" }, 404);
      }

      // Check for SKU conflict if updating SKU
      if (input.sku && input.sku !== existingProduct.sku) {
        const skuConflict = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, input.sku))
          .limit(1);

        if (skuConflict.length > 0) {
          return c.json({ error: "SKU already exists" }, 409);
        }
      }

      // Check for slug conflict if updating slug
      if (input.slug && input.slug !== existingProduct.slug) {
        const slugConflict = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, input.slug))
          .limit(1);

        if (slugConflict.length > 0) {
          return c.json({ error: "Slug already exists" }, 409);
        }
      }

      /*
       * Check the column against the picture, but only when this write touches
       * one of them.
       *
       * A row that is already wrong stays writable — renaming a product is not
       * the moment to demand its data be fixed, and refusing every edit until
       * it is would make the 27 rows #545 found unmaintainable. What cannot
       * happen is a write that CREATES the disagreement, in either direction:
       * a new orientation over the old artwork, or new artwork under the old
       * orientation. The catalogue drifted through the second one.
       */
      const touchesOrientation =
        input.orientation !== undefined || input.images !== undefined;

      if (touchesOrientation && !input.orientationOverride) {
        const orientation = input.orientation ?? existingProduct.orientation;
        const images = (input.images ??
          existingProduct.images) as ProductImage[] | null;
        const measured = orientationAgainstArtwork(orientation, images);
        if (measured) {
          return c.json(orientationConflict(orientation, measured), 400);
        }
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.sku !== undefined) updateData.sku = input.sku;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.slug !== undefined) updateData.slug = input.slug;
      if (input.description !== undefined)
        updateData.description = input.description;
      if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
      if (input.styles !== undefined) updateData.styles = input.styles;
      if (input.subjects !== undefined) updateData.subjects = input.subjects;
      if (input.colors !== undefined) updateData.colors = input.colors;
      if (input.rooms !== undefined) updateData.rooms = input.rooms;
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.orientation !== undefined)
        updateData.orientation = input.orientation;
      if (input.artistId !== undefined) updateData.artistId = input.artistId;
      if (input.images !== undefined) updateData.images = input.images;
      if (input.seoTitle !== undefined) updateData.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined)
        updateData.seoDescription = input.seoDescription;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.isFeatured !== undefined)
        updateData.isFeatured = input.isFeatured;
      if (input.featuredOrder !== undefined)
        updateData.featuredOrder = input.featuredOrder;
      if (input.isPopular !== undefined) updateData.isPopular = input.isPopular;
      if (input.popularOrder !== undefined)
        updateData.popularOrder = input.popularOrder;
      if (input.isAiGenerated !== undefined)
        updateData.isAiGenerated = input.isAiGenerated;
      if (input.aiGenerationId !== undefined)
        updateData.aiGenerationId = input.aiGenerationId;

      // Update product
      const updatedProducts = await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, id))
        .returning();

      const updatedProduct = updatedProducts[0];

      // Both slugs are covered without naming either: a rename has to drop the
      // old detail key as well as the new one, and the prefix purge does that
      // for free.
      await purgeProductResponseCache();

      return c.json({
        message: "Product updated successfully",
        product: updatedProduct,
      });
    } catch (error) {
      return c.json({ error: "Failed to update product" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/admin/products/:id - Archive Product (Soft Delete)
// ============================================================================

adminProductsApp.delete("/:id", async (c) => {
  const { id } = c.req.param();

  // Validate UUID format
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return c.json({ error: "Invalid product ID format" }, 400);
  }

  try {
    // Check if product exists
    const existing = await db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Product not found" }, 404);
    }

    // Soft delete by setting status to archived
    await db
      .update(products)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    await purgeProductResponseCache();

    return c.json({
      message: "Product archived successfully",
    });
  } catch (error) {
    return c.json({ error: "Failed to archive product" }, 500);
  }
});

// ============================================================================
// POST /api/admin/products/:id/variants - Add Variant
// ============================================================================

adminProductsApp.post(
  "/:id/variants",
  zValidator("json", createVariantSchema),
  async (c) => {
    const { id } = c.req.param();
    const input = c.req.valid("json");

    // Validate UUID format
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return c.json({ error: "Invalid product ID format" }, 400);
    }

    try {
      // Check if product exists
      const existing = await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Product not found" }, 404);
      }

      // Create variant
      const insertedVariants = await db
        .insert(productVariants)
        .values({
          productId: id,
          sizeLabel: input.sizeLabel,
          widthInches: input.widthInches,
          heightInches: input.heightInches,
          widthCm: input.widthCm || null,
          heightCm: input.heightCm || null,
          price: input.price,
          stockQuantity: input.stockQuantity ?? 0,
          lowStockThreshold: input.lowStockThreshold ?? 5,
          isInStock: input.isInStock ?? true,
          variantSku: input.variantSku || null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        })
        .returning();

      const newVariant = insertedVariants[0];

      await purgeProductResponseCache();

      return c.json(
        {
          message: "Variant created successfully",
          variant: newVariant,
        },
        201
      );
    } catch (error) {
      return c.json({ error: "Failed to create variant" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/products/:id/variants/:variantId - Update Variant
// ============================================================================

adminProductsApp.patch(
  "/:id/variants/:variantId",
  zValidator("json", updateVariantSchema),
  async (c) => {
    const { id, variantId } = c.req.param();
    const input = c.req.valid("json");

    // Validate UUID formats
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id) || !uuidRegex.test(variantId)) {
      return c.json({ error: "Invalid ID format" }, 400);
    }

    try {
      // Check if variant exists and belongs to product
      const existingVariant = await db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.productId, id)
          )
        )
        .limit(1);

      if (existingVariant.length === 0) {
        return c.json({ error: "Variant not found" }, 404);
      }

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (input.sizeLabel !== undefined) updateData.sizeLabel = input.sizeLabel;
      if (input.widthInches !== undefined)
        updateData.widthInches = input.widthInches;
      if (input.heightInches !== undefined)
        updateData.heightInches = input.heightInches;
      if (input.widthCm !== undefined) updateData.widthCm = input.widthCm;
      if (input.heightCm !== undefined) updateData.heightCm = input.heightCm;
      if (input.price !== undefined) updateData.price = input.price;
      if (input.stockQuantity !== undefined)
        updateData.stockQuantity = input.stockQuantity;
      if (input.lowStockThreshold !== undefined)
        updateData.lowStockThreshold = input.lowStockThreshold;
      if (input.isInStock !== undefined) updateData.isInStock = input.isInStock;
      if (input.variantSku !== undefined)
        updateData.variantSku = input.variantSku;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      // Update variant
      const updatedVariants = await db
        .update(productVariants)
        .set(updateData)
        .where(eq(productVariants.id, variantId))
        .returning();

      const updatedVariant = updatedVariants[0];

      await purgeProductResponseCache();

      return c.json({
        message: "Variant updated successfully",
        variant: updatedVariant,
      });
    } catch (error) {
      return c.json({ error: "Failed to update variant" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/admin/products/:id/variants/:variantId - Delete Variant
// ============================================================================

adminProductsApp.delete("/:id/variants/:variantId", async (c) => {
  const { id, variantId } = c.req.param();

  // Validate UUID formats
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id) || !uuidRegex.test(variantId)) {
    return c.json({ error: "Invalid ID format" }, 400);
  }

  try {
    // Check if variant exists and belongs to product
    const existingVariant = await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, id)
        )
      )
      .limit(1);

    if (existingVariant.length === 0) {
      return c.json({ error: "Variant not found" }, 404);
    }

    // Delete variant (or soft delete by setting isActive = false)
    await db
      .update(productVariants)
      .set({ isActive: false })
      .where(eq(productVariants.id, variantId));

    await purgeProductResponseCache();

    return c.json({
      message: "Variant deleted successfully",
    });
  } catch (error) {
    return c.json({ error: "Failed to delete variant" }, 500);
  }
});

// Export the router
export { adminProductsApp };
export default adminProductsApp;
