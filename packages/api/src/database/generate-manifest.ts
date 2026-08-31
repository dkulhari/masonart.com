/**
 * Turn a folder of artwork into an import manifest.
 *
 * Run with:
 *   bun run manifest:from-folder --dir ./art --category Wabi-Sabi \
 *     --sku-prefix WS --price 1499.00 --limit 30 --out ./wabi-sabi.csv
 *
 * ## What this is for
 *
 * `db:import-catalogue` needs a CSV naming every product. Writing that by hand
 * for a folder of a few hundred files is not realistic, and the one column
 * nobody can fill by eye is `orientation` — the importer refuses a row whose
 * declared orientation the artwork contradicts (#545), so a guessed value fails
 * the row.
 *
 * This measures each picture the way the importer will and writes the answer
 * down, so the guard never fires on a manifest this produced.
 *
 * ## The measurement, and why it is done this way
 *
 * Not `width > height`. The importer stores every image as a 1500x1500 square
 * with the artwork matted inside it, then measures where the art landed. A
 * photographed piece carries a wall or a border, and trimming that is exactly
 * what `measureArtBox` does. So this runs the same two steps in the same order
 * — `matToSquare` then `measureArtBox` — and names the result with the same
 * shared function the guard uses. Agreement is by construction, not by luck.
 *
 * ## What it cannot do
 *
 * It cannot look at a picture and name it. `title` and `description` come out
 * as category-and-number placeholders, which are honest but dull, and `styles`
 * / `subjects` / `colors` / `rooms` come from the flags — the same values for
 * every row in the run. Both want a pass over the images before the catalogue
 * is customer-facing. The manifest is a CSV precisely so that pass can happen
 * in a spreadsheet.
 *
 * Facet values must come from the vocabularies in @chobii/shared
 * (`STYLE_OPTIONS`, `SUBJECT_OPTIONS`, `COLOR_OPTIONS`, `ROOM_OPTIONS`); the
 * API rejects anything else. The flags are validated against them at startup
 * rather than at import time, so a typo costs a second instead of a run.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import {
  COLOR_OPTIONS,
  ORIENTATION_RATIO_BREAKS,
  ROOM_OPTIONS,
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  orientationFromArtBox,
  type ProportionOrientation,
} from '@chobii/shared';

import { matToSquare, measureArtBox } from '../lib/image-processing';

/** Columns, in the order the importer documents them. */
export const MANIFEST_HEADER = [
  'sku',
  'title',
  'slug',
  'description',
  'basePrice',
  'orientation',
  'styles',
  'subjects',
  'colors',
  'rooms',
  'tags',
  'seoTitle',
  'seoDescription',
  'status',
  'isFeatured',
  'featuredOrder',
  'mainImage',
  'roomImages',
  'altText',
] as const;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

// ============================================================================
// Text
// ============================================================================

/**
 * A title reduced to the importer's slug rule, `/^[a-z0-9-]+$/`.
 *
 * Accents are folded rather than dropped, so "Górski" becomes "gorski" and not
 * "grski" — a slug is a URL someone may read aloud.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes close up rather than break the word: "Dawn's Edge" is
    // dawns-edge, not dawn-s-edge.
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * One CSV field, quoted only when it has to be.
 *
 * A description holding a comma is the ordinary case that breaks a naive
 * writer, and the importer counts columns per row — so a stray comma does not
 * corrupt one value, it fails the whole row.
 */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render rows as CSV under the given header, in header order. */
export function toCsv(
  rows: readonly Record<string, string>[],
  header: readonly string[]
): string {
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((column) => csvField(row[column] ?? '')).join(','));
  }
  return lines.join('\n');
}

// ============================================================================
// Measurement
// ============================================================================

/**
 * Name the proportion of one picture, exactly as the importer will.
 *
 * Falls back to the raw pixel ratio only when the art box cannot be measured —
 * a full-bleed image gives `measureArtBox` nothing to trim, and its own
 * dimensions are then the honest answer.
 */
