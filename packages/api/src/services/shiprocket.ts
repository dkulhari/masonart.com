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

// Money rounding is reused rather than rewritten. `toPaise` lives under
// `lib/razorpay.ts` because payments needed it first, but it is generic and
// duplicating `Math.round(x * 100)` here is how two code paths drift a paisa
// apart on different orders.
import { toPaise } from '../lib/razorpay';

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
 * Thrown when Shiprocket refuses the credentials we hold.
 *
 * Distinct from `ShiprocketNotConfiguredError`: that one means nobody has
 * finished the setup, this one means the setup is wrong. Both are an operator's
 * to fix, and neither is an outage, but only this one has already spent a round
 * trip finding out.
 */
export class ShiprocketAuthError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_AUTH_REJECTED');
    this.name = 'ShiprocketAuthError';
  }
}

/**
 * Thrown when no courier will carry this parcel on this route.
 *
 * A distinct type because it is NOT an outage and must not be reported as one.
 * It means "nobody delivers from here to there today", which an admin can act
 * on — by using a different courier account, or by telling the customer. A
 * generic error would put it in the same bucket as Shiprocket being unreachable,
 * and the two need different sentences and different HTTP statuses.
 */
export class ShiprocketNotServiceableError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_NOT_SERVICEABLE');
    this.name = 'ShiprocketNotServiceableError';
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

// ============================================================================
// Authentication
// ============================================================================

/**
 * How close to expiry a cached token may get before it is replaced.
 *
 * A day, against a token the live account issues with ten days of life. The
 * margin only has to exceed the longest plausible gap between deciding a token
 * is good and finishing the request that uses it, so a day is generous and
 * costs one extra login per ten.
 */
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * Used only when a token arrives whose `exp` we cannot read.
 *
 * Short on purpose. The token still works — we simply cannot say for how long,
 * and treating an unknown expiry as a long one is how a dead token gets served
 * for days. An hour keeps the integration running while making the uncertainty
 * cheap.
 */
const UNKNOWN_EXPIRY_TTL_MS = 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * The login in flight, if any.
 *
 * Without this, N concurrent callers on a cold cache each issue their own
 * login. The endpoint is rate-limited, so a burst of dispatches would answer
 * its own request storm with 429s.
 */
let inFlight: Promise<string> | null = null;

/**
 * Read the `exp` claim out of a JWT, in seconds since the epoch.
 *
 * Returns null rather than throwing for anything unreadable: a token we cannot
 * parse is still a token Shiprocket gave us, and refusing to use it would turn
 * a format change on their side into a total outage on ours.
 */
function readExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp : null;
  } catch {
    return null;
  }
}

/** Clears the cached token. Exported for tests; nothing in `src/` should call it. */
export function resetShiprocketAuthCacheForTests(): void {
  cached = null;
  inFlight = null;
}

