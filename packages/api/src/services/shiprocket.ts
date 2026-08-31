/**
 * Shiprocket carrier configuration.
 *
 * Phase 5 of order-dispatch-tracking, and deliberately only phase 5: there are
 * no credentials yet, so there is no client here. Auth and token refresh,
 * courier serviceability, AWB assignment, label PDFs and pickup scheduling are
 * phase 6, and every one of them is gated on keys that do not exist.
 *
 * What this file delivers is the difference between "we have no keys" being a
 * documented state an admin can read and act on, and it being a crash in front
 * of a customer's parcel at the moment somebody tries to dispatch it.
 *
 * ## The seam
 *
 * `lib/production-readiness.ts` declares `PRODUCTION_LIB_FORBIDDEN_IMPORT =
 * 'shiprocket'`, and `tests/lib/production-seam.test.ts` scans for it: no
 * module under `lib/production-*` may import anything named `shiprocket`, in
 * any import form. That guard is why this lives under `services/` — the scan
 * names `../services/shiprocket` in its own fixtures. If a production-* module
 * ever needs a fact from here, the fact crosses as a parameter. Never as an
 * import.
 *
 * ## Why the environment is read per call
 *
 * `lib/razorpay.ts` reads its credentials into module-level constants at import
 * time. This file does not, and the departure is deliberate. A module-load read
 * freezes configuration before any test can set it, so the configured and
 * unconfigured paths cannot both be exercised in one run — which is why
 * `isRazorpayConfigured` has no test that observes it returning both values.
 * The unconfigured path is the ONLY path that exists today, so it is the one
 * that has to be reachable.
 *
 * @see packages/api/tests/services/shiprocket-config.test.ts
 * @see packages/api/src/lib/production-readiness.ts
 */

/**
 * Every environment variable this module reads.
 *
 * Exported so a test can hold `.env.example` to it: a variable added here and
 * left undocumented fails the suite rather than surprising whoever deploys.
 */
export const SHIPROCKET_ENV_VARS = [
  'SHIPROCKET_EMAIL',
  'SHIPROCKET_PASSWORD',
  'SHIPROCKET_BASE_URL',
] as const;

export type ShiprocketEnvVar = (typeof SHIPROCKET_ENV_VARS)[number];

/** Shiprocket's own v1 API. Overridable so a sandbox tenant is reachable. */
const DEFAULT_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

/** The two that must be present for anything at all to be possible. */
const REQUIRED_ENV_VARS = ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'] as const;

export interface ShiprocketConfig {
  email: string;
  password: string;
  baseUrl: string;
}

/** Base class, so phase 6's failures can share a `catch` with this one. */
export class ShiprocketError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShiprocketError';
    this.code = code;
  }
}

/**
 * Thrown by every entry point that needs credentials, when there are none.
 *
 * A distinct class rather than a flag on `ShiprocketError`, because this is the
 * one Shiprocket failure that is nobody's outage: it means somebody has not
 * finished setting the integration up, and the person reading it can fix it.
 */
export class ShiprocketNotConfiguredError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_NOT_CONFIGURED');
    this.name = 'ShiprocketNotConfiguredError';
  }
}

/**
 * Read one variable, treating blank as absent.
 *
 * A key that is present but empty in a `.env` is the failure mode that looks
 * configured and is not — the same property `#670` pinned one layer down, where
 * an empty string satisfying `IS NOT NULL` let a blank tracking number count as
 * a label.
 */
function readEnv(key: ShiprocketEnvVar): string | null {
  const raw = process.env[key];
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether Shiprocket can be called at all. Cheap, and safe to call anywhere. */
export function isShiprocketConfigured(): boolean {
  return REQUIRED_ENV_VARS.every((key) => readEnv(key) !== null);
}

/**
 * Refuse, naming what is missing and where it is set.
 *
 * The message names the VARIABLES and never their values. Naming a variable is
 * the help; naming what it currently holds is a credential leak into a log line
 * or a response body, and this function is reachable on a path where a value
 * exists to leak.
 */
export function assertShiprocketConfigured(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => readEnv(key) === null);
  if (missing.length === 0) return;

  throw new ShiprocketNotConfiguredError(
    `Shiprocket is not configured: ${missing.join(', ')} ${
      missing.length === 1 ? 'is' : 'are'
    } not set. ` +
      `Set ${REQUIRED_ENV_VARS.join(' and ')} in the API environment, from the ` +
      `credentials in your Shiprocket dashboard. Dispatch cannot buy a label until then.`
  );
}

/**
 * The configuration, or a refusal. Never a null a caller can step past.
 *
 * The caller is about to spend money with a courier, so "not configured" has to
 * stop the call rather than return something falsy that an `if` might miss.
 */
export function getShiprocketConfig(): ShiprocketConfig {
  assertShiprocketConfigured();

  return {
    email: readEnv('SHIPROCKET_EMAIL')!,
    password: readEnv('SHIPROCKET_PASSWORD')!,
    baseUrl: readEnv('SHIPROCKET_BASE_URL') ?? DEFAULT_BASE_URL,
  };
}
