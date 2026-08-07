/**
 * Backfill `artBox` onto every product image already in the catalogue.
 *
 * Run with: bun run backfill:art-box
 *
 * ## Why this exists
 *
 * `matToSquare` bakes the mat into the pixels, so a 3:1 panorama and a perfect
 * square both come out of the pipeline as 1500x1500. The storefront therefore
 * draws the same plate for both and the artwork inside lands anywhere between
 * 39% and 76% of it — four identical plates holding four wildly different-weight
 * pictures, which is the "the row stutters" finding on #530.
 *
 * `measureArtBox` recovers the measurement from the stored asset itself. New
 * uploads get it from `buildProductMedia`; this walks the assets that predate
 * that.
 *
 * ## What it does NOT do
 *
 * It does not re-process, re-upload or rename a single image. It reads each
 * asset over HTTP, measures it, and writes one extra key inside the existing
 * `products.images` JSONB. Nothing else in the row is touched, no URL changes,
 * and an image whose measurement fails is left exactly as it was — the card
 * falls back to drawing the square unframed, which is today's behaviour.
 *
 * Idempotent: images that already carry a box are skipped unless --force.
 */

import type { ProductImage } from "@chobii/shared";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "./index";
import { products } from "./schema";
import { measureArtBox } from "../lib/image-processing";

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

/**
 * Pull one asset down for measurement.
 *
 * Over HTTP rather than through the storage client on purpose: the bucket is
 * already public — it is what the browser reads — so this needs no credentials
 * and works against any environment whose URLs resolve.
 */
async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const rows = await db
    .select({ id: products.id, slug: products.slug, images: products.images })
    .from(products);

  let scanned = 0;
  let measured = 0;
  let skipped = 0;
  let failed = 0;
  let touched = 0;

  for (const row of rows) {
    const images = (row.images ?? []) as ProductImage[];
    if (images.length === 0) continue;

    let changed = false;
    const next: ProductImage[] = [];

    for (const image of images) {
      scanned++;

      if (image.artBox && !force) {
        skipped++;
        next.push(image);
        continue;
      }

      const buffer = await fetchImage(image.url);
      if (!buffer) {
        failed++;
        console.warn(`  ! ${row.slug}: could not fetch ${image.url}`);
        next.push(image);
        continue;
      }

      const artBox = await measureArtBox(buffer);
      if (!artBox) {
        // Full-bleed or unreadable. Both mean "draw it as it is".
        skipped++;
        next.push(image);
        continue;
      }

      measured++;
      changed = true;
      next.push({ ...image, artBox });
    }

    if (!changed) continue;
    touched++;

    if (dryRun) {
      const shown = next
        .filter((i) => i.artBox)
        .map(
          (i) =>
            `${i.type} ${(i.artBox!.w * 100).toFixed(0)}x${(i.artBox!.h * 100).toFixed(0)}%`
        )
        .join(", ");
      console.log(`  ~ ${row.slug}: ${shown}`);
      continue;
    }

    await db
      .update(products)
      .set({ images: next })
      .where(eq(products.id, row.id));
    console.log(`  + ${row.slug}: ${next.filter((i) => i.artBox).length} boxed`);
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}products touched ${touched}/${rows.length} | ` +
      `images scanned ${scanned}, measured ${measured}, skipped ${skipped}, failed ${failed}`
  );
}

main()
  .then(closeDatabase)
  .catch(async (error) => {
    console.error(error);
    await closeDatabase();
    process.exit(1);
  });
