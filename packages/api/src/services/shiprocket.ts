/**
 * The Shiprocket client.
 *
 * This file opened as configuration alone, and said so: *"there are no
 * credentials yet, so there is no client here"*. **That premise is dead.** The
 * keys arrived, #724 added the cached token and #725 added serviceability, and
 * #726 adds the first two calls that WRITE to a courier. What survives from
 * phase 5 is the part that was worth stating: that "we have no keys" is a
 * documented state an admin can read and act on, rather than a crash in front
 * of a customer's parcel at the moment somebody tries to dispatch it.
 *
 * ## Reads are repeatable. Writes are not.
 *
 * Login and serviceability can be called a hundred times and cost nothing.
 * `createCourierOrder` puts a real order in Shiprocket's dashboard,
 * `assignAwb` mints a real waybill a courier expects to collect against and
 * `generateLabel` bills a label (#727), so
 * everything below the "writes" banner is built around one question a read
 * never has to ask: *if this call did not answer, did it happen?* The answers
 * are typed — `ShiprocketWriteOutcomeUnknownError` is not a failure, it is a
 * refusal to guess — and `tests/services/shiprocket-courier-writes.test.ts`
 * exercises every one of them against stubbed fetch, against a base URL
 * pointed at a reserved `.invalid` host, with a guard block that drives this
 * client itself and then asserts nothing addressed `apiv2.shiprocket.in`.
 *
 * ## The one question, and where the answer to it is kept
 *
 * Every decision below the writes banner answers *"was something minted?"*,
 * and nothing else decides which type comes out. Three of those decisions are
 * made before any answer exists, and they are the only part of the sequence
 * that lives in prose:
 *
 * 0. **Everything refusable before a byte is sent is refused there** — the
 *    pickup nickname, the consignee's address, the parcel's measurements, the
 *    arithmetic. A refusal that happens before the write can never be the
 *    reason a duplicate exists. (The consignee joined that list late; until it
 *    did, a blank pincode was posted to a real courier and the clause was
 *    false.)
 * 1. **Either id already recorded → nothing is sent.** Both ids present, the
 *    recorded pair is returned; only ONE present, a refusal — because a
 *    half-record is a courier order that exists and cannot be used, and reading
 *    it as "nothing exists" makes a second one.
 * 2. **Anything that throws between "we started sending" and "we hold the
 *    body" → unknown outcome.** Not just a rejected `fetch`: the timeout that
 *    bounds the request aborts the body stream too.
 *
 * **Everything after that is `COURIER_WRITE_CLAUSES`, and it is data.** This
 * section used to run to twelve numbered clauses describing branches that
 * existed only as a chain of `if`s in two functions — the correctness of the
 * whole file resting on their ORDER, with nothing but this paragraph holding
 * it. Move one by a position and an unknown outcome becomes a definite refusal
 * whose text is "it is safe to correct the shipment and ask again", which is
 * an instruction to mint a second real courier order or a second real waybill.
 * No type, no structure and no test could see that.
 *
 * So the six decision sequences are now ordered tables assembled by
 * `orderedClauses`, which takes the clauses that leave a mint OPEN and the
 * ones that RULE IT OUT as two separately-typed arrays. A definite refusal
 * cannot be written among the open ones without a typecheck failure; the order
 * inside each group is pinned by name in the suite; and every boundary where
 * one answer satisfies two clauses is driven with a real body, so the order is
 * shown to decide something rather than asserted to. Read the tables for what
 * each clause is and what it prevents — they carry the arguments this list
 * used to.
 *
 * Two things the tables cannot state about themselves, kept here:
 *
 * - **The credential verdict is an argued exception to the partition.** A 401
 *   IS a claim that nothing was minted, so it would belong with the definite
 *   refusals — but its warrant is the status, not their sentence, and on a 401
 *   their sentence is about the credential. It has to be asked before anything
 *   that reads a body, so it sits in the open group under its own verdict,
 *   held to one clause per table by the suite.
 * - **"We could not read it" is never "no".** A declined answer is safe to
 *   correct and ask again; an unreadable one is not, because asking again may
 *   mint a second waybill against a shipment that already has one. Exactly one
 *   clause in the whole module is a definite refusal on an accepted answer,
 *   and it fires only on a POSITIVE signal from Shiprocket.
 *
 * ## A token can die before its `exp`, and the cache has to be able to hear it
 *
 * Every authenticated call drops the cached token on a 401 and refuses with
 * `SHIPROCKET_AUTH_EXPIRED`. Nothing retries on its own: on a write, an
 * automatic retry is indistinguishable from a second real order. The failure
 * this closes — nine days of presenting a dead token, with a process restart
 * as the only remedy — is written up on `forgetTokenAfter`.
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
 * ## Money is a term of the contract, not a detail of the payload
 *
 * On a COD parcel the numbers in the create payload are not paperwork: their
 * sum is the cash a courier collects at a customer's door. `orders` keeps the
 * money in six columns and states its own identity (`schema/orders.ts:229-247`)
 * — `subtotal - discounts + shipping + tax = total`, `total - giftCardAmount =
 * what is still owed` — so this client takes every term as a named field, sends
 * each to the Shiprocket field that means it, and REFUSES before the network if
 * they do not add up to the amount the caller says is due. A client that
 * derived the collectible from the order lines alone would have overcharged the
 * fixture order by 251 rupees, silently, on every COD parcel.
 *
 * ## Their words go to the log, scrubbed. Never to the caller.
 *
 * Shiprocket's refusal bodies quote the payload back, and the payload is a
 * customer's name, street, phone and email. `pino`'s redaction is a list of
 * literal KEY PATHS (`lib/logger.paths.ts`) and matches nothing inside a string
 * value, so "the logger will handle it" is not available. What is logged is
 * their sentence with the values we ourselves sent replaced by the NAME of the
 * field they came from — which is more diagnostic than dropping it, not less,
 * and keeps the person out of the aggregator.
 *
 * The scrubbing itself is `lib/payload-echo-scrub.ts` and not this file. It
 * was this file, and being this file was the problem: it is the most delicate
 * code on the dispatch path, it was reachable only through the two calls that
 * write to a real courier, and a test that can only drive those calls can
 * assert that one fixture's values did not appear — never that a pass is
 * load-bearing. It is also not a carrier's concern; nothing in it knows what a
 * waybill is. The vocabulary of values to replace is DERIVED by walking the
 * payload object that was actually sent, the mechanism is heuristics rather
 * than a proof, and the claim that no value survives is CHECKED at the end
 * with the sentence withheld when it cannot be shown — see that module.
 *
 * What their body SAYS is read from more than the root `message`, because
 * Shiprocket runs Laravel and a 422 puts the half that names a field in an
 * `errors` bag — see `refusalReason`.
 *
 * ## Five premises this module asserts and has not verified
 *
 * This section used to say "one", and there were three; #727 brought two more.
 * Each is a claim about a third party that nothing in this repository
 * establishes, and three of them decide money or a waybill — so they are named
 * together here rather than left to be discovered one at a time. The list
 * claims to be COMPLETE, which is the only thing that makes it worth writing: a
 * premise a reader has to find for themselves is not covered by a section
 * promising there are five.
 *
 * There was a fourth, and it guarded a waybill. `assignAwb` had no in-flight
 * coalescing, defended on the ground that "assignment is keyed on Shiprocket's
 * own shipment id, so a second call names the same shipment rather than making
 * a second one" — a claim about Shiprocket, stated as fact, that #726 forbids
 * probing. It is not on this list because it was retired rather than
 * documented: `assignsInFlight` gives the second write the same mechanism the
 * first one has, and the sentence it rested on is gone.
 *
 * 1. **Shiprocket refuses a second `orders/create/adhoc` carrying an
 *    `order_id` it has already seen.** `saysAlreadyExists` is the automatic
 *    duplicate defence on the create path and rests on it; the probe that
 *    would establish it is the live write #726 forbids. If Shiprocket instead
 *    accepts the duplicate, what is left is the idempotency lookup — which is
 *    why it is a required argument, and why its type states the lock the
 *    caller has to hold. The in-process coalescing on `createCourierOrder`
 *    covers overlapping calls only and is not a substitute for that lock; the
 *    lookup's own doc block says exactly where it stops.
 * 2. **On a COD parcel the courier collects `sub_total + shipping_charges +
 *    transaction_charges + giftwrap_charges - total_discount`.** The whole of
 *    `assertChargesReconcile` is that sentence, and it is the premise here
 *    that decides cash at a customer's door. It is Shiprocket's documented
 *    arithmetic rather than a measured one: if their collectible were
 *    `sub_total` alone, this client would overcharge the fixture order by
 *    exactly the 251 rupees the reconciliation claims to prevent. The refusal
 *    is still worth having under either reading — it catches OUR terms
 *    disagreeing with OUR own total, which is a fact about this repository —
 *    but the mapping of our terms onto their fields is the assumption.
 * 3. **`courier/assign/awb` answers unwrapped as well as inside
 *    `response.data`.** `AWB_ENVELOPE_PATHS` says the endpoint "has been seen
 *    to answer" that way, and the fixtures it was written from are transcribed
 *    from Shiprocket's documented shapes, not measured — the test file says so
 *    in its own header. Reading both is the safe direction, so being wrong
 *    about this costs nothing; being wrong the other way classified a body
 *    naming a real waybill as "no waybill exists".
 * 4. **A second `courier/generate/label` for a shipment that already has one
 *    is billed again.** The ticket states it and this client is built on it:
 *    it is why `generateLabel` takes the caller's `label_object_token` as a
 *    REQUIRED argument and sends nothing when one is held, and why every
 *    label failure short of a positive "no" from Shiprocket says the label may
 *    exist rather than inviting a retry. If the premise is wrong the cost is
 *    a dashboard visit that was not needed; if it is right and ignored, the
 *    cost is a second invoice line per retry.
 * 5. **`courier/generate/pickup` answers a repeated request with a sentence
 *    containing "already in pickup queue" (or "already scheduled").** That
 *    wording is read as SUCCESS, which is what makes a pickup retry converge
 *    and what lets `SHIPROCKET_PICKUP_NOT_SCHEDULED` be the module's one
 *    retryable refusal. If the wording differs, a retry after a queued pickup
 *    is refused as "not scheduled" — safe, since it schedules nothing twice,
 *    but an operator would be told to retry something that is already done.
 *
 * ## Why the environment is read per call
 *
 * `lib/razorpay.ts` reads its credentials into module-level constants at import
 * time. This file does not, and the departure is deliberate. A module-load read
 * freezes configuration before any test can set it, so the configured and
 * unconfigured paths cannot both be exercised in one run — which is why
 * `isRazorpayConfigured` has no test that observes it returning both values.
 * Both paths exist now that the keys have arrived, and both have to stay
 * reachable: the unconfigured one is what an operator meets before setup, and
 * it must read as a documented state rather than a crash.
 *
 * ## Why there is no database import in this file
 *
 * A carrier client that could read `order_shipments` would inevitably start
 * writing them, and the idempotency check below — "does this shipment already
 * have a courier order?" — is exactly the hook that invites it. So the check is
 * a function the caller supplies (`CourierOrderLookup`), the same shape and the
 * same reason as `ProductionReader` in `lib/production-readiness.ts:118-124`
 * being one method. `tests/services/shiprocket-courier-writes.test.ts` scans
 * this file for a database import and fails on one.
 *
 * @see packages/api/tests/services/shiprocket-config.test.ts
 * @see packages/api/tests/services/shiprocket-courier-writes.test.ts
 * @see packages/api/src/lib/production-readiness.ts
 */

// Money rounding is reused rather than rewritten. `toPaise` lives under
// `lib/razorpay.ts` because payments needed it first, but it is generic and
// duplicating `Math.round(x * 100)` here is how two code paths drift a paisa
// apart on different orders.
import { toPaise, toRupees } from '../lib/razorpay';

// The only sink allowed to see a courier's own words. Everything Shiprocket
// says about a rejected write goes here and nowhere else — see
// `logCourierAnswer` for why the thrown message never carries it.
import { logger } from '../lib/logger';

// Their body quotes our payload back, and our payload is a customer's name,
// street, phone and email. Taking those out of somebody else's sentence is not
// a carrier's concern and lives in its own module — which is also what makes
// it testable without a courier write in front of it. See its header.
import {
  payloadEchoes,
  scrubEchoedValues,
  type EchoedField,
} from '../lib/payload-echo-scrub';

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
  // Read by `services/shiprocket-webhook.ts`, not by this client — listed
  // here because this is the list `.env.example` is held to (#732).
  'SHIPROCKET_WEBHOOK_SECRET',
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

// ============================================================================
// The refusal vocabulary — closed, and every member has a status and a test
// ============================================================================

/**
 * Every refusal this module can answer with, named rather than inferred.
 *
 * A closed union, in the shape `VendorJobRefusalCode` uses
 * (`lib/vendor-scope.ts:720-758`), and for the same reason: a route that
 * switches on a code needs the set to be enumerable, and a code that exists
 * only as a string literal at one throw site is not a contract. Before this
 * union, `SHIPROCKET_ORDER_CREATE_REJECTED` appeared exactly once in the whole
 * repository — its own `throw` — while being the code phase 7 has to branch on.
 *
 * `tests/services/shiprocket-courier-writes.test.ts` holds a table with one
 * scenario per member and asserts the table covers this union exactly, so a
 * declared-but-unreachable code fails the suite rather than reading as
 * coverage.
 */
export const SHIPROCKET_REFUSAL_CODES = [
  /** Nobody has finished the setup. An operator's job, not an outage. */
  'SHIPROCKET_NOT_CONFIGURED',
  /** The setup is wrong: Shiprocket refused the credentials we hold. */
  'SHIPROCKET_AUTH_REJECTED',
  /**
   * The login itself did not answer — timed out, dropped, or replied with
   * something that is not a token.
   *
   * Distinct from `SHIPROCKET_AUTH_REJECTED`, which is Shiprocket saying no.
   * This is Shiprocket saying nothing, and it sits in front of EVERY other
   * call in this module, which is exactly why it has to be named: an untyped
   * throw from here carries no code, and a route mapping codes to statuses
   * answers the most-exercised path in the file with an improvised 500.
   */
  'SHIPROCKET_AUTH_UNREACHABLE',
  /**
   * The token we presented is dead, and we have dropped it.
   *
   * A third auth state because it has a third remedy: nothing is
   * misconfigured, nobody mistyped the password, and Shiprocket answered
   * perfectly well — a token was revoked or the password was rotated. Raising
   * it DISCARDS the cached token, so the next call logs in again. See
   * `forgetTokenAfter` for what this cost while it did not exist.
   */
  'SHIPROCKET_AUTH_EXPIRED',
  /** Shiprocket could not answer the (repeatable, free) serviceability read. */
  'SHIPROCKET_SERVICEABILITY_FAILED',
  /** Nobody will carry this parcel on this route today. Not an outage. */
  'SHIPROCKET_NOT_SERVICEABLE',
  /** The pickup nickname is unset, blank, or not one Shiprocket knows. */
  'SHIPROCKET_PICKUP_LOCATION_INVALID',
  /** A measurement a courier quotes and bills on is zero, negative or absent. */
  'SHIPROCKET_PARCEL_INVALID',
  /**
   * The address a courier has to knock on the door of is not one.
   *
   * Its own code rather than folding into `SHIPROCKET_PARCEL_INVALID`, because
   * the two have different owners: a parcel with no weight is a shipment an
   * operator fills in, a consignee with no pincode is an ORDER whose address
   * capture let something through, and a route that cannot tell them apart
   * sends the wrong person to fix it.
   */
  'SHIPROCKET_CONSIGNEE_INVALID',
  /** The charges do not add up to the amount the caller says is due. */
  'SHIPROCKET_ORDER_TOTAL_MISMATCH',
  /** Shiprocket decided against the create before making anything. */
  'SHIPROCKET_ORDER_CREATE_REJECTED',
  /**
   * The idempotency lookup the caller supplied did not answer.
   *
   * Ours, not Shiprocket's, and nothing was sent. Named anyway because it is
   * the first line of the only function here that spends money: an untyped
   * throw from it carries no `code`, and a route mapping this client's codes
   * to statuses would improvise one for the failure that guards the duplicate.
   */
  'SHIPROCKET_ORDER_LOOKUP_FAILED',
  /** We were asked to assign a waybill against no shipment id. Our bug. */
  'SHIPROCKET_SHIPMENT_ID_MISSING',
  /** Shiprocket answered the AWB request and minted nothing. */
  'SHIPROCKET_AWB_REFUSED',
  /** Shiprocket decided against rendering the label, and said so. */
  'SHIPROCKET_LABEL_REFUSED',
  /**
   * The label EXISTS at Shiprocket and its file could not be fetched.
   *
   * Its own code, and not a variant of the unknown outcome, because the two
   * send an operator to different places: the unknown outcome says "look
   * before you ask again", this one says "the label is there — get the file".
   * A caller that folded it into "no label" would buy a second one.
   */
  'SHIPROCKET_LABEL_FETCH_FAILED',
  /**
   * A courier was asked to collect and nothing was scheduled.
   *
   * The one refusal in this module that is safe to retry as it stands: a
   * pickup request mints nothing, and a repeated one is answered "already in
   * the queue" — which `schedulePickup` reads as success. It is NOT a reason
   * to void the label the pickup was for; see `ShiprocketPickupNotScheduledError`.
   */
  'SHIPROCKET_PICKUP_NOT_SCHEDULED',
  /**
   * Shiprocket answered the cancellation and declined it — the parcel has
   * been picked up, or the courier will not release it. The label stands.
   */
  'SHIPROCKET_CANCEL_REFUSED',
  /** The write may have happened. Reconcile before retrying — see the class. */
  'SHIPROCKET_WRITE_OUTCOME_UNKNOWN',
] as const;

export type ShiprocketRefusalCode = (typeof SHIPROCKET_REFUSAL_CODES)[number];

/**
 * What a route should answer each refusal with.
 *
 * A `Record` over the union, so a new code without a status is a TYPECHECK
 * failure rather than a route improvising a 500 — the same mechanism
 * `AUDIT_ACTION_CATEGORY` uses over `AuditAction`
 * (`packages/shared/src/schemas/audit-log.ts:193-263`).
 *
 * The split, stated once so every site does not have to re-argue it:
 *
 * - **409** — the world is in a state we will not guess about. The ONLY member
 *   here is the unknown outcome, and it is 409 rather than 500 because the
 *   caller must not treat it as "try again": a retry makes a second real order.
 * - **422** — the caller can fix this and ask again. Configuration, the pickup
 *   nickname, a parcel with no weight, arithmetic that does not reconcile, a
 *   create Shiprocket decided against, an AWB it declined to mint. All fixable,
 *   all safe to re-send.
 * - **502/503** — the carrier, not us. 503 for "nobody serves this route
 *   today", which is temporary and route-specific; 502 for Shiprocket failing
 *   to answer at all — the serviceability read, or the login in front of it.
 *   Both are "they did not answer", and the two share a status because they
 *   are one fact from an admin's chair.
 * - **503** — also carried by `SHIPROCKET_AUTH_EXPIRED`, and for 503's own
 *   meaning rather than by analogy: the token has already been discarded, so
 *   the next attempt logs in again and the condition clears itself. "Ask again
 *   in a moment" is the literal remedy, which is not true of any 422 here.
 * - **500** — our own bugs reaching the client, and the two members that are
 *   not an admin's to fix: a blank shipment id means the caller lost the id,
 *   and a lookup that threw is our database, not their courier.
 *
 * **Declared one phase ahead of the route that will read it — deliberately,
 * and not the case `tests/lib/audit-action-waivers.ts:34-46` forbids.** That
 * rule is about a vocabulary of NAMES written into rows: an audit action with
 * no emitter is a string nobody will ever see, and nothing in the tree can say
 * whether it works. This is a lookup table over a union whose every member is
 * shown to come out of a real call by
 * `tests/services/shiprocket-courier-writes.test.ts`, and whose values that
 * suite pins one by one — including the 409, which is the entry a reader would
 * "tidy" into a 500 and thereby teach a client to retry a write that may have
 * happened. Its absence would not be neutral: the phase-7 route would improvise
 * a status per catch site, which is the outcome this record exists to prevent.
 */