export async function measureOrientation(
  input: Buffer
): Promise<ProportionOrientation> {
  const squared = await matToSquare(input);
  const box = await measureArtBox(squared);
  const measured = orientationFromArtBox(box);
  if (measured) return measured;

  const { width = 1, height = 1 } = await import('sharp').then((m) =>
    m.default(input).metadata()
  );
  const ratio = width / height;
  if (ratio >= ORIENTATION_RATIO_BREAKS.panoramic) return 'panoramic';
  if (ratio >= ORIENTATION_RATIO_BREAKS.landscape) return 'landscape';
  if (ratio >= ORIENTATION_RATIO_BREAKS.square) return 'square';
  return 'portrait';
}

// ============================================================================
// Rows
// ============================================================================

export interface ManifestOptions {
  /** Human-facing collection name, used in the placeholder title. */
  category: string;
  /** Short code leading every sku, e.g. `WS` gives `WS-0001`. */
  skuPrefix: string;
  basePrice: string;
  styles: string[];
  subjects: string[];
  colors: string[];
  rooms: string[];
  tags?: string[];
  status?: 'draft' | 'active' | 'archived';
}

export interface SourceImage {
  filename: string;
  buffer: Buffer;
}

export type ManifestRowOut = Record<(typeof MANIFEST_HEADER)[number], string>;

/**
 * Build one row per image, measuring each.
 *
 * Sequential rather than parallel on purpose: `matToSquare` decodes and resizes
 * a full-resolution photograph, and a folder of a few hundred run concurrently
 * will exhaust memory on a laptop long before it saturates the CPU.
 */
export async function buildManifestRows(
  images: readonly SourceImage[],
  opts: ManifestOptions
): Promise<ManifestRowOut[]> {
  const rows: ManifestRowOut[] = [];
  const usedSlugs = new Set<string>();

  for (const [index, image] of images.entries()) {
    const sequence = String(index + 1).padStart(4, '0');
    const sku = `${opts.skuPrefix}-${sequence}`;
    const title = `${opts.category} No. ${index + 1}`;

    // The title is generated, so collisions are possible the moment two runs
    // share a category. The sku is unique by construction, so it is what
    // breaks the tie.
    let slug = slugify(title);
    if (usedSlugs.has(slug)) slug = `${slug}-${slugify(sku)}`;
    usedSlugs.add(slug);

    const orientation = await measureOrientation(image.buffer);

    rows.push({
      sku,
      title,
      slug,
      description: `${opts.category} artwork, print ${index + 1} of the collection.`,
      basePrice: opts.basePrice,
      orientation,
      styles: opts.styles.join('|'),
      subjects: opts.subjects.join('|'),
      colors: opts.colors.join('|'),
      rooms: opts.rooms.join('|'),
      tags: (opts.tags ?? []).join('|'),
      seoTitle: `${title} | ${opts.category} Art Print`,
      seoDescription: `Shop ${title}, a ${opts.category.toLowerCase()} art print.`,
      status: opts.status ?? 'draft',
      isFeatured: 'false',
      featuredOrder: '',
      mainImage: image.filename,
      // The room-mockup generator (#701) fills this in; it needs room
      // templates that do not exist yet (#718).
      roomImages: '',
      altText: `${title} — ${opts.category} art print`,
    });
  }

  return rows;
}

// ============================================================================
// CLI
// ============================================================================

const USAGE = `
Usage:
  bun run manifest:from-folder --dir <path> --category <name> --sku-prefix <XX> [options]

Required:
  --dir <path>          Folder of artwork files
  --category <name>     Collection name, e.g. "Wabi-Sabi"
  --sku-prefix <XX>     Short code leading every sku, e.g. WS

Options:
  --price <n.nn>        Base price for every row (default 1499.00)
  --limit <n>           Take only the first n images
  --out <path>          Write here instead of stdout
  --styles a,b          Facet ids from @chobii/shared (default: none)
  --subjects a,b
  --colors a,b
  --rooms a,b
  --tags a,b
  --status <s>          draft (default), active, archived
`.trim();

