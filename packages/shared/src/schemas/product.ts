/**
 * Product Zod Schemas for MasonArt Platform
 *
 * Provides runtime validation for all product-related data.
 * These schemas match the types defined in ../types/product.ts
 */

import { z } from "zod";

// ============================================================================
// Enum Schemas
// ============================================================================

export const posterStyleSchema = z.enum([
  "wabi-sabi",
  "minimalist",
  "abstract",
  "modern-contemporary",
  "vintage",
  "retro",
  "pop-art",
  "bohemian",
  "surrealist",
  "photographic",
  "typography",
  "quotes",
  "texture-art",
]);

export const posterSubjectSchema = z.enum([
  "nature-landscape",
  "flowers-botanical",
  "animals",
  "abstract-geometric",
  "people-portraits",
  "city-architecture",
  "sea-ocean",
  "mountains",
  "motivational",
  "ai-generated",
]);

export const productColorSchema = z.enum([
  "black",
  "white",
  "beige",
  "neutral",
  "blue",
  "green",
  "gold",
  "pink",
  "red",
  "grey",
  "black-white",
  "colorful",
  "multi",
  "earth-tones",
]);

export const posterOrientationSchema = z.enum([
  "square",
  "portrait",
  "landscape",
  "panoramic",
  "round",
  "circular",
  "diptych",
  "triptych",
]);

export const roomTypeSchema = z.enum([
  "living-room",
  "bedroom",
  "office",
  "kitchen-dining",
  "kids-room",
  "bathroom",
  "entryway",
]);

export const priceTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const frameTypeSchema = z.enum([
  "poster-only",
  "stretched-canvas",
  "black-frame",
  "white-frame",
  "natural-wood-frame",
  "dark-wood-frame",
  "gold-frame",
  "silver-frame",
  "floating-frame",
]);

export const matOptionSchema = z.enum([
  "no-mat",
  "white-mat",
  "off-white-mat",
  "black-mat",
  "double-mat",
]);

export const glassOptionSchema = z.enum([
  "standard-glass",
  "non-glare-glass",
  "acrylic",
  "plexiglass",
  "museum-glass",
]);

export const productStatusSchema = z.enum([
  "draft",
  "active",
  "out-of-stock",
  "discontinued",
  "coming-soon",
]);

export const collectionTypeSchema = z.enum([
  "new-arrivals",
  "best-sellers",
  "staff-picks",
  "seasonal",
  "sale",
  "ai-generated-gallery",
]);

export const sizeUnitSchema = z.enum(["inches", "cm"]);

export const sizeCategorySchema = z.enum(["square", "portrait-landscape", "panoramic"]);

export const productImageTypeSchema = z.enum([
  "main",
  "detail",
  "texture",
  "room-mockup",
  "frame-preview",
  "360-view",
]);

export const productSortFieldSchema = z.enum([
  "createdAt",
  "updatedAt",
  "title",
  "minPrice",
  "maxPrice",
  "rating",
  "popularity",
]);

export const sortDirectionSchema = z.enum(["asc", "desc"]);

// ============================================================================
// Size Schemas
// ============================================================================

export const productSizeSchema = z.object({
  id: z.string().min(1),
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  priceTier: priceTierSchema,
  category: sizeCategorySchema,
  displayLabel: z.string().min(1),
  displayLabelMetric: z.string().min(1),
});

// ============================================================================
// Price Modifier Schemas
// ============================================================================

export const priceModifierSchema = z.object({
  type: z.enum(["percentage", "fixed"]),
  value: z.number(),
  currency: z.string().optional(),
});

// ============================================================================
// Frame Schemas
// ============================================================================

export const frameOptionSchema = z.object({
  id: z.string().min(1),
  type: frameTypeSchema,
  name: z.string().min(1),
  description: z.string(),
  priceModifier: priceModifierSchema,
  availableColors: z.array(z.string()).optional(),
  material: z.string().optional(),
  compatibleSizes: z.array(z.string()).optional(),
  isAvailable: z.boolean(),
});

export const matOptionConfigSchema = z.object({
  id: z.string().min(1),
  type: matOptionSchema,
  name: z.string().min(1),
  description: z.string(),
  borderWidth: z.number().nonnegative(),
  priceModifier: priceModifierSchema,
  isAvailable: z.boolean(),
});