export const SHIPROCKET_REFUSAL_STATUS: Record<ShiprocketRefusalCode, number> = {
  SHIPROCKET_NOT_CONFIGURED: 422,
  SHIPROCKET_AUTH_REJECTED: 422,
  SHIPROCKET_AUTH_UNREACHABLE: 502,
  SHIPROCKET_AUTH_EXPIRED: 503,
  SHIPROCKET_SERVICEABILITY_FAILED: 502,
  SHIPROCKET_NOT_SERVICEABLE: 503,
  SHIPROCKET_PICKUP_LOCATION_INVALID: 422,
  SHIPROCKET_PARCEL_INVALID: 422,
  SHIPROCKET_CONSIGNEE_INVALID: 422,
  SHIPROCKET_ORDER_TOTAL_MISMATCH: 422,
  SHIPROCKET_ORDER_CREATE_REJECTED: 422,
  SHIPROCKET_ORDER_LOOKUP_FAILED: 500,
  SHIPROCKET_SHIPMENT_ID_MISSING: 500,
  SHIPROCKET_AWB_REFUSED: 422,
  SHIPROCKET_LABEL_REFUSED: 422,
  // 502, not 422: nothing about the shipment is wrong and nothing an admin
  // corrects will change the answer — a file host did not hand over a file.
  SHIPROCKET_LABEL_FETCH_FAILED: 502,
  // 503 for 503's own meaning, as with the expired token: the remedy is
  // literally "ask again in a moment", and asking again mints nothing.
  SHIPROCKET_PICKUP_NOT_SCHEDULED: 503,
  // 422: the courier said no about THIS parcel, and the admin decides what
  // next (wait for delivery, or take it up with the courier). Re-sending the
  // same request changes nothing, but nothing was minted and nothing is owed.
  SHIPROCKET_CANCEL_REFUSED: 422,
  SHIPROCKET_WRITE_OUTCOME_UNKNOWN: 409,
};

/**
 * Base class, so every failure this client produces shares one `catch`.
 *
 * `code` is the union rather than `string`. A class per refusal is the pattern
 * and not the rule: a code no caller needs to catch BY IDENTITY does not earn
 * one, and typing the field is what keeps such a code inside the vocabulary
 * anyway. Seven of the codes are thrown inline with no class of their own —
 * `SHIPROCKET_AUTH_UNREACHABLE`, `SHIPROCKET_SERVICEABILITY_FAILED`,
 * `SHIPROCKET_PARCEL_INVALID`, `SHIPROCKET_CONSIGNEE_INVALID`,
 * `SHIPROCKET_ORDER_LOOKUP_FAILED`, `SHIPROCKET_SHIPMENT_ID_MISSING` and
 * `SHIPROCKET_ORDER_CREATE_REJECTED`.
 *
 * **That sentence said "Two", and the number was six.** A small error that
 * matters out of proportion to its size: this file asks a reader at 2am to
 * trust a great deal of prose they cannot independently check, on the warrant
 * that the prose is corrected when it goes stale. So the count and the names
 * are no longer kept by hand —
 * `tests/services/shiprocket-courier-writes.test.ts` derives which codes have
 * a class from the module's own exports, subtracts them from the vocabulary,
 * and holds this comment to what is left.
 */
export class ShiprocketError extends Error {
  readonly code: ShiprocketRefusalCode;

  constructor(message: string, code: ShiprocketRefusalCode) {
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
 * Shiprocket stopped honouring the token we were holding.
 *
 * Its own class, and not a flavour of `ShiprocketAuthError`, because the two
 * send a reader to different places: that one says the credentials are wrong
 * and names the variables to check, this one says the credentials were fine
 * when we logged in and are not being accepted now. A caller may retry this
 * once — the cached token is discarded before it is thrown, so the retry logs
 * in again — and that is a thing no other refusal in this module permits on a
 * write, which is exactly why it needs to be catchable by identity.
 */
export class ShiprocketAuthExpiredError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_AUTH_EXPIRED');
    this.name = 'ShiprocketAuthExpiredError';
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
 * The write may have happened. We do not know, and we will not guess.
 *
 * Thrown when a courier write did not come back with an answer we can act on:
 * the connection dropped, the request timed out, Shiprocket answered 5xx, or it
 * answered 200 with a body we could not read an id out of. Every one of those
 * has the same shape — the order or the waybill may exist and we did not record
 * its id — and every one of them is the case where a caller that "just retries"
 * makes a second real thing at a courier.
 *
 * Distinct from `ShiprocketError` for exactly that reason. A caller may retry a
 * `ShiprocketError`; this one has to be reconciled first. The message names the
 * reference to search the dashboard for, because the alternative is scrolling
 * a list of orders looking for one that might be ours.
 */
export class ShiprocketWriteOutcomeUnknownError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN');
    this.name = 'ShiprocketWriteOutcomeUnknownError';
  }
}

/**
 * The pickup nickname is missing, blank, or not one Shiprocket knows.
 *
 * ONE code for both states, deliberately. "Nobody set it" and "it does not
 * match" look different from here and are the same job from the admin's chair:
 * open the vendor, read the nickname off Shiprocket's own dashboard, and paste
 * it into `vendors.shiprocket_pickup_location`. A second code would split a
 * refusal that has one remedy.
 *
 * It matters that this is legible at all. Shiprocket matches the nickname
 * EXACTLY and rejects a mismatch at dispatch — long after the admin who typed
 * it has gone — so a generic "create failed" here would strand a parcel behind
 * a message nobody can act on.
 */
export class ShiprocketPickupLocationError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_PICKUP_LOCATION_INVALID');
    this.name = 'ShiprocketPickupLocationError';
  }
}

/**
 * Shiprocket answered the AWB request, and the answer was no waybill.
 *
 * A definite refusal, unlike `ShiprocketWriteOutcomeUnknownError`: the shipment
 * still has no AWB, so it is safe to fix the cause and ask again. Sibling in
 * spirit to `ShiprocketNotServiceableError` — not an outage, and not to be
 * reported as one.
 */
export class ShiprocketAwbRefusedError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_AWB_REFUSED');
    this.name = 'ShiprocketAwbRefusedError';
  }
}

/**
 * The charges do not add up to what the caller says the customer owes.
 *
 * Its own class because it is the one refusal on this path that is about MONEY
 * rather than about a courier. On a COD parcel the terms of the payload sum to
 * the cash collected at somebody's door, so a mismatch is either an overcharge
 * or a shortfall — never a formatting complaint — and it is refused BEFORE the
 * network, where refusing still costs nothing.
 */
export class ShiprocketOrderTotalMismatchError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_ORDER_TOTAL_MISMATCH');
    this.name = 'ShiprocketOrderTotalMismatchError';
  }
}

/**
 * Thrown when Shiprocket decided against rendering the label and said so.
 *
 * The label twin of `ShiprocketAwbRefusedError`: a definite refusal, reached
 * only on a POSITIVE signal from Shiprocket, and the one label failure where
 * "correct the shipment and ask again" is safe advice. Every other way a label
 * request can go wrong leaves open that a label was generated and BILLED, and
 * comes out as the unknown outcome or as `ShiprocketLabelFetchFailedError`.
 */
export class ShiprocketLabelRefusedError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_LABEL_REFUSED');
    this.name = 'ShiprocketLabelRefusedError';
  }
}

/**
 * Thrown when the label EXISTS at Shiprocket and its file did not arrive.
 *
 * A class of its own because phase 7 has to catch it by identity: the
 * purchase happened and the download did not, so the right response is to get
 * the file — from the dashboard, or by asking again knowing it may be billed
 * twice — and the wrong response is to read this as "no label" and buy one.
 * The message says the label exists, every time, for the same reason.
 */
export class ShiprocketLabelFetchFailedError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_LABEL_FETCH_FAILED');
    this.name = 'ShiprocketLabelFetchFailedError';
  }
}

/**
 * Thrown when a courier was asked to collect and nothing was scheduled.
 *
 * `retryable` is a field rather than a sentence because a route branches on
 * it: this is the ONE refusal in the module that may be retried as it stands.
 * A pickup request mints nothing and bills nothing, and a repeated one is
 * answered "already in the pickup queue", which `schedulePickup` reads as
 * success — so the retry converges rather than duplicating.
 *
 * It is not a reason to void the label. A label with no pickup is a parcel
 * waiting for a courier; a voided label is a parcel with nothing to hand to
 * one, and a second label to buy. The ticket (#727) says this in as many
 * words, and the message carries it so an operator reading a screen does not
 * reach for the void button.
 */
export class ShiprocketPickupNotScheduledError extends ShiprocketError {
  readonly retryable = true as const;

  constructor(message: string) {
    super(message, 'SHIPROCKET_PICKUP_NOT_SCHEDULED');
    this.name = 'ShiprocketPickupNotScheduledError';
  }
}

/**
 * Thrown when Shiprocket answered the cancellation and declined it.
 *
 * A class of its own because the void route catches it by identity: the
 * label STANDS, the row must not be marked void, and the courier's reason is
 * what the admin acts on — which is why, alone in this module, the courier's
 * sentence travels in the message. The cancel payload is one AWB, so the
 * echo the module's log rule guards against (a customer's address quoted
 * back) cannot occur here; the sentence is still scrubbed and capped.
 */
export class ShiprocketCancelRefusedError extends ShiprocketError {
  constructor(message: string) {
    super(message, 'SHIPROCKET_CANCEL_REFUSED');
    this.name = 'ShiprocketCancelRefusedError';
  }
}

/**
 * A number Shiprocket actually sent, or null.
 *
 * `Number()` is the wrong tool on its own and the reason this exists: it maps
 * `null`, `''`, `[]` and `false` to **0**, and 0 is finite. A missing `rate`
 * therefore became a courier costing nothing, which then WON `selectCourier`'s
 * cheapest-option loop; a missing `courier_company_id` became "courier company
 * 0", offered to phase 7 as the id that took the parcel. Both are the same
 * mistake — a coercion answering a question about presence — so both go
 * through here.
 */
function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // A numeric string is a real answer; a blank one is an absent field wearing
  // its clothes, and `Number('')` cannot tell them apart.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
 * How long a REPEATABLE call may hang before we stop waiting for it.
 *
 * Every call in this file that mints nothing — the login, the serviceability
 * read — is bounded by this. It bounds how long an admin's browser is held
 * open, and it is shorter than `WRITE_TIMEOUT_MS` because there is nothing to
 * reconcile afterwards: a repeatable call that dies has changed nothing and
 * asking again is free.
 *
 * It lives up here, above the login, rather than beside the read it was
 * written for. The login is the call in front of EVERY other call in this
 * module, and while it had no bound at all, `WRITE_TIMEOUT_MS` — which
 * documents itself as a bound on the whole dispatch request — bounded only its
 * own second half. A hung auth endpoint held a dispatch open indefinitely.
 *
 * Exported for the same reason `WRITE_TIMEOUT_MS` is: a `fetch` stub can see
 * almost nothing about a request, so the suite asserts the constant is
 * ATTACHED, and without that assertion it could be deleted with every test
 * still green.
 */
export const READ_TIMEOUT_MS = 15 * 1000;

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

/**
 * The one status that is evidence about the TOKEN rather than about the parcel.
 *
 * Named once and read three times — the cache invalidation, the log label, and
 * the doc below that argues why 403 is not on this list. A second literal `401`
 * is how the log line and the branch it labels drift apart.
 */
const TOKEN_REJECTED_STATUS = 401;

/**
 * Is this status evidence about the TOKEN rather than about the parcel?
 *
 * Split out of `forgetTokenAfter` so a clause can ASK the question without
 * answering it: the write tables below decide which clause fires first, and a
 * predicate that dropped the cached token as a side effect of being evaluated
 * would make the order of the table a thing that mutates state. The two are
 * one decision read from one constant, not two literals.
 */
function tokenWasRejected(status: number): boolean {
  return status === TOKEN_REJECTED_STATUS;
}

/**
 * Drop the cached token when Shiprocket says it will not accept it.
 *
 * **The invalidation this module did not have.** `cached` was written in one
 * place — `login()` — and cleared in one other, a function whose own comment
 * says nothing in `src/` should call it, and no call site anywhere read a 401.
 * So a token revoked in the dashboard, or an API password rotated (the very
 * thing `ShiprocketAuthError` tells an admin to go and do), kept being
 * presented until its `exp`: up to nine days on the live account, with a
 * process restart as the only remedy — a sentence that appeared nowhere in a
 * file that names every other failure mode it has. Worse, the refusal
 * misdescribed itself: a 401 on a write fell through to the final 4xx branch
 * as `SHIPROCKET_ORDER_CREATE_REJECTED`, whose advice is "correct it and
 * re-send", which nothing the operator corrects can act on.
 *
 * **401 only, and deliberately never 403.** The live account answers 403 for
 * WRONG credentials at the login, so a 403 on an authenticated endpoint is not
 * evidence about the token — it is the account being told it may not do this,
 * which no fresh token fixes. Dropping the cache on any refusal would also
 * answer a rate-limited login endpoint with a request storm.
 *
 * `inFlight` is deliberately left alone: a login racing this one is not the
 * token being refused, and clearing it would strand its awaiters.
 */
function forgetTokenAfter(status: number): boolean {
  if (!tokenWasRejected(status)) return false;
  cached = null;
  return true;
}

/**
 * The refusal a dead token earns, and the one refusal here a caller may retry.
 *
 * "Nothing was created" is an argument, not a measurement — a request refused
 * at the authentication layer never reaches the service that could create
 * anything — and it is safe to state because if it were wrong, the idempotency
 * lookup every create goes through first is what catches the retry.
 *
 * Nothing retries in here: on a write, a retry loop inside this module is
 * indistinguishable from a second real order.
 */
function tokenWentStale(what: string): ShiprocketAuthExpiredError {
  return new ShiprocketAuthExpiredError(
    `Shiprocket refused the API token while ${what} (HTTP 401). The token has been discarded, ` +
      'so the next attempt logs in again and this usually clears itself. Nothing was created or ' +
      'assigned at the courier: a request refused at the authentication layer never reaches the ' +
      'service that could do either. If it happens again, the API password has been rotated — ' +
      'update SHIPROCKET_PASSWORD in the API environment.'
  );
}

/**
 * Shiprocket did not answer the login, so nothing else can be attempted.
 *
 * Its own sentence rather than a rethrow, because the alternative is what this
 * function used to do: let a `DOMException` (the bound firing), a `TypeError`
 * (the socket dropping) or a `SyntaxError` (a body that is not JSON) escape
 * untouched. None of those is a `ShiprocketError`, none carries a `code`, and
 * `SHIPROCKET_REFUSAL_STATUS` exists precisely so a route never has to
 * improvise a status. The driver's own words go to the logger and nowhere
 * else — they name our base URL, and a login body names our credentials.
 */
function loginDidNotAnswer(error: unknown, what: string): ShiprocketError {
  logger.error({ err: error }, `shiprocket: login ${what}`);
  return new ShiprocketError(
    `Shiprocket did not answer the login (${what}), so nothing could be sent to the courier. ` +
      'Nothing was created. This is a carrier outage or a network fault, not a configuration ' +
      'error — check Shiprocket status and try again.',
    'SHIPROCKET_AUTH_UNREACHABLE'
  );
}

