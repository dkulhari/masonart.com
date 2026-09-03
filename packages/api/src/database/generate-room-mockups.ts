/**
 * Generate room mockups from poster artwork.
 *
 * Offline: reads local files, writes local files, exits. No database, no R2,
 * no network. That is what keeps it small — the upload path already exists in
 * lib/product-media.ts, and the bulk import already exists as its own tool.
 *
 * Rooms come from `src/database/room-templates/`: one `room-<id>.json` scene
 * (the measured wall, see lib/room-mockup/scene.ts) next to its image. Every
 * poster is rendered into every scene at a physical size on the wall; the
 * frame, side face, lighting, shadow and grain are all computed. Nothing
 * per product is generated.
 *
 * Output filenames are chosen to be pasted straight into the bulk catalogue
 * import manifest:
 *
 *   mainImage,roomImages
 *   framed-main.jpg,room-01.jpg|room-03.jpg
 *
 * Usage:
 *   bun run mockups:rooms --posters ./art [--templates packages/api/src/database/room-templates]
 *                         [--out ./out] [--only id,id] [--frame black]
 *                         [--poster-cm 60x80] [--dry-run]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TEMPLATES_DIR, parseArgs, selectTemplates } from '../lib/room-mockup/cli-args';
import { buildContactSheet, renderFramedMain, type SheetEntry } from '../lib/room-mockup/outputs';
import { renderSceneMockup } from '../lib/room-mockup/render';
import { loadRoomScenes } from '../lib/room-mockup/scene';
import { parsePosterCm } from '../lib/room-mockup/sizing';
import { loadFrames } from '../lib/room-mockup/templates';

const POSTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** The frame used when --frame is not given: the catalogue's most neutral moulding. */
const DEFAULT_FRAME = 'black';

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
// directly, and `build` is a plain `tsc` that never copies `.json`. This
// tool is source-only; a dist build is not a supported way to run it.
const REPO_ROOT = join(dataDir, '../../../..');

async function main(): Promise<void> {
  const frames = loadFrames(JSON.parse(readFileSync(join(dataDir, 'frame-renders.json'), 'utf-8')));

  const opts = parseArgs(process.argv);

  // `opts.templates` is `null` only when `--templates` was not supplied at
  // all — that's when the repo-root anchoring below applies. An explicit
  // `--templates`, even one that spells out the same default string, is
  // taken as-is and stays relative to the caller's own cwd, same as every
  // other flag.
  const templatesDir =
    opts.templates === null ? join(REPO_ROOT, DEFAULT_TEMPLATES_DIR) : opts.templates;

  const sceneFiles = existsSync(templatesDir)
    ? readdirSync(templatesDir)
        .filter((f) => /^room-.*\.json$/.test(f))
        .sort()
    : [];

  if (sceneFiles.length === 0) {
    throw new Error(
      `No room-*.json scenes in ${templatesDir} — see src/database/room-templates/README.md for how to author one.`
    );
  }

  const allScenes = loadRoomScenes(
    sceneFiles.map((f) => JSON.parse(readFileSync(join(templatesDir, f), 'utf-8'))),
    { imageExists: (file) => existsSync(join(templatesDir, file)) }
  );

  const scenes = selectTemplates(allScenes, opts.only);

  // `--only ,` filters down to nothing without naming a bad id, so guard here
  // rather than letting scenes[0] be undefined further down.
  if (scenes.length === 0) {
    throw new Error('Scene selection is empty — nothing to render.');
  }

  const frameSlug = opts.frame ?? DEFAULT_FRAME;
  const frame = frames[frameSlug];
  if (!frame) {
    throw new Error(`--frame "${frameSlug}" has no render spec.`);
  }

  const posterCm = opts.posterCm ? parsePosterCm(opts.posterCm) : undefined;

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
    throw new Error(
      `Poster filenames collide on the same output folder — rename one of each: ${detail}`
    );
  }

  console.log(
    `${posters.length} poster(s) x ${scenes.length} scene(s) = ${posters.length * scenes.length} mockups (frame: ${frameSlug}${posterCm ? `, ${posterCm.widthCm}x${posterCm.heightCm} cm` : ''})`
  );

  if (opts.dryRun) {
    for (const poster of posters) {
      console.log(`  ${poster} -> ${scenes.map((s) => `room-${s.id}.jpg`).join(', ')}`);
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

      for (const scene of scenes) {
        const image = await renderSceneMockup(art, join(templatesDir, scene.image), scene, frame, {
          posterCm,
          // The grain seed: the same poster in the same room renders
          // byte-identically on every run, so a re-import changes nothing.
          seedKey: slug,
        });

        writeFileSync(join(dir, `room-${scene.id}.jpg`), image);
        // The id is what a reviewer deletes (room-<id>.jpg); the label alone
        // doesn't say which file that is, and labels aren't unique.
        sheet.push({ label: scene.label, file: `room-${scene.id}.jpg`, image });
      }

      // The main image uses the same frame as the room shots, so they agree
      // on the moulding.
      writeFileSync(join(dir, 'framed-main.jpg'), await renderFramedMain(art, frame));
      writeFileSync(join(dir, 'contact-sheet.jpg'), await buildContactSheet(sheet));

      console.log(`  ${slug}: ${scenes.length} mockups + main + contact sheet`);
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
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
