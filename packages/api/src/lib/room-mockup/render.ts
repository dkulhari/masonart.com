/**
 * Room mockup rendering.
 *
 * Composites a framed poster into a bare-wall room scene at a physical size
 * on a measured wall, then makes it belong to the photograph: the wall's own
 * light, an extruded side face, a cast shadow, a contact shadow, and the
 * room's grain. Stages 3–5 of docs/ROOM-MOCKUP-PIPELINE.md, in order.
 *
 * Two placement paths share everything else:
 *
 *   Quad — an angled wall. The flat panel is projected through the wall's
 *          homography by `warpPanelIntoQuad`.
 *   Box  — a straight-on wall, where the projection is a screen-aligned
 *          rectangle. `fitIntoBox` and a plain resize are exact there and
 *          resample better than a bilinear warp, so they are kept.
 *
 * Nothing here touches the artwork's pixels except by uniform tone, and the
 * only stochastic step (grain) is seeded, so a re-render is byte-identical.
 */

import sharp from 'sharp';
import { fitIntoBox } from './geometry';
import { assertUsableQuad, quadPixelBounds, type Quad } from './homography';
import {
  addGrain,
  applyLuminance,
  quadMask,
  readRaw,
  seedFromKey,
  shadowLayer,
  unionBounds,
  wallGrainAmplitude,
  wallLuminanceField,
  type Bounds,
} from './lighting';
import { orientBuffer, orientFile } from './orient';
import { buildFramedPanel } from './panel';
import type { RoomScene } from './scene';
import { posterSizeToFill } from './sizing';
import type { FrameRender } from './templates';
import { panelSizeForQuad, warpPanelIntoQuad } from './warp';
import {
  assertRectWithinMargin,
  centredRectCm,
  fitPosterCm,
  isAxisAligned,
  normaliseQuad,
  panelPixelsForRect,
  projectRectCm,
  pxPerCmAt,
  shadowOffsetCm,
  sideFaceRectCm,
  translateRect,
  wallHomography,
  type RectCm,
  type SizeCm,
} from './wall';

export { orientBuffer, orientFile } from './orient';

/**
 * Wrap artwork in a frame face, with a thin dark bevel hairline between the
 * two. The bevel is not decoration: without it the face reads as a flat colour
 * band pasted round the art rather than as a moulding with an inner edge.
 *
 * This is the framed MAIN image path (outputs.ts), sized off the art's short
 * edge because there is no wall to give it a physical scale. The room path
 * draws its own face in centimetres in panel.ts.
 *
 * Auto-orients first: `sharp(x).metadata()` reports the INPUT's stored
 * dimensions, EXIF tag and all, so a phone photo shot in portrait but stored
 * with an orientation tag (landscape pixels + "rotate me") would size the
 * frame face off the wrong short edge if read before rotation.
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

export interface SceneRenderOptions {
  /**
   * Physical poster size. Defaults to the largest rectangle of the art's own
   * aspect that fits the scene's allowable box: the room shot is a
   * representative image, so the poster fills the wall and the mat is even.
   */
  posterCm?: SizeCm;
  /** Seeds the grain, together with the scene id. Use the product slug or SKU. */
  seedKey: string;
}

const CAST_OPACITY = 0.42;
const CONTACT_OPACITY = 0.5;
const CONTACT_BLUR_PX = 1.5;
/** Side face shade: facing the light, or away from it. */
const SIDE_LIT = 1.06;
const SIDE_SHADED = 0.75;

const RAW_RGBA = (W: number, H: number) => ({ raw: { width: W, height: H, channels: 4 as const } });

/**
 * The Box path: the panel resized into the axis-aligned box the quad
 * describes, returned as a full-canvas RGBA layer so the stages after it
 * cannot tell which path produced it.
 */
async function placeFlat(
  panel: Buffer,
  panelW: number,
  panelH: number,
  quadN: Quad,
  W: number,
  H: number
): Promise<Buffer> {
  const b = quadPixelBounds(quadN, W, H);
  const placed = fitIntoBox(
    panelW,
    panelH,
    { x: b.left / W, y: b.top / H, w: (b.right - b.left) / W, h: (b.bottom - b.top) / H },
    W,
    H
  );
  const resized = await sharp(panel).resize(placed.width, placed.height).png().toBuffer();

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left: placed.left, top: placed.top }])
    .raw()
    .toBuffer();
}

/** A solid colour warped into a quad: the side face. */
async function solidLayer(
  color: [number, number, number],
  quadN: Quad,
  W: number,
  H: number
): Promise<Buffer> {
  const [r, g, b] = color;
  const swatch = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();

  return warpPanelIntoQuad(swatch, 2, 2, quadN, W, H);
}

const scaled = (c: [number, number, number], f: number): [number, number, number] => [
  Math.min(255, Math.round(c[0] * f)),
  Math.min(255, Math.round(c[1] * f)),
  Math.min(255, Math.round(c[2] * f)),
];

