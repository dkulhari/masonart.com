/**
 * Wall-plane arithmetic for the bare-wall pipeline.
 *
 * The room scene declares a rectangle on the wall in centimetres and where its
 * four corners land in the photo. Everything that hangs on that wall — frame,
 * side face, shadow — is a rectangle in the cm plane, and this module is how
 * those rectangles become pixel quads. Pure: no sharp, no filesystem, same
 * rule as geometry.ts and homography.ts.
 *
 * WHY CENTIMETRES AND NOT "WALL UNITS"
 *
 * A 50 × 70 cm poster has to look 50 × 70 next to a sofa. The scene's
 * `widthCm`/`heightCm` pin the scale once; after that a poster size from the
 * catalogue's ladder is a rectangle on the wall with no further judgement.
 * Every derived quantity — frame face width, side face strip, shadow offset —
 * is also a physical length, so it is stated in cm here and projected by the
 * same homography as the poster. Nothing is sized "in pixels" until the very
 * last step.
 */

import {
  applyHomography,
  solveHomography,
  type Matrix3,
  type Point,
  type Quad,
} from './homography';

/**
 * Which vertical edge of a hung frame is nearer the camera. `none` is the
 * straight-on case, where the side faces are edge-on and invisible.
 */
export type NearSide = 'left' | 'right' | 'none';

/** A rectangle in wall-plane centimetres; origin top-left of the wall rectangle, y down. */
export interface RectCm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SizeCm {
  widthCm: number;
  heightCm: number;
}

/** Homography from wall centimetres to photo pixels, from the measured wall quad. */
export function wallHomography(
  quad: Quad,
  widthCm: number,
  heightCm: number,
  canvasW: number,
  canvasH: number
): Matrix3 {
  const src: Quad = [
    { x: 0, y: 0 },
    { x: widthCm, y: 0 },
    { x: widthCm, y: heightCm },
    { x: 0, y: heightCm },
  ];
  const dst = quad.map((p) => ({ x: p.x * canvasW, y: p.y * canvasH })) as Quad;
  return solveHomography(src, dst);
}

/** The pixel quad of a wall-plane rectangle, wound tl → tr → br → bl. */
export function projectRectCm(h: Matrix3, rect: RectCm): Quad {
  return [
    applyHomography(h, { x: rect.x, y: rect.y }),
    applyHomography(h, { x: rect.x + rect.w, y: rect.y }),
    applyHomography(h, { x: rect.x + rect.w, y: rect.y + rect.h }),
    applyHomography(h, { x: rect.x, y: rect.y + rect.h }),
  ];
}

export function normaliseQuad(quadPx: Quad, canvasW: number, canvasH: number): Quad {
  return quadPx.map((p) => ({ x: p.x / canvasW, y: p.y / canvasH })) as Quad;
}

export function centredRectCm(centre: Point, size: SizeCm): RectCm {
  return {
    x: centre.x - size.widthCm / 2,
    y: centre.y - size.heightCm / 2,
    w: size.widthCm,
    h: size.heightCm,
  };
}

