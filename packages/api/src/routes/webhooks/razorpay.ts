/**
 * Razorpay Webhook Handler
 *
 * Handles webhook events from Razorpay for payment lifecycle updates:
 * - payment.authorized: Payment is authorized (pending capture)
 * - payment.captured: Payment is successfully captured
 * - payment.failed: Payment attempt failed
 * - refund.processed: Refund has been processed
 * - order.paid: Order has been fully paid
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../../database";
import { orders, type OrderPaymentDetails } from "../../database/schema/orders";
import {
  verifyWebhookSignature,
  getRazorpayPayment,
  extractPaymentDetails,
  type RazorpayWebhookPayload,
  RazorpayError,
} from "../../lib/razorpay";

// ============================================================================
// Types
// ============================================================================

/**
 * Webhook processing result
 */
interface WebhookResult {
  success: boolean;
  event: string;
  orderId?: string;
  message: string;
}

// ============================================================================
// Webhook Handler App
// ============================================================================

const razorpayWebhooksApp = new Hono();

// ============================================================================
// POST /api/webhooks/razorpay - Handle Razorpay Webhook Events
// ============================================================================

razorpayWebhooksApp.post("/", async (c) => {
  const signature = c.req.header("x-razorpay-signature");

  if (!signature) {
    return c.json({ error: "Missing webhook signature" }, 400);
  }

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify webhook signature
  let isValid: boolean;
  try {
    isValid = verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    if (error instanceof RazorpayError) {
      return c.json({ error: error.message }, 500);
    }
    return c.json({ error: "Signature verification failed" }, 500);
  }

  if (!isValid) {
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  // Parse the webhook payload
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  // Process the webhook event
  const result = await processWebhookEvent(payload);

  if (!result.success) {
    // Return 200 even on processing errors to prevent Razorpay from retrying
    // We log errors and can manually investigate
    return c.json(result, 200);
  }

  return c.json(result, 200);
});

// ============================================================================
// Event Processing Functions
// ============================================================================

/**
 * Process a Razorpay webhook event
 */
async function processWebhookEvent(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const { event } = payload;

  switch (event) {
    case "payment.authorized":
      return handlePaymentAuthorized(payload);

    case "payment.captured":
      return handlePaymentCaptured(payload);

    case "payment.failed":
      return handlePaymentFailed(payload);

    case "refund.processed":
      return handleRefundProcessed(payload);

    case "order.paid":
      return handleOrderPaid(payload);

    default:
      // Acknowledge unknown events without error
      return {
        success: true,
        event,
        message: `Unhandled event type: ${event}`,
      };
  }
}

/**
 * Handle payment.authorized event
 * Payment is authorized but not yet captured (if auto-capture is disabled)
 */
async function handlePaymentAuthorized(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const payment = payload.payload.payment?.entity;

  if (!payment) {
    return {
      success: false,
      event: "payment.authorized",
      message: "Missing payment entity in payload",
    };
  }

  try {
    // Find order by Razorpay order ID
    const order = await findOrderByRazorpayOrderId(payment.order_id);

    if (!order) {
      return {
        success: false,
        event: "payment.authorized",
        message: `Order not found for Razorpay order: ${payment.order_id}`,
      };
    }

    // Update order status to processing (payment authorized)
    await db
      .update(orders)
      .set({
        paymentStatus: "processing",
        paymentDetails: {
          ...extractPaymentDetails(payment),
          provider: "razorpay",
        } as OrderPaymentDetails,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      event: "payment.authorized",
      orderId: order.id,
      message: `Payment authorized for order ${order.orderNumber}`,
    };
  } catch (error) {
    return {
      success: false,
      event: "payment.authorized",
      message: `Error processing payment.authorized: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Handle payment.captured event
 * Payment has been successfully captured
 */
async function handlePaymentCaptured(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const payment = payload.payload.payment?.entity;

  if (!payment) {
    return {
      success: false,
      event: "payment.captured",
      message: "Missing payment entity in payload",
    };
  }

  try {
    // Find order by Razorpay order ID
    const order = await findOrderByRazorpayOrderId(payment.order_id);

    if (!order) {
      return {
        success: false,
        event: "payment.captured",
        message: `Order not found for Razorpay order: ${payment.order_id}`,
      };
    }

    // Update order to paid/confirmed status
    await db
      .update(orders)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        paymentDetails: {
          ...extractPaymentDetails(payment),
          provider: "razorpay",
        } as OrderPaymentDetails,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    // TODO: Trigger order confirmation email
    // TODO: Trigger inventory update

    return {
      success: true,
      event: "payment.captured",
      orderId: order.id,
      message: `Payment captured for order ${order.orderNumber}`,
    };
  } catch (error) {
    return {
      success: false,
      event: "payment.captured",
      message: `Error processing payment.captured: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Handle payment.failed event
 * Payment attempt has failed
 */
async function handlePaymentFailed(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const payment = payload.payload.payment?.entity;

  if (!payment) {
    return {
      success: false,
      event: "payment.failed",
      message: "Missing payment entity in payload",
    };
  }

  try {
    // Find order by Razorpay order ID
    const order = await findOrderByRazorpayOrderId(payment.order_id);

    if (!order) {
      return {
        success: false,
        event: "payment.failed",
        message: `Order not found for Razorpay order: ${payment.order_id}`,
      };
    }

    // Update order payment status to failed
    // Note: We don't change order status yet as user might retry payment
    await db
      .update(orders)
      .set({
        paymentStatus: "failed",
        paymentDetails: {
          provider: "razorpay",
          orderId: payment.order_id,
          paymentId: payment.id,
          method: payment.method,
          // Store error details for debugging
        } as OrderPaymentDetails,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      event: "payment.failed",
      orderId: order.id,
      message: `Payment failed for order ${order.orderNumber}: ${payment.error_description || "Unknown error"}`,
    };
  } catch (error) {
    return {
      success: false,
      event: "payment.failed",
      message: `Error processing payment.failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Handle refund.processed event
 * Refund has been successfully processed
 */
async function handleRefundProcessed(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const refund = payload.payload.refund?.entity;
  const payment = payload.payload.payment?.entity;

  if (!refund) {
    return {
      success: false,
      event: "refund.processed",
      message: "Missing refund entity in payload",
    };
  }

  try {
    // Get payment details to find the order
    const paymentDetails = payment || await getRazorpayPayment(refund.payment_id);

    // Find order by Razorpay order ID
    const order = await findOrderByRazorpayOrderId(paymentDetails.order_id);

    if (!order) {
      return {
        success: false,
        event: "refund.processed",
        message: `Order not found for payment: ${refund.payment_id}`,
      };
    }

    // Calculate if this is a full or partial refund
    const originalAmount = parseInt(order.total) * 100; // Convert to paise
    const isFullRefund = refund.amount >= originalAmount;

    // Update order with refund details
    const existingPaymentDetails = order.paymentDetails as OrderPaymentDetails | null;

    await db
      .update(orders)
      .set({
        status: isFullRefund ? "refunded" : order.status,
        paymentStatus: isFullRefund ? "refunded" : "partially_refunded",
        paymentDetails: {
          ...existingPaymentDetails,
          refundId: refund.id,
          refundAmount: refund.amount / 100, // Convert to rupees
          refundedAt: new Date().toISOString(),
        } as OrderPaymentDetails,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    // TODO: Trigger refund confirmation email

    return {
      success: true,
      event: "refund.processed",
      orderId: order.id,
      message: `Refund processed for order ${order.orderNumber}: ₹${refund.amount / 100}`,
    };
  } catch (error) {
    return {
      success: false,
      event: "refund.processed",
      message: `Error processing refund.processed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Handle order.paid event
 * Order has been fully paid (alternative to payment.captured for some flows)
 */
async function handleOrderPaid(
  payload: RazorpayWebhookPayload
): Promise<WebhookResult> {
  const razorpayOrder = payload.payload.order?.entity;
  const payment = payload.payload.payment?.entity;

  if (!razorpayOrder) {
    return {
      success: false,
      event: "order.paid",
      message: "Missing order entity in payload",
    };
  }

  try {
    // Find order by Razorpay order ID
    const order = await findOrderByRazorpayOrderId(razorpayOrder.id);

    if (!order) {
      return {
        success: false,
        event: "order.paid",
        message: `Order not found for Razorpay order: ${razorpayOrder.id}`,
      };
    }

    // Only update if not already paid (avoid duplicate processing)
    if (order.paymentStatus === "paid") {
      return {
        success: true,
        event: "order.paid",
        orderId: order.id,
        message: `Order ${order.orderNumber} already marked as paid`,
      };
    }

    // Build payment details
    const paymentDetails: OrderPaymentDetails = payment
      ? extractPaymentDetails(payment)
      : {
          provider: "razorpay",
          orderId: razorpayOrder.id,
          capturedAt: new Date().toISOString(),
        };

    // Update order to confirmed/paid status
    await db
      .update(orders)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        paymentDetails,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      event: "order.paid",
      orderId: order.id,
      message: `Order ${order.orderNumber} marked as paid`,
    };
  } catch (error) {
    return {
      success: false,
      event: "order.paid",
      message: `Error processing order.paid: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find an order by its Razorpay order ID stored in payment details
 */
async function findOrderByRazorpayOrderId(razorpayOrderId: string) {
  // Query orders where paymentDetails.orderId matches
  const result = await db.query.orders.findFirst({
    where: (orders, { sql }) =>
      sql`${orders.paymentDetails}->>'orderId' = ${razorpayOrderId}`,
  });

  return result;
}

// ============================================================================
// Export
// ============================================================================

export { razorpayWebhooksApp };
export default razorpayWebhooksApp;