async function login(): Promise<string> {
  const config = getShiprocketConfig();

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
      // The bound that makes `WRITE_TIMEOUT_MS` mean what it says. Without it
      // the login in front of a dispatch was unbounded, so the ceiling on a
      // dispatch request was not 30 seconds but "until something else gives
      // up". The ceiling is READ_TIMEOUT_MS + WRITE_TIMEOUT_MS, and it is a
      // sum rather than one number because the token is deliberately resolved
      // OUTSIDE the write's guard — see `postCourierWrite`.
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (error) {
    throw loginDidNotAnswer(error, 'did not answer');
  }

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

  // Read inside a guard too: a 200 carrying an edge proxy's HTML page throws a
  // `SyntaxError` here, which is the same fact as the request never answering
  // — we have no token — and must not be a different type to a caller.
  let body: { token?: unknown };
  try {
    body = (await response.json()) as { token?: unknown };
  } catch (error) {
    throw loginDidNotAnswer(error, 'answered with something that is not a token');
  }

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
  // `finiteNumber`, not `Number`. A courier whose `rate` is null used to become
  // a courier costing 0 paise, which then won `selectCourier`'s cheapest-option
  // loop and was quoted to an admin as free.
  const id = finiteNumber(raw.courier_company_id);
  const name = raw.courier_name;
  const rate = finiteNumber(raw.rate);

  if (id === null || typeof name !== 'string' || rate === null) return null;

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

  // The fetch and the body read share ONE guard, for the same reason
  // `postCourierWrite` reads its body inside the try: `AbortSignal.timeout`
  // aborts the body stream too, so a read whose headers land at 14s and whose
  // body is still arriving at 15s rejects here rather than in `fetch`. Both
  // are the same fact — Shiprocket did not answer — and an unwrapped
  // `DOMException` from either is not a `ShiprocketError`, carries no `code`,
  // and lands a route on a 500 while the 502 this condition is declared to
  // answer with sits unused. `selectCourierFor` is directly in front of the
  // courier write on the dispatch path, so this is the read that fails first.
  let body: { data?: { available_courier_companies?: unknown } };
  try {
    const response = await fetch(`${config.baseUrl}/courier/serviceability/?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Before the generic refusal, and on the READ as well as on the two
      // writes, because a dead token is one fact about the module rather than
      // one fact about an endpoint. This read sits directly in front of the
      // courier write on the dispatch path, so it is usually the call that
      // meets a revoked token first — and answering it "Shiprocket could not
      // answer serviceability" would describe a carrier outage that is not
      // happening and hide a condition that clears itself.
      if (forgetTokenAfter(response.status)) throw tokenWentStale('checking serviceability');

      throw new ShiprocketError(
        `Shiprocket could not answer serviceability for ${query.pickupPincode} to ` +
          `${query.deliveryPincode} (HTTP ${response.status}).`,
        'SHIPROCKET_SERVICEABILITY_FAILED'
      );
    }

    body = (await response.json()) as { data?: { available_courier_companies?: unknown } };
  } catch (error) {
    // The refusal we just built above is already the right answer; rethrowing
    // it through the wrapper would relabel a legible HTTP status as a network
    // fault. Anything else is genuinely a call that did not complete.
    if (error instanceof ShiprocketError) throw error;

    logger.error({ err: error }, 'shiprocket: serviceability did not answer');
    throw new ShiprocketError(
      `Shiprocket did not answer serviceability for ${query.pickupPincode} to ` +
        `${query.deliveryPincode}. Nothing was bought and nothing was changed, so this is safe ` +
        'to ask again once Shiprocket is answering.',
      'SHIPROCKET_SERVICEABILITY_FAILED'
    );
  }

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

// ============================================================================
// The two calls that write to a real courier (#726)
// ============================================================================

/**
 * How long a courier write may hang before we stop waiting for it.
 *
 * Not a guess about Shiprocket's latency — a bound on the courier write.
 * Thirty seconds is long enough that an ordinary slow create still succeeds,
 * and short enough that a hung socket becomes a legible
 * `ShiprocketWriteOutcomeUnknownError` rather than a request the platform edge
 * kills with a 502 that says nothing about which write was in flight when it
 * died.
 *
 * **It bounds the write, not the request.** This constant used to claim to
 * bound "how long a dispatch request may hold an admin's browser open", and it
 * did not: `postCourierWrite` resolves the token before the guarded call, and
 * `login` carried no signal at all, so a hung auth endpoint held a dispatch
 * open with this number nowhere in it. The ceiling on a dispatch request is
 * `READ_TIMEOUT_MS + WRITE_TIMEOUT_MS`, and it is a sum rather than one number
 * because the token is deliberately resolved outside the write's guard — an
 * auth failure must not be reported as a write whose outcome is unknown.
 *
 * Exported so the suite can assert it is ATTACHED. A `fetch` stub can see
 * almost nothing about a request, and without that assertion this constant
 * could be deleted and every test in the file would stay green.
 */
export const WRITE_TIMEOUT_MS = 30 * 1000;

/**
 * The width of the three columns these ids have to fit in.
 *
 * `external_order_id`, `external_shipment_id` and `awb_number` are all
 * `varchar(64)` (`database/schema/shipping.ts`). An id longer than that is not
 * a validation nicety: the INSERT throws one layer later, in a transaction that
 * has already spent a real courier write, and the driver error names a column
 * rather than the order we have just lost the handle on.
 *
 * Listed here rather than imported, because importing the schema would give
 * this file the database import it is scanned for. The coupling is enforced
 * instead by `tests/services/shiprocket-courier-writes.test.ts`, which reads
 * the declared length out of the schema source and compares it to this number.
 */
export const EXTERNAL_ID_MAX_LENGTH = 64;

/**
 * Every key that leaves this process on the way to a courier.
 *
 * An allow-list, not "the input minus a few fields". The payload is built key
 * by key against this tuple — `AdhocPayload` is a `Record` over it, so a stray
 * property is a typecheck failure and a missing one is too — because the thing
 * being sent is a customer's name, address, phone and email to a third party,
 * and "we forgot to strip it" is not a sentence anyone gets to say about that.
 *
 * Deliberately absent, and each for its own reason: our shipment row id (an
 * internal handle; only the eight characters that make the reference unique
 * travel, inside `order_id`), the internal cost in paise (what we pay a carrier
 * is not the carrier's business), the label object token (a capability), the
 * vendor id (another party's identity), and the customer's user id (a
 * person-linked handle a courier has no use for).
 *
 * **The four charge keys are here because money decides.** `sub_total` alone is
 * the goods; on a COD parcel the courier collects `sub_total + shipping_charges
 * + transaction_charges + giftwrap_charges - total_discount`. An allow-list
 * that carried only the first term instructed a courier to collect the line sum
 * from a customer who owed less — 251 rupees over, on the fixture order, at
 * somebody's door. `order-level tax` has NO Shiprocket field and so has no key
 * here; it rides inside `sub_total`, which `toAdhocPayload` says at the site.
 */
export const COURIER_ADHOC_PAYLOAD_KEYS = [
  'order_id',
  'order_date',
  'pickup_location',
  'billing_customer_name',
  'billing_last_name',
  'billing_address',
  'billing_address_2',
  'billing_city',
  'billing_pincode',
  'billing_state',
  'billing_country',
  'billing_email',
  'billing_phone',
  'shipping_is_billing',
  'order_items',
  'payment_method',
  'sub_total',
  'shipping_charges',
  'total_discount',
  'transaction_charges',
  'giftwrap_charges',
  'length',
  'breadth',
  'height',
  'weight',
] as const;

type AdhocPayloadKey = (typeof COURIER_ADHOC_PAYLOAD_KEYS)[number];

/** The payload as a shape the compiler can hold to the tuple above. */
type AdhocPayload = Record<AdhocPayloadKey, unknown>;

/** Who the courier knocks on the door of. The only PII this module handles. */
export interface CourierConsignee {
  /** One field, never split. See `toAdhocPayload`. */
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
}

/** One line of the manifest, priced in the unit we actually store. */
export interface CourierOrderItem {
  name: string;
  sku: string;
  units: number;
  /** Integer paise. Converted to rupees once, at the boundary. */
  sellingPricePaise: number;
}

/** What actually goes out, which is not what the cart estimated. */
export interface CourierParcel {
  /** Integer grams, matching `order_shipments.shipped_weight_grams`. */
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * Every term of the order's money, in paise, stated by the caller.
 *
 * Not derived here, and not optional. `orders` keeps these in six columns and
 * documents its own identity (`schema/orders.ts:229-247`); this client's job is
 * to carry the terms to the courier and to CHECK they reconcile, not to guess
 * which of `discount`, `couponDiscount`, `promotionDiscount` and `tradeDiscount`
 * were meant. A client that guessed would be a second source of truth for what
 * a customer owes, and on a COD parcel that is cash at a door.
 *
 * Integer paise throughout, matching every money column in the schema. Rupees
 * appear exactly once, at the boundary, in `toAdhocPayload`.
 */
export interface CourierOrderCharges {
  /** `orders.shipping_cost`. What the customer was charged to ship it. */
  shippingPaise: number;
  /** Every discount bucket, already summed by the caller. */
  discountPaise: number;
  /**
   * `orders.tax`.
   *
   * Declared even though the adhoc payload has no field for it, because it is
   * a term of the total and dropping a term is how a collectible goes wrong
   * quietly. It is folded into `sub_total` — see `toAdhocPayload`.
   */
  taxPaise: number;
  /** A gateway or COD handling fee charged onward to the customer. */
  transactionPaise: number;
  /** Gift wrap. Zero today; a term of Shiprocket's sum, so it is named. */
  giftwrapPaise: number;
  /**
   * What the customer still owes for this parcel: `total - giftCardAmount`.
   *
   * On a COD order this is literally the cash the courier collects. On a
   * prepaid one it is what was already charged, and it is still checked: the
   * same numbers print on the manifest a courier hands over and on any RTO or
   * insurance claim that follows, so a manifest that overstates the parcel is
   * wrong even when no money moves at the door.
   */
  amountDuePaise: number;
}

export interface CreateCourierOrderInput {
  /**
   * Our `order_shipments.id`.
   *
   * The idempotency key the lookup is asked about, and half of the reference
   * the courier is given. Never sent whole — see `courierOrderReference`.
   */
  shipmentRowId: string;
  /** `orders.order_number`. What a human searches the dashboard by. */
  orderNumber: string;
  orderDate: Date;
  /**
   * The nickname from `vendors.shiprocket_pickup_location` (#721), or null when
   * nobody has set one. Null is an ordinary state for most vendors, and it has
   * to stop this call rather than be papered over with a default: a default
   * would collect the parcel from the wrong facility.
   */
  pickupLocation: string | null;
  cod: boolean;
  consignee: CourierConsignee;
  items: readonly CourierOrderItem[];
  parcel: CourierParcel;
  charges: CourierOrderCharges;
}

/** What the caller already has recorded against this shipment, if anything. */
export interface ExistingCourierOrder {
  externalOrderId: string | null;
  externalShipmentId: string | null;
}

/**
 * How this client finds out whether the order it is about to place exists.
 *
 * A function the CALLER supplies, and a REQUIRED argument rather than an
 * optional one with a null-returning default. An optional lookup makes the safe
 * behaviour the thing you have to remember; here, every caller of the only
 * function in this module that spends money has to say, in the call, where it
 * looks for the order it may already have made.
 *
 * ## The constraint the type states, because a lookup alone is not a defence
 *
 * **This read must be SERIALISED against the write of the ids it reads.** A
 * lookup taken outside a lock is a check that two callers can both pass: an
 * admin double-click, or a UI retry issued while the first request is still in
 * flight, gives two calls that both find nothing recorded, both clear the
 * local refusals and both POST the identical deterministic reference — two
 * real courier orders for one parcel, with whichever finishes second
 * overwriting the other's ids. So an implementation takes the shipment row
 * `FOR UPDATE` (or holds an equivalent lock, or leans on a unique constraint
 * over `external_order_id`) and keeps it until `external_order_id` and
 * `external_shipment_id` have been written. That is the same shape of
 * obligation `AuditWriter` states about sharing a transaction
 * (`lib/audit.ts:240-262`) and `ProductionReader` states about being one
 * method (`lib/production-readiness.ts:118-124`): a contract the type carries,
 * because the caller is the only one who can honour it.
 *
 * **`createCourierOrder` closes the OVERLAP, and nothing wider — read the next
 * sentence before you rely on it.** Concurrent calls for one `shipmentRowId`
 * share a single write, and the entry is released in a `finally` the moment
 * the leader settles, which is BEFORE the caller has written
 * `external_order_id`. The window this type is about — between the lookup
 * answering `null` and those ids reaching the row — is therefore still open
 * inside one process: two calls a millisecond apart both create. That
 * paragraph used to say the window was closed here and the residual risk was a
 * second API instance, and a phase-7 author would have leaned on it. The lock
 * is the caller's, in one process and in twenty.
 *
 * The map is deliberately not widened to cover it. Holding an entry until the
 * caller confirms the write would make this a cache of a courier write keyed
 * on a promise nobody can invalidate — a way to report an order that was never
 * made — and it would still not serialise a second instance.
 *
 * The drizzle-backed implementation belongs to `lib/shipment-*` (the phase that
 * owns persistence), not here — see the module header on why this file has no
 * database import.
 */
export type CourierOrderLookup = (
  shipmentRowId: string
) => Promise<ExistingCourierOrder | null>;

export interface CourierOrderRef {
  /** Shiprocket's `order_id`, for `order_shipments.external_order_id`. */
  externalOrderId: string;
  /** Shiprocket's `shipment_id`, for `order_shipments.external_shipment_id`. */
  externalShipmentId: string;
  /**
   * False when these ids came from the record rather than from a new order.
   *
   * The caller needs the difference: `created: true` is the moment a real thing
   * appeared at a courier and the moment an audit row is owed. `created: false`
   * is a retry that cost nothing and must not be narrated as a dispatch.
   */
  created: boolean;
}

export interface AssignAwbRequest {
  /**
   * SHIPROCKET's shipment id — `external_shipment_id`, the one `createCourierOrder`
   * returned. Not our `order_shipments.id`. Named `shipmentId` because that is
   * what Shiprocket's own field is called, and getting the two confused assigns
   * a waybill against a shipment belonging to nobody.
   */
  shipmentId: string;
  /** The courier `selectCourier` chose. Omitted when we have no preference. */
  courierCompanyId?: number;
}

/**
 * What came back from a waybill request.
 *
 * **Deliberately absent: a tracking URL and a label URL.** Medusa's equivalent
 * of this step returns `labels: [{ tracking_number, tracking_url, label_url }]`
 * in one object, and `order_shipments.tracking_url` is the first thing
 * `getShippedTemplate` reaches for (`services/email-templates.ts:329-336`), so
 * the absence is worth naming rather than leaving to be discovered. Neither is
 * here because neither comes out of `courier/assign/awb`: the label is a
 * separate call (`generateLabel`, #727) that renders a PDF and hands back the
 * BYTES — a label URL is a customer's address behind a link, and it never
 * leaves that function — and the tracking URL is per-courier. Phase 7 gets the
 * AWB and the courier — enough to build a tracking link once a courier-to-URL
 * mapping exists — and this type widens if that mapping ever lands here,
 * rather than carrying an empty string that reads like an answer.
 */
export interface AwbAssignment {
  awbNumber: string;
  /** The courier that ACTUALLY took it. This is the one to store. */
  courierName: string;
  courierCompanyId: number | null;
  /**
   * What we asked for, and the only reason it is here.
   *
   * Shiprocket routinely assigns a courier other than the requested one, so
   * this exists so a caller can NOTICE the swap and log it. It is named to be
   * unmistakable: a caller reaching for `courierName` cannot reach this by
   * accident, which is the whole point of not returning a bare `courierId`.
   */
  requestedCourierCompanyId: number | null;
}

/**
 * The reference the courier sees, derived from two ids we already have.
 *
 * Three properties, and each one is load-bearing:
 *
 * - **Deterministic.** A retry presents the SAME reference. If a timed-out
 *   create did reach Shiprocket, the duplicate a blind retry makes sits next to
 *   the original under one searchable name instead of being two unrelated rows.
 * - **Prefixed with the order number.** Support searches by the thing the
 *   customer quotes. A bare uuid would be findable only by someone who already
 *   had our database open.
 * - **Suffixed per shipment row, not per order.** A voided label is re-bought
 *   as a NEW shipment row on the same order (`order_shipments_live_label_idx`
 *   exists to allow exactly that), so an order-number-only reference would make
 *   the replacement collide with the parcel it replaces.
 *
 * Eight hex characters of a random uuid, which is four billion values inside
 * one order number — not a global identifier, and not trying to be.
 *
 * **The uuid's dashes are stripped; the order number's are not.** This used to
 * claim the result "has one delimiter and reads as one token", and it does not:
 * `lib/order-number.ts` issues `CA-YYYY-NNNNNN`, so a real reference is
 * `CA-2026-000412-b3d9f1a4` — three delimiters, of which one is ours. That is
 * the right shape and the sentence was the wrong description of it: the order
 * number travels VERBATIM because it is the string a customer quotes and a
 * support agent pastes into the dashboard search, and re-punctuating it would
 * defeat the reason it is in the reference at all. Only the suffix is folded,
 * so the part we add reads as one token rather than four.
 */
export function courierOrderReference(orderNumber: string, shipmentRowId: string): string {
  return `${orderNumber}-${shipmentRowId.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * The nickname, trimmed, or a refusal that names the field to fix.
 *
 * Trimmed but NOT case-folded, and the asymmetry is deliberate. A trailing
 * space on a pasted nickname is invisible in the admin form and fatal at
 * Shiprocket's exact match, so removing it recovers a value the admin plainly
 * meant. Case is different: it is Shiprocket's to decide, ours is lowercase
 * `warehouse` today, and a client that folded case would break the first
 * account whose nickname is not.
 */
function requirePickupLocation(raw: string | null | undefined): string {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  if (nickname !== '') return nickname;

  throw new ShiprocketPickupLocationError(
    'This vendor has no Shiprocket pickup location, so the courier has nowhere to collect from. ' +
      'Open the vendor and set `shiprocket_pickup_location` to the nickname of their pickup ' +
      'address as it is registered in the Shiprocket dashboard — Shiprocket matches it exactly.'
  );
}

/**
 * Shiprocket's `order_date`, in UTC and unshifted.
 *
 * Their format is `YYYY-MM-DD HH:mm`, which carries no offset, so somebody has
 * to decide what the clock means. We send UTC and say so here rather than
 * shifting to IST: an offset we have not verified, applied to a date a courier
 * prints on a manifest, is a bug that only surfaces on paper.
 */
function formatOrderDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * A JSON scalar as the trimmed text we would store, or `''` for anything else.
 *
 * `''` covers absent, null, a non-finite number and a blank string alike,
 * because from a storage point of view they are one fact: there is nothing
 * here to write down. What they are NOT is interchangeable with a value we
 * could not fit — see `idProblem`, which is where that distinction is kept.
 * This comment used to point at `externalId`, which returns null for both.
 */
function asText(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Why an id cannot be stored, or null when it can.
 *
 * Two states rather than one boolean, because they have different remedies and
 * the log line is the only place anyone will ever see which one happened:
 * `absent` means their body is not the shape we think it is, `too long` means
 * the id is sitting in the dashboard waiting to be copied across. The accepted
 * create whose ids we cannot store reported a boolean per id and made those
 * two indistinguishable, under an `asText` comment claiming they were not.
 */
function idProblem(value: unknown): 'absent' | 'too long' | null {
  const text = asText(value);
  if (text === '') return 'absent';
  return text.length > EXTERNAL_ID_MAX_LENGTH ? 'too long' : null;
}

/**
 * An id from Shiprocket as a string we can store, or null.
 *
 * Both ids arrive as JSON numbers and both columns are `varchar`. Converting
 * here rather than letting the driver coerce means the length check sees the
 * same characters the database will. Defined in terms of `idProblem` so the
 * value we store and the reason we could not cannot disagree.
 */
function externalId(value: unknown): string | null {
  return idProblem(value) === null ? asText(value) : null;
}

/** The body once, as text and as JSON if it parses. Never read twice. */
async function readBody(response: Response): Promise<{ raw: string; json: unknown }> {
  const raw = await response.text();
  try {
    return { raw, json: JSON.parse(raw) as unknown };
  } catch {
    return { raw, json: null };
  }
}

/**
 * The envelopes `courier/assign/awb` has been seen to answer in.
 *
 * The endpoint wraps its result in `response.data`, and also answers it
 * unwrapped at the root. Both are read, and BOTH halves of the answer — the
 * waybill and the refusal reason — come out of this one list, because the
 * alternative is what this module shipped: a refusal read that knew about the
 * unwrapped shape and a success read that did not, so an HTTP 200 naming a
 * real waybill at the root was classified as "no waybill exists, so it is safe
 * to ask again". That sentence is an instruction to mint a second waybill
 * against a shipment that already has one.
 *
 * A closed list rather than a walk over the whole body, for the same reason
 * the payload is an allow-list: their bodies quote ours back, and "search
 * anywhere for something that looks like an answer" is how the customer's
 * address becomes the diagnostic.
 */
const AWB_ENVELOPE_PATHS: ReadonlyArray<readonly string[]> = [
  /** The documented shape. */
  ['response', 'data'],
  /** The root, when the endpoint answers unwrapped. */
  [],
];

/**
 * Where a refusal's reason lives, per endpoint, as a closed list of paths.
 *
 * The LOGGING half. It used to read the root `message` and nothing else, which
 * is right for a 4xx body and wrong for the endpoint that matters most:
 * `courier/assign/awb` answers **HTTP 200** with the reason at
 * `response.data.awb_assign_error`. So a refusal whose own message said "the
 * reason is in the API logs" sent the dispatcher to a log line containing an
 * empty string and a byte count, and the parcel sat there with no diagnosable
 * cause.
 *
 * The DECIDING read of the same key is `envelopeSaysNoWaybill`, which is
 * envelope-local rather than a path scan — a predicate that answers "somewhere
 * in this body something says no" cannot name which envelope said it, and the
 * envelope is what carries the shipment id the answer has to be checked
 * against.
 *
 * DERIVED from `AWB_ENVELOPE_PATHS`, not listed beside it. An envelope added
 * there is an envelope whose refusal reason is found here, in the same edit,
 * with nobody having to remember the second list.
 */
const AWB_ASSIGN_ERROR_PATHS: ReadonlyArray<readonly string[]> = AWB_ENVELOPE_PATHS.map(
  (envelope) => [...envelope, 'awb_assign_error']
);

/**
 * Everywhere a refusal's own sentence can live, for LOGGING.
 *
 * Kept separate from `AWB_ASSIGN_ERROR_PATHS`, which is narrower and is used
 * to DECIDE. The root `message` is right to log on any endpoint, and wrong to
 * read as "Shiprocket declined to assign a waybill": an edge proxy answering
 * `200 {"message":"OK"}` would turn an unreadable answer into a confident
 * refusal, which is the exact class of mistake this file exists to avoid.
 */
const REFUSAL_MESSAGE_PATHS: ReadonlyArray<readonly string[]> = [
  ['message'],
  ...AWB_ASSIGN_ERROR_PATHS,
];

/** One step at a time down a path, treating anything unexpected as absent. */
function resolvePath(json: unknown, path: readonly string[]): unknown {
  let node: unknown = json;
  for (const key of path) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined;
  }
  return node;
}

/**
 * Every distinct non-blank string at these paths, in path order.
 *
 * **It used to return the FIRST one**, and `REFUSAL_MESSAGE_PATHS` puts the
 * root `message` ahead of `awb_assign_error`. So a body carrying both logged
 * "Something went wrong" and dropped the only diagnostic in it — under a
 * refusal whose own remedy is *the reason is in the API logs*, which is the
 * exact failure the `awb_assign_error` path was added to close. First-wins is
 * an ordering decision and no ordering of these paths is the right one: the
 * envelope sentence says what KIND of refusal it is, the assign error says
 * why, and an operator needs both.
 *
 * Distinct, because the wrapped and the unwrapped envelope can carry one
 * sentence twice and a repeated sentence is not a second fact.
 */
function messagesAt(json: unknown, paths: ReadonlyArray<readonly string[]>): string[] {
  const found: string[] = [];
  for (const path of paths) {
    const node = resolvePath(json, path);
    if (typeof node === 'string' && node.trim() !== '' && !found.includes(node)) found.push(node);
  }
  return found;
}

/**
 * Their sentences at the envelope level, if their body carried any.
 *
 * Half of `refusalReason`, which is what every call site uses. Never read
 * alone to DECIDE anything — `envelopeSaysNoWaybill` has the narrower list for
 * that, and the reason is on `REFUSAL_MESSAGE_PATHS`.
 */
function refusalMessages(json: unknown): string[] {
  return messagesAt(json, REFUSAL_MESSAGE_PATHS);
}

/**
 * Where a refusal names the FIELD it is about, per envelope.
 *
 * Shiprocket runs Laravel, and a Laravel 422 answers with a generic sentence
 * at `message` and the actual complaint in `errors` — a bag of field names to
 * arrays of sentences. Reading the root `message` alone logged "The given data
 * was invalid.", four words that name nothing, under a refusal whose own text
 * says *the reason is in the API logs*. And it hid the one 4xx on this path
 * that must not be answered with "correct it and re-send": "The order id has
 * already been taken." lives in that bag, so `saysAlreadyExists` never saw it
 * and the advice that came back was an instruction to make a second real
 * order.
 *
 * DERIVED from `AWB_ENVELOPE_PATHS`, exactly as `AWB_ASSIGN_ERROR_PATHS` is,
 * so an envelope added there is an envelope whose field bag is read here in
 * the same edit.
 */
const VALIDATION_BAG_PATHS: ReadonlyArray<readonly string[]> = AWB_ENVELOPE_PATHS.map(
  (envelope) => [...envelope, 'errors']
);

/**
 * Every sentence in a validation bag, in order, and ALL of them.
 *
 * **The cap that used to be here decided money.** It stopped after five
 * entries, and the string it produced is the string `saysAlreadyExists`
 * classifies on — so "The order id has already been taken." was dropped
 * whenever Shiprocket put it sixth in the bag, and a create that HAD made a
 * real order came back as "correcting it and re-sending is the next step".
 * Moving that one key to the front of the identical body flipped the answer.
 * Which entry a third party puts first is not a thing the duplicate defence
 * gets to depend on, and a bound written to keep a log line tidy is not a
 * thing that gets to decide it.
 *
 * The bound that IS needed lives where the tidiness problem actually is —
 * `LOG_MESSAGE_MAX_CHARS`, applied in `logCourierAnswer`, which names in the
 * line how much it did not show. Nothing here is unbounded work that was not
 * already done: the whole body is in memory before this is called.
 *
 * Values only — the KEYS are deliberately not collected. A key is one of our
 * own payload field names, and the scrub placeholders already put those in
 * every line; collecting them would double the line to say nothing new.
 */
function validationMessages(json: unknown): string[] {
  const found: string[] = [];

  for (const path of VALIDATION_BAG_PATHS) {
    const bag = resolvePath(json, path);
    if (typeof bag !== 'object' || bag === null) continue;

    for (const value of Object.values(bag as Record<string, unknown>)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        if (typeof entry === 'string' && entry.trim() !== '') found.push(entry);
      }
    }
  }

  return found;
}

/**
 * Everything their body says about why, as one string.
 *
 * Both halves, because they are two halves of one sentence: the envelope says
 * what KIND of refusal it is, the bag says which field. Joined rather than
 * chosen, so what the classifier reads is everything they sent —
 * `saysAlreadyExists` and the pickup-location test below both run over this,
 * and both are decisions about whether something real exists at a courier.
 *
 * **The log may show less than this. The classifier never does.** An earlier
 * version had that the other way round and capped the string ITSELF so the log
 * would stay short, which is how a sentence sitting sixth in a validation bag
 * stopped being read at all. The log line truncates its own copy and names the
 * number of characters it dropped, so a reader can still tell the
 * classification was made on more than the line in front of them.
 */
function refusalReason(json: unknown): string {
  return [...refusalMessages(json), ...validationMessages(json)]
    .filter((part) => part !== '')
    .join(' ');
}

/**
 * How much of their answer one log line carries.
 *
 * The cap this file needs, in the only place a cap is harmless: a validation
 * bag with one entry per order item would otherwise become the log entry. It
 * used to live on `validationMessages` instead, where it silently truncated
 * the string the duplicate classifier reads — see that function. Three hundred
 * characters is several sentences, which is more than any refusal Shiprocket
 * has been seen to send; a line that hits it says so in
 * `shiprocketMessageDropped` rather than ending in silence.
 */
const LOG_MESSAGE_MAX_CHARS = 300;

/**
 * Their words go to the logger, scrubbed. Ours go to the caller.
 *
 * Shiprocket's bodies quote the payload back, and the payload is a customer's
 * name, address, phone and email — so the raw body is a PII carrier and is
 * never thrown, never returned, and never logged whole. It used to be logged
 * as their `message` field alone, on the argument that "the logger is an
 * internal sink with a redaction list". That argument was wrong:
 * `lib/logger.paths.ts` is a list of literal pino key PATHS — cookie,
 * authorization, password, token, secret, otp, signature, cardNumber, cvv —
 * and pino matches paths, never substrings inside a value. `shiprocketMessage`
 * is on no list, so the customer's street address went to the aggregator,
 * permanently, under a comment saying it could not.
 *
 * **Every answer a courier write can produce goes through here, not just the
 * refusals — which is what the name says and what the previous name did not.**
 * The accepted create whose ids we could not store logged two booleans and
 * nothing of the answer itself, on the money path's worst outcome, where the
 * two possibilities — a proxy interposed and nothing exists, or the order
 * exists and we lost its handle — need different work from an operator. The
 * AWB side had logged both since it was written, and this file's design
 * statement claims one rule for the two writes, not two.
 *
 * The cap stays: it stops a body that happens to be one enormous `message`
 * from turning a log line into the body.
 */
function logCourierAnswer(
  what: string,
  context: Record<string, unknown>,
  answer: { raw: string; json: unknown },
  echoes: readonly EchoedField[]
): void {
  const said = scrubEchoedValues(refusalReason(answer.json), echoes);

  logger.error(
    {
      ...context,
      // Length of the body, not the body: enough to tell "they said nothing"
      // from "they said a great deal" without carrying either.
      bodyLength: answer.raw.length,
      shiprocketMessage: said.text.slice(0, LOG_MESSAGE_MAX_CHARS),
      // How many characters of their answer this line does not show. Named
      // rather than left silent because the classifier read the WHOLE string:
      // a reader who cannot tell a truncated line from a complete one cannot
      // tell whether the decision above it was made on more than they can see.
      shiprocketMessageDropped: Math.max(0, said.text.length - LOG_MESSAGE_MAX_CHARS),
      // Empty on every ordinary refusal. When it is not, `shiprocketMessage`
      // carries NONE of their sentence — a value we sent survived all four
      // scrub passes, so the whole answer was withheld rather than logged with
      // a customer inside it. Field names, never values.
      shiprocketMessageWithheld: said.withheld,
    },
    `shiprocket: ${what}`
  );
}

/**
 * What to call a refused courier write in the log.
 *
 * Derived from the status the branch below acts on, rather than written out
 * beside it, so the line and the classification cannot disagree. They did: the
 * log fired ahead of the 401 branch on both writes, so a dead token — the one
 * condition here that is about a credential rather than about a parcel, and
 * the one that clears itself — was filed as a courier refusing the write.
 */
function refusedWriteLabel(status: number): string {
  return status === TOKEN_REJECTED_STATUS
    ? 'courier write refused the API token'
    : 'courier write refused';
}

/** The sentence every unknown-outcome refusal ends with. */
function reconcileAdvice(reference: string): string {
  return (
    `The order may already exist at Shiprocket under reference ${reference}. ` +
    'Search the Shiprocket dashboard for it and record BOTH its order id and its shipment id ' +
    'against this shipment before trying again — retrying blind creates a second real order, ' +
    'and recording only one of the two ids will refuse the next attempt.'
  );
}

/** What a courier write answered with, once the body has been read. */
interface CourierWriteOutcome {
  ok: boolean;
  status: number;
  raw: string;
  json: unknown;
}

// ============================================================================
// The ORDER of the questions is the safety property, so it is data and not prose
// ============================================================================

/**
 * What one courier answer settles about the only question a write asks.
 *
 * ## Why this exists at all
 *
 * Everything below decides between two sentences, and they are not close: *"it
 * is safe to correct this and ask again"* and *"reconcile before you retry"*.
 * Getting that backwards on either write mints a second real courier order or
 * a second real waybill. Which sentence comes out is decided ENTIRELY by the
 * order the questions are asked in — move the token check, the already-exists
 * check or the attribution check by one position and an unknown outcome
 * silently becomes an instruction to make a duplicate.
 *
 * That order used to be held in place by a numbered clause list in this file's
 * header and by nothing else: no type, no structure, nothing a compiler or a
 * test could see. This file's own warrant is that its prose is true because it
 * is corrected when it goes stale, and it has already been caught claiming
 * "Two" where the number was six — so the safety-critical half of the prose is
 * now a mechanism instead.
 *
 * ## The mechanism, in one sentence
 *
 * `orderedClauses` takes the clauses that leave a mint OPEN and the clauses
 * that RULE ONE OUT as two separate arrays and concatenates them. The two
 * arrays have different element types, so a definite refusal cannot be written
 * among the open ones without a typecheck failure, and the concatenation
 * happens in exactly one place. What a type cannot check — the order INSIDE
 * each group — is pinned by name in
 * `tests/services/shiprocket-courier-writes.test.ts`, which also proves every
 * adjacent boundary decides something with a body that satisfies both clauses.
 */
export type MintVerdict = 'may-have-minted' | 'credential' | 'nothing-minted';

/**
 * One question in a sequence of questions about one courier answer.
 *
 * `when` may read only the answer it is handed — no network, no clock, no
 * cache — so the sequence a test drives is the sequence that runs. `refuse`
 * is where a side effect belongs, and exactly one clause has one: dropping the
 * dead token.
 */
interface WriteClause<C, V extends MintVerdict = MintVerdict> {
  /** A stable name, so a suite can enumerate the order rather than describe it. */
  readonly code: string;
  readonly verdict: V;
  readonly when: (answer: C) => boolean;
  readonly refuse: (answer: C) => ShiprocketError;
  /** A line of its own, for the clauses whose diagnosis is not in the status. */
  readonly log?: (answer: C) => { what: string; extra?: Record<string, unknown> };
}

/**
 * A clause that does not rule out that something was minted.
 *
 * `credential` lives here rather than with the definite refusals, and the
 * exception is argued rather than assumed: a 401 IS a claim that nothing was
 * created (`tokenWentStale` states the argument — a request refused at the
 * authentication layer never reaches the service that could create anything),
 * but the WARRANT for that claim is the status, not their sentence. It has to
 * be asked before anything that reads their sentence, because on a 401 their
 * sentence is about the credential. The suite holds the exception to one
 * clause per table and to the `token-rejected` name, so it cannot quietly
 * become a way of putting a definite refusal early.
 */
type OpenClause<C> = WriteClause<C, 'may-have-minted' | 'credential'>;

/** A clause that concludes nothing was minted, which is only safe to ask last. */
type DefiniteClause<C> = WriteClause<C, 'nothing-minted'>;

/**
 * The verdict `orderedClauses` will not accept in its first argument.
 *
 * Typed as the whole union rather than written as a literal at the comparison,
 * and that is not a style choice: at the comparison the compiler has already
 * proved the value cannot be `'nothing-minted'` there, so the literal is
 * `TS2367 — this comparison appears to be unintentional`. Which is the type
 * doing its job and the guard doing a different one. Widening the constant
 * keeps both: the parameter types still refuse the mistake at compile time,
 * and the runtime check stays reachable for the suite to watch fail.
 */
const RULES_A_MINT_OUT: MintVerdict = 'nothing-minted';

/**
 * Assemble one decision sequence: open verdicts first, definite refusals last.
 *
 * The runtime check is unreachable through the types — that is what the two
 * parameters are for — and it is here anyway, for the reason
 * `lib/vendor-scope.ts:304-312` keeps its own unreachable guard: a rule
 * enforced by a mechanism nobody has watched fail is a rule nobody can reason
 * about. The suite reaches it with a cast and watches it fail, then watches it
 * clear a table that is in order.
 */
export function orderedClauses<C>(
  open: readonly OpenClause<C>[],
  definite: readonly DefiniteClause<C>[]
): readonly WriteClause<C>[] {
  // Each array is checked against the verdicts it is allowed to hold, rather
  // than the concatenation being checked for interleaving. The two are the
  // same rule, and this is the one that can still fail on a table of ONE: a
  // lone definite clause handed to the `open` parameter is trivially "last",
  // and a guard that only looks for an interleave clears it while the type it
  // is mirroring does not.
  const misfiledDefinite = open.find((clause) => clause.verdict === RULES_A_MINT_OUT);
  if (misfiledDefinite) {
    throw new Error(
      `shiprocket: clause "${misfiledDefinite.code}" is nothing-minted and was given as an open ` +
        'clause, so an answer where something may exist can resolve to "safe to ask again"'
    );
  }

  const misfiledOpen = definite.find((clause) => clause.verdict !== RULES_A_MINT_OUT);
  if (misfiledOpen) {
    throw new Error(
      `shiprocket: clause "${misfiledOpen.code}" is not nothing-minted and was given as a ` +
        'definite refusal, so a clause that leaves a mint open is asked after every one that ' +
        'rules one out'
    );
  }

  return [...open, ...definite];
}

/** The first clause that fires, or null when the answer clears every one. */
function firstClause<C>(table: readonly WriteClause<C>[], answer: C): WriteClause<C> | null {
  for (const clause of table) {
    if (clause.when(answer)) return clause;
  }
  return null;
}

/** The part of a refused answer every write's clauses read the same way. */
interface RefusedWrite {
  readonly status: number;
  /** Everything their body says — envelope sentence and field bag alike. */
  readonly said: string;
}

/**
 * The three questions BOTH writes ask of a refused answer, in one place.
 *
 * The two writes are otherwise the place this file keeps going wrong: the
 * attribution check guarded one AWB branch and not its sibling, the envelope
 * list was read by the refusal path and not the success path, the 401 was
 * answered before their sentence on one write and after it on the other.
 * Every one of those was the same argument applied once and dropped once. A
 * shared factory makes the drift a thing you have to work at: a write supplies
 * its own SENTENCES and its own definite refusals, never its own ordering.
 */
function sharedRefusalClauses<C extends RefusedWrite>(sentences: {
  /** What to say when the answer is not a 4xx at all. */
  incomplete: (answer: C) => string;
  /** What this write was doing, for the dead-token sentence. */
  whileDoing: string;
  /** The name of the thing that may already exist, for the clause code. */
  existsCode: string;
  existsSentence: (answer: C) => string;
}): readonly OpenClause<C>[] {
  return [
    {
      // Anything that is not a 4xx, before anything else. A 5xx means their
      // server may have written it and failed afterwards; a 3xx — and
      // `response.ok` is false for one — is a redirect nobody followed, which
      // the definite refusals below would describe, wrongly, as a decision
      // taken before anything was created.
      code: 'write-incomplete',
      verdict: 'may-have-minted',
      when: (answer) => answer.status < 400 || answer.status >= 500,
      refuse: (answer) => new ShiprocketWriteOutcomeUnknownError(sentences.incomplete(answer)),
    },
    {
      // A dead token, before every clause that reads their sentence: a 401 is
      // not a decision about this parcel at all, and the definite refusal at
      // the bottom would tell an operator to correct the payload and re-send —
      // advice nothing they can correct will act on, because what is wrong is
      // a token in this process's memory.
      code: 'token-rejected',
      verdict: 'credential',
      when: (answer) => tokenWasRejected(answer.status),
      refuse: (answer) => {
        // The only side effect in any clause, and it belongs here rather than
        // in `when`: a predicate that mutated state as it was evaluated would
        // make the ORDER of this table a thing that changes the world.
        forgetTokenAfter(answer.status);
        return tokenWentStale(sentences.whileDoing);
      },
    },
    {
      // ...and the one 4xx that is also an unknown outcome, before the clauses
      // that assume a 4xx created nothing.
      code: sentences.existsCode,
      verdict: 'may-have-minted',
      when: (answer) => saysAlreadyExists(answer.said),
      refuse: (answer) => new ShiprocketWriteOutcomeUnknownError(sentences.existsSentence(answer)),
    },
  ];
}

/**
 * One POST to the courier, with the body read INSIDE the same guard.
 *
 * The shape is the whole point. `fetch` resolving is not the same as the call
 * having answered: `AbortSignal.timeout` aborts the body stream too, so a
 * create whose status line lands at 29s and whose body is still arriving at 30s
 * rejects in `readBody`, not in `fetch`. That used to escape as a raw
 * `DOMException` — not a `ShiprocketWriteOutcomeUnknownError`, not even a
 * `ShiprocketError` — from a path where the order EXISTS at Shiprocket, so a
 * caller applying the documented retry rule made a second real order. Anything
 * that throws between "we started sending" and "we hold the body" is the same
 * fact and gets the same type.
 *
 * Configuration and the token are resolved OUTSIDE the guard on purpose: they
 * fail before anything has been sent, and calling that an unknown outcome
 * would send an operator to reconcile a write that never left the process.
 */
async function postCourierWrite(
  path: string,
  payload: unknown,
  unanswered: { context: Record<string, unknown>; message: string }
): Promise<CourierWriteOutcome> {
  const config = getShiprocketConfig();
  const token = await getShiprocketAuthToken();

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });

    const { raw, json } = await readBody(response);
    return { ok: response.ok, status: response.status, raw, json };
  } catch (error) {
    // `err` is the ONLY place the driver's own words go. A timeout, a dropped
    // socket and a half-read body look identical from here, which is correct:
    // they are the same fact about whether the write happened.
    logger.error({ err: error, ...unanswered.context }, 'shiprocket: courier write did not answer');
    throw new ShiprocketWriteOutcomeUnknownError(unanswered.message);
  }
}

