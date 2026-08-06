/**
 * Gallery Membership API Routes
 *
 * - POST /api/gallery/join - opt the caller into the gallery
 *
 * Requires authentication. Guests get 401 rather than an anonymous
 * membership: the join modal routes them through registration first.
 *
 * WHY THIS IS IDEMPOTENT, AND WHICH DATES SURVIVE
 *
 * The join button is reachable from a banner, a rail, the cart and the sale
 * page, so a member will press it again. A second call must not move
 * `galleryJoinedAt` and must not re-stamp `marketingConsentAt`: the FIRST
 * consent date is the one that has to be producible if the consent is ever
 * questioned, and a route that overwrites it on every click destroys the only
 * evidence there was. So a member's re-join reads the stored state and returns
 * it without writing anything, and even the first-join write preserves any
 * consent that already exists.
 *
 * `joinSource` is validated against a fixed set rather than stored as
 * whatever text the client sent — this is attribution data that ends up in
 * reports, and one free-text field is all it takes to make them unusable.
 *
 * See docs/superpowers/specs/2026-08-05-sale-promotions-design.md §8.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database";
import { users } from "../database/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/auth";

// ============================================================================
// Validation
// ============================================================================

/**
 * Where the shopper joined from. A closed set, not client text: the column is
 * plain `text` with nothing behind it, so this is the only gate.
 */
const joinSourceSchema = z.enum([
  "banner",
  "rail",
  "cart",
  "registration",
  "sale-page",
]);

export type JoinSource = z.infer<typeof joinSourceSchema>;

/**
 * Accepts the field under either name. `source` is what the design doc calls
 * it; `joinSource` is what the column is called, and clients reach for that.
 * Both land in the same validated enum, so neither is a way in for free text.
 */
const joinBodySchema = z
  .object({
    source: joinSourceSchema.optional(),
    joinSource: joinSourceSchema.optional(),
  })
  .transform((body) => body.source ?? body.joinSource)
  .pipe(joinSourceSchema);

// ============================================================================
// Router
// ============================================================================

export const galleryApp = new Hono<{ Variables: AuthVariables }>();

galleryApp.use("*", requireAuth);

/**
 * POST /api/gallery/join
 *
 * Returns the membership state whether or not this call changed anything, so
 * the client can unlock member pricing without a follow-up fetch.
 */
galleryApp.post("/join", async (c) => {
  const user = c.get("user");

  const body = await c.req.json().catch(() => null);
  const parsed = joinBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Unknown join source" }, 400);
  }
  const source = parsed.data;

  try {
    const [existing] = await db
      .select({
        galleryMember: users.galleryMember,
        galleryJoinedAt: users.galleryJoinedAt,
        marketingConsentAt: users.marketingConsentAt,
        joinSource: users.joinSource,
      })
      .from(users)
      .where(eq(users.id, user.id));

    // A valid session over a row that no longer exists. Writing would match
    // nothing and the response would claim a membership held by no one.
    if (!existing) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Already a member: hand back what is stored, touch nothing. This is the
    // whole idempotence guarantee — see the note at the top of the file.
    if (existing.galleryMember) {
      return c.json({
        galleryMember: true,
        galleryJoinedAt: existing.galleryJoinedAt,
        marketingConsentAt: existing.marketingConsentAt,
        joinSource: existing.joinSource,
      });
    }

    /**
     * One instant for both stamps: two different timestamps for a single
     * click would read, later, as consent collected separately from the join.
     *
     * Existing values still win. Consent can predate the flag — an older
     * opt-in, or a write that only half landed — and re-stamping it because
     * `galleryMember` happened to be false loses the real date just as surely
     * as re-stamping on every click would.
     */
    const now = new Date();
    const galleryJoinedAt = existing.galleryJoinedAt ?? now;
    const marketingConsentAt = existing.marketingConsentAt ?? now;
    const joinSource = existing.joinSource ?? source;

    await db
      .update(users)
      .set({
        galleryMember: true,
        galleryJoinedAt,
        marketingConsentAt,
        joinSource,
      })
      .where(eq(users.id, user.id));

    return c.json({
      galleryMember: true,
      galleryJoinedAt,
      marketingConsentAt,
      joinSource,
    });
  } catch (error) {
    console.error("Failed to join the gallery:", error);
    return c.json({ error: "Failed to join the gallery" }, 500);
  }
});

export default galleryApp;
