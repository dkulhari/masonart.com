# Room Mockup Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `mockups:rooms` into the bare-wall pipeline: one measured room serves every poster shape, and the frame, side face, lighting, shadow and grain are all computed from a `room-<id>.json` scene file plus the product's own pixels.

**Architecture:** Pure wall-plane arithmetic (`wall.ts`, `scene.ts`, `sizing.ts`) is testable with no pixels. Sharp-facing stages sit on top: `panel.ts` draws the framed poster flat, `warp.ts` (existing) projects it, `lighting.ts` does luminance transfer, shadows and grain on raw buffers, and `render.ts` sequences them. The CLI reads scenes from `packages/api/src/database/room-templates/`, renders, and exits. The old straight-on `Box` template format is retired; a yaw-0 scene takes the cheap `fitIntoBox` path inside the same renderer.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Sharp 0.34, Zod, Vitest, Bun. `@chobii/shared` for the size ladder and orientation bands.

**Spec:** `docs/ROOM-MOCKUP-PIPELINE.md`

## Global Constraints

- **No new dependencies.** Sharp and Zod only.
- **The artwork is resampled, never redrawn.** Nothing touches art pixels except uniform tone (luminance multiply, grain).
- **Compose flat, warp once.** Mat, frame and art are rectangles in the wall plane; they are composed in panel space and projected by one homography.
- **Panel rendered at 2× the projected extent** so the warp downsamples.
- **Mat ≥ 6% on all four sides** (existing `MIN_MAT_RATIO` in `warp.ts`). Frameless (`widthCm === 0`) means gallery-wrap: no mat, no face.
- **Never clamp silently.** A poster that does not fit is scaled uniformly (aspect kept); a rect that leaves the margin throws; a scene that disagrees with its own quad throws. Every error names the scene id.
- **Deterministic output.** Grain is seeded from `seedKey + scene.id`; a re-render is byte-identical.
- **No image diffing in CI.** Assert dimensions, channels, sampled pixels, monotonic relations (shadow darker than wall) and byte-identical re-renders.
- **Tests are typechecked** (`packages/api/tsconfig.test.json`). Import `describe/it/expect` from `'vitest'`.
- **Named exports.** No default exports.
- Test files live in `packages/api/tests/lib/room-mockup/`.
- **Yaw sign:** negative = camera looks at the wall from its left ⇒ left vertical edge of the quad is longer ⇒ `nearSide = 'left'`. The spec's JSON example says `nearSide: "right"` for `yawDeg: -25`; that is a typo in the example, and the doc gets fixed in Task 10.
- Do not run the full API suite for these tasks; run `bunx vitest run tests/lib/room-mockup` (shared 8-core box).
- Commit messages: conventional, reference the ticket, end with the session's attribution trailer.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/room-mockup/wall.ts` (new) | Pure cm↔px math: wall homography, rect projection, fitting, side-face strip, shadow offsets |
| `src/lib/room-mockup/scene.ts` (new) | Zod schema + loader for `room-<id>.json`; all fatal validations |
| `src/lib/room-mockup/sizing.ts` (new) | Default poster size from aspect (middle of the ladder); `--poster-cm` parser |
| `src/lib/room-mockup/panel.ts` (new) | Stage 3: art + mat + frame face + bevel + face gradient, flat |
| `src/lib/room-mockup/lighting.ts` (new) | Stage 5 raw-buffer ops: luminance field, quad mask, shadow layer, grain, seeded PRNG |
| `src/lib/room-mockup/render.ts` (modify) | `renderSceneMockup` sequencing stages 3–5; keeps `orientBuffer/orientFile/frameArtwork`; drops `shadowLayer/renderRoomMockup` |
| `src/lib/room-mockup/templates.ts` (modify) | `FrameRender` gains `widthCm`/`depthCm`; `loadFrames`; old `RoomTemplate`/`loadTemplates` removed |
| `src/lib/room-mockup/geometry.ts` (modify) | Keeps `Box/Placed/fitIntoBox`; drops `shadowParams` |
| `src/lib/room-mockup/cli-args.ts` (modify) | New default dir, `--poster-cm`, generic `selectTemplates` |
| `src/database/generate-room-mockups.ts` (modify) | Loads scenes from the templates dir; renders via `renderSceneMockup` |
| `src/database/frame-renders.json` (modify) | Adds `widthCm`, `depthCm` |
| `src/database/room-templates.json` (delete) | Superseded |
| `src/database/room-templates/README.md`, `PROMPT.md` (new) | Authoring workflow + stage-1 prompt |
| `src/database/generate-room-images.ts` (new) | Stage 1: six rooms through Gemini when a key exists |
| `tools/room-measure.html` (new) | Stage 2 click tool |
| `tests/lib/room-mockup/fixtures/synthetic-room.ts` (new) | Deterministic angled + straight rooms for tests |
| `tests/lib/room-mockup/{wall,scene,sizing,panel,lighting,warp,prompt}.test.ts` (new) | |
| `tests/lib/room-mockup/{render,templates,geometry,cli-args,outputs}.test.ts` (modify) | |

All paths below are relative to `packages/api/` unless they start with `docs/`.

---

### Task 1: Wall-plane math (`wall.ts`)

Pure. Everything the renderer needs to go from centimetres on the wall to pixels in the photo.

**Files:**
- Create: `src/lib/room-mockup/wall.ts`
- Test: `tests/lib/room-mockup/wall.test.ts`

**Interfaces:**
- Consumes: `solveHomography`, `applyHomography`, `Quad`, `Point`, `Matrix3` from `./homography`.
- Produces:
  - `type NearSide = 'left' | 'right' | 'none'`
  - `interface RectCm { x; y; w; h }` — wall-plane cm, origin at the wall rectangle's top-left, y down
  - `interface SizeCm { widthCm; heightCm }`
  - `wallHomography(quad: Quad, widthCm, heightCm, canvasW, canvasH): Matrix3` — cm → px
  - `projectRectCm(h: Matrix3, rect: RectCm): Quad` — px quad tl,tr,br,bl
  - `normaliseQuad(quadPx: Quad, canvasW, canvasH): Quad`
  - `centredRectCm(centre: Point, size: SizeCm): RectCm`
  - `fitPosterCm(poster: SizeCm, faceCm: number, allowable: {maxWidthCm; maxHeightCm}): { poster: SizeCm; outer: SizeCm; scale: number }`
  - `assertRectWithinMargin(rect: RectCm, wall: SizeCm, marginCm: number, sceneId: string): void`
  - `sideFaceRectCm(outer: RectCm, depthCm: number, yawDeg: number, nearSide: NearSide): RectCm | null`
  - `shadowOffsetCm(depthCm: number, light: { direction: 'left'|'right'; elevationDeg: number }, kind: 'cast'|'contact'): { dx: number; dy: number }`
  - `translateRect(rect: RectCm, dx: number, dy: number): RectCm`
  - `projectedWidthPx(h: Matrix3, rect: RectCm): number`
  - `pxPerCmAt(h: Matrix3, at: Point): number`
  - `isAxisAligned(quadPx: Quad, tolPx?: number): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/room-mockup/wall.test.ts
import { describe, it, expect } from 'vitest';
import { applyHomography, type Quad } from '../../../src/lib/room-mockup/homography';
import {
  assertRectWithinMargin,
  centredRectCm,
  fitPosterCm,
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
  { x: 0.15, y: 0.10 },
  { x: 0.80, y: 0.16 },
  { x: 0.80, y: 0.72 },
  { x: 0.15, y: 0.82 },
];
/** Straight-on: an axis-aligned rectangle. */
const STRAIGHT: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.7 },
  { x: 0.2, y: 0.7 },
];
const W = 320, H = 260, CW = 1000, CH = 800;
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
    // Wall is 600px wide for 320cm → 1.875 px/cm. A 160cm rect is 300px.
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
      [{ x: 100, y: 80 }, { x: 900, y: 80 }, { x: 900, y: 720 }, { x: 100, y: 720 }],
      CW, CH
    );
    near(q[0].x, 0.1); near(q[2].y, 0.9);
  });
});

describe('centredRectCm / translateRect', () => {
  it('centres a size on a point', () => {
    expect(centredRectCm({ x: 160, y: 109.2 }, { widthCm: 60, heightCm: 80 }))
      .toEqual({ x: 130, y: 69.2, w: 60, h: 80 });
  });
  it('translates', () => {
    expect(translateRect({ x: 1, y: 2, w: 3, h: 4 }, 0.5, -1)).toEqual({ x: 1.5, y: 1, w: 3, h: 4 });
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
  it('accepts a rect inside the margin', () => {
    expect(() => assertRectWithinMargin({ x: 30, y: 30, w: 100, h: 100 }, { widthCm: W, heightCm: H }, 25, 'r1')).not.toThrow();
  });
  it('rejects a rect crossing the margin and names the scene', () => {
    expect(() => assertRectWithinMargin({ x: 10, y: 30, w: 100, h: 100 }, { widthCm: W, heightCm: H }, 25, 'r1'))
      .toThrow(/"r1".*margin/);
  });
});

describe('sideFaceRectCm', () => {
  const outer = { x: 100, y: 50, w: 60, h: 80 };
  it('is a strip of width d·sin|yaw| outside the near edge, left side', () => {
    const s = sideFaceRectCm(outer, 3, -30, 'left')!;
    near(s.w, 1.5);
    near(s.x + s.w, 100);
    expect(s.y).toBe(50); expect(s.h).toBe(80);
  });
  it('sits outside the right edge for nearSide right', () => {
    const s = sideFaceRectCm(outer, 3, 30, 'right')!;
    near(s.x, 160); near(s.w, 1.5);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/wall.test.ts`
Expected: FAIL — cannot resolve `../../../src/lib/room-mockup/wall`.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/wall.ts
/**
 * Wall-plane arithmetic for the bare-wall pipeline.
 *
 * The room scene declares a rectangle on the wall in centimetres and where its
 * four corners land in the photo. Everything that hangs on the wall — frame,
 * side face, shadow — is a rectangle in that cm plane, and this module is how
 * those rectangles become pixel quads. Pure: no sharp, no filesystem.
 */

import { applyHomography, solveHomography, type Matrix3, type Point, type Quad } from './homography';

export type NearSide = 'left' | 'right' | 'none';

/** A rectangle in wall-plane centimetres; origin top-left of the wall rectangle, y down. */
export interface RectCm { x: number; y: number; w: number; h: number }
export interface SizeCm { widthCm: number; heightCm: number }

/** Homography from wall cm to photo pixels, from the measured wall quad. */
export function wallHomography(quad: Quad, widthCm: number, heightCm: number, canvasW: number, canvasH: number): Matrix3 {
  const src: Quad = [
    { x: 0, y: 0 }, { x: widthCm, y: 0 }, { x: widthCm, y: heightCm }, { x: 0, y: heightCm },
  ];
  const dst = quad.map((p) => ({ x: p.x * canvasW, y: p.y * canvasH })) as Quad;
  return solveHomography(src, dst);
}

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
  return { x: centre.x - size.widthCm / 2, y: centre.y - size.heightCm / 2, w: size.widthCm, h: size.heightCm };
}

