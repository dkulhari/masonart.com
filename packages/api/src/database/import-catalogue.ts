/**
 * Bulk catalogue import: a CSV manifest plus a folder of images becomes real
 * products, with every image processed by the same code the admin upload runs.
 *
 * Run with: bun run db:import-catalogue --manifest ./catalogue.csv --media-dir ./art
 *
 * ## The manifest
 *
 * One row per product. The header names the columns and the order does not
 * matter. Columns marked "list" hold several values separated by a pipe (`|`),
 * because a comma would break the CSV.
 *
 * | Column           | Required | Notes                                                     |
 * |------------------|----------|-----------------------------------------------------------|
 * | `sku`            | yes      | The identity. Re-importing the same sku updates it.       |
 * | `title`          | yes      | Shown on the storefront.                                  |
 * | `slug`           | yes      | Lowercase letters, numbers and hyphens only.              |
 * | `description`    | no       |                                                           |
 * | `basePrice`      | yes      | Always two decimals: `1499.00`. No symbol, no commas.     |
 * | `orientation`    | yes      | square, portrait, landscape or panoramic (see below)      |
 * | `styles`         | no       | list                                                      |
 * | `subjects`       | no       | list                                                      |
 * | `colors`         | no       | list                                                      |
 * | `rooms`          | no       | list                                                      |
 * | `tags`           | no       | list                                                      |
 * | `seoTitle`       | no       |                                                           |
 * | `seoDescription` | no       |                                                           |
 * | `status`         | no       | draft (default), active, archived                         |
 * | `isFeatured`     | no       | true / false                                              |
 * | `featuredOrder`  | no       | whole number                                              |
 * | `mainImage`      | yes      | Filename inside --media-dir. The artwork itself.          |
 * | `roomImages`     | no       | list of filenames inside --media-dir.                     |
 * | `altText`        | no       | Describes the picture for screen readers.                 |
 * | `orientationOverride` | no  | true only to keep an orientation the artwork disagrees with |
 *
 * Worked example — two products, header first:
 *
 * ```csv
 * sku,title,slug,basePrice,orientation,styles,mainImage,roomImages,altText
 * ABS-001,Cosmic Harmony,cosmic-harmony,1499.00,portrait,abstract|modern,sa126-main.webp,sa126-room-0.webp|sa126-room-1.webp,Cosmic Harmony abstract art
 * ABS-002,Paper Layers,paper-layers,1899.00,landscape,minimal,pl-main.webp,,Layered paper artwork
 * ```
 *
 * With those two rows, `--media-dir ./art` must contain `sa126-main.webp`,
 * `sa126-room-0.webp`, `sa126-room-1.webp` and `pl-main.webp`.
 *
 * ## Always dry-run first
 *
 * `--dry-run` reads the whole manifest, checks every value and confirms every
 * named file is really there — and writes nothing at all. No database row, no
 * upload. Run it, fix what it reports, then run for real.
 *
 * ## Why it goes through buildProductMedia
 *
 * Inserting image rows directly would be faster and would produce products the
 * storefront grid renders wrong. `buildProductMedia` is what enforces the
 * square contract the grid rests on: the main artwork is matted at 88% and
 * never cropped, its art box is measured, the four-size WebP ladder is built,
 * and the untouched source is retained so a crop can be revised later. Room
 * mockups are cropped to the centred square, which is the right default for a
 * photograph of a wall.
 *
 * ## Every product gets its sizes
 *
 * Each imported product also gets the full size ladder for its orientation,
 * priced off its own `basePrice`. Without that it has no size to pick and no
 * price to charge — the page renders and nothing can be bought.
 *
 * `round` and `set-of-2-3` have no ladder, so a row declaring one **fails**
 * and is reported. It is not quietly sold as a portrait; that would price and
 * size it for a rectangle it is not.
 *
 * ## What re-running does
 *
 * Identity is `sku`. A row whose sku already exists updates that product
 * rather than making a second one. Its images are left alone unless
 * `--force-media` is passed, because reprocessing costs about 400ms and one
 * upload per image and almost never changes anything.
 *
 * Sizes are matched on `variantSku` and updated in place, never deleted and
 * re-made: cart lines cascade off these rows and order history points at them.
 * A size that leaves the ladder is deactivated, not removed. Stock is never
 * reset by a re-import — once the shop is live, the admin's number is the real
 * one.
 *
 * One bad row does not stop the run. Every failure is collected, the rest of
 * the manifest still imports, and the process exits non-zero with a report
 * naming the row number, the sku and the reason.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { orientationContradictingArt, type ProductImage } from '@chobii/shared';
import { z } from 'zod';

import { buildVariantsForOrientation } from './seed-variants';
import type { NewProductVariant } from './schema';

// ============================================================================
// Manifest parsing
// ============================================================================

/** Columns holding several values, pipe-separated. */
const LIST_COLUMNS = [
  'styles',
  'subjects',
  'colors',
  'rooms',
  'tags',
  'roomImages',
] as const;