/**
 * Does their refusal say the thing already exists?
 *
 * The one 4xx on either write that is NOT a decision made before anything was
 * created, and the deterministic reference is what makes it reachable on the
 * create side: a retry after an unanswered attempt presents the same
 * `order_id`, so "already exists" is the expected shape of exactly the retry
 * the unknown-outcome advice recommends. Reading it as "nothing was created,
 * correct and re-send" is the loop that produces the duplicate.
 *
 * **That Shiprocket refuses a repeated `order_id` at all is an assumption**,
 * not a measured fact — see the module header. This predicate costs nothing if
 * it is wrong; it simply never fires, and the idempotency lookup carries the
 * property on its own.
 *
 * ## The word is never enough. The SUBJECT decides.
 *
 * Every alternative here is qualified by what the sentence is ABOUT, and that
 * is the whole design. `duplicate` was qualified first, on the body "Duplicate
 * SKU found in order items" — a validation complaint about the manifest,
 * plainly decided before anything was created, which came back as an unknown
 * outcome asserting *"Shiprocket says an order with this reference already
 * exists"*: a 409 that blocks dispatch and an operator sent to reconcile an
 * order that was never made.
 *
 * **The same argument was then dropped on its two siblings, and they are the
 * ones Laravel actually produces.** `already exist` and `already been taken`
 * stayed bare, so `unique` fired about ANY field and read as the order:
 *
 * - `{"errors":{"order_items.0.sku":["The order items.0.sku has already been
 *   taken."]}}` — a duplicate SKU in the manifest, answered with a 409 and a
 *   dashboard search that finds nothing;
 * - `{"errors":{"pickup_location":["The pickup location has already been
 *   taken."]}}` — worse, because this branch is asked ABOVE the pickup-location
 *   clause, so `ShiprocketPickupLocationError` — the one refusal here an admin
 *   can act on without leaving their chair — was unreachable for that wording.
 *
 * ## Two forms, because Laravel's names its subject and Shiprocket's does not
 *
 * 1. **`The :attribute has already been taken.`** — Laravel's `unique` rule,
 *    and the only place the create's duplicate actually turns up. The
 *    attribute IS the subject, so it is extracted and compared against
 *    `ALREADY_EXISTS_SUBJECTS`. `order_id` counts; `order_items.0.sku` and
 *    `pickup_location` do not, and fall through to the clauses that can act on
 *    them. Form 2 does not rescue them either: it has no `been taken`
 *    alternative, precisely so this form is the only reader of that wording.
 * 2. **Shiprocket's own wording** — "Order already exists", "AWB is already
 *    assigned to this shipment", "Duplicate order id". Same subject list, with
 *    an adjacency bound so a subject word elsewhere in a long sentence cannot
 *    be read as the thing the clause is about.
 *
 * ## What that costs, stated rather than left to be found
 *
 * A sentence with NO subject at all — a bare "already exists" — is no longer
 * read as a duplicate, and comes back as a definite refusal. That is the
 * residual risk of narrowing, and it is accepted for three reasons: no form
 * either party is known to produce is subjectless; the generic refusal's own
 * text already tells a retrying operator to check the dashboard for the
 * reference first; and this predicate was never the duplicate defence. The
 * defence is the idempotency lookup and the in-flight join — see the module
 * header, which records that Shiprocket refusing a repeated `order_id` at all
 * is an assumption this repository has not verified.
 */