export function translateRect(rect: RectCm, dx: number, dy: number): RectCm {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/**
 * Shrink the poster UNIFORMLY until poster + frame face fits the allowable
 * box. Per-axis clamping would change the aspect and show the customer a
 * different shape from the one they buy; uniform scaling never can. Never
 * scales up: a small print is a small print.
 */
export function fitPosterCm(
  poster: SizeCm,
  faceCm: number,
  allowable: { maxWidthCm: number; maxHeightCm: number }
): { poster: SizeCm; outer: SizeCm; scale: number } {
  const scale = Math.min(
    1,
    (allowable.maxWidthCm - 2 * faceCm) / poster.widthCm,
    (allowable.maxHeightCm - 2 * faceCm) / poster.heightCm
  );
  const fitted = { widthCm: poster.widthCm * scale, heightCm: poster.heightCm * scale };

  return {
    poster: fitted,
    outer: { widthCm: fitted.widthCm + 2 * faceCm, heightCm: fitted.heightCm + 2 * faceCm },
    scale,
  };
}

/**
 * The scene loader already proves that anchor ± the allowable maximum stays
 * inside the margin, so this can only fire if a caller bypasses `fitPosterCm`.
 * It stays as a guard because the failure it prevents — a frame overlapping
 * the skirting board — is a wrong picture that looks like a photograph.
 */
export function assertRectWithinMargin(
  rect: RectCm,
  wall: SizeCm,
  marginCm: number,
  sceneId: string
): void {
  const ok =
    rect.x >= marginCm &&
    rect.y >= marginCm &&
    rect.x + rect.w <= wall.widthCm - marginCm &&
    rect.y + rect.h <= wall.heightCm - marginCm;

  if (!ok) {
    throw new Error(
      `Room scene "${sceneId}": the poster (${rect.w.toFixed(1)}×${rect.h.toFixed(1)} cm at ` +
        `${rect.x.toFixed(1)},${rect.y.toFixed(1)}) crosses the ${marginCm} cm margin of the wall rectangle.`
    );
  }
}

/**
 * The visible side face, first order: a strip d·sin|yaw| wide lying on the
 * wall plane just outside the near vertical edge.
 *
 * The true side face is a plane perpendicular to the wall and its projection
 * depends on camera intrinsics the scene does not record. At 3 cm depth and
 * 25° the strip is a few pixels wide and the difference is invisible. Null
 * straight-on, where the side is edge-on.
 */
export function sideFaceRectCm(
  outer: RectCm,
  depthCm: number,
  yawDeg: number,
  nearSide: NearSide
): RectCm | null {
  if (nearSide === 'none' || depthCm <= 0) return null;

  const w = depthCm * Math.sin(Math.abs((yawDeg * Math.PI) / 180));
  if (w <= 0) return null;

  return nearSide === 'left'
    ? { x: outer.x - w, y: outer.y, w, h: outer.h }
    : { x: outer.x + outer.w, y: outer.y, w, h: outer.h };
}

/**
 * Where a shadow lands, in cm. Horizontal: away from the light, a fixed
 * fraction of depth — the light comes from the side, so the frame's depth
 * is what throws it sideways. Vertical: d·tan(elevation) — a higher light
 * throws the shadow further down the wall. Contact is the same direction at
 * a small fraction, hugging the frame's edge.
 */
export function shadowOffsetCm(
  depthCm: number,
  light: { direction: 'left' | 'right'; elevationDeg: number },
  kind: 'cast' | 'contact'
): { dx: number; dy: number } {
  const away = light.direction === 'left' ? 1 : -1;
  const tan = Math.tan((light.elevationDeg * Math.PI) / 180);
  const k = kind === 'cast' ? 1 : 0.15;

  return { dx: away * depthCm * 0.9 * k, dy: depthCm * tan * k };
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** The longer of a projected rect's two horizontal edges, in pixels. */
export function projectedWidthPx(h: Matrix3, rect: RectCm): number {
  const q = projectRectCm(h, rect);
  return Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
}

/** Local pixels-per-cm at a wall point: mean of a 1 cm probe in x and in y. */
export function pxPerCmAt(h: Matrix3, at: Point): number {
  const o = applyHomography(h, at);
  const px = applyHomography(h, { x: at.x + 1, y: at.y });
  const py = applyHomography(h, { x: at.x, y: at.y + 1 });
  return (dist(o, px) + dist(o, py)) / 2;
}

/**
 * Whether a projected quad is a screen-aligned rectangle — the case a plain
 * resize handles better than a bilinear warp, and the only case in which the
 * cheap `fitIntoBox` path is exact.
 */
export function isAxisAligned(quadPx: Quad, tolPx = 0.5): boolean {
  return (
    Math.abs(quadPx[0].y - quadPx[1].y) <= tolPx &&
    Math.abs(quadPx[3].y - quadPx[2].y) <= tolPx &&
    Math.abs(quadPx[0].x - quadPx[3].x) <= tolPx &&
    Math.abs(quadPx[1].x - quadPx[2].x) <= tolPx
  );
}