const ORIENTATIONS = [
  'square',
  'portrait',
  'landscape',
  'panoramic',
  'round',
  'set-of-2-3',
] as const;

/** A filename that stays inside the media dir — no separators, no `..`. */
const plainFilename = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((value) => value === basename(value) && value !== '..', {
      message: `${label} must be a filename inside --media-dir, not a path`,
    });

/**
 * Mirrors `createProductSchema` in routes/admin/products.ts, minus the fields a
 * CSV has no way to express (images, artistId, the AI provenance pair). Kept as
 * its own schema rather than imported because the route's version is module-
 * private and takes already-typed JSON — this one takes strings off a CSV and
 * is the place the string-to-value coercion is spelled out.
 */
const manifestRowSchema = z.object({
  sku: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(5000).optional(),
  /**
   * Stricter than the admin route, which also accepts a bare `1499`.
   *
   * Deliberate. A human typing one product into the form sees the price render
   * back and catches a slip; nobody watches a 300-row manifest go in. Demanding
   * the paise be written out means a truncating spreadsheet export ("1499.50"
   * becoming "1500") fails the dry-run instead of quietly repricing the
   * catalogue. Every price in seed.ts is already in this form.
   */
  basePrice: z.string().regex(/^\d+\.\d{2}$/, 'Invalid price format — write the paise, e.g. 1499.00'),
  orientation: z.enum(ORIENTATIONS),
  styles: z.array(z.string()).default([]),
  subjects: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  rooms: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  isFeatured: z.boolean().default(false),
  featuredOrder: z.number().int().nullable().default(null),
  /**
   * A bare filename, never a path.
   *
   * The manifest is a text file an operator edits; `../../etc/passwd` in this
   * cell must not become something the importer opens and uploads. Rejecting
   * the separator here is cheaper than sanitising every use downstream.
   */
  mainImage: plainFilename('mainImage'),
  roomImages: z.array(plainFilename('roomImages')).default([]),
  altText: z.string().max(300).default(''),
  orientationOverride: z.boolean().default(false),
});

export type ManifestRow = z.infer<typeof manifestRowSchema>;

export interface ManifestError {
  /** 1-based line number in the file, so the header is row 1. */
  row: number;
  /** Present whenever the row got far enough to have one — a blank sku will not. */
  sku?: string;
  message: string;
}

export interface ParsedManifest {
  rows: ManifestRow[];
  errors: ManifestError[];
}

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * Hand-rolled rather than pulled from a library: the manifest is a flat table
 * of short strings, and the only thing a naive `split(',')` gets wrong is a
 * description containing a comma. Doubled quotes inside a quoted field are the
 * CSV escape for a literal quote.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