function saysAlreadyExists(message: string): boolean {
  return laravelTakenSubjects(message).some(isOurSubject) || SHIPROCKET_ALREADY.test(message);
}

/**
 * The things this client MAKES, spelled as both parties spell them.
 *
 * A closed list, and the point of the whole predicate: "already taken" is only
 * evidence that something exists at a courier when the thing it is about is
 * the courier order, the shipment Shiprocket opens with it, or the waybill.
 * Every other field named in a `unique` complaint is a field INSIDE the thing,
 * and a complaint about one is a decision taken before anything was made.
 *
 * Written with spaces; `normaliseSubject` folds `_` and `.` to the same, so
 * `order_id`, `order id` and `Order Id` are one entry rather than three.
 */
const ALREADY_EXISTS_SUBJECTS: readonly string[] = [
  'order',
  'order id',
  'order number',
  'shipment',
  'shipment id',
  'awb',
  'awb code',
  'awb number',
  'waybill',
  // The third thing this client makes, since #727. A label is billable, so
  // "label already generated" is the one 4xx on that write where asking again
  // costs money rather than nothing.
  'label',
];

/** Their spelling of a field name, reduced to the one this list is written in. */
function normaliseSubject(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOurSubject(subject: string): boolean {
  return ALREADY_EXISTS_SUBJECTS.includes(subject);
}

/**
 * Laravel's `unique` sentence, whose subject sits between "The" and "has".
 *
 * Global, because a 422 bag can carry several and the one that names the order
 * may be any of them — the same reason `validationMessages` carries no cap.
 *
 * **The capture stops at a full stop, and that is load-bearing rather than
 * tidy.** `refusalReason` joins the envelope sentence and every bag entry into
 * one string, so a body's text really is *"The given data was invalid. The
 * order id has already been taken."* — and a capture class that admitted `.`
 * matched from the FIRST "The", swallowed the generic half, and handed this
 * predicate the subject *"given data was invalid the order id"*, which is in
 * no list. The one sentence that means an order exists would have classified
 * as a definite refusal: the failure this whole function is about, reproduced
 * by the fix for it. Excluding `.` costs nothing — an attribute that contains
 * one (`order_items.0.sku`) simply does not match, and a subject we cannot
 * read is a subject that is not ours.
 */
const LARAVEL_TAKEN = /\bthe\s+([\w -]{1,80}?)\s+has\s+already\s+been\s+taken\b/gi;

function laravelTakenSubjects(message: string): string[] {
  return [...message.matchAll(LARAVEL_TAKEN)].map((match) => normaliseSubject(match[1] ?? ''));
}

/**
 * Shiprocket's own wording, subject first.
 *
 * DERIVED from `ALREADY_EXISTS_SUBJECTS` rather than written beside it, so a
 * subject added there is a subject this form recognises in the same edit. The
 * separators inside a subject are `[\s_.]*` for the same reason
 * `normaliseSubject` exists; the `(?:\s+\w+){0,2}` bound is what makes it an
 * adjacency test — it admits "AWB **is** already assigned" and "Order already
 * exists" while refusing "order items.0.sku ... has already been taken", where
 * the subject word and the phrase are not about each other.
 *
 * `been taken` is deliberately NOT an alternative here: that is Laravel's
 * wording and it always arrives with an attribute, which form 1 reads exactly.
 * Admitting it here would put the bare match back.
 */
const SHIPROCKET_ALREADY = new RegExp(
  `\\b(?:${ALREADY_EXISTS_SUBJECTS.map((subject) => subject.replace(/ /g, '[\\s_.]*')).join('|')})\\b` +
    `(?:\\s+\\w+){0,2}\\s+already\\s+(?:exists?|assigned|generated|in\\s+use)|` +
    `\\bduplicate\\s+(?:order|awb|shipment|waybill|entry|record)\\b`,
  'i'
);

/**
 * The creates this process currently has in flight, keyed by shipment row.
 *
 * The same mechanism as `inFlight` on the login, and for a sharper reason: a
 * second concurrent login costs a rate-limit slot, a second concurrent create
 * costs a real courier order. The idempotency lookup cannot see this window —
 * neither call has recorded anything yet, so both are answered `null` — and
 * the lookup is what the module's header calls its automatic protection.
 *
 * Per shipment row, never global. A global lock would pass the same test and
 * serialise every dispatch in the process behind the slowest one.
 */
const createsInFlight = new Map<string, Promise<CourierOrderRef>>();

/** Everything a refused create's clauses read. */
interface RefusedCreate extends RefusedWrite {
  readonly reference: string;
  /** OURS, as we sent it. Never their echo of it — see the pickup clause. */
  readonly pickupLocation: string;
}

/**
 * How a refused `orders/create/adhoc` is classified, in the order it is asked.
 *
 * @see orderedClauses — the two arrays are the safety property.
 */
const CREATE_REFUSAL_CLAUSES = orderedClauses<RefusedCreate>(
  sharedRefusalClauses<RefusedCreate>({
    incomplete: (answer) =>
      `Shiprocket did not complete this order (HTTP ${answer.status}). ` +
      reconcileAdvice(answer.reference),
    whileDoing: 'creating the courier order',
    existsCode: 'order-may-already-exist',
    existsSentence: (answer) =>
      `Shiprocket says an order with this reference already exists (HTTP ${answer.status}). ` +
      reconcileAdvice(answer.reference),
  }),
  [
    {
      code: 'pickup-location-unknown',
      verdict: 'nothing-minted',
      when: (answer) => /pickup\s*location/i.test(answer.said),
      // Classified, never echoed. The nickname is admin-typed configuration,
      // not customer data, so naming OUR value is the help; repeating THEIR
      // sentence is how the payload gets quoted back into an admin screen.
      refuse: (answer) =>
        new ShiprocketPickupLocationError(
          `Shiprocket does not recognise the pickup location "${answer.pickupLocation}". It must ` +
            'match a pickup address nickname in the Shiprocket dashboard exactly. Fix ' +
            '`shiprocket_pickup_location` on the despatching vendor and try again.'
        ),
    },
    {
      code: 'create-rejected',
      verdict: 'nothing-minted',
      // The floor. Always true, so `firstClause` never returns null on a
      // refused create and the caller needs no "and otherwise" branch — the
      // place a fall-through would silently become a success.
      when: () => true,
      refuse: (answer) =>
        new ShiprocketError(
          `Shiprocket rejected this order (HTTP ${answer.status}). Reference ${answer.reference}. ` +
            'The reason is in the API logs. A 4xx is normally a decision taken before anything ' +
            'was created, so correcting it and re-sending is the next step — but if you are ' +
            `retrying after an attempt that never answered, check the dashboard for ` +
            `${answer.reference} first.`,
          'SHIPROCKET_ORDER_CREATE_REJECTED'
        ),
    },
  ]
);

/** Everything an ACCEPTED create's one clause reads. */
interface AcceptedCreate {
  readonly reference: string;
  readonly orderId: string | null;
  readonly shipmentId: string | null;
  /** The raw fields, so the log can say WHY an id could not be stored. */
  readonly answered: { order_id?: unknown; shipment_id?: unknown } | null;
}

/**
 * The one question an accepted create still has to answer.
 *
 * A table of one, deliberately, rather than an `if`. Every branch on this
 * client's write path is enumerable from `COURIER_WRITE_CLAUSES` — a
 * statement that stops being true the moment one of them is a bare condition
 * somewhere in a function body, and the branch most worth enumerating is this
 * one: an accepted create is the answer most easily mistaken for a failure.
 */
const CREATE_ACCEPTED_CLAUSES = orderedClauses<AcceptedCreate>(
  [
    {
      code: 'ids-unstorable',
      verdict: 'may-have-minted',
      when: (answer) => !answer.orderId || !answer.shipmentId,
      log: (answer) => ({
        what: 'create order accepted with ids we cannot store',
        extra: {
          // Which problem, per id, rather than a boolean: "absent" and "too
          // long" have different remedies and this line is where they differ.
          orderId: idProblem(answer.answered?.order_id),
          shipmentId: idProblem(answer.answered?.shipment_id),
        },
      }),
      // The worst answer there is: Shiprocket said yes, so the order EXISTS,
      // and we did not learn its id — either because the body was not what we
      // expected or because an id was too long for the column that has to hold
      // it. Reporting this as a failure is precisely what produces the
      // duplicate.
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          'Shiprocket accepted this order but did not return ids we can store. ' +
            reconcileAdvice(answer.reference)
        ),
    },
  ],
  []
);

/**
 * Create the courier's order for this shipment, or hand back the one it has.
 *
 * ## Concurrency, which the lookup on its own does not cover
 *
 * Two calls for one shipment row share ONE write: the first to arrive runs,
 * the rest await its answer. Without it, both pass the lookup (nothing is
 * recorded yet), both pass the local refusals, and both POST the identical
 * deterministic reference — one parcel, two courier orders, and whichever
 * caller writes second overwrites the other's ids.
 *
 * A follower is answered `created: false`, exactly as the recorded-ids branch
 * is: it did not make anything, and an audit row per caller would narrate one
 * dispatch twice. A follower of a call that FAILED is answered with that
 * failure rather than going on to make its own attempt — an outcome the leader
 * could not determine is not one a second write may be started on top of.
 *
 * **It covers strictly overlapping calls, and that is the whole of it.** The
 * entry is released the moment the leader settles — before the caller has
 * written the ids anywhere — so a second call arriving after the first has
 * RETURNED finds a lookup that still answers `null` and makes a second real
 * courier order. That is not a gap this map can close (see
 * `CourierOrderLookup` on why widening it would make it a cache of a courier
 * write); it is the reason the lookup's own contract requires a lock, and it
 * is why this paragraph says "overlapping" rather than "duplicate".
 *
 * ## The ordering, which is the design and not an accident
 *
 * 1. **The lookup first**, before configuration, before validation, before the
 *    network. An order that already exists is not made less real by a vendor
 *    whose pickup nickname was cleared afterwards, and refusing at step 2 would
 *    strand a parcel that is already booked.
 * 2. **Then the refusals that cost nothing** — the pickup nickname, the
 *    parcel's measurements and the arithmetic, all checked locally, so none of
 *    them spends a courier write finding out and none of them can be the
 *    reason a duplicate exists.
 * 3. **Then the write**, whose every non-answer is `ShiprocketWriteOutcomeUnknownError`.
 *
 * @see packages/api/tests/services/shiprocket-courier-writes.test.ts
 */
export async function createCourierOrder(
  input: CreateCourierOrderInput,
  findExistingCourierOrder: CourierOrderLookup
): Promise<CourierOrderRef> {
  const joined = createsInFlight.get(input.shipmentRowId);
  if (joined) {
    // `created` is the caller's cue to write an audit row and tell somebody a
    // parcel has been dispatched. A follower did neither of those things.
    return { ...(await joined), created: false };
  }

  // Registered before the first `await` of this function, which is what makes
  // the map race-free under Node's single-threaded turn: `createCourierOrderOnce`
  // runs synchronously up to ITS first await, and nothing else can be entered
  // in between.
  const run = createCourierOrderOnce(input, findExistingCourierOrder);
  createsInFlight.set(input.shipmentRowId, run);

  try {
    return await run;
  } finally {
    // Always, including on the throw. A key left behind would answer the next
    // dispatch of this shipment from a settled promise — that is a cache, and
    // a cache of a courier write is a way to report an order that was never
    // made.
    createsInFlight.delete(input.shipmentRowId);
  }
}

async function createCourierOrderOnce(
  input: CreateCourierOrderInput,
  findExistingCourierOrder: CourierOrderLookup
): Promise<CourierOrderRef> {
  const reference = courierOrderReference(input.orderNumber, input.shipmentRowId);

  // The lookup is the caller's function, so its failure is the caller's
  // database — and it used to escape this module's vocabulary entirely. A
  // dropped `pg` connection arrives as a bare `Error` with no `code`, from the
  // first line of the only function here that spends money, so a route mapping
  // this client's codes to statuses improvised one for the guard that prevents
  // the duplicate. Nothing has been sent, so the direction was always safe;
  // what was false is the module's claim that every failure shares one catch.
  let existing: ExistingCourierOrder | null;
  try {
    existing = await findExistingCourierOrder(input.shipmentRowId);
  } catch (error) {
    // The driver's own words go to the logger and nowhere else: they name our
    // schema, and this message is one an admin screen may render.
    logger.error({ err: error, reference }, 'shiprocket: the courier-order lookup did not answer');
    throw new ShiprocketError(
      'Could not check whether this shipment already has a courier order, so nothing was sent ' +
        'to the courier. That check has to succeed before the write: without it, a retry after ' +
        'a timeout makes a second real order. Try again once the database is answering.',
      'SHIPROCKET_ORDER_LOOKUP_FAILED'
    );
  }

  // EITHER id present means a courier order exists for this shipment. Keying
  // this on `externalOrderId` alone read the mirror half-record — a recorded
  // shipment id with no order id — as "nothing exists here", made a SECOND
  // real order, reported it as created, and overwrote the shipment id that was
  // already there. That half-record is not exotic: it is what a reconciling
  // admin produces the moment they paste the shipment id first, which is
  // exactly what `reconcileAdvice` sends them off to do.
  if (existing && (existing.externalOrderId || existing.externalShipmentId)) {
    if (!existing.externalOrderId || !existing.externalShipmentId) {
      // Half a record: the create landed and only one column did. Returning a
      // null id here would hand the caller something it must pass to
      // `assignAwb`, so the failure would surface one call later wearing the
      // wrong name — and the fix would look like an AWB problem.
      const held = existing.externalOrderId
        ? `Shiprocket order ${existing.externalOrderId}, with no shipment id`
        : `Shiprocket shipment ${existing.externalShipmentId}, with no order id`;

      throw new ShiprocketWriteOutcomeUnknownError(
        `This shipment is half-recorded against ${held}, so a courier order exists for it and ` +
          'cannot be used. Recover the missing id from the Shiprocket dashboard and record it ' +
          'before dispatching — creating another order here would give the courier two parcels ' +
          'for one.'
      );
    }

    return {
      externalOrderId: existing.externalOrderId,
      externalShipmentId: existing.externalShipmentId,
      created: false,
    };
  }

  // The refusals that cost nothing, in the order a reader would ask them:
  // where it is collected from, where it goes, what shape it is, what it owes.
  // None of them can be the reason a duplicate exists, because none of them
  // has sent a byte.
  const pickupLocation = requirePickupLocation(input.pickupLocation);
  assertConsigneeIsDeliverable(input.consignee);
  assertParcelIsShippable(input.parcel);
  const goodsPaise = assertChargesReconcile(input);

  // Built once, then used for BOTH the request and the scrub vocabulary. Two
  // calls to `toAdhocPayload` would be two payloads, and the log would be
  // scrubbed against one while the courier was sent the other.
  const payload = toAdhocPayload(input, reference, pickupLocation, goodsPaise);
  const echoes = payloadEchoes(payload);

  const outcome = await postCourierWrite('/orders/create/adhoc', payload, {
    context: { reference },
    message:
      'Shiprocket did not answer the request to create this order. ' +
      reconcileAdvice(reference),
  });

  // Every answer goes through `logCourierAnswer`, refused or accepted, so the
  // operator a refusal sends off to reconcile has the two facts that separate
  // "a proxy interposed and nothing exists" from "the order exists and we lost
  // its handle": how much body arrived, and whatever of their sentence
  // survives scrubbing.
  const logAnswer = (what: string, extra: Record<string, unknown> = {}) =>
    logCourierAnswer(what, { reference, ...extra }, outcome, echoes);

  if (!outcome.ok) {
    logAnswer(refusedWriteLabel(outcome.status), { status: outcome.status });

    // Their sentence AND their field bag. A Laravel 422 puts the generic half
    // at `message` and the half that names a field in `errors`, and reading
    // only the first is what hid "The order id has already been taken." from
    // the classifier — the one 4xx here that means something exists.
    const answer: RefusedCreate = {
      status: outcome.status,
      said: refusalReason(outcome.json),
      reference,
      pickupLocation,
    };

    // The clause table decides, not this function. The last clause is the
    // floor, so this is never null — and if a future edit removes it, the
    // non-null assertion is a crash rather than an accepted create that was
    // never made.
    throw firstClause(CREATE_REFUSAL_CLAUSES, answer)!.refuse(answer);
  }

  // Named once and read twice — for the value and for the reason it is not
  // one — so the id we store and the problem we log cannot come from different
  // reads of the same body.
  const answered = outcome.json as { order_id?: unknown; shipment_id?: unknown } | null;
  const accepted: AcceptedCreate = {
    reference,
    orderId: externalId(answered?.order_id),
    shipmentId: externalId(answered?.shipment_id),
    answered,
  };

  const unstorable = firstClause(CREATE_ACCEPTED_CLAUSES, accepted);
  if (unstorable) {
    const line = unstorable.log?.(accepted);
    if (line) logAnswer(line.what, line.extra);
    throw unstorable.refuse(accepted);
  }

  return {
    externalOrderId: accepted.orderId!,
    externalShipmentId: accepted.shipmentId!,
    created: true,
  };
}

/**
 * Every consignee field a courier needs before it will take the parcel.
 *
 * **Deliberately absent: `addressLine2`.** It is `string | null` on the input
 * type and empty on most Indian addresses — "Flat 3, Sunrise Apartments" is a
 * nicety, not a requirement — so requiring it would refuse the majority of
 * real orders. Every other field on `CourierConsignee` is here, which is the
 * point: the list is the type minus one named exception, not a subset somebody
 * chose.
 */
const REQUIRED_CONSIGNEE_FIELDS = [
  'name',
  'addressLine1',
  'city',
  'state',
  'pincode',
  'country',
  'phone',
  'email',
] as const;

