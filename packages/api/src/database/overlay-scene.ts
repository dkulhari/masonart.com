/** Draw a scene's wall grid, anchor and allowable box back over the room, to check the quad. */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { wallHomography, centredRectCm, projectRectCm, type RectCm } from '../lib/room-mockup/wall';
import { applyHomography, type Matrix3, type Quad } from '../lib/room-mockup/homography';

const [scenePath, roomPath, outPath] = process.argv.slice(2);
const d = JSON.parse(readFileSync(scenePath!, 'utf-8'));
const q = d.wall.quad;
const quad: Quad = [
  { x: q.tl[0], y: q.tl[1] }, { x: q.tr[0], y: q.tr[1] },
  { x: q.br[0], y: q.br[1] }, { x: q.bl[0], y: q.bl[1] },
];
const room = await sharp(roomPath!).removeAlpha();
const meta = await room.metadata();
const W = meta.width!, H = meta.height!;
const h: Matrix3 = wallHomography(quad, d.wall.widthCm, d.wall.heightCm, W, H);
const P = (xcm: number, ycm: number) => applyHomography(h, { x: xcm, y: ycm });

const lines: string[] = [];
for (let x = 0; x <= d.wall.widthCm; x += 10) { const a = P(x, 0), b = P(x, d.wall.heightCm); lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(80,180,255,0.55)" stroke-width="1"/>`); }
for (let y = 0; y <= d.wall.heightCm; y += 10) { const a = P(0, y), b = P(d.wall.widthCm, y); lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(80,180,255,0.55)" stroke-width="1"/>`); }
const qp = quad.map(p => ({ x: p.x * W, y: p.y * H }));
lines.push(`<polygon points="${qp.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#2ecc40" stroke-width="3"/>`);
const centre = { x: d.anchor.x * d.wall.widthCm, y: d.anchor.y * d.wall.heightCm };
const box: RectCm = centredRectCm(centre, { widthCm: d.allowable.maxWidthCm, heightCm: d.allowable.maxHeightCm });
const bq = projectRectCm(h, box);
lines.push(`<polygon points="${bq.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#ff9f1c" stroke-width="3" stroke-dasharray="10 6"/>`);
const a = P(centre.x, centre.y);
lines.push(`<line x1="${a.x-14}" y1="${a.y}" x2="${a.x+14}" y2="${a.y}" stroke="#ff3860" stroke-width="3"/><line x1="${a.x}" y1="${a.y-14}" x2="${a.x}" y2="${a.y+14}" stroke="#ff3860" stroke-width="3"/>`);
const m = d.allowable.minMarginCm;
const mq = projectRectCm(h, { x: m, y: m, w: d.wall.widthCm - 2*m, h: d.wall.heightCm - 2*m });
lines.push(`<polygon points="${mq.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="rgba(200,200,200,0.8)" stroke-width="2" stroke-dasharray="6 6"/>`);

const svg = Buffer.from(`<svg width="${W}" height="${H}">${lines.join('')}</svg>`);
await sharp(await room.toBuffer()).composite([{ input: svg }]).jpeg({ quality: 90 }).toFile(outPath!);
console.log('wrote', outPath);
