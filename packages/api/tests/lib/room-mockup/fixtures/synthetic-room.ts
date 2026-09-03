/**
 * A deterministic bare-wall room for renderer tests.
 *
 * Plaster that darkens to the right, faint seeded grain, and a darker floor
 * band along the bottom. The wall quad is known by construction, which is
 * what lets the renderer's output be asserted on: a probe point in wall cm
 * can be projected to the pixel it must have landed on.
 */

import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mulberry32 } from '../../../../src/lib/room-mockup/lighting';
import { loadRoomScene, type RoomScene } from '../../../../src/lib/room-mockup/scene';

export type RoomKind = 'angled' | 'straight';

export async function makeRoom(
  kind: RoomKind,
  w: number,
  h: number,
  over: { rotated?: boolean } = {}
): Promise<{ path: string; scene: RoomScene }> {
  const raw = Buffer.alloc(w * h * 3);
  const rnd = mulberry32(7);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const floor = y > h * 0.85;
      const base = floor ? 150 : 232 - 30 * (x / (w - 1));
      const grain = (rnd() - 0.5) * 6;
      const o = (y * w + x) * 3;
      raw[o] = Math.round(base + grain);
      raw[o + 1] = Math.round(base - 3 + grain);
      raw[o + 2] = Math.round(base - 10 + grain);
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'room-scene-'));
  const path = join(dir, `${kind}.${over.rotated ? 'jpg' : 'png'}`);

  let image = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  if (over.rotated) {
    // Stored w×h, tagged "rotate 90° CW": displays as h×w. The scene below
    // is written against the DISPLAYED size, as an operator would measure it.
    image = image.withMetadata({ orientation: 6 }).jpeg({ quality: 95 });
  } else {
    image = image.png();
  }
  writeFileSync(path, await image.toBuffer());

  const quad =
    kind === 'angled'
      ? { tl: [0.15, 0.1], tr: [0.8, 0.16], br: [0.8, 0.72], bl: [0.15, 0.82] }
      : { tl: [0.15, 0.1], tr: [0.85, 0.1], br: [0.85, 0.8], bl: [0.15, 0.8] };

  const scene = loadRoomScene(
    {
      id: `synthetic-${kind}`,
      image: `${kind}.${over.rotated ? 'jpg' : 'png'}`,
      imageSize: over.rotated ? [h, w] : [w, h],
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