/** `abstract|modern` becomes two values; an empty cell becomes no values. */
function splitList(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Coerce one row of raw strings into the shape the schema wants.
 *
 * Empty cells are dropped rather than passed through as `''`, so an omitted
 * optional column reads as absent instead of as an empty title.
 */
function coerceRow(cells: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(cells)) {
    const value = raw.trim();

    if ((LIST_COLUMNS as readonly string[]).includes(key)) {
      out[key] = splitList(value);
      continue;
    }

    if (value === '') continue;

    if (key === 'isFeatured' || key === 'orientationOverride') {
      out[key] = value.toLowerCase() === 'true';
    } else if (key === 'featuredOrder') {
      const n = Number(value);
      // A non-numeric value is handed to zod as-is so the operator sees
      // "expected number", not a silent NaN written into the column.
      out[key] = Number.isInteger(n) ? n : value;
    } else {
      out[key] = value;
    }
  }

  return out;
}

/** The first zod problem, phrased for someone editing a spreadsheet. */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid row';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Read the whole manifest, validating every row.
 *
 * A bad row becomes an entry in `errors` carrying its line number, never a
 * throw: the operator wants every problem in the file at once, not the first
 * one. Rows that pass come back in `rows`, so a partially broken manifest still
 * imports everything that was fine.
 */
export function parseManifest(csv: string): ParsedManifest {
  const rows: ManifestRow[] = [];
  const errors: ManifestError[] = [];

  const lines = csv.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);

  if (headerIndex === -1) {
    return { rows, errors: [{ row: 1, message: 'Manifest is empty' }] };
  }

  const header = splitCsvLine(lines[headerIndex]!).map((h) => h.trim());

  if (!header.includes('sku')) {
    return {
      rows,
      errors: [
        {
          row: headerIndex + 1,
          message: `Header has no 'sku' column. Found: ${header.join(', ')}`,
        },
      ],
    };
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;

    const rowNumber = i + 1;
    const cells = splitCsvLine(line);

    if (cells.length !== header.length) {
      errors.push({
        row: rowNumber,
        message: `Expected ${header.length} columns, found ${cells.length}`,
      });
      continue;
    }

    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? '';
    });

    const parsed = manifestRowSchema.safeParse(coerceRow(record));

    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        // The sku is the operator's handle on the row, so carry it even when
        // the row failed on something else entirely.
        ...(record.sku?.trim() ? { sku: record.sku.trim() } : {}),
        message: firstIssue(parsed.error),
      });
      continue;
    }

    rows.push(parsed.data);
  }

  return { rows, errors };
}

// ============================================================================
// Media resolution
// ============================================================================

/** The two image roles a manifest can express. */
type ImportedImageType = 'main' | 'room-mockup';

export interface ResolvedFile {
  type: ImportedImageType;
  filename: string;
  /** Absolute path under the media dir. */
  path: string;
  sortOrder: number;
}

export interface ResolvedMedia {
  /** Main first, then the room mockups in manifest order. */
  files: ResolvedFile[];
  /** Filenames named by the row that are not in the media dir. */
  missing: string[];
}

/** Filenames the manifest points at, in the order they should be stored. */
export interface MediaRefs {
  mainImage: string;
  roomImages: string[];
}

/**
 * Turn the filenames in one row into paths under the media dir.
 *
 * Every named file is checked for real, because the whole value of `--dry-run`
 * is finding the typo before an hour-long load rather than during it. A name
 * that is not there lands in `missing` and the caller fails that row; nothing
 * is thrown, so the rest of the manifest still runs.
 *
 * Ordering is the storefront's: the matted artwork is image 0 and the room
 * mockups follow it in the order the operator wrote them.
 */
export function resolveMedia(row: MediaRefs, mediaDir: string): ResolvedMedia {
  const files: ResolvedFile[] = [];
  const missing: string[] = [];

  const named: Array<{ type: ImportedImageType; filename: string }> = [
    { type: 'main', filename: row.mainImage },
    ...row.roomImages.map((filename) => ({
      type: 'room-mockup' as const,
      filename,
    })),
  ];

  named.forEach(({ type, filename }, index) => {
    // Re-basename defensively: the schema already refuses a path, but this
    // function is exported and a caller could hand it an unvalidated row.
    const safe = basename(filename);
    const path = join(mediaDir, safe);

    if (!existsSync(path) || !statSync(path).isFile()) {
      missing.push(filename);
      return;
    }

    files.push({ type, filename: safe, path, sortOrder: index });
  });

  return { files, missing };
}