/**
 * The consignee is somebody a courier could deliver to, or a refusal naming
 * the empty fields.
 *
 * **Clause 0 of this module's header says "everything refusable before a byte
 * is sent is refused there", and the consignee was the one input that did not
 * get that treatment.** The pickup nickname, the parcel and the arithmetic all
 * did; a blank `pincode`, `phone` or `email` was posted to a real courier and
 * the refusal learned from Shiprocket. The direction was safe — a 4xx create
 * is a definite refusal, and this file classifies one correctly — but the
 * clause was false, and a clause a 2am reader cannot rely on is worse than one
 * that was never written.
 *
 * Through `asText`, so a blank string, a whitespace-only string and a `null`
 * that slipped past the type are one fact: there is nothing here to give a
 * courier.
 *
 * **The message names the FIELDS and never their values.** It is rendered on
 * an admin screen and pasted into support threads, and the values are a
 * customer's name, street, phone and email — the same rule `logCourierAnswer`
 * enforces on Shiprocket's sentence, one layer earlier and on our own.
 */
function assertConsigneeIsDeliverable(consignee: CourierConsignee): void {
  const missing = REQUIRED_CONSIGNEE_FIELDS.filter((field) => asText(consignee[field]) === '');
  if (missing.length === 0) return;

  throw new ShiprocketError(
    `This order's delivery address has nothing in ${missing.join(', ')}, so a courier has ` +
      'nowhere to take the parcel and would refuse it at the pickup. Correct the delivery ' +
      'address on the order and dispatch again. Nothing has been sent to the courier.',
    'SHIPROCKET_CONSIGNEE_INVALID'
  );
}

/**
 * The parcel is one a courier could actually carry, or a refusal naming the
 * field.
 *
 * Refused BEFORE the network, with the pickup nickname and the arithmetic,
 * because a courier quotes and bills on the parcel: `weightGrams: 0` buys a
 * real label for a parcel that cannot exist, and finds that out at the
 * courier's end where the fix costs a void and a re-buy. This function's own
 * design statement puts "the refusals that cost nothing" before "the write",
 * and the parcel was the one input that did not get that treatment.
 *
 * Every bad measurement is named at once rather than the first one found, so a
 * caller fixes the shipment in one pass instead of learning about the height
 * after correcting the length. The names are OURS — `weightGrams`, `lengthCm`
 * — not Shiprocket's `weight`/`breadth`, because the reader of this message
 * has our field in front of them, not theirs.
 */
function assertParcelIsShippable(parcel: CourierParcel): void {
  const measurements: ReadonlyArray<readonly [string, number]> = [
    ['weightGrams', parcel.weightGrams],
    ['lengthCm', parcel.lengthCm],
    ['widthCm', parcel.widthCm],
    ['heightCm', parcel.heightCm],
  ];

  // `<= 0` and non-finite together: zero, negative and NaN are one fact here —
  // not a parcel. `Number.isFinite` first, because `NaN <= 0` is false and a
  // NaN would otherwise sail through as a valid measurement.
  const unusable = measurements
    .filter(([, value]) => !Number.isFinite(value) || value <= 0)
    .map(([field, value]) => `${field} is ${value}`);

  if (unusable.length === 0) return;

  throw new ShiprocketError(
    `This parcel has no shippable size or weight: ${unusable.join(', ')}. A courier quotes and ` +
      'bills on the measurements, so this would buy a real label for a parcel that cannot ' +
      'exist. Fill in the shipped weight and dimensions on the shipment and dispatch again. ' +
      'Nothing has been sent to the courier.',
    'SHIPROCKET_PARCEL_INVALID'
  );
}

/**
 * The goods, in paise, or a refusal that names both numbers.
 *
 * Returns `sub_total`'s value so the payload cannot compute it a second time
 * and drift from the number that was checked.
 *
 * **What is being checked, and why it is a refusal rather than a log line.**
 * Shiprocket's order total is `sub_total + shipping_charges +
 * transaction_charges + giftwrap_charges - total_discount`, and on a COD parcel
 * that total is the cash a courier collects at a customer's door. If it
 * disagrees with what the customer actually owes, the customer is overcharged
 * or undercharged at the door and nothing downstream ever sees it: the money
 * moves in a van, not through our payment gateway. So the disagreement is
 * caught here, BEFORE the network, where refusing has cost nothing and no
 * order exists to reconcile.
 *
 * Checked on prepaid orders too, deliberately. No money moves at the door
 * there, but the same numbers print on the manifest the courier hands over and
 * feed any RTO or insurance claim that follows, so a manifest that overstates
 * the parcel is wrong whether or not anyone is collecting against it.
 *
 * Integer paise throughout — no tolerance, no rounding window. Every money
 * column in the schema is exact, and a tolerance is a place for a real
 * discrepancy to hide.
 */
function assertChargesReconcile(input: CreateCourierOrderInput): number {
  const linesPaise = input.items.reduce(
    (total, item) => total + item.units * item.sellingPricePaise,
    0
  );

  // Tax rides with the goods. Shiprocket's adhoc payload has no order-level tax
  // field, and dropping the term would understate a COD collectible by exactly
  // the tax — so it is folded into the one field that can carry it, and said
  // out loud here rather than left to be discovered from the arithmetic.
  const goodsPaise = linesPaise + input.charges.taxPaise;

  const { shippingPaise, transactionPaise, giftwrapPaise, discountPaise, amountDuePaise } =
    input.charges;
  const derivedPaise =
    goodsPaise + shippingPaise + transactionPaise + giftwrapPaise - discountPaise;

  if (derivedPaise !== amountDuePaise) {
    throw new ShiprocketOrderTotalMismatchError(
      `The charges on this shipment do not add up to what the customer owes: the goods, ` +
        `shipping, tax and fees less the discount come to ${toRupees(derivedPaise)}, but the ` +
        `amount due is ${toRupees(amountDuePaise)}. ` +
        (input.cod
          ? 'This is a COD parcel, so that difference is money a courier would collect at the ' +
            'door. '
          : '') +
        'Nothing has been sent to the courier. Check the order total, the discounts and the ' +
        'shipping cost against each other and dispatch again.'
    );
  }

  return goodsPaise;
}

/**
 * The payload, built key by key against `COURIER_ADHOC_PAYLOAD_KEYS`.
 *
 * No spread of the input, anywhere. A spread is how a field a caller happened
 * to be holding — the internal cost, a label token, a vendor id — leaves the
 * building without anyone typing its name.
 */
function toAdhocPayload(
  input: CreateCourierOrderInput,
  reference: string,
  pickupLocation: string,
  goodsPaise: number
): AdhocPayload {
  return {
    order_id: reference,
    order_date: formatOrderDate(input.orderDate),
    pickup_location: pickupLocation,

    // The name is NOT split on a space. Splitting mangles single-token names
    // and multi-part surnames alike — "Sri Lakshmi Venkata Rao" has no first
    // and last to find — and the courier prints the concatenation anyway, so
    // the whole name goes in the first field and the second is deliberately
    // empty rather than absent, to make that a decision a reader can see.
    billing_customer_name: input.consignee.name,
    billing_last_name: '',
    billing_address: input.consignee.addressLine1,
    billing_address_2: input.consignee.addressLine2 ?? '',
    billing_city: input.consignee.city,
    billing_pincode: input.consignee.pincode,
    billing_state: input.consignee.state,
    billing_country: input.consignee.country,
    // The courier's own delivery notifications run off these two, which is the
    // only reason a third party gets either.
    billing_email: input.consignee.email,
    billing_phone: input.consignee.phone,
    // We do not ship to a different address than we bill: there is one address
    // on the order, and sending it twice invites the two copies to disagree.
    shipping_is_billing: true,

    order_items: input.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.units,
      selling_price: toRupees(item.sellingPricePaise),
    })),

    // On a COD parcel this is not a label on the manifest — it is the
    // instruction that decides how much cash the courier asks for.
    payment_method: input.cod ? 'COD' : 'Prepaid',

    // The goods: the line sum plus the order's tax, which Shiprocket has no
    // separate field for. Derived from the items rather than taken as a total,
    // so the lines and the figure beside them cannot disagree — and already
    // proved by `assertChargesReconcile` to be a term of the amount due.
    sub_total: toRupees(goodsPaise),
    // The other four terms of Shiprocket's own sum. Sent even when zero: a
    // field they compute with, and one this client omitted while claiming to
    // be an allow-list, is a term whose value they get to assume.
    shipping_charges: toRupees(input.charges.shippingPaise),
    total_discount: toRupees(input.charges.discountPaise),
    transaction_charges: toRupees(input.charges.transactionPaise),
    giftwrap_charges: toRupees(input.charges.giftwrapPaise),

    length: input.parcel.lengthCm,
    breadth: input.parcel.widthCm,
    height: input.parcel.heightCm,
    // Their `weight` is kilograms; ours is an integer gram count. The division
    // happens exactly once, here, at the boundary.
    weight: input.parcel.weightGrams / 1000,
  };
}

/**
 * What `courier/assign/awb` said, reduced to the ONE question that matters.
 *
 * `assigned` — a waybill exists and we are holding its number.
 * `declined` — Shiprocket said, in as many words, that it minted nothing.
 * `unreadable` — we cannot tell, and saying either of the above would be a
 *   guess about whether a courier is expecting to collect a parcel.
 */
type AwbRead =
  | { kind: 'assigned'; awb: string; envelope: Record<string, unknown> }
  /**
   * The envelope is carried here too, and that is the fix rather than a
   * convenience. It used to be dropped on this branch, so the attribution
   * check below — *is this answer even about our shipment?* — was unreachable
   * for a declined answer, and a `declined` envelope stamped with somebody
   * else's `shipment_id` came back as a confident "No waybill exists, so it is
   * safe to correct the shipment and ask again" about a shipment nobody had
   * answered for. That is an instruction to mint a second waybill against a
   * shipment that may already have one — the one outcome this module exists to
   * prevent, produced by applying its own argument to one branch and dropping
   * it on the sibling.
   */
  | { kind: 'declined'; envelope: Record<string, unknown> }
  | { kind: 'unreadable' };

/**
 * Read an AWB answer, and never mistake "we could not read it" for "no".
 *
 * The distinction this whole module turns on, at the one place it is hardest
 * to get right. A `declined` answer is safe to correct and ask again; an
 * `unreadable` one is not, because asking again may mint a SECOND waybill
 * against a shipment that already has one — a courier expecting two
 * collections and two billing events for one parcel.
 *
 * So `declined` is only ever returned on a POSITIVE signal from Shiprocket,
 * and there are exactly two:
 *
 * 1. An envelope we recognise that OWNS an `awb_code` and left it blank —
 *    they named the field and put nothing in it.
 * 2. Their own refusal flag or sentence: `awb_assign_status: 0`, or an
 *    `awb_assign_error` at one of the envelope paths.
 *
 * Anything else — an envelope shape we do not know, an edge proxy's HTML page,
 * a truncated body — is `unreadable`. The previous version had no such state:
 * `json?.response?.data ?? {}` made every unmappable 200 into an empty
 * envelope, an empty `awb_code`, and the refusal whose words are "No waybill
 * exists, so it is safe to correct the shipment and ask again."
 *
 * `hasOwnProperty` rather than an index read, deliberately: a plain
 * `envelope.awb_code` resolves nothing up the prototype chain here, but
 * `'constructor' in obj` style checks do, and the property being asserted is
 * "Shiprocket sent this key", not "this key is reachable".
 */
function readAwbAssignment(json: unknown): AwbRead {
  // The FIRST envelope that says anything, so a declined answer is attributed
  // to the envelope that declined it. Scanning for the signal across envelopes
  // and then reporting a different one is the attribution mistake this
  // function's own comment makes about couriers, one level up.
  let declined: Record<string, unknown> | null = null;

  for (const path of AWB_ENVELOPE_PATHS) {
    const node = resolvePath(json, path);
    if (typeof node !== 'object' || node === null || Array.isArray(node)) continue;

    const envelope = node as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(envelope, 'awb_code')) {
      const awb = asText(envelope.awb_code);
      if (awb !== '') return { kind: 'assigned', awb, envelope };
      declined ??= envelope;
    }

    if (envelopeSaysNoWaybill(envelope)) declined ??= envelope;
  }

  return declined === null ? { kind: 'unreadable' } : { kind: 'declined', envelope: declined };
}

/**
 * Shiprocket's own "I minted nothing", inside ONE envelope, by flag or by
 * sentence.
 *
 * Envelope-local rather than a scan over paths, which is what it used to be.
 * A predicate that answered "somewhere in this body something says no" cannot
 * name WHICH envelope said it, and the envelope is what carries the shipment
 * id the answer has to be checked against.
 */
function envelopeSaysNoWaybill(envelope: Record<string, unknown>): boolean {
  // `awb_assign_error` only — never the root `message`. A root `message` is a
  // fine thing to log and a terrible thing to decide on here: an edge proxy
  // answering `200 {"message":"OK"}` would become a confident refusal. See
  // `REFUSAL_MESSAGE_PATHS`, which is the wider list and is for logging.
  if (asText(envelope.awb_assign_error) !== '') return true;

  // Read through `finiteNumber` and compared to 0 exactly: `Number(undefined)`
  // is NaN and `Number(null)` is 0, so a coercion here would read a body with
  // no flag at all as a body that flagged a refusal.
  return finiteNumber(envelope.awb_assign_status) === 0;
}


/** Everything a refused waybill request's clauses read. */
interface RefusedAssign extends RefusedWrite {
  readonly shipmentId: string;
}

/**
 * How a refused `courier/assign/awb` is classified, in the order it is asked.
 *
 * The first three clauses come from `sharedRefusalClauses` — the SAME three,
 * in the SAME order, as the create side — because every asymmetry this file
 * has been caught with was one argument applied to one write and dropped on
 * the other. What this write supplies is its own sentences and its own floor.
 */
const ASSIGN_REFUSAL_CLAUSES = orderedClauses<RefusedAssign>(
  sharedRefusalClauses<RefusedAssign>({
    incomplete: (answer) =>
      `Shiprocket did not complete the waybill request for shipment ${answer.shipmentId} ` +
      `(HTTP ${answer.status}). Check the shipment for an AWB before asking again.`,
    whileDoing: 'assigning the waybill',
    existsCode: 'waybill-may-already-exist',
    // "Already assigned" is the shape of a retry after an attempt that never
    // answered, and it is the one 4xx here where a waybill EXISTS.
    existsSentence: (answer) =>
      `Shiprocket says shipment ${answer.shipmentId} already has a waybill ` +
      `(HTTP ${answer.status}). Read the AWB and its courier off the shipment in the Shiprocket ` +
      'dashboard and record them against this shipment — do not ask for another.',
  }),
  [
    {
      code: 'awb-refused',
      verdict: 'nothing-minted',
      // The floor, exactly as `create-rejected` is on the sibling write.
      when: () => true,
      refuse: (answer) =>
        new ShiprocketAwbRefusedError(
          `Shiprocket would not assign a waybill to shipment ${answer.shipmentId} ` +
            `(HTTP ${answer.status}). The reason is in the API logs. No waybill exists, so it is ` +
            'safe to correct the shipment and ask again.'
        ),
    },
  ]
);

/**
 * An accepted waybill answer, reduced to the fields the clauses read.
 *
 * Every field is resolved ONCE, here, from the envelope `readAwbAssignment`
 * attributed the answer to. A clause that went back to the body for a courier
 * name could take it from a different envelope than the waybill came from,
 * which is an attribution nobody sent us.
 */
interface AssignedAnswer {
  /** OURS — the shipment we asked about, trimmed. */
  readonly shipmentId: string;
  readonly kind: AwbRead['kind'];
  /** The waybill, or `''` when nothing was assigned. */
  readonly awb: string;
  readonly courierName: string;
  /** The shipment THEIR envelope says it is about, or `''` when it names none. */
  readonly answeredFor: string;
  readonly courierCompanyId: number | null;
}

/**
 * How an ACCEPTED `courier/assign/awb` answer is classified.
 *
 * Every clause here answers one question — *was a waybill minted, for THIS
 * shipment?* — and exactly one of them is a definite refusal. That one is
 * `awb-declined`, it is reached only on a POSITIVE signal from Shiprocket, and
 * `orderedClauses` is what keeps it behind every clause that leaves a mint
 * open. Its sentence is "No waybill exists, so it is safe to correct the
 * shipment and ask again", which is an instruction to mint a second waybill if
 * it is ever reached about an answer that did not say so.
 *
 * `awb-declined` used to sit ahead of `waybill-without-courier` and
 * `waybill-too-long`. That was harmless — the three are mutually exclusive on
 * `kind` — and it is here at the end anyway, because "harmless given a
 * discriminant two clauses away" is not a property a reader can check at a
 * glance, and the partition is.
 */
const AWB_ANSWER_CLAUSES = orderedClauses<AssignedAnswer>(
  [
    {
      // HTTP 200, and an answer we cannot map: an envelope shape we do not
      // know, an edge proxy's page, a truncated body. Whether a waybill exists
      // is simply not knowable from here.
      code: 'answer-unreadable',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'unreadable',
      log: () => ({ what: 'waybill request answered with something we cannot read' }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket accepted the waybill request for shipment ${answer.shipmentId} and ` +
            'answered with something this client cannot read, so it is not known whether a ' +
            'waybill was assigned. Look the shipment up in the Shiprocket dashboard and record ' +
            'any AWB against it — do NOT ask for another until you have looked.'
        ),
    },
    {
      // The envelope has to be about the shipment we asked about, and this is
      // asked before the assigned/declined split rather than inside one arm of
      // it. It used to sit on the `assigned` branch alone: a declined envelope
      // stamped with another shipment's id came back as "no waybill exists, so
      // it is safe to ask again" about a shipment nobody had answered for.
      //
      // On a PRESENT and different id, never on a missing one:
      // `AWB_ENVELOPE_PATHS` reads an unwrapped body too, and nothing
      // establishes that every shape carries the id back. Refusing on absence
      // would turn a documented answer into an unknown outcome and strand a
      // waybill that really is ours.
      code: 'answered-for-another-shipment',
      verdict: 'may-have-minted',
      when: (answer) => answer.answeredFor !== '' && answer.answeredFor !== answer.shipmentId,
      // The other shipment's id goes to the LOG and not into the message. It
      // is another parcel's handle at the courier, and this message may be
      // rendered on an admin screen.
      log: (answer) => ({
        what: 'waybill request answered for a different shipment',
        extra: { answeredFor: answer.answeredFor },
      }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket answered the waybill request for shipment ${answer.shipmentId} with an ` +
            'answer about a different shipment, so it is not known whether this one has a ' +
            'waybill. Look this shipment up in the Shiprocket dashboard and record any AWB ' +
            'against it — do NOT ask for another until you have looked.'
        ),
    },
    {
      // A waybill EXISTS and only its attribution is missing. This used to be
      // answered with `awb-declined`, whose words are "no waybill exists, so
      // it is safe to ask again": a confident instruction to mint a second one
      // against a shipment that already has one.
      code: 'waybill-without-courier',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'assigned' && answer.courierName === '',
      log: (answer) => ({
        what: 'assigned waybill came back with no courier attributed to it',
        extra: { awbLength: answer.awb.length },
      }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket assigned waybill ${answer.awb} to shipment ${answer.shipmentId} but named ` +
            'no courier for it, so it cannot be stored as it stands. The waybill EXISTS — do ' +
            'not ask for another. Read the courier off the shipment in the Shiprocket dashboard ' +
            'and record both against this shipment.'
        ),
    },
    {
      // The waybill EXISTS and will not fit the column — the AWB twin of an
      // accepted create whose ids we could not read. Not a refusal: asking
      // again could mint a second one.
      code: 'waybill-too-long',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'assigned' && answer.awb.length > EXTERNAL_ID_MAX_LENGTH,
      log: (answer) => ({
        what: 'assigned waybill is too long to store',
        extra: { awbLength: answer.awb.length },
      }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket assigned a waybill to shipment ${answer.shipmentId} that is too long to ` +
            'store. The waybill exists — read it from the Shiprocket dashboard and record it ' +
            'manually rather than asking for another.'
        ),
    },
  ],
  [
    {
      // Nothing was minted, and Shiprocket said so ABOUT THIS SHIPMENT — an
      // `awb_code` field they named and left blank, or their own
      // `awb_assign_error`. The one AWB answer that is a definite refusal, and
      // the only one where "correct it and ask again" is safe advice.
      code: 'awb-declined',
      verdict: 'nothing-minted',
      when: (answer) => answer.kind === 'declined',
      log: () => ({ what: 'courier assigned no waybill' }),
      refuse: (answer) =>
        new ShiprocketAwbRefusedError(
          `Shiprocket assigned no waybill to shipment ${answer.shipmentId}. The reason is in the ` +
            'API logs. No waybill exists, so it is safe to correct the shipment and ask again.'
        ),
    },
  ]
);

