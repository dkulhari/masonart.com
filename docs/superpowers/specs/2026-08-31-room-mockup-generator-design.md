# Room mockup generator

**Date:** 2026-08-31
**Status:** design approved, pending implementation plan
**Feature:** `room-visualization`
**Related:** [#672 bulk catalogue import](../../../plan/tracker-data/tickets/ticket-0672-bulk-catalogue-import-script-c.yaml) — consumes this tool's output. [#546 seed artwork watermark](../../../plan/tracker-data/tickets/ticket-0546-seed-catalogue-artwork-carries.yaml) — the watermark hazard called out in §12.

---

## 1. Problem

A product's gallery is one matted artwork plus three room mockups — art hanging on a
wall, shot in a furnished room. Every product in the seeded catalogue has that shape
(`packages/api/src/database/seed-images.ts:131`, which globs `<prefix>-main.webp` and
`<prefix>-room-N.webp`).

Producing those room shots is currently **not a process at all**. The seeded ones came
in as finished reference imagery. For a real product there are two options and both are
bad:

- Photograph the framed piece in a styled room. Per poster. For a catalogue of hundreds.
- Have someone composite it by hand in an image editor, then upload the result through
  `/admin/products/new` one file at a time (`packages/web/app/components/admin/ProductForm.tsx:918`).

Meanwhile the ingredients already exist. Sharp is a dependency. `matToSquare()`
(`packages/api/src/lib/image-processing.ts:243`) already composites artwork onto a
canvas. `measureArtBox()` (`:338`) already locates art within a mat. The `frames` table
already stores mouldings with `type`, `color`, `material` and a physical `thickness` in
inches (`packages/api/src/database/schema/products.ts:242`). Nothing assembles them into
a room.

A spike on 2026-08-30 confirmed the missing piece is small: compositing a framed poster
into a straight-on room photo at a declared rectangle, with a two-layer shadow, produces
a sellable image in ~1.2s using Sharp alone and no new dependency.

## 2. Scope

**In scope.** An offline CLI that takes poster artwork plus a library of blank-wall room
templates and emits candidate room mockups, a framed main image, and a contact sheet for
human review. Output filenames feed directly into the #672 bulk import manifest.

**Out of scope, deliberately:**

- **Generating the room photographs.** They are AI-generated and supplied. This tool
  consumes them.
- **Angled or perspective rooms.** Straight-on walls only. Sharp offers `.affine()` but
  no four-point homography, and adding perspective would mean a new dependency and a
  materially harder template format. Revisit only if straight-on proves insufficient.
- **Any admin UI.** Review happens by looking at a contact sheet and deleting files.
- **Auto-detecting the wall rectangle.** Measured by eye once per template, about a
  minute, then committed.
- **Per-frame room variants.** See §5.
- **Writing to the database or to R2.** The tool touches a local output folder and
  nothing else.

## 3. Architecture and data flow

```
poster artwork (bare files)  ─┐
                              ├─► generate-room-mockups ──► out/<poster-slug>/
room templates                │        (offline CLI)          ├── room-<template-id>.jpg  × N
  .cache/room-templates/*.jpg ┘                               ├── framed-main.jpg
  + templates.json (committed)                                └── contact-sheet.jpg
                                                                       │
                                                        human deletes the rejects
                                                                       │
                                              ┌────────────────────────┴───────────────┐
                                              ▼                                        ▼
                                   admin upload, one at a time            #672 manifest roomImages
```

The tool is a leaf. It reads files, writes files, and exits. That is what keeps it a
small build: no endpoint, no auth, no job queue, no long-running request, and no
duplication of the upload pipeline that #672 already covers.

**Home:** `packages/api/src/database/generate-room-mockups.ts`, registered in
`packages/api/package.json` as `mockups:rooms`, alongside `seed` and
`backfill:art-box`. `backfill-art-box.ts` is the precedent for a one-off CLI here; it
parses flags with plain `process.argv.includes()` (`:43-44`) and this follows that.

## 4. Template store and format

**Images:** `.cache/room-templates/`, gitignored. `.cache/` is already ignored
(`.gitignore:70`) and already holds reference imagery under `.cache/seed-media/`
(`packages/api/src/database/seed-images.ts:55`). AI-generated room photos are large and
get regenerated; putting them in git history means paying for every discarded revision
forever.

**Measurements:** `packages/api/src/database/room-templates.json`, committed. The
rectangles are the intellectual content — they are hand-measured, they are what breaks
if a template is re-cropped, and they must be reviewable in a diff.

```json
{
  "id": "living-room-warm",
  "file": "living-room-warm.jpg",
  "placement": { "x": 0.286, "y": 0.047, "w": 0.483, "h": 0.622 },
  "light": "left",
  "frame": "oak",
  "label": "Living room"
}
```

- `placement` is normalised 0..1 against the template's own pixel size, so a template can
  be re-exported at a different resolution without remeasuring.
- **`placement` is a bounding box, not a stretch target.** The poster is fitted inside it
  preserving its own aspect ratio and centred. A portrait poster and a landscape poster
  both land correctly in the same room. Stretching a poster to fill a rect would
  misrepresent the product, which is worse than an empty margin.
- `light` is `"left"` or `"right"` and sets shadow direction. It must match the room
  photo's own lighting or the composite reads as fake instantly.
- `frame` names a render spec (§5).

Validated with Zod at load. A rect outside 0..1, a missing image file, or an unknown
frame name is a startup error naming the offending template id — not a silent fallback.

## 5. Frame render specs

`packages/api/src/database/frame-renders.json`, committed, keyed by the `frames.type`
slug so an entry corresponds to a real catalogue moulding:

```json
{ "oak": { "widthRatio": 0.032, "color": [178, 141, 94], "depthRatio": 0.024 } }
```

- `widthRatio` — frame face width as a fraction of the artwork's short edge.
- `depthRatio` — how far the piece stands off the wall, same units. Drives shadow
  magnitude. It mirrors `frames.thickness` (inches, `schema/products.ts:242`) but is
  restated here as a ratio because the CLI is offline and has no database, and because
  the render needs a value relative to the image, not an absolute one.
- `widthRatio: 0` means frameless. A stretched canvas has no face, so the shadow becomes
  the **only** cue for depth and gets a larger `depthRatio` to compensate.

**One frame per room template, not a matrix.** `selectedFrame` in
`packages/web/app/components/product/ProductDetail.tsx:159` feeds price
(`:209-216`) and the cart payload (`:284-305`) — it never swaps the gallery image. The
storefront therefore has no consumer for a room shot per frame. Rendering every frame
against every room would multiply ~8 candidates into ~40 with nothing to display them.
Each template instead declares the moulding that suits its palette.

## 6. Renderer

Per poster, per template:

1. **Frame the artwork.** Extend by a thin dark bevel hairline, then by the frame face
   colour. The bevel matters: without it the face reads as a flat colour band rather than
   a moulding. Skipped entirely when `widthRatio` is 0.
2. **Fit into the rect.** `scale = min(boxW / frameW, boxH / frameH)`, centred in the box.
3. **Two shadows, composited under the art.** This is the finding that makes the output
   sellable:
   - **contact** — tight blur, higher opacity, small offset. The edge meeting the wall.
   - **ambient** — wide blur, low opacity, larger offset. The body standing off the wall.

   A single shadow always reads as a sticker pasted on a photo. The pair reads as an
   object with thickness. Both derive their blur, opacity and offset from `depthRatio`;
   direction comes from `light`.
4. **Composite and write JPEG** at quality 92.

Sharp implementation note carried over from the spike: `sharp({create})` only produces 3-
or 4-channel images, so a shadow mask is built in RGB, blurred, scaled with `.linear()`,
converted with `.toColourspace("b-w")`, and attached as an alpha channel via
`.joinChannel()`.

Measured cost: ~1.2s per 1600×1600 composite.

## 7. Review

`contact-sheet.jpg` — every candidate for one poster in a numbered grid with its template
label underneath. One file to open, all candidates visible together, which is how a human
actually judges "does this look right".

The review action is deleting files from `out/<poster-slug>/`. Survivors are the set. No
state, no database, no marking step that could disagree with what is on disk.

## 8. `framed-main.jpg`

Also emitted: the artwork with its frame on a plain white ground.

Upload it as the product's `mainImage` and `buildProductMedia()`
(`packages/api/src/lib/product-media.ts:52`) mats, squares, measures the art box and
generates the variant ladder exactly as it does today. No pipeline change, and the result
matches how existing catalogue main images already look — framed art on white.

## 9. Handoff to #672

Output filenames are chosen to be pasted straight into the bulk import manifest's
pipe-separated columns:

```csv
mainImage,roomImages
framed-main.jpg,room-living-room-warm.jpg|room-reading-nook.jpg|room-entryway.jpg
```

Point #672's `--media-dir` at `out/<poster-slug>/` and the import runs unchanged. The two
tools share no code and no schema — only a filename convention — so neither constrains
the other.

## 10. CLI contract

```
bun run mockups:rooms \
  --posters <dir>          # bare artwork files, one per product
  --templates <dir>        # defaults to .cache/room-templates
  --out <dir>              # defaults to ./out
  [--only <template-id,…>] # render a subset
  [--frame <slug>]         # override every template's declared frame
  [--dry-run]              # validate templates and inputs, render nothing
```

`--dry-run` validates every template, confirms every referenced image exists, and reports
what would be rendered. It is the cheap check before a long batch.

Per-poster failures are isolated and reported at the end with the poster name and reason;
one bad input never aborts a batch. Exit code is non-zero if anything failed.

## 11. Testing

**Unit tests, on pure functions:**

- Rect fitting preserves aspect ratio for portrait, landscape and square posters.
- A poster wider than its box is bounded by width; a taller one by height.
- Output is centred within the box.
- Shadow offset flips sign with `light`.
- Shadow blur and offset scale with `depthRatio`; **opacity does not**. A thicker frame
  casts a larger shadow, not a darker one — darkening with depth reads as a change in the
  room's lighting rather than a change in the object.
- Template validation rejects a rect outside 0..1, a missing file, and an unknown frame
  slug — each naming the offending template id.
- `widthRatio: 0` produces no frame face.

**One smoke test:** a full render produces a JPEG at the template's dimensions.

**No image diffing in CI.** Pixel comparison across Sharp and libvips versions is flaky
and slow, and it would gate the build on something no test can actually judge. The visual
check is a human looking at the contact sheet — that is the design, not a gap in it.

## 12. Risks and open items

- **Watermarked source imagery.** `.cache/seed-media/` reference artwork carries a
  MESON ART watermark baked into the pixels (tracker #546). If AI room generation is
  seeded from those images the watermark propagates into every mockup. Room templates
  must be generated clean.
- **Template quality is the real cost.** The code is small; the work is producing rooms
  that are genuinely straight-on, lit consistently with their declared `light`, and have
  enough blank wall for the largest poster aspect. A bad template cannot be rescued by
  the renderer.
- **Aspect coverage.** A rect measured against a portrait poster may leave an awkward
  margin for a panoramic one. Mitigation is measuring each rect against the widest
  aspect the catalogue actually carries, and accepting that some rooms suit some
  orientations. Worth revisiting once real templates exist.
- **Whether straight-on is enough** commercially. Angled room shots are common in this
  category. The spike deliberately did not answer this. If the answer turns out to be no,
  perspective is a separate design, not an extension of this one.
