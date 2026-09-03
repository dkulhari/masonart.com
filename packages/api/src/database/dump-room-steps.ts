/**
 * Dump every intermediate artefact of the BARE-WALL route (render.ts,
 * stages 2–5 of docs/ROOM-MOCKUP-PIPELINE.md) for ONE poster, so each step
 * can be inspected as a file.
 *
 * Not part of the product — a one-off inspection helper, sibling of
 * dump-aperture-steps.ts. It replays renderSceneMockup step by step with the
 * same functions, writes what each one returned, then renders the real thing
 * and asserts the replay is byte-identical to it.
 *
 * Usage:
 *   bun run src/database/dump-room-steps.ts <poster> <outDir> --scene <room-<id>.json>
 *        [--frame black] [--poster-cm 60x80]
 *
 * The room image is the one the scene names, next to the scene file.
 */

import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyHomography, assertUsableQuad, quadPixelBounds, type Quad } from '../lib/room-mockup/homography';
import {
  addGrain,
  applyLuminance,
  quadMask,
  readRaw,
  seedFromKey,
  shadowLayer,
  unionBounds,
  wallGrainAmplitude,
  wallLuminanceField,
  type Bounds,
} from '../lib/room-mockup/lighting';
import { orientBuffer, orientFile } from '../lib/room-mockup/orient';
import { buildFramedPanel } from '../lib/room-mockup/panel';
import { renderSceneMockup } from '../lib/room-mockup/render';
import { loadRoomScene, type RoomScene } from '../lib/room-mockup/scene';
import { parsePosterCm, posterSizeToFill } from '../lib/room-mockup/sizing';
import { loadFrames } from '../lib/room-mockup/templates';
import { panelSizeForQuad, warpPanelIntoQuad } from '../lib/room-mockup/warp';
import {
  assertRectWithinMargin,
  centredRectCm,
  fitPosterCm,
  isAxisAligned,
  normaliseQuad,
  panelPixelsForRect,
  projectRectCm,
  pxPerCmAt,
  shadowOffsetCm,
  sideFaceRectCm,
  translateRect,
  wallHomography,
  type RectCm,
} from '../lib/room-mockup/wall';

// Same constants as render.ts (not exported there).
const CAST_OPACITY = 0.42;
const CONTACT_OPACITY = 0.5;
const CONTACT_BLUR_PX = 1.5;
const SIDE_LIT = 1.06;
const SIDE_SHADED = 0.75;

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--')));
const [posterPath, outDir] = positional;
const scenePath = flag('--scene');
if (!posterPath || !outDir || !scenePath) {
  throw new Error('Usage: dump-room-steps.ts <poster> <outDir> --scene <room.json> [--frame black] [--poster-cm WxH]');
}
mkdirSync(outDir, { recursive: true });

const dataDir = dirname(fileURLToPath(import.meta.url));
const frames = loadFrames(JSON.parse(readFileSync(join(dataDir, 'frame-renders.json'), 'utf-8')));
const frame = frames[flag('--frame') ?? 'black'];
if (!frame) throw new Error(`no frame "${flag('--frame')}"`);

// ---------------------------------------------------------------- stage 1 + 2
const scene: RoomScene = loadRoomScene(JSON.parse(readFileSync(scenePath, 'utf-8')), {
  imageExists: (f) => existsSync(join(dirname(scenePath), f)),
});
const roomPath = join(dirname(scenePath), scene.image);

const roomBuf = await orientFile(roomPath);
const rmeta = await sharp(roomBuf).metadata();
const W = rmeta.width!;
const H = rmeta.height!;

await sharp(roomBuf).png().toFile(join(outDir, '0-room-stage1.png'));
writeFileSync(join(outDir, '0-scene-stage2.json'), JSON.stringify(scene, null, 2));

