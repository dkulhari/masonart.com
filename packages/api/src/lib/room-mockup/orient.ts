/**
 * EXIF orientation, corrected only when there is something to correct, and
 * losslessly when there is.
 *
 * `sharp(x).autoOrient().toBuffer()` with no format call re-encodes JPEG/WebP
 * input at sharp's own default quality — unconditionally, even for the
 * overwhelming majority of images that carry no orientation tag and need no
 * rotation at all. That silent re-encode happens before the pipeline's one
 * deliberate lossy step (`.jpeg({ quality: 92 })` at the very end of the
 * render), so the quality it throws away can never be recovered downstream —
 * and EXIF/ICC/density metadata goes with it.
 *
 * So: read the metadata first. No `orientation` tag, or `orientation: 1`
 * ("already displayed correctly"), means nothing to correct — the input is
 * returned unchanged, with no sharp round trip at all. An orientation that
 * genuinely needs correcting is materialised as PNG, not re-encoded to a
 * lossy format at an unspecified quality.
 *
 * Its own module because both the flat panel (panel.ts) and the renderer
 * (render.ts) need it, and neither should import the other.
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';

export async function orientBuffer(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  if (meta.orientation === undefined || meta.orientation === 1) return input;
  return sharp(input).autoOrient().png().toBuffer();
}

/**
 * Same correction as `orientBuffer`, for a file on disk. When no correction
 * is needed the file's own bytes are read back unchanged (`readFileSync`)
 * rather than round-tripped through sharp, for the same reason: no sharp call
 * at all means no chance of an accidental re-encode.
 */
export async function orientFile(path: string): Promise<Buffer> {
  const meta = await sharp(path).metadata();
  if (meta.orientation === undefined || meta.orientation === 1) return readFileSync(path);
  return sharp(path).autoOrient().png().toBuffer();
}
