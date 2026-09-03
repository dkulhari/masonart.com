/**
 * What the Shiprocket webhook receiver needs that the client does not (#732).
 *
 * Kept out of `services/shiprocket.ts` on purpose. That file is the CLIENT —
 * every export in it is a call we make to a courier, and
 * `tests/services/shiprocket-courier-writes.test.ts` holds its export list to
 * an account. A webhook is the courier calling us; it shares the vocabulary
 * (`courierOrderReference`, the env list) and nothing else.
 *
 * ## Verification
 *
 * Shiprocket sends the key configured in its dashboard as `x-api-key`. It is
 * held in `SHIPROCKET_WEBHOOK_SECRET` and compared by DIGEST: both sides are
 * hashed to 32 bytes and `timingSafeEqual` compares those. Hashing first is
 * not decoration — `timingSafeEqual` throws on buffers of unequal length, and
 * the obvious guard (`if (a.length !== b.length) return false`) leaks the
 * secret's length through timing. A plain `===` leaks its prefix.
 *
 * ## The payload is untrusted, including the fields that say which order it is
 *
 * `parseStatusPush` reads the documented fields and nothing else. The AWB is
 * the only key the receiver looks OUR row up by; `order_id` (our own
 * reference, `courierOrderReference`) and `sr_order_id` are checked AGAINST
 * that row and never used to find one. A push that names an order the AWB
 * does not belong to is refused.
 *
 * ## The seam
 *
 * `applyStatusPush` is where a verified, attributed, first-seen push goes.
 * #732 delivers the receiver; #733 delivers the mapping onto
 * `shipment_status` and the notifications that follow. Until then the seam
 * records nothing and says so in its answer, so a receiver deployed ahead of
 * the mapping is a receiver that acknowledges rather than one that guesses.
 *
 * @see packages/api/src/routes/webhooks/shiprocket.ts
 * @see packages/api/tests/routes/webhooks/shiprocket.test.ts
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { courierOrderReference } from './shiprocket';

export const SHIPROCKET_WEBHOOK_SECRET_VAR = 'SHIPROCKET_WEBHOOK_SECRET' as const;

/** How long a seen event is remembered. Shiprocket retries for hours, not weeks. */
export const WEBHOOK_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function getShiprocketWebhookSecret(): string | null {
  const raw = process.env[SHIPROCKET_WEBHOOK_SECRET_VAR];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time comparison of the presented key against the configured one.
 *
 * Over digests, so the comparison is always 32 bytes against 32 bytes — see
 * the module header for why a length guard is the wrong fix. Exact: no
 * trimming, no case folding. A key is a key.
 */
export function webhookKeyMatches(presented: string | undefined, secret: string): boolean {
  if (typeof presented !== 'string' || presented === '') return false;
  return timingSafeEqual(digest(presented), digest(secret));
}

/**
 * The fields of a Shiprocket tracking push this receiver reads.
 *
 * Transcribed from their documented shape; everything else in the body is
 * dropped at the parser. `sr_order_id` arrives as a number in their examples
 * and as a string in others, so both are taken and normalised to text — it is
 * compared against `order_shipments.external_order_id`, which is text.
 */
const statusPushSchema = z.object({
  // A string or a number, never coerced from absence: `z.coerce.string()`
  // turns a missing field into the text "undefined", which is an AWB.
  awb: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(z.string().min(1)),
  current_status: z.string().trim().min(1),
  current_status_id: z.coerce.number().int().optional(),
  sr_order_id: z.union([z.string(), z.number()]).optional(),
  order_id: z.string().optional(),
  current_timestamp: z.string().optional(),
  courier_name: z.string().optional(),
});

export interface ShipmentStatusPush {
  awb: string;
  /** Their status text, verbatim. #733 maps it; this module does not. */
  status: string;
  statusId: number | null;
  /** Shiprocket's own order id, as text, or null when the push named none. */
  srOrderId: string | null;
  /** OUR reference, as we sent it on the create, or null when absent. */
  reference: string | null;
  at: string | null;
  courierName: string | null;
}

export function parseStatusPush(json: unknown): ShipmentStatusPush | null {
  const parsed = statusPushSchema.safeParse(json);
  if (!parsed.success) return null;
  const p = parsed.data;

  const srOrderId = p.sr_order_id === undefined ? null : String(p.sr_order_id).trim();
  const reference = (p.order_id ?? '').trim();
  const at = (p.current_timestamp ?? '').trim();
  const courierName = (p.courier_name ?? '').trim();

  return {
    awb: p.awb,
    status: p.current_status,
    statusId: p.current_status_id ?? null,
    srOrderId: srOrderId === '' ? null : srOrderId,
    reference: reference === '' ? null : reference,
    at: at === '' ? null : at,
    courierName: courierName === '' ? null : courierName,
  };
}

/**
 * One event, one id. The AWB, the status and their timestamp — never the
 * order, so the dedupe key carries nothing person-linked into Redis and two
 * shipments of one order cannot mask each other's events.
 */
export function statusPushEventId(push: ShipmentStatusPush): string {
  return createHash('sha256')
    .update([push.awb, String(push.statusId ?? ''), push.status, push.at ?? ''].join('|'), 'utf8')
    .digest('hex');
}

/**
 * Does the push's own account of which order it is agree with the row the
 * AWB maps to? Either field absent is not a mismatch — the AWB is the key —
 * but a present field that names another order or another row is.
 */
export function pushNamesRow(
  push: ShipmentStatusPush,
  row: { id: string; orderNumber: string; externalOrderId: string | null }
): boolean {
  if (push.srOrderId !== null && row.externalOrderId !== null && push.srOrderId !== row.externalOrderId) {
    return false;
  }
  if (push.reference !== null && push.reference !== courierOrderReference(row.orderNumber, row.id)) {
    return false;
  }
  return true;
}

/** A verified, attributed, first-seen push, ready to be applied. */
export interface AttributedStatusPush extends ShipmentStatusPush {
  shipmentId: string;
  orderId: string;
}

export interface ApplyOutcome {
  applied: boolean;
  reason?: string;
}

/**
 * The seam #733 fills: map the status onto `shipment_status`, move the
 * order, fire the notifications. Until it lands this records nothing and
 * says so — a receiver that acknowledges, not one that guesses.
 */
export async function applyStatusPush(_push: AttributedStatusPush): Promise<ApplyOutcome> {
  return { applied: false, reason: 'status_mapping_not_yet_delivered' };
}
