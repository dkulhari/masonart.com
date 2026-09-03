/**
 * Wall-plane arithmetic.
 *
 * The room scene is measured in centimetres on the wall and in normalised
 * pixels in the photo. Everything that hangs on the wall is a rectangle in
 * cm, and these functions are how it becomes a pixel quad. They are pure, so
 * the transform that decides where a poster lands is provable without a
 * single pixel being rendered.
 */

import { describe, it, expect } from 'vitest';
import { applyHomography, type Quad } from '../../../src/lib/room-mockup/homography';
import {
  assertRectWithinMargin,
  centredRectCm,
  fitPosterCm,
  panelPixelsForRect,
  isAxisAligned,
  normaliseQuad,
  projectRectCm,
  projectedWidthPx,
  pxPerCmAt,
  shadowOffsetCm,
  sideFaceRectCm,
  translateRect,
  wallHomography,
} from '../../../src/lib/room-mockup/wall';

/** A wall seen from the left: left edge taller than right. */
const ANGLED: Quad = [
  { x: 0.15, y: 0.1 },
  { x: 0.8, y: 0.16 },
  { x: 0.8, y: 0.72 },
  { x: 0.15, y: 0.82 },
];

/** Straight-on: an axis-aligned rectangle. */
const STRAIGHT: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.7 },
  { x: 0.2, y: 0.7 },
];

const W = 320;
const H = 260;
const CW = 1000;
const CH = 800;

const near = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('wallHomography', () => {
  it('sends the wall rectangle corners in cm onto the quad in pixels', () => {
    const h = wallHomography(ANGLED, W, H, CW, CH);
    const corners = [
      [{ x: 0, y: 0 }, ANGLED[0]],
      [{ x: W, y: 0 }, ANGLED[1]],
      [{ x: W, y: H }, ANGLED[2]],
      [{ x: 0, y: H }, ANGLED[3]],
    ] as const;

    for (const [cm, q] of corners) {
      const p = applyHomography(h, cm);
      near(p.x, q.x * CW);
      near(p.y, q.y * CH);
    }
  });
});

describe('projectRectCm', () => {
  it('projects a straight-on rect to an axis-aligned pixel rect at the right scale', () => {
    const h = wallHomography(STRAIGHT, W, H, CW, CH);
    // The wall is 600px wide for 320cm: 1.875 px/cm. A 160cm rect is 300px.
    const q = projectRectCm(h, { x: 80, y: 65, w: 160, h: 130 });

    near(q[0].x, 200 + 80 * 1.875);
    near(q[1].x - q[0].x, 300);
    near(q[3].y - q[0].y, 130 * (480 / 260));
    expect(isAxisAligned(q)).toBe(true);
  });

  it('keeps tl→tr→br→bl winding on an angled wall', () => {
    const h = wallHomography(ANGLED, W, H, CW, CH);
    const q = projectRectCm(h, { x: 100, y: 60, w: 100, h: 120 });

    expect(q[1].x).toBeGreaterThan(q[0].x);
    expect(q[2].y).toBeGreaterThan(q[1].y);
    expect(q[3].x).toBeLessThan(q[2].x);
    expect(isAxisAligned(q)).toBe(false);
  });
});

describe('normaliseQuad', () => {
  it('divides by the canvas', () => {
    const q = normaliseQuad(
      [
        { x: 100, y: 80 },
        { x: 900, y: 80 },
        { x: 900, y: 720 },
        { x: 100, y: 720 },
      ],
      CW,
      CH
    );

    near(q[0].x, 0.1);
    near(q[2].y, 0.9);
  });
});

describe('centredRectCm / translateRect', () => {
  it('centres a size on a point', () => {
    expect(centredRectCm({ x: 160, y: 109.2 }, { widthCm: 60, heightCm: 80 })).toEqual({
      x: 130,
      y: 69.2,
      w: 60,
      h: 80,
    });
  });

  it('translates', () => {
    expect(translateRect({ x: 1, y: 2, w: 3, h: 4 }, 0.5, -1)).toEqual({ x: 1.5, y: 1, w: 3, h: 4 });
  });
});