export async function renderSceneMockup(
  art: Buffer,
  roomPath: string,
  scene: RoomScene,
  frame: FrameRender,
  options: SceneRenderOptions
): Promise<Buffer> {
  const oriented = await orientBuffer(art);
  const ameta = await sharp(oriented).metadata();
  const requested =
    options.posterCm ??
    posterSizeToFill(ameta.width ?? 1, ameta.height ?? 1, frame.widthCm, scene.allowable);

  // Orient the room the same way, for the same reason as the art: the quad
  // was measured against the DISPLAYED image, and a plain metadata() read
  // reports the stored, unrotated dimensions.
  const roomBuf = await orientFile(roomPath);
  const rmeta = await sharp(roomBuf).metadata();
  const W = rmeta.width ?? 0;
  const H = rmeta.height ?? 0;

  if (W !== scene.imageSize[0] || H !== scene.imageSize[1]) {
    throw new Error(
      `Room scene "${scene.id}" declares imageSize ${scene.imageSize.join('×')} but ${scene.image} is ${W}×${H}; the quad was measured on a different image.`
    );
  }

  // Wall plane → pixels, and the poster's rectangle on that plane.
  const wall = { widthCm: scene.wall.widthCm, heightCm: scene.wall.heightCm };
  const h = wallHomography(scene.wall.quad, wall.widthCm, wall.heightCm, W, H);
  const { poster, outer } = fitPosterCm(requested, frame.widthCm, scene.allowable);
  const centre = { x: scene.anchor.x * wall.widthCm, y: scene.anchor.y * wall.heightCm };
  const rect = centredRectCm(centre, outer);
  assertRectWithinMargin(rect, wall, scene.allowable.minMarginCm, scene.id);

  const frontPx = projectRectCm(h, rect);
  const frontN = normaliseQuad(frontPx, W, H);
  assertUsableQuad(frontN, scene.id);

  // Stage 3: the flat panel, in the outer rectangle's cm aspect and at
  // least 2× its projected extent so the warp downsamples.
  const px = panelPixelsForRect(panelSizeForQuad(frontN, W, H), outer);
  const panel = await buildFramedPanel(oriented, poster, frame, px.width, px.height, scene.light);

  // Stage 4a: the front face. Box path when the projection is a rectangle.
  const front = isAxisAligned(frontPx)
    ? await placeFlat(panel.png, panel.width, panel.height, frontN, W, H)
    : await warpPanelIntoQuad(panel.png, panel.width, panel.height, frontN, W, H);

  // Stage 4b: the side face, extruded on the near side. Nothing straight-on.
  const sideRect = sideFaceRectCm(rect, frame.depthCm, scene.view.yawDeg, scene.view.nearSide);
  let side: Buffer | null = null;
  let sideN: Quad | null = null;

  if (sideRect) {
    sideN = normaliseQuad(projectRectCm(h, sideRect), W, H);
    assertUsableQuad(sideN, scene.id);
    const lit = scene.view.nearSide === scene.light.direction;
    side = await solidLayer(scaled(frame.color, lit ? SIDE_LIT : SIDE_SHADED), sideN, W, H);
  }

  // Stage 5.1: inherit the wall's own light, sampled before anything lands on it.
  const room = await readRaw(roomBuf, 3);
  const bounds: Bounds = unionBounds(
    quadPixelBounds(frontN, W, H),
    sideN ? quadPixelBounds(sideN, W, H) : null
  );
  const field = await wallLuminanceField(
    room,
    bounds,
    Math.max(2, (bounds.right - bounds.left) * 0.02)
  );
  applyLuminance(front, W, H, field, bounds, scene.light.strength);
  if (side) applyLuminance(side, W, H, field, bounds, scene.light.strength);

  // Stages 5.3 and 5.4: cast and contact shadows. The frame's footprint —
  // front and side — is offset in wall cm, then projected, so the shadow
  // foreshortens with the wall like everything else does.
  const pxPerCm = pxPerCmAt(h, centre);
  const shadowFor = async (kind: 'cast' | 'contact'): Promise<Buffer> => {
    const { dx, dy } = shadowOffsetCm(frame.depthCm, scene.light, kind);
    const rects: RectCm[] = [translateRect(rect, dx, dy)];
    if (sideRect) rects.push(translateRect(sideRect, dx, dy));

    const mask = await quadMask(
      rects.map((r) => normaliseQuad(projectRectCm(h, r), W, H)),
      W,
      H
    );
    const blur =
      kind === 'cast'
        ? Math.max(1, scene.light.softness * frame.depthCm * pxPerCm)
        : CONTACT_BLUR_PX;

    return shadowLayer(mask, W, H, blur, kind === 'cast' ? CAST_OPACITY : CONTACT_OPACITY);
  };
  const cast = await shadowFor('cast');
  const contact = await shadowFor('contact');

  // Stage 5.6: match the room's grain over the panel, seeded per product and scene.
  addGrain(
    front,
    W,
    H,
    wallGrainAmplitude(room, bounds),
    seedFromKey(`${options.seedKey}:${scene.id}`)
  );

  // Shadows first so the frame occludes its own shadow; side under front.
  const layers: sharp.OverlayOptions[] = [
    { input: cast, blend: 'over' },
    { input: contact, blend: 'over' },
  ];
  if (side) layers.push({ input: side, ...RAW_RGBA(W, H), blend: 'over' });
  layers.push({ input: front, ...RAW_RGBA(W, H), blend: 'over' });

  return sharp(roomBuf).composite(layers).jpeg({ quality: 92 }).toBuffer();
}