// Stage 2 visualised: the wall quad, a 10 cm grid, anchor, allowable box, margin.
const wall = { widthCm: scene.wall.widthCm, heightCm: scene.wall.heightCm };
const h = wallHomography(scene.wall.quad, wall.widthCm, wall.heightCm, W, H);
const P = (x: number, y: number) => applyHomography(h, { x, y });
const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const rectPoly = (r: RectCm) => poly(projectRectCm(h, r));

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
for (let x = 0; x <= wall.widthCm; x += 10) {
  const a = P(x, 0), b = P(x, wall.heightCm);
  svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(0,120,255,${x % 50 === 0 ? 0.5 : 0.2})" stroke-width="1"/>`;
}
for (let y = 0; y <= wall.heightCm; y += 10) {
  const a = P(0, y), b = P(wall.widthCm, y);
  svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(0,120,255,${y % 50 === 0 ? 0.5 : 0.2})" stroke-width="1"/>`;
}
svg += `<polygon points="${rectPoly({ x: 0, y: 0, w: wall.widthCm, h: wall.heightCm })}" fill="none" stroke="#ff2d2d" stroke-width="4"/>`;
const m = scene.allowable.minMarginCm;
svg += `<polygon points="${rectPoly({ x: m, y: m, w: wall.widthCm - 2 * m, h: wall.heightCm - 2 * m })}" fill="none" stroke="#ff9900" stroke-width="2" stroke-dasharray="12,8"/>`;
const centreCm = { x: scene.anchor.x * wall.widthCm, y: scene.anchor.y * wall.heightCm };
svg += `<polygon points="${rectPoly(centredRectCm(centreCm, { widthCm: scene.allowable.maxWidthCm, heightCm: scene.allowable.maxHeightCm }))}" fill="none" stroke="#00b050" stroke-width="3"/>`;
const c = P(centreCm.x, centreCm.y);
svg += `<circle cx="${c.x}" cy="${c.y}" r="10" fill="#00b050"/>`;
const label = (t: string, i: number) => `<text x="20" y="${40 + i * 34}" font-family="Helvetica,Arial" font-size="28" fill="#111" stroke="#fff" stroke-width="6" paint-order="stroke">${t}</text>`;
svg += label(`red = wall.quad (${wall.widthCm}x${wall.heightCm} cm)`, 0);
svg += label(`blue = 10 cm grid, bold every 50 cm`, 1);
svg += label(`orange = minMargin ${m} cm`, 2);
svg += label(`green = allowable ${scene.allowable.maxWidthCm}x${scene.allowable.maxHeightCm} cm at anchor`, 3);
svg += label(`yaw ${scene.view.yawDeg} deg, near ${scene.view.nearSide}, light from ${scene.light.direction}`, 4);
svg += `</svg>`;
await sharp(roomBuf).composite([{ input: Buffer.from(svg) }]).png().toFile(join(outDir, '0b-scene-overlay-stage2.png'));

// ---------------------------------------------------------------- stage 3
const art = readFileSync(posterPath);
const oriented = await orientBuffer(art);
await sharp(oriented).jpeg({ quality: 95 }).toFile(join(outDir, '1-input-art.jpg'));
const ameta = await sharp(oriented).metadata();
const requested = flag('--poster-cm') ? parsePosterCm(flag('--poster-cm')!) : posterSizeToFill(ameta.width!, ameta.height!, frame.widthCm, scene.allowable);

const { poster, outer, scale } = fitPosterCm(requested, frame.widthCm, scene.allowable);
const rect = centredRectCm(centreCm, outer);
assertRectWithinMargin(rect, wall, scene.allowable.minMarginCm, scene.id);
const frontPx = projectRectCm(h, rect);
const frontN = normaliseQuad(frontPx, W, H);
assertUsableQuad(frontN, scene.id);

const px = panelPixelsForRect(panelSizeForQuad(frontN, W, H), outer);
const panel = await buildFramedPanel(oriented, poster, frame, px.width, px.height, scene.light);
writeFileSync(join(outDir, '2-panel-flat-stage3.png'), panel.png);

// ---------------------------------------------------------------- stage 4
const onMagenta = (layer: Buffer) =>
  sharp(layer, { raw: { width: W, height: H, channels: 4 } }).flatten({ background: { r: 255, g: 0, b: 255 } }).png();

