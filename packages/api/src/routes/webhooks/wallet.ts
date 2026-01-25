/**
 * Wallet Webhook Routes
 *
 * Handles Razorpay webhooks for wallet top-ups:
 * - payment.captured: Credit wallet when payment is successful
 * - payment.failed: Mark transaction as failed
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import {
  verifyWebhookSignature,
  type RazorpayWebhookPayload,
} from "../../lib/razorpay";
import {
  completePendingTopUp,
  failPendingTopUp,
} from "../../services/wallet";

// ============================================================================
// Route Handler
// ============================================================================

const walletWebhookApp = new Hono();

// ============================================================================
// POST /api/webhooks/wallet - Razorpay Webhook Handler
// ============================================================================

walletWebhookApp.post("/", async (c) => {
  // Get raw body for signature verification
  const rawBody = await c.req.text();
  const signature = c.req.header("x-razorpay-signature");

  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  // Verify webhook signature
  try {
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 400);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook signature verification failed:", errorMessage);
    return c.json({ error: "Signature verification failed" }, 400);
  }

  // Parse the webhook payload
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  // Handle different event types
  try {
    switch (payload.event) {
      case "payment.captured": {
        const payment = payload.payload.payment?.entity;
        if (!payment) {
          return c.json({ error: "Missing payment data" }, 400);
        }

        // Check if this is a wallet top-up
        const notes = payment.notes || {};
        if (notes.type !== "wallet_topup") {
          // Not a wallet payment, ignore
          return c.json({ message: "Ignored: not a wallet payment" });
        }

        // Complete the pending transaction
        try {
          await completePendingTopUp(payment.order_id, payment.id);
          console.info(
            `Wallet top-up completed: order=${payment.order_id}, payment=${payment.id}`
          );
        } catch (error) {
          // Transaction might already be completed (idempotency)
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.warn(`Wallet top-up completion warning: ${errorMessage}`);
        }

        return c.json({ message: "Payment captured successfully" });
      }

      case "payment.failed": {
        const payment = payload.payload.payment?.entity;
        if (!payment) {
          return c.json({ error: "Missing payment data" }, 400);
        }

        // Check if this is a wallet top-up
        const notes = payment.notes || {};
        if (notes.type !== "wallet_topup") {
          return c.json({ message: "Ignored: not a wallet payment" });
        }

        // Mark the transaction as failed
        const errorDescription =
          payment.error_description || "Payment failed";
        await failPendingTopUp(payment.order_id, errorDescription);

        console.info(
          `Wallet top-up failed: order=${payment.order_id}, reason=${errorDescription}`
        );

        return c.json({ message: "Payment failure recorded" });
      }

      case "order.paid": {
        // Order is paid - this is a backup handler in case payment.captured wasn't received
        const order = payload.payload.order?.entity;
        if (!order) {
          return c.json({ error: "Missing order data" }, 400);
        }

        const notes = order.notes || {};
        if (notes.type !== "wallet_topup") {
          return c.json({ message: "Ignored: not a wallet order" });
        }

        // Order paid doesn't have payment ID, so we can't complete the transaction
        // This event is mainly for logging/monitoring
        console.info(`Wallet order paid event: order=${order.id}`);

        return c.json({ message: "Order paid event received" });
      }

      default: {
        // Log unhandled events for debugging
        console.info(`Unhandled wallet webhook event: ${payload.event}`);
        return c.json({
          message: `Event type not handled: ${payload.event}`,
        });
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Wallet webhook error: ${errorMessage}`);
    return c.json({ error: `Webhook processing failed: ${errorMessage}` }, 500);
  }
});

// Export the router
export { walletWebhookApp };
export default walletWebhookApp;
