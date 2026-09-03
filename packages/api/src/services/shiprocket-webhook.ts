/**
 * What the Shiprocket webhook receiver needs that the client does not (#732),
 * and what it does with a push once it has one (#733).
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
 * ## Applying a push
 *
 * `applyStatusPush` takes a verified, attributed, first-seen push and:
 *
 * 1. maps their status onto ours through `SHIPROCKET_STATUSES` — a data
 *    table, so the unmapped set is inspectable. An UNKNOWN status is recorded
 *    as an audit row (`shipment.status_unmapped`) where an admin will see it,
 *    changes nothing, and does not crash the webhook. A known-but-ignored
 *    status is acknowledged in silence.
 * 2. refuses to move a shipment to where it already is, or backwards along
 *    the delivery path (`shipmentMayMoveTo`). Replays and late scans are the
 *    ordinary case, and this is what makes the whole receiver idempotent even
 *    when Redis is down.
 * 3. in ONE transaction: locks the row, writes the shipment status (stamping
 *    `shipped_at` / `delivered_at` as the admin route does), moves the order
 *    through the SAME tables the admin route uses
 *    (`ORDER_STATUS_FOR_SHIPMENT_STATUS`, `orderShouldMoveTo`), and records
 *    `shipment.tracking_updated` with the courier's words in its metadata.
 * 4. fires the notification for the new status AFTER the commit and WITHOUT
 *    awaiting it: mail is slow, the courier is waiting for a 200, and a
 *    failed mail is logged rather than turned into a retry of the whole push.
 *    RTO and NDR each have their own message.
 *
 * @see packages/api/src/routes/webhooks/shiprocket.ts
 * @see packages/api/src/lib/shipment-status.ts
 * @see packages/api/tests/routes/webhooks/shiprocket.test.ts
 * @see packages/api/tests/services/shiprocket-webhook-apply.test.ts
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../database';
import { orders, type OrderStatus } from '../database/schema/orders';
import { orderShipments, type ShipmentStatus } from '../database/schema/shipping';
import type { NotificationType } from '../database/schema/notifications';
import { recordAudit } from '../lib/audit';
import { logger } from '../lib/logger';
import {
  ORDER_STATUS_FOR_SHIPMENT_STATUS,
  mapShiprocketStatus,
  orderShouldMoveTo,
  shipmentMayMoveTo,
} from '../lib/shipment-status';
import { sendOrderNotification } from './notifications';
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
  /** Their status text, verbatim. `SHIPROCKET_STATUSES` maps it. */
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

/**
 * The part of a request context `recordAudit` reads. Structural, as
 * `lib/audit.ts` declares it, so the receiver hands over its Hono context and
 * a replay script hands over a stub.
 */
export interface WebhookActor {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  req: {
    method: string;
    path: string;
    header(name: string): string | undefined;
  };
}

export type ApplyOutcome =
  | {
      applied: true;
      shipmentStatus: ShipmentStatus;
      /** Where the order is after this push, moved or not. */
      orderStatus: OrderStatus;
      orderMoved: boolean;
      /** The notification fired for the new status, or null for none. */
      notification: NotificationType | null;
    }
  | {
      applied: false;
      reason:
        | 'unmapped_status'
        | 'ignored_status'
        | 'already_there'
        | 'out_of_order'
        | 'shipment_not_found';
      shipmentStatus?: ShipmentStatus;
    };

/**
 * What a customer hears when a shipment reaches a status. `null` is a
 * decision: nobody wants a message per hub scan.
 */
const NOTIFICATION_FOR_SHIPMENT_STATUS: Record<ShipmentStatus, NotificationType | null> = {
  pending: null,
  label_created: null,
  shipped: 'shipped',
  in_transit: null,
  out_for_delivery: 'out_for_delivery',
  undelivered: 'delivery_attempt_failed',
  delivered: 'delivered',
  rto_initiated: 'returning_to_sender',
  /** Back with the vendor. The customer heard about the RTO when it started. */
  rto_delivered: null,
  lost: null,
  cancelled: null,
  failed: null,
};

/**
 * Apply a verified, attributed, first-seen push. See the module header for
 * the four steps; this is them in order.
 */
