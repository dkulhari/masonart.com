/**
 * Shipments API Routes
 *
 * Provides public API endpoints for order shipment tracking:
 * - GET /api/orders/:orderId/shipments - Get shipments for an order (owner only)
 * - GET /api/shipments/:id/track - Get tracking details for a shipment
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../database";
import { orderShipments, shippingOptions } from "../database/schema/shipping";
import { orders } from "../database/schema/orders";
import {
  requireAuth,
  canAccess,
  type AuthVariables,
} from "../middleware/auth";
import { HTTPException } from "hono/http-exception";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate tracking URL for common carriers
 */
function generateTrackingUrl(carrier: string, trackingNumber: string | null): string | null {
  if (!trackingNumber) return null;

  const carrierUrls: Record<string, string> = {
    "usps": `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    "fedex": `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    "ups": `https://www.ups.com/track?tracknum=${trackingNumber}`,
    "dhl": `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`,
    "delhivery": `https://www.delhivery.com/track/package/${trackingNumber}`,
    "bluedart": `https://www.bluedart.com/tracking/${trackingNumber}`,
    "dtdc": `https://www.dtdc.in/tracking.asp?awbNo=${trackingNumber}`,
    "shiprocket": `https://shiprocket.co/tracking/${trackingNumber}`,
  };

  const carrierLower = carrier.toLowerCase();
  return carrierUrls[carrierLower] || null;
}

/**
 * Generate tracking timeline from shipment status
 */
