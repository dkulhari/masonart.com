/**
 * Room mockup rendering.
 *
 * Composites framed artwork into a straight-on room photograph at the
 * template's declared rectangle, under a two-layer shadow.
 *
 * Straight-on only, deliberately. An angled wall would need a four-point
 * perspective warp; sharp offers affine() but no homography, so perspective is
 * a different design rather than an extension of this one.
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fitIntoBox, shadowParams, type Placed, type ShadowSpec } from './geometry';
import type { FrameRender, RoomTemplate } from './templates';

/**
 * Correct EXIF orientation, but only when there is something to correct, and
 * losslessly when there is.
 *
 * `sharp(x).autoOrient().toBuffer()` with no format call re-encodes JPEG/WebP
 * input at sharp's own default quality — unconditionally, even for the
 * overwhelming majority of images that carry no orientation tag and need no
 * rotation at all. That silent re-encode happens before the pipeline's one
 * deliberate lossy step (`.jpeg({ quality: 92 })` at the very end of
 * `renderRoomMockup`), so the quality it throws away can never be recovered
 * downstream — and EXIF/ICC/density metadata goes with it. It also
 * contradicts this module's own "never clamp, default, or skip quietly"
 * philosophy by introducing exactly such a silent default.
 *
 * So: read the metadata first. No `orientation` tag, or `orientation: 1`
 * ("already displayed correctly"), means nothing to correct — the input is
 * returned unchanged, with no sharp round trip at all. An orientation that
 * genuinely needs correcting is materialised as PNG, not re-encoded to a
 * lossy format at an unspecified quality — the pipeline's only deliberate
 * lossy encode stays the only one.
 */
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

/**
 * Wrap artwork in a frame face, with a thin dark bevel hairline between the
 * two. The bevel is not decoration: without it the face reads as a flat colour
 * band pasted round the art rather than as a moulding with an inner edge.
 *
 * Auto-orients first: `sharp(x).metadata()` reports the INPUT's stored
 * dimensions, EXIF tag and all, so a phone photo shot in portrait but stored
 * with an orientation tag (landscape pixels + "rotate me") would size the
 * frame face off the wrong short edge if read before rotation. Materialising
 * the oriented buffer once, up front, means every metadata read and every
 * extend() below sees the pixels as they will actually display — see
 * `orientBuffer` above for why that materialisation is conditional.
 */
export async function frameArtwork(art: Buffer, frame: FrameRender): Promise<Buffer> {
  const oriented = await orientBuffer(art);

  if (frame.widthRatio === 0) return oriented;

  const meta = await sharp(oriented).metadata();
  const shortEdge = Math.min(meta.width ?? 0, meta.height ?? 0);

  // Sized off the SHORT edge so a panoramic poster is not swallowed by a frame
  // proportioned to its length.
  const face = Math.max(2, Math.round(shortEdge * frame.widthRatio));
  const bevel = Math.max(1, Math.round(face * 0.12));

  const [r, g, b] = frame.color;

  const withBevel = await sharp(oriented)
    .extend({
      top: bevel,
      bottom: bevel,
      left: bevel,
      right: bevel,
      background: { r: 0, g: 0, b: 0, alpha: 0.35 },
    })
    .png()
    .toBuffer();

  return sharp(withBevel)
    .extend({ top: face, bottom: face, left: face, right: face, background: { r, g, b, alpha: 1 } })
    .png()
    .toBuffer();
}

/**
 * One blurred, offset, semi-transparent black layer the size of the room.
 *
 * Two sharp constraints shape this, both found the hard way:
 *
 *   1. sharp({create}) only makes 3- or 4-channel images, so the mask cannot be
 *      built as a single greyscale channel directly. It is built in RGB and
 *      squeezed down with toColourspace('b-w').
 *   2. Opacity is applied with linear() on the mask BEFORE it becomes an alpha
 *      channel, because sharp has no "composite this layer at 40%" operation.
 */
export async function shadowLayer(
  canvasW: number,
  canvasH: number,
  rect: Placed,
  shadow: ShadowSpec
): Promise<Buffer> {
  const block = await sharp({
    create: {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  const mask = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      {
        input: block,
        left: Math.round(rect.left + shadow.offsetX),
        top: Math.round(rect.top + shadow.offsetY),
      },
    ])
    .blur(shadow.blurSigma)
    .linear(shadow.opacity, 0)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .joinChannel(mask, { raw: { width: canvasW, height: canvasH, channels: 1 } })
    .png()
    .toBuffer();
}

/**
 * Frame the artwork, fit it into the template's rectangle, and composite it
 * over the room under its two shadows.
 */
export async function renderRoomMockup(
  art: Buffer,
  roomPath: string,
  template: RoomTemplate,
  frame: FrameRender
): Promise<Buffer> {
  const framed = await frameArtwork(art, frame);
  const fmeta = await sharp(framed).metadata();

  // Auto-orient the room photo the same way, and for the same reason: an
  // operator measures the placement rectangle against the DISPLAYED image
  // (a phone shoots portrait but stores it rotated with an EXIF tag), while
  // a plain metadata() read reports the stored, unrotated dimensions. Doing
  // this later in the chain would not help — sharp(roomPath).metadata() has
  // already reported the wrong numbers by then — so the oriented buffer is
  // materialised here and used for every dimension read and for the
  // composite base below. Conditional and lossless for the same reason as
  // `orientFile` above.
  const roomBuf = await orientFile(roomPath);
  const rmeta = await sharp(roomBuf).metadata();
  const canvasW = rmeta.width ?? 0;
  const canvasH = rmeta.height ?? 0;

  const placed = fitIntoBox(
    fmeta.width ?? 1,
    fmeta.height ?? 1,
    template.placement,
    canvasW,
    canvasH
  );

  const resized = await sharp(framed).resize(placed.width, placed.height).png().toBuffer();

  const { contact, ambient } = shadowParams(
    Math.min(placed.width, placed.height),
    frame.depthRatio,
    template.light
  );

  // Ambient first, contact over it, art on top: the wide faint layer must sit
  // UNDER the tight dark one or the contact edge is washed out.
  return sharp(roomBuf)
    .composite([
      { input: await shadowLayer(canvasW, canvasH, placed, ambient), blend: 'over' },
      { input: await shadowLayer(canvasW, canvasH, placed, contact), blend: 'over' },
      { input: resized, left: placed.left, top: placed.top, blend: 'over' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
