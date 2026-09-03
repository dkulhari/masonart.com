/**
 * Four-point perspective mapping for room mockups.
 *
 * Pure arithmetic, deliberately free of sharp and of the filesystem — same
 * rule as geometry.ts, and for the same reason: the transform that decides
 * whether an angled mockup looks real has to be provable by a unit test
 * rather than by squinting at a JPEG.
 *
 * WHY A HOMOGRAPHY AND NOT A GENERATED IMAGE
 *
 * A flat poster on a flat wall, photographed from any angle, is a planar
 * projective transform of the poster. That is exact: the artwork is
 * RESAMPLED, never reinvented. Every commercial mockup PSD solves side
 * shots this way — a Smart Object is a perspective transform — and no
 * diffusion model can match it, because a diffusion model redraws the art
 * and the customer is buying the art.
 *
 * `fitIntoBox` in geometry.ts stays the right tool for a straight-on wall:
 * four numbers, no perspective, cheaper to author and impossible to get
 * subtly wrong. This module is the angled case, where four numbers cannot
 * describe the target at all.
 */

/** A point normalised 0..1 against an image's own dimensions. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The four corners of a placement region, normalised 0..1, in the order
 * top-left, top-right, bottom-right, bottom-left.
 *
 * The order is load-bearing, not a convention: it fixes which corner of the
 * artwork lands where. A quad wound the other way mirrors the poster, and a
 * mirrored poster is a wrong product picture that still looks like a
 * plausible photograph — exactly the failure this module has to make
 * impossible. `assertUsableQuad` rejects the windings that would do it.
 */
export type Quad = [Point, Point, Point, Point];

/**
 * A 3x3 matrix in row-major order.
 *
 * Nine numbers rather than a nested array: the solver writes them out
 * explicitly anyway, and a flat tuple cannot be indexed wrongly by one
 * level of nesting.
 */
export type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/**
 * Below this, a pivot is treated as zero and the system as unsolvable.
 *
 * Sized for NORMALISED coordinates. A real aperture quad occupies a few
 * percent of the image at minimum, so its cross products land around 1e-2;
 * 1e-9 is far below anything legitimate and far above float noise.
 */
const EPSILON = 1e-9;

/**
 * Solve the 8x8 system by Gaussian elimination with partial pivoting.
 *
 * Partial pivoting is not optional here. The unpivoted version divides by
 * whatever happens to sit on the diagonal, and for a quad whose first corner
 * is at the origin that entry is exactly zero — the most ordinary input
 * imaginable would produce NaN and a silently blank mockup.
 *
 * Mutates `a` and `b`; both are built fresh per call by `solveHomography`.
 */
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }

    if (Math.abs(a[pivot]![col]!) < EPSILON) {
      throw new Error(
        'Placement quad is degenerate: its corners do not define a perspective transform.'
      );
    }

    if (pivot !== col) {
      const tmpRow = a[pivot]!;
      a[pivot] = a[col]!;
      a[col] = tmpRow;
      const tmpVal = b[pivot]!;
      b[pivot] = b[col]!;
      b[col] = tmpVal;
    }

    const p = a[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = a[row]![col]! / p;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) a[row]![c] = a[row]![c]! - factor * a[col]![c]!;
      b[row] = b[row]! - factor * b[col]!;
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]!;
    for (let j = i + 1; j < n; j++) sum -= a[i]![j]! * x[j]!;
    x[i] = sum / a[i]![i]!;
  }
  return x;
}

/**
 * Build the matrix that maps each `src` corner onto the matching `dst`
 * corner.
 *
 * Eight unknowns, because a homography is defined only up to scale: h8 is
 * pinned to 1 and the remaining eight are solved exactly from the four
 * point pairs. Each pair contributes two rows.
 */
export function solveHomography(src: Quad, dst: Quad): Matrix3 {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const s = src[i]!;
    const d = dst[i]!;

    a.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);

    a.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }

  const h = solveLinearSystem(a, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1] as const;
}

