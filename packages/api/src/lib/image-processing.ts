/**
 * Image Processing Module
 *
 * Provides image optimization utilities:
 * - WebP conversion for smaller file sizes
 * - Responsive size generation (thumbnail, card, detail, full)
 * - Quality optimization
 * - Squaring product media (matToSquare / cropToSquare)
 *
 * Uses Sharp for high-performance image processing.
 */

import sharp from "sharp";
import { MAT_COLOR, MAT_CANVAS, MAT_ART_INSET } from "@chobii/shared";
import { logger } from "./logger";

// ============================================================================
// Types
// ============================================================================

export interface ImageVariant {
  name: string;
  width: number;
  buffer: Buffer;
  contentType: string;
  /** Key suffix for storage, e.g. "-thumb" */
  suffix: string;
}

export interface ProcessedImage {
  /** Original image converted to WebP */
  original: {
    buffer: Buffer;
    contentType: string;
    width: number;
    height: number;
  };
  /** Responsive variants in WebP */
  variants: ImageVariant[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Responsive image sizes used across the platform.
 * Each variant is generated as WebP for optimal delivery.
 */
export const IMAGE_SIZES = {
  thumbnail: { width: 150, quality: 70, suffix: "-thumb" },
  card: { width: 400, quality: 75, suffix: "-card" },
  detail: { width: 800, quality: 80, suffix: "-detail" },
  full: { width: 1200, quality: 85, suffix: "-full" },
} as const;

export type ImageSizeName = keyof typeof IMAGE_SIZES;

// ============================================================================
// Processing Functions
// ============================================================================

/**
 * Process an image: convert to WebP and generate responsive variants.
 *
 * @param input - Image buffer (JPEG, PNG, WebP, or GIF)
 * @returns Processed image with original + responsive variants
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const image = sharp(input);
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 1200;
  const originalHeight = metadata.height || 1200;

  // Convert original to WebP (preserving dimensions)
  const originalWebP = await sharp(input)
    .webp({ quality: 85 })
    .toBuffer();

  // Generate responsive variants (only downscale, never upscale)
  const variants: ImageVariant[] = [];

  for (const [name, config] of Object.entries(IMAGE_SIZES)) {
    // Skip sizes larger than the original
    if (config.width >= originalWidth) continue;

    try {
      const buffer = await sharp(input)
        .resize(config.width, null, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: config.quality })
        .toBuffer();

      variants.push({
        name,
        width: config.width,
        buffer,
        contentType: "image/webp",
        suffix: config.suffix,
      });
    } catch (error) {
      logger.warn(
        { err: error, variant: name, width: config.width },
        "Failed to generate image variant"
      );
    }
  }

  return {
    original: {
      buffer: originalWebP,
      contentType: "image/webp",
      width: originalWidth,
      height: originalHeight,
    },
    variants,
  };
}

/**
 * Convert a single image to WebP without generating variants.
 * Useful for one-off conversions (avatars, reference images).
 */
export async function convertToWebP(
  input: Buffer,
  quality: number = 80
): Promise<Buffer> {
  return sharp(input).webp({ quality }).toBuffer();
}

/**
 * Get image metadata (dimensions, format, size).
 */
export async function getImageMetadata(input: Buffer) {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || "unknown",
    size: metadata.size || input.length,
  };
}

// ============================================================================
// Squaring Product Media
// ============================================================================
//
// Every stored product image is MAT_CANVAS x MAT_CANVAS. That invariant is what
// lets the storefront grid drop all ratio logic: the in-flow card image declares
// `aspect-square` and simply fits.
//
// Two ways to get there, differing in WHO chooses the framing:
//   matToSquare   — artwork. Contained at MAT_ART_INSET on a flat mat. Never cropped.
//   cropToSquare  — photographs. Filled edge-to-edge using a human-chosen window.
//
// The rule is "never crop BLINDLY", not "never crop".
//
// NOTE: processImage() above is deliberately NOT involved. It also serves
// avatars and AI generations, where forcing a square would be wrong.

/**
 * Composite artwork of ANY aspect ratio onto an opaque square mat.
 *
 * The art is contained — never cropped — at MAT_ART_INSET of the longest side.
 * The inset (rather than plain `fit: 'contain'`) guarantees a visible mat on
 * every product, so square art does not bleed to the card edge while portrait
 * art floats — which would read as inconsistent across a grid row.
 *
 * Small sources are NOT upscaled: they sit smaller on the mat rather than being
 * interpolated. Fake resolution is worse than a wider mat.
 */
export async function matToSquare(input: Buffer): Promise<Buffer> {
  const inner = Math.round(MAT_CANVAS * MAT_ART_INSET);

  const art = await sharp(input)
    .resize(inner, inner, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  return sharp({
    create: {
      width: MAT_CANVAS,
      height: MAT_CANVAS,
      channels: 3,
      background: MAT_COLOR,
    },
  })
    .composite([{ input: art, gravity: "centre" }])
    .webp({ quality: 88 })
    .toBuffer();
}
