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
import { join } from "node:path";
import type { ProductImage, ProductImageType } from "@chobii/shared";
import { buildProductMedia } from "../lib/product-media";

const CACHE_DIR = join(process.cwd(), ".cache", "seed-images");

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
  process.env.SEED_MEDIA_DIR ?? join(process.cwd(), ".cache", "seed-media");

/**
 * Fetch a remote image once, then serve it from disk.
 *
 * Keyed by a hash of the URL so a changed URL re-downloads while an unchanged
 * one never hits the network twice.
 */
export async function fetchCached(url: string): Promise<Buffer> {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const path = join(CACHE_DIR, key);

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