export const glassOptionConfigSchema = z.object({
  id: z.string().min(1),
  type: glassOptionSchema,
  name: z.string().min(1),
  description: z.string(),
  priceModifier: priceModifierSchema,
  hasUVProtection: z.boolean(),
  isAntiReflective: z.boolean(),
  isAvailable: z.boolean(),
});

// ============================================================================
// Artist Schemas
// ============================================================================

export const artistSocialLinksSchema = z.object({
  website: z.string().url().optional(),
  instagram: z.string().optional(),
  twitter: z.string().optional(),
  behance: z.string().url().optional(),
  dribbble: z.string().url().optional(),
});

export const artistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  bio: z.string().max(5000),
  profileImageUrl: z.string().url().optional(),
  socialLinks: artistSocialLinksSchema.optional(),
  featuredWorkIds: z.array(z.string()).optional(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Product Image Schemas
// ============================================================================

export const productImageSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().min(1).max(500),
  type: productImageTypeSchema,
  sortOrder: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// ============================================================================
// Product SEO Schemas
// ============================================================================

export const productSEOSchema = z.object({
  title: z.string().min(1).max(70),
  description: z.string().min(1).max(200),
  keywords: z.array(z.string()).default([]),
  canonicalUrl: z.string().url().optional(),
});

// ============================================================================
// Product Variant Schemas
// ============================================================================

export const productVariantSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  sizeId: z.string().min(1),
  size: productSizeSchema,
  basePrice: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().optional(),
  stockQuantity: z.number().int().min(-1), // -1 for unlimited/made-to-order
  sku: z.string().min(1).max(50),
  isAvailable: z.boolean(),
});

// ============================================================================
// Product Rating Schema
// ============================================================================

export const productRatingSchema = z.object({
  averageRating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
});

// ============================================================================
// Product Schemas
// ============================================================================

export const productSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(10000),
  shortDescription: z.string().max(500).optional(),

  // Categorization
  styles: z.array(posterStyleSchema).min(1),
  subjects: z.array(posterSubjectSchema).min(1),
  primaryColor: productColorSchema,
  secondaryColors: z.array(productColorSchema).default([]),
  orientation: posterOrientationSchema,
  roomSuggestions: z.array(roomTypeSchema).default([]),
  tags: z.array(z.string()).default([]),

  // Pricing & Variants
  variants: z.array(productVariantSchema).min(1),
  minPrice: z.number().int().nonnegative(),
  maxPrice: z.number().int().nonnegative(),

  // Media
  images: z.array(productImageSchema).min(1),

  // Artist
  artistId: z.string().optional(),
  artist: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      profileImageUrl: z.string().url().optional(),
    })
    .optional(),

  // Related products
  relatedProductIds: z.array(z.string()).default([]),

  // Status & SEO
  status: productStatusSchema,
  seo: productSEOSchema,

  // Aggregate data
  rating: productRatingSchema.optional(),
  isFeatured: z.boolean().default(false),
  isAIGenerated: z.boolean().default(false),

  // Timestamps
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  publishedAt: z.coerce.date().optional(),
});

// ============================================================================
// Product List Item Schema (for listing pages)
// ============================================================================

export const productListItemSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  shortDescription: z.string().optional(),
  primaryColor: productColorSchema,
  orientation: posterOrientationSchema,
  styles: z.array(posterStyleSchema),
  mainImage: productImageSchema,
  minPrice: z.number().int().nonnegative(),
  maxPrice: z.number().int().nonnegative(),
  rating: productRatingSchema.optional(),
  isFeatured: z.boolean(),
  isAIGenerated: z.boolean(),
  artist: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
});

// ============================================================================
// Product Filter Schema
// ============================================================================

export const productFiltersSchema = z.object({
  styles: z.array(posterStyleSchema).optional(),
  subjects: z.array(posterSubjectSchema).optional(),
  colors: z.array(productColorSchema).optional(),
  orientations: z.array(posterOrientationSchema).optional(),
  rooms: z.array(roomTypeSchema).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  priceTiers: z.array(priceTierSchema).optional(),
  artistIds: z.array(z.string()).optional(),
  isAIGenerated: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.array(productStatusSchema).optional(),
  searchQuery: z.string().optional(),
});

// ============================================================================
// Product Sort Schema
// ============================================================================

export const productSortSchema = z.object({
  field: productSortFieldSchema,
  direction: sortDirectionSchema,
});

// ============================================================================
// Paginated Products Response Schema
// ============================================================================