// ============================================================================
// Size ladder
// ============================================================================

/** The orientations `buildVariantsForOrientation` has a ladder for. */
const LADDERED_ORIENTATIONS = new Set(['square', 'portrait', 'landscape', 'panoramic']);

/** What a manifest row needs to carry for its ladder to be built. */
export interface VariantSource {
  sku: string;
  orientation: string;
  basePrice: string;
}

/**
 * Build the whole size ladder for one imported product.
 *
 * A product with no variants has no size to pick and no price to charge — the
 * PDP renders and nothing can be bought. So this runs for every imported row,
 * not as an extra.
 *
 * The ladder itself comes from `buildVariantsForOrientation`, which is the
 * single source of truth for sizes and pricing. It is not reimplemented here:
 * `seed-variants.ts` exists precisely because a hand-written second copy in
 * seed.ts drifted from the shared ladder and silently won.
 *
 * Returns an empty array for an orientation with no ladder (`round`,
 * `set-of-2-3`). The caller fails that row. The seeder's answer is to fall back
 * to portrait (seed.ts:1694) and that is wrong here: a round poster sold
 * against a portrait ladder is priced and sized for a rectangle it is not, and
 * an unattended bulk load is exactly where nobody notices.
 */
export function buildVariantRows(
  row: VariantSource
): Omit<NewProductVariant, 'productId'>[] {
  if (!LADDERED_ORIENTATIONS.has(row.orientation)) return [];

  const templates = buildVariantsForOrientation(
    row.orientation as Parameters<typeof buildVariantsForOrientation>[0],
    parseFloat(row.basePrice)
  );

  return templates.map((template) => ({
    ...template,
    // The handle a re-import matches on. `variant_sku` carries no unique
    // constraint in the schema, so this string is the only thing standing
    // between a second import and a doubled size list.
    variantSku: `${row.sku}-${template.widthInches}x${template.heightInches}`,
  }));
}

// ============================================================================
// Import driver
// ============================================================================

export interface ImportOptions {
  /** The manifest's *contents*, not its path. */
  manifest: string;
  mediaDir: string;
  /** Validate everything, write nothing — no database row, no upload. */
  dryRun?: boolean;
  /** Stop after this many rows. Useful for a first cautious real run. */
  limit?: number;
  /** Reprocess and re-upload images even for a product that already has them. */
  forceMedia?: boolean;
}

export interface ImportFailure {
  row: number;
  sku?: string;
  reason: string;
}

export interface ImportReport {
  /** Rows that passed validation and whose media is all present. */
  validated: number;
  created: number;
  updated: number;
  /** Existing products whose images were left alone (no --force-media). */
  mediaSkipped: number;
  /**
   * Variants the validated rows call for.
   *
   * Reported by the dry-run too, because "the import worked" and "the
   * catalogue is purchasable" are different claims and the pre-flight should
   * answer both.
   */
  variantsPlanned: number;
  /** Variants actually inserted or updated. */
  variantsWritten: number;
  failures: ImportFailure[];
}

/** MIME type from the extension — the only thing S3 needs it for is the header. */
function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'image/jpeg';
  }
}

/**
 * The columns a manifest owns, ready for insert or update.
 *
 * Images are deliberately not here: they cost an upload each and are decided
 * separately, so that re-running a manifest to fix a typo in a title does not
 * rebuild four images per product.
 */
