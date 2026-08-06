/**
 * Gallery membership — the one routine that makes someone a member (#440, #441).
 *
 * There are two ways into the gallery and they must not be two implementations:
 *
 *   - `POST /api/gallery/join` (#440), pressed from a banner, a rail, the cart
 *     or the sale page by someone who is already signed in;
 *   - the registration intent (#441), where a guest took the offer, was sent to
 *     registration, and is joined on the far side of the auth redirect.
 *
 * The idempotence guarantee — WHICH dates survive a second join — is the whole
 * value of #440, and a guarantee that lives in a route handler only holds for
 * traffic through that handler. So the write lives here, once, and both paths
 * call it.
 *
 * WHICH DATES SURVIVE
 *
 * A member who joins again must not move `galleryJoinedAt` and must not
 * re-stamp `marketingConsentAt`. The FIRST consent date is the one that has to
 * be producible if the consent is ever questioned; overwriting it destroys the
 * only evidence there was. So a member's re-join reads the stored state and
 * returns it without writing anything, and even the first-join write preserves
 * any consent that already exists.
 *
 * HOW THE INTENT SURVIVES THE REDIRECT
 *
 * Google sign-in is a full navigation to another origin and back. Every piece
 * of component state the registration page held is gone by the time a session
 * exists, so the intent rides a short-lived cookie instead. `consumeJoinIntent`
 * is called from better-auth's `session.create.after` hook — the first moment
 * on the far side where a user id and the request's cookies are both in hand,
 * and one that both the email and the OAuth flows pass through.
 *
 * See docs/superpowers/specs/2026-08-05-sale-promotions-design.md §8.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database";
import { users } from "../database/schema/users";

// ============================================================================
// Join source
// ============================================================================

/**
 * Where the shopper joined from. A closed set, not client text: the column is
 * plain `text` with nothing behind it, so this is the only gate. Attribution
 * data ends up in reports, and one free-text field is all it takes to make
 * them unusable.
 */
export const joinSourceSchema = z.enum([
  "banner",
  "rail",
  "cart",
  "registration",
  "sale-page",
]);

export type JoinSource = z.infer<typeof joinSourceSchema>;

// ============================================================================
// The intent cookie
// ============================================================================

/**
 * Set by the registration page when the visitor opts in, read here on the far
 * side of the auth redirect. Not a secret and not signed — it carries a single
 * bit of intent, and the worst a forger can do is opt themselves in.
 */
export const JOIN_INTENT_COOKIE = "chobii_join_intent";

/** The only value that reads as a standing intent. */
export const JOIN_INTENT_VALUE = "gallery";

/**
 * Short on purpose. This is a bridge across one auth round trip, not a
 * standing preference — an abandoned intent must not join someone months
 * later, from a session they no longer associate with the offer.
 */
export const JOIN_INTENT_MAX_AGE_SECONDS = 30 * 60;

/**
 * Is the intent standing in this request's cookies?
 *
 * The VALUE is checked, not just the name: clearing the cookie writes it back
 * empty, and an empty value must not read as a standing intent.
 */
export function hasJoinIntent(
  cookieHeader: string | null | undefined
): boolean {
  if (!cookieHeader) return false;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;

    const name = pair.slice(0, separator).trim();
    if (name !== JOIN_INTENT_COOKIE) continue;

    const raw = pair.slice(separator + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // A malformed escape sequence. Compare the raw text rather than throwing
      // out of a hook that runs on every login.
    }
    if (value === JOIN_INTENT_VALUE) return true;
  }

  return false;
}

// ============================================================================
// The join
// ============================================================================

export interface GalleryMembershipState {
  galleryMember: true;
  galleryJoinedAt: Date;
  marketingConsentAt: Date;
  joinSource: string;
}

export type JoinGalleryResult =
  | { status: "joined"; membership: GalleryMembershipState }
  | { status: "already-member"; membership: GalleryMembershipState }
  | { status: "not-found" };