export const paginatedProductsSchema = z.object({
  items: z.array(productListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

// ============================================================================
// Collection Schema
// ============================================================================

export const collectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000),
  type: collectionTypeSchema,
  coverImageUrl: z.string().url().optional(),
  productIds: z.array(z.string()).default([]),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  seo: productSEOSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Product Configuration Schemas (Cart/Order)
// ============================================================================

export const productConfigurationSchema = z.object({
  variantId: z.string().min(1),
  frameOptionId: z.string().optional(),
  matOptionId: z.string().optional(),
  glassOptionId: z.string().optional(),
  customInstructions: z.string().max(1000).optional(),
  isGiftWrapped: z.boolean().optional(),
});

export const productPriceBreakdownSchema = z.object({
  basePrice: z.number().int().nonnegative(),
  framePrice: z.number().int().nonnegative(),
  matPrice: z.number().int().nonnegative(),
  glassPrice: z.number().int().nonnegative(),
  giftWrapPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
});

// ============================================================================
// Input Schemas (for API requests)
// ============================================================================

/**
 * Schema for creating a new product
 */
export const createProductInputSchema = productSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  minPrice: true,
  maxPrice: true,
  rating: true,
});

/**
 * Schema for updating a product
 */
export const updateProductInputSchema = createProductInputSchema.partial();

/**
 * Schema for creating a new artist
 */
export const createArtistInputSchema = artistSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Schema for updating an artist
 */
export const updateArtistInputSchema = createArtistInputSchema.partial();

/**
 * Schema for creating a new collection
 */
export const createCollectionInputSchema = collectionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Schema for updating a collection
 */
export const updateCollectionInputSchema = createCollectionInputSchema.partial();

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type PosterStyleSchema = z.infer<typeof posterStyleSchema>;
export type PosterSubjectSchema = z.infer<typeof posterSubjectSchema>;
export type ProductColorSchema = z.infer<typeof productColorSchema>;
export type PosterOrientationSchema = z.infer<typeof posterOrientationSchema>;
export type RoomTypeSchema = z.infer<typeof roomTypeSchema>;
export type PriceTierSchema = z.infer<typeof priceTierSchema>;
export type FrameTypeSchema = z.infer<typeof frameTypeSchema>;
export type MatOptionSchemaType = z.infer<typeof matOptionSchema>;
export type GlassOptionSchema = z.infer<typeof glassOptionSchema>;
export type ProductStatusSchema = z.infer<typeof productStatusSchema>;
export type CollectionTypeSchema = z.infer<typeof collectionTypeSchema>;
export type ProductSizeSchema = z.infer<typeof productSizeSchema>;
export type FrameOptionSchema = z.infer<typeof frameOptionSchema>;
export type MatOptionConfigSchema = z.infer<typeof matOptionConfigSchema>;
export type GlassOptionConfigSchema = z.infer<typeof glassOptionConfigSchema>;
export type ArtistSchema = z.infer<typeof artistSchema>;
export type ProductImageSchema = z.infer<typeof productImageSchema>;
export type ProductSEOSchema = z.infer<typeof productSEOSchema>;
export type ProductVariantSchema = z.infer<typeof productVariantSchema>;
export type ProductRatingSchema = z.infer<typeof productRatingSchema>;
export type ProductSchema = z.infer<typeof productSchema>;
export type ProductListItemSchema = z.infer<typeof productListItemSchema>;
export type ProductFiltersSchema = z.infer<typeof productFiltersSchema>;
export type ProductSortSchema = z.infer<typeof productSortSchema>;
export type PaginatedProductsSchema = z.infer<typeof paginatedProductsSchema>;
export type CollectionSchema = z.infer<typeof collectionSchema>;
export type ProductConfigurationSchema = z.infer<typeof productConfigurationSchema>;
export type ProductPriceBreakdownSchema = z.infer<typeof productPriceBreakdownSchema>;
export type CreateProductInputSchema = z.infer<typeof createProductInputSchema>;
export type UpdateProductInputSchema = z.infer<typeof updateProductInputSchema>;
export type CreateArtistInputSchema = z.infer<typeof createArtistInputSchema>;
export type UpdateArtistInputSchema = z.infer<typeof updateArtistInputSchema>;
export type CreateCollectionInputSchema = z.infer<typeof createCollectionInputSchema>;
export type UpdateCollectionInputSchema = z.infer<typeof updateCollectionInputSchema>;
