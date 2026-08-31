/**
 * Order Tracking API Routes
 *
 * Provides public API endpoints for order tracking:
 * - GET /api/tracking/lookup - Guest order lookup by order number and email/phone
 * - GET /api/tracking/:orderNumber - Get tracking details for an order
 *
 * These endpoints do NOT require authentication but validate against order contact info.
 * Rate limited to prevent abuse.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../database";
import { orders } from "../database/schema/orders";
import { orderShipments } from "../database/schema/shipping";

// ============================================================================
// Types
// ============================================================================

type TrackingVariables = {
  // No auth variables needed for public routes
};

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for guest order lookup
 */
const guestLookupSchema = z.object({
  orderNumber: z.string().min(1).max(50),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(15).optional(),
}).refine(
  (data) => data.email || data.phone,
  { message: "Either email or phone is required" }
);

// ============================================================================
// Router
// ============================================================================

const tracking = new Hono<{ Variables: TrackingVariables }>();

/**
 * The shipment a customer is actually looking at.
 *
 * ONE helper, because `/lookup` and `/token/:token` each carried their own copy
 * of this read and therefore the same defect. A third handler copying a fourth
 * version of it is how `order-dispatch-tracking` started.
 *
 * `voided_at IS NULL` is the point. Without it the newest row wins, and once a
 * label has been voided and re-bought the newest row can be the DEAD one — the
 * customer is then shown an AWB the courier will not honour. The ordering
 * survives as a tiebreak, not as the choice; `order_shipments_live_label_idx`
 * is what makes at most one row live on a migrated database.
 */
async function liveShipmentFor(orderId: string) {
  const shipment = await db.query.orderShipments.findFirst({
    where: and(
      eq(orderShipments.orderId, orderId),
      isNull(orderShipments.voidedAt)
    ),
    orderBy: (shipments, { desc }) => [desc(shipments.createdAt), desc(shipments.id)],
  });

  return shipment ?? null;
}

/**
 * The public tracking block, or null.
 *
 * Null STAYS. It was never the bug — the bug was that nothing wrote the table
 * this reads. Falling back to `orders.shipping_details` would put the second
 * source of truth back that this whole phase exists to remove.
 *
 * The field list is an ALLOW-LIST, not a spread. `order_shipments` now carries
 * what we paid, the parcel's weight, the aggregator's ids and the label token,
 * and none of that belongs to the customer. Spreading the row would leak the
 * next dispatch column somebody adds, silently.
 */
function trackingPayload(shipment: Awaited<ReturnType<typeof liveShipmentFor>>) {
  if (!shipment) return null;

  return {
    // What we bought through, and who actually carries it. The customer
    // recognises the second one; `carrier` is the aggregator.
    carrier: shipment.carrier,
    courierName: shipment.courierName,
    awbNumber: shipment.awbNumber,
    trackingNumber: shipment.trackingNumber,
    trackingUrl: shipment.trackingUrl,
    status: shipment.status,
    shippedAt: shipment.shippedAt,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt,
    deliveredAt: shipment.deliveredAt,
  };
}

/**
 * GET /api/tracking/lookup
 * Look up an order by order number and email/phone (guest checkout support)
 *
 * Query params:
 * - orderNumber: Order number (e.g., "CA-2026-001234")
 * - email: Email used for the order (optional if phone provided)
 * - phone: Phone used for the order (optional if email provided)
 *
 * Returns order status and basic tracking info without requiring authentication.
 * Validates that the provided email/phone matches the order to prevent enumeration.
 */
