/**
 * Product Schemas for MasonArt Platform
 *
 * Zod schemas for validating product data including:
 * - Products
 * - Product variants (sizes)
 * - Product images
 * - Frames
 */

import { z } from 'zod';

/**
 * Product status enum
 */
export const ProductStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

/**
 * Product orientation enum
 */
export const ProductOrientationSchema = z.enum([
  'square',
  'portrait',
  'landscape',
  'panoramic',
  'round',
]);
export type ProductOrientation = z.infer<typeof ProductOrientationSchema>;

/**
 * Product Image Schema
 */
export const ProductImageSchema = z.object({
  url: z.string().url('Image URL must be a valid URL'),
  alt: z.string().min(1, 'Image alt text is required'),
  width: z.number().int().positive('Image width must be a positive integer'),
  height: z.number().int().positive('Image height must be a positive integer'),
  isPrimary: z.boolean(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

/**
 * Product Schema
 */
export const ProductSchema = z.object({
  id: z.string().min(1, 'Product ID is required'),
  sku: z
    .string()
    .min(1, 'SKU is required')
    .regex(/^[A-Z0-9-]+$/, 'SKU must contain only uppercase letters, numbers, and hyphens'),
  title: z
    .string()
    .min(1, 'Product title is required')
    .max(200, 'Product title must be 200 characters or less'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be 2000 characters or less'),
  basePrice: z
    .string()
    .regex(/^\d+\.\d{2}$/, 'Base price must be in format: 0000.00'),
  styles: z
    .array(z.string().min(1))
    .min(1, 'At least one style is required')
    .max(10, 'Maximum 10 styles allowed'),
  subjects: z
    .array(z.string().min(1))
    .min(1, 'At least one subject is required')
    .max(10, 'Maximum 10 subjects allowed'),
  colors: z
    .array(z.string().min(1))
    .min(1, 'At least one color is required')
    .max(10, 'Maximum 10 colors allowed'),
  orientation: ProductOrientationSchema,
  artistId: z.string().optional(),
  images: z
    .array(ProductImageSchema)
    .min(1, 'At least one image is required')
    .max(10, 'Maximum 10 images allowed'),
  seoTitle: z
    .string()
    .min(1, 'SEO title is required')
    .max(70, 'SEO title should be 70 characters or less for optimal display'),
  seoDescription: z
    .string()
    .min(1, 'SEO description is required')
    .max(160, 'SEO description should be 160 characters or less for optimal display'),
  status: ProductStatusSchema,
  featuredOrder: z.number().int().positive().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Product Create Schema (for creating new products)
 * Omits auto-generated fields (id, createdAt, updatedAt)
 * Uses strict mode to reject any extra fields
 */
export const ProductCreateSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).strict();
export type ProductCreate = z.infer<typeof ProductCreateSchema>;

/**
 * Product Update Schema (for updating existing products)
 * All fields are optional except id
 */
export const ProductUpdateSchema = ProductSchema.partial().required({ id: true });
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

/**
 * Product Variant Schema (Size options)
 */
export const ProductVariantSchema = z.object({
  id: z.string().min(1, 'Variant ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  sizeLabel: z
    .string()
    .min(1, 'Size label is required')
    .regex(/^\d+x\d+\s+(inches|cm)$/, 'Size label must be in format: "12x16 inches" or "30x40 cm"'),
  widthInches: z.number().positive('Width must be a positive number'),
  heightInches: z.number().positive('Height must be a positive number'),
  price: z
    .string()
    .regex(/^\d+\.\d{2}$/, 'Price must be in format: 0000.00'),
  stockQuantity: z.number().int().nonnegative('Stock quantity must be a non-negative integer'),
  createdAt: z.date(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

/**
 * Product Variant Create Schema
 */
export const ProductVariantCreateSchema = ProductVariantSchema.omit({
  id: true,
  createdAt: true,
});
export type ProductVariantCreate = z.infer<typeof ProductVariantCreateSchema>;

/**
 * Frame Schema
 */
export const FrameSchema = z.object({
  id: z.string().min(1, 'Frame ID is required'),
  name: z
    .string()
    .min(1, 'Frame name is required')
    .max(100, 'Frame name must be 100 characters or less'),
  type: z
    .string()
    .min(1, 'Frame type is required')
    .regex(/^[a-z0-9-]+$/, 'Frame type must contain only lowercase letters, numbers, and hyphens'),
  material: z.string().min(1, 'Frame material is required'),
  priceModifier: z
    .string()
    .regex(/^\d+\.\d{2}$/, 'Price modifier must be in format: 0.00 (e.g., 1.40 for 40% markup)'),
  imageUrl: z.string().url('Frame image URL must be a valid URL'),
  isActive: z.boolean(),
});
export type Frame = z.infer<typeof FrameSchema>;

/**
 * Frame Create Schema
 */
export const FrameCreateSchema = FrameSchema.omit({ id: true });
export type FrameCreate = z.infer<typeof FrameCreateSchema>;

/**
 * Product Filter Schema (for API queries)
 */
export const ProductFilterSchema = z.object({
  styles: z.array(z.string()).optional(),
  subjects: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  orientation: ProductOrientationSchema.optional(),
  status: ProductStatusSchema.optional(),
  minPrice: z.string().regex(/^\d+\.\d{2}$/).optional(),
  maxPrice: z.string().regex(/^\d+\.\d{2}$/).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type ProductFilter = z.infer<typeof ProductFilterSchema>;
