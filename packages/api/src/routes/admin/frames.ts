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
import { createFrameInputSchema, updateFrameInputSchema } from "@chobii/shared";

import { db } from "../../database";
import { frames } from "../../database/schema/products";
import {
  requireAuth,
  requireContentManager,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCached, CacheKeys } from "../../lib/redis";
import { isUniqueViolation } from "../../lib/pg-errors";

export const adminFramesApp = new Hono<{ Variables: AuthVariables }>();

adminFramesApp.use("*", requireAuth);
adminFramesApp.use("*", requireContentManager);

/**
 * Drop the cached public frames payload.
 *
 * One helper rather than the key spelled at each call site, so a fourth write
 * added later cannot invent a near-miss key that busts nothing.
 */
export async function purgeFramesCache(): Promise<void> {
  await deleteCached(`${CacheKeys.PRODUCT}frames`);
}

/** The 409 body, so create and update phrase a taken slug identically. */
const takenType = (type: string | undefined) => ({
  error: `Frame type '${type}' is already taken`,
  type,
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

    const [{ count: activeCount }] = await db
      .select({ count: count() })
      .from(frames)
      .where(eq(frames.isActive, true));

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

    return c.json({ message: `Frame '${existing.name}' archived` });
  } catch (error) {
    console.error("Error archiving frame:", error);
    return c.json({ error: "Failed to archive frame" }, 500);
  }
});