const axisAligned = isAxisAligned(frontPx);
let front: Buffer;
if (axisAligned) {
  // Box path (render.ts placeFlat), inlined because it is not exported.
  const { fitIntoBox } = await import('../lib/room-mockup/geometry');
  const b = quadPixelBounds(frontN, W, H);
  const placed = fitIntoBox(panel.width, panel.height, { x: b.left / W, y: b.top / H, w: (b.right - b.left) / W, h: (b.bottom - b.top) / H }, W, H);
  const resized = await sharp(panel.png).resize(placed.width, placed.height).png().toBuffer();
  front = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: placed.left, top: placed.top }]).raw().toBuffer();
} else {
  front = await warpPanelIntoQuad(panel.png, panel.width, panel.height, frontN, W, H);
}
await onMagenta(front).toFile(join(outDir, '3a-front-warped-stage4a.png'));

const sideRect = sideFaceRectCm(rect, frame.depthCm, scene.view.yawDeg, scene.view.nearSide);
let side: Buffer | null = null;
let sideN: Quad | null = null;
if (sideRect) {
  sideN = normaliseQuad(projectRectCm(h, sideRect), W, H);
  assertUsableQuad(sideN, scene.id);
  const lit = scene.view.nearSide === scene.light.direction;
  const f = lit ? SIDE_LIT : SIDE_SHADED;
  const col: [number, number, number] = [Math.min(255, Math.round(frame.color[0] * f)), Math.min(255, Math.round(frame.color[1] * f)), Math.min(255, Math.round(frame.color[2] * f))];
  const swatch = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: col[0], g: col[1], b: col[2] } } }).png().toBuffer();
  side = await warpPanelIntoQuad(swatch, 2, 2, sideN, W, H);
  await onMagenta(side).toFile(join(outDir, '3b-side-face-stage4b.png'));
}

// ---------------------------------------------------------------- stage 5
const room = await readRaw(roomBuf, 3);
const bounds: Bounds = unionBounds(quadPixelBounds(frontN, W, H), sideN ? quadPixelBounds(sideN, W, H) : null);
const field = await wallLuminanceField(room, bounds, Math.max(2, (bounds.right - bounds.left) * 0.02));

// Visualise the field: 1.0 -> mid grey, stretched x8 so a 5% gradient is visible.
{
  const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top;
  const g = Buffer.alloc(bw * bh);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < field.length; i++) { mn = Math.min(mn, field[i]!); mx = Math.max(mx, field[i]!); g[i] = Math.max(0, Math.min(255, Math.round(128 + (field[i]! - 1) * 8 * 255))); }
  await sharp(g, { raw: { width: bw, height: bh, channels: 1 } }).png().toFile(join(outDir, '4a-luminance-field-stage5.1.png'));
  console.log(`luminance field over ${bw}x${bh}: min ${mn.toFixed(3)} max ${mx.toFixed(3)} (ratio to mean), strength ${scene.light.strength}`);
}
applyLuminance(front, W, H, field, bounds, scene.light.strength);
if (side) applyLuminance(side, W, H, field, bounds, scene.light.strength);
await onMagenta(front).toFile(join(outDir, '4b-front-after-luminance-stage5.1.png'));

const pxPerCm = pxPerCmAt(h, centreCm);
const shadowFor = async (kind: 'cast' | 'contact'): Promise<Buffer> => {
  const { dx, dy } = shadowOffsetCm(frame.depthCm, scene.light, kind);
  const rects: RectCm[] = [translateRect(rect, dx, dy)];
  if (sideRect) rects.push(translateRect(sideRect, dx, dy));
  const mask = await quadMask(rects.map((r) => normaliseQuad(projectRectCm(h, r), W, H)), W, H);
  const blur = kind === 'cast' ? Math.max(1, scene.light.softness * frame.depthCm * pxPerCm) : CONTACT_BLUR_PX;
  console.log(`${kind} shadow: offset ${dx.toFixed(2)},${dy.toFixed(2)} cm = ${(dx * pxPerCm).toFixed(1)},${(dy * pxPerCm).toFixed(1)} px, blur ${blur.toFixed(2)} px, opacity ${kind === 'cast' ? CAST_OPACITY : CONTACT_OPACITY}`);
  return shadowLayer(mask, W, H, blur, kind === 'cast' ? CAST_OPACITY : CONTACT_OPACITY);
};
const cast = await shadowFor('cast');
const contact = await shadowFor('contact');
const onWhite = (png: Buffer) => sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).composite([{ input: png, blend: 'over' }]).png();
await onWhite(cast).toFile(join(outDir, '4c-cast-shadow-stage5.3.png'));
await onWhite(contact).toFile(join(outDir, '4d-contact-shadow-stage5.4.png'));