/**
 * The waybill requests this process currently has in flight, keyed by
 * Shiprocket's shipment id.
 *
 * **This used to be absent, and the absence was defended with a premise about
 * a third party.** The comment said assignment "is keyed on Shiprocket's own
 * shipment id, so a second call names the same shipment rather than making a
 * second one" — a claim about Shiprocket that nothing in this repository
 * establishes and that #726 forbids probing, sitting in a file whose header
 * asserts a COMPLETE list of exactly three such premises. It was a fourth, and
 * it guarded a waybill.
 *
 * The sibling write got `createsInFlight` on the argument that a second
 * concurrent create costs a real courier order. A second concurrent assign
 * costs a real waybill — a courier expecting two collections and two billing
 * events for one parcel, which is the outcome this module opens by saying it
 * exists to prevent. So the defence is the same mechanism rather than a
 * different argument, and the premise is retired rather than left unlisted.
 *
 * Per shipment id, never global: a global lock would pass the same test and
 * serialise every dispatch in the process behind the slowest one.
 */
const assignsInFlight = new Map<string, Promise<AwbAssignment>>();

/**
 * Ask a courier to take this shipment, and report the one that actually did.
 *
 * Shiprocket may assign a courier other than the requested one — a courier goes
 * out of service, a pincode moves between networks — and the assignment that
 * comes back is the truth. What was asked for is returned under a name nobody
 * can mistake for it, so a caller that stores `courierName` cannot store the
 * request by accident: the value on `order_shipments.courier_name` is what a
 * customer sees on a tracking page, and a name that never had the parcel is a
 * support call that cannot be resolved.
 *
 * ## Concurrency, on the same terms as the create
 *
 * Two calls naming one Shiprocket shipment share ONE request: the first to
 * arrive runs, the rest await its answer, and a follower of a call that FAILED
 * is answered with that failure rather than asking again — an outcome the
 * leader could not determine is not one a second write may be started on top
 * of.
 *
 * **It closes overlap, and only overlap.** The entry is released the moment
 * the leader settles, because a key left behind would answer the next dispatch
 * from a settled promise — that is a cache, and a cache of a courier write is
 * a way to report a waybill that was never minted. A caller that has already
 * recorded an `awb_number` must not call this at all; nothing here can see
 * `order_shipments`, and the join is not a substitute for that.
 *
 * There is no idempotency lookup, and the asymmetry with `createCourierOrder`
 * is the one honest difference between the two writes: the create is asked to
 * make something that has no handle yet, so a lookup is the only way to find
 * out whether it exists; the assign already names the thing at Shiprocket, and
 * the answer to "does it have a waybill" lives on our own row, in a column the
 * caller is holding.
 */
export async function assignAwb(request: AssignAwbRequest): Promise<AwbAssignment> {
  // The sibling write guards every input it has; this one used to guard none,
  // and spent a real courier call to find out. What Shiprocket does with
  // `shipment_id: ''` is not established here and cannot be — establishing it
  // means minting a waybill — so a blank id is refused rather than posted.
  // 500, not 422: nobody can fix this from an admin screen. It means the
  // caller lost the id `createCourierOrder` handed it.
  const shipmentId = request.shipmentId.trim();
  if (shipmentId === '') {
    throw new ShiprocketError(
      'No Shiprocket shipment id was supplied, so there is nothing to assign a waybill to. ' +
        'The id comes back from the courier-order create and belongs in ' +
        '`order_shipments.external_shipment_id`; recover it there before dispatching.',
      'SHIPROCKET_SHIPMENT_ID_MISSING'
    );
  }

  // Keyed on the TRIMMED id, which is the id that goes on the wire. Keying on
  // the caller's raw argument would let two callers holding the same shipment
  // with different whitespace name one shipment at Shiprocket and still race.
  const joined = assignsInFlight.get(shipmentId);
  if (joined) {
    // The leader's answer verbatim, `requestedCourierCompanyId` included: that
    // field means "what was asked for", and what was asked for is what reached
    // Shiprocket. A follower's own preference was never sent, and reporting it
    // back would tell a caller a courier was requested when it was not.
    return joined;
  }

  // Registered before the first `await` of this function, which is what makes
  // the map race-free under Node's single-threaded turn.
  const run = assignAwbOnce(shipmentId, request.courierCompanyId);
  assignsInFlight.set(shipmentId, run);

  try {
    return await run;
  } finally {
    // Always, including on the throw. See the map's own comment on why a key
    // left behind would be a cache of a courier write.
    assignsInFlight.delete(shipmentId);
  }
}

async function assignAwbOnce(
  shipmentId: string,
  courierCompanyId: number | undefined
): Promise<AwbAssignment> {
  // `finiteNumber`, not `typeof === 'number'`. `typeof NaN` is `'number'`, so
  // a courier id that failed to parse upstream satisfied a presence check and
  // went on the wire as `"courier_id": null` — the exact thing the comment
  // below says is never sent. This was the only numeric input in the module
  // that did not go through the helper whose doc block is about this mistake.
  const requestedCourierId = finiteNumber(courierCompanyId);

  // `courier_id` is OMITTED rather than sent as null when we have no
  // preference. A present-but-empty field is a choice, and the choice
  // Shiprocket makes of one is not ours to assume.
  const body: Record<string, unknown> = { shipment_id: shipmentId };
  if (requestedCourierId !== null) body.courier_id = requestedCourierId;

  const outcome = await postCourierWrite('/courier/assign/awb', body, {
    context: { shipmentId },
    // A waybill may have been minted. A caller that saw a plain error here and
    // retried would mint a second one against the same shipment, and a courier
    // would be expecting two collections.
    message:
      `Shiprocket did not answer the request to assign a waybill to shipment ${shipmentId}. ` +
      'Check the shipment in the Shiprocket dashboard for an AWB before asking again — a ' +
      'waybill may already exist.',
  });

  // Scrubbed against the payload this call actually sent, exactly as the
  // create side is — one rule, not two. That payload is a shipment id and
  // nothing else, so almost nothing here has an echo to match and the SHAPE
  // pass in `lib/payload-echo-scrub.ts` is what is left standing. This is the
  // endpoint that quotes back a pincode we never handed it, which is why that
  // pass exists at all and why the suite proves it on this path specifically.
  const logAnswer = (what: string, extra: Record<string, unknown> = {}) =>
    logCourierAnswer(
      what,
      { status: outcome.status, shipmentId, ...extra },
      outcome,
      payloadEchoes(body)
    );

  if (!outcome.ok) {
    logAnswer(refusedWriteLabel(outcome.status));

    const answer: RefusedAssign = {
      status: outcome.status,
      said: refusalReason(outcome.json),
      shipmentId,
    };

    // The table decides. Its last clause is the floor, so this is never null.
    throw firstClause(ASSIGN_REFUSAL_CLAUSES, answer)!.refuse(answer);
  }

  // ------------------------------------------------------------------------
  // Everything below answers ONE question: was a waybill minted, for THIS
  // shipment? Getting it backwards is how a second waybill gets assigned to
  // one shipment and a courier expects two collections. The branches are
  // `AWB_ANSWER_CLAUSES` — data rather than a chain of `if`s — because their
  // ORDER is the property, and an order held in place by nothing but the
  // sequence somebody typed is an order a refactor can change in silence.
  // ------------------------------------------------------------------------
  const read = readAwbAssignment(outcome.json);
  const envelope = read.kind === 'unreadable' ? null : read.envelope;

  const answer: AssignedAnswer = {
    shipmentId,
    kind: read.kind,
    awb: read.kind === 'assigned' ? read.awb : '',
    // Every field out of the ONE envelope the answer was attributed to. A
    // courier taken from one envelope and a waybill from another is an
    // attribution nobody sent us.
    courierName: envelope ? asText(envelope.courier_name) : '',
    answeredFor: envelope ? asText(envelope.shipment_id) : '',
    // `finiteNumber`, not `Number`: a JSON null coerces to 0, and 0 is finite,
    // so a missing courier id would be offered to phase 7 as company 0.
    courierCompanyId: envelope ? finiteNumber(envelope.courier_company_id) : null,
  };

  const clause = firstClause(AWB_ANSWER_CLAUSES, answer);
  if (clause) {
    const line = clause.log?.(answer);
    if (line) logAnswer(line.what, line.extra);
    throw clause.refuse(answer);
  }

  return {
    awbNumber: answer.awb,
    courierName: answer.courierName,
    courierCompanyId: answer.courierCompanyId,
    requestedCourierCompanyId: requestedCourierId,
  };
}

// ============================================================================
// The label (#727) — billable, so it is a write, and the URL never leaves here
// ============================================================================

/**
 * The most a label file is allowed to be.
 *
 * A shipping label is one A4 or 4x6 page of vector text and a barcode — tens
 * of kilobytes. The cap is generous by two orders of magnitude and exists so a
 * host answering with something that is not a label (a login page, an error
 * document, a whole manifest) is refused before it is buffered, not after.
 * Checked on `Content-Length` when the host sends one, and again on the bytes
 * when it does not.
 */
export const LABEL_PDF_MAX_BYTES = 5 * 1024 * 1024;

/** `%PDF-`: the five bytes every PDF starts with. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export interface GenerateLabelRequest {
  /** SHIPROCKET's shipment id — `external_shipment_id`. See `AssignAwbRequest`. */
  shipmentId: string;
  /**
   * `order_shipments.label_object_token` as the caller holds it, under its
   * lock.
   *
   * REQUIRED, and `null` means "I looked and there is none" rather than "I did
   * not look" — the argument `CourierOrderLookup` makes for being a required
   * parameter, applied to the one write that is billed per call. A non-blank
   * token here means NOTHING is sent: not the label request, not the file
   * fetch, not even the login. The token is the only record this side has that
   * a label was bought, and premise 4 in the module header is why buying it
   * again is not free.
   */
  heldLabelObjectToken: string | null;
}

/**
 * What `generateLabel` hands back.
 *
 * The bytes, never the URL. The URL Shiprocket answers with is a customer's
 * name and address behind a link that anyone holding it can open, and it is
 * short-lived — storing it is the bug `order_shipments.label_object_token`
 * exists to prevent (#703). Phase 7 writes the bytes to
 * `fulfilment/labels/<token>.pdf` through `lib/storage.ts`; this function does
 * not know storage exists, for the same reason it has no database import.
 */
export type LabelOutcome =
  | { readonly generated: true; readonly pdf: Uint8Array }
  /** The token the caller already held. Nothing was sent; nothing was billed. */
  | { readonly generated: false; readonly labelObjectToken: string };

/**
 * A shipment id as Shiprocket's label and pickup endpoints take it.
 *
 * Both are documented as taking an ARRAY of numeric ids — `{"shipment_id":
 * [123]}` — even for one. The AWB endpoint takes a bare string and this
 * client sends it one; here the id is sent as a number when it reads as one,
 * because a transcribed shape is the only shape there is (the test file says
 * why nothing here is measured). A non-numeric id goes as the string it is
 * rather than being dropped: an id we cannot parse is still the id we hold.
 */
function shipmentIdOnTheWire(shipmentId: string): number | string {
  return finiteNumber(shipmentId) ?? shipmentId;
}

/** Everything a refused label request's clauses read. */
interface RefusedLabel extends RefusedWrite {
  readonly shipmentId: string;
}

/**
 * How a refused `courier/generate/label` is classified, in the order it is
 * asked.
 *
 * The same three shared clauses as the other two writes, for the reason
 * `sharedRefusalClauses` gives; the floor is a definite refusal, exactly as
 * `awb-refused` and `create-rejected` are. What is different is what the
 * "may already exist" sentence advises: a label that exists is not something
 * to record and move on from — it is a file to go and download, because
 * asking for it again is billed (premise 4).
 */
const LABEL_REFUSAL_CLAUSES = orderedClauses<RefusedLabel>(
  sharedRefusalClauses<RefusedLabel>({
    incomplete: (answer) =>
      `Shiprocket did not complete the label request for shipment ${answer.shipmentId} ` +
      `(HTTP ${answer.status}). A label may have been generated and billed — check the ` +
      'shipment in the Shiprocket dashboard for one before asking again.',
    whileDoing: 'generating the label',
    existsCode: 'label-may-already-exist',
    existsSentence: (answer) =>
      `Shiprocket says shipment ${answer.shipmentId} already has a label ` +
      `(HTTP ${answer.status}). Download it from the shipment in the Shiprocket dashboard and ` +
      'attach it to this shipment — do not ask for another; a second one is billed.',
  }),
  [
    {
      code: 'label-refused',
      verdict: 'nothing-minted',
      when: () => true,
      refuse: (answer) =>
        new ShiprocketLabelRefusedError(
          `Shiprocket would not generate a label for shipment ${answer.shipmentId} ` +
            `(HTTP ${answer.status}). The reason is in the API logs. No label exists, so it is ` +
            'safe to correct the shipment and ask again.'
        ),
    },
  ]
);

type LabelRead =
  | { kind: 'generated'; url: string }
  /** Their flag says a label was made and no address for it came with it. */
  | { kind: 'generated-without-url' }
  | { kind: 'declined' }
  | { kind: 'unreadable' };

/**
 * Read a label answer, and never mistake "we could not read it" for "no".
 *
 * The same rule `readAwbAssignment` states, on a body that is flat rather than
 * enveloped: `label_created`, `label_url`, `not_created`, transcribed from the
 * documented shape. `declined` is only ever returned on a POSITIVE signal —
 * their flag at 0, our shipment named in `not_created`, or a `label_url` they
 * named and left blank — because "declined" is the one answer whose advice is
 * to ask again, and asking again is billed.
 */
function readLabelAnswer(json: unknown, shipmentId: string): LabelRead {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { kind: 'unreadable' };
  }
  const body = json as Record<string, unknown>;

  const url = asText(body.label_url);
  if (url !== '') return { kind: 'generated', url };

  // Through `finiteNumber`, so a missing flag is neither 0 nor 1.
  const flag = finiteNumber(body.label_created);
  if (flag === 1) return { kind: 'generated-without-url' };
  if (flag === 0) return { kind: 'declined' };

  const notCreated = Array.isArray(body.not_created) ? body.not_created.map(asText) : [];
  if (notCreated.includes(shipmentId)) return { kind: 'declined' };

  if (Object.prototype.hasOwnProperty.call(body, 'label_url')) return { kind: 'declined' };

  return { kind: 'unreadable' };
}

/**
 * An accepted label answer, reduced to what the clauses read.
 *
 * `url` is here because ONE clause has to look at it, and it is the last time
 * the URL is anything but an argument to `fetch`: no clause puts it in a
 * message, `logCourierAnswer` never sees it, and the outcome carries bytes.
 */
interface LabelAnswer {
  readonly shipmentId: string;
  readonly kind: LabelRead['kind'];
  readonly url: string;
}

/**
 * Only an https address is fetched. The URL is a signed link to a file on a
 * host Shiprocket chooses; a plain-http one would carry that signature — and
 * the customer's address behind it — in the clear.
 */
function isFetchableLabelUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * How an ACCEPTED `courier/generate/label` answer is classified.
 *
 * Every open clause here means the same thing: a label may exist and may have
 * been billed, and the operator's job is to go and get it rather than ask for
 * another. The one definite refusal is reached only on a positive "no" from
 * Shiprocket. The three open kinds are mutually exclusive on `kind`, so the
 * order inside the open group decides only which sentence is read — and it is
 * still pinned, because a sentence is what an operator acts on.
 */
const LABEL_ANSWER_CLAUSES = orderedClauses<LabelAnswer>(
  [
    {
      code: 'answer-unreadable',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'unreadable',
      log: () => ({ what: 'label request answered with something we cannot read' }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket accepted the label request for shipment ${answer.shipmentId} and answered ` +
            'with something this client cannot read, so it is not known whether a label was ' +
            'generated and billed. Look the shipment up in the Shiprocket dashboard and download ' +
            'any label it has — do not ask for another until you have looked.'
        ),
    },
    {
      code: 'label-without-url',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'generated-without-url',
      log: () => ({ what: 'label request answered created, with no file to fetch' }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket says it generated a label for shipment ${answer.shipmentId} but gave no ` +
            'file for it. The label may exist and be billed — download it from the shipment in ' +
            'the Shiprocket dashboard and attach it; do not ask for another until you have looked.'
        ),
    },
    {
      // The URL itself goes nowhere: not into the message, not into the log.
      code: 'label-url-unusable',
      verdict: 'may-have-minted',
      when: (answer) => answer.kind === 'generated' && !isFetchableLabelUrl(answer.url),
      log: () => ({ what: 'label file is not at an https address this client will fetch from' }),
      refuse: (answer) =>
        new ShiprocketWriteOutcomeUnknownError(
          `Shiprocket generated a label for shipment ${answer.shipmentId} at an address this ` +
            'client will not fetch from. The label EXISTS and is billed — download it from the ' +
            'shipment in the Shiprocket dashboard and attach it; do not ask for another.'
        ),
    },
  ],
  [
    {
      code: 'label-declined',
      verdict: 'nothing-minted',
      when: (answer) => answer.kind === 'declined',
      log: () => ({ what: 'courier generated no label' }),
      refuse: (answer) =>
        new ShiprocketLabelRefusedError(
          `Shiprocket generated no label for shipment ${answer.shipmentId}. The reason is in the ` +
            'API logs. No label exists, so it is safe to correct the shipment and ask again.'
        ),
    },
  ]
);