export async function applyStatusPush(
  push: AttributedStatusPush,
  actor: WebhookActor
): Promise<ApplyOutcome> {
  // 1. Theirs onto ours.
  const mapping = mapShiprocketStatus(push, { detail: true });
  if (mapping.ours === null) {
    if (!mapping.known) {
      logger.warn(
        {
          shipmentId: push.shipmentId,
          awb: push.awb,
          shiprocketStatus: push.status,
          shiprocketStatusId: push.statusId,
        },
        'shiprocket webhook: status has no mapping, recorded and left alone'
      );
      await recordAudit(actor, {
        action: 'shipment.status_unmapped',
        entityType: 'order_shipment',
        entityId: push.shipmentId,
        summary: `Shiprocket reported "${push.status}" (${push.statusId ?? 'no id'}) for AWB ${push.awb}, which this system has no mapping for`,
        // `failure`, so it stands out in the audit viewer: the push was
        // received and nothing was done with it, which is the fact an admin
        // needs to see.
        outcome: 'failure',
        metadata: {
          orderId: push.orderId,
          awb: push.awb,
          shiprocketStatus: push.status,
          shiprocketStatusId: push.statusId,
          reportedAt: push.at,
        },
      });
      return { applied: false, reason: 'unmapped_status' };
    }
    return { applied: false, reason: 'ignored_status' };
  }
  const next = mapping.ours;

  // 2 and 3. The move, decided and made under the row lock.
  const moved = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: orderShipments.id,
        orderId: orderShipments.orderId,
        status: orderShipments.status,
        orderStatus: orders.status,
      })
      .from(orderShipments)
      .innerJoin(orders, eq(orders.id, orderShipments.orderId))
      .where(eq(orderShipments.id, push.shipmentId))
      .limit(1)
      .for('update');

    if (!row) return { applied: false as const, reason: 'shipment_not_found' as const };

    if (row.status === next) {
      return { applied: false as const, reason: 'already_there' as const, shipmentStatus: row.status };
    }
    if (!shipmentMayMoveTo(row.status, next)) {
      return { applied: false as const, reason: 'out_of_order' as const, shipmentStatus: row.status };
    }

    const now = new Date();
    const shipmentValues: Partial<typeof orderShipments.$inferInsert> = {
      status: next,
      updatedAt: now,
    };
    if (next === 'shipped') shipmentValues.shippedAt = now;
    if (next === 'delivered') shipmentValues.deliveredAt = now;

    const written = await tx
      .update(orderShipments)
      .set(shipmentValues)
      .where(and(eq(orderShipments.id, row.id), eq(orderShipments.status, row.status)))
      .returning({ id: orderShipments.id });
    if (written.length !== 1) {
      // Moved under the lock we hold: not possible on Postgres, and reported
      // rather than assumed if a driver ever makes it possible.
      throw new Error(`shipment ${row.id} moved while its status was being written`);
    }

    // The order, through the same table the admin route reads.
    let orderStatus: OrderStatus = row.orderStatus;
    let orderMoved = false;
    const nextOrderStatus = ORDER_STATUS_FOR_SHIPMENT_STATUS[next];
    if (orderShouldMoveTo(row.orderStatus, nextOrderStatus)) {
      const orderValues: Partial<typeof orders.$inferInsert> = {
        status: nextOrderStatus,
        updatedAt: now,
      };
      if (nextOrderStatus === 'shipped') orderValues.shippedAt = now;
      if (nextOrderStatus === 'delivered') orderValues.deliveredAt = now;

      const movedRows = await tx
        .update(orders)
        .set(orderValues)
        .where(and(eq(orders.id, row.orderId), eq(orders.status, row.orderStatus)))
        .returning({ id: orders.id });

      if (movedRows.length === 1) {
        orderStatus = nextOrderStatus;
        orderMoved = true;
      } else {
        // An admin moved the order between our read and our write. The
        // shipment fact still lands; the order is somebody's decision now.
        logger.warn(
          { shipmentId: row.id, orderId: row.orderId, from: row.orderStatus, to: nextOrderStatus },
          'shiprocket webhook: order moved concurrently, left where it is'
        );
      }
    }

    await recordAudit(
      actor,
      {
        action: 'shipment.tracking_updated',
        entityType: 'order_shipment',
        entityId: row.id,
        summary: `Courier reported ${next.replace(/_/g, ' ')} for AWB ${push.awb}`,
        before: { status: row.status, orderStatus: row.orderStatus },
        after: { status: next, orderStatus },
        metadata: {
          orderId: row.orderId,
          source: 'shiprocket_webhook',
          awb: push.awb,
          shiprocketStatus: push.status,
          shiprocketStatusId: push.statusId,
          reportedAt: push.at,
          courierName: push.courierName,
        },
      },
      tx
    );

    return { applied: true as const, shipmentStatus: next, orderStatus, orderMoved, orderId: row.orderId };
  });

  if (!moved.applied) return moved;

  // 4. The customer, after the commit and off the request's clock.
  const notification = NOTIFICATION_FOR_SHIPMENT_STATUS[moved.shipmentStatus];
  if (notification !== null) {
    void sendOrderNotification({ orderId: moved.orderId, type: notification }).catch((error) => {
      logger.error(
        { err: error, shipmentId: push.shipmentId, notification },
        'shiprocket webhook: notification failed'
      );
    });
  }

  return {
    applied: true,
    shipmentStatus: moved.shipmentStatus,
    orderStatus: moved.orderStatus,
    orderMoved: moved.orderMoved,
    notification,
  };
}
