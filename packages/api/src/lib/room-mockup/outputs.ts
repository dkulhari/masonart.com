/**
 * The two outputs that are not room mockups.
 */

import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { frameArtwork } from './render';
import type { FrameRender } from './templates';

/** Margin round the framed art, as a fraction of each edge's own length. */
const MAIN_MARGIN = 0.06;

/**
 * The file to upload as the product's main image: framed artwork on the
 * catalogue's mat colour.
 *
 * Deliberately NOT squared. buildProductMedia() (lib/product-media.ts) mats,
 * squares and measures every upload already; squaring here as well would put
 * the square contract in two places, and they would drift.
 *
 * The margin is computed per axis (a fraction of width, a fraction of
 * height) rather than as one flat pixel amount derived from the longer
 * edge. A single flat margin added to all four sides of a non-square
 * rectangle pulls its aspect ratio toward square — for a 500x1000 art this
 * shifted the ratio from ~0.53 to ~0.58, i.e. exactly the squaring this
 * function exists to avoid. Scaling each axis by its own edge preserves the
 * framed rectangle's aspect ratio instead.
 */
export async function renderFramedMain(art: Buffer, frame: FrameRender): Promise<Buffer> {
  const framed = await frameArtwork(art, frame);
  const meta = await sharp(framed).metadata();

  const marginX = Math.round((meta.width ?? 0) * MAIN_MARGIN);
  const marginY = Math.round((meta.height ?? 0) * MAIN_MARGIN);

  return sharp(framed)
    .extend({
      top: marginY,
      bottom: marginY,
      left: marginX,
      right: marginX,
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