tracking.get(
  "/lookup",
  zValidator("query", guestLookupSchema),
  async (c) => {
    const { orderNumber, email, phone } = c.req.valid("query");

    try {
      // Find order by order number
      const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, orderNumber),
        columns: {
          id: true,
          orderNumber: true,
          status: true,
          guestEmail: true,
          guestPhone: true,
          userId: true,
          shippingAddress: true,
          itemCount: true,
          createdAt: true,
          shippedAt: true,
          deliveredAt: true,
        },
        with: {
          user: {
            columns: {
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!order) {
        return c.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          404
        );
      }

      // Validate contact info matches
      const orderEmail = order.user?.email || order.guestEmail;
      const orderPhone = order.user?.phone || order.guestPhone;

      const emailMatches = email && orderEmail &&
        email.toLowerCase() === orderEmail.toLowerCase();
      const phoneMatches = phone && orderPhone &&
        normalizePhone(phone) === normalizePhone(orderPhone);

      if (!emailMatches && !phoneMatches) {
        // Return same error as not found to prevent enumeration
        return c.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          404
        );
      }

      // The LIVE shipment — see liveShipmentFor. Never the newest.
      const shipment = await liveShipmentFor(order.id);

      // Return tracking info
      return c.json({
        orderNumber: order.orderNumber,
        status: order.status,
        itemCount: order.itemCount,
        shippingAddress: {
          city: order.shippingAddress?.city,
          state: order.shippingAddress?.state,
          postalCode: order.shippingAddress?.postalCode,
        },
        tracking: trackingPayload(shipment),
        timeline: {
          orderedAt: order.createdAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
        },
      });
    } catch (error) {
      console.error("[Tracking] Error looking up order:", error);
      return c.json(
        { error: "Failed to look up order", code: "LOOKUP_ERROR" },
        500
      );
    }
  }
);

/**
 * GET /api/tracking/:orderNumber
 * Get tracking details by order number (requires email/phone in query for validation)
 */
tracking.get(
  "/:orderNumber",
  zValidator("query", z.object({
    email: z.string().email().optional(),
    phone: z.string().min(10).max(15).optional(),
  })),
  async (c) => {
    const orderNumber = c.req.param("orderNumber");
    const { email, phone } = c.req.valid("query");

    if (!email && !phone) {
      return c.json(
        { error: "Email or phone required for verification", code: "VALIDATION_REQUIRED" },
        400
      );
    }

    // Redirect to lookup with the order number
    const params = new URLSearchParams({ orderNumber });
    if (email) params.set("email", email);
    if (phone) params.set("phone", phone);

    return c.redirect(`/api/tracking/lookup?${params.toString()}`);
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * GET /api/tracking/token/:token
 * Look up an order by tracking token (from email link)
 * Tokens are generated when orders are created and included in confirmation emails.
 */
tracking.get(
  "/token/:token",
  async (c) => {
    const token = c.req.param("token");

    if (!token || token.length < 32) {
      return c.json(
        { error: "Invalid tracking token", code: "INVALID_TOKEN" },
        400
      );
    }

    try {
      // Find order by tracking token
      const order = await db.query.orders.findFirst({
        where: eq(orders.trackingToken, token),
        columns: {
          id: true,
          orderNumber: true,
          status: true,
          trackingTokenExpiresAt: true,
          shippingAddress: true,
          itemCount: true,
          createdAt: true,
          shippedAt: true,
          deliveredAt: true,
        },
      });

      if (!order) {
        return c.json(
          { error: "Order not found or link expired", code: "TOKEN_NOT_FOUND" },
          404
        );
      }

      // Check if token has expired
      if (order.trackingTokenExpiresAt && new Date(order.trackingTokenExpiresAt) < new Date()) {
        return c.json(
          { error: "This tracking link has expired", code: "TOKEN_EXPIRED" },
          410
        );
      }

      // The LIVE shipment — see liveShipmentFor. Never the newest.
      const shipment = await liveShipmentFor(order.id);

      // Return tracking info (same format as lookup endpoint)
      return c.json({
        orderNumber: order.orderNumber,
        status: order.status,
        itemCount: order.itemCount,
        shippingAddress: {
          city: order.shippingAddress?.city,
          state: order.shippingAddress?.state,
          postalCode: order.shippingAddress?.postalCode,
        },
        tracking: trackingPayload(shipment),
        timeline: {
          orderedAt: order.createdAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
        },
      });
    } catch (error) {
      console.error("[Tracking] Error looking up order by token:", error);
      return c.json(
        { error: "Failed to look up order", code: "LOOKUP_ERROR" },
        500
      );
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // Remove country code if present (91 for India)
  if (normalized.startsWith("91") && normalized.length === 12) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

export { tracking as trackingApp };
