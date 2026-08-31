# Room Mockup Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline CLI that composites a poster into blank-wall room templates at declared rectangles, producing candidate room mockups plus a contact sheet for human review.

**Architecture:** Pure geometry and validation live in `packages/api/src/lib/room-mockup/` where they are unit-testable with no I/O. Sharp-backed rendering sits on top of them. A thin CLI in `packages/api/src/database/` wires it together, reads files, writes files, and exits. Nothing touches the database, R2, or the network.

**Tech Stack:** TypeScript (strict), Sharp 0.34 (already a dependency), Zod (already a dependency), Vitest, Bun as the runner.

**Spec:** `docs/superpowers/specs/2026-08-31-room-mockup-generator-design.md`

## Global Constraints

- **No new dependencies.** Sharp and Zod only. If a step seems to need a new package, it is the wrong step.
- **`placement` is a bounding box, never a stretch target.** The poster is fitted inside preserving its own aspect ratio and centred. Distorting a poster to fill a rect misrepresents the product.
- **Straight-on rooms only.** No perspective, no affine warp.
- **No database, no R2, no network.** The tool reads local files and writes local files.
- **No image diffing in CI.** Pixel comparison across Sharp/libvips versions is flaky. Assert on dimensions, channel counts, and sampled pixel values only.
- **Output filenames feed #672.** Room files are `room-<template-id>.jpg`; the main file is `framed-main.jpg`. These land verbatim in the bulk-import manifest's `mainImage` / `roomImages` columns.
- **Tests are typechecked** in this package (`packages/api/tsconfig.test.json`). Import `describe`/`it`/`expect` from `'vitest'` explicitly — ambient types are deliberately disabled.
- **Named exports.** No default exports.
- Test files live in `packages/api/tests/lib/room-mockup/`. Do **not** put them under `tests/database/` — that tree is gated behind a destructive-database guard and these tests need no database.

---

### Task 1: Geometry

Pure arithmetic, no I/O, no Sharp. This is the task that encodes the bounding-box rule, so it is where that rule gets its test.

**Files:**
- Create: `packages/api/src/lib/room-mockup/geometry.ts`
- Test: `packages/api/tests/lib/room-mockup/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Box { x: number; y: number; w: number; h: number }` — normalised 0..1
  - `interface Placed { left: number; top: number; width: number; height: number }` — integer pixels
  - `fitIntoBox(artW: number, artH: number, box: Box, canvasW: number, canvasH: number): Placed`
  - `interface ShadowSpec { blurSigma: number; opacity: number; offsetX: number; offsetY: number }`
  - `interface ShadowPair { contact: ShadowSpec; ambient: ShadowSpec }`
  - `shadowParams(shortEdge: number, depthRatio: number, light: 'left' | 'right'): ShadowPair`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/lib/room-mockup/geometry.test.ts`:

```typescript
/**
 * Room mockup geometry.
 *
 * Two pure functions carry the design decisions that matter most:
 *
 *   fitIntoBox   — a template's placement rect is a BOUNDING BOX, not a
 *                  stretch target. A poster keeps its own aspect ratio and is
 *                  centred in the box. Stretching would misrepresent the
 *                  product, which is worse than an empty margin.
 *
 *   shadowParams — a single shadow always reads as a sticker pasted onto a
 *                  photo. A tight dark contact shadow plus a wide faint
 *                  ambient one reads as an object with thickness.
 */

import { describe, it, expect } from 'vitest';
import { fitIntoBox, shadowParams } from '../../../src/lib/room-mockup/geometry';

const FULL = { x: 0, y: 0, w: 1, h: 1 };

