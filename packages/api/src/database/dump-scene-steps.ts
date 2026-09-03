/**
 * Dump the visible intermediate artefacts of the bare-wall route for ONE
 * poster, so each step can be inspected as a file. One-off helper; it calls
 * the same building blocks renderSceneMockup does, plus renderSceneMockup
 * itself for the authoritative final frame.
 *
 * Usage: dump-scene-steps.ts <poster> <scene.json> <outDir> [--frame slug]
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadRoomScene } from '../lib/room-mockup/scene';
import { loadFrames } from '../lib/room-mockup/templates';
import { orientBuffer } from '../lib/room-mockup/orient';
import { posterSizeForAspect } from '../lib/room-mockup/sizing';
import { buildFramedPanel } from '../lib/room-mockup/panel';
import { renderSceneMockup } from '../lib/room-mockup/render';
import { panelSizeForQuad, warpPanelIntoQuad } from '../lib/room-mockup/warp';
import {
  wallHomography, fitPosterCm, centredRectCm, projectRectCm, normaliseQuad, sideFaceRectCm,
} from '../lib/room-mockup/wall';

const [posterPath, scenePath, outDir] = process.argv.slice(2);
const frameSlug = process.argv.includes('--frame') ? process.argv[process.argv.indexOf('--frame') + 1]! : 'wood';
mkdirSync(outDir!, { recursive: true });

const sceneDir = dirname(scenePath!);
const scene = loadRoomScene(JSON.parse(readFileSync(scenePath!, 'utf-8')), {
  imageExists: (f) => existsSync(join(sceneDir, f)),
});
const frames = loadFrames(JSON.parse(readFileSync(join(import.meta.dir, 'frame-renders.json'), 'utf-8')));
const frame = frames[frameSlug]!;
const roomPath = join(sceneDir, scene.image);

const oriented = await orientBuffer(readFileSync(posterPath!));
await sharp(roomPath).jpeg({ quality: 92 }).toFile(join(outDir!, '0-room-bare-wall.jpg'));
await sharp(oriented).jpeg({ quality: 95 }).toFile(join(outDir!, '1-input-art.jpg'));

const ameta = await sharp(oriented).metadata();
const poster = posterSizeForAspect(ameta.width!, ameta.height!);
const { poster: fitted, outer } = fitPosterCm(poster, frame.widthCm, scene.allowable);
const rmeta = await sharp(roomPath).metadata();
const W = rmeta.width!, H = rmeta.height!;
const h = wallHomography(scene.wall.quad, scene.wall.widthCm, scene.wall.heightCm, W, H);
const centre = { x: scene.anchor.x * scene.wall.widthCm, y: scene.anchor.y * scene.wall.heightCm };
const rect = centredRectCm(centre, outer);
const frontN = normaliseQuad(projectRectCm(h, rect), W, H);
const ext = panelSizeForQuad(frontN, W, H);

const panel = await buildFramedPanel(oriented, fitted, frame, ext.width * 2, ext.height * 2, scene.light);
await sharp(panel.png).jpeg({ quality: 95 }).toFile(join(outDir!, '2-panel-flat-framed.jpg'));

const front = await warpPanelIntoQuad(panel.png, panel.width, panel.height, frontN, W, H);
await sharp(front, { raw: { width: W, height: H, channels: 4 } })
  .flatten({ background: { r: 255, g: 0, b: 255 } }).jpeg({ quality: 92 }).toFile(join(outDir!, '3-front-warped-on-magenta.jpg'));

const sideRect = sideFaceRectCm(rect, frame.depthCm, scene.view.yawDeg, scene.view.nearSide);
if (sideRect) {
  const sideN = normaliseQuad(projectRectCm(h, sideRect), W, H);
  const swatch = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: frame.color[0], g: frame.color[1], b: frame.color[2] } } }).png().toBuffer();
  const side = await warpPanelIntoQuad(swatch, 2, 2, sideN, W, H);
  await sharp(side, { raw: { width: W, height: H, channels: 4 } })
    .flatten({ background: { r: 255, g: 0, b: 255 } }).jpeg({ quality: 92 }).toFile(join(outDir!, '4-side-face-on-magenta.jpg'));
}

const final = await renderSceneMockup(readFileSync(posterPath!), roomPath, scene, frame, { seedKey: 'sample' });
await sharp(final).toFile(join(outDir!, '5-final-composite.jpg'));
console.log('wrote step artefacts to', outDir);
