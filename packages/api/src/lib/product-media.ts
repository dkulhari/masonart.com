/**
 * Product Media Orchestrator
 *
 * Turns one uploaded file into one ProductImage satisfying the square contract
 * (width === height === MAT_CANVAS), which is what lets the storefront grid drop
 * all aspect-ratio logic.
 *
 * Deliberately NOT folded into processImage(): that function also serves avatars
 * and AI generations, where forcing a square would be wrong. This sits beside it
 * and is called only from the product upload path.
 *
 * Runs inline — one image per request at roughly 400ms. No queue.
 */

import { randomUUID } from "node:crypto";
import {
  MAT_CANVAS,
  type ImageCrop,
  type ProductImage,
  type ProductImageType,
} from "@chobii/shared";
import { matToSquare, cropToSquare, measureArtBox } from "./image-processing";
import { uploadOptimizedImage, uploadFile, StoragePaths } from "./storage";

/** Where untouched sources live, so a crop can be revised later. */
export const ORIGINALS_PREFIX = `${StoragePaths.PRODUCTS}originals/`;

export interface BuildProductMediaInput {
  type: ProductImageType;
  altText: string;
  /** Ignored for type 'main', which is matted and never cropped. */
  crop?: ImageCrop;
  sortOrder?: number;
}

/** Mirrors storage.generateFileKey, which is module-private. */
function originalKeyFor(filename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safe = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${ORIGINALS_PREFIX}${timestamp}-${random}-${safe}`;
}

/**
 * Square an upload, run it through the existing variant pipeline, and retain
 * the untouched source.
 *
 * Artwork is matted (contained at 88%, never cropped); photographs fill the
 * square using the window a human chose. The rule is "never crop blindly".
 */
export async function buildProductMedia(
  input: Buffer,
  filename: string,
  contentType: string,
  opts: BuildProductMediaInput
): Promise<ProductImage> {
  const isArtwork = opts.type === "main";

  // 1. Square it. This is the invariant the whole grid rests on.
  const squared = isArtwork
    ? await matToSquare(input)
    : await cropToSquare(input, opts.crop);

  // 2. Measure where the art landed on the mat. Only artwork is matted; a
  //    cropped photograph fills its square, so there is nothing to measure and
  //    nothing for the card to re-frame.
  const artBox = isArtwork ? await measureArtBox(squared) : undefined;

  // 3. Existing variant ladder + upload, unchanged.
  const uploaded = await uploadOptimizedImage(
    squared,
    `${filename.replace(/\.[^.]+$/, "")}.webp`,
    "image/webp",
    { prefix: StoragePaths.PRODUCTS }
  );

  // 4. Retain the untouched source. Load-bearing rather than insurance:
  //    re-cropping and re-matting both need the original back.
  const original = await uploadFile(input, originalKeyFor(filename), {
    contentType,
  });

  return {
    id: randomUUID(),
    url: uploaded.url,
    altText: opts.altText,
    type: opts.type,
    sortOrder: opts.sortOrder ?? 0,
    width: MAT_CANVAS,
    height: MAT_CANVAS,
    variants: uploaded.variants?.map((v) => ({
      name: v.name,
      width: v.width,
      url: v.url,
    })),
    // Artwork is never cropped, so a crop would be meaningless on a main image.
    ...(isArtwork || !opts.crop ? {} : { crop: opts.crop }),
    ...(artBox ? { artBox } : {}),
    originalKey: original.key,
  };
}