async function login(): Promise<string> {
  const config = getShiprocketConfig();

  const response = await fetch(`${config.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });

  if (!response.ok) {
    // 403, not 401, when the credentials are wrong — measured against the live
    // account. Deliberately NOT retried: the endpoint is rate-limited and a
    // refusal is a configuration fact, so retrying converts a wrong password
    // into a locked-out integration.
    throw new ShiprocketAuthError(
      `Shiprocket rejected the API credentials (HTTP ${response.status}). ` +
        'Check SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD against the API user in ' +
        'your Shiprocket dashboard under Settings > API.'
    );
  }

  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== 'string' || body.token === '') {
    throw new ShiprocketAuthError('Shiprocket returned no token for a successful login.');
  }

  const exp = readExpiry(body.token);
  const expiresAt =
    exp === null ? Date.now() + UNKNOWN_EXPIRY_TTL_MS : exp * 1000;

  cached = { token: body.token, expiresAt };
  return body.token;
}

/**
 * A usable Shiprocket token, logging in only when the cached one is gone or
 * close to expiring.
 *
 * The expiry comes from the token's own `exp` claim, never from an assumed
 * lifetime. Ten days is what the live account issues today; that is Shiprocket's
 * to change, and a hardcoded ten would keep serving a dead token for the
 * difference — failing silently, and late.
 */
export async function getShiprocketAuthToken(): Promise<string> {
  // Before the network, so an unconfigured tree refuses without a round trip.
  assertShiprocketConfigured();

  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cached.token;
  }

  if (inFlight) return inFlight;

  inFlight = login().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

// ============================================================================
// Serviceability and courier selection
// ============================================================================

/** One courier that will carry this parcel, in our vocabulary rather than theirs. */
export interface CourierOption {
  courierCompanyId: number;
  courierName: string;
  /** Integer paise, matching `order_shipments.cost_paise`. */
  ratePaise: number;
  /** Shiprocket's estimated delivery date, as the free text they send. */
  etd: string | null;
  supportsCod: boolean;
  blocked: boolean;
}

/**
 * The COD flag is NOT cosmetic — it changes the price.
 *
 * Measured on the live account, same route and weight:
 *   prepaid  153.15  ->  15315 paise
 *   COD      208.80  ->  20880 paise
 *
 * So a quote is only valid for the COD status it was requested with. Quoting
 * prepaid and then shipping COD books a rate we will not be charged, and the
 * difference turns up on the invoice rather than in the order.
 */
export interface ServiceabilityQuery {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
}

/**
 * Shiprocket sends ~50 fields per courier, including `SLA_Adherence`,
 * `SLA_Breach`, `RTO w/o_Attempt` and `Attempt_Speed`.
 *
 * We read six. The SLA metrics are deliberately ignored: we have no evidence
 * they mean what their names suggest, and a ranking built on a misread field is
 * worse than one built on price alone because it looks considered.
 */
function toCourierOption(raw: Record<string, unknown>): CourierOption | null {
  const id = Number(raw.courier_company_id);
  const name = raw.courier_name;
  const rate = Number(raw.rate);

  if (!Number.isFinite(id) || typeof name !== 'string' || !Number.isFinite(rate)) return null;

  return {
    courierCompanyId: id,
    courierName: name,
    ratePaise: toPaise(rate),
    etd: typeof raw.etd === 'string' && raw.etd !== '' ? raw.etd : null,
    // Shiprocket sends 1/0, not booleans.
    supportsCod: Number(raw.cod) === 1,
    blocked: Number(raw.blocked) === 1,
  };
}

/**
 * Which couriers will carry this parcel on this route.
 *
 * An empty list is an ordinary answer meaning nobody serves the route today —
 * not an error. The live account currently returns exactly one courier, so
 * callers must not assume a rich list.
 */
export async function checkServiceability(query: ServiceabilityQuery): Promise<CourierOption[]> {
  const config = getShiprocketConfig();
  const token = await getShiprocketAuthToken();

  const params = new URLSearchParams({
    pickup_postcode: query.pickupPincode,
    delivery_postcode: query.deliveryPincode,
    weight: String(query.weightKg),
    cod: query.cod ? '1' : '0',
  });

  const response = await fetch(`${config.baseUrl}/courier/serviceability/?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new ShiprocketError(
      `Shiprocket could not answer serviceability for ${query.pickupPincode} to ` +
        `${query.deliveryPincode} (HTTP ${response.status}).`,
      'SHIPROCKET_SERVICEABILITY_FAILED'
    );
  }

  const body = (await response.json()) as {
    data?: { available_courier_companies?: unknown };
  };
  const raw = body?.data?.available_courier_companies;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => toCourierOption(entry as Record<string, unknown>))
    .filter((option): option is CourierOption => option !== null);
}

/**
 * The courier we would use, or null if none of them will do.
 *
 * Cheapest usable option wins. `blocked` is respected because a blocked courier
 * in the list is not an option, and a COD order refuses a courier that cannot
 * collect cash. Ties keep the earlier entry, so the result is deterministic
 * without inventing a second ranking criterion.
 */
export function selectCourier(
  options: readonly CourierOption[],
  { cod }: { cod: boolean }
): CourierOption | null {
  let best: CourierOption | null = null;

  for (const option of options) {
    if (option.blocked) continue;
    if (cod && !option.supportsCod) continue;
    // Strictly cheaper, so an equal price keeps the earlier entry.
    if (best === null || option.ratePaise < best.ratePaise) best = option;
  }

  return best;
}

/**
 * Ask, choose, and refuse readably if nothing will carry it.
 *
 * The refusal names both pincodes: an admin reading it has to know which leg
 * failed without going to the logs.
 */
export async function selectCourierFor(query: ServiceabilityQuery): Promise<CourierOption> {
  const options = await checkServiceability(query);
  const chosen = selectCourier(options, { cod: query.cod });

  if (chosen === null) {
    const qualifier = query.cod ? ' that can collect cash on delivery' : '';
    throw new ShiprocketNotServiceableError(
      `No courier${qualifier} will carry this parcel from ${query.pickupPincode} to ` +
        `${query.deliveryPincode}. ${options.length === 0
          ? 'Shiprocket offered none for this route.'
          : `All ${options.length} courier(s) offered were unusable.`}`
    );
  }

  return chosen;
}
