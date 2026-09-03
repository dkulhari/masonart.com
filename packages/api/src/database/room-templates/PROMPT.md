# Stage 1 prompt

Source of truth: `packages/api/src/lib/room-mockup/prompt.ts` (`roomPrompt`).
This copy is for pasting into a generator by hand when no API key is set.

## Prompt

Replace `{angle}` with one of:

- straight on: `The wall is seen straight on, its edges parallel to the picture edges.`
- yaw −25: `The wall is seen from a three-quarter angle, about 25 degrees off-axis to the left, so its horizontal edges converge gently.`
- yaw +25: same, `to the right`.

Replace `{furniture}` with the room's variant (e.g. `a linen sofa and a small side table`).

```
Photorealistic interior photograph of a modern living room. A large, completely
bare, flat wall of warm-white plaster fills most of the frame — nothing hanging
on it, no shelves, no switches, no sconces, no texture beyond plaster. {angle}
Ceiling line and skirting board both visible. Low furniture only along the
bottom edge: {furniture}. Soft, even, overcast daylight with no hard shadows
and no visible light source. Muted neutral palette. Shot on 50mm, f/8, deep
focus, high detail.
```

## Negative

```
picture, frame, poster, artwork, painting, shelf, sconce, lamp on wall, switch,
wallpaper pattern, hard shadow, sunbeam, glare, shallow depth of field, fisheye,
wide angle distortion, clutter, people
```

## The six rooms

| id | yaw | furniture |
|---|---|---|
| 01 | 0 | a linen sofa and a small side table |
| 02 | 0 | a low oak sideboard with a single ceramic vase |
| 03 | −25 | a linen sofa and a small side table |
| 04 | −30 | a bed with white linen, its headboard against the wall |
| 05 | +25 | a low oak sideboard with a single ceramic vase |
| 06 | +30 | a reading chair and a floor lamp that is switched off |

## Requirements (check the result against these)

| Requirement | Why |
|---|---|
| One bare wall occupying ≥ 40% of the frame | The placement area; the tool composites on top and cannot erase |
| Wall is a single flat plane | The homography assumes it; an alcove or column breaks it |
| Camera yaw 15–35°, pitch ≈ 0 (or straight on) | Enough angle to read as a real shot; past ~40° the poster runs short of pixels |
| Flat, even, soft light — no hard shadows on the wall | Lighting is added in code from a declared direction; baked light would fight it |
| Nothing hanging, no sconces, no switches in the placement area | Anything there shows through the mat edge or lands under the frame |
| Low furniture only along the bottom edge | Keeps the wall clear and gives the shot a floor line |
| Sharp, deep focus (f/8) | The wall's corners and edges are measured; bokeh degrades them |

Generate at ≥ 2048 on the long edge, or upscale before measuring. Do not seed
from the reference artwork in `.cache/seed-media/` — it carries a watermark.
Use a generator with a commercial licence and keep the receipt with the prompt.
