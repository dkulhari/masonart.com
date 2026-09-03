/**
 * Generate room mockups by warping posters into rooms that already have a
 * frame — the baked-frame fallback, for use when no bare-wall scene exists.
 *
 * Offline: reads local files, writes local files, exits. Same shape and same
 * output naming as generate-room-mockups.ts, so the results paste into the
 * bulk-import manifest identically:
 *
 *   mainImage,roomImages
 *   framed-main.jpg,room-living-room-01.jpg
 *
 * Templates live in `src/database/aperture-templates/`: one `<id>.json`
 * (id, image, imageSize, the opening quad, mat colour — see aperture.ts) next
 * to its image. Every poster is warped into every template's opening.
 *
 * Usage:
 *   bun run mockups:aperture --posters ./art [--templates <dir>] [--out ./out]
 *                            [--only id,id] [--dry-run]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApertureTemplates, renderApertureMockup } from '../lib/room-mockup/aperture';
import { parseArgs, selectTemplates } from '../lib/room-mockup/cli-args';
import { MAT_COLOR } from '@chobii/shared';
import { buildContactSheet, type SheetEntry } from '../lib/room-mockup/outputs';
import sharp from 'sharp';
import { findSlugCollisions } from './generate-room-mockups';

const POSTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const DEFAULT_APERTURE_DIR = 'packages/api/src/database/aperture-templates';

const dataDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(dataDir, '../../../..');

/**
 * The framed main image, for parity with generate-room-mockups.ts: the poster
 * on the catalogue mat colour. The aperture route has no frame renderer of its
 * own, so this is a plain matted poster rather than a moulding.
 */
async function mattedMain(art: Buffer): Promise<Buffer> {
  const meta = await sharp(art).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const marginX = Math.round(w * 0.06);
  const marginY = Math.round(h * 0.06);

  return sharp(art)
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

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  const templatesDir =
    opts.templates === null ? join(REPO_ROOT, DEFAULT_APERTURE_DIR) : opts.templates;

  const files = existsSync(templatesDir)
    ? readdirSync(templatesDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];

  if (files.length === 0) {
    throw new Error(
      `No aperture-template JSON files in ${templatesDir}. Each is a room whose frame opening was measured with tools/room-measure.html.`
    );
  }

  const allTemplates = loadApertureTemplates(
    files.map((f) => JSON.parse(readFileSync(join(templatesDir, f), 'utf-8'))),
    { imageExists: (file) => existsSync(join(templatesDir, file)) }
  );

  const templates = selectTemplates(allTemplates, opts.only);
  if (templates.length === 0) {
    throw new Error('Template selection is empty — nothing to render.');
  }

  const posters = readdirSync(opts.posters)
    .filter((f) => POSTER_EXT.has(extname(f).toLowerCase()))
    .sort();

  if (posters.length === 0) {
    throw new Error(`No poster images found in ${opts.posters}`);
  }

  const collisions = findSlugCollisions(posters);
  if (collisions.size > 0) {
    const detail = [...collisions.entries()]
      .map(([slug, list]) => `"${slug}" (${list.join(', ')})`)
      .join('; ');
    throw new Error(`Poster filenames collide on the same output folder — rename one of each: ${detail}`);
  }

  console.log(
    `${posters.length} poster(s) x ${templates.length} template(s) = ${posters.length * templates.length} mockups (aperture route)`
  );

  if (opts.dryRun) {
    for (const poster of posters) {
      console.log(`  ${poster} -> ${templates.map((t) => `room-${t.id}.jpg`).join(', ')}`);
    }
    console.log('Dry run — nothing written.');
    process.exit(0);
  }

  const failures: Array<{ poster: string; reason: string }> = [];

  for (const poster of posters) {
    const slug = basename(poster, extname(poster));
    const dir = join(opts.out, slug);

    try {
      mkdirSync(dir, { recursive: true });
      const art = readFileSync(join(opts.posters, poster));

      const sheet: SheetEntry[] = [];
      for (const template of templates) {
        const image = await renderApertureMockup(art, join(templatesDir, template.image), template);
        writeFileSync(join(dir, `room-${template.id}.jpg`), image);
        sheet.push({ label: template.label, file: `room-${template.id}.jpg`, image });
      }

      writeFileSync(join(dir, 'framed-main.jpg'), await mattedMain(art));
      writeFileSync(join(dir, 'contact-sheet.jpg'), await buildContactSheet(sheet));

      console.log(`  ${slug}: ${templates.length} mockups + main + contact sheet`);
    } catch (error) {
      failures.push({ poster, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} poster(s) failed:`);
    for (const f of failures) console.error(`  ${f.poster}: ${f.reason}`);
    process.exit(1);
  }

  console.log(`\nDone. Review ${opts.out}/<slug>/contact-sheet.jpg and delete what you do not want.`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
