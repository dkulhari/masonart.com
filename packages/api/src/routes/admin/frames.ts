/**
 * Admin Frames API.
 *
 * - GET    /api/admin/frames      list, INCLUDING archived
 * - GET    /api/admin/frames/:id  one row, for the edit form
 * - POST   /api/admin/frames      create
 * - PATCH  /api/admin/frames/:id  update, and the way back from archived
 * - DELETE /api/admin/frames/:id  ARCHIVE — never a SQL delete
 *
 * Behind the same role gate as `/api/admin/collections`: a frame is catalogue
 * content, so whoever can edit products and collections can edit these.
 *
 * ## Repricing a frame used to be a deploy
 *
 * Frames were seeded in code and reached the storefront through one read-only
 * endpoint, so changing what the gold moulding costs meant shipping a release.
 * The storage was never the gap — every row already carried its own
 * `priceModifier` and `priceAddition`. This is the write path.
 *
 * ## Cache busting is not optional here
 *
 * `GET /api/products/frames` caches its payload for fifteen minutes. Without a
 * bust on every write, an admin saves a price, reloads the product page, sees
 * the old number, and saves again — the first bug anyone would hit.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, count, eq } from "drizzle-orm";
import {
  createFrameInputSchema,
  updateFrameInputSchema,
  ADMIN_IMAGE_MIME_TYPES,
  MAX_ADMIN_IMAGE_MB,
} from "@chobii/shared";

import { db } from "../../database";
import { recordAudit, diffRecords } from "../../lib/audit";
import { frames } from "../../database/schema/products";
import {
  requireAuth,
  requireContentManager,
  type AuthVariables,
} from "../../middleware/auth";
import { purgeProductResponseCache } from "../../lib/redis";
import { isUniqueViolation } from "../../lib/pg-errors";
import { uploadOptimizedImage, StoragePaths } from "../../lib/storage";

export const adminFramesApp = new Hono<{ Variables: AuthVariables }>();

adminFramesApp.use("*", requireAuth);
adminFramesApp.use("*", requireContentManager);

/**
 * Drop every cached payload a frame appears in.
 *
 * One helper rather than the key spelled at each call site, so a fourth write
 * added later cannot invent a near-miss key that busts nothing.
 *
 * It used to drop `product:frames` alone, and that was not enough: the product
 * detail response EMBEDS the frame options (`routes/products.ts:957`) and is
 * cached under its own key per slug and viewer. So an admin repriced a frame,
 * the frames list updated, and every already-cached product page went on
 * quoting the OLD uplift for the rest of its TTL — with the cart charging the
 * new one. Archiving had the same shape: the panel kept offering a frame that
 * no longer existed.
 *
 * `purgeProductResponseCache` covers the frames key too (it is under the same
 * `product:` prefix), so this is one call rather than two.
 */
export async function purgeFramesCache(): Promise<void> {
  await purgeProductResponseCache();
}

/** The 409 body, so create and update phrase a taken slug identically. */
const takenType = (type: string | undefined) => ({
  error: `Frame type '${type}' is already taken`,
  type,
});

// ============================================================================
// POST /upload-image — swatch upload
// ============================================================================

/**
 * Upload one frame swatch.
 *
 * Registered before the `/:id` routes so the literal path is never mistaken
 * for an id.
 *
 * Deliberately NOT `buildProductMedia`. That pipeline mats artwork, measures
 * the art box and honours an admin-chosen crop window, all because a piece of
 * art must never be cropped blindly. A swatch is a photograph of a moulding:
 * it fills its square, there is nothing to measure, and matting it would put a
 * canvas border around a product photo.
 *
 * `StoragePaths.FRAMES` has sat in `lib/storage.ts` with no consumers since it
 * was written. This is the first.
 *
 * One upload fills both columns — the variant ladder already contains a
 * thumbnail and a card size, so the form has no second image field to keep in
 * sync with the first.
 */
