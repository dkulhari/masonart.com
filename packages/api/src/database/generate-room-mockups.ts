/**
 * Generate room mockups from poster artwork.
 *
 * Offline: reads local files, writes local files, exits. No database, no R2,
 * no network. That is what keeps it small — the upload path already exists in
 * lib/product-media.ts, and the bulk import already exists as its own tool.
 *
 * Output filenames are chosen to be pasted straight into the bulk catalogue
 * import manifest:
 *
 *   mainImage,roomImages
 *   framed-main.jpg,room-living-room.jpg|room-nook.jpg
 *
 * Usage:
 *   bun run mockups:rooms --posters ./art [--templates .cache/room-templates]
 *                         [--out ./out] [--only id,id] [--frame slug] [--dry-run]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplates } from '../lib/room-mockup/templates';
import { DEFAULT_TEMPLATES_DIR, parseArgs, selectTemplates } from '../lib/room-mockup/cli-args';
import { renderRoomMockup } from '../lib/room-mockup/render';
import { buildContactSheet, renderFramedMain, type SheetEntry } from '../lib/room-mockup/outputs';

const POSTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Find posters whose output slug (basename with its extension stripped)
 * collides with another poster's — e.g. `sunset.jpg` and `sunset.png` both
 * map to `out/sunset/`, because POSTER_EXT accepts more than one extension
 * per basename. Whichever sorts last in the render loop would silently
 * overwrite the first poster's entire output folder (room-*.jpg,
 * framed-main.jpg, contact-sheet.jpg) with no error, leaving an operator to
 * upload one poster's mockups believing they belong to the other.
 *
 * Pure and filesystem-free — takes the already-listed filenames — so the
 * driver can check every poster up front, before anything is rendered, and
 * a test can exercise it without touching disk.
 */
export function findSlugCollisions(posters: string[]): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();

  for (const poster of posters) {
    const slug = basename(poster, extname(poster));
    const group = bySlug.get(slug);
    if (group) {
      group.push(poster);
    } else {
      bySlug.set(slug, [poster]);
    }
  }

  const collisions = new Map<string, string[]>();
  for (const [slug, files] of bySlug) {
    if (files.length > 1) collisions.set(slug, files);
  }
  return collisions;
}

// Read at runtime with JSON.parse rather than a static `import ... from
// './x.json'`: this package builds as a `composite` TS project, and a
// composite project's wildcard `include` glob does not extend to `.json`
// even with resolveJsonModule on, so a static JSON import fails to
// typecheck with TS6307 ("not listed within the file list of project").
// Reading the file ourselves sidesteps that entirely — fitting, for a tool
// whose whole point is reading local files.
const dataDir = dirname(fileURLToPath(import.meta.url));

// Repo root, anchored to this module rather than to process.cwd() — same fix
// as SEED_MEDIA_DIR in seed-images.ts (#450): a cwd-relative default meant
// `bun run mockups:rooms` from the repo root and from packages/api resolved
// `--templates` to two different directories, and the second one silently
// found nothing to render. Four levels holds for src/database/, which is the
// only layout this ever runs from: `mockups:rooms` runs the source file
// directly, and `build` is a plain `tsc` that never copies `.json` — a
// dist/database/ run would fail on the readFileSync of room-templates.json
// below before this arithmetic even comes into play. This tool is
// source-only; a dist build is not a supported way to run it.
const REPO_ROOT = join(dataDir, '../../../..');

async function main(): Promise<void> {
  const templatesJson = JSON.parse(readFileSync(join(dataDir, 'room-templates.json'), 'utf-8'));
  const framesJson = JSON.parse(readFileSync(join(dataDir, 'frame-renders.json'), 'utf-8'));

  const opts = parseArgs(process.argv);

  // `opts.templates` is `null` only when `--templates` was not supplied at
  // all — that's when the repo-root anchoring below applies. An explicit
  // `--templates`, even one that spells out the same default string, is
  // taken as-is and stays relative to the caller's own cwd, same as every
  // other flag.
  const templatesDir =
    opts.templates === null ? join(REPO_ROOT, DEFAULT_TEMPLATES_DIR) : opts.templates;

  const { templates: allTemplates, frames } = loadTemplates(
    templatesJson,
    framesJson,
    (file) => existsSync(join(templatesDir, file))
  );

  const templates = selectTemplates(allTemplates, opts.only);

  // `--only ,` filters down to nothing without naming a bad id, so guard here
  // rather than letting templates[0] be undefined further down.
  const firstTemplate = templates[0];
  if (!firstTemplate) {
    throw new Error('Template selection is empty — nothing to render.');
  }

  if (opts.frame && !(opts.frame in frames)) {
    throw new Error(`--frame "${opts.frame}" has no render spec.`);
  }

  /**
   * src is compiled with noUncheckedIndexedAccess, so every lookup into `frames`
   * is `FrameRender | undefined`. Both keys are validated above — loadTemplates
   * checks each template's slug, and --frame is checked directly — so this
   * throws only if that validation is ever weakened.
   */
  function frameFor(slug: string) {
    const spec = frames[slug];
    if (!spec) throw new Error(`Frame "${slug}" has no render spec.`);
    return spec;
  }

  const posters = readdirSync(opts.posters)
    .filter((f) => POSTER_EXT.has(extname(f).toLowerCase()))
    .sort();

  if (posters.length === 0) {
    throw new Error(`No poster images found in ${opts.posters}`);
  }

  // Checked before anything is rendered — see findSlugCollisions — so a
  // sunset.jpg + sunset.png pair fails loudly by name instead of one
  // silently overwriting the other's output folder partway through the run.
  const collisions = findSlugCollisions(posters);
  if (collisions.size > 0) {
    const detail = [...collisions.entries()]
      .map(([slug, files]) => `"${slug}" (${files.join(', ')})`)
      .join('; ');
    throw new Error(`Poster filenames collide on the same output folder — rename one of each: ${detail}`);
  }

  console.log(
    `${posters.length} poster(s) x ${templates.length} template(s) = ${posters.length * templates.length} mockups`
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
        const image = await renderRoomMockup(
          art,
          join(templatesDir, template.file),
          template,
          frameFor(opts.frame ?? template.frame)
        );

        writeFileSync(join(dir, `room-${template.id}.jpg`), image);
        // The id is what a reviewer deletes (room-<id>.jpg); the label alone
        // doesn't say which file that is, and labels aren't unique. Passed as
        // a separate field rather than appended to the label so the contact
        // sheet can render it on its own line instead of clipping it.
        sheet.push({ label: template.label, file: `room-${template.id}.jpg`, image });
      }

      // The main image uses the first template's frame, so the framed main and
      // the first room shot agree on the moulding.
      const mainFrame = frameFor(opts.frame ?? firstTemplate.frame);
      writeFileSync(join(dir, 'framed-main.jpg'), await renderFramedMain(art, mainFrame));
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

// Guarded the same way as init-super-admin.ts: without this, importing this
// module (e.g. from a test that wants findSlugCollisions) would run the CLI
// for real — parsing process.argv, throwing on the missing --posters, and
// process.exit()ing the whole test run. Only runs when this file is the
// thing actually executed.
if (import.meta.main) {
  // Print just the message, not a Bun stack trace with source excerpts — the
  // runbook's "When it refuses" table documents clean one-liners, and this
  // follows the same shape as backfill-art-box.ts's terminal `.catch()`.
  // Every throw site's message is unchanged; only how it reaches the
  // terminal is.
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