describe('panelPixelsForRect', () => {
  // The projected quad of an angled wall is foreshortened sideways, so its
  // pixel extent has the wrong aspect for a panel drawn in wall centimetres:
  // a face or mat sized from panelW would come out thinner on the sides than
  // on the top. The panel must keep the cm aspect and still be at least twice
  // the projected extent on both axes, so the warp downsamples.
  it('keeps the cm aspect of the outer rectangle', () => {
    const p = panelPixelsForRect({ width: 398, height: 513 }, { widthCm: 71.6, heightCm: 130 });
    expect(p.width / p.height).toBeCloseTo(71.6 / 130, 2);
  });

  it('is at least twice the projected extent on both axes', () => {
    const p = panelPixelsForRect({ width: 398, height: 513 }, { widthCm: 71.6, heightCm: 130 });
    expect(p.width).toBeGreaterThanOrEqual(796);
    expect(p.height).toBeGreaterThanOrEqual(1026);
  });

  it('a square in cm is a square in pixels even when the projection squashes it', () => {
    const p = panelPixelsForRect({ width: 300, height: 500 }, { widthCm: 100, heightCm: 100 });
    expect(p.width).toBe(p.height);
    expect(p.height).toBeGreaterThanOrEqual(1000);
  });
});

describe('fitPosterCm', () => {
  const allowable = { maxWidthCm: 120, maxHeightCm: 150 };

  it('leaves a poster that fits untouched and adds the face to the outer size', () => {
    const r = fitPosterCm({ widthCm: 60, heightCm: 80 }, 2, allowable);

    expect(r.scale).toBe(1);
    expect(r.poster).toEqual({ widthCm: 60, heightCm: 80 });
    expect(r.outer).toEqual({ widthCm: 64, heightCm: 84 });
  });

  it('scales uniformly, never per-axis, so the aspect is preserved', () => {
    const r = fitPosterCm({ widthCm: 200, heightCm: 100 }, 2, allowable);

    near(r.outer.widthCm, 120);
    near(r.poster.widthCm / r.poster.heightCm, 2);
    expect(r.scale).toBeLessThan(1);
  });

  it('never scales up', () => {
    expect(fitPosterCm({ widthCm: 10, heightCm: 10 }, 0, allowable).scale).toBe(1);
  });
});

describe('assertRectWithinMargin', () => {
  const wall = { widthCm: W, heightCm: H };

  it('accepts a rect inside the margin', () => {
    expect(() =>
      assertRectWithinMargin({ x: 30, y: 30, w: 100, h: 100 }, wall, 25, 'r1')
    ).not.toThrow();
  });

  it('rejects a rect crossing the margin and names the scene', () => {
    expect(() => assertRectWithinMargin({ x: 10, y: 30, w: 100, h: 100 }, wall, 25, 'r1')).toThrow(
      /"r1".*margin/
    );
  });
});

describe('sideFaceRectCm', () => {
  const outer = { x: 100, y: 50, w: 60, h: 80 };

  it('is a strip of width d·sin|yaw| outside the near edge, left side', () => {
    const s = sideFaceRectCm(outer, 3, -30, 'left')!;

    near(s.w, 1.5);
    near(s.x + s.w, 100);
    expect(s.y).toBe(50);
    expect(s.h).toBe(80);
  });

  it('sits outside the right edge for nearSide right', () => {
    const s = sideFaceRectCm(outer, 3, 30, 'right')!;

    near(s.x, 160);
    near(s.w, 1.5);
  });

  it('is null straight-on', () => {
    expect(sideFaceRectCm(outer, 3, 0, 'none')).toBeNull();
  });
});

describe('shadowOffsetCm', () => {
  it('falls away from the light and downward, scaled by depth and elevation', () => {
    const fromLeft = shadowOffsetCm(3, { direction: 'left', elevationDeg: 45 }, 'cast');
    expect(fromLeft.dx).toBeGreaterThan(0);
    near(fromLeft.dy, 3);

    const fromRight = shadowOffsetCm(3, { direction: 'right', elevationDeg: 45 }, 'cast');
    expect(fromRight.dx).toBeLessThan(0);
  });

  it('contact offset is a small fraction of the cast offset', () => {
    const cast = shadowOffsetCm(3, { direction: 'left', elevationDeg: 35 }, 'cast');
    const contact = shadowOffsetCm(3, { direction: 'left', elevationDeg: 35 }, 'contact');

    expect(Math.hypot(contact.dx, contact.dy)).toBeLessThan(Math.hypot(cast.dx, cast.dy) * 0.3);
  });
});

describe('projectedWidthPx / pxPerCmAt', () => {
  it('measures the longer horizontal edge, and the local scale at a point', () => {
    const h = wallHomography(STRAIGHT, W, H, CW, CH);

    near(projectedWidthPx(h, { x: 0, y: 0, w: 160, h: 10 }), 300);
    near(pxPerCmAt(h, { x: 160, y: 130 }), (1.875 + 480 / 260) / 2, 3);
  });

  it('is larger on the near side of an angled wall', () => {
    const h = wallHomography(ANGLED, W, H, CW, CH);

    expect(pxPerCmAt(h, { x: 20, y: 130 })).toBeGreaterThan(pxPerCmAt(h, { x: 300, y: 130 }));
  });
});