function labelNotFetched(shipmentId: string, reason: string): ShiprocketLabelFetchFailedError {
  return new ShiprocketLabelFetchFailedError(
    `Shiprocket generated a label for shipment ${shipmentId} but ${reason}. The label EXISTS at ` +
      'Shiprocket — download it from the shipment in the dashboard and attach it, or ask again ' +
      'knowing that Shiprocket may bill a second label.'
  );
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/**
 * Fetch the file the label URL points at, and hand back its bytes.
 *
 * Three things this GET deliberately does not do:
 *
 * - **It does not send the bearer token.** The file is on a third-party host
 *   Shiprocket chose; our token there is a credential handed to whoever runs
 *   it, and it buys nothing — the URL is already signed.
 * - **It does not log the URL, or the driver's error.** A fetch error's text
 *   can quote the URL it was given (`Invalid URL: https://…`), and the URL is
 *   the customer's address behind a link. The error's NAME is logged; nothing
 *   else of it.
 * - **It does not buffer first and check later.** The cap is checked on
 *   `Content-Length` before the body is read, and a host that sends no length
 *   is checked on the bytes it sent.
 *
 * Every failure is `ShiprocketLabelFetchFailedError`, and every message says
 * the label exists — the purchase happened, the download did not, and a caller
 * that read this as "no label" would buy a second one.
 */
async function fetchLabelPdf(url: string, shipmentId: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error(
      { shipmentId, errorName: error instanceof Error ? error.name : typeof error },
      'shiprocket: label file host did not answer'
    );
    throw labelNotFetched(shipmentId, 'the label file host did not answer');
  }

  if (!response.ok) {
    logger.error({ shipmentId, status: response.status }, 'shiprocket: label file host refused');
    throw labelNotFetched(shipmentId, `the label file host answered HTTP ${response.status}`);
  }

  const declared = finiteNumber(response.headers?.get?.('content-length'));
  if (declared !== null && declared > LABEL_PDF_MAX_BYTES) {
    logger.error({ shipmentId, declaredBytes: declared }, 'shiprocket: label file too large');
    throw labelNotFetched(
      shipmentId,
      `the file is ${declared} bytes, more than the ${LABEL_PDF_MAX_BYTES} this client will store`
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    logger.error(
      { shipmentId, errorName: error instanceof Error ? error.name : typeof error },
      'shiprocket: label file did not finish arriving'
    );
    throw labelNotFetched(shipmentId, 'the label file did not finish arriving');
  }

  if (bytes.byteLength > LABEL_PDF_MAX_BYTES) {
    logger.error({ shipmentId, receivedBytes: bytes.byteLength }, 'shiprocket: label file too large');
    throw labelNotFetched(
      shipmentId,
      `the file is ${bytes.byteLength} bytes, more than the ${LABEL_PDF_MAX_BYTES} this client will store`
    );
  }

  if (!looksLikePdf(bytes)) {
    // What an expired signed URL answers with on some hosts: HTTP 200 and an
    // XML error document. Stored under `<token>.pdf`, that is a label nobody
    // can print and a token that says one exists.
    logger.error({ shipmentId, receivedBytes: bytes.byteLength }, 'shiprocket: label file is not a PDF');
    throw labelNotFetched(shipmentId, 'the file it pointed at is not a PDF');
  }

  return bytes;
}

/**
 * The label requests this process currently has in flight, keyed by
 * Shiprocket's shipment id. Overlap only, released in a `finally` — see
 * `assignsInFlight`, whose argument applies here with more force: a second
 * concurrent label is a second invoice line, not just a second waybill.
 */
const labelsInFlight = new Map<string, Promise<LabelOutcome>>();

/**
 * Render the shipping label for a shipment and return the PDF's bytes.
 *
 * ## The ordering, which is the design and not an accident
 *
 * 1. **The held token first**, before the join, before configuration, before
 *    the login. A caller holding a token has a label; nothing about this call
 *    should happen, and nothing does — not even a network round trip to find
 *    out we are configured.
 * 2. **Then the write**, whose every non-answer is
 *    `ShiprocketWriteOutcomeUnknownError`, decided by `LABEL_REFUSAL_CLAUSES`
 *    and `LABEL_ANSWER_CLAUSES` on the same terms as the other two writes.
 * 3. **Then the fetch**, which is a READ of a file that already exists, and
 *    whose failures therefore say so: `ShiprocketLabelFetchFailedError`,
 *    never a refusal that invites a second purchase.
 *
 * The URL is an argument to `fetch` and nothing else. It is not in the
 * outcome, not in any message, and not in any log line — see `fetchLabelPdf`.
 */
export async function generateLabel(request: GenerateLabelRequest): Promise<LabelOutcome> {
  const shipmentId = request.shipmentId.trim();
  if (shipmentId === '') {
    throw new ShiprocketError(
      'No Shiprocket shipment id was supplied, so there is nothing to generate a label for. ' +
        'The id comes back from the courier-order create and belongs in ' +
        '`order_shipments.external_shipment_id`; recover it there before dispatching.',
      'SHIPROCKET_SHIPMENT_ID_MISSING'
    );
  }

  // Trimmed, so a token with a stray space is still a token: the safe reading
  // of a value that is almost a token is that a label was bought.
  const held = (request.heldLabelObjectToken ?? '').trim();
  if (held !== '') return { generated: false, labelObjectToken: held };

  const joined = labelsInFlight.get(shipmentId);
  if (joined) return joined;

  const run = generateLabelOnce(shipmentId);
  labelsInFlight.set(shipmentId, run);

  try {
    return await run;
  } finally {
    labelsInFlight.delete(shipmentId);
  }
}

async function generateLabelOnce(shipmentId: string): Promise<LabelOutcome> {
  const body: Record<string, unknown> = { shipment_id: [shipmentIdOnTheWire(shipmentId)] };

  const outcome = await postCourierWrite('/courier/generate/label', body, {
    context: { shipmentId },
    message:
      `Shiprocket did not answer the request to generate a label for shipment ${shipmentId}. ` +
      'A label may have been generated and billed — check the shipment in the Shiprocket ' +
      'dashboard for one before asking again.',
  });

  const logAnswer = (what: string, extra: Record<string, unknown> = {}) =>
    logCourierAnswer(
      what,
      { status: outcome.status, shipmentId, ...extra },
      outcome,
      payloadEchoes(body)
    );

  if (!outcome.ok) {
    logAnswer(refusedWriteLabel(outcome.status));

    const answer: RefusedLabel = {
      status: outcome.status,
      said: refusalReason(outcome.json),
      shipmentId,
    };
    throw firstClause(LABEL_REFUSAL_CLAUSES, answer)!.refuse(answer);
  }

  const read = readLabelAnswer(outcome.json, shipmentId);
  const answer: LabelAnswer = {
    shipmentId,
    kind: read.kind,
    url: read.kind === 'generated' ? read.url : '',
  };

  const clause = firstClause(LABEL_ANSWER_CLAUSES, answer);
  if (clause) {
    const line = clause.log?.(answer);
    if (line) logAnswer(line.what, line.extra);
    throw clause.refuse(answer);
  }

  return { generated: true, pdf: await fetchLabelPdf(answer.url, shipmentId) };
}

// ============================================================================
// The pickup (#727) — the one write that mints nothing, so it may be retried
// ============================================================================

export interface SchedulePickupRequest {
  /** SHIPROCKET's shipment id — `external_shipment_id`. See `AssignAwbRequest`. */
  shipmentId: string;
}

export interface PickupSchedule {
  /** Their `pickup_scheduled_date`, as they wrote it. Null when they gave none. */
  readonly scheduledFor: string | null;
  readonly tokenNumber: string | null;
  /**
   * True when Shiprocket answered that a pickup was ALREADY in the queue.
   *
   * Reported rather than folded into plain success, because a caller retrying
   * after an unanswered request wants to know the first request landed — and
   * because the audit row for "we asked for a pickup" is owed once.
   */
  readonly alreadyScheduled: boolean;
}

/**
 * Their wording for "you already asked" — premise 5 in the module header.
 * Read as success, which is what lets a pickup retry converge.
 */
const PICKUP_ALREADY_QUEUED = /\balready\s+(?:in\s+(?:the\s+)?pickup\s+queue|scheduled|requested)\b/i;

/** A date inside a sentence, in the shape their queue message carries one. */
const DATE_IN_SENTENCE = /(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/;

function dateIn(sentence: string): string | null {
  return sentence.match(DATE_IN_SENTENCE)?.[1] ?? null;
}

function pickupNotScheduled(shipmentId: string, reason: string): ShiprocketPickupNotScheduledError {
  return new ShiprocketPickupNotScheduledError(
    `${reason} for shipment ${shipmentId}. Nothing was scheduled and nothing was billed. The ` +
      'label for this shipment is unaffected — keep it, and ask for the pickup again; a pickup ' +
      'already in the queue is reported as scheduled.'
  );
}

type PickupRead =
  | { kind: 'scheduled'; scheduledFor: string | null; tokenNumber: string | null }
  | { kind: 'already'; scheduledFor: string | null }
  | { kind: 'nothing' };

/**
 * Read a pickup answer. Transcribed shape: `pickup_status` at the root, and a
 * `response` envelope carrying `pickup_scheduled_date` and
 * `pickup_token_number`. A date or a token is taken as scheduled even without
 * the flag — they are the two facts a courier acts on — and their "already"
 * sentence on a 200 is read the same way it is on a 400.
 */
function readPickupAnswer(json: unknown): PickupRead {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { kind: 'nothing' };
  const body = json as Record<string, unknown>;

  const node = body.response;
  const envelope =
    typeof node === 'object' && node !== null && !Array.isArray(node)
      ? (node as Record<string, unknown>)
      : {};

  const scheduledFor = asText(envelope.pickup_scheduled_date) || null;
  const tokenNumber = asText(envelope.pickup_token_number) || null;
  if (finiteNumber(body.pickup_status) === 1 || scheduledFor !== null || tokenNumber !== null) {
    return { kind: 'scheduled', scheduledFor, tokenNumber };
  }

  const said = refusalReason(json);
  if (PICKUP_ALREADY_QUEUED.test(said)) return { kind: 'already', scheduledFor: dateIn(said) };

  return { kind: 'nothing' };
}

/** Overlap only, as with the other maps. A pickup asked for twice is harmless; asked for twice at once is still one request. */
const pickupsInFlight = new Map<string, Promise<PickupSchedule>>();

/**
 * Ask the courier to collect this shipment.
 *
 * ## Why this write is not decided by `COURIER_WRITE_CLAUSES`
 *
 * Every table there answers "was something minted?", and the safety property
 * they encode is that an unknown answer must not become "ask again". A pickup
 * request mints nothing: a second one for a queued shipment is answered
 * "already in pickup queue" (premise 5), which this function reads as
 * success. So the question those tables exist to keep in order does not
 * arise, and every refusal here — a non-answer included — is
 * `ShiprocketPickupNotScheduledError`, retryable as it stands. The two
 * exceptions are the ones every authenticated call shares: configuration and
 * the credential, which pass through untouched.
 *
 * ## What a failed pickup is not
 *
 * Not a reason to void the label. The ticket says so, the error's message
 * says so, and this function makes no request that could do so.
 */
export async function schedulePickup(request: SchedulePickupRequest): Promise<PickupSchedule> {
  const shipmentId = request.shipmentId.trim();
  if (shipmentId === '') {
    throw new ShiprocketError(
      'No Shiprocket shipment id was supplied, so there is nothing to schedule a pickup for. ' +
        'The id comes back from the courier-order create and belongs in ' +
        '`order_shipments.external_shipment_id`; recover it there before dispatching.',
      'SHIPROCKET_SHIPMENT_ID_MISSING'
    );
  }

  const joined = pickupsInFlight.get(shipmentId);
  if (joined) return joined;

  const run = schedulePickupOnce(shipmentId);
  pickupsInFlight.set(shipmentId, run);

  try {
    return await run;
  } finally {
    pickupsInFlight.delete(shipmentId);
  }
}

async function schedulePickupOnce(shipmentId: string): Promise<PickupSchedule> {
  const body: Record<string, unknown> = { shipment_id: [shipmentIdOnTheWire(shipmentId)] };

  let outcome: CourierWriteOutcome;
  try {
    outcome = await postCourierWrite('/courier/generate/pickup', body, {
      context: { shipmentId },
      message: `Shiprocket did not answer the pickup request for shipment ${shipmentId}.`,
    });
  } catch (error) {
    // The one write where a non-answer is NOT an unknown outcome — see the
    // function's doc block. Configuration and credential failures are not
    // this type and pass through.
    if (error instanceof ShiprocketWriteOutcomeUnknownError) {
      throw pickupNotScheduled(shipmentId, 'Shiprocket did not answer the pickup request');
    }
    throw error;
  }

  const logAnswer = (what: string, extra: Record<string, unknown> = {}) =>
    logCourierAnswer(
      what,
      { status: outcome.status, shipmentId, ...extra },
      outcome,
      payloadEchoes(body)
    );

  if (!outcome.ok) {
    // The credential before their sentence, for the reason the shared clauses
    // give: on a 401 their sentence is about the token.
    if (tokenWasRejected(outcome.status)) {
      logAnswer(refusedWriteLabel(outcome.status));
      forgetTokenAfter(outcome.status);
      throw tokenWentStale('scheduling the pickup');
    }

    const said = refusalReason(outcome.json);
    if (PICKUP_ALREADY_QUEUED.test(said)) {
      return { scheduledFor: dateIn(said), tokenNumber: null, alreadyScheduled: true };
    }

    logAnswer(refusedWriteLabel(outcome.status));
    throw pickupNotScheduled(
      shipmentId,
      `Shiprocket would not schedule the pickup (HTTP ${outcome.status}; the reason is in the API logs)`
    );
  }

  const read = readPickupAnswer(outcome.json);
  if (read.kind === 'scheduled') {
    return { scheduledFor: read.scheduledFor, tokenNumber: read.tokenNumber, alreadyScheduled: false };
  }
  if (read.kind === 'already') {
    return { scheduledFor: read.scheduledFor, tokenNumber: null, alreadyScheduled: true };
  }

  logAnswer('pickup request answered with no schedule');
  throw pickupNotScheduled(
    shipmentId,
    'Shiprocket accepted the pickup request and scheduled nothing'
  );
}

// ============================================================================
// The cancellation (#731) — the write that unmints, so "already" is success
// ============================================================================

export interface CancelCourierShipmentRequest {
  /** The waybill on `order_shipments.awb_number`. Shiprocket cancels by AWB. */
  awb: string;
}

export interface CourierCancellation {
  readonly cancelled: true;
  /** Shiprocket had already cancelled it. The goal was met before we asked. */
  readonly alreadyCancelled: boolean;
}

/** Their wording for a cancellation that has already happened. Read as success. */
const CANCEL_ALREADY_DONE = /\balready\s+(?:cancell?ed|canceled)\b/i;

/** Their wording, on an HTTP 200, for a cancellation that did not happen. */
const CANCEL_DID_NOT_HAPPEN = /\b(?:fail(?:ed|ure)?|could\s+not|cannot|can't|unable|not\s+allowed)\b/i;

const CANCEL_REASON_MAX_CHARS = 200;

/**
 * Ask Shiprocket to cancel a shipment, by AWB.
 *
 * ## Not one of `COURIER_WRITE_CLAUSES`, and why
 *
 * Those tables keep one question in order — *was something minted, and is it
 * safe to ask again?* — and the answer that must never be reached wrongly is
 * "safe to ask again". A cancellation inverts it: asking a courier to cancel
 * something already cancelled is the goal already met, so their "already
 * cancelled" is read as SUCCESS rather than as a duplicate to reconcile.
 *
 * What does not invert is the direction of doubt. A cancellation that did
 * not ANSWER may or may not have happened, and a caller that marked the
 * label void on a guess would have the vendor stop seeing a label the
 * courier still honours — the exact harm #731 names. So a non-answer, a 5xx
 * and an unreadable 200 are all `ShiprocketWriteOutcomeUnknownError`, and
 * the caller leaves the row alone. A refusal is its own code.
 */
export async function cancelCourierShipment(
  request: CancelCourierShipmentRequest
): Promise<CourierCancellation> {
  const awb = request.awb.trim();
  if (awb === '') {
    throw new ShiprocketError(
      'No AWB was supplied, so there is nothing to cancel. The waybill belongs in ' +
        '`order_shipments.awb_number`; a claim with no waybill is reconciled, not voided.',
      'SHIPROCKET_SHIPMENT_ID_MISSING'
    );
  }

  const body: Record<string, unknown> = { awbs: [awb] };
  const outcome = await postCourierWrite('/orders/cancel/shipment/awbs', body, {
    context: { awb },
    message:
      `Shiprocket did not answer the request to cancel AWB ${awb}. The cancellation may or may ` +
      'not have happened — check the shipment in the Shiprocket dashboard before marking the ' +
      'label void, and do not void it on a guess.',
  });

  const echoes = payloadEchoes(body);
  const logAnswer = (what: string) =>
    logCourierAnswer(what, { status: outcome.status, awb }, outcome, echoes);
  const said = refusalReason(outcome.json);

  if (!outcome.ok) {
    if (tokenWasRejected(outcome.status)) {
      logAnswer(refusedWriteLabel(outcome.status));
      forgetTokenAfter(outcome.status);
      throw tokenWentStale('cancelling the shipment');
    }

    if (outcome.status < 400 || outcome.status >= 500) {
      logAnswer('cancellation did not complete');
      throw new ShiprocketWriteOutcomeUnknownError(
        `Shiprocket did not complete the cancellation of AWB ${awb} (HTTP ${outcome.status}). ` +
          'Check the shipment in the Shiprocket dashboard before marking the label void.'
      );
    }

    if (CANCEL_ALREADY_DONE.test(said)) {
      return { cancelled: true, alreadyCancelled: true };
    }

    logAnswer(refusedWriteLabel(outcome.status));
    throw new ShiprocketCancelRefusedError(
      `Shiprocket would not cancel AWB ${awb} (HTTP ${outcome.status})${courierReason(said, echoes)}. ` +
        'The label stands and the row was not voided.'
    );
  }

  if (typeof outcome.json !== 'object' || outcome.json === null || Array.isArray(outcome.json)) {
    logAnswer('cancellation answered with something we cannot read');
    throw new ShiprocketWriteOutcomeUnknownError(
      `Shiprocket accepted the cancellation of AWB ${awb} and answered with something this ` +
        'client cannot read, so it is not known whether the shipment was cancelled. Check the ' +
        'Shiprocket dashboard before marking the label void.'
    );
  }

  const envelope = outcome.json as Record<string, unknown>;
  if (finiteNumber(envelope.status) === 0 || CANCEL_DID_NOT_HAPPEN.test(said)) {
    logAnswer('courier did not cancel');
    throw new ShiprocketCancelRefusedError(
      `Shiprocket did not cancel AWB ${awb}${courierReason(said, echoes)}. The label stands and ` +
        'the row was not voided.'
    );
  }

  return { cancelled: true, alreadyCancelled: CANCEL_ALREADY_DONE.test(said) };
}

/**
 * The courier's sentence for the void route's message — scrubbed against the
 * one value we sent, capped, and withheld entirely if a sent value survived.
 */
function courierReason(said: string, echoes: readonly EchoedField[]): string {
  const scrubbed = scrubEchoedValues(said, echoes);
  if (scrubbed.withheld.length > 0 || scrubbed.text.trim() === '') return '';
  return `: ${scrubbed.text.trim().slice(0, CANCEL_REASON_MAX_CHARS)}`;
}

/**
 * Every ordered decision this client makes about a courier write.
 *
 * Exported for one reason: `tests/services/shiprocket-courier-writes.test.ts`
 * holds these sequences to a named order, proves each adjacency decides
 * something with a body that satisfies both clauses, and checks that the
 * verdict a clause declares and the HTTP status `SHIPROCKET_REFUSAL_STATUS`
 * gives its error are two statements of the same fact. Without the export
 * those properties are assertable only through prose.
 *
 * Typed as a PROJECTION — the code and the verdict, not `when` or `refuse` —
 * so reading this export cannot become a way for another module to re-run this
 * client's decisions on a body of its own. The values are the real tables; the
 * type is what a reader is allowed to do with them.
 *
 * The pickup is absent on purpose: it mints nothing, so it has no mint
 * question to keep in order. `schedulePickup`'s doc block says why.
 */
export const COURIER_WRITE_CLAUSES: Readonly<
  Record<string, ReadonlyArray<{ readonly code: string; readonly verdict: MintVerdict }>>
> = {
  'create: a refused answer': CREATE_REFUSAL_CLAUSES,
  'create: an accepted answer': CREATE_ACCEPTED_CLAUSES,
  'assign: a refused answer': ASSIGN_REFUSAL_CLAUSES,
  'assign: an accepted answer': AWB_ANSWER_CLAUSES,
  'label: a refused answer': LABEL_REFUSAL_CLAUSES,
  'label: an accepted answer': LABEL_ANSWER_CLAUSES,
};
