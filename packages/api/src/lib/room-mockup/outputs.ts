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
  /**
   * The file a reviewer would delete to reject this candidate
   * (`room-<id>.jpg`). Optional so existing callers that only ever set
   * `label` keep compiling and rendering a single-line caption.
   */
  file?: string;
  image: Buffer;
}

const GUTTER = 16;
const CAPTION = 52;

// Character budgets are expressed as "chars per pixel of cellSize" rather
// than flat numbers, derived from the values this was tuned against: ~42
// characters for the numbered label and ~56 for the filename (it renders in
// a smaller face) at the default 420px cell. A caller passing a different
// cellSize gets a budget scaled to match, instead of a number tuned for a
// cell it never asked for. Exported so tests can derive the same budget the
// implementation uses rather than duplicating the magic numbers.
export const LABEL_CHARS_PER_CELL_PX = 42 / 420;
export const FILE_CHARS_PER_CELL_PX = 56 / 420;

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

  const labelBudget = Math.max(1, Math.round(cellSize * LABEL_CHARS_PER_CELL_PX));
  const fileBudget = Math.max(1, Math.round(cellSize * FILE_CHARS_PER_CELL_PX));

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

    // The filename is reference text, not the headline — it renders smaller
    // and dimmer, on its own line, so a long label can't push it off the
    // edge of the cell the way concatenating them into one string did.
    const labelLine = escapeXml(truncateCaptionLine(`${i + 1}. ${entry.label}`, labelBudget));
    const fileLine = entry.file ? escapeXml(truncateCaptionLine(entry.file, fileBudget)) : null;

    const caption = Buffer.from(
      `<svg width="${cellSize}" height="${CAPTION}">
         <text x="0" y="22" font-family="sans-serif" font-size="20" fill="#111">${labelLine}</text>
         ${fileLine ? `<text x="0" y="42" font-family="sans-serif" font-size="13" fill="#767676">${fileLine}</text>` : ''}
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

/**
 * Truncates to a fixed character budget with a trailing ellipsis, so a caption
 * line can never overflow the fixed-width SVG cell it is rendered into (there
 * is no wrapping or clipping at the sharp/SVG layer to fall back on). Exported
 * so its behaviour can be asserted directly — the rendered SVG text content
 * isn't something a test can otherwise check without image diffing.
 */
export function truncateCaptionLine(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}…`;
}