function generateTrackingTimeline(shipment: {
  status: string;
  createdAt: Date;
  shippedAt: Date | null;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
}) {
  const steps = [
    {
      status: "pending",
      label: "Order Received",
      completed: true,
      timestamp: shipment.createdAt.toISOString(),
    },
    {
      status: "label_created",
      label: "Shipping Label Created",
      completed: ["label_created", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(shipment.status),
      timestamp: null,
    },
    {
      status: "shipped",
      label: "Shipped",
      completed: ["shipped", "in_transit", "out_for_delivery", "delivered"].includes(shipment.status),
      timestamp: shipment.shippedAt?.toISOString() || null,
    },
    {
      status: "in_transit",
      label: "In Transit",
      completed: ["in_transit", "out_for_delivery", "delivered"].includes(shipment.status),
      timestamp: null,
    },
    {
      status: "out_for_delivery",
      label: "Out for Delivery",
      completed: ["out_for_delivery", "delivered"].includes(shipment.status),
      timestamp: null,
    },
    {
      status: "delivered",
      label: "Delivered",
      completed: shipment.status === "delivered",
      timestamp: shipment.deliveredAt?.toISOString() || null,
    },
  ];

  return {
    currentStatus: shipment.status,
    steps,
    estimatedDelivery: shipment.estimatedDeliveryAt?.toISOString() || null,
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

const shipmentsApp = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
shipmentsApp.use("*", requireAuth);

/**
 * GET /api/orders/:orderId/shipments - Get shipments for an order
 * Only accessible by the order owner
 */
shipmentsApp.get("/orders/:orderId/shipments", async (c) => {
  const orderId = c.req.param("orderId");
  const user = c.get("user");

  // Validate UUID format
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return c.json({ error: "Invalid order ID" }, 400);
  }

  try {
    // Get the order to verify ownership
    const orderResult = await db
      .select({
        id: orders.id,
        userId: orders.userId,
        orderNumber: orders.orderNumber,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult.length) {
      return c.json({ error: "Order not found" }, 404);
    }

    const order = orderResult[0];

    // Check if user owns the order (unless admin)
    if (!canAccess(user, order.userId)) {
      throw new HTTPException(403, { message: "You can only view shipments for your own orders" });
    }

    // Get shipments for the order
    const shipmentsList = await db
      .select({
        id: orderShipments.id,
        orderId: orderShipments.orderId,
        trackingNumber: orderShipments.trackingNumber,
        carrier: orderShipments.carrier,
        trackingUrl: orderShipments.trackingUrl,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
        estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
        deliveredAt: orderShipments.deliveredAt,
        createdAt: orderShipments.createdAt,
        shippingOption: {
          id: shippingOptions.id,
          name: shippingOptions.name,
          carrier: shippingOptions.carrier,
        },
      })
      .from(orderShipments)
      .leftJoin(shippingOptions, eq(orderShipments.shippingOptionId, shippingOptions.id))
      .where(eq(orderShipments.orderId, orderId));

    // Add generated tracking URLs if not present
    const shipmentsWithUrls = shipmentsList.map((shipment) => ({
      ...shipment,
      trackingUrl: shipment.trackingUrl || generateTrackingUrl(shipment.carrier, shipment.trackingNumber),
    }));

    return c.json({
      orderId,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      shipments: shipmentsWithUrls,
      totalShipments: shipmentsWithUrls.length,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching order shipments:", error);
    return c.json({ error: "Failed to fetch shipments" }, 500);
  }
});

/**
 * GET /api/shipments/:id/track - Get tracking details for a shipment
 * Only accessible by the order owner
 */
shipmentsApp.get("/shipments/:id/track", async (c) => {
  const shipmentId = c.req.param("id");
  const user = c.get("user");

  // Validate UUID format
  if (!shipmentId || !/^[0-9a-f-]{36}$/i.test(shipmentId)) {
    return c.json({ error: "Invalid shipment ID" }, 400);
  }

  try {
    // Get the shipment with order info
    const shipmentResult = await db
      .select({
        id: orderShipments.id,
        orderId: orderShipments.orderId,
        trackingNumber: orderShipments.trackingNumber,
        carrier: orderShipments.carrier,
        trackingUrl: orderShipments.trackingUrl,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
        estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
        deliveredAt: orderShipments.deliveredAt,
        createdAt: orderShipments.createdAt,
        order: {
          id: orders.id,
          userId: orders.userId,
          orderNumber: orders.orderNumber,
        },
        shippingOption: {
          id: shippingOptions.id,
          name: shippingOptions.name,
          carrier: shippingOptions.carrier,
        },
      })
      .from(orderShipments)
      .innerJoin(orders, eq(orderShipments.orderId, orders.id))
      .leftJoin(shippingOptions, eq(orderShipments.shippingOptionId, shippingOptions.id))
      .where(eq(orderShipments.id, shipmentId))
      .limit(1);

    if (!shipmentResult.length) {
      return c.json({ error: "Shipment not found" }, 404);
    }

    const shipment = shipmentResult[0];

    // Check if user owns the order (unless admin)
    if (!canAccess(user, shipment.order.userId)) {
      throw new HTTPException(403, { message: "You can only track shipments for your own orders" });
    }

    // Generate tracking timeline
    const timeline = generateTrackingTimeline({
      status: shipment.status,
      createdAt: shipment.createdAt,
      shippedAt: shipment.shippedAt,
      estimatedDeliveryAt: shipment.estimatedDeliveryAt,
      deliveredAt: shipment.deliveredAt,
    });

    // Generate tracking URL if not present
    const trackingUrl = shipment.trackingUrl || generateTrackingUrl(shipment.carrier, shipment.trackingNumber);

    return c.json({
      shipment: {
        id: shipment.id,
        orderId: shipment.orderId,
        orderNumber: shipment.order.orderNumber,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        trackingUrl,
        status: shipment.status,
        shippedAt: shipment.shippedAt?.toISOString() || null,
        estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() || null,
        deliveredAt: shipment.deliveredAt?.toISOString() || null,
        shippingOption: shipment.shippingOption,
      },
      tracking: timeline,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching shipment tracking:", error);
    return c.json({ error: "Failed to fetch tracking information" }, 500);
  }
});

// Export the router
export { shipmentsApp, generateTrackingUrl, generateTrackingTimeline };
export default shipmentsApp;
