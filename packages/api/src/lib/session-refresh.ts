/**
 * Re-issuing a session whose user row has just changed (#526).
 *
 * `session.cookieCache` (packages/api/src/auth/index.ts) serves the whole
 * session — better-auth `user.additionalFields` included — from a signed cookie
 * for five minutes. A route that flips one of those fields has changed the
 * database and nothing else: for the rest of that window every server-side read
 * of the session still returns the old value, and the client has no way to
 * tell. `POST /api/gallery/join` is the case that made this expensive — a fresh
 * member read as a guest, and was charged base price.
 *
 * WHY NOT WRITE THE COOKIE HERE
 *
 * The cached payload is signed, versioned and chunked by better-auth
 * (`setCookieCache` in better-auth/cookies), and its encoding is not ours to
 * reproduce — `lib/session-cookie.ts` hand-builds the session TOKEN cookie for
 * phone auth and that is already one hand-rolled encoding too many. better-auth
 * has a primitive for exactly this: `GET /get-session` with `disableCookieCache`
 * skips the cached payload, reads the session and its user from the database,
 * and ends by calling `setCookieCache` with what it found. Asking better-auth
 * for the session IS the refresh; `returnHeaders` hands back the `Set-Cookie` it
 * produced, which is all this module forwards.
 *
 * BEST EFFORT ON PURPOSE
 *
 * Every caller has already committed its write before getting here. A refresh
 * that fails leaves a stale cookie for a few minutes, which is where this
 * started — so it is a real cost, but it is not a reason to fail the write, and
 * the paths that decide money read the row rather than the session anyway.
 */

import type { Context } from "hono";

import { auth } from "../auth";

/**
 * Node's `Headers` gained `getSetCookie()` in 18.14; `set-cookie` is the one
 * header `get()` cannot join safely, so a runtime without it can only offer the
 * first. Typed loosely because the DOM lib this package compiles against does
 * not always declare it.
 */
type MaybeSetCookieHeaders = Headers & {
  getSetCookie?: () => string[];
};

function readSetCookies(headers: Headers | null | undefined): string[] {
  if (!headers) return [];

  const withGetter = headers as MaybeSetCookieHeaders;
  if (typeof withGetter.getSetCookie === "function") {
    return withGetter.getSetCookie();
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Re-issue the caller's session cookie from the database, so the next request
 * sees the row this one just wrote.
 *
 * Appends rather than sets: better-auth may emit more than one cookie (the
 * cached payload can be chunked, and a session due for its periodic refresh
 * gets a new token alongside it), and `Set-Cookie` is the header that must
 * never be collapsed into one comma-joined value.
 *
 * Returns whether anything was re-issued — useful to a caller that wants to log
 * it, and never a reason to fail the request.
 */
export async function refreshSessionCookie(c: Context): Promise<boolean> {
  try {
    const { headers } = await auth.api.getSession({
      headers: c.req.raw.headers,
      // The whole point: read the row, not the five-minute-old copy of it.
      query: { disableCookieCache: true },
      returnHeaders: true,
    });

    const cookies = readSetCookies(headers);
    if (cookies.length === 0) return false;

    for (const cookie of cookies) {
      c.header("set-cookie", cookie, { append: true });
    }

    return true;
  } catch (error) {
    console.error("Failed to re-issue the session cookie:", error);
    return false;
  }
}