export function translateRect(rect: RectCm, dx: number, dy: number): RectCm {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/**
 * Shrink the poster UNIFORMLY until poster + frame face fits the allowable
 * box. Per-axis clamping would change the aspect and show the customer a
 * different shape from the one they buy; uniform scaling never can.
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

export function assertRectWithinMargin(rect: RectCm, wall: SizeCm, marginCm: number, sceneId: string): void {
  const ok =
    rect.x >= marginCm && rect.y >= marginCm &&
    rect.x + rect.w <= wall.widthCm - marginCm &&
    rect.y + rect.h <= wall.heightCm - marginCm;
  if (!ok) {
    throw new Error(
      `Room scene "${sceneId}": the poster (${rect.w.toFixed(1)}×${rect.h.toFixed(1)} cm at ${rect.x.toFixed(1)},${rect.y.toFixed(1)}) crosses the ${marginCm} cm margin of the wall rectangle.`
    );
  }
}

/**
 * The visible side face, first order: a strip d·sin|yaw| wide outside the
 * near vertical edge. Null straight-on, where the side is edge-on.
 */
export function sideFaceRectCm(outer: RectCm, depthCm: number, yawDeg: number, nearSide: NearSide): RectCm | null {
  if (nearSide === 'none' || depthCm <= 0) return null;
  const w = depthCm * Math.sin(Math.abs((yawDeg * Math.PI) / 180));
  if (w <= 0) return null;
  return nearSide === 'left'
    ? { x: outer.x - w, y: outer.y, w, h: outer.h }
    : { x: outer.x + outer.w, y: outer.y, w, h: outer.h };
}

/**
 * Where a shadow lands, in cm. Horizontal: away from the light, a fixed
 * fraction of depth. Vertical: d·tan(elevation) — a higher light throws the
 * shadow further down the wall. Contact is the same direction at a small
 * fraction, hugging the frame's edge.
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

export function isAxisAligned(quadPx: Quad, tolPx = 0.5): boolean {
  return (
    Math.abs(quadPx[0].y - quadPx[1].y) <= tolPx &&
    Math.abs(quadPx[3].y - quadPx[2].y) <= tolPx &&
    Math.abs(quadPx[0].x - quadPx[3].x) <= tolPx &&
    Math.abs(quadPx[1].x - quadPx[2].x) <= tolPx
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/wall.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/wall.ts packages/api/tests/lib/room-mockup/wall.test.ts
git commit -m "feat(room-mockup): wall-plane cm to pixel arithmetic"
```

---

### Task 2: Scene schema and loader (`scene.ts`)

**Files:**
- Create: `src/lib/room-mockup/scene.ts`
- Test: `tests/lib/room-mockup/scene.test.ts`

**Interfaces:**
- Consumes: `assertUsableQuad`, `Quad`, `Point` from `./homography`; `wallHomography`, `projectedWidthPx`, `centredRectCm`, `NearSide` from `./wall`.
- Produces:
  - `roomSceneSchema` (Zod), `interface RoomScene` (see below)
  - `nearSideForYaw(yawDeg: number): NearSide` — `|yaw| < 0.5` ⇒ `'none'`
  - `loadRoomScene(raw: unknown, opts: { imageExists: (file: string) => boolean; minPosterPx?: number }): RoomScene`
  - `loadRoomScenes(rawList: unknown[], opts): RoomScene[]` — rejects duplicate ids

```ts
export interface RoomScene {
  id: string;
  image: string;
  imageSize: [number, number];
  wall: { quad: Quad; widthCm: number; heightCm: number };
  anchor: Point;
  allowable: { maxWidthCm: number; maxHeightCm: number; minMarginCm: number };
  view: { yawDeg: number; nearSide: NearSide };
  light: { direction: 'left' | 'right'; elevationDeg: number; softness: number; strength: number };
  label: string;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/room-mockup/scene.test.ts
import { describe, it, expect } from 'vitest';
import { loadRoomScene, loadRoomScenes, nearSideForYaw } from '../../../src/lib/room-mockup/scene';

const scene = (over: Record<string, unknown> = {}) => ({
  id: 'room-01',
  image: 'room-01.png',
  imageSize: [2048, 2048],
  wall: {
    quad: { tl: [0.18, 0.09], tr: [0.79, 0.14], br: [0.79, 0.71], bl: [0.18, 0.78] },
    widthCm: 320,
    heightCm: 260,
  },
  anchor: { x: 0.5, y: 0.42 },
  allowable: { maxWidthCm: 120, maxHeightCm: 150, minMarginCm: 25 },
  view: { yawDeg: -25 },
  light: { direction: 'left', elevationDeg: 35, softness: 0.6, strength: 0.45 },
  ...over,
});
const exists = () => true;
const load = (over: Record<string, unknown> = {}, minPosterPx?: number) =>
  loadRoomScene(scene(over), { imageExists: exists, minPosterPx });

describe('nearSideForYaw', () => {
  it('derives the near side from the sign', () => {
    expect(nearSideForYaw(-25)).toBe('left');
    expect(nearSideForYaw(25)).toBe('right');
    expect(nearSideForYaw(0)).toBe('none');
    expect(nearSideForYaw(0.2)).toBe('none');
  });
});

describe('loadRoomScene', () => {
  it('accepts the spec example (with the correct near side) and converts the quad', () => {
    const s = load();
    expect(s.id).toBe('room-01');
    expect(s.wall.quad[0]).toEqual({ x: 0.18, y: 0.09 });
    expect(s.wall.quad[2]).toEqual({ x: 0.79, y: 0.71 });
    expect(s.view.nearSide).toBe('left');
    expect(s.label).toBe('room-01');
  });

  it('keeps a declared label', () => {
    expect(load({ label: 'Living room' }).label).toBe('Living room');
  });

  it('rejects an id that is not a slug, naming it', () => {
    expect(() => load({ id: 'Living/Room' })).toThrow(/"Living\/Room"/);
  });

  it('rejects a missing image file', () => {
    expect(() => loadRoomScene(scene(), { imageExists: () => false })).toThrow(/room-01\.png/);
  });

  it('rejects a clockwise quad (mirrored poster)', () => {
    expect(() => load({ wall: { ...scene().wall, quad: { tl: [0.18, 0.09], tr: [0.18, 0.78], br: [0.79, 0.71], bl: [0.79, 0.14] } } }))
      .toThrow(/mirror/);
  });

  it('rejects a yaw whose sign disagrees with the quad', () => {
    expect(() => load({ view: { yawDeg: 25 } })).toThrow(/yaw.*left/i);
  });

  it('rejects a declared nearSide that disagrees with the yaw', () => {
    expect(() => load({ view: { yawDeg: -25, nearSide: 'right' } })).toThrow(/nearSide/);
  });

  it('rejects yaw 0 on a quad that is not a rectangle', () => {
    expect(() => load({ view: { yawDeg: 0 } })).toThrow(/straight-on/);
  });

  it('accepts yaw 0 on a rectangle', () => {
    const s = load({
      wall: { ...scene().wall, quad: { tl: [0.2, 0.1], tr: [0.8, 0.1], br: [0.8, 0.7], bl: [0.2, 0.7] } },
      view: { yawDeg: 0 },
    });
    expect(s.view.nearSide).toBe('none');
  });

  it('rejects an anchor whose max poster would cross the margin', () => {
    expect(() => load({ anchor: { x: 0.1, y: 0.42 } })).toThrow(/margin/);
  });

  it('rejects a room whose max poster projects to fewer pixels than the floor', () => {
    expect(() => load({ imageSize: [400, 400] }, 900)).toThrow(/900/);
  });

  it('honours a lower pixel floor for small test rooms', () => {
    expect(() => load({ imageSize: [400, 400] }, 50)).not.toThrow();
  });

  it('rejects a light strength above 1', () => {
    expect(() => load({ light: { ...scene().light, strength: 1.5 } })).toThrow(/"room-01"/);
  });
});

describe('loadRoomScenes', () => {
  it('rejects duplicate ids', () => {
    expect(() => loadRoomScenes([scene(), scene()], { imageExists: exists })).toThrow(/more than once/);
  });
  it('rejects an empty list', () => {
    expect(() => loadRoomScenes([], { imageExists: exists })).toThrow(/No room scenes/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/scene.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/scene.ts
/**
 * The room scene file: `room-<id>.json`, the only authored data the renderer
 * reads. Hand-measured, so every plausible mistake fails loudly and names the
 * scene. A silently accepted bad quad renders a plausible wrong picture.
 */

import { z } from 'zod';
import { assertUsableQuad, type Point, type Quad } from './homography';
import { centredRectCm, projectedWidthPx, wallHomography, type NearSide } from './wall';

const unit = z.number().min(0).max(1);
const point = z.tuple([unit, unit]);

export const roomSceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric with hyphens'),
  image: z.string().min(1),
  imageSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  wall: z.object({
    quad: z.object({ tl: point, tr: point, br: point, bl: point }),
    widthCm: z.number().positive(),
    heightCm: z.number().positive(),
  }),
  anchor: z.object({ x: unit, y: unit }),
  allowable: z.object({
    maxWidthCm: z.number().positive(),
    maxHeightCm: z.number().positive(),
    minMarginCm: z.number().min(0),
  }),
  view: z.object({
    yawDeg: z.number().min(-40).max(40),
    nearSide: z.enum(['left', 'right', 'none']).optional(),
  }),
  light: z.object({
    direction: z.enum(['left', 'right']),
    elevationDeg: z.number().min(0).max(85),
    softness: unit,
    strength: unit,
  }),
  label: z.string().min(1).optional(),
});

export interface RoomScene {
  id: string;
  image: string;
  imageSize: [number, number];
  wall: { quad: Quad; widthCm: number; heightCm: number };
  anchor: Point;
  allowable: { maxWidthCm: number; maxHeightCm: number; minMarginCm: number };
  view: { yawDeg: number; nearSide: NearSide };
  light: { direction: 'left' | 'right'; elevationDeg: number; softness: number; strength: number };
  label: string;
}

/** Below half a degree the room is straight-on and takes the Box path. */
const STRAIGHT_ON_DEG = 0.5;
/** A yawed quad must show at least this much foreshortening, else the yaw is a typo. */
const MIN_EDGE_RATIO = 0.01;
/** Default floor on the max poster's projected width; a smaller room cannot serve a product shot. */
export const MIN_POSTER_PX = 900;

export function nearSideForYaw(yawDeg: number): NearSide {
  if (Math.abs(yawDeg) < STRAIGHT_ON_DEG) return 'none';
  return yawDeg < 0 ? 'left' : 'right';
}

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function checkYawAgainstQuad(quad: Quad, yawDeg: number, id: string): void {
  const left = len(quad[0], quad[3]);
  const right = len(quad[1], quad[2]);
  const longer = Math.max(left, right);
  const diff = (left - right) / longer;
  const side = nearSideForYaw(yawDeg);

  if (side === 'none') {
    const rect =
      Math.abs(diff) <= MIN_EDGE_RATIO &&
      Math.abs(quad[0].y - quad[1].y) <= 0.005 &&
      Math.abs(quad[3].y - quad[2].y) <= 0.005 &&
      Math.abs(quad[0].x - quad[3].x) <= 0.005 &&
      Math.abs(quad[1].x - quad[2].x) <= 0.005;
    if (!rect) {
      throw new Error(`Room scene "${id}" declares yawDeg 0 (straight-on) but its wall quad is not a rectangle.`);
    }
    return;
  }

  if (side === 'left' && diff < MIN_EDGE_RATIO) {
    throw new Error(`Room scene "${id}" declares a negative yaw (camera on the left) but the quad's left edge is not longer than its right.`);
  }
  if (side === 'right' && -diff < MIN_EDGE_RATIO) {
    throw new Error(`Room scene "${id}" declares a positive yaw (camera on the right) but the quad's right edge is not longer than its left.`);
  }
}

