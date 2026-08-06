/**
 * The gallery join intent, held where it can survive an auth redirect (#441).
 *
 * A guest cannot join — `POST /api/gallery/join` is authenticated (#440) — so
 * the offer sends them to registration and the join happens on the far side of
 * signing in. Google sign-in is a full navigation to another origin and back:
 * by the time a session exists, the component that held the checkbox has been
 * destroyed and every piece of React state with it. A cookie is what crosses
 * that gap.
 *
 * The API reads this cookie in better-auth's `session.create.after` hook and
 * joins with `joinSource: 'registration'`, then clears it. Same names, same
 * value, both ends — see `packages/api/src/services/gallery-membership.ts`.
 *
 * ## Why a plain, unsigned cookie is fine here
 *
 * It carries one bit: "this person asked to join". It is not a credential and
 * grants nothing — the join still requires a real session, and the worst a
 * forger can do is opt themselves in. What it must NOT be is long-lived: it
 * bridges one auth round trip, so an abandoned intent expires rather than
 * joining someone months later from a visit they no longer remember.
 *
 * ## Why the API host does not matter
 *
 * Cookies are scoped by host and ignore the port, so a cookie written here on
 * `localhost:3001` is sent to the API on `localhost:3000` in development. In
 * production the two are the same origin (`VITE_API_URL` is empty and the edge
 * routes `/api`), so it is sent there too.
 */

/** Must match `JOIN_INTENT_COOKIE` in the API service. */
export const JOIN_INTENT_COOKIE = 'chobii_join_intent'

/** Must match `JOIN_INTENT_VALUE` in the API service. */
export const JOIN_INTENT_VALUE = 'gallery'

/** Must match `JOIN_INTENT_MAX_AGE_SECONDS` in the API service. */
export const JOIN_INTENT_MAX_AGE_SECONDS = 30 * 60

/**
 * `Lax` rather than `Strict`: the OAuth callback arrives as a top-level
 * navigation from Google, and `Strict` would withhold the cookie on exactly
 * the request that needs it.
 */
function write(value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return
  document.cookie =
    `${JOIN_INTENT_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`
}

/** Record that the visitor asked to join. */
export function setJoinIntent(): void {
  write(JOIN_INTENT_VALUE, JOIN_INTENT_MAX_AGE_SECONDS)
}

/** Withdraw it — unticking the box has to actually withdraw consent. */
export function clearJoinIntent(): void {
  write('', 0)
}

/**
 * Is the intent standing?
 *
 * The value is checked, not just the name: clearing writes the cookie back
 * empty, and an empty value must not read as a standing intent.
 */
export function hasJoinIntent(): boolean {
  if (typeof document === 'undefined') return false

  for (const pair of document.cookie.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue

    if (pair.slice(0, separator).trim() !== JOIN_INTENT_COOKIE) continue

    const raw = pair.slice(separator + 1).trim()
    let value = raw
    try {
      value = decodeURIComponent(raw)
    } catch {
      // A malformed escape sequence. Compare the raw text rather than throwing
      // out of a render.
    }
    if (value === JOIN_INTENT_VALUE) return true
  }

  return false
}
