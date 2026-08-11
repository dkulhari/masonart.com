/**
 * Gift Card Delivery
 *
 * Minting and sending are the same event.
 *
 * Only the hash of a code is stored, so the plaintext exists exactly once —
 * in the return value of `issueGiftCard()`. There is no later moment at which
 * it can be recovered and emailed. A card minted in March for a June send
 * date would therefore be undeliverable, so a scheduled purchase waits on
 * `orders.giftCardPurchase` and the card is created on the day it is sent.
 *
 * setInterval rather than BullMQ, matching `services/approval-deadline.ts`.
 * The repo already made that tradeoff; a second scheduling story costs more
 * than it buys.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §6
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../database";
import { giftCards, type GiftCard } from "../database/schema/gift-cards";
import {
  orders,
  orderItems,
  type GiftCardPurchase,
} from "../database/schema/orders";
import { issueGiftCard } from "./gift-card";
import { sendTemplateEmail } from "./email";
import { getGiftCardTemplate } from "./email-templates";

/** How often the sweep runs when started. */
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Cards handled per sweep, so one pass cannot run unboundedly long. */
const SWEEP_BATCH_SIZE = 100;

/**
 * Postgres reports the unique violation by constraint name.
 *
 * Two constraints now guard against a double mint, because an order can buy
 * several cards alongside posters (#579): `..._purchase_order_item_id_unique`
 * for a card bought as a line, and the partial
 * `gift_card_standalone_purchase_order_unique` for the standalone
 * `/gift-cards` flow, whose order has no line items. Either one firing means
 * the same thing — somebody else delivered this already.
 */
const MINT_CONSTRAINTS = [
  "gift_card_purchase_order_item_id_unique",
  "gift_card_standalone_purchase_order_unique",
];

function isMintCollision(error: unknown): boolean {
  const constraint =
    (error as { constraint_name?: string; constraint?: string })
      ?.constraint_name ??
    (error as { constraint?: string })?.constraint ??
    "";
  const message = error instanceof Error ? error.message : String(error);
  return MINT_CONSTRAINTS.some(
    (name) => constraint.includes(name) || message.includes(name),
  );
}

/**
 * Emails a card to its recipient.
 *
 * `code` is passed in rather than read from the card, because it is not on
 * the card — this is the only function that ever sees it, and it is never
 * logged. A code in an application log is a code in a log aggregator.
 */
export async function sendGiftCardEmail(
  card: GiftCard,
  code: string,
): Promise<void> {
  if (!card.recipientEmail) {
    throw new Error("Gift card has no recipient address");
  }

  const template = getGiftCardTemplate({
    code,
    amountRupees: (card.initialBalancePaise / 100).toLocaleString("en-IN"),
    recipientName: card.recipientName ?? "",
    senderName: card.senderName ?? "chobii.art",
    message: card.message,
  });

  await sendTemplateEmail(card.recipientEmail, template);
}

/**
 * Creates a card for a paid purchase and emails it.
 *
 * The single place a card comes into existence for a bought gift card, used
 * by both the payment-verification path and the scheduled sweep — so the two
 * cannot drift apart on what "delivering" means.
 *
 * Returns false when another worker got there first, or when the email
 * failed after a successful mint. Never throws for either: a lost race is
 * normal, and a minted-but-unsent card is recoverable from the admin screen.
 */
