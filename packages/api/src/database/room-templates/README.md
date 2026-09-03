# Room templates

The authored assets for `bun run mockups:rooms`. Everything after this folder
is deterministic code; this folder is the only thing a person makes.

One room is three files:

| File | What | Made by |
|---|---|---|
| `room-<id>.png` | The bare-wall photograph, long edge ≥ 2048 | stage 1 (generator) |
| `room-<id>.prompt.txt` | The exact prompt, negative and model — provenance | stage 1 (generator) |
| `room-<id>.json` | The measured wall plane, anchor, view, light | stage 2 (you, with the click tool) |

`<id>` is a slug (`01`, `living-left`, …). The driver renders every
`room-*.json` it finds here and names the output `room-<id>.jpg`.

## 1. Generate the room

```bash
bun run --cwd packages/api mockups:generate-rooms            # all six
bun run --cwd packages/api mockups:generate-rooms --only 03  # one
```

Needs `GOOGLE_AI_STUDIO_KEY` (a billed key) in `.env`. Without one, take
`PROMPT.md` to any text-to-image model with a commercial licence and save the
result here as `room-<id>.png`. Keep the prompt and a receipt.

What the room must be (the generator's prompt says all of this; check the result):

- One bare, flat wall, ≥ 40% of the frame. Nothing hanging, no sconces, no switches.
- Camera yaw 15–35°, or straight on. Past ~40° the poster runs short of pixels.
- Flat, even light. **No hard shadows on the wall** — lighting is added in code.
- Low furniture only along the bottom edge. Sharp, deep focus.

## 2. Measure the wall

Open `packages/api/tools/room-measure.html` in a browser (it is a single file,
no server). Load the PNG. Click four corners of a rectangle on the wall, in
order top-left, top-right, bottom-right, bottom-left — typically skirting
board to ceiling line, and two verticals (a corner, a door jamb, two points
on one plumb line). Drag or nudge with the arrow keys to adjust.

**The grid is the check.** The page draws a 10 cm grid in wall space back
over the photo. If it lies flat on the wall and its verticals are plumb, the
quad is right. If it swims, it is not.

Then fill the fields and download `room-<id>.json` next to the PNG.

**Poster-box mode** (`mode` selector, or `?mode=box`): click the four corners
of where the framed poster should hang instead of the whole wall. That box
becomes the wall plane; the poster fills it at its own aspect, the yaw is
read off the box, and no centimetres are typed. The `/room-mockup` skill
runs this in your Chrome and reads the result off the page — see
`.claude/skills/room-mockup/SKILL.md`. `tools/serve-measure.ts` serves the
tool and the room images on `127.0.0.1:8765` for it.

| Field | Meaning |
|---|---|
| `wall.quad` | The four corners, normalised 0–1, wound tl → tr → br → bl |
| `wall.widthCm`, `heightCm` | Real size of that rectangle. Approximate is fine; a 2.6 m ceiling is a good anchor |
| `anchor` | Where the poster is centred, 0–1 across the wall rectangle. `y = 0.42` is where pictures actually hang |
| `allowable` | Largest poster that fits, and the margin to keep from the rectangle's edges |
| `view.yawDeg` | Negative = camera on the wall's left. `nearSide` is derived from it |
| `light` | The direction stage 5 lights from, its elevation, softness and strength |

Loading fails, naming the scene, if: the quad is mirrored or self-intersecting;
the yaw's sign disagrees with which vertical edge is longer; a declared
`nearSide` contradicts the yaw; the anchor ± the allowable maximum crosses the
margin; the largest poster projects to fewer than 400 px wide; or the PNG's
size differs from `imageSize`.

## 3. Render

```bash
bun run --cwd packages/api mockups:rooms --posters <dir> [--frame black] [--poster-cm 60x80] [--only 03,04]
```

Output per poster: `room-<id>.jpg` for each scene, `framed-main.jpg`, and a
`contact-sheet.jpg` to review. Same poster + same scene renders byte-identically.