describe('fitIntoBox', () => {
  it('preserves a portrait aspect ratio and centres horizontally', () => {
    const placed = fitIntoBox(500, 1000, FULL, 1000, 1000);

    expect(placed.width).toBe(500);
    expect(placed.height).toBe(1000);
    expect(placed.left).toBe(250);
    expect(placed.top).toBe(0);
  });

  it('preserves a landscape aspect ratio and centres vertically', () => {
    const placed = fitIntoBox(1000, 500, FULL, 1000, 1000);

    expect(placed.width).toBe(1000);
    expect(placed.height).toBe(500);
    expect(placed.left).toBe(0);
    expect(placed.top).toBe(250);
  });

  it('scales up to fill a small box and offsets by the box origin', () => {
    const placed = fitIntoBox(100, 100, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1000, 1000);

    expect(placed).toEqual({ left: 250, top: 250, width: 500, height: 500 });
  });

  it('bounds by width when the art is wider than the box', () => {
    const placed = fitIntoBox(2000, 1000, { x: 0, y: 0, w: 0.5, h: 1 }, 1000, 1000);

    expect(placed.width).toBe(500);
    expect(placed.height).toBe(250);
    expect(placed.top).toBe(375);
  });

  it('bounds by height when the art is taller than the box', () => {
    const placed = fitIntoBox(1000, 2000, { x: 0, y: 0, w: 1, h: 0.5 }, 1000, 1000);

    expect(placed.width).toBe(250);
    expect(placed.height).toBe(500);
    expect(placed.left).toBe(375);
  });

  it('never distorts: output aspect matches input aspect', () => {
    const placed = fitIntoBox(1234, 789, { x: 0.1, y: 0.1, w: 0.7, h: 0.6 }, 1600, 1600);

    expect(placed.width / placed.height).toBeCloseTo(1234 / 789, 2);
  });

  it('returns whole pixels', () => {
    const placed = fitIntoBox(333, 777, { x: 0.137, y: 0.211, w: 0.409, h: 0.633 }, 1601, 1601);

    for (const v of [placed.left, placed.top, placed.width, placed.height]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('shadowParams', () => {
  it('throws the shadow right when the light comes from the left', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'left');

    expect(contact.offsetX).toBeGreaterThan(0);
    expect(ambient.offsetX).toBeGreaterThan(0);
  });

  it('throws the shadow left when the light comes from the right', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'right');

    expect(contact.offsetX).toBeLessThan(0);
    expect(ambient.offsetX).toBeLessThan(0);
  });

  it('always drops the shadow downward, whichever way the light falls', () => {
    expect(shadowParams(1000, 0.024, 'left').contact.offsetY).toBeGreaterThan(0);
    expect(shadowParams(1000, 0.024, 'right').contact.offsetY).toBeGreaterThan(0);
  });

  it('makes the ambient shadow wider and fainter than the contact shadow', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'left');

    expect(ambient.blurSigma).toBeGreaterThan(contact.blurSigma);
    expect(ambient.opacity).toBeLessThan(contact.opacity);
  });

  it('scales blur and offset linearly with depth', () => {
    const thin = shadowParams(1000, 0.02, 'left');
    const thick = shadowParams(1000, 0.04, 'left');

    expect(thick.contact.blurSigma).toBeCloseTo(thin.contact.blurSigma * 2, 5);
    expect(thick.ambient.offsetY).toBeCloseTo(thin.ambient.offsetY * 2, 5);
  });

  it('does not change opacity with depth — depth is a size cue, not a darkness cue', () => {
    expect(shadowParams(1000, 0.02, 'left').contact.opacity).toBe(
      shadowParams(1000, 0.06, 'left').contact.opacity
    );
  });

  it('keeps blur above the floor sharp requires, even for a hairline frame', () => {
    expect(shadowParams(10, 0.001, 'left').contact.blurSigma).toBeGreaterThanOrEqual(0.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/geometry.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/lib/room-mockup/geometry"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/api/src/lib/room-mockup/geometry.ts`:

```typescript
/**
 * Room mockup geometry.
 *
 * Pure arithmetic, deliberately free of sharp and of the filesystem, so the
 * two rules that decide whether a mockup looks real can be tested directly.
 */

/** A rectangle normalised 0..1 against an image's own dimensions. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle in whole pixels, ready to hand to sharp's composite(). */
export interface Placed {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Fit artwork inside a template's placement rectangle.
 *
 * The rect is a BOUNDING BOX, not a stretch target: the artwork keeps its own
 * aspect ratio and is centred in the box. A portrait poster and a landscape
 * poster therefore both land correctly in the same room, one leaving margin at
 * the sides and the other at the top and bottom.
 *
 * Centring rather than top-anchoring matches how art is actually hung — on a
 * centre line, not from a corner.
 */
export function fitIntoBox(
  artW: number,
  artH: number,
  box: Box,
  canvasW: number,
  canvasH: number
): Placed {
  const boxW = box.w * canvasW;
  const boxH = box.h * canvasH;

  const scale = Math.min(boxW / artW, boxH / artH);
  const width = Math.round(artW * scale);
  const height = Math.round(artH * scale);

  return {
    width,
    height,
    left: Math.round(box.x * canvasW + (boxW - width) / 2),
    top: Math.round(box.y * canvasH + (boxH - height) / 2),
  };
}

/** One blurred, offset, semi-transparent black layer. */
export interface ShadowSpec {
  blurSigma: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface ShadowPair {
  contact: ShadowSpec;
  ambient: ShadowSpec;
}

/**
 * sharp's blur() rejects a sigma below roughly 0.3; clamp above it so a very
 * small render cannot produce an invalid parameter.
 */
const MIN_SIGMA = 0.4;

/**
 * Derive the two-shadow pair that makes a flat composite read as an object
 * standing off a wall.
 *
 * One shadow is never enough — it reads as a sticker. Two do the work:
 *
 *   contact — tight, dark, barely offset. The edge meeting the wall.
 *   ambient — wide, faint, offset further. The body of the object.
 *
 * Opacity is fixed and only geometry scales with depth. A thicker frame casts
 * a LARGER shadow, not a darker one; darkening with depth reads as a change in
 * the room's lighting instead of a change in the object.
 */
export function shadowParams(
  shortEdge: number,
  depthRatio: number,
  light: 'left' | 'right'
): ShadowPair {
  const depth = shortEdge * depthRatio;
  const dir = light === 'left' ? 1 : -1;

  return {
    contact: {
      blurSigma: Math.max(MIN_SIGMA, depth * 0.35),
      opacity: 0.55,
      offsetX: dir * depth * 0.18,
      offsetY: depth * 0.22,
    },
    ambient: {
      blurSigma: Math.max(MIN_SIGMA, depth * 1.9),
      opacity: 0.3,
      offsetX: dir * depth * 0.9,
      offsetY: depth * 1.1,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/geometry.test.ts`
Expected: PASS — 15 tests

Note: the `scales blur and offset linearly with depth` test uses `shortEdge: 1000` and depths of 0.02/0.04, so both sigmas are far above `MIN_SIGMA` and the clamp does not interfere.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/geometry.ts packages/api/tests/lib/room-mockup/geometry.test.ts
git commit -m "feat(api): room mockup geometry — aspect-preserving fit and two-layer shadow"
```

---

### Task 2: Template and frame-render validation

The template JSON is hand-edited, so every failure mode here is a human typo. Each one must produce an error that names the offending template, not a silent fallback that renders a wrong image.

**Files:**
- Create: `packages/api/src/lib/room-mockup/templates.ts`
- Test: `packages/api/tests/lib/room-mockup/templates.test.ts`

**Interfaces:**
- Consumes: `Box` from `geometry.ts`.
- Produces:
  - `roomTemplateSchema`, `frameRenderSchema` (Zod schemas)
  - `interface RoomTemplate { id: string; file: string; placement: Box; light: 'left' | 'right'; frame: string; label: string }`
  - `interface FrameRender { widthRatio: number; color: [number, number, number]; depthRatio: number }`
  - `loadTemplates(rawTemplates: unknown, rawFrames: unknown, fileExists: (file: string) => boolean): { templates: RoomTemplate[]; frames: Record<string, FrameRender> }`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/lib/room-mockup/templates.test.ts`:

```typescript
/**
 * Room template validation.
 *
 * The template file is measured and typed by a human, so every error here is a
 * typo. The requirement is that each one FAILS LOUDLY and names the offending
 * template id. A silent fallback would render a wrong image that looks
 * plausible, which is the expensive failure.
 */

import { describe, it, expect } from 'vitest';
import { loadTemplates } from '../../../src/lib/room-mockup/templates';

const FRAMES = {
  oak: { widthRatio: 0.032, color: [178, 141, 94], depthRatio: 0.024 },
  frameless: { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03 },
};

const template = (over: Record<string, unknown> = {}) => ({
  id: 'living-room-warm',
  file: 'living-room-warm.jpg',
  placement: { x: 0.286, y: 0.047, w: 0.483, h: 0.622 },
  light: 'left',
  frame: 'oak',
  label: 'Living room',
  ...over,
});

const allExist = () => true;

describe('loadTemplates', () => {
  it('accepts a well-formed template set', () => {
    const { templates, frames } = loadTemplates([template()], FRAMES, allExist);

    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('living-room-warm');
    expect(templates[0].placement.w).toBe(0.483);
    expect(frames.oak.depthRatio).toBe(0.024);
  });

  it('rejects a placement outside 0..1, naming the template', () => {
    expect(() => loadTemplates([template({ placement: { x: -0.1, y: 0, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a placement that runs off the right edge', () => {
    expect(() => loadTemplates([template({ placement: { x: 0.7, y: 0, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a placement that runs off the bottom edge', () => {
    expect(() => loadTemplates([template({ placement: { x: 0, y: 0.7, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a zero-width placement', () => {
    expect(() => loadTemplates([template({ placement: { x: 0, y: 0, w: 0, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects an unknown light direction', () => {
    expect(() => loadTemplates([template({ light: 'above' })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a frame slug with no render spec, naming both the template and the slug', () => {
    expect(() => loadTemplates([template({ frame: 'walnut' })], FRAMES, allExist))
      .toThrow(/living-room-warm.*walnut|walnut.*living-room-warm/);
  });

  it('rejects a template whose image file is missing, naming the file', () => {
    expect(() => loadTemplates([template()], FRAMES, () => false))
      .toThrow(/living-room-warm\.jpg/);
  });

  it('rejects duplicate template ids', () => {
    expect(() => loadTemplates([template(), template()], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects an empty template set rather than rendering nothing silently', () => {
    expect(() => loadTemplates([], FRAMES, allExist)).toThrow(/no room templates/i);
  });

  it('accepts a frameless spec with widthRatio 0', () => {
    const { templates } = loadTemplates([template({ frame: 'frameless' })], FRAMES, allExist);

    expect(templates[0].frame).toBe('frameless');
  });

  it('rejects a frame render whose colour channel is out of range', () => {
    const bad = { oak: { widthRatio: 0.03, color: [300, 0, 0], depthRatio: 0.02 } };

    expect(() => loadTemplates([template()], bad, allExist)).toThrow(/oak/);
  });

  it('rejects a frame render with zero depth — every hung object stands off the wall', () => {
    const bad = { oak: { widthRatio: 0.03, color: [1, 2, 3], depthRatio: 0 } };

    expect(() => loadTemplates([template()], bad, allExist)).toThrow(/oak/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/templates.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/lib/room-mockup/templates"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/api/src/lib/room-mockup/templates.ts`:

```typescript
/**
 * Room template and frame-render validation.
 *
 * These two JSON files are hand-authored: someone measures a rectangle off a
 * screenshot and types four numbers. Every plausible mistake therefore has to
 * fail loudly and name the template it came from. A silent clamp or fallback
 * would still produce an image, and a wrong image that looks fine is far more
 * expensive than a run that refuses to start.
 */

import { z } from 'zod';
import type { Box } from './geometry';

const unit = z.number().min(0).max(1);

const placementSchema = z
  .object({
    x: unit,
    y: unit,
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((p) => p.x + p.w <= 1 && p.y + p.h <= 1, {
    message: 'placement must lie entirely inside the image',
  });

export const roomTemplateSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  placement: placementSchema,
  light: z.enum(['left', 'right']),
  frame: z.string().min(1),
  label: z.string().min(1),
});

export interface RoomTemplate {
  id: string;
  file: string;
  placement: Box;
  light: 'left' | 'right';
  frame: string;
  label: string;
}

export const frameRenderSchema = z.object({
  /** Frame face width as a fraction of the art's short edge. 0 = frameless. */
  widthRatio: z.number().min(0).max(0.5),
  color: z.tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
  ]),
  /**
   * How far the piece stands off the wall, same units as widthRatio. Mirrors
   * frames.thickness (inches) from the catalogue, restated as a ratio because
   * this tool is offline and the render needs a value relative to the image.
   *
   * Must be greater than zero: a frameless canvas has no face, so its shadow
   * is the ONLY cue for depth, and a zero here would flatten it completely.
   */
  depthRatio: z.number().gt(0).max(0.2),
});

export interface FrameRender {
  widthRatio: number;
  color: [number, number, number];
  depthRatio: number;
}

export function loadTemplates(
  rawTemplates: unknown,
  rawFrames: unknown,
  fileExists: (file: string) => boolean
): { templates: RoomTemplate[]; frames: Record<string, FrameRender> } {
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

  const list = z.array(z.unknown()).parse(rawTemplates);
  if (list.length === 0) {
    throw new Error('No room templates defined — nothing to render.');
  }

  const templates: RoomTemplate[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of list.entries()) {
    const parsed = roomTemplateSchema.safeParse(entry);
    if (!parsed.success) {
      // The id may itself be the invalid field, so fall back to the index.
      const id =
        typeof entry === 'object' && entry !== null && 'id' in entry
          ? String((entry as { id: unknown }).id)
          : `#${index}`;
      throw new Error(
        `Room template "${id}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }

    const t = parsed.data as RoomTemplate;

    if (seen.has(t.id)) {
      throw new Error(`Room template "${t.id}" is declared more than once.`);
    }
    seen.add(t.id);

    if (!(t.frame in frames)) {
      throw new Error(
        `Room template "${t.id}" names frame "${t.frame}", which has no render spec.`
      );
    }

    if (!fileExists(t.file)) {
      throw new Error(`Room template "${t.id}" references a missing image: ${t.file}`);
    }

    templates.push(t);
  }

  return { templates, frames };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/templates.test.ts`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/templates.ts packages/api/tests/lib/room-mockup/templates.test.ts
git commit -m "feat(api): validate room templates and frame render specs"
```

---

### Task 3: Renderer

The Sharp layer. Two implementation traps are already known from the spike and are documented inline so the next reader does not rediscover them.

**Files:**
- Create: `packages/api/src/lib/room-mockup/render.ts`
- Test: `packages/api/tests/lib/room-mockup/render.test.ts`

**Interfaces:**
- Consumes: `Placed`, `ShadowSpec`, `fitIntoBox`, `shadowParams` from `geometry.ts`; `RoomTemplate`, `FrameRender` from `templates.ts`.
- Produces:
  - `frameArtwork(art: Buffer, frame: FrameRender): Promise<Buffer>`
  - `shadowLayer(canvasW: number, canvasH: number, rect: Placed, shadow: ShadowSpec): Promise<Buffer>`
  - `renderRoomMockup(art: Buffer, roomPath: string, template: RoomTemplate, frame: FrameRender): Promise<Buffer>`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/lib/room-mockup/render.test.ts`:

```typescript
/**
 * Room mockup rendering.
 *
 * Deliberately NOT pixel-diffed. Comparing rendered images across sharp and
 * libvips versions is flaky and slow, and it would gate the build on a
 * judgement no assertion can make. These tests check structure — dimensions,
 * channels, and a handful of sampled pixels — and the visual judgement is a
 * human looking at the contact sheet.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { frameArtwork, shadowLayer, renderRoomMockup } from '../../../src/lib/room-mockup/render';
import type { FrameRender, RoomTemplate } from '../../../src/lib/room-mockup/templates';

const OAK: FrameRender = { widthRatio: 0.05, color: [178, 141, 94], depthRatio: 0.024 };
const FRAMELESS: FrameRender = { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03 };

/** Solid-colour artwork, clearly distinct from any frame colour. */
const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

const roomFile = async (w: number, h: number): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), 'room-mockup-'));
  const path = join(dir, 'room.jpg');
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 230, g: 226, b: 218 } } })
    .jpeg()
    .toFile(path);
  return path;
};

const TEMPLATE: RoomTemplate = {
  id: 'test-room',
  file: 'room.jpg',
  placement: { x: 0.2, y: 0.1, w: 0.6, h: 0.6 },
  light: 'left',
  frame: 'oak',
  label: 'Test room',
};

describe('frameArtwork', () => {
  it('returns the artwork untouched when the frame is frameless', async () => {
    const source = await art(400, 600);

    const framed = await frameArtwork(source, FRAMELESS);

    expect(framed.equals(source)).toBe(true);
  });

  it('grows the artwork symmetrically on all four sides', async () => {
    const framed = await frameArtwork(await art(400, 600), OAK);
    const meta = await sharp(framed).metadata();

    // face = round(400 * 0.05) = 20; bevel = round(20 * 0.12) = 2. Both sides.
    expect(meta.width).toBe(400 + 2 * (20 + 2));
    expect(meta.height).toBe(600 + 2 * (20 + 2));
  });

  it('sizes the frame face off the short edge, so a panoramic poster is not over-framed', async () => {
    const wide = await sharp(await frameArtwork(await art(2000, 400), OAK)).metadata();

    // Short edge is 400, so face = 20 — not 100.
    expect(wide.width).toBe(2000 + 2 * (20 + 2));
  });

  it('paints the outer border in the frame colour', async () => {
    const framed = await frameArtwork(await art(400, 600), OAK);
    const { data } = await sharp(framed).raw().toBuffer({ resolveWithObject: true });

    // Top-left corner pixel is frame face.
    expect([data[0], data[1], data[2]]).toEqual([178, 141, 94]);
  });
});

describe('shadowLayer', () => {
  it('produces a canvas-sized RGBA layer', async () => {
    const layer = await shadowLayer(
      800, 600,
      { left: 100, top: 100, width: 200, height: 200 },
      { blurSigma: 5, opacity: 0.5, offsetX: 10, offsetY: 10 }
    );
    const meta = await sharp(layer).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    expect(meta.channels).toBe(4);
  });

  it('is transparent far from the shape and opaque at its centre', async () => {
    const layer = await shadowLayer(
      400, 400,
      { left: 150, top: 150, width: 100, height: 100 },
      { blurSigma: 2, opacity: 1, offsetX: 0, offsetY: 0 }
    );
    const { data, info } = await sharp(layer).raw().toBuffer({ resolveWithObject: true });

    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];

    expect(alphaAt(5, 5)).toBeLessThan(10);
    expect(alphaAt(200, 200)).toBeGreaterThan(200);
  });

  it('honours opacity', async () => {
    const rect = { left: 150, top: 150, width: 100, height: 100 };
    const read = async (opacity: number) => {
      const layer = await shadowLayer(400, 400, rect, { blurSigma: 2, opacity, offsetX: 0, offsetY: 0 });
      const { data, info } = await sharp(layer).raw().toBuffer({ resolveWithObject: true });
      return data[(200 * info.width + 200) * info.channels + 3];
    };

    expect(await read(0.5)).toBeLessThan(await read(1));
  });
});

describe('renderRoomMockup', () => {
  it('returns a JPEG at the room template dimensions', async () => {
    const room = await roomFile(1200, 1200);

    const out = await renderRoomMockup(await art(500, 800), room, TEMPLATE, OAK);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1200);
  });

  it('leaves the room untouched outside the placement region', async () => {
    const room = await roomFile(1200, 1200);

    const out = await renderRoomMockup(await art(500, 800), room, TEMPLATE, OAK);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // Bottom-left corner is far from placement {x:0.2,y:0.1,w:0.6,h:0.6}.
    const i = ((info.height - 5) * info.width + 5) * info.channels;
    expect(data[i]).toBeGreaterThan(200);
  });

  it('renders a frameless piece without throwing', async () => {
    const room = await roomFile(1000, 1000);

    const out = await renderRoomMockup(
      await art(600, 600), room, { ...TEMPLATE, frame: 'frameless' }, FRAMELESS
    );

    expect((await sharp(out).metadata()).width).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/render.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/lib/room-mockup/render"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/api/src/lib/room-mockup/render.ts`:

```typescript
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
import { fitIntoBox, shadowParams, type Placed, type ShadowSpec } from './geometry';
import type { FrameRender, RoomTemplate } from './templates';

/**
 * Wrap artwork in a frame face, with a thin dark bevel hairline between the
 * two. The bevel is not decoration: without it the face reads as a flat colour
 * band pasted round the art rather than as a moulding with an inner edge.
 */
export async function frameArtwork(art: Buffer, frame: FrameRender): Promise<Buffer> {
  if (frame.widthRatio === 0) return art;

  const meta = await sharp(art).metadata();
  const shortEdge = Math.min(meta.width ?? 0, meta.height ?? 0);

  // Sized off the SHORT edge so a panoramic poster is not swallowed by a frame
  // proportioned to its length.
  const face = Math.max(2, Math.round(shortEdge * frame.widthRatio));
  const bevel = Math.max(1, Math.round(face * 0.12));

  const [r, g, b] = frame.color;

  const withBevel = await sharp(art)
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

  const rmeta = await sharp(roomPath).metadata();
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
  return sharp(roomPath)
    .composite([
      { input: await shadowLayer(canvasW, canvasH, placed, ambient), blend: 'over' },
      { input: await shadowLayer(canvasW, canvasH, placed, contact), blend: 'over' },
      { input: resized, left: placed.left, top: placed.top, blend: 'over' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/render.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/render.ts packages/api/tests/lib/room-mockup/render.test.ts
git commit -m "feat(api): composite framed artwork into room templates with layered shadows"
```

---

### Task 4: Framed main image and contact sheet

The two outputs that are not room mockups: the file uploaded as the product's main image, and the single sheet a human looks at to choose.

**Files:**
- Create: `packages/api/src/lib/room-mockup/outputs.ts`
- Test: `packages/api/tests/lib/room-mockup/outputs.test.ts`

**Interfaces:**
- Consumes: `frameArtwork` from `render.ts`; `FrameRender` from `templates.ts`; `MAT_COLOR` from `@chobii/shared`.
- Produces:
  - `renderFramedMain(art: Buffer, frame: FrameRender): Promise<Buffer>`
  - `interface SheetEntry { label: string; image: Buffer }`
  - `buildContactSheet(entries: SheetEntry[], columns?: number, cellSize?: number): Promise<Buffer>`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/lib/room-mockup/outputs.test.ts`:

```typescript
/**
 * The two non-room outputs.
 *
 * renderFramedMain produces the file that gets uploaded as the product's main
 * image. It is deliberately NOT squared here — buildProductMedia() mats and
 * squares every upload already, and duplicating that would mean two places to
 * change the square contract.
 *
 * buildContactSheet produces the single image a human opens to choose. Its
 * numbering is the whole point: it is how someone says "keep 2, 5 and 7".
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { renderFramedMain, buildContactSheet } from '../../../src/lib/room-mockup/outputs';
import type { FrameRender } from '../../../src/lib/room-mockup/templates';

const OAK: FrameRender = { widthRatio: 0.05, color: [178, 141, 94], depthRatio: 0.024 };

const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

const cell = (w: number, h: number, colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: colour } }).jpeg().toBuffer();

describe('renderFramedMain', () => {
  it('keeps the artwork aspect ratio — squaring is the upload pipeline job, not this one', async () => {
    const out = await renderFramedMain(await art(500, 1000), OAK);
    const meta = await sharp(out).metadata();

    expect(meta.width! / meta.height!).toBeCloseTo(0.5, 1);
  });

  it('surrounds the framed art with margin in the catalogue mat colour', async () => {
    const out = await renderFramedMain(await art(400, 400), OAK);
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // Tolerance, not equality: the output is JPEG, and even a flat region can
    // shift by a level or two. Asserting exact bytes here would be a flaky
    // test dressed up as a strict one.
    expect(data[0]).toBeCloseTo(MAT_COLOR.r, -1);
    expect(data[1]).toBeCloseTo(MAT_COLOR.g, -1);
    expect(data[2]).toBeCloseTo(MAT_COLOR.b, -1);
  });

  it('is larger than the framed artwork it contains', async () => {
    const out = await renderFramedMain(await art(400, 400), OAK);
    const meta = await sharp(out).metadata();

    expect(meta.width).toBeGreaterThan(400);
  });
});

describe('buildContactSheet', () => {
  it('lays entries out in a grid of the requested column count', async () => {
    const entries = [
      { label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) },
      { label: 'Two', image: await cell(200, 200, { r: 0, g: 255, b: 0 }) },
      { label: 'Three', image: await cell(200, 200, { r: 0, g: 0, b: 255 }) },
    ];

    const sheet = await buildContactSheet(entries, 2, 200);
    const meta = await sharp(sheet).metadata();

    // 2 columns, so 3 entries need 2 rows.
    expect(meta.width).toBeGreaterThanOrEqual(400);
    expect(meta.height).toBeGreaterThan(400);
  });

  it('grows taller, not wider, as entries are added', async () => {
    const one = [{ label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) }];
    const four = await Promise.all(
      [0, 1, 2, 3].map(async (i) => ({
        label: `Item ${i}`,
        image: await cell(200, 200, { r: 10 * i, g: 0, b: 0 }),
      }))
    );

    const a = await sharp(await buildContactSheet(one, 2, 200)).metadata();
    const b = await sharp(await buildContactSheet(four, 2, 200)).metadata();

    expect(b.width).toBe(a.width);
    expect(b.height!).toBeGreaterThan(a.height!);
  });

  it('refuses an empty set rather than writing a blank sheet', async () => {
    await expect(buildContactSheet([], 2, 200)).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/outputs.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/lib/room-mockup/outputs"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/api/src/lib/room-mockup/outputs.ts`:

```typescript
/**
 * The two outputs that are not room mockups.
 */

import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { frameArtwork } from './render';
import type { FrameRender } from './templates';

/** Margin round the framed art, as a fraction of its long edge. */
const MAIN_MARGIN = 0.06;

/**
 * The file to upload as the product's main image: framed artwork on the
 * catalogue's mat colour.
 *
 * Deliberately NOT squared. buildProductMedia() (lib/product-media.ts) mats,
 * squares and measures every upload already; squaring here as well would put
 * the square contract in two places, and they would drift.
 */
export async function renderFramedMain(art: Buffer, frame: FrameRender): Promise<Buffer> {
  const framed = await frameArtwork(art, frame);
  const meta = await sharp(framed).metadata();

  const margin = Math.round(Math.max(meta.width ?? 0, meta.height ?? 0) * MAIN_MARGIN);

  return sharp(framed)
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { ...MAT_COLOR, alpha: 1 },
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export interface SheetEntry {
  label: string;
  image: Buffer;
}

const GUTTER = 16;
const CAPTION = 34;

/**
 * One image showing every candidate side by side, each numbered.
 *
 * The numbering is the interface: it is how a person says "keep 2, 5 and 7"
 * without opening eight files. Labels are drawn as SVG text because sharp has
 * no text primitive of its own.
 */
export async function buildContactSheet(
  entries: SheetEntry[],
  columns = 3,
  cellSize = 420
): Promise<Buffer> {
  if (entries.length === 0) {
    throw new Error('Cannot build a contact sheet from an empty candidate set.');
  }

  const rows = Math.ceil(entries.length / columns);
  const cellH = cellSize + CAPTION;
  const width = columns * cellSize + (columns + 1) * GUTTER;
  const height = rows * cellH + (rows + 1) * GUTTER;

  const layers: sharp.OverlayOptions[] = [];

  for (const [i, entry] of entries.entries()) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = GUTTER + col * (cellSize + GUTTER);
    const top = GUTTER + row * (cellH + GUTTER);

    const thumb = await sharp(entry.image)
      .resize(cellSize, cellSize, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();

    layers.push({ input: thumb, left, top });

    const caption = Buffer.from(
      `<svg width="${cellSize}" height="${CAPTION}">
         <text x="0" y="22" font-family="sans-serif" font-size="20" fill="#111">${i + 1}. ${escapeXml(entry.label)}</text>
       </svg>`
    );

    layers.push({ input: caption, left, top: top + cellSize });
  }

  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** Template labels are hand-written, so a stray & or < must not break the SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/outputs.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/room-mockup/outputs.ts packages/api/tests/lib/room-mockup/outputs.test.ts
git commit -m "feat(api): framed main image and numbered contact sheet"
```

---

### Task 5: CLI

Wires the pieces together. Argument parsing and run planning are extracted as pure functions so they can be tested without touching disk; only the thin driver does I/O.

**Files:**
- Create: `packages/api/src/lib/room-mockup/cli-args.ts`
- Create: `packages/api/src/database/generate-room-mockups.ts`
- Create: `packages/api/src/database/room-templates.json`
- Create: `packages/api/src/database/frame-renders.json`
- Modify: `packages/api/package.json` (add the `mockups:rooms` script)
- Test: `packages/api/tests/lib/room-mockup/cli-args.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces:
  - `interface RunOptions { posters: string; templates: string; out: string; only: string[] | null; frame: string | null; dryRun: boolean }`
  - `parseArgs(argv: string[]): RunOptions`
  - `selectTemplates(all: RoomTemplate[], only: string[] | null): RoomTemplate[]`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/lib/room-mockup/cli-args.test.ts`:

```typescript
/**
 * CLI argument parsing and template selection.
 *
 * Extracted from the CLI driver so the contract is testable without a
 * filesystem. The driver itself is a thin loop over these results.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, selectTemplates } from '../../../src/lib/room-mockup/cli-args';
import type { RoomTemplate } from '../../../src/lib/room-mockup/templates';

const argv = (...args: string[]) => ['bun', 'generate-room-mockups.ts', ...args];

const t = (id: string): RoomTemplate => ({
  id,
  file: `${id}.jpg`,
  placement: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
  light: 'left',
  frame: 'oak',
  label: id,
});

describe('parseArgs', () => {
  it('requires --posters', () => {
    expect(() => parseArgs(argv())).toThrow(/--posters/);
  });

  it('reads --posters and defaults the rest', () => {
    const opts = parseArgs(argv('--posters', './art'));

    expect(opts.posters).toBe('./art');
    expect(opts.templates).toBe('.cache/room-templates');
    expect(opts.out).toBe('./out');
    expect(opts.only).toBeNull();
    expect(opts.frame).toBeNull();
    expect(opts.dryRun).toBe(false);
  });

  it('reads the optional flags', () => {
    const opts = parseArgs(
      argv('--posters', './art', '--templates', './rooms', '--out', './build', '--dry-run')
    );

    expect(opts.templates).toBe('./rooms');
    expect(opts.out).toBe('./build');
    expect(opts.dryRun).toBe(true);
  });

  it('splits --only on commas and trims', () => {
    const opts = parseArgs(argv('--posters', './art', '--only', 'living-room, nook'));

    expect(opts.only).toEqual(['living-room', 'nook']);
  });

  it('reads a --frame override', () => {
    expect(parseArgs(argv('--posters', './art', '--frame', 'black')).frame).toBe('black');
  });

  it('rejects a flag that expects a value but has none', () => {
    expect(() => parseArgs(argv('--posters'))).toThrow(/--posters/);
  });

  it('rejects an unknown flag rather than ignoring a typo', () => {
    expect(() => parseArgs(argv('--posters', './art', '--postrs', 'x'))).toThrow(/--postrs/);
  });
});

describe('selectTemplates', () => {
  it('returns everything when no subset is requested', () => {
    const all = [t('a'), t('b')];

    expect(selectTemplates(all, null)).toHaveLength(2);
  });

  it('returns only the named templates, in template order', () => {
    const all = [t('a'), t('b'), t('c')];

    expect(selectTemplates(all, ['c', 'a']).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('throws on an id that matches no template, naming it', () => {
    expect(() => selectTemplates([t('a')], ['nope'])).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/cli-args.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/lib/room-mockup/cli-args"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/api/src/lib/room-mockup/cli-args.ts`:

```typescript
/**
 * CLI contract for generate-room-mockups.
 *
 * Split out from the driver so it can be tested without a filesystem. Unknown
 * flags are an error rather than a shrug: a typo in --templates would
 * otherwise silently render against the default directory.
 */

import type { RoomTemplate } from './templates';

export interface RunOptions {
  posters: string;
  templates: string;
  out: string;
  only: string[] | null;
  frame: string | null;
  dryRun: boolean;
}

const VALUE_FLAGS = ['--posters', '--templates', '--out', '--only', '--frame'] as const;
const BOOL_FLAGS = ['--dry-run'] as const;

export function parseArgs(argv: string[]): RunOptions {
  const args = argv.slice(2);
  const values = new Map<string, string>();
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];

    if ((BOOL_FLAGS as readonly string[]).includes(flag)) {
      dryRun = true;
      continue;
    }

    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) {
      throw new Error(`Unknown flag: ${flag}`);
    }

    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Flag ${flag} needs a value.`);
    }

    values.set(flag, value);
    i++;
  }

  const posters = values.get('--posters');
  if (!posters) {
    throw new Error('--posters <dir> is required.');
  }

  const only = values.get('--only');

  return {
    posters,
    templates: values.get('--templates') ?? '.cache/room-templates',
    out: values.get('--out') ?? './out',
    only: only ? only.split(',').map((s) => s.trim()).filter(Boolean) : null,
    frame: values.get('--frame') ?? null,
    dryRun,
  };
}

/**
 * Narrow the template set to the requested ids, preserving template file order
 * so the contact sheet's numbering is stable across runs.
 */
export function selectTemplates(
  all: RoomTemplate[],
  only: string[] | null
): RoomTemplate[] {
  if (!only) return all;

  const known = new Set(all.map((t) => t.id));
  const missing = only.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`No template with id: ${missing.join(', ')}`);
  }

  const wanted = new Set(only);
  return all.filter((t) => wanted.has(t.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bunx vitest run tests/lib/room-mockup/cli-args.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit the parser**

```bash
git add packages/api/src/lib/room-mockup/cli-args.ts packages/api/tests/lib/room-mockup/cli-args.test.ts
git commit -m "feat(api): argument parsing and template selection for the mockup CLI"
```

- [ ] **Step 6: Create the data files**

Create `packages/api/src/database/frame-renders.json`:

```json
{
  "oak": { "widthRatio": 0.032, "color": [178, 141, 94], "depthRatio": 0.024 },
  "black": { "widthRatio": 0.028, "color": [26, 26, 28], "depthRatio": 0.022 },
  "white": { "widthRatio": 0.028, "color": [242, 240, 236], "depthRatio": 0.022 },
  "gold": { "widthRatio": 0.03, "color": [186, 152, 84], "depthRatio": 0.024 },
  "frameless": { "widthRatio": 0, "color": [0, 0, 0], "depthRatio": 0.03 }
}
```

Create `packages/api/src/database/room-templates.json` as an empty-for-now placeholder that documents the shape. It stays an empty array until real blank-wall templates exist; `loadTemplates` throws a clear "No room templates defined" until then, which is the correct behaviour.

```json
[]
```

- [ ] **Step 7: Write the CLI driver**

Create `packages/api/src/database/generate-room-mockups.ts`:

```typescript
/**
 * Generate room mockups from poster artwork.
 *
 * Offline: reads local files, writes local files, exits. No database, no R2,
 * no network. That is what keeps it small — the upload path already exists in
 * lib/product-media.ts, and the bulk import already exists as its own tool.
 *
 * Output filenames are chosen to be pasted straight into the bulk catalogue
 * import manifest:
 *
 *   mainImage,roomImages
 *   framed-main.jpg,room-living-room.jpg|room-nook.jpg
 *
 * Usage:
 *   bun run mockups:rooms --posters ./art [--templates .cache/room-templates]
 *                         [--out ./out] [--only id,id] [--frame slug] [--dry-run]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { loadTemplates } from '../lib/room-mockup/templates';
import { parseArgs, selectTemplates } from '../lib/room-mockup/cli-args';
import { renderRoomMockup } from '../lib/room-mockup/render';
import { buildContactSheet, renderFramedMain, type SheetEntry } from '../lib/room-mockup/outputs';
import templatesJson from './room-templates.json';
import framesJson from './frame-renders.json';

const POSTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const opts = parseArgs(process.argv);

const { templates: allTemplates, frames } = loadTemplates(
  templatesJson,
  framesJson,
  (file) => existsSync(join(opts.templates, file))
);

const templates = selectTemplates(allTemplates, opts.only);

// `--only ,` filters down to nothing without naming a bad id, so guard here
// rather than letting templates[0] be undefined further down.
const firstTemplate = templates[0];
if (!firstTemplate) {
  throw new Error('Template selection is empty — nothing to render.');
}

if (opts.frame && !(opts.frame in frames)) {
  throw new Error(`--frame "${opts.frame}" has no render spec.`);
}

/**
 * src is compiled with noUncheckedIndexedAccess, so every lookup into `frames`
 * is `FrameRender | undefined`. Both keys are validated above — loadTemplates
 * checks each template's slug, and --frame is checked directly — so this
 * throws only if that validation is ever weakened.
 */
function frameFor(slug: string) {
  const spec = frames[slug];
  if (!spec) throw new Error(`Frame "${slug}" has no render spec.`);
  return spec;
}

const posters = readdirSync(opts.posters)
  .filter((f) => POSTER_EXT.has(extname(f).toLowerCase()))
  .sort();

if (posters.length === 0) {
  throw new Error(`No poster images found in ${opts.posters}`);
}

console.log(
  `${posters.length} poster(s) x ${templates.length} template(s) = ${posters.length * templates.length} mockups`
);

if (opts.dryRun) {
  for (const poster of posters) {
    console.log(`  ${poster} -> ${templates.map((t) => `room-${t.id}.jpg`).join(', ')}`);
  }
  console.log('Dry run — nothing written.');
  process.exit(0);
}

const failures: Array<{ poster: string; reason: string }> = [];

for (const poster of posters) {
  const slug = basename(poster, extname(poster));
  const dir = join(opts.out, slug);

  try {
    mkdirSync(dir, { recursive: true });
    const art = readFileSync(join(opts.posters, poster));

    const sheet: SheetEntry[] = [];

    for (const template of templates) {
      const image = await renderRoomMockup(
        art,
        join(opts.templates, template.file),
        template,
        frameFor(opts.frame ?? template.frame)
      );

      writeFileSync(join(dir, `room-${template.id}.jpg`), image);
      sheet.push({ label: template.label, image });
    }

    // The main image uses the first template's frame, so the framed main and
    // the first room shot agree on the moulding.
    const mainFrame = frameFor(opts.frame ?? firstTemplate.frame);
    writeFileSync(join(dir, 'framed-main.jpg'), await renderFramedMain(art, mainFrame));
    writeFileSync(join(dir, 'contact-sheet.jpg'), await buildContactSheet(sheet));

    console.log(`  ${slug}: ${templates.length} mockups + main + contact sheet`);
  } catch (error) {
    failures.push({ poster, reason: error instanceof Error ? error.message : String(error) });
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} poster(s) failed:`);
  for (const f of failures) console.error(`  ${f.poster}: ${f.reason}`);
  process.exit(1);
}

console.log(`\nDone. Review ${opts.out}/<slug>/contact-sheet.jpg and delete what you do not want.`);
```

- [ ] **Step 8: Register the script**

In `packages/api/package.json`, add to `"scripts"` immediately after the `"backfill:art-box"` line:

```json
"mockups:rooms": "bun run src/database/generate-room-mockups.ts"
```

No `--env-file` — unlike `seed` and `backfill:art-box`, this tool reads no environment at all.

- [ ] **Step 9: Verify the CLI end to end**

Run:

```bash
cd packages/api && bun run mockups:rooms --posters ./nonexistent --dry-run
```

Expected: exits non-zero with `No room templates defined — nothing to render.` — correct, because `room-templates.json` is still `[]` and there are no blank-wall photos yet. This confirms the wiring and the fail-loud behaviour.

- [ ] **Step 10: Run the full package gate**

Run:

```bash
cd packages/api && bun run typecheck && bunx vitest run tests/lib/room-mockup
```

Expected: typecheck clean, all room-mockup tests PASS.

Then confirm nothing else regressed:

```bash
cd /Users/dhruv/work/masonart.com && bunx vitest run packages/api/tests
```

Expected: no NEW failures against the pre-existing baseline. The API suite has known failures on `main`; compare, do not assume zero.

- [ ] **Step 11: Commit**

```bash
git add packages/api/src/database/generate-room-mockups.ts \
        packages/api/src/database/room-templates.json \
        packages/api/src/database/frame-renders.json \
        packages/api/package.json
git commit -m "feat(api): generate-room-mockups CLI"
```

---

## After the plan

The tool is complete but has **no templates**. It will refuse to run until
`room-templates.json` has entries and `.cache/room-templates/` has the matching
images. That is deliberate — the spec calls out that template quality, not code,
is the real cost of this feature.

The follow-up work, which is not code:

1. Generate 6-8 blank-wall room images, straight-on, with consistent lighting. Keep
   them clear of the MESON ART watermark that is baked into `.cache/seed-media/`
   artwork (tracker #546).
2. Drop them in `.cache/room-templates/`.
3. For each, measure the wall rectangle by eye and add an entry to
   `room-templates.json` with its `light` direction and a suitable `frame`.
4. Run `--dry-run`, then a real run, then look at a contact sheet and tune the
   rectangles.