async function mintAndSend(
  orderId: string,
  purchase: GiftCardPurchase,
  description: string,
  /**
   * The line this card was bought as, when it was bought inside a cart.
   *
   * Null for the standalone `/gift-cards` flow, whose order has no line items
   * and carries its purchase on the order itself. Which of the two unique
   * constraints settles a race depends on this (#579).
   */
  orderItemId: string | null = null,
): Promise<boolean> {
  try {
    // No "has this been minted yet" read before the write: that races with a
    // concurrent worker in exactly the window it is meant to protect. The
    // unique constraint decides.
    const { card, code } = await issueGiftCard({
      amountPaise: purchase.amountPaise,
      purchaseOrderId: orderId,
      purchaseOrderItemId: orderItemId,
      recipientEmail: purchase.recipientEmail,
      recipientName: purchase.recipientName,
      senderName: purchase.senderName,
      message: purchase.message,
      sendAt: purchase.sendAt ? new Date(purchase.sendAt) : null,
      description,
    });

    await sendGiftCardEmail(card, code);
    await db
      .update(giftCards)
      .set({ sentAt: new Date() })
      .where(eq(giftCards.id, card.id));

    return true;
  } catch (error) {
    if (isMintCollision(error)) return false;

    // The order id is safe to log; the code is not.
    console.error(
      `Gift card delivery failed for order ${orderId}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Delivers a just-paid gift card, when the buyer chose no send date.
 *
 * Called from the payment-verification path. A future send date is left for
 * the sweep: the card must not exist before the day it is emailed, because
 * its code is returned once and never stored.
 */
export async function deliverImmediateGiftCard(
  orderId: string,
): Promise<boolean> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) return false;
  if (order.paymentStatus !== "paid") return false;

  const now = new Date();
  const isDue = (purchase: GiftCardPurchase) =>
    !purchase.sendAt || new Date(purchase.sendAt) <= now;

  /**
   * Cards bought as lines of a mixed order (#579).
   *
   * Read first, and independently of `orders.giftCardPurchase`: an order can
   * hold several cards alongside posters, and each is minted against its own
   * line so a retried verification cannot double any of them.
   */
  const lines = await db
    .select({ id: orderItems.id, purchase: orderItems.giftCardPurchase })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        isNotNull(orderItems.giftCardPurchase),
      ),
    );

  let delivered = false;

  for (const line of lines) {
    if (!line.purchase || !isDue(line.purchase)) continue;

    const sent = await mintAndSend(
      orderId,
      line.purchase,
      `Purchased on order ${order.orderNumber}`,
      line.id,
    );
    delivered = delivered || sent;
  }

  /**
   * The standalone `/gift-cards` flow, whose order has no line items at all
   * and carries its purchase on the order itself.
   *
   * Both shapes are handled here rather than in two functions, so that
   * whichever way a card was bought, "delivering" means the same thing.
   */
  const orderPurchase = order.giftCardPurchase;
  if (order.orderType === "gift_card" && orderPurchase && isDue(orderPurchase)) {
    const sent = await mintAndSend(
      orderId,
      orderPurchase,
      `Purchased on order ${order.orderNumber}`,
    );
    delivered = delivered || sent;
  }

  return delivered;
}

/**
 * Mints and delivers gift cards whose send date has arrived.
 *
 * Returns how many were delivered.
 */
export async function sweepScheduledGiftCards(
  now: Date = new Date(),
): Promise<number> {
  // Paid gift card orders bought through the standalone /gift-cards flow:
  // send date reached, no card yet. The LEFT JOIN is the cheap filter; the
  // partial unique index on purchase_order_id is what actually guarantees one
  // card per order for this shape.
  const dueOrders = await db.execute<{
    id: string;
    gift_card_purchase: GiftCardPurchase;
  }>(sql`
    SELECT o.id, o.gift_card_purchase
    FROM orders o
    LEFT JOIN gift_card g
      ON g.purchase_order_id = o.id AND g.purchase_order_item_id IS NULL
    WHERE o.order_type = 'gift_card'
      AND o.payment_status = 'paid'
      AND g.id IS NULL
      AND o.gift_card_purchase IS NOT NULL
      AND (o.gift_card_purchase ->> 'sendAt')::timestamptz <= ${now.toISOString()}
    LIMIT ${SWEEP_BATCH_SIZE}
  `);

  /**
   * Cards bought as lines, in a cart that may also have held posters (#579).
   *
   * A separate query rather than a union: this one joins on the line, and its
   * order carries no `gift_card_purchase` of its own and no `gift_card` order
   * type — a mixed order is not a gift card order.
   */
  const dueLines = await db.execute<{
    order_id: string;
    item_id: string;
    gift_card_purchase: GiftCardPurchase;
  }>(sql`
    SELECT oi.order_id, oi.id AS item_id, oi.gift_card_purchase
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN gift_card g ON g.purchase_order_item_id = oi.id
    WHERE o.payment_status = 'paid'
      AND g.id IS NULL
      AND oi.gift_card_purchase IS NOT NULL
      AND (oi.gift_card_purchase ->> 'sendAt')::timestamptz <= ${now.toISOString()}
    LIMIT ${SWEEP_BATCH_SIZE}
  `);

  let sent = 0;

  for (const row of dueOrders) {
    // One failure must not stall the rest of the batch — mintAndSend
    // absorbs a lost race and a dead address alike.
    const delivered = await mintAndSend(
      row.id,
      row.gift_card_purchase,
      "Scheduled gift card delivered",
    );
    if (delivered) sent++;
  }

  for (const row of dueLines) {
    const delivered = await mintAndSend(
      row.order_id,
      row.gift_card_purchase,
      "Scheduled gift card delivered",
      row.item_id,
    );
    if (delivered) sent++;
  }

  return sent;
}

/**
 * Starts the periodic sweep. Returns the interval handle so callers can stop
 * it — tests and graceful shutdown both need that.
 */
export function startGiftCardDeliveryScheduler(
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
): NodeJS.Timeout {
  return setInterval(() => {
    sweepScheduledGiftCards().catch((error) => {
      console.error("Gift card delivery sweep failed:", error);
    });
  }, intervalMs);
}