/**
 * Push one point through the matrix.
 *
 * The divide by w is what makes this projective rather than affine — it is
 * the whole reason a rectangle can come out as a trapezoid. A w at zero
 * means the point maps to the horizon, which no pixel inside a real
 * aperture ever does, so it is a bug rather than an edge case.
 */
export function applyHomography(m: Matrix3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];

  if (Math.abs(w) < EPSILON) {
    throw new Error('Perspective transform sent a point to infinity; the quad is unusable.');
  }

  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

/** Z component of the cross product of BA and CB — sign gives the turn direction. */
function turn(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/**
 * Reject a quad the renderer cannot use, naming the template.
 *
 * Three things are checked, and all three produce an image rather than an
 * error if they are left unchecked — which is the expensive failure. A
 * mockup that renders wrong ships; a mockup that refuses to render does not.
 *
 *   collinear / zero-area — the solver divides by ~0 and yields NaN, which
 *                           sharp composites as a blank region.
 *   self-intersecting     — a bowtie folds the artwork back over itself.
 *   clockwise winding     — mirrors the poster. See the Quad doc comment:
 *                           this is the one that looks completely fine.
 *
 * Image coordinates put y downward, so a correctly wound top-left → top-right
 * → bottom-right → bottom-left quad turns consistently POSITIVE here.
 */
export function assertUsableQuad(quad: Quad, templateId: string): void {
  for (const [i, p] of quad.entries()) {
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
      throw new Error(
        `Room template "${templateId}" corner ${i} is outside the image: (${p.x}, ${p.y}).`
      );
    }
  }

  const turns = [
    turn(quad[0], quad[1], quad[2]),
    turn(quad[1], quad[2], quad[3]),
    turn(quad[2], quad[3], quad[0]),
    turn(quad[3], quad[0], quad[1]),
  ];

  if (turns.some((t) => Math.abs(t) < EPSILON)) {
    throw new Error(
      `Room template "${templateId}" has a degenerate placement quad: three corners are collinear.`
    );
  }

  if (turns.some((t) => t < 0)) {
    if (turns.every((t) => t < 0)) {
      throw new Error(
        `Room template "${templateId}" has a clockwise placement quad, which would mirror the artwork. ` +
          'List the corners as top-left, top-right, bottom-right, bottom-left.'
      );
    }
    throw new Error(
      `Room template "${templateId}" has a self-intersecting placement quad.`
    );
  }
}

/**
 * The pixel bounding box of a quad, clamped to the canvas.
 *
 * The warp iterates destination pixels and samples backwards, so it only
 * ever needs to visit this box — not the whole room photo. An aperture is a
 * small part of a 2048px image, so this is the difference between scanning
 * ~4M pixels and ~200k.
 *
 * Bounds are inclusive-exclusive (`right`/`bottom` are one past the last
 * pixel) to match how a `for` loop and sharp's extract both count.
 *
 * The far edges are `floor(max) + 1`, NOT `ceil(max)`. Pixel i covers the
 * half-open span [i, i+1), so a quad edge landing exactly on 501.0 sits in
 * pixel 501 and the exclusive bound has to be 502. `ceil` returns 501 there
 * and clips the last column off the artwork. Exact integers are not a rare
 * case to wave away either — they are what normalised coordinates produce
 * whenever the corner is a round fraction of the canvas, e.g. x = 0.5 on a
 * 1000px room photo.
 */
export function quadPixelBounds(
  quad: Quad,
  canvasW: number,
  canvasH: number
): { left: number; top: number; right: number; bottom: number } {
  const xs = quad.map((p) => p.x * canvasW);
  const ys = quad.map((p) => p.y * canvasH);

  return {
    left: Math.max(0, Math.floor(Math.min(...xs))),
    top: Math.max(0, Math.floor(Math.min(...ys))),
    right: Math.min(canvasW, Math.floor(Math.max(...xs)) + 1),
    bottom: Math.min(canvasH, Math.floor(Math.max(...ys)) + 1),
  };
}
