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
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProductImage, ProductImageType } from "@chobii/shared";
import { buildProductMedia } from "../lib/product-media";

const CACHE_DIR = join(process.cwd(), ".cache", "seed-images");

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
