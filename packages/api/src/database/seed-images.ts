/**
 * Seed image helper
 *
 * Turns the seed data's remote source URLs into genuinely matted, self-hosted
 * ProductImage records satisfying the square contract.
 *
 * This is a reseed, not a migration: the product is pre-launch, so there is no
 * compatibility shim and no rollback path. Run it and the dev catalogue is
 * rebuilt.
 *
 * Downloads are cached under .cache/seed-images/ (gitignored) so repeated runs
 * are fast and work offline once warm.
 *
 * A second source exists alongside the remote one: a local directory of
 * reference imagery. See SEED_MEDIA_DIR below.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductImage, ProductImageType } from "@chobii/shared";
import { buildProductMedia } from "../lib/product-media";

/**
 * Repository root, anchored to this module rather than to process.cwd().
 *
 * Both caches below live at the root. Deriving them from the caller's cwd made
 * the seed's own script wrong: `bun run seed` in packages/api runs with cwd at
 * the package root, so SEED_MEDIA_DIR resolved to packages/api/.cache/seed-media,
 * which does not exist, and the whole catalogue silently fell back to the
 * declared stock URLs (#450).
 *
 * Four levels holds for both layouts — src/database/ under development and
 * dist/database/ after `tsc`.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Download cache for remote sources. A wrong path here only re-downloads. */
export const SEED_IMAGE_CACHE_DIR = join(REPO_ROOT, ".cache", "seed-images");

/**
 * Local reference imagery, gitignored and machine-local.
 *
 * Holds an evaluation set pulled from a live storefront while working the
 * design-parity features: real artwork plus real room mockups, which the
 * stock-photo URLs in this seed cannot supply. It is test-only fixture data —
 * the files are third-party and watermarked, they are not in the repository,
 * and nothing here is publishable.
 *
 * Absence is the normal case, not an error. A clone without the directory
 * seeds from the declared remote URLs exactly as it did before this existed.
 */
export const SEED_MEDIA_DIR =
  process.env.SEED_MEDIA_DIR ?? join(REPO_ROOT, ".cache", "seed-media");

/**
 * Fetch a remote image once, then serve it from disk.
 *
 * Keyed by a hash of the URL so a changed URL re-downloads while an unchanged
 * one never hits the network twice.
 */
export async function fetchCached(url: string): Promise<Buffer> {
  await mkdir(SEED_IMAGE_CACHE_DIR, { recursive: true });
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const path = join(SEED_IMAGE_CACHE_DIR, key);

  if (existsSync(path)) {
    return readFile(path);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Seed image fetch failed (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return buf;
}

/**
 * Build one ProductImage from a raw source buffer.
 *
 * Delegates to buildProductMedia so the seed and the admin upload path produce
 * byte-identical results — if they diverged, the dev catalogue would stop being
 * representative of what a real upload creates.
 */
export async function buildSeedImage(
  input: Buffer,
  filename: string,
  altText: string,
  sortOrder: number,
  type: ProductImageType = "main"
): Promise<ProductImage> {
  return buildProductMedia(input, filename, "image/jpeg", {
    type,
    altText,
    sortOrder,
  });
}

/** Convenience: fetch a remote source and build the record in one step. */
export async function buildSeedImageFromUrl(
  url: string,
  filename: string,
  altText: string,
  sortOrder: number,
  type: ProductImageType = "main"
): Promise<ProductImage> {
  return buildSeedImage(await fetchCached(url), filename, altText, sortOrder, type);
}

/** One file from SEED_MEDIA_DIR, already classified by its name. */
export interface LocalSeedMedia {
  file: string;
  type: ProductImageType;
}

/**
 * Collect one product's reference files by naming convention:
 * `<prefix>-main.webp` plus any `<prefix>-room-N.webp`.
 *
 * Returns [] whenever the directory or the main file is missing — the caller
 * reads an empty set as "no local media, use the declared URLs", so a missing
 * directory degrades to the previous behaviour instead of failing the seed.
 * The main file is required: room mockups without the artwork they frame would
 * make a gallery whose first slide is somebody else's living room.
 */
export function localSeedMediaSet(
  prefix: string,
  dir: string = SEED_MEDIA_DIR
): LocalSeedMedia[] {
  const main = `${prefix}-main.webp`;
  if (!existsSync(join(dir, main))) return [];

  const rooms = readdirSync(dir)
    .filter((name) => name.startsWith(`${prefix}-room-`) && name.endsWith(".webp"))
    .sort();

  return [
    { file: main, type: "main" },
    ...rooms.map((file) => ({ file, type: "room-mockup" as ProductImageType })),
  ];
}

/** How much of the reference set a run actually found. */
export interface LocalSeedMediaSummary {
  resolved: number;
  total: number;
  dir: string;
}

/**
 * Count how many of the given prefixes resolve to local media.
 *
 * Falling back to declared URLs is legitimate — a fresh clone has no
 * .cache/seed-media/ and must still seed. The problem this exists to solve is
 * that a *wrong directory* looked identical to *a clone that never had the
 * files*: both produce a successful run, and the only way to tell them apart
 * was to count room-mockup rows in Postgres afterwards. The seed reports this
 * up front so a zero is visible while the run is happening (#450).
 */
export function summarizeLocalSeedMedia(
  prefixes: string[],
  dir: string = SEED_MEDIA_DIR
): LocalSeedMediaSummary {
  const resolved = prefixes.filter(
    (prefix) => localSeedMediaSet(prefix, dir).length > 0
  ).length;

  return { resolved, total: prefixes.length, dir };
}

/** Build a record from a file in SEED_MEDIA_DIR rather than a remote URL. */
export async function buildSeedImageFromFile(
  file: string,
  filename: string,
  altText: string,
  sortOrder: number,
  type: ProductImageType = "main",
  dir: string = SEED_MEDIA_DIR
): Promise<ProductImage> {
  return buildSeedImage(
    await readFile(join(dir, file)),
    filename,
    altText,
    sortOrder,
    type
  );
}