const idsOf = (options: readonly { id: string }[]) => options.map((o) => o.id);

/** Reject a facet the API would reject, but a second into the run, not an hour. */
function checkFacet(
  name: string,
  values: string[],
  allowed: readonly string[]
): void {
  const bad = values.filter((v) => !allowed.includes(v));
  if (bad.length > 0) {
    throw new Error(
      `Unknown ${name}: ${bad.join(', ')}\n  Valid values: ${allowed.join(', ')}`
    );
  }
}

export function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const bare = new Set(['--help']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    if (bare.has(arg)) {
      flags.set(arg, 'true');
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} needs a value\n\n${USAGE}`);
    }
    flags.set(arg, value);
  }

  const list = (key: string) =>
    (flags.get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const dir = flags.get('--dir');
  const category = flags.get('--category');
  const skuPrefix = flags.get('--sku-prefix');

  if (!dir) throw new Error(`--dir is required\n\n${USAGE}`);
  if (!category) throw new Error(`--category is required\n\n${USAGE}`);
  if (!skuPrefix) throw new Error(`--sku-prefix is required\n\n${USAGE}`);

  const basePrice = flags.get('--price') ?? '1499.00';
  if (!/^\d+\.\d{2}$/.test(basePrice)) {
    throw new Error(`--price must be written with paise, e.g. 1499.00`);
  }

  const styles = list('--styles');
  const subjects = list('--subjects');
  const colors = list('--colors');
  const rooms = list('--rooms');

  checkFacet('style', styles, idsOf(STYLE_OPTIONS));
  checkFacet('subject', subjects, idsOf(SUBJECT_OPTIONS));
  checkFacet('color', colors, idsOf(COLOR_OPTIONS));
  checkFacet('room', rooms, idsOf(ROOM_OPTIONS));

  const limitRaw = flags.get('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('--limit needs a whole number above zero');
  }

  return {
    dir,
    category,
    skuPrefix,
    basePrice,
    styles,
    subjects,
    colors,
    rooms,
    tags: list('--tags'),
    status: (flags.get('--status') ?? 'draft') as ManifestOptions['status'],
    limit,
    out: flags.get('--out'),
  };
}

/** Image files in the folder, in a stable order a second run reproduces. */
function listImages(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
    );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const names = listImages(args.dir);
  if (names.length === 0) throw new Error(`No images found in ${args.dir}`);

  const taken = args.limit ? names.slice(0, args.limit) : names;
  console.error(`Measuring ${taken.length} of ${names.length} images...`);

  const images: SourceImage[] = [];
  const unreadable: string[] = [];

  for (const filename of taken) {
    try {
      images.push({ filename, buffer: readFileSync(join(args.dir, filename)) });
    } catch (error) {
      // A cloud-storage folder hands out filenames long before it hands out
      // bytes. Naming the files that failed is more useful than dying on the
      // first one.
      unreadable.push(filename);
    }
  }

  if (unreadable.length > 0) {
    console.error(
      `\n! ${unreadable.length} file(s) could not be read. If this folder is ` +
        `Google Drive or iCloud, make it available offline first:\n` +
        unreadable.slice(0, 5).map((f) => `    ${f}`).join('\n') +
        (unreadable.length > 5 ? `\n    ... and ${unreadable.length - 5} more` : '')
    );
    if (images.length === 0) throw new Error('Nothing readable to measure.');
  }

  const rows = await buildManifestRows(images, args);
  const csv = toCsv(rows, MANIFEST_HEADER);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.orientation] = (acc[r.orientation] ?? 0) + 1;
    return acc;
  }, {});
  console.error(
    `Measured: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  );

  if (args.out) {
    writeFileSync(args.out, `${csv}\n`);
    console.error(`\nWrote ${rows.length} rows to ${args.out}`);
    console.error(
      `Next: bun run db:import-catalogue --manifest ${args.out} ` +
        `--media-dir ${args.dir} --dry-run`
    );
  } else {
    console.log(csv);
  }
}

// Importing this module for its exports must not run the CLI.
if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
