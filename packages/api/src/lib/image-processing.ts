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
  type ImageArtBox,
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
 * Materialise the image as it is DISPLAYED, honouring its EXIF orientation tag.
 *
 * A phone held in portrait very often stores the frame landscape and tags it
 * "rotate 90 to display". Finder, Preview and the admin form's own preview all
 * honour that tag; sharp does not unless asked — and it STRIPS the tag on
 * write, so once an output exists the rotation is unrecoverable. Every function
 * below measures or transforms whatever pixels it is handed, so each takes its
 * source from here first. #716.
 *
 * The buffer has to be MATERIALISED, not chained: `sharp(x).metadata()` reports
 * the input's stored dimensions, so an `.autoOrient()` further along the same
 * pipeline does not retroactively correct a measurement taken before it.
 *
 * An untagged source — everything already in the catalogue — is returned
 * untouched rather than re-encoded, so this costs nothing off the phone path.
 * A source sharp cannot read is returned untouched too: every caller has its
 * own fallback, and an unreadable asset must never fail an upload here.
 */
async function autoOriented(input: Buffer): Promise<Buffer> {
  try {
    const { orientation } = await sharp(input).metadata();
    if (!orientation || orientation === 1) return input;
    return await sharp(input).autoOrient().toBuffer();
  } catch {
    return input;
  }
}

/**
 * Process an image: convert to WebP and generate responsive variants.
 *
 * @param input - Image buffer (JPEG, PNG, WebP, or GIF)
 * @returns Processed image with original + responsive variants
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const source = await autoOriented(input);
  const image = sharp(source);
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 1200;
  const originalHeight = metadata.height || 1200;

  // Convert original to WebP (preserving dimensions)
  const originalWebP = await sharp(source)
    .webp({ quality: 85 })
    .toBuffer();

  // Generate responsive variants (only downscale, never upscale)
  const variants: ImageVariant[] = [];

  for (const [name, config] of Object.entries(IMAGE_SIZES)) {
    // Skip sizes larger than the original
    if (config.width >= originalWidth) continue;

    try {
      const buffer = await sharp(source)
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
  return sharp(await autoOriented(input)).webp({ quality }).toBuffer();
}

/**
 * Get image metadata (dimensions, format, size).
 *
 * Dimensions are the DISPLAYED ones. A caller deciding portrait vs landscape
 * from a stored rectangle files a portrait poster as landscape.
 */
export async function getImageMetadata(input: Buffer) {
  const source = await autoOriented(input);
  const metadata = await sharp(source).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || "unknown",
    size: metadata.size || source.length,
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
  const { art: source, sourceLongest } = await stripUniformBorder(
    await autoOriented(input)
  );
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

/**
 * Scan resolution for measureArtBox.
 *
 * MAT_CANVAS / 4, with a nearest-neighbour kernel so no interpolated tone is
 * invented along the art's edge. Costs 4 pixels of precision on a 1500 grid —
 * 0.27% of the box — for a 16x cheaper scan.
 */
const ART_SCAN = Math.round(MAT_CANVAS / 4);

/**
 * How far a pixel may sit from MAT_COLOR and still count as mat.
 *
 * WebP is lossy, so the flat mat arrives as 250 +/- a little. Tight enough that
 * a genuinely light artwork edge — the lightest the catalogue holds measures 239
 * — is never mistaken for mat.
 */
const ART_MAT_TOLERANCE = 4;

/**
 * How light a border line must be before it can be called wall rather than art.
 *
 * Luminance, 0..255. The lightest thing the catalogue paints with measures 239;
 * this sits below that only because a WALL line is judged by its DARKEST pixel,
 * not its lightest — see isWallLine.
 */
const ART_WALL_MIN_LUM = 205;

/**
 * How much a wall line may vary across its length and still be flat.
 *
 * Not zero: the walls in question are photographed, so they carry a soft
 * top-to-bottom gradient. cosmic-harmony's runs 246 down to 225 over the height
 * of the piece — a 21 spread with no picture in it anywhere.
 */
const ART_WALL_RANGE = 30;

const luminance = (r: number, g: number, b: number): number =>
  (r * 299 + g * 587 + b * 114) / 1000;

/**
 * Whether a line of pixels is bare wall — light, flat, and holding no edge.
 *
 * Judged on the 2nd and 98th percentiles rather than min/max so a single JPEG
 * speck cannot keep a blank line alive. A line with any part of a picture in it
 * has a dark pixel somewhere (the frame's own edge if nothing else), which puts
 * p2 under ART_WALL_MIN_LUM and ends the trim.
 */
function isWallLine(lums: number[]): boolean {
  if (lums.length === 0) return false;
  const sorted = [...lums].sort((a, b) => a - b);
  const p2 = sorted[Math.max(0, Math.floor(sorted.length * 0.02))]!;
  const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]!;
  return p2 >= ART_WALL_MIN_LUM && p98 - p2 <= ART_WALL_RANGE;
}

