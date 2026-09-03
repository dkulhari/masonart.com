# Room Mockup Pipeline — Definition

**Status:** implemented 2026-09-03 — stages 2–5 are in code and tested
(`packages/api/src/lib/room-mockup/`, tickets #737–#747); stage 1 has its
script and prompt but the six rooms are not generated yet (needs a billed
`GOOGLE_AI_STUDIO_KEY`, or any licensed generator fed
`packages/api/src/database/room-templates/PROMPT.md`). Supersedes the
"baked frame vs drawn frame" split in `CATALOGUE-IMPORT-PIPELINE.md` and the
straight-on `Box` template format from #701/#718.

## How to run

```bash
# 1. Rooms (once). Needs GOOGLE_AI_STUDIO_KEY in .env, or use PROMPT.md with any licensed generator.
bun run --cwd packages/api mockups:generate-rooms

# 2. Measure each room: open packages/api/tools/room-measure.html, load room-<id>.png,
#    click tl, tr, br, bl, fill the fields, download room-<id>.json next to the png.

# 3. Render every poster into every scene
bun run --cwd packages/api mockups:rooms --posters <dir> [--frame black] [--poster-cm 60x80] [--only 03]
```

Two numbers differ from the proposal below, both because the proposal's own
example could not satisfy it: the pixel floor is **400 px**, not 900 (a
120 cm poster on a 320 cm wall filling 61% of a 2048 px image projects to
~470 px; 900 needs a 4096 px room), and `nearSide` for a negative yaw is
**`left`** (camera on the left, left edge longer, left side face visible).
Scene ids are bare slugs (`01`), so the files are `room-01.png` /
`room-01.json` and the output is `room-01.jpg`.

## Goal

Produce three room views per product from a bare-wall room and the product's
own pixels, with **no per-product generation** and **no artwork redraw**. One
room serves every orientation band. The room is authored once; everything
after that is deterministic code that runs inside `mockups:rooms`.

## The idea in one line

Generate the **room only**, with a bare wall, at any angle. Measure the wall
once as a plane. Everything that hangs on it — frame, mat, artwork, side face,
shadow — is drawn flat and projected onto that plane by the same homography.

This is different from the baked-frame route in one decisive way: the frame is
not in the photograph, so its aperture is not fixed. A portrait, square,
panoramic and landscape poster all hang on the same wall of the same room. The
side face that made baked frames look three-dimensional is **extruded in
code** from the measured plane, so angled rooms keep their depth cue.

## Pipeline

```
1  generate   room-<id>.png            bare wall, angled, flat daylight
2  measure    room-<id>.json           wall plane, anchor, view, light
3  frame      panel.png                art + mat + frame front, drawn flat
4  place      panel-warped.png         projected into the wall plane
              side-face.png           extruded from the near edge
5  merge      room-<id>-<sku>.jpg      composite + lighting + shadow
```

Stages 1–2 run once per room and produce **authored assets** checked into
`packages/api/src/database/room-templates/`. Stages 3–5 run per product, per
room, offline, in seconds, with no network.

---

## Stage 1 — Generate the room

**Output:** `room-<id>.png`, long edge ≥ 2048.

The room is deliberately plain. The generator is used for what it is good at
— a believable space, furniture, a camera angle, materials — and for nothing
that stage 5 will have to reason about later.

Requirements:

| Requirement | Why |
|---|---|
| One **bare wall** occupying ≥ 40% of the frame | The placement area; the tool composites on top and cannot erase |
| Wall is a **single flat plane** | The homography assumes it; an alcove or column breaks it |
| Camera **yaw 15–35°**, pitch ≈ 0 | Enough angle to read as a real shot; past ~40° the poster runs short of pixels |
| **Flat, even, soft light** — overcast window, no hard shadows on the wall | Lighting is added in stage 5 from a declared direction; baked directional light would fight it |
| Nothing hanging, no sconces, no switches in the placement area | Anything there shows through the mat edge or lands under the frame |
| Low furniture only along the bottom edge | Keeps the wall clear and gives the shot a floor line |
| Sharp, deep focus (`f/8`) | The wall's corners and edges are measured; bokeh degrades them |

Prompt:

```
Photorealistic interior photograph of a modern living room. A large, completely
bare, flat wall of warm-white plaster fills most of the frame — nothing hanging
on it, no shelves, no switches, no sconces, no texture beyond plaster. The wall
is seen from a three-quarter angle, about 25 degrees off-axis to the left, so
its horizontal edges converge gently. Ceiling line and skirting board both
visible. Low furniture only along the bottom edge: a linen sofa and a small
side table. Soft, even, overcast daylight with no hard shadows and no visible
light source. Muted neutral palette. Shot on 50mm, f/8, deep focus, high
detail.
```

Negative: `picture, frame, poster, artwork, painting, shelf, sconce, lamp on
wall, switch, wallpaper pattern, hard shadow, sunbeam, glare, shallow depth of
field, fisheye, wide angle distortion, clutter, people`

Notes:

- "No hard shadows" is the load-bearing clause. It is the opposite of the
  baked-frame prompt, and it is why one room can be lit from either side.
- Generate at ≥ 2048 or upscale before measuring; the measurement is in
  normalised coordinates but the panel is resampled from the wall's pixel
  extent.
- Six rooms is enough: two straight-on, two yaw-left, two yaw-right. Straight-on
  keeps the cheap `Box` path.
- Tool: any text-to-image model with a commercial licence. Firefly answers
  provenance in writing; Flux 2 Pro / Nano Banana Pro are ~$0.05–0.15 an image.
  Not the HF edit Space — it needs an input image and is on someone else's
  quota.

---

## Stage 2 — Measure the wall

**Output:** `room-<id>.json`. This file *is* the setting. It is the only
authored data the renderer reads.

```json
{
  "id": "01",
  "image": "room-01.png",
  "imageSize": [2048, 2048],

  "wall": {
    "quad": {
      "tl": [0.18, 0.09],
      "tr": [0.79, 0.14],
      "br": [0.79, 0.71],
      "bl": [0.18, 0.78]
    },
    "widthCm": 320,
    "heightCm": 260
  },

  "anchor": { "x": 0.5, "y": 0.42 },

  "allowable": {
    "maxWidthCm": 120,
    "maxHeightCm": 150,
    "minMarginCm": 25
  },

  "view": {
    "yawDeg": -25,
    "nearSide": "left"
  },

  "light": {
    "direction": "left",
    "elevationDeg": 35,
    "softness": 0.6,
    "strength": 0.45
  }
}
```

Field by field:

- **`wall.quad`** — the four image-space corners (normalised 0–1) of a
  *rectangle on the wall plane*. Not the whole visible wall: a clean rectangle
  whose real-world edges are horizontal and vertical — typically skirting board
  to ceiling line, and two vertical references (a corner, a door jamb, or two
  points on the same vertical plumb line). Winding is tl→tr→br→bl, clockwise
  on screen. This is the input `solveHomography` already takes.
- **`wall.widthCm` / `heightCm`** — the real-world size of that rectangle.
  Approximate is fine (a 2.6 m ceiling is a good anchor); it only sets the
  scale so a 50 × 70 cm poster is the right size relative to the sofa.
- **`anchor`** — where the poster is *centred*, in wall-plane units (0–1
  across the wall rectangle). `y = 0.42` puts the centre a little above the
  midpoint, which is where pictures actually hang.
- **`allowable`** — the largest poster that fits, and the margin to keep from
  the wall rectangle's edges. The renderer clamps the poster into this box and
  fails the room if the clamp changes the aspect.
- **`view.yawDeg`** — signed; negative means the camera looks at the wall from
  its left. Declared from the prompt, then **validated** against the quad: for
  a yaw-left shot the left vertical edge must be longer than the right, and
  the top and bottom edges must converge to the right. If the sign disagrees
  the file is rejected. `nearSide` is derived, stored for readability.
- **`light`** — the direction stage 5 lights *from*. Independent of the room:
  the same room can be authored twice with `left` and `right`.

### How to measure

For six rooms, a click tool beats a detector. `packages/api/tools/room-measure.html`
is that tool — a single page, no server: load the image, click four corners,
drag or arrow-key to adjust, and it draws the quad, the projected grid (10 cm
lines in wall space), the anchor, the allowable box and the margin back over
the photo, runs the same checks the loader runs, and downloads the JSON.
**The grid is the check** — if it lies flat on the wall and its verticals are
plumb, the quad is right. If it swims, it isn't.

The flood-fill corner finder from the baked-frame work does not apply here:
there is no aperture to find, and the usable rectangle is a judgement (which
skirting, which vertical) rather than a pixel boundary.

Validation on load, all fatal:

- `assertUsableQuad` — collinear, self-intersecting, or counter-clockwise
  winding (a mirrored poster).
- Yaw sign vs. quad convergence.
- Anchor ± half of `allowable` max stays inside `[minMargin, 1 − minMargin]`.
- Projected pixel width of the max poster ≥ 400 px (`MIN_POSTER_PX` in
  `scene.ts`; the proposal said 900, see "How to run"), or the room cannot
  serve a product shot.
- The image on disk is the size `imageSize` says, else the quad was measured
  on a different file (checked at render time).

---

## Stage 3 — Frame the poster, flat

**Output:** `panel.png`, lossless, in *wall-plane pixels*.

Everything is composed flat first and warped once. This is already the rule in
`warp.ts` and it is the right one: mat, frame and art are all rectangles in
the wall plane, so their relative geometry is trivial here and a mess after
projection.

Layers, inside out:

1. **Artwork** at its product aspect, from `products/originals/`, never from
   the WebP ladder.
2. **Mat** — off-white, 6% minimum border on all four sides (the letterbox
   fix). Optional: no mat for gallery-wrap style, per `frame-renders.json`.
3. **Frame front face** — width from `frame-renders.json` (e.g. 18 mm black,
   32 mm oak), colour and grain from the same file.

Sizing:

- Poster physical size comes from the variant being shown (default: the
  middle of the ladder). Convert to wall-plane pixels with
  `wall.widthCm / quadWidthPx` at the anchor.
- Clamp into `allowable`. If the clamp changes the aspect ratio, fail — do
  not letterbox.
- Render the panel at **2× the projected pixel extent** so the warp
  downsamples rather than upsamples.

The panel's outer rectangle — frame outer edge — is the thing stage 4 places.
Record its wall-plane rectangle `{x, y, w, h}` in cm; stage 4 needs it and
stage 5 needs it for the shadow.

---

## Stage 4 — Place it

**Output:** `panel-warped.png` and `side-face.png`, both in room-image
pixels with alpha.

### 4a. Front face

Map the panel's four wall-plane corners through the wall homography to get the
**placement quad**, then `warpPanelIntoQuad`. This is the existing code path.
`quadPixelBounds` with `floor(max) + 1` as already fixed.

Straight-on rooms (`yawDeg == 0`) degrade to `fitIntoBox` — keep both paths.

### 4b. Side face (extruded, not photographed)

The frame has a depth `d` (e.g. 3 cm). From a yaw angle only one side face is
visible: the one on `nearSide`. Its visible width on the wall plane is
approximately `d · sin(|yaw|)` cm, and it lies *outside* the front face on
the near side.

Build it as a second quad in wall-plane cm — a strip of width `d · sin|yaw|`
along the near vertical edge of the frame's outer rectangle — and project it
through the same homography. Fill it with the frame colour darkened or
lightened by a fixed factor from the `light` block (see stage 5). Composite
**under** the front face.

This is a first-order approximation: the true side face is a plane
perpendicular to the wall, and its projection depends on camera intrinsics
the JSON does not have. At 3 cm depth and 25° yaw the strip is a few pixels
wide and the approximation is not visible. If a future room has a 6 cm
box frame at 40°, revisit; until then this is enough.

Top and bottom faces are not drawn. With pitch ≈ 0 they are edge-on.

---

## Stage 5 — Merge and light

**Output:** `room-<id>-<sku>.jpg` at the room's full resolution, then through
the normal WebP ladder.

Order of operations matters. Everything below is a multiply or a screen on a
mask; nothing here touches the artwork's pixels except by uniform tone.

1. **Inherit the wall's own light.** Sample the room image's luminance inside
   the placement quad *before* compositing — that is bare plaster, so it is a
   clean gradient. Normalise by its mean. Multiply it onto the warped panel
   at `light.strength`. This alone removes the "pasted-on" look, because the
   poster now darkens toward the same corner the wall does. It is the
   Photoshop mockup Multiply-layer trick.

2. **Directional shade on the frame.** From `light.direction` and
   `elevationDeg`, the frame's front face gets a linear gradient across it
   (lit edge +6%, far edge −6%). The side face gets a flat factor: lit if it
   faces the light, else −25%.

3. **Cast shadow.** The frame stands `d` off the wall, so it casts a shadow on
   the wall away from the light. Take the placement quad ∪ side-face quad as a
   mask, offset it by `d · tan(elevation)` in the away-from-light direction
   (in wall cm, then project), Gaussian-blur by `softness · d` (projected),
   multiply onto the room at ~35–50% opacity. Composite the shadow **before**
   the panel so the frame occludes its own shadow.

4. **Contact shadow.** A second, tighter shadow: 1–2 px blur, low offset,
   right along the frame's near edges. This is what makes a frame read as
   touching the wall rather than floating.

5. **Composite** side face, then front face, over the shadowed room.

6. **Match grain.** Sample noise from a bare wall patch, add at the same
   amplitude over the panel only. Generated rooms carry grain; a resampled
   poster is smoother than its surroundings and the eye notices the seam.

7. Encode.

Nothing in this stage is generative and nothing in it is stochastic except
the grain, which is seeded from `sku + room id` so re-imports are
byte-identical.

---

## Why this is preferred over the baked frame

| | Baked frame (previous) | Bare wall (this) |
|---|---|---|
| Rooms needed | one per orientation band, ~4 × 6 | 6 total |
| Frame colour / profile | fixed at generation | any, from `frame-renders.json` |
| Poster size in room | fixed | any, per variant |
| Side face | photographed (better) | extruded (good enough at ≤ 35°) |
| Lighting | photographed, must match artwork | computed, matches by construction |
| Measurement | corner-find inside aperture | four clicks on the wall |
| Square poster | stranded in 3:4 aperture | fits exactly |

The one thing lost is the photographed side face. At the depths and angles a
poster shop uses it is not visible, and the extrusion is a couple of hours of
code. If that judgement turns out wrong, baked frames for portrait only —
57% of the shop — remains a valid fallback and the two routes share stages
3–5.

---

## Work to do

| # | Item | Size |
|---|---|---|
| 1 | Generate 6 rooms per stage 1 | hours, one-off |
| 2 | Click-to-measure HTML tool, writes stage-2 JSON | ~1 day |
| 3 | `templates.ts`: schema for `room-<id>.json`, load + validate | ½ day |
| 4 | `render.ts`: branch `Box | Quad`; wire `buildPanel` + `warpPanelIntoQuad` | ½ day |
| 5 | Side-face extrusion | ½ day |
| 6 | Stage 5 lighting: luminance transfer, shadow, contact shadow, grain | 1–2 days |
| 7 | `warp.ts` tests: checkerboard round-trip through `warpPanelIntoQuad` → inverse homography, assert pixel error | ½ day |
| 8 | Golden-image tests for stage 5 on one room × three orientations | ½ day |

Total roughly a week, of which none is generative and none recurs.

---

## Out of scope

- **Print masters** (blocker 2). Room views are display; they do not change
  the fact that nothing in the catalogue can fulfil an order.
- **Provenance** (blocker 3). Unresolved for the artwork; resolved for the
  rooms by using a licensed generator and keeping the prompt + receipt in the
  template folder.
- **Diptychs** (`set-of-2-3`). Two frames on one wall is a later feature;
  this pipeline places one panel per room.
