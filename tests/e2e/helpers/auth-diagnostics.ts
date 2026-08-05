/**
 * Auth setup diagnostics (#451)
 *
 * The sign-in endpoint is throttled at 5 requests / 60s per IP
 * (`packages/api/src/middleware/rate-limit.ts`), and every local request lands
 * in the same "unknown" IP bucket. When the auth setup trips it, the app
 * renders neither "Sign in failed" nor "Invalid email or password" — the login
 * simply never navigates. Read as a credential problem that costs real
 * diagnosis time, so the setup captures the response status instead of
 * guessing from the DOM.
 */

export interface AuthResponseProbe {
  url: string;
  status: number;
  /** Value of the Retry-After header, in seconds, as sent. */
  retryAfter: string | null;
}

/** Requests the auth rate limiters guard — see packages/api/src/index.ts. */
const AUTH_PATH = "/api/auth/";

/**
 * First throttled auth response in a set of captured responses, if any.
 */
export function findRateLimitHit(
  probes: AuthResponseProbe[]
): AuthResponseProbe | undefined {
  return probes.find(
    (probe) => probe.status === 429 && probe.url.includes(AUTH_PATH)
  );
}

/**
 * Failure message for a login that never navigated away from /auth/login.
 */
export function loginFailureMessage(
  email: string,
  hit: AuthResponseProbe | undefined
): string {
  if (!hit) {
    return (
      `Login for ${email} never left /auth/login and no rate limit was hit. ` +
      `Check the API is reachable and the account exists.`
    );
  }

  const wait = hit.retryAfter ? `${hit.retryAfter}s` : "up to 60s";

  return (
    `Login for ${email} was rate limited: ${hit.status} Too Many Requests ` +
    `from ${hit.url} (retry after ${wait}). The auth limiter allows 5 ` +
    `requests/60s per IP and all local traffic shares one bucket, so four ` +
    `role setups exceed it. Start the API with DISABLE_RATE_LIMIT=true ` +
    `(the packages/api dev script does this) and retry.`
  );
}