export function loadRoomScene(
  raw: unknown,
  opts: { imageExists: (file: string) => boolean; minPosterPx?: number }
): RoomScene {
  const parsed = roomSceneSchema.safeParse(raw);
  if (!parsed.success) {
    const id =
      typeof raw === 'object' && raw !== null && 'id' in raw ? String((raw as { id: unknown }).id) : '?';
    throw new Error(
      `Room scene "${id}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
    );
  }
  const d = parsed.data;
  const q = d.wall.quad;
  const quad: Quad = [
    { x: q.tl[0], y: q.tl[1] },
    { x: q.tr[0], y: q.tr[1] },
    { x: q.br[0], y: q.br[1] },
    { x: q.bl[0], y: q.bl[1] },
  ];

  assertUsableQuad(quad, d.id);
  checkYawAgainstQuad(quad, d.view.yawDeg, d.id);

  const nearSide = nearSideForYaw(d.view.yawDeg);
  if (d.view.nearSide !== undefined && d.view.nearSide !== nearSide) {
    throw new Error(
      `Room scene "${d.id}" declares nearSide "${d.view.nearSide}" but yawDeg ${d.view.yawDeg} implies "${nearSide}".`
    );
  }

  if (!opts.imageExists(d.image)) {
    throw new Error(`Room scene "${d.id}" references a missing image: ${d.image}`);
  }

  const wall = { widthCm: d.wall.widthCm, heightCm: d.wall.heightCm };
  const centre = { x: d.anchor.x * wall.widthCm, y: d.anchor.y * wall.heightCm };
  const maxRect = centredRectCm(centre, { widthCm: d.allowable.maxWidthCm, heightCm: d.allowable.maxHeightCm });
  const m = d.allowable.minMarginCm;
  if (
    maxRect.x < m || maxRect.y < m ||
    maxRect.x + maxRect.w > wall.widthCm - m || maxRect.y + maxRect.h > wall.heightCm - m
  ) {
    throw new Error(
      `Room scene "${d.id}": anchor ± half the allowable poster crosses the ${m} cm margin of the wall rectangle.`
    );
  }

  const [cw, ch] = d.imageSize;
  const h = wallHomography(quad, wall.widthCm, wall.heightCm, cw, ch);
  const floor = opts.minPosterPx ?? MIN_POSTER_PX;
  const widthPx = projectedWidthPx(h, maxRect);
  if (widthPx < floor) {
    throw new Error(
      `Room scene "${d.id}": the largest poster projects to ${Math.round(widthPx)} px wide, below the ${floor} px floor for a product shot.`
    );
  }

  return {
    id: d.id,
    image: d.image,
    imageSize: [cw, ch],
    wall: { quad, ...wall },
    anchor: { x: d.anchor.x, y: d.anchor.y },
    allowable: d.allowable,
    view: { yawDeg: d.view.yawDeg, nearSide },
    light: d.light,
    label: d.label ?? d.id,
  };
}

export function loadRoomScenes(
  rawList: unknown[],
  opts: { imageExists: (file: string) => boolean; minPosterPx?: number }
): RoomScene[] {
  if (rawList.length === 0) throw new Error('No room scenes found — nothing to render.');
  const seen = new Set<string>();
  const out: RoomScene[] = [];
  for (const raw of rawList) {
    const s = loadRoomScene(raw, opts);
    if (seen.has(s.id)) throw new Error(`Room scene "${s.id}" is declared more than once.`);
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/scene.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/scene.ts packages/api/tests/lib/room-mockup/scene.test.ts
git commit -m "feat(room-mockup): room scene schema, loader and fatal validations"
```

---

### Task 3: Default poster size (`sizing.ts`)

**Files:**
- Create: `src/lib/room-mockup/sizing.ts`
- Test: `tests/lib/room-mockup/sizing.test.ts`

**Interfaces:**
- Consumes: `getSizesForOrientation`, `orientationFromRatio` from `@chobii/shared`; `SizeCm` from `./wall`.
- Produces:
  - `posterSizeForAspect(artW: number, artH: number): SizeCm` — orientation band from the ratio, the middle rung of that band's ladder, turned so width ≥ height for landscape/panoramic.
  - `parsePosterCm(value: string): SizeCm` — `"60x80"` (also accepts `×`); throws on anything else.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/room-mockup/sizing.test.ts
import { describe, it, expect } from 'vitest';
import { getSizesForOrientation } from '@chobii/shared';
import { parsePosterCm, posterSizeForAspect } from '../../../src/lib/room-mockup/sizing';

const mid = (o: 'square' | 'portrait' | 'landscape' | 'panoramic') => {
  const ladder = getSizesForOrientation(o);
  return ladder[Math.floor(ladder.length / 2)]!;
};

describe('posterSizeForAspect', () => {
  it('portrait art gets the middle portrait rung, short side first', () => {
    const s = posterSizeForAspect(1000, 1400);
    const m = mid('portrait');
    expect(s).toEqual({ widthCm: m.widthCm, heightCm: m.heightCm });
    expect(s.widthCm).toBeLessThan(s.heightCm);
  });
  it('landscape art gets the same ladder turned, so width ≥ height', () => {
    const s = posterSizeForAspect(1400, 1000);
    const m = mid('landscape');
    expect(s).toEqual({ widthCm: m.heightCm, heightCm: m.widthCm });
  });
  it('square art gets the square ladder', () => {
    const s = posterSizeForAspect(1000, 1000);
    expect(s.widthCm).toBe(s.heightCm);
  });
  it('panoramic art is turned wide', () => {
    const s = posterSizeForAspect(3000, 1000);
    expect(s.widthCm).toBeGreaterThan(s.heightCm * 1.8);
  });
  it('rejects a non-positive dimension', () => {
    expect(() => posterSizeForAspect(0, 10)).toThrow(/dimensions/);
  });
});

describe('parsePosterCm', () => {
  it('parses WxH', () => {
    expect(parsePosterCm('60x80')).toEqual({ widthCm: 60, heightCm: 80 });
    expect(parsePosterCm('50×70')).toEqual({ widthCm: 50, heightCm: 70 });
  });
  it('rejects garbage', () => {
    expect(() => parsePosterCm('big')).toThrow(/--poster-cm/);
    expect(() => parsePosterCm('0x80')).toThrow(/--poster-cm/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/sizing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/sizing.ts
/**
 * Which physical size a poster is shown at.
 *
 * The room is measured in centimetres, so the poster needs a size in
 * centimetres. Default: the middle rung of the ladder for the art's
 * orientation band, which is the size a shopper is most likely to see first.
 * The CLI can override it per run with --poster-cm.
 */

import { getSizesForOrientation, orientationFromRatio } from '@chobii/shared';
import type { SizeCm } from './wall';

/** Ladders are listed short side first; these bands hang wide. */
const TURNED = new Set(['landscape', 'panoramic']);

export function posterSizeForAspect(artW: number, artH: number): SizeCm {
  const orientation = orientationFromRatio(artW / artH);
  if (!orientation) throw new Error(`Cannot size a poster with dimensions ${artW}×${artH}.`);
  const ladder = getSizesForOrientation(orientation);
  const rung = ladder[Math.floor(ladder.length / 2)];
  if (!rung) throw new Error(`No size ladder for orientation "${orientation}".`);
  return TURNED.has(orientation)
    ? { widthCm: rung.heightCm, heightCm: rung.widthCm }
    : { widthCm: rung.widthCm, heightCm: rung.heightCm };
}

export function parsePosterCm(value: string): SizeCm {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(value);
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;
  if (!m || w <= 0 || h <= 0) {
    throw new Error(`--poster-cm expects WIDTHxHEIGHT in centimetres, e.g. 60x80; got "${value}".`);
  }
  return { widthCm: w, heightCm: h };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/sizing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/sizing.ts packages/api/tests/lib/room-mockup/sizing.test.ts
git commit -m "feat(room-mockup): default poster size from the ladder"
```

---

### Task 4: `warp.ts` round-trip tests (spec item 7)

No source change unless a test finds a bug. Pins the existing `panelSizeForQuad`, `buildPanel`, `warpPanelIntoQuad`.

**Files:**
- Test: `tests/lib/room-mockup/warp.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/lib/room-mockup/warp.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyHomography, solveHomography, type Quad } from '../../../src/lib/room-mockup/homography';
import { buildPanel, panelSizeForQuad, warpPanelIntoQuad } from '../../../src/lib/room-mockup/warp';

const TRAPEZOID: Quad = [
  { x: 0.2, y: 0.15 },
  { x: 0.8, y: 0.25 },
  { x: 0.8, y: 0.75 },
  { x: 0.2, y: 0.85 },
];
const CW = 400, CH = 400;

/** 8×8 checkerboard, cells of `cell` px, black/white. */
async function checkerboard(cells: number, cell: number): Promise<Buffer> {
  const size = cells * cell;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0 ? 255 : 0;
    const o = (y * size + x) * 3;
    raw[o] = raw[o + 1] = raw[o + 2] = v;
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

describe('panelSizeForQuad', () => {
  it('uses the longer of each opposing edge pair', () => {
    const { width, height } = panelSizeForQuad(TRAPEZOID, 1000, 1000);
    expect(width).toBe(Math.round(Math.hypot(600, 100)));
    expect(height).toBe(700);
  });
});

describe('buildPanel', () => {
  it('is opaque edge to edge and shows the mat colour at the border', async () => {
    const art = await sharp({ create: { width: 50, height: 100, channels: 3, background: { r: 10, g: 20, b: 200 } } }).png().toBuffer();
    const panel = await buildPanel(art, 200, 100, [250, 250, 250]);
    const { data, info } = await sharp(panel).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect(data[0]).toBe(250);
    const c = ((50 * 200) + 100) * 3;
    expect(data[c + 2]).toBe(200);
  });
});

describe('warpPanelIntoQuad round trip', () => {
  it('every destination pixel inside the quad matches the panel sample it maps back to', async () => {
    const cell = 8, cells = 8, size = cell * cells;
    const panel = await checkerboard(cells, cell);
    const out = await warpPanelIntoQuad(panel, size, size, TRAPEZOID, CW, CH);

    const dst = TRAPEZOID.map((p) => ({ x: p.x * CW, y: p.y * CH })) as Quad;
    const back = solveHomography(dst, [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }]);

    let checked = 0, wrong = 0;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const o = (y * CW + x) * 4;
      if (out[o + 3] !== 255) continue;
      const s = applyHomography(back, { x: x + 0.5, y: y + 0.5 });
      // Skip pixels within 1 panel-px of a cell edge: bilinear blends there.
      const fx = s.x % cell, fy = s.y % cell;
      if (fx < 1 || fx > cell - 1 || fy < 1 || fy > cell - 1) continue;
      const expected = ((Math.floor(s.x / cell) + Math.floor(s.y / cell)) % 2) === 0 ? 255 : 0;
      checked++;
      if (Math.abs(out[o]! - expected) > 8) wrong++;
    }
    expect(checked).toBeGreaterThan(5000);
    expect(wrong / checked).toBeLessThan(0.002);
  });

  it('is transparent outside the quad and opaque deep inside', async () => {
    const panel = await checkerboard(2, 4);
    const out = await warpPanelIntoQuad(panel, 8, 8, TRAPEZOID, CW, CH);
    const a = (x: number, y: number) => out[(y * CW + x) * 4 + 3]!;
    expect(a(10, 10)).toBe(0);
    expect(a(200, 200)).toBe(255);
    expect(a(390, 390)).toBe(0);
  });

  it('partially covers pixels along a slanted edge (anti-aliased)', async () => {
    const panel = await checkerboard(2, 4);
    const out = await warpPanelIntoQuad(panel, 8, 8, TRAPEZOID, CW, CH);
    // Walk down the top edge column x=200: the edge y = 0.15+0.1*(200-80)/240 → ~0.2*400 = 80
    let partial = 0;
    for (let y = 70; y < 90; y++) {
      const v = out[(y * CW + 200) * 4 + 3]!;
      if (v > 0 && v < 255) partial++;
    }
    expect(partial).toBeGreaterThan(0);
  });

  it('keeps the last row and column when the quad lands on exact integers', async () => {
    const square: Quad = [{ x: 0.25, y: 0.25 }, { x: 0.5, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.25, y: 0.5 }];
    const panel = await checkerboard(1, 4);
    const out = await warpPanelIntoQuad(panel, 4, 4, square, CW, CH);
    expect(out[(199 * CW + 199) * 4 + 3]).toBeGreaterThan(0);
    expect(out[(200 * CW + 200) * 4 + 3]).toBe(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/warp.test.ts`
Expected: PASS (6 tests). If the round-trip test fails, the defect is in `warp.ts`; fix it there and keep the test.

- [ ] **Step 3: Commit** (this also lands the two untracked source files)

```bash
git add packages/api/src/lib/room-mockup/homography.ts packages/api/src/lib/room-mockup/warp.ts packages/api/tests/lib/room-mockup/homography.test.ts packages/api/tests/lib/room-mockup/warp.test.ts
git commit -m "feat(room-mockup): four-point perspective warp with round-trip tests"
```

---

### Task 5: Frame renders in centimetres (`templates.ts`, `frame-renders.json`)

**Files:**
- Modify: `src/lib/room-mockup/templates.ts` — add `widthCm`, `depthCm` to `frameRenderSchema`/`FrameRender`; add `loadFrames`. Leave `roomTemplateSchema`/`loadTemplates` in place for now (Task 9 removes them).
- Modify: `src/database/frame-renders.json`
- Modify: `tests/lib/room-mockup/templates.test.ts`, `tests/lib/room-mockup/render.test.ts`, `tests/lib/room-mockup/outputs.test.ts` — fixtures gain the two fields.

**Interfaces:**
- Produces: `interface FrameRender { widthRatio; color; depthRatio; widthCm: number; depthCm: number }`, `loadFrames(raw: unknown): Record<string, FrameRender>`.

- [ ] **Step 1: Write the failing tests** (append to `templates.test.ts`)

```ts
import { loadFrames } from '../../../src/lib/room-mockup/templates';

describe('loadFrames', () => {
  const black = { widthRatio: 0.028, color: [26, 26, 28], depthRatio: 0.022, widthCm: 1.8, depthCm: 3 };
  it('accepts a frame with physical dimensions', () => {
    expect(loadFrames({ black }).black.depthCm).toBe(3);
  });
  it('rejects a frame without widthCm, naming the slug', () => {
    const { widthCm: _w, ...noWidth } = black;
    expect(() => loadFrames({ black: noWidth })).toThrow(/"black".*widthCm/);
  });
  it('rejects a zero depth: even a canvas stands off the wall', () => {
    expect(() => loadFrames({ black: { ...black, depthCm: 0 } })).toThrow(/depthCm/);
  });
  it('allows widthCm 0 for gallery-wrap', () => {
    expect(loadFrames({ frameless: { ...black, widthRatio: 0, widthCm: 0 } }).frameless.widthCm).toBe(0);
  });
});
```

Also update `FRAMES` in `templates.test.ts` and `OAK`/`FRAMELESS` in `render.test.ts` and any `FrameRender` fixture in `outputs.test.ts` to include `widthCm` and `depthCm` (typecheck will fail otherwise).

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/templates.test.ts`
Expected: FAIL — `loadFrames` is not exported.

- [ ] **Step 3: Implement**

In `templates.ts`, extend the schema and interface:

```ts
export const frameRenderSchema = z.object({
  widthRatio: z.number().min(0).max(0.5),
  color: z.tuple([/* unchanged */]),
  depthRatio: z.number().gt(0).max(0.2),
  /** Front face width in cm. 0 = gallery-wrap: no face, no mat, art to the edge. */
  widthCm: z.number().min(0).max(12),
  /** How far the piece stands off the wall, in cm. Drives the side face and shadows. */
  depthCm: z.number().gt(0).max(12),
});

export interface FrameRender {
  widthRatio: number;
  color: [number, number, number];
  depthRatio: number;
  widthCm: number;
  depthCm: number;
}

export function loadFrames(rawFrames: unknown): Record<string, FrameRender> {
  const frameEntries = z.record(z.string(), z.unknown()).parse(rawFrames);
  const frames: Record<string, FrameRender> = {};
  for (const [slug, spec] of Object.entries(frameEntries)) {
    const parsed = frameRenderSchema.safeParse(spec);
    if (!parsed.success) {
      throw new Error(
        `Frame render "${slug}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }
    frames[slug] = parsed.data as FrameRender;
  }
  return frames;
}
```

Make `loadTemplates` call `loadFrames` instead of repeating the loop.

`frame-renders.json`:

```json
{
  "wood":      { "widthRatio": 0.032, "color": [138, 106, 74],  "depthRatio": 0.024, "widthCm": 3.2, "depthCm": 3.0 },
  "black":     { "widthRatio": 0.028, "color": [26, 26, 28],    "depthRatio": 0.022, "widthCm": 1.8, "depthCm": 3.0 },
  "white":     { "widthRatio": 0.028, "color": [242, 240, 236], "depthRatio": 0.022, "widthCm": 1.8, "depthCm": 3.0 },
  "gold":      { "widthRatio": 0.030, "color": [186, 152, 84],  "depthRatio": 0.024, "widthCm": 2.4, "depthCm": 3.0 },
  "silver":    { "widthRatio": 0.026, "color": [188, 193, 198], "depthRatio": 0.022, "widthCm": 2.0, "depthCm": 2.8 },
  "frameless": { "widthRatio": 0,     "color": [0, 0, 0],       "depthRatio": 0.030, "widthCm": 0,   "depthCm": 3.8 }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup && bunx tsc -p tsconfig.test.json --noEmit`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/templates.ts packages/api/src/database/frame-renders.json packages/api/tests/lib/room-mockup/templates.test.ts packages/api/tests/lib/room-mockup/render.test.ts packages/api/tests/lib/room-mockup/outputs.test.ts
git commit -m "feat(room-mockup): frame renders carry face width and depth in cm"
```

---

### Task 6: Flat framed panel (`panel.ts`) — stage 3

**Files:**
- Create: `src/lib/room-mockup/panel.ts`
- Test: `tests/lib/room-mockup/panel.test.ts`

**Interfaces:**
- Consumes: `buildPanel` from `./warp`; `FrameRender` from `./templates`; `SizeCm` from `./wall`; `MAT_COLOR` from `@chobii/shared`; `orientBuffer` from `./render`.
- Produces:
  - `interface FramedPanel { png: Buffer; width: number; height: number }`
  - `buildFramedPanel(art: Buffer, posterCm: SizeCm, frame: FrameRender, panelW: number, panelH: number, light: { direction: 'left'|'right' }): Promise<FramedPanel>` — `panelW/panelH` are the pixel size of the OUTER rect (poster + 2·face); the caller derives them from the projected quad. The face gradient (+6% lit edge, −6% far edge) is applied here in panel space.
  - `FACE_GRADIENT = 0.06`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/room-mockup/panel.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildFramedPanel } from '../../../src/lib/room-mockup/panel';
import type { FrameRender } from '../../../src/lib/room-mockup/templates';

const BLACK: FrameRender = { widthRatio: 0.028, color: [26, 26, 28], depthRatio: 0.022, widthCm: 2, depthCm: 3 };
const WRAP: FrameRender = { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03, widthCm: 0, depthCm: 3.8 };
const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } }).png().toBuffer();
const px = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const o = (y * info.width + x) * info.channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
};

describe('buildFramedPanel', () => {
  // Outer 64×84 cm at 5 px/cm → 320×420. Face 2 cm = 10 px.
  const poster = { widthCm: 60, heightCm: 80 };

  it('is exactly the requested pixel size, opaque', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, { direction: 'left' });
    const meta = await sharp(p.png).metadata();
    expect([meta.width, meta.height]).toEqual([320, 420]);
    expect(meta.channels).toBe(3);
  });

  it('paints the face in the frame colour and the art in the middle', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, { direction: 'left' });
    const [r, , b] = await px(p.png, 4, 210);
    expect(r).toBeLessThan(40); expect(b).toBeLessThan(40);
    const centre = await px(p.png, 160, 210);
    expect(centre[2]).toBe(200);
  });

  it('keeps a mat of at least 6% between face and art', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, { direction: 'left' });
    // 10px face, inner 300 wide, 6% of 300 = 18px mat → x=20 is mat
    const [r, g, b] = await px(p.png, 20, 210);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('lights the face from the declared side: lit edge brighter than far edge', async () => {
    const p = await buildFramedPanel(await art(600, 800), { widthCm: 60, heightCm: 80 }, { ...BLACK, color: [128, 128, 128] }, 320, 420, { direction: 'left' });
    const [l] = await px(p.png, 3, 210);
    const [r] = await px(p.png, 316, 210);
    expect(l).toBeGreaterThan(r);
    expect(l - r).toBeGreaterThan(10);
  });

  it('gallery-wrap has no face and no mat: art reaches the edge', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, WRAP, 300, 400, { direction: 'left' });
    const [, , b] = await px(p.png, 1, 200);
    expect(b).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/panel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/panel.ts
/**
 * Stage 3: the framed poster, drawn flat in wall-plane pixels.
 *
 * Art, mat and frame face are all rectangles on the wall plane, so their
 * geometry is trivial here and a mess after projection. The face's
 * directional shade is applied here too — it is a function of panel x only,
 * and the warp carries it into the room for free.
 */

import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { orientBuffer } from './render';
import type { FrameRender } from './templates';
import { buildPanel } from './warp';
import type { SizeCm } from './wall';

export interface FramedPanel { png: Buffer; width: number; height: number }

/** Lit edge +6%, far edge −6%. */
export const FACE_GRADIENT = 0.06;
const BEVEL_RATIO = 0.12;
const MAT_RATIO = 0.06;
const MAT: [number, number, number] = [MAT_COLOR.r, MAT_COLOR.g, MAT_COLOR.b];

export async function buildFramedPanel(
  art: Buffer,
  posterCm: SizeCm,
  frame: FrameRender,
  panelW: number,
  panelH: number,
  light: { direction: 'left' | 'right' }
): Promise<FramedPanel> {
  const oriented = await orientBuffer(art);
  const outerW = posterCm.widthCm + 2 * frame.widthCm;
  const pxPerCm = panelW / outerW;
  const face = frame.widthCm === 0 ? 0 : Math.max(2, Math.round(frame.widthCm * pxPerCm));
  const bevel = face === 0 ? 0 : Math.max(1, Math.round(face * BEVEL_RATIO));

  const innerW = Math.max(1, panelW - 2 * (face + bevel));
  const innerH = Math.max(1, panelH - 2 * (face + bevel));
  const inner = await buildPanel(oriented, innerW, innerH, MAT, face === 0 ? 0 : MAT_RATIO);

  if (face === 0) {
    const png = await sharp(inner).resize(panelW, panelH, { fit: 'fill' }).png().toBuffer();
    return { png, width: panelW, height: panelH };
  }

  const [r, g, b] = frame.color;
  const framed = await sharp(inner)
    .extend({ top: bevel, bottom: bevel, left: bevel, right: bevel, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .extend({ top: face, bottom: face, left: face, right: face, background: { r, g, b, alpha: 1 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // extend() rounds independently; force the exact size the caller asked for.
  const { data, info } = framed;
  const W = info.width, H = info.height;
  const lit = light.direction === 'left' ? 1 : -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const onFace = x < face || x >= W - face || y < face || y >= H - face;
      if (!onFace) continue;
      const t = (x / (W - 1)) * 2 - 1; // -1 left edge … +1 right edge
      const f = 1 - FACE_GRADIENT * t * lit;
      const o = (y * W + x) * 3;
      data[o] = Math.min(255, Math.round(data[o]! * f));
      data[o + 1] = Math.min(255, Math.round(data[o + 1]! * f));
      data[o + 2] = Math.min(255, Math.round(data[o + 2]! * f));
    }
  }

  const png = await sharp(data, { raw: { width: W, height: H, channels: 3 } })
    .resize(panelW, panelH, { fit: 'fill' })
    .png()
    .toBuffer();
  return { png, width: panelW, height: panelH };
}
```

Note the bevel is a solid dark hairline here (opaque black over the mat), not the 35% alpha of `frameArtwork`; on a 2× panel it reads the same after the warp downsamples.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/panel.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/panel.ts packages/api/tests/lib/room-mockup/panel.test.ts
git commit -m "feat(room-mockup): draw the framed poster flat with a lit face"
```

---

### Task 7: Lighting primitives (`lighting.ts`) — stage 5 parts

**Files:**
- Create: `src/lib/room-mockup/lighting.ts`
- Test: `tests/lib/room-mockup/lighting.test.ts`

**Interfaces:**
- Consumes: `warpPanelIntoQuad` from `./warp`; `quadPixelBounds`, `Quad` from `./homography`.
- Produces:
  - `interface RawImage { data: Buffer; width: number; height: number; channels: number }`
  - `interface Bounds { left; top; right; bottom }` (same shape as `quadPixelBounds`)
  - `readRaw(input: Buffer, channels: 3 | 4): Promise<RawImage>`
  - `seedFromKey(key: string): number` — FNV-1a 32-bit
  - `mulberry32(seed: number): () => number`
  - `wallLuminanceField(room: RawImage, bounds: Bounds, sigma: number): Promise<Float32Array>` — blurred luminance over the bounds, divided by its mean; length `(right-left)*(bottom-top)`
  - `applyLuminance(layer: Buffer, W: number, H: number, field: Float32Array, bounds: Bounds, strength: number): void` — in place on an RGBA canvas layer, only where alpha > 0; factor `1 + strength·(L − 1)`, clamped to `[0.6, 1.4]`
  - `quadMask(quads: Quad[], W: number, H: number): Promise<Buffer>` — single-channel W×H, union (max) of anti-aliased quad coverage
  - `shadowLayer(mask: Buffer, W: number, H: number, blurSigma: number, opacity: number): Promise<Buffer>` — RGBA PNG of black with alpha = blurred mask × opacity
  - `wallGrainAmplitude(room: RawImage, bounds: Bounds): number` — std-dev of luminance minus its 3×3 box mean over the bounds
  - `addGrain(layer: Buffer, W: number, H: number, amplitude: number, seed: number): void` — in place, Gaussian noise via Box–Muller, only where alpha > 0
  - `unionBounds(a: Bounds, b: Bounds | null): Bounds`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/room-mockup/lighting.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import type { Quad } from '../../../src/lib/room-mockup/homography';
import {
  addGrain, applyLuminance, mulberry32, quadMask, readRaw, seedFromKey,
  shadowLayer, wallGrainAmplitude, wallLuminanceField,
} from '../../../src/lib/room-mockup/lighting';

const W = 200, H = 100;

/** A wall that darkens left→right: 240 at x=0 to 160 at x=W-1. */
async function gradientRoom() {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.round(240 - (80 * x) / (W - 1));
    const o = (y * W + x) * 3;
    raw[o] = raw[o + 1] = raw[o + 2] = v;
  }
  return readRaw(await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), 3);
}

/** A full-canvas RGBA layer, mid-grey, opaque inside [50,150)×[20,80). */
function greyLayer() {
  const buf = Buffer.alloc(W * H * 4, 0);
  for (let y = 20; y < 80; y++) for (let x = 50; x < 150; x++) {
    const o = (y * W + x) * 4;
    buf[o] = buf[o + 1] = buf[o + 2] = 128; buf[o + 3] = 255;
  }
  return buf;
}
const bounds = { left: 50, top: 20, right: 150, bottom: 80 };

describe('seeded randomness', () => {
  it('seedFromKey is stable and distinguishes keys', () => {
    expect(seedFromKey('a:room-01')).toBe(seedFromKey('a:room-01'));
    expect(seedFromKey('a:room-01')).not.toBe(seedFromKey('b:room-01'));
  });
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
    }
  });
});

describe('wallLuminanceField + applyLuminance', () => {
  it('normalises to mean 1 and follows the wall gradient', async () => {
    const field = await wallLuminanceField(await gradientRoom(), bounds, 2);
    expect(field.length).toBe(100 * 60);
    const mean = field.reduce((s, v) => s + v, 0) / field.length;
    expect(mean).toBeCloseTo(1, 2);
    expect(field[30 * 100 + 5]!).toBeGreaterThan(field[30 * 100 + 95]!);
  });

  it('darkens the layer toward the same side the wall darkens, by strength', async () => {
    const field = await wallLuminanceField(await gradientRoom(), bounds, 2);
    const layer = greyLayer();
    applyLuminance(layer, W, H, field, bounds, 0.5);
    const at = (x: number) => layer[(50 * W + x) * 4]!;
    expect(at(55)).toBeGreaterThan(at(145));
    // wall ratio at x=55 ≈ 218/200=1.09 → +4.5% at strength .5 → ~134
    expect(at(55)).toBeGreaterThan(128); expect(at(55)).toBeLessThan(140);
    expect(layer[(10 * W + 10) * 4]).toBe(0); // untouched outside alpha
  });
});

describe('quadMask + shadowLayer', () => {
  const q: Quad = [{ x: 0.25, y: 0.2 }, { x: 0.75, y: 0.2 }, { x: 0.75, y: 0.8 }, { x: 0.25, y: 0.8 }];
  it('covers the quad and nothing else', async () => {
    const m = await quadMask([q], W, H);
    expect(m.length).toBe(W * H);
    expect(m[50 * W + 100]).toBe(255);
    expect(m[5 * W + 5]).toBe(0);
  });
  it('unions two quads', async () => {
    const q2: Quad = [{ x: 0.8, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.8, y: 0.8 }];
    const m = await quadMask([q, q2], W, H);
    expect(m[50 * W + 170]).toBe(255);
  });
  it('shadowLayer is black with alpha = opacity at the centre and 0 far away', async () => {
    const m = await quadMask([q], W, H);
    const png = await shadowLayer(m, W, H, 1, 0.4);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const c = (50 * W + 100) * 4;
    expect(data[c]).toBe(0);
    expect(data[c + 3]).toBeGreaterThanOrEqual(100); expect(data[c + 3]).toBeLessThanOrEqual(104);
    expect(data[(5 * W + 5) * 4 + 3]).toBe(0);
  });
});

describe('grain', () => {
  it('measures zero amplitude on a smooth gradient and more on a noisy wall', async () => {
    const smooth = wallGrainAmplitude(await gradientRoom(), bounds);
    expect(smooth).toBeLessThan(1);
    const noisy = await gradientRoom();
    const rnd = mulberry32(1);
    for (let i = 0; i < noisy.data.length; i++) noisy.data[i] = Math.max(0, Math.min(255, noisy.data[i]! + Math.round((rnd() - 0.5) * 20)));
    expect(wallGrainAmplitude(noisy, bounds)).toBeGreaterThan(3);
  });

  it('adds seeded noise of the requested amplitude only under alpha, deterministically', () => {
    const a = greyLayer(), b = greyLayer();
    addGrain(a, W, H, 6, 123); addGrain(b, W, H, 6, 123);
    expect(a.equals(b)).toBe(true);
    let sum = 0, sq = 0, n = 0;
    for (let y = 20; y < 80; y++) for (let x = 50; x < 150; x++) {
      const v = a[(y * W + x) * 4]! - 128; sum += v; sq += v * v; n++;
    }
    const sd = Math.sqrt(sq / n - (sum / n) ** 2);
    expect(sd).toBeGreaterThan(4.5); expect(sd).toBeLessThan(7.5);
    expect(a[(10 * W + 10) * 4]).toBe(0);
    const c = greyLayer(); addGrain(c, W, H, 6, 124);
    expect(a.equals(c)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/lighting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/lighting.ts
/**
 * Stage 5 primitives: everything that makes a warped panel belong to the
 * photograph it lands in. Each is a multiply or a masked add on raw buffers;
 * nothing here touches the artwork except by uniform tone.
 */

import sharp from 'sharp';
import type { Quad } from './homography';
import { warpPanelIntoQuad } from './warp';

export interface RawImage { data: Buffer; width: number; height: number; channels: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }

export async function readRaw(input: Buffer, channels: 3 | 4): Promise<RawImage> {
  const pipeline = channels === 4 ? sharp(input).ensureAlpha() : sharp(input).removeAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** FNV-1a, 32-bit. Stable across runs and machines. */
export function seedFromKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function unionBounds(a: Bounds, b: Bounds | null): Bounds {
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
  };
}

/**
 * The wall's own light inside the placement area, as a field of ratios to its
 * mean. Blurred first so grain does not come through as texture.
 */
export async function wallLuminanceField(room: RawImage, bounds: Bounds, sigma: number): Promise<Float32Array> {
  const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top;
  const { data } = await sharp(room.data, { raw: { width: room.width, height: room.height, channels: room.channels as 3 | 4 } })
    .extract({ left: bounds.left, top: bounds.top, width: bw, height: bh })
    .removeAlpha()
    .toColourspace('b-w')
    .blur(Math.max(0.5, sigma))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const field = new Float32Array(bw * bh);
  let sum = 0;
  for (let i = 0; i < field.length; i++) { field[i] = data[i]!; sum += data[i]!; }
  const mean = sum / field.length || 1;
  for (let i = 0; i < field.length; i++) field[i] = field[i]! / mean;
  return field;
}

export function applyLuminance(layer: Buffer, W: number, _H: number, field: Float32Array, bounds: Bounds, strength: number): void {
  const bw = bounds.right - bounds.left;
  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      const o = (y * W + x) * 4;
      if (layer[o + 3] === 0) continue;
      const L = field[(y - bounds.top) * bw + (x - bounds.left)]!;
      const f = Math.min(1.4, Math.max(0.6, 1 + strength * (L - 1)));
      layer[o] = Math.min(255, Math.round(layer[o]! * f));
      layer[o + 1] = Math.min(255, Math.round(layer[o + 1]! * f));
      layer[o + 2] = Math.min(255, Math.round(layer[o + 2]! * f));
    }
  }
}

/** Anti-aliased coverage of the quads, as one alpha channel. A 2×2 white panel warped in. */
export async function quadMask(quads: Quad[], W: number, H: number): Promise<Buffer> {
  const white = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const mask = Buffer.alloc(W * H, 0);
  for (const q of quads) {
    const layer = await warpPanelIntoQuad(white, 2, 2, q, W, H);
    for (let i = 0; i < W * H; i++) {
      const a = layer[i * 4 + 3]!;
      if (a > mask[i]!) mask[i] = a;
    }
  }
  return mask;
}

/** Black at `opacity` where the blurred mask is full; sharp has no "composite at 40%", so alpha carries it. */
export async function shadowLayer(mask: Buffer, W: number, H: number, blurSigma: number, opacity: number): Promise<Buffer> {
  const alpha = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(Math.max(0.4, blurSigma))
    .linear(opacity, 0)
    .raw()
    .toBuffer();
  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

/** Std-dev of the high-pass (pixel minus 3×3 mean) luminance over the bounds. */
export function wallGrainAmplitude(room: RawImage, bounds: Bounds): number {
  const c = room.channels;
  const L = (x: number, y: number) => {
    const o = (y * room.width + x) * c;
    return lum(room.data[o]!, room.data[o + 1]!, room.data[o + 2]!);
  };
  let sum = 0, sq = 0, n = 0;
  for (let y = bounds.top + 1; y < bounds.bottom - 1; y++) {
    for (let x = bounds.left + 1; x < bounds.right - 1; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += L(x + dx, y + dy);
      const d = L(x, y) - m / 9;
      sum += d; sq += d * d; n++;
    }
  }
  if (n === 0) return 0;
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
}

export function addGrain(layer: Buffer, W: number, H: number, amplitude: number, seed: number): void {
  if (amplitude <= 0) return;
  const rnd = mulberry32(seed);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (layer[o + 3] === 0) continue;
      const u1 = Math.max(1e-12, rnd()), u2 = rnd();
      const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * amplitude;
      for (let ch = 0; ch < 3; ch++) {
        layer[o + ch] = Math.max(0, Math.min(255, Math.round(layer[o + ch]! + n)));
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/lighting.test.ts`
Expected: PASS (9 tests). If `linear()` on a 1-channel raw input errors, convert via `.toColourspace('b-w')` after creating a 3-channel image from the mask (same trick as the old `shadowLayer`).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/lighting.ts packages/api/tests/lib/room-mockup/lighting.test.ts
git commit -m "feat(room-mockup): luminance transfer, quad shadows and seeded grain"
```

---

### Task 8: The renderer (`render.ts`) — stages 3–5 wired, side face, Box|Quad branch, golden tests

**Files:**
- Modify: `src/lib/room-mockup/render.ts` — add `renderSceneMockup`; remove `shadowLayer` and `renderRoomMockup`.
- Modify: `src/lib/room-mockup/geometry.ts` — remove `shadowParams`, `ShadowSpec`, `ShadowPair`, `MIN_SIGMA`.
- Create: `tests/lib/room-mockup/fixtures/synthetic-room.ts`
- Modify: `tests/lib/room-mockup/render.test.ts` — drop `shadowLayer` and `renderRoomMockup` describes; add `renderSceneMockup` describes.
- Modify: `tests/lib/room-mockup/geometry.test.ts` — drop `shadowParams` tests.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces:
  - `interface SceneRenderOptions { posterCm?: SizeCm; seedKey: string }`
  - `renderSceneMockup(art: Buffer, roomPath: string, scene: RoomScene, frame: FrameRender, options: SceneRenderOptions): Promise<Buffer>` — JPEG q92 at the room's size.
  - Test fixture: `makeRoom(kind: 'angled' | 'straight', w: number, h: number): Promise<{ path: string; scene: RoomScene }>`

- [ ] **Step 1: Write the fixture**

```ts
// tests/lib/room-mockup/fixtures/synthetic-room.ts
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRoomScene, type RoomScene } from '../../../../src/lib/room-mockup/scene';
import { mulberry32 } from '../../../../src/lib/room-mockup/lighting';

/**
 * A deterministic bare-wall room: plaster that darkens to the right, faint
 * seeded grain, and a darker floor band. The quad is known by construction,
 * which is what lets the renderer's output be asserted on.
 */
export async function makeRoom(kind: 'angled' | 'straight', w: number, h: number) {
  const raw = Buffer.alloc(w * h * 3);
  const rnd = mulberry32(7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const floor = y > h * 0.85;
    const base = floor ? 150 : 232 - 30 * (x / (w - 1));
    const g = (rnd() - 0.5) * 6;
    const o = (y * w + x) * 3;
    raw[o] = Math.round(base + g); raw[o + 1] = Math.round(base - 3 + g); raw[o + 2] = Math.round(base - 10 + g);
  }
  const dir = mkdtempSync(join(tmpdir(), 'room-scene-'));
  const path = join(dir, `${kind}.png`);
  writeFileSync(path, await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());

  const quad = kind === 'angled'
    ? { tl: [0.15, 0.10], tr: [0.80, 0.16], br: [0.80, 0.72], bl: [0.15, 0.82] }
    : { tl: [0.15, 0.10], tr: [0.85, 0.10], br: [0.85, 0.80], bl: [0.15, 0.80] };

  const scene: RoomScene = loadRoomScene(
    {
      id: `synthetic-${kind}`,
      image: `${kind}.png`,
      imageSize: [w, h],
      wall: { quad, widthCm: 320, heightCm: 260 },
      anchor: { x: 0.5, y: 0.42 },
      allowable: { maxWidthCm: 140, maxHeightCm: 160, minMarginCm: 20 },
      view: { yawDeg: kind === 'angled' ? -25 : 0 },
      light: { direction: 'left', elevationDeg: 35, softness: 0.6, strength: 0.45 },
    },
    { imageExists: () => true, minPosterPx: 50 }
  );
  return { path, scene };
}
```

- [ ] **Step 2: Write the failing tests** (replace the `shadowLayer` and `renderRoomMockup` describes in `render.test.ts`)

```ts
import { renderSceneMockup } from '../../../src/lib/room-mockup/render';
import { makeRoom } from './fixtures/synthetic-room';
import { applyHomography } from '../../../src/lib/room-mockup/homography';
import { wallHomography, centredRectCm, projectRectCm } from '../../../src/lib/room-mockup/wall';
import { posterSizeForAspect } from '../../../src/lib/room-mockup/sizing';

const BLACK: FrameRender = { widthRatio: 0.028, color: [26, 26, 28], depthRatio: 0.022, widthCm: 2, depthCm: 3 };
const RW = 1000, RH = 800;

const rgbAt = async (img: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const o = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!] as const;
};

describe('renderSceneMockup (angled room)', () => {
  it.each([
    ['portrait', 600, 800],
    ['square', 700, 700],
    ['panoramic', 1500, 500],
  ])('%s: JPEG at room size, art at the centre, frame on the ring, wall untouched far away', async (_n, aw, ah) => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(aw, ah), path, scene, BLACK, { seedKey: 'sku-1' });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([RW, RH]);

    // Centre of the poster: art colour modulated by tone only — blue dominant.
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const c = applyHomography(h, { x: 160, y: 0.42 * 260 });
    const [r, g, b] = await rgbAt(out, c.x, c.y);
    expect(b).toBeGreaterThan(150); expect(r).toBeLessThan(60); expect(g).toBeLessThan(70);

    // A pixel far from the wall rectangle equals the original room.
    const room = await sharp(path).toBuffer();
    expect(await rgbAt(out, 20, 20)).toEqual(await rgbAt(room, 20, 20));
  });

  it('paints the frame face in the frame colour on the ring', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const poster = posterSizeForAspect(600, 800);
    const outer = centredRectCm({ x: 160, y: 0.42 * 260 }, { widthCm: poster.widthCm + 4, heightCm: poster.heightCm + 4 });
    const q = projectRectCm(h, outer);
    // 1 cm inside the left edge, mid-height: on the face.
    const p = applyHomography(h, { x: outer.x + 1, y: outer.y + outer.h / 2 });
    const [r, g, b] = await rgbAt(out, p.x, p.y);
    expect(Math.max(r, g, b)).toBeLessThan(60);
    expect(q[0].x).toBeLessThan(p.x);
  });

  it('casts a shadow: the wall just right of and below the frame is darker than before', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const poster = posterSizeForAspect(600, 800);
    const outer = centredRectCm({ x: 160, y: 0.42 * 260 }, { widthCm: poster.widthCm + 4, heightCm: poster.heightCm + 4 });
    const p = applyHomography(h, { x: outer.x + outer.w + 2, y: outer.y + outer.h + 2 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(after).toBeLessThan(before - 8);
  });

  it('draws the side face outside the near (left) edge', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const poster = posterSizeForAspect(600, 800);
    const outer = centredRectCm({ x: 160, y: 0.42 * 260 }, { widthCm: poster.widthCm + 4, heightCm: poster.heightCm + 4 });
    // Strip is 3·sin25° ≈ 1.27 cm wide; probe its middle.
    const p = applyHomography(h, { x: outer.x - 0.6, y: outer.y + outer.h / 2 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(after).toBeLessThan(before - 60);
  });

  it('is byte-identical on a re-render with the same seed key, and differs with another', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const a = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const b = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const c = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-2' });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('honours an explicit poster size', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const small = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 's', posterCm: { widthCm: 30, heightCm: 40 } });
    const big = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 's', posterCm: { widthCm: 90, heightCm: 120 } });
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const p = applyHomography(h, { x: 160 - 40, y: 0.42 * 260 });
    const [, , bSmall] = await rgbAt(small, p.x, p.y);
    const [, , bBig] = await rgbAt(big, p.x, p.y);
    expect(bBig).toBeGreaterThan(150);
    expect(bSmall).toBeLessThan(150);
  });

  it('refuses a room whose pixel size differs from the scene', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    await expect(renderSceneMockup(await art(600, 800), path, { ...scene, imageSize: [RW, RH + 1] }, BLACK, { seedKey: 's' }))
      .rejects.toThrow(/imageSize/);
  });
});

describe('renderSceneMockup (straight-on room, Box path)', () => {
  it('places the poster axis-aligned with no side face', async () => {
    const { path, scene } = await makeRoom('straight', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, 320, 260, RW, RH);
    const poster = posterSizeForAspect(600, 800);
    const outer = centredRectCm({ x: 160, y: 0.42 * 260 }, { widthCm: poster.widthCm + 4, heightCm: poster.heightCm + 4 });
    const c = applyHomography(h, { x: 160, y: 0.42 * 260 });
    expect((await rgbAt(out, c.x, c.y))[2]).toBeGreaterThan(150);
    // Same row, 2 cm left of the outer edge: shadowless side → wall barely changed (no side face).
    const p = applyHomography(h, { x: outer.x - 2, y: outer.y + outer.h / 2 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(Math.abs(after - before)).toBeLessThan(12);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/render.test.ts`
Expected: FAIL — `renderSceneMockup` is not exported.

- [ ] **Step 4: Implement `renderSceneMockup`**

Replace `shadowLayer` and `renderRoomMockup` in `render.ts` with:

```ts
import { fitIntoBox } from './geometry';
import { assertUsableQuad, quadPixelBounds, type Quad } from './homography';
import {
  addGrain, applyLuminance, quadMask, readRaw, seedFromKey, shadowLayer,
  unionBounds, wallGrainAmplitude, wallLuminanceField, type Bounds,
} from './lighting';
import { buildFramedPanel } from './panel';
import type { RoomScene } from './scene';
import { posterSizeForAspect } from './sizing';
import { panelSizeForQuad, warpPanelIntoQuad } from './warp';
import {
  assertRectWithinMargin, centredRectCm, fitPosterCm, isAxisAligned, normaliseQuad,
  projectRectCm, pxPerCmAt, shadowOffsetCm, sideFaceRectCm, translateRect, wallHomography,
  type RectCm, type SizeCm,
} from './wall';

export interface SceneRenderOptions { posterCm?: SizeCm; seedKey: string }

const CAST_OPACITY = 0.42;
const CONTACT_OPACITY = 0.5;
const CONTACT_BLUR_PX = 1.5;
const SIDE_LIT = 1.06;
const SIDE_SHADED = 0.75;

/** A full-canvas RGBA layer with the panel resized into an axis-aligned box. */
async function placeFlat(panel: Buffer, panelW: number, panelH: number, quadN: Quad, W: number, H: number): Promise<Buffer> {
  const b = quadPixelBounds(quadN, W, H);
  const placed = fitIntoBox(panelW, panelH, { x: b.left / W, y: b.top / H, w: (b.right - b.left) / W, h: (b.bottom - b.top) / H }, W, H);
  const resized = await sharp(panel).resize(placed.width, placed.height).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: placed.left, top: placed.top }])
    .raw()
    .toBuffer();
}

async function solidLayer(color: [number, number, number], quadN: Quad, W: number, H: number): Promise<Buffer> {
  const [r, g, b] = color;
  const swatch = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r, g, b } } }).png().toBuffer();
  return warpPanelIntoQuad(swatch, 2, 2, quadN, W, H);
}

const scaled = (c: [number, number, number], f: number): [number, number, number] =>
  [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];

export async function renderSceneMockup(
  art: Buffer,
  roomPath: string,
  scene: RoomScene,
  frame: FrameRender,
  options: SceneRenderOptions
): Promise<Buffer> {
  const oriented = await orientBuffer(art);
  const ameta = await sharp(oriented).metadata();
  const requested = options.posterCm ?? posterSizeForAspect(ameta.width ?? 1, ameta.height ?? 1);

  const roomBuf = await orientFile(roomPath);
  const rmeta = await sharp(roomBuf).metadata();
  const W = rmeta.width ?? 0, H = rmeta.height ?? 0;
  if (W !== scene.imageSize[0] || H !== scene.imageSize[1]) {
    throw new Error(
      `Room scene "${scene.id}" declares imageSize ${scene.imageSize.join('×')} but ${scene.image} is ${W}×${H}; the quad was measured on a different image.`
    );
  }

  // Wall plane → pixels.
  const wall = { widthCm: scene.wall.widthCm, heightCm: scene.wall.heightCm };
  const h = wallHomography(scene.wall.quad, wall.widthCm, wall.heightCm, W, H);
  const { poster, outer } = fitPosterCm(requested, frame.widthCm, scene.allowable);
  const centre = { x: scene.anchor.x * wall.widthCm, y: scene.anchor.y * wall.heightCm };
  const rect = centredRectCm(centre, outer);
  assertRectWithinMargin(rect, wall, scene.allowable.minMarginCm, scene.id);

  const frontPx = projectRectCm(h, rect);
  const frontN = normaliseQuad(frontPx, W, H);
  assertUsableQuad(frontN, scene.id);

  // Stage 3: flat panel at 2× the projected extent.
  const ext = panelSizeForQuad(frontN, W, H);
  const panel = await buildFramedPanel(oriented, poster, frame, ext.width * 2, ext.height * 2, scene.light);

  // Stage 4a: front face. Box path when the projection is a rectangle.
  const front = isAxisAligned(frontPx)
    ? await placeFlat(panel.png, panel.width, panel.height, frontN, W, H)
    : await warpPanelIntoQuad(panel.png, panel.width, panel.height, frontN, W, H);

  // Stage 4b: side face, extruded on the near side.
  const sideRect = sideFaceRectCm(rect, frame.depthCm, scene.view.yawDeg, scene.view.nearSide);
  let side: Buffer | null = null;
  let sideN: Quad | null = null;
  if (sideRect) {
    sideN = normaliseQuad(projectRectCm(h, sideRect), W, H);
    assertUsableQuad(sideN, scene.id);
    const lit = scene.view.nearSide === scene.light.direction;
    side = await solidLayer(scaled(frame.color, lit ? SIDE_LIT : SIDE_SHADED), sideN, W, H);
  }

  // Stage 5.1: inherit the wall's own light.
  const room = await readRaw(roomBuf, 3);
  const bounds: Bounds = unionBounds(quadPixelBounds(frontN, W, H), sideN ? quadPixelBounds(sideN, W, H) : null);
  const field = await wallLuminanceField(room, bounds, Math.max(2, (bounds.right - bounds.left) * 0.02));
  applyLuminance(front, W, H, field, bounds, scene.light.strength);
  if (side) applyLuminance(side, W, H, field, bounds, scene.light.strength);

  // Stage 5.3 / 5.4: cast and contact shadows, offset in cm then projected.
  const pxPerCm = pxPerCmAt(h, centre);
  const shadowFor = async (kind: 'cast' | 'contact') => {
    const { dx, dy } = shadowOffsetCm(frame.depthCm, scene.light, kind);
    const rects: RectCm[] = [translateRect(rect, dx, dy)];
    if (sideRect) rects.push(translateRect(sideRect, dx, dy));
    const mask = await quadMask(rects.map((r) => normaliseQuad(projectRectCm(h, r), W, H)), W, H);
    const blur = kind === 'cast' ? Math.max(1, scene.light.softness * frame.depthCm * pxPerCm) : CONTACT_BLUR_PX;
    return shadowLayer(mask, W, H, blur, kind === 'cast' ? CAST_OPACITY : CONTACT_OPACITY);
  };
  const cast = await shadowFor('cast');
  const contact = await shadowFor('contact');

  // Stage 5.6: match grain, seeded so a re-import is byte-identical.
  addGrain(front, W, H, wallGrainAmplitude(room, bounds), seedFromKey(`${options.seedKey}:${scene.id}`));

  const raw4 = { raw: { width: W, height: H, channels: 4 as const } };
  const layers: sharp.OverlayOptions[] = [
    { input: cast, blend: 'over' },
    { input: contact, blend: 'over' },
  ];
  if (side) layers.push({ input: side, ...raw4, blend: 'over' });
  layers.push({ input: front, ...raw4, blend: 'over' });

  return sharp(roomBuf).composite(layers).jpeg({ quality: 92 }).toBuffer();
}
```

Then delete `shadowParams`, `ShadowSpec`, `ShadowPair`, `MIN_SIGMA` from `geometry.ts` and their tests from `geometry.test.ts`. Remove the `Placed`/`ShadowSpec` imports in `render.ts` that are no longer used.

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup && bunx tsc -p tsconfig.test.json --noEmit`
Expected: PASS; typecheck 0 errors. `outputs.ts` still compiles (it only uses `frameArtwork`).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/lib/room-mockup/render.ts packages/api/src/lib/room-mockup/geometry.ts packages/api/tests/lib/room-mockup/render.test.ts packages/api/tests/lib/room-mockup/geometry.test.ts packages/api/tests/lib/room-mockup/fixtures/synthetic-room.ts
git commit -m "feat(room-mockup): render a scene: warp, side face, lighting, shadows, grain"
```

---

### Task 9: CLI and driver on scenes; retire the Box template format

**Files:**
- Modify: `src/lib/room-mockup/cli-args.ts` — `DEFAULT_TEMPLATES_DIR = 'packages/api/src/database/room-templates'`; add `--poster-cm`; `selectTemplates<T extends { id: string }>`.
- Modify: `src/database/generate-room-mockups.ts` — read every `room-*.json` in the templates dir, `loadRoomScenes`, `loadFrames`, render with `renderSceneMockup`; `--frame` default `black`.
- Modify: `src/lib/room-mockup/templates.ts` — delete `roomTemplateSchema`, `RoomTemplate`, `loadTemplates`, `placementSchema`; keep `frameRenderSchema`, `FrameRender`, `loadFrames`.
- Delete: `src/database/room-templates.json`
- Create: `src/database/room-templates/.gitkeep`
- Modify: `tests/lib/room-mockup/templates.test.ts` — only `loadFrames` tests remain.
- Modify: `tests/lib/room-mockup/cli-args.test.ts` — new default, `--poster-cm`, generic select.

**Interfaces:**
- Produces: `RunOptions` gains `posterCm: string | null`; `selectTemplates<T extends { id: string }>(all: T[], only: string[] | null): T[]`.

- [ ] **Step 1: Write the failing tests** (in `cli-args.test.ts`)

```ts
it('accepts --poster-cm and passes it through unparsed', () => {
  expect(parseArgs(['bun', 'x', '--posters', './art', '--poster-cm', '60x80']).posterCm).toBe('60x80');
});
it('defaults posterCm to null', () => {
  expect(parseArgs(['bun', 'x', '--posters', './art']).posterCm).toBeNull();
});
it('the default templates dir is the checked-in scene folder', () => {
  expect(DEFAULT_TEMPLATES_DIR).toBe('packages/api/src/database/room-templates');
});
it('selectTemplates works on any {id} list', () => {
  expect(selectTemplates([{ id: 'a' }, { id: 'b' }], ['b'])).toEqual([{ id: 'b' }]);
});
```

Update any existing test in that file that asserted the old default string or built `RoomTemplate` fixtures.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/cli-args.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`cli-args.ts`: add `'--poster-cm'` to `VALUE_FLAGS`, `posterCm: values.get('--poster-cm') ?? null` in the return, the new default, and:

```ts
export function selectTemplates<T extends { id: string }>(all: T[], only: string[] | null): T[] { /* body unchanged */ }
```

Remove the `RoomTemplate` import.

`generate-room-mockups.ts` `main()`:

```ts
const framesJson = JSON.parse(readFileSync(join(dataDir, 'frame-renders.json'), 'utf-8'));
const frames = loadFrames(framesJson);
const opts = parseArgs(process.argv);
const templatesDir = opts.templates === null ? join(REPO_ROOT, DEFAULT_TEMPLATES_DIR) : opts.templates;

const sceneFiles = existsSync(templatesDir)
  ? readdirSync(templatesDir).filter((f) => /^room-.*\.json$/.test(f)).sort()
  : [];
const allScenes = loadRoomScenes(
  sceneFiles.map((f) => JSON.parse(readFileSync(join(templatesDir, f), 'utf-8'))),
  { imageExists: (file) => existsSync(join(templatesDir, file)) }
);
const scenes = selectTemplates(allScenes, opts.only);
const firstScene = scenes[0];
if (!firstScene) throw new Error('Scene selection is empty — nothing to render.');

const frameSlug = opts.frame ?? 'black';
const frame = frames[frameSlug];
if (!frame) throw new Error(`--frame "${frameSlug}" has no render spec.`);
const posterCm = opts.posterCm ? parsePosterCm(opts.posterCm) : undefined;
```

Render loop body:

```ts
for (const scene of scenes) {
  const image = await renderSceneMockup(art, join(templatesDir, scene.image), scene, frame, { posterCm, seedKey: slug });
  writeFileSync(join(dir, `room-${scene.id}.jpg`), image);
  sheet.push({ label: scene.label, file: `room-${scene.id}.jpg`, image });
}
writeFileSync(join(dir, 'framed-main.jpg'), await renderFramedMain(art, frame));
```

Update the usage comment at the top: `--templates packages/api/src/database/room-templates`, `--poster-cm 60x80`, `--frame black`.

Error message when no scenes: `loadRoomScenes` throws `No room scenes found — nothing to render.`; wrap so it says where it looked: `` `No room-*.json scenes in ${templatesDir} — see src/database/room-templates/README.md.` ``.

`templates.ts`: delete the old schema, interface and loader, and the `Box` import. `templates.test.ts`: keep only the `loadFrames` describe.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup && bunx tsc --noEmit && bunx tsc -p tsconfig.test.json --noEmit`
Expected: PASS; both typechecks 0 errors.

Then a dry run:

```bash
cd packages/api && bun run mockups:rooms --posters ../../drive-download-20260831T155139Z-1-001 --dry-run
```
Expected: exits 1 with `No room-*.json scenes in .../room-templates — see src/database/room-templates/README.md.` (the folder is empty until Task 11 authors a scene).

- [ ] **Step 5: Commit**

```bash
git add -A packages/api/src/lib/room-mockup/cli-args.ts packages/api/src/lib/room-mockup/templates.ts packages/api/src/database/generate-room-mockups.ts packages/api/src/database/room-templates.json packages/api/src/database/room-templates/.gitkeep packages/api/tests/lib/room-mockup/cli-args.test.ts packages/api/tests/lib/room-mockup/templates.test.ts
git commit -m "feat(room-mockup): drive mockups:rooms from room scenes; retire Box templates"
```

---

### Task 10: Stage-1 prompt, generation script, authoring README, doc fixes

**Files:**
- Create: `src/lib/room-mockup/prompt.ts` — `roomPrompt(yawDeg: number): { prompt: string; negative: string }`
- Test: `tests/lib/room-mockup/prompt.test.ts`
- Create: `src/database/generate-room-images.ts` — six rooms through Gemini (`GOOGLE_AI_STUDIO_KEY`), writes `room-<id>.png` + `room-<id>.prompt.txt` into the templates dir; refuses loudly without a key.
- Create: `src/database/room-templates/README.md`, `src/database/room-templates/PROMPT.md`
- Modify: `docs/ROOM-MOCKUP-PIPELINE.md` — status line, fix the `nearSide` typo in the example, add a "How to run" block.
- Modify: `docs/runbooks/room-mockup-generator.html` — one banner paragraph at the top pointing at the new pipeline (the body describes the retired Box format).
- Modify: `package.json` — `"mockups:generate-rooms": "bun run src/database/generate-room-images.ts"`

**Interfaces:**
- Produces: `roomPrompt(yawDeg)`; the six default room specs `DEFAULT_ROOMS: Array<{ id: string; yawDeg: number; variant: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/room-mockup/prompt.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_ROOMS, roomPrompt } from '../../../src/lib/room-mockup/prompt';

describe('roomPrompt', () => {
  it('always carries the load-bearing clauses', () => {
    for (const yaw of [-25, 0, 25]) {
      const { prompt, negative } = roomPrompt(yaw);
      expect(prompt).toMatch(/completely bare, flat wall/);
      expect(prompt).toMatch(/no hard shadows/);
      expect(prompt).toMatch(/f\/8/);
      expect(negative).toMatch(/frame/);
      expect(negative).toMatch(/hard shadow/);
    }
  });
  it('states the angle and side from the yaw', () => {
    expect(roomPrompt(-25).prompt).toMatch(/25 degrees off-axis to the left/);
    expect(roomPrompt(30).prompt).toMatch(/30 degrees off-axis to the right/);
    expect(roomPrompt(0).prompt).toMatch(/straight on/);
  });
  it('defines six rooms: two straight, two left, two right', () => {
    expect(DEFAULT_ROOMS).toHaveLength(6);
    expect(DEFAULT_ROOMS.filter((r) => r.yawDeg === 0)).toHaveLength(2);
    expect(DEFAULT_ROOMS.filter((r) => r.yawDeg < 0)).toHaveLength(2);
    expect(new Set(DEFAULT_ROOMS.map((r) => r.id)).size).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/room-mockup/prompt.ts
/** Stage 1 prompt. The room only: a bare wall, flat light, deep focus. */

export const DEFAULT_ROOMS: ReadonlyArray<{ id: string; yawDeg: number; variant: string }> = [
  { id: 'room-01', yawDeg: 0, variant: 'a linen sofa and a small side table' },
  { id: 'room-02', yawDeg: 0, variant: 'a low oak sideboard with a single ceramic vase' },
  { id: 'room-03', yawDeg: -25, variant: 'a linen sofa and a small side table' },
  { id: 'room-04', yawDeg: -30, variant: 'a bed with white linen, headboard against the wall' },
  { id: 'room-05', yawDeg: 25, variant: 'a low oak sideboard with a single ceramic vase' },
  { id: 'room-06', yawDeg: 30, variant: 'a reading chair and a floor lamp turned off' },
];

export function roomPrompt(yawDeg: number, variant = DEFAULT_ROOMS[0]!.variant): { prompt: string; negative: string } {
  const angle =
    yawDeg === 0
      ? 'The wall is seen straight on, its edges parallel to the picture edges.'
      : `The wall is seen from a three-quarter angle, about ${Math.abs(yawDeg)} degrees off-axis to the ${yawDeg < 0 ? 'left' : 'right'}, so its horizontal edges converge gently.`;
  const prompt =
    `Photorealistic interior photograph of a modern living room. A large, completely bare, flat wall of warm-white plaster fills most of the frame — nothing hanging on it, no shelves, no switches, no sconces, no texture beyond plaster. ${angle} Ceiling line and skirting board both visible. Low furniture only along the bottom edge: ${variant}. Soft, even, overcast daylight with no hard shadows and no visible light source. Muted neutral palette. Shot on 50mm, f/8, deep focus, high detail.`;
  const negative =
    'picture, frame, poster, artwork, painting, shelf, sconce, lamp on wall, switch, wallpaper pattern, hard shadow, sunbeam, glare, shallow depth of field, fisheye, wide angle distortion, clutter, people';
  return { prompt, negative };
}
```

`generate-room-images.ts` (source-only tool, same guards as the mockup driver):

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROOMS, roomPrompt } from '../lib/room-mockup/prompt';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'room-templates');
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

async function generate(prompt: string, negative: string, key: string): Promise<Buffer> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\nDo not include: ${negative}.` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string } }> } }> };
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('Gemini returned no image part.');
  return Buffer.from(b64, 'base64');
}

async function main(): Promise<void> {
  const key = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!key) throw new Error('GOOGLE_AI_STUDIO_KEY is not set. Add a billed Google AI Studio key to .env, or generate the six rooms with another licensed tool using room-templates/PROMPT.md.');
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1]?.split(',') : null;
  mkdirSync(OUT, { recursive: true });
  for (const room of DEFAULT_ROOMS) {
    if (only && !only.includes(room.id)) continue;
    const target = join(OUT, `${room.id}.png`);
    if (existsSync(target) && !process.argv.includes('--force')) { console.log(`  ${room.id}: exists, skipped (--force to redo)`); continue; }
    const { prompt, negative } = roomPrompt(room.yawDeg, room.variant);
    const png = await generate(prompt, negative, key);
    writeFileSync(target, png);
    writeFileSync(join(OUT, `${room.id}.prompt.txt`), `${prompt}\n\nNEGATIVE: ${negative}\nMODEL: ${MODEL}\n`);
    console.log(`  ${room.id}: ${png.length} bytes`);
  }
  console.log(`\nNow measure each room with packages/api/tools/room-measure.html and save room-<id>.json next to it.`);
}

if (import.meta.main) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
```

`README.md` (in `room-templates/`): what goes here (`room-<id>.png` ≥ 2048 long edge, `room-<id>.json`, `room-<id>.prompt.txt`), the three steps (generate → measure with `tools/room-measure.html` → run `bun run mockups:rooms`), the JSON field reference copied from the spec with the corrected `nearSide`, and the four fatal validations.

`PROMPT.md`: the prompt and negative from `prompt.ts`, verbatim, plus the seven requirements table from the spec.

`docs/ROOM-MOCKUP-PIPELINE.md`: change the status line to `implemented 2026-09-03 (stages 2–5 in code; stage 1 needs a generator key)`, fix `"nearSide": "right"` → `"left"` in the example, and add under Pipeline:

````markdown
## How to run

```bash
# 1. Rooms (once). Needs GOOGLE_AI_STUDIO_KEY in .env, or use PROMPT.md with any licensed generator.
bun run --cwd packages/api mockups:generate-rooms

# 2. Measure each room: open packages/api/tools/room-measure.html, load room-<id>.png,
#    click tl, tr, br, bl, fill the fields, download room-<id>.json next to the png.

# 3. Render
bun run --cwd packages/api mockups:rooms --posters <dir> [--frame black] [--poster-cm 60x80] [--only room-03]
```
````

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/prompt.test.ts && bunx tsc --noEmit && bun run mockups:generate-rooms`
Expected: tests PASS; typecheck 0; the script exits 1 with `GOOGLE_AI_STUDIO_KEY is not set …` (no key on this box).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/prompt.ts packages/api/tests/lib/room-mockup/prompt.test.ts packages/api/src/database/generate-room-images.ts packages/api/src/database/room-templates/README.md packages/api/src/database/room-templates/PROMPT.md packages/api/package.json docs/ROOM-MOCKUP-PIPELINE.md docs/runbooks/room-mockup-generator.html
git commit -m "feat(room-mockup): stage-1 room prompt and generator, authoring README"
```

---

### Task 11: Click-to-measure tool (`tools/room-measure.html`)

Single self-contained HTML file, vanilla JS, no build. Can be dispatched to a subagent in parallel with Tasks 1–10; its only contract is the JSON it writes, which is `roomSceneSchema` from Task 2.

**Files:**
- Create: `packages/api/tools/room-measure.html`

**Behaviour:**
1. `<input type="file">` loads a PNG/JPG onto a `<canvas>` scaled to fit the window (keep the natural size for output).
2. Click four times in order tl, tr, br, bl to place corners; after four, clicking near a corner (≤ 12 px) and dragging moves it. Corners are stored normalised (0–1).
3. Side panel fields, with the spec's defaults: `id` (`room-01`), `widthCm` 320, `heightCm` 260, `anchor.x` 0.5, `anchor.y` 0.42, `maxWidthCm` 120, `maxHeightCm` 150, `minMarginCm` 25, `yawDeg` −25, `light.direction` select, `elevationDeg` 35, `softness` 0.6, `strength` 0.45, `label`.
4. Overlay, redrawn on every change: the quad (green), a 10 cm grid in wall space projected through the homography (thin white, 50% alpha), the anchor as a cross, the allowable box (dashed orange) centred on the anchor, the margin inset (dashed grey).
5. Live checks shown as text: winding (must be clockwise on screen tl→tr→br→bl), yaw sign vs. edge lengths (same rule as `scene.ts`), anchor ± allowable inside margins, projected width of the max poster in pixels vs 900.
6. "Copy JSON" and "Download room-<id>.json". Output shape exactly:

```json
{ "id": "...", "image": "<loaded filename>", "imageSize": [w, h],
  "wall": { "quad": { "tl": [x,y], "tr": [x,y], "br": [x,y], "bl": [x,y] }, "widthCm": 320, "heightCm": 260 },
  "anchor": { "x": 0.5, "y": 0.42 },
  "allowable": { "maxWidthCm": 120, "maxHeightCm": 150, "minMarginCm": 25 },
  "view": { "yawDeg": -25, "nearSide": "left" },
  "light": { "direction": "left", "elevationDeg": 35, "softness": 0.6, "strength": 0.45 },
  "label": "..." }
```
   Coordinates rounded to 4 decimals. `nearSide` derived from the yaw sign (`left` for negative, `right` for positive, `none` for 0).
7. "Load JSON" reads an existing file back into the fields and corners.
8. Homography in JS: the same 8×8 Gaussian elimination with partial pivoting as `homography.ts` (port it; ~40 lines).

- [ ] **Step 1: Write the file** per the behaviour above. Keep it under ~450 lines; no external resources.
- [ ] **Step 2: Syntax check the script**

```bash
cd packages/api && node -e "const s=require('fs').readFileSync('tools/room-measure.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Smoke test in a browser** — open the file, load the synthetic room written by `tests/lib/room-mockup/fixtures/synthetic-room.ts` (or any image), click four corners, confirm the grid lies on the quad and the JSON downloads. Then run the downloaded JSON through `loadRoomScene` in a one-off `bun -e` to prove the contract.

- [ ] **Step 4: Commit**

```bash
git add packages/api/tools/room-measure.html
git commit -m "feat(room-mockup): click-to-measure tool that writes room scenes"
```

---

### Task 12: End-to-end proof on real posters

Not a code task. Proves the pipeline against the real catalogue with a synthetic 2048 px room, since no generated rooms exist yet.

- [ ] **Step 1:** Write `synthetic-angled.png` (2048×1536) and its `room-synthetic-angled.json` into a scratch templates dir using the fixture code (`bun -e` importing `makeRoom`, or a 20-line script in the scratchpad).
- [ ] **Step 2:** Run:

```bash
cd packages/api && bun run mockups:rooms --posters <scratch dir with 3 posters: portrait, square, panoramic from drive-download> --templates <scratch templates dir> --out <scratch out>
```
- [ ] **Step 3:** Open `<scratch out>/<slug>/contact-sheet.jpg` and one `room-synthetic-angled.jpg` and look: art crisp, frame face and side face visible on the left edge, shadow falling right/down, no seam. Record what was seen in the tracker comment.

---

## Self-review

**Spec coverage:** Stage 1 → Task 10 (prompt + generator; images need a key — stated). Stage 2 → Tasks 2 (schema, four validations) and 11 (tool). Stage 3 → Task 6 (+ Task 3 for sizing, Task 1 for cm→px). Stage 4a → Task 8 (`warpPanelIntoQuad` / `fitIntoBox` branch). Stage 4b → Tasks 1 + 8. Stage 5 steps 1–7 → Tasks 7 + 8 (face gradient lives in Task 6, applied in panel space; noted). Work items 7 and 8 → Tasks 4 and 8. Out-of-scope items untouched.

**Type consistency:** `SizeCm`/`RectCm`/`NearSide` defined once in `wall.ts` and imported everywhere. `RoomScene.view.nearSide` is `NearSide` (includes `'none'`), matched by `sideFaceRectCm`. `FrameRender.widthCm/depthCm` added in Task 5 before Tasks 6 and 8 use them. `loadRoomScene` options object is the same shape in Tasks 2, 8's fixture and 9.

**Known approximations (from the spec, kept):** side face is a wall-plane strip, not a true perpendicular plane; shadow offset is first-order; the bevel is opaque in the panel path.
