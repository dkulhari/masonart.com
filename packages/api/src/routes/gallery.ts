/**
 * Gallery Membership API Routes
 *
 * - POST /api/gallery/join - opt the caller into the gallery
 *
 * Requires authentication. Guests get 401 rather than an anonymous
 * membership: the join modal routes them through registration first, and the
 * intent they carry is honoured on the far side by the post-auth hook (#441).
 *
 * THE WRITE DOES NOT LIVE HERE
 *
 * `joinGallery` is in `services/gallery-membership.ts` because there are two
 * ways into the gallery — this endpoint and the registration intent — and the
 * idempotence guarantee (which dates survive a second join) would otherwise
 * hold only for traffic through this handler. One routine, both paths.
 *
 * `joinSource` is validated against a fixed set rather than stored as whatever
 * text the client sent — this is attribution data that ends up in reports, and
 * one free-text field is all it takes to make them unusable.
 *
 * See docs/superpowers/specs/2026-08-05-sale-promotions-design.md §8.
 */

import { Hono } from "hono";
import { z } from "zod";

import { joinGallery, joinSourceSchema } from "../services/gallery-membership";
import { refreshSessionCookie } from "../lib/session-refresh";
import { requireAuth, type AuthVariables } from "../middleware/auth";

// ============================================================================
// Validation
// ============================================================================

export type { JoinSource } from "../services/gallery-membership";

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

  try {
    const result = await joinGallery(user.id, parsed.data);

    if (result.status === "not-found") {
      return c.json({ error: "Account not found" }, 404);
    }

    /**
     * The row is not the whole truth until the session agrees with it.
     *
     * `galleryMember` rides the session (#439) and better-auth serves the
     * session from a five-minute signed cookie, so a join that writes only the
     * row leaves the server answering "guest" to the customer who just joined —
     * locked prices on the grid, no saving in the cart (#526). Re-issued here,
     * on the one request that knows the flag changed, rather than paid for by
     * every priced request afterwards.
     *
     * A re-join refreshes too: an already-member calling this is usually a
     * client that thinks it is not one, which is exactly the stale-cookie case.
     */
    await refreshSessionCookie(c);

    return c.json(result.membership);
  } catch (error) {
    console.error("Failed to join the gallery:", error);
    return c.json({ error: "Failed to join the gallery" }, 500);
  }
});

export default galleryApp;
