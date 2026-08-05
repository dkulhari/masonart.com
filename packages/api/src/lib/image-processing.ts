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
import {
  MAT_COLOR,
  MAT_CANVAS,
  MAT_ART_INSET,
  type ImageCrop,
} from "@chobii/shared";
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
 * How far a border tone may sit from the corner tone and still count as border.
 *
 * Sized to span the gap between our own mat and the light fields real sources
 * arrive on — the reference artwork measured rgb(240,240,240) against our
 * rgb(250,250,250), so anything tighter than 10 leaves both visible. 24 carries
 * that plus room for the compression noise a lossy source has along the edge.
 */
const BORDER_TRIM_THRESHOLD = 24;

/**
 * Smallest share of the longest side a trim may leave behind.
 *
 * A piece composed AS a light field — a small mark on white — is artwork, not a
 * bordered source. Trimming to the mark and then blowing it up to fill 88% of
 * the canvas would destroy it, so a trim that aggressive is refused and the
 * source is matted as it came.
 */
const BORDER_TRIM_MIN_RETAINED = 0.5;

/**
 * Remove a uniform border the source already carries, if it has one.
 *
 * Sources are not raw art. Anything captured from another storefront arrives
 * sitting on that storefront's own background, and anything that has already
 * been through this function arrives sitting on ours. Matting either without
 * stripping first stacks a second mat on the first, with a visible tone step
 * between them — and shrinks the art to MAT_ART_INSET squared. #418.
 *
 * Returns the input untouched when there is no border to find, when the trim
 * would take more than BORDER_TRIM_MIN_RETAINED, or when sharp cannot trim at
 * all — an unhelpful trim must never fail an upload.
 */
async function stripUniformBorder(
  input: Buffer
): Promise<{ art: Buffer; sourceLongest: number }> {
  const { width = 0, height = 0 } = await sharp(input).metadata();
  const sourceLongest = Math.max(width, height);
  if (!width || !height) return { art: input, sourceLongest: 0 };

  try {
    const { data, info } = await sharp(input)
      .trim({ threshold: BORDER_TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });

    const retained = Math.max(info.width, info.height) / sourceLongest;
    return retained < BORDER_TRIM_MIN_RETAINED
      ? { art: input, sourceLongest }
      : { art: data, sourceLongest };
  } catch {
    return { art: input, sourceLongest };
  }
}

/**
 * Composite artwork of ANY aspect ratio onto an opaque square mat.
 *
 * The art is contained — never cropped — at MAT_ART_INSET of the longest side.
 * The inset (rather than plain `fit: 'contain'`) guarantees a visible mat on
 * every product, so square art does not bleed to the card edge while portrait
 * art floats — which would read as inconsistent across a grid row.
 *
 * Any border the source brought with it is stripped first, so exactly one mat
 * is visible and the function is idempotent on its own output.
 *
 * Small sources are NOT upscaled: they sit smaller on the mat rather than being
 * interpolated. Fake resolution is worse than a wider mat. Stripping a border
 * does not weaken that rule — the art may grow back into the room the border
 * was taking up, but never past the longest side the source actually delivered.
 * Without that allowance a padded 1500px source would land its art at ~72% of
 * the canvas while an unpadded one landed at 88%, and the mat would visibly
 * change width from card to card along a grid row.
 */
export async function matToSquare(input: Buffer): Promise<Buffer> {
  const inner = Math.round(MAT_CANVAS * MAT_ART_INSET);
  const { art: source, sourceLongest } = await stripUniformBorder(input);
  const target = sourceLongest ? Math.min(inner, sourceLongest) : inner;

  const art = await sharp(source)
    .resize(target, target, { fit: "inside", withoutEnlargement: false })
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

/** The largest centred square of a source, as a normalised rect. */
export function centredSquareCrop(width: number, height: number): ImageCrop {
  const side = Math.min(width, height);
  return {
    x: (width - side) / 2 / width,
    y: (height - side) / 2 / height,
    w: side / width,
    h: side / height,
  };
}

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * Crop a photograph to a square using a HUMAN-CHOSEN window, then resize to the
 * canonical canvas. No mat: photographs fill the frame edge-to-edge, because a
 * matted photograph reads as letterboxed rather than composed.
 *
 * The rect is normalised 0..1 against the original so it survives any future
 * re-encode. This function is deliberately dumb — it applies what the admin UI
 * chose — but it defends against rects that are out of range, zero-area, NaN or
 * overflowing the source, falling back to the largest centred square.
 */
export async function cropToSquare(
  input: Buffer,
  crop?: ImageCrop
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const sw = meta.width || MAT_CANVAS;
  const sh = meta.height || MAT_CANVAS;

  const rect = crop ?? centredSquareCrop(sw, sh);

  let left = Math.round(clamp01(rect.x) * sw);
  let top = Math.round(clamp01(rect.y) * sh);
  let width = Math.round(clamp01(rect.w) * sw);
  let height = Math.round(clamp01(rect.h) * sh);

  // Keep the window inside the source and non-degenerate. Order matters:
  // size is clamped against the offset first, then the offset is pulled back
  // so a rect starting near the far edge still yields a usable window.
  width = Math.max(1, Math.min(width, sw - left));
  height = Math.max(1, Math.min(height, sh - top));
  left = Math.max(0, Math.min(left, sw - width));
  top = Math.max(0, Math.min(top, sh - height));

  return sharp(input)
    .extract({ left, top, width, height })
    .resize(MAT_CANVAS, MAT_CANVAS, { fit: "fill" })
    .webp({ quality: 88 })
    .toBuffer();
}