function productColumns(row: ManifestRow) {
  return {
    sku: row.sku,
    title: row.title,
    slug: row.slug,
    description: row.description ?? null,
    basePrice: row.basePrice,
    styles: row.styles,
    subjects: row.subjects,
    colors: row.colors,
    rooms: row.rooms,
    tags: row.tags,
    orientation: row.orientation,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    status: row.status,
    isFeatured: row.isFeatured,
    featuredOrder: row.featuredOrder,
  };
}

/**
 * Run a manifest.
 *
 * Per-row isolation is the rule: anything that goes wrong with one product is
 * recorded against its row number and the run continues. The caller decides
 * what a non-empty `failures` means — the CLI below exits non-zero.
 *
 * Under `--dry-run` this loads neither the database module nor the storage
 * client. That is why they are imported inside the write path rather than at
 * the top of the file: "writes nothing" should be true because there is nothing
 * connected to write with, not because a flag was checked in the right places.
 */
export async function importCatalogue(
  options: ImportOptions
): Promise<ImportReport> {
  const { manifest, mediaDir, dryRun = false, limit, forceMedia = false } = options;

  const report: ImportReport = {
    validated: 0,
    created: 0,
    updated: 0,
    mediaSkipped: 0,
    variantsPlanned: 0,
    variantsWritten: 0,
    failures: [],
  };

  if (!existsSync(mediaDir)) {
    report.failures.push({
      row: 0,
      reason: `--media-dir does not exist: ${mediaDir}`,
    });
    return report;
  }

  const { rows, errors } = parseManifest(manifest);

  for (const error of errors) {
    report.failures.push({
      row: error.row,
      ...(error.sku ? { sku: error.sku } : {}),
      reason: error.message,
    });
  }

  const selected = typeof limit === 'number' ? rows.slice(0, limit) : rows;

  // Two products claiming one slug is a manifest bug the database would only
  // surface halfway through the run, after the first of them was already
  // written. Catching it here keeps --dry-run honest about what will happen.
  const seenSlugs = new Map<string, string>();
  const seenSkus = new Map<string, string>();

  for (const row of selected) {
    // Row numbers come off the file; recovering one here means finding the row
    // again by sku, which is unique per manifest by the check just below.
    const rowNumber = manifestRowNumber(manifest, row.sku);

    const duplicateSku = seenSkus.get(row.sku);
    if (duplicateSku) {
      report.failures.push({
        row: rowNumber,
        sku: row.sku,
        reason: `Duplicate sku in the manifest — also used by "${duplicateSku}"`,
      });
      continue;
    }
    seenSkus.set(row.sku, row.title);

    const duplicateSlug = seenSlugs.get(row.slug);
    if (duplicateSlug) {
      report.failures.push({
        row: rowNumber,
        sku: row.sku,
        reason: `Duplicate slug "${row.slug}" — also used by sku ${duplicateSlug}`,
      });
      continue;
    }
    seenSlugs.set(row.slug, row.sku);

    const media = resolveMedia(row, mediaDir);
    if (media.missing.length > 0) {
      report.failures.push({
        row: rowNumber,
        sku: row.sku,
        reason: `Not in --media-dir: ${media.missing.join(', ')}`,
      });
      continue;
    }

    // Checked before the row counts as validated, so --dry-run refuses a
    // catalogue that would import as unbuyable rather than reporting success.
    const variants = buildVariantRows(row);
    if (variants.length === 0) {
      report.failures.push({
        row: rowNumber,
        sku: row.sku,
        reason:
          `No size ladder for orientation "${row.orientation}", so this ` +
          `product would have nothing to sell. Give it a laddered ` +
          `orientation (square, portrait, landscape, panoramic).`,
      });
      continue;
    }

    report.validated++;
    report.variantsPlanned += variants.length;

    if (dryRun) continue;

    try {
      await writeRow(row, media, variants, { forceMedia }, report);
    } catch (error) {
      report.failures.push({
        row: rowNumber,
        sku: row.sku,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

/**
 * Find the line a sku came from, for the failure report.
 *
 * The operator's copy of the manifest is a spreadsheet, and "row 47" is how
 * they navigate to the problem. Re-scanning the text is O(rows) per lookup and
 * irrelevant next to one image upload.
 */
function manifestRowNumber(manifest: string, sku: string): number {
  const lines = manifest.split(/\r?\n/);
  const index = lines.findIndex((line) =>
    splitCsvLine(line).some((cell) => cell.trim() === sku)
  );
  return index === -1 ? 0 : index + 1;
}

/**
 * Create or update one product, with its images.
 *
 * Imports are inside the function on purpose — see `importCatalogue`.
 */
async function writeRow(
  row: ManifestRow,
  media: ResolvedMedia,
  variants: Omit<NewProductVariant, 'productId'>[],
  opts: { forceMedia: boolean },
  report: ImportReport
): Promise<void> {
  const { eq, ne, and } = await import('drizzle-orm');
  const { db } = await import('./index');
  const { products } = await import('./schema');
  const { buildProductMedia } = await import('../lib/product-media');

  const existing = await db
    .select({
      id: products.id,
      images: products.images,
    })
    .from(products)
    .where(eq(products.sku, row.sku))
    .limit(1);

  const current = existing[0];

  // The slug is a URL, so it belongs to exactly one product. A row trying to
  // take one that another sku already holds is a mistake, not an update.
  const slugOwner = await db
    .select({ sku: products.sku })
    .from(products)
    .where(
      current
        ? and(eq(products.slug, row.slug), ne(products.id, current.id))
        : eq(products.slug, row.slug)
    )
    .limit(1);

  if (slugOwner.length > 0) {
    throw new Error(
      `Slug "${row.slug}" already belongs to sku ${slugOwner[0]!.sku}`
    );
  }

  const currentImages = (current?.images ?? []) as ProductImage[];
  const keepImages = current && currentImages.length > 0 && !opts.forceMedia;

  let images: ProductImage[];

  if (keepImages) {
    // Reprocessing is ~400ms and one R2 write per image, and re-running a
    // manifest to fix a title should not cost that. --force-media is the way
    // to ask for it.
    images = currentImages;
    report.mediaSkipped++;
  } else {
    images = [];
    for (const file of media.files) {
      const buffer = readFileSync(file.path);
      images.push(
        await buildProductMedia(
          buffer,
          file.filename,
          contentTypeFor(file.filename),
          {
            type: file.type,
            altText: row.altText,
            sortOrder: file.sortOrder,
          }
        )
      );
    }
  }

  // The same guard the admin create route applies (#545). The storefront crops
  // from this column, so a value the artwork contradicts renders a wrong window
  // into the picture. Report it; never quietly write it.
  if (!row.orientationOverride) {
    const artwork = images.find((image) => image.type === 'main');
    const measured = orientationContradictingArt(
      row.orientation,
      artwork?.artBox
    );
    if (measured) {
      throw new Error(
        `The artwork measures ${measured}, but this row declares ` +
          `${row.orientation}. Fix the column, or set orientationOverride to ` +
          `true to store it anyway.`
      );
    }
  }

  // Product and ladder land together or not at all: a product written without
  // its variants is one nobody can buy, and a half-written ladder prices some
  // sizes and not others.
  await db.transaction(async (tx) => {
    let productId: string;

    if (current) {
      await tx
        .update(products)
        .set({ ...productColumns(row), images })
        .where(eq(products.id, current.id));
      productId = current.id;
      report.updated++;
    } else {
      const inserted = await tx
        .insert(products)
        .values({ ...productColumns(row), images })
        .returning({ id: products.id });

      const created = inserted[0];
      if (!created) throw new Error('Insert returned no product');
      productId = created.id;
      report.created++;
    }

    report.variantsWritten += await syncVariants(tx, productId, variants);
  });
}

/** The handle `db.transaction` hands its callback — it reads and writes. */
type Tx = Parameters<Parameters<typeof import('./index').db.transaction>[0]>[0];

/**
 * Bring a product's ladder in line with the manifest, matching on `variantSku`.
 *
 * ## Why this upserts rather than replacing the set
 *
 * Delete-then-insert is simpler and it is not safe here, because two tables
 * point at these rows:
 *
 *   cart_items.variant_id    ON DELETE CASCADE   (schema/cart.ts:153)
 *   order_items.variant_id   ON DELETE SET NULL  (schema/orders.ts:351)
 *
 * So deleting a variant to re-insert an identical one silently empties every
 * customer cart holding that size, and severs order history from the row it
 * was bought as. Both happen without an error. And a re-import is most likely
 * exactly when the store is live and someone is fixing a typo — the worst
 * possible moment to drop carts.
 *
 * Matching on `variantSku` keeps the row, and with it the id everything else
 * references.
 *
 * ## What it deliberately does not touch
 *
 * `stockQuantity` and `isInStock` are left alone on a row that already exists.
 * The ladder's stock numbers are a seeding curve, not a measurement; once the
 * catalogue is live the admin's figure is the true one and re-running a
 * manifest to fix a `seoTitle` must not reset it.
 *
 * A variant present on the product but absent from the manifest's ladder is
 * deactivated rather than deleted — same reason as above. It stops being
 * offered and its cart lines survive.
 */
async function syncVariants(
  tx: Tx,
  productId: string,
  variants: Omit<NewProductVariant, 'productId'>[]
): Promise<number> {
  const { eq, and, notInArray } = await import('drizzle-orm');
  const { productVariants } = await import('./schema');

  const existing = await tx
    .select({ id: productVariants.id, variantSku: productVariants.variantSku })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  const byVariantSku = new Map(
    existing
      .filter((v): v is { id: string; variantSku: string } => v.variantSku !== null)
      .map((v) => [v.variantSku, v.id])
  );

  let written = 0;

  for (const variant of variants) {
    const existingId = byVariantSku.get(variant.variantSku!);

    if (existingId) {
      const { stockQuantity: _stock, isInStock: _inStock, ...rest } = variant;
      await tx
        .update(productVariants)
        .set({ ...rest, isActive: true })
        .where(eq(productVariants.id, existingId));
    } else {
      await tx.insert(productVariants).values({ ...variant, productId });
    }

    written++;
  }

  // Anything the ladder no longer contains stops being sold. Not deleted —
  // see the note above about cart and order rows pointing here.
  const keep = variants.map((v) => v.variantSku!);
  await tx
    .update(productVariants)
    .set({ isActive: false })
    .where(
      and(
        eq(productVariants.productId, productId),
        notInArray(productVariants.variantSku, keep)
      )
    );

  return written;
}

// ============================================================================
// CLI
// ============================================================================

export interface CliArgs {
  manifestPath: string;
  mediaDir: string;
  dryRun: boolean;
  forceMedia: boolean;
  limit?: number;
}

const USAGE = `
Usage:
  bun run db:import-catalogue --manifest <path> --media-dir <path> [options]

Required:
  --manifest <path>    CSV file, one row per product
  --media-dir <path>   Folder holding the images the manifest names

Options:
  --dry-run            Validate everything, write nothing. Run this first.
  --limit <n>          Import at most n rows
  --force-media        Reprocess and re-upload images for products that have them

Every column is documented at the top of src/database/import-catalogue.ts.
`.trim();

/**
 * Read the flags.
 *
 * A misspelled flag is an error rather than a shrug: `--dryrun` silently
 * ignored would load a real catalogue into a real bucket, which is the one
 * mistake this tool must not make easy.
 */
export function parseArgs(argv: string[]): CliArgs {
  let manifestPath = '';
  let mediaDir = '';
  let dryRun = false;
  let forceMedia = false;
  let limit: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      return value;
    };

    switch (arg) {
      case '--manifest':
        manifestPath = next();
        break;
      case '--media-dir':
        mediaDir = next();
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force-media':
        forceMedia = true;
        break;
      case '--limit': {
        const value = Number(next());
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('--limit needs a whole number above zero');
        }
        limit = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  if (!manifestPath) throw new Error(`--manifest is required\n\n${USAGE}`);
  if (!mediaDir) throw new Error(`--media-dir is required\n\n${USAGE}`);

  return {
    manifestPath,
    mediaDir,
    dryRun,
    forceMedia,
    ...(limit === undefined ? {} : { limit }),
  };
}

/**
 * Refuse to run a real import against an unconfigured bucket.
 *
 * storage.ts falls back to the `poster-app-dev` bucket when `R2_BUCKET` is
 * unset, so a missing env file does not fail — it quietly uploads the
 * production catalogue into the dev MinIO and reports success. Checked only
 * for a real run: a dry-run uploads nothing and should stay runnable on a
 * laptop with no credentials.
 */
export function assertStorageConfigured(
  env: NodeJS.ProcessEnv = process.env
): void {
  const required = [
    'R2_ENDPOINT',
    'R2_ACCESS_KEY',
    'R2_SECRET_KEY',
    'R2_BUCKET',
  ];
  const missing = required.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Storage is not configured — missing ${missing.join(', ')}.\n` +
        `Without these the importer uploads into the local dev bucket and ` +
        `reports success. Set them in .env, or pass --dry-run.`
    );
  }
}

/** The report an operator reads, ending in what to fix. */
function printReport(report: ImportReport, dryRun: boolean): void {
  const prefix = dryRun ? '[dry run] ' : '';

  console.log(
    `\n${prefix}rows validated ${report.validated} | ` +
      `created ${report.created}, updated ${report.updated}, ` +
      `media skipped ${report.mediaSkipped}, failed ${report.failures.length}`
  );

  // Named separately from the row counts because they answer a different
  // question: whether the catalogue this produces can actually be bought.
  console.log(
    dryRun
      ? `${prefix}variants that would be written: ${report.variantsPlanned}`
      : `variants written ${report.variantsWritten} of ${report.variantsPlanned} planned`
  );

  if (report.failures.length === 0) {
    console.log(
      dryRun
        ? 'Every row is good. Re-run without --dry-run to import.'
        : 'Every row imported.'
    );
    return;
  }

  console.error(`\n! ${report.failures.length} row(s) did not import:`);
  // In file order. Failures are collected in two passes — everything the parser
  // rejected, then everything the writer did — and an operator working down a
  // spreadsheet wants one list they can follow top to bottom.
  const ordered = [...report.failures].sort((a, b) => a.row - b.row);
  for (const failure of ordered) {
    const sku = failure.sku ? ` ${failure.sku}` : '';
    console.error(`  ! row ${failure.row}${sku}: ${failure.reason}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.manifestPath)) {
    throw new Error(`Manifest not found: ${args.manifestPath}`);
  }

  if (!args.dryRun) assertStorageConfigured();

  const report = await importCatalogue({
    manifest: readFileSync(args.manifestPath, 'utf-8'),
    mediaDir: args.mediaDir,
    dryRun: args.dryRun,
    forceMedia: args.forceMedia,
    ...(args.limit === undefined ? {} : { limit: args.limit }),
  });

  printReport(report, args.dryRun);

  // A run that wrote products also changed what the storefront should serve.
  // Once at the end rather than per product: the cache is purged wholesale
  // either way, and a 300-row import would otherwise do it 300 times.
  if (!args.dryRun && (report.created > 0 || report.updated > 0)) {
    const { purgeProductResponseCache } = await import('../lib/redis');
    await purgeProductResponseCache();
  }

  if (report.failures.length > 0) process.exitCode = 1;
}

// Importing this module for its exported functions must not run the CLI —
// the tests do exactly that.
if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      // Only if the write path ever loaded it. A dry-run never opened a pool
      // and importing ./index here just to close it would open one.
      const db = await import('./index').catch(() => null);
      if (db) await db.closeDatabase();
    });
}
