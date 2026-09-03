/**
 * Stage 1: the room prompt.
 *
 * The room is the one generated thing in the pipeline, and it is generated
 * for what a text-to-image model is good at — a believable space, furniture,
 * a camera angle, materials — and for nothing that stage 5 will have to
 * reason about later. Hence a bare wall, flat light and deep focus. "No hard
 * shadows" is the load-bearing clause: it is why one room can be lit from
 * either side in code.
 */

export interface RoomSpec {
  /** Becomes `room-<id>.png` / `room-<id>.json`. Slug. */
  id: string;
  /** Negative = camera on the wall's left. 0 = straight on (the cheap Box path). */
  yawDeg: number;
  /** The furniture along the bottom edge; the only thing that varies between rooms. */
  variant: string;
}

/** Six rooms: two straight-on, two yaw-left, two yaw-right. Enough for the shop. */
export const DEFAULT_ROOMS: readonly RoomSpec[] = [
  { id: '01', yawDeg: 0, variant: 'a linen sofa and a small side table' },
  { id: '02', yawDeg: 0, variant: 'a low oak sideboard with a single ceramic vase' },
  { id: '03', yawDeg: -25, variant: 'a linen sofa and a small side table' },
  { id: '04', yawDeg: -30, variant: 'a bed with white linen, its headboard against the wall' },
  { id: '05', yawDeg: 25, variant: 'a low oak sideboard with a single ceramic vase' },
  { id: '06', yawDeg: 30, variant: 'a reading chair and a floor lamp that is switched off' },
];

export const NEGATIVE_PROMPT =
  'picture, frame, poster, artwork, painting, shelf, sconce, lamp on wall, switch, ' +
  'wallpaper pattern, hard shadow, sunbeam, glare, shallow depth of field, fisheye, ' +
  'wide angle distortion, clutter, people';

export function roomPrompt(
  yawDeg: number,
  variant: string = DEFAULT_ROOMS[0]!.variant
): { prompt: string; negative: string } {
  const angle =
    yawDeg === 0
      ? 'The wall is seen straight on, its edges parallel to the picture edges.'
      : `The wall is seen from a three-quarter angle, about ${Math.abs(yawDeg)} degrees off-axis to the ${yawDeg < 0 ? 'left' : 'right'}, so its horizontal edges converge gently.`;

  const prompt =
    'Photorealistic interior photograph of a modern living room. A large, completely bare, flat wall ' +
    'of warm-white plaster fills most of the frame — nothing hanging on it, no shelves, no switches, ' +
    `no sconces, no texture beyond plaster. ${angle} Ceiling line and skirting board both visible. ` +
    `Low furniture only along the bottom edge: ${variant}. Soft, even, overcast daylight with no hard ` +
    'shadows and no visible light source. Muted neutral palette. Shot on 50mm, f/8, deep focus, high detail.';

  return { prompt, negative: NEGATIVE_PROMPT };
}