/**
 * Opt a user into the gallery. Idempotent: a member's second call reads the
 * stored state and writes nothing.
 *
 * Throws on a database failure — callers decide what a failed join means for
 * their surface (the route answers 500; the auth hook swallows it rather than
 * failing a signup that otherwise succeeded).
 */
export async function joinGallery(
  userId: string,
  source: JoinSource
): Promise<JoinGalleryResult> {
  const [existing] = await db
    .select({
      galleryMember: users.galleryMember,
      galleryJoinedAt: users.galleryJoinedAt,
      marketingConsentAt: users.marketingConsentAt,
      joinSource: users.joinSource,
    })
    .from(users)
    .where(eq(users.id, userId));

  // A valid session over a row that no longer exists. Writing would match
  // nothing and the answer would claim a membership held by no one.
  if (!existing) return { status: "not-found" };

  // Already a member: hand back what is stored, touch nothing. This is the
  // whole idempotence guarantee — see the note at the top of the file.
  if (existing.galleryMember) {
    return {
      status: "already-member",
      membership: {
        galleryMember: true,
        galleryJoinedAt: existing.galleryJoinedAt as Date,
        marketingConsentAt: existing.marketingConsentAt as Date,
        joinSource: existing.joinSource as string,
      },
    };
  }

  /**
   * One instant for both stamps: two different timestamps for a single click
   * would read, later, as consent collected separately from the join.
   *
   * Existing values still win. Consent can predate the flag — an older opt-in,
   * or a write that only half landed — and re-stamping it because
   * `galleryMember` happened to be false loses the real date just as surely as
   * re-stamping on every click would.
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
    .where(eq(users.id, userId));

  return {
    status: "joined",
    membership: {
      galleryMember: true,
      galleryJoinedAt,
      marketingConsentAt,
      joinSource,
    },
  };
}

// ============================================================================
// The post-auth hook
// ============================================================================

/**
 * The slice of better-auth's endpoint context this needs. Typed structurally
 * rather than against `GenericEndpointContext` so the hook stays unit-testable
 * with a plain object — and so a better-auth upgrade that reshapes the context
 * degrades to "no intent found" instead of a type error in the auth config.
 */
interface CookieBearingContext {
  headers?: { get(name: string): string | null } | null;
  request?: { headers?: { get(name: string): string | null } | null } | null;
  setCookie?: (name: string, value: string, options?: unknown) => unknown;
}

function asCookieContext(ctx: unknown): CookieBearingContext | null {
  return ctx && typeof ctx === "object" ? (ctx as CookieBearingContext) : null;
}

function readCookieHeader(ctx: CookieBearingContext | null): string | null {
  if (!ctx) return null;
  const direct = ctx.headers?.get?.("cookie");
  if (direct) return direct;
  return ctx.request?.headers?.get?.("cookie") ?? null;
}

/**
 * Honour a standing join intent for a session that has just been created.
 *
 * Returns `null` — with no database access whatever — when there is no intent.
 * Every login in the system runs this hook, and an ordinary sign-in must not
 * pay for a membership lookup it has no use for.
 */
export async function consumeJoinIntent(
  userId: string,
  ctx: unknown
): Promise<JoinGalleryResult | null> {
  if (!userId) return null;

  const context = asCookieContext(ctx);
  if (!hasJoinIntent(readCookieHeader(context))) return null;

  // Registration is the attribution even when the visitor first pressed the
  // banner: it is the touchpoint that actually produced the account.
  const result = await joinGallery(userId, "registration");

  // Consumed either way. Left standing, a stale intent rides every subsequent
  // login until it expires, re-running a join that has already happened.
  clearJoinIntentCookie(context);

  return result;
}

function clearJoinIntentCookie(ctx: CookieBearingContext | null): void {
  if (typeof ctx?.setCookie !== "function") return;
  try {
    ctx.setCookie(JOIN_INTENT_COOKIE, "", {
      maxAge: 0,
      path: "/",
      sameSite: "Lax",
    });
  } catch (error) {
    // Clearing is housekeeping. A better-auth context that will not take a
    // cookie must not fail the sign-in that triggered this.
    console.error("Failed to clear the gallery join intent cookie:", error);
  }
}