/**
 * Where the artwork actually sits inside a matted square, normalised 0..1.
 *
 * THE MEASUREMENT THE STOREFRONT CANNOT TAKE. matToSquare bakes the mat into
 * the pixels, so a 3:1 panorama and a perfect square both come out 1500x1500
 * and the card has no way to tell them apart — it draws the same plate for both
 * and the artwork inside lands anywhere between 39% and 76% of it. Persisted on
 * the ProductImage as `artBox` so the card can re-fit every piece to one
 * optical weight. See packages/web/app/components/product/artFraming.ts.
 *
 * Reads the composited output rather than the geometry that produced it, so it
 * is equally correct for the assets already in the catalogue, which is what the
 * backfill needs.
 *
 * Returns undefined when the image is entirely mat, or when the art fills it
 * edge to edge — a full-bleed box is what "no framing" already means, and
 * storing it would only invite a scale of exactly 1 to be computed forever.
 */
export async function measureArtBox(
  squared: Buffer
): Promise<ImageArtBox | undefined> {
  let data: Buffer;
  let info: { width: number; height: number; channels: number };

  const source = await autoOriented(squared);

  try {
    const raw = await sharp(source)
      .resize(ART_SCAN, ART_SCAN, { kernel: "nearest", fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = raw.data;
    info = raw.info;
  } catch {
    // An unreadable asset must never fail an upload. No box, no framing.
    return undefined;
  }

  const { width, height, channels } = info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const isMat =
        Math.abs(data[i]! - MAT_COLOR.r) <= ART_MAT_TOLERANCE &&
        Math.abs(data[i + 1]! - MAT_COLOR.g) <= ART_MAT_TOLERANCE &&
        Math.abs(data[i + 2]! - MAT_COLOR.b) <= ART_MAT_TOLERANCE;
      if (isMat) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return undefined;

  /*
   * FULL-BLEED IMAGES LEAVE HERE, BEFORE THE SECOND PASS.
   *
   * A cropped photograph — every room mockup — has no mat, so the pass above
   * returns the whole canvas and "no framing" is the correct answer. The wall
   * trim below must never see one: it would happily shave a pale ceiling off
   * the top of an interior and hand the card a box, and the card would then
   * scale a room photograph as if it were a piece of art. Only a MATTED image
   * is a candidate, and a matted image is exactly one whose photo box is
   * smaller than its canvas.
   */
  const fullBleed =
    (right - left + 1) / width >= 0.999 && (bottom - top + 1) / height >= 0.999;
  if (fullBleed) return undefined;

  /*
   * SECOND PASS — the wall the mat scan cannot see.
   *
   * The pass above finds where the composited PHOTO sits, which is the right
   * answer whenever the photograph is of the canvas. Some of the catalogue is
   * not: cosmic-harmony and paper-layers are pieces shot hanging on a
   * near-white wall, and that wall is inside the photo, so it comes back as
   * part of the "artwork". Measured on cosmic-harmony the wall reads #F6F6F4
   * against a #FAFAFA mat — four levels apart, well inside any tolerance that
   * would not also eat real paint.
   *
   * Left alone it does two visible things. The card scales the wall instead of
   * the piece, so an identically-shaped neighbour renders at a different size
   * (the second blind A/B: "cards 3 and 4 are the same 0.52 portrait aspect yet
   * render 115px and 157px wide"); and the wall is brighter than the plate, so
   * a hard-edged rectangle sits inside that one tile.
   *
   * So: peel light, flat, edge-free lines off each side until one of them holds
   * a picture. Judged by DARKEST pixel, not by colour — a wall can be any light
   * tone and can carry a gradient, but it cannot contain a frame edge.
   * cosmic-harmony goes 1.04:1 -> 0.51:1, which is what it looks like.
   */
  const lums: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      row.push(luminance(data[i]!, data[i + 1]!, data[i + 2]!));
    }
    lums.push(row);
  }
  const rowSlice = (y: number, x0: number, x1: number): number[] =>
    lums[y]!.slice(x0, x1 + 1);
  const colSlice = (x: number, y0: number, y1: number): number[] => {
    const out: number[] = [];
    for (let y = y0; y <= y1; y++) out.push(lums[y]![x]!);
    return out;
  };

  while (top < bottom && isWallLine(rowSlice(top, left, right))) top++;
  while (bottom > top && isWallLine(rowSlice(bottom, left, right))) bottom--;
  while (left < right && isWallLine(colSlice(left, top, bottom))) left++;
  while (right > left && isWallLine(colSlice(right, top, bottom))) right--;

  const box: ImageArtBox = {
    x: left / width,
    y: top / height,
    w: (right - left + 1) / width,
    h: (bottom - top + 1) / height,
  };

  return box.w >= 0.999 && box.h >= 0.999 ? undefined : box;
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
  // The admin chose the window against the image as their browser DISPLAYED
  // it, so the rect is normalised against the oriented rectangle, not the
  // stored one. Measuring the stored one lands the window somewhere else.
  const source = await autoOriented(input);
  const meta = await sharp(source).metadata();
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

  return sharp(source)
    .extract({ left, top, width, height })
    .resize(MAT_CANVAS, MAT_CANVAS, { fit: "fill" })
    .webp({ quality: 88 })
    .toBuffer();
}
