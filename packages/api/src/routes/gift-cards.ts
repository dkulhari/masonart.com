/**
 * Gift Card API Routes
 *
 * - POST /api/gift-cards/purchase - Create the order that buys a gift card
 *
 * A gift card is TENDER. Buying one is a sale of a voucher, not of goods: no
 * shipping, no tax at the point of sale, and no product behind the line.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §5
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { db } from "../database";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { orders, orderItems } from "../database/schema/orders";
import {
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
  GIFT_CARD_MAX_SCHEDULE_DAYS,
} from "../database/schema/gift-cards";
import { generateOrderNumber } from "../lib/order-number";

// ============================================================================
// Validation
// ============================================================================

const purchaseSchema = z.object({
  amountPaise: z
    .number()
    .int()
    .min(GIFT_CARD_MIN_PAISE)
    .max(GIFT_CARD_MAX_PAISE),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1).max(120),
  senderName: z.string().min(1).max(120),
  message: z.string().max(500).optional(),
  /**
   * Capped at a year out. A date beyond that is almost always a typo, and it
   * would leave an unminted purchase sitting in the table indefinitely.
   */
  sendAt: z.coerce
    .date()
    .refine(
      (date) =>
        date.getTime() <= Date.now() + GIFT_CARD_MAX_SCHEDULE_DAYS * 86_400_000,
      { message: "Send date cannot be more than a year away" },
    )
    .optional(),
});

// ============================================================================
// Routes
// ============================================================================

const giftCardsApp = new Hono<{ Variables: AuthVariables }>();

giftCardsApp.use("*", requireAuth);

/**
 * Creates the order that buys a gift card.
 *
 * No card is created here. Minting happens when the card is delivered — at
 * payment verification for an immediate send, in the sweep for a scheduled
 * one. Creating it now would let an abandoned checkout produce spendable
 * money.
 *
 * The purchase does not go through the cart: a cart item requires both a
 * productId and a variantId, and the cart derives lineTotal from those rows,
 * so it has no way to carry an amount the customer typed.
 */
giftCardsApp.post("/purchase", zValidator("json", purchaseSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");

  const amountRupees = (input.amountPaise / 100).toFixed(2);

  try {
    const order = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(orders)
        .values({
          orderNumber: await generateOrderNumber(),
          userId: user.id,
          status: "pending",
          paymentStatus: "pending",
          orderType: "gift_card",
          // A voucher ships nothing. The shipping address column is NOT NULL,
          // so it carries the buyer rather than a delivery destination.
          shippingAddress: {
            fullName: user.name ?? input.senderName,
            addressLine1: "—",
            city: "—",
            state: "—",
            postalCode: "—",
            country: "IN",
            phone: "—",
          } as never,
          shippingCost: "0.00",
          // Neither goods nor services: the tax point is the redemption, not
          // this sale. Taxing here would tax the voucher and then tax the
          // poster it eventually buys.
          tax: "0.00",
          subtotal: amountRupees,
          discount: "0.00",
          total: amountRupees,
          itemCount: 1,
          currency: "INR",
          /**
           * The purchase lives here until the card is minted. A scheduled
           * card cannot be created now: its plaintext code is returned once
           * and never stored, so it would be unrecoverable by the send date.
           */
          giftCardPurchase: {
            amountPaise: input.amountPaise,
            recipientEmail: input.recipientEmail,
            recipientName: input.recipientName,
            senderName: input.senderName,
            message: input.message ?? null,
            sendAt: input.sendAt?.toISOString() ?? null,
          },
        })
        .returning();

      if (!created) throw new Error("Failed to create gift card order");

      const title = `Gift card — ₹${(input.amountPaise / 100).toLocaleString("en-IN")}`;

      await tx.insert(orderItems).values({
        orderId: created.id,
        // Already nullable — no dummy product row is needed.
        productId: null,
        quantity: 1,
        unitPrice: amountRupees,
        lineTotal: amountRupees,
        // A voucher has no physical dimensions to snapshot. The zeroed size
        // fields say "this line is not a printed thing" rather than lying
        // about one.
        snapshot: {
          title,
          sku: "GIFT-CARD",
          sizeLabel: "—",
          widthInches: 0,
          heightInches: 0,
        },
      });

      return created;
    });

    return c.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  } catch (error) {
    console.error("Error creating gift card order:", error);
    return c.json({ error: "Failed to create gift card order" }, 500);
  }
});

export { giftCardsApp };