adminFramesApp.post("/upload-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }
  if (!ADMIN_IMAGE_MIME_TYPES.includes(file.type)) {
    return c.json(
      { error: "Invalid file type. Supported: JPEG, PNG, WebP" },
      400
    );
  }
  if (file.size > MAX_ADMIN_IMAGE_MB * 1024 * 1024) {
    return c.json(
      { error: `File too large. Maximum size is ${MAX_ADMIN_IMAGE_MB}MB` },
      400
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadOptimizedImage(
      buffer,
      file.name,
      file.type,
      { prefix: StoragePaths.FRAMES }
    );

    /**
     * Fall back to the full-size webp rather than returning undefined: a
     * missing rung in the ladder should cost the admin a larger download, not
     * a frame with no picture.
     */
    const variant = (name: string) =>
      uploaded.variants.find((v) => v.name === name)?.url ?? uploaded.webpUrl;

    return c.json(
      {
        success: true,
        thumbnailUrl: variant("thumbnail"),
        imageUrl: variant("card"),
      },
      201
    );
  } catch (error) {
    console.error("[AdminFrames] Swatch upload failed:", error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
});

// ============================================================================
// GET / — list
// ============================================================================

adminFramesApp.get("/", async (c) => {
  try {
    /**
     * No `isActive` filter, unlike the public endpoint.
     *
     * Archived frames come back so the screen can dim them and offer a way
     * out. A list that hid them would make archiving a one-way door through
     * the only UI that can archive.
     */
    const rows = await db
      .select()
      .from(frames)
      .orderBy(asc(frames.sortOrder), asc(frames.name));

    return c.json({ frames: rows });
  } catch (error) {
    console.error("Error listing frames:", error);
    return c.json({ error: "Failed to list frames" }, 500);
  }
});

// ============================================================================
// GET /:id — one
// ============================================================================

adminFramesApp.get("/:id", async (c) => {
  try {
    const [row] = await db
      .select()
      .from(frames)
      .where(eq(frames.id, c.req.param("id")))
      .limit(1);

    if (!row) return c.json({ error: "Frame not found" }, 404);

    return c.json({ frame: row });
  } catch (error) {
    console.error("Error fetching frame:", error);
    return c.json({ error: "Failed to fetch frame" }, 500);
  }
});

// ============================================================================
// POST / — create
// ============================================================================

adminFramesApp.post(
  "/",
  zValidator("json", createFrameInputSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const [row] = await db
        .insert(frames)
        .values({
          name: input.name,
          type: input.type,
          category: input.category,
          description: input.description ?? null,
          material: input.material ?? null,
          thickness: input.thickness ?? null,
          color: input.color ?? null,
          priceModifier: input.priceModifier,
          priceAddition: input.priceAddition,
          imageUrl: input.imageUrl ?? null,
          thumbnailUrl: input.thumbnailUrl ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        })
        .returning();

      await purgeFramesCache();

      await recordAudit(c, {
        action: "frame.created",
        entityType: "frame",
        entityId: row!.id,
        summary: `Created frame '${row!.name}' (${row!.type}) at +${row!.priceAddition}`,
        after: row as unknown as Record<string, unknown>,
      });

      return c.json({ frame: row }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json(takenType(input.type), 409);
      }
      console.error("Error creating frame:", error);
      return c.json({ error: "Failed to create frame" }, 500);
    }
  }
);

// ============================================================================
// PATCH /:id — update
// ============================================================================

adminFramesApp.patch(
  "/:id",
  zValidator("json", updateFrameInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    const id = c.req.param("id");

    /**
     * Only the supplied keys are written, so a price-only edit need not resend
     * the whole frame and cannot blank the fields it omitted.
     */
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "name",
      "type",
      "category",
      "description",
      "material",
      "thickness",
      "color",
      "priceModifier",
      "priceAddition",
      "imageUrl",
      "thumbnailUrl",
      "isActive",
      "sortOrder",
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }

    try {
      const [row] = await db
        .update(frames)
        .set(patch)
        .where(eq(frames.id, id))
        .returning();

      if (!row) return c.json({ error: "Frame not found" }, 404);

      await purgeFramesCache();

      // `patch` already holds exactly the keys this request supplied, so the
      // delta is the intersection of "asked for" and "actually moved". The
      // pre-image is not read: the frame price feeds every product page, and a
      // second SELECT on a hot admin write to enrich a log is a poor trade.
      await recordAudit(c, {
        action: "frame.updated",
        entityType: "frame",
        entityId: id,
        summary: `Edited frame '${row.name}' (${Object.keys(patch)
          .filter((key) => key !== "updatedAt")
          .join(", ")})`,
        after: diffRecords(null, row as unknown as Record<string, unknown>, undefined).after,
        metadata: { changedKeys: Object.keys(patch).filter((k) => k !== "updatedAt") },
      });

      return c.json({ frame: row });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json(takenType(input.type), 409);
      }
      console.error("Error updating frame:", error);
      return c.json({ error: "Failed to update frame" }, 500);
    }
  }
);

// ============================================================================
// DELETE /:id — archive
// ============================================================================

/**
 * Retire a frame.
 *
 * Archives; never deletes, and that is not squeamishness. `cartItems.frameId`
 * and `orderItems.frameId` are both `onDelete: "set null"`, so a hard delete
 * would not fail loudly — it would succeed and quietly take the frame off
 * every historical order that recorded it. Products archive for the same
 * reason (`admin/products.ts`, `status: "archived"`).
 *
 * Refuses the last active frame. There is no "no frame" fallback on the buy
 * panel: Rolled Canvas is itself a row here, so zero active frames is a
 * product page with nothing to sell.
 *
 * The way back is `PATCH { isActive: true }` rather than a second endpoint —
 * unarchiving is an ordinary field edit and does not need its own verb.
 */
adminFramesApp.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const [existing] = await db
      .select({
        id: frames.id,
        name: frames.name,
        isActive: frames.isActive,
      })
      .from(frames)
      .where(eq(frames.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "Frame not found" }, 404);

    /**
     * Already archived: report success and write nothing. Repeating the
     * request is not an error, and a second write would only move
     * `updatedAt` for no change anyone asked for.
     */
    if (!existing.isActive) {
      return c.json({ message: `Frame '${existing.name}' is already archived` });
    }

    const [activeRow] = await db
      .select({ count: count() })
      .from(frames)
      .where(eq(frames.isActive, true));

    /**
     * No row back means the count query itself failed to produce one, which
     * should be impossible for an aggregate — treat it as "cannot prove there
     * is another active frame" and refuse rather than archive on a guess.
     */
    const activeCount = activeRow?.count ?? 1;

    if (activeCount <= 1) {
      return c.json(
        {
          error:
            "Cannot archive the last active frame — the product page would have no format option to sell.",
        },
        409
      );
    }

    await db
      .update(frames)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(frames.id, id));

    await purgeFramesCache();

    await recordAudit(c, {
      action: "frame.archived",
      entityType: "frame",
      entityId: id,
      summary: `Archived frame '${existing.name}'`,
      before: { isActive: true },
      after: { isActive: false },
    });

    return c.json({ message: `Frame '${existing.name}' archived` });
  } catch (error) {
    console.error("Error archiving frame:", error);
    return c.json({ error: "Failed to archive frame" }, 500);
  }
});