const amp = wallGrainAmplitude(room, bounds);
const seedKey = basename(posterPath).replace(/\.[^.]+$/, '');
addGrain(front, W, H, amp, seedFromKey(`${seedKey}:${scene.id}`));
await onMagenta(front).toFile(join(outDir, '4e-front-after-grain-stage5.6.png'));
console.log(`grain amplitude sampled from wall: ${amp.toFixed(2)} levels`);

const layers: sharp.OverlayOptions[] = [{ input: cast, blend: 'over' }, { input: contact, blend: 'over' }];
if (side) layers.push({ input: side, raw: { width: W, height: H, channels: 4 }, blend: 'over' });
layers.push({ input: front, raw: { width: W, height: H, channels: 4 }, blend: 'over' });
const replay = await sharp(roomBuf).composite(layers).jpeg({ quality: 92 }).toBuffer();
writeFileSync(join(outDir, '5-final-stage5.jpg'), replay);

// 1:1 crop around the frame so side face, shadows and grain are visible.
{
  const pad = 60;
  const left = Math.max(0, bounds.left - pad), top = Math.max(0, bounds.top - pad);
  const width = Math.min(W - left, bounds.right - bounds.left + 2 * pad), height = Math.min(H - top, bounds.bottom - bounds.top + 2 * pad);
  await sharp(replay).extract({ left, top, width, height }).png().toFile(join(outDir, '5b-final-crop-1to1.png'));
  // Near edge at 4x: where the side face and contact shadow live.
  const nearX = scene.view.nearSide === 'right' ? bounds.right - 60 : bounds.left - 20;
  const ex = Math.max(0, Math.min(W - 80, nearX)), ey = Math.max(0, bounds.top + Math.round((bounds.bottom - bounds.top) * 0.4));
  await sharp(replay).extract({ left: ex, top: ey, width: 80, height: 80 }).resize(320, 320, { kernel: 'nearest' }).png().toFile(join(outDir, '5c-near-edge-4x.png'));
}

// Prove the replay is the renderer's own output.
const real = await renderSceneMockup(art, roomPath, scene, frame, { seedKey, ...(flag('--poster-cm') ? { posterCm: requested } : {}) });
const identical = real.equals(replay);
if (!identical) writeFileSync(join(outDir, '5-final-REAL-renderer.jpg'), real);
copyFileSync(roomPath, join(outDir, basename(roomPath)));

console.log(`\nroom ${W}x${H} (${scene.id}); poster requested ${requested.widthCm}x${requested.heightCm} cm, fitted ${poster.widthCm.toFixed(1)}x${poster.heightCm.toFixed(1)} cm (scale ${scale.toFixed(2)}), outer ${outer.widthCm.toFixed(1)}x${outer.heightCm.toFixed(1)} cm`);
console.log(`front quad px: ${frontPx.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ')}; path ${axisAligned ? 'Box' : 'Quad'}; panel ${panel.width}x${panel.height}; px/cm at anchor ${pxPerCm.toFixed(2)}`);
console.log(`side face: ${sideRect ? `${sideRect.w.toFixed(2)} cm = ${(sideRect.w * pxPerCm).toFixed(1)} px wide` : 'none (straight on)'}`);
console.log(`replay == renderSceneMockup: ${identical}`);
console.log(`wrote ${outDir}`);
