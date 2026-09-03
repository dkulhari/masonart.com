/**
 * POST /api/webhooks/shiprocket — Shiprocket's status pushes (#732).
 *
 * The order of this handler is the whole ticket:
 *
 * 1. **Verify before parsing.** The `x-api-key` header is checked in constant
 *    time against `SHIPROCKET_WEBHOOK_SECRET` before the body is read. An
 *    unverified request is answered 401 with no detail, writes nothing, and
 *    logs nothing of its payload — an attacker gets no oracle and the log
 *    gets no garbage.
 * 2. **Parse before the database.** A body that is not a push is a 400 with
 *    no query issued.
 * 3. **Look up by OUR key.** The AWB finds the live row in `order_shipments`.
 *    The payload's own claims about which order it is — `order_id`,
 *    `sr_order_id` — are checked against that row, never used to find one.
 *    A push naming another order is refused (409) and nothing is applied.
 * 4. **Dedupe, then apply.** The event is marked in Redis with `SET NX` before
 *    it is applied; a replay is acknowledged and not applied. If applying
 *    fails, the mark is released so the retry is not deduplicated into
 *    silence. With Redis down the push is applied anyway: at-least-once is
 *    what a webhook is, and #733's mapping is idempotent on its own.
 *
 * Answers are fast because the handler does one read, one Redis call and
 * hands off. Anything slow that follows a status change (mail, SMS) is
 * #733's, and belongs after the response.
 *
 * @see packages/api/src/services/shiprocket-webhook.ts
 */

import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../database';
import { orders } from '../../database/schema/orders';
import { orderShipments } from '../../database/schema/shipping';
import { logger } from '../../lib/logger';
import { redis, isRedisConnected } from '../../lib/redis';
import {
  SHIPROCKET_WEBHOOK_SECRET_VAR,
  WEBHOOK_EVENT_TTL_SECONDS,
  applyStatusPush,
  getShiprocketWebhookSecret,
  parseStatusPush,
  pushNamesRow,
  statusPushEventId,
  webhookKeyMatches,
} from '../../services/shiprocket-webhook';

export const shiprocketWebhookApp = new Hono();

shiprocketWebhookApp.post('/', async (c) => {
  // 0. Configured at all? Refused before any comparison, so an empty header
  // can never match an empty secret.
  const secret = getShiprocketWebhookSecret();
  if (secret === null) {
    return c.json(
      {
        error:
          `Shiprocket webhooks are not configured: set ${SHIPROCKET_WEBHOOK_SECRET_VAR} to the ` +
          'key registered in the Shiprocket dashboard.',
        code: 'SHIPROCKET_WEBHOOK_NOT_CONFIGURED',
      },
      503
    );
  }

  // 1. Verify. Nothing of the request is logged on this branch.
  if (!webhookKeyMatches(c.req.header('x-api-key'), secret)) {
    logger.warn({ path: c.req.path }, 'shiprocket webhook: rejected');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 2. Parse.
  let json: unknown;
  try {
    json = JSON.parse(await c.req.text());
  } catch {
    return c.json({ error: 'Invalid JSON payload', code: 'SHIPROCKET_WEBHOOK_UNREADABLE' }, 400);
  }
  const push = parseStatusPush(json);
  if (!push) {
    return c.json(
      { error: 'The payload is not a Shiprocket status push', code: 'SHIPROCKET_WEBHOOK_UNREADABLE' },
      400
    );
  }

  // 3. Look up by OUR key: the live row carrying this AWB.
  const [row] = await db
    .select({
      id: orderShipments.id,
      orderId: orderShipments.orderId,
      externalOrderId: orderShipments.externalOrderId,
      orderNumber: orders.orderNumber,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(and(eq(orderShipments.awbNumber, push.awb), isNull(orderShipments.voidedAt)))
    .limit(1);

  if (!row) {
    // Acknowledged, not refused: a 4xx has Shiprocket retry a push about a
    // parcel we do not hold, forever. The AWB is a courier handle, not a person.
    logger.info({ awb: push.awb, status: push.status }, 'shiprocket webhook: unknown awb');
    return c.json({ received: true, applied: false, reason: 'unknown_awb' }, 200);
  }

  if (!pushNamesRow(push, row)) {
    logger.warn(
      { awb: push.awb, shipmentId: row.id },
      'shiprocket webhook: payload names an order this awb does not belong to'
    );
    return c.json(
      {
        error: 'The payload names an order that does not belong to this AWB',
        code: 'SHIPROCKET_WEBHOOK_MISMATCH',
      },
      409
    );
  }

  // 4. Dedupe, then apply.
  const eventKey = `webhook:shiprocket:${statusPushEventId(push)}`;
  let marked = false;
  if (isRedisConnected()) {
    const fresh = await redis.set(eventKey, '1', 'EX', WEBHOOK_EVENT_TTL_SECONDS, 'NX');
    if (fresh !== 'OK') {
      return c.json({ received: true, applied: false, duplicate: true, shipmentId: row.id }, 200);
    }
    marked = true;
  } else {
    logger.warn(
      { shipmentId: row.id },
      'shiprocket webhook: redis unavailable, applying without replay protection'
    );
  }

  try {
    const outcome = await applyStatusPush({ ...push, shipmentId: row.id, orderId: row.orderId });
    return c.json({ received: true, shipmentId: row.id, ...outcome }, 200);
  } catch (error) {
    if (marked) await redis.del(eventKey).catch(() => undefined);
    logger.error({ err: error, shipmentId: row.id }, 'shiprocket webhook: apply failed');
    return c.json({ error: 'Failed to apply the status push' }, 500);
  }
});
