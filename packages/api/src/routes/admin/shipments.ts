/**
 * Admin Shipments API Routes
 *
 * Provides admin API endpoints for shipment management:
 * - GET /api/admin/shipments - List all shipments with filters
 * - POST /api/admin/orders/:orderId/ship - Create shipment for order
 * - GET /api/admin/shipments/:id - Get shipment details
 * - PATCH /api/admin/shipments/:id - Update shipment
 * - POST /api/admin/shipments/:id/mark-delivered - Mark as delivered
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, gte, lte } from "drizzle-orm";

import { db } from "../../database";
import {
  orderShipments,
  shippingOptions,
  shipmentStatusEnum,
  type ShipmentStatus,
} from "../../database/schema/shipping";
import { orders, type OrderStatus } from "../../database/schema/orders";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { generateTrackingUrl } from "../shipments";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Valid shipment status values from enum
const SHIPMENT_STATUS_VALUES = shipmentStatusEnum.enumValues;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for listing shipments
 */
const listShipmentsSchema = z.object({
  status: z.enum(SHIPMENT_STATUS_VALUES as unknown as [string, ...string[]]).optional(),
  orderId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["createdAt", "status", "shippedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Schema for creating a shipment
 */
const createShipmentSchema = z.object({
  shippingOptionId: z.string().uuid().optional(),
  trackingNumber: z.string().max(100).optional(),
  carrier: z.string().min(1).max(100),
  estimatedDeliveryAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * Schema for updating a shipment
 */
const updateShipmentSchema = z.object({
  trackingNumber: z.string().max(100).optional().nullable(),
  trackingUrl: z.string().max(500).optional().nullable(),
  status: z.enum(SHIPMENT_STATUS_VALUES as unknown as [string, ...string[]]).optional(),
  estimatedDeliveryAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminShipmentsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminShipmentsApp.use("*", requireAuth);
adminShipmentsApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/shipments - List All Shipments
// ============================================================================

adminShipmentsApp.get(
  "/",
  zValidator("query", listShipmentsSchema),
  async (c) => {
    const { status, orderId, dateFrom, dateTo, page, pageSize, sortBy, sortOrder: order } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(orderShipments.status, status as ShipmentStatus));
      }

      if (orderId) {
        conditions.push(eq(orderShipments.orderId, orderId));
      }

      if (dateFrom) {
        conditions.push(gte(orderShipments.createdAt, new Date(dateFrom)));
      }

      if (dateTo) {
        conditions.push(lte(orderShipments.createdAt, new Date(dateTo)));
      }

      // Build sort order
      const orderFn = order === "asc" ? asc : desc;
      const orderByColumn = {
        createdAt: orderShipments.createdAt,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
      }[sortBy];

      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orderShipments)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Get shipments with order info
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
          notes: orderShipments.notes,
          createdAt: orderShipments.createdAt,
          updatedAt: orderShipments.updatedAt,
          order: {
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            userId: orders.userId,
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
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderFn(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      // Get user info for orders
      const userIds = [...new Set(shipmentsList.map((s) => s.order.userId).filter(Boolean))];
      let userMap: Record<string, { id: string; name: string | null; email: string }> = {};

      if (userIds.length > 0) {
        const userList = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .where(sql`${users.id} = ANY(${userIds})`);

        userMap = userList.reduce(
          (acc, user) => {
            acc[user.id] = user;
            return acc;
          },
          {} as Record<string, { id: string; name: string | null; email: string }>
        );
      }

      // Add user info to shipments
      const shipmentsWithUsers = shipmentsList.map((shipment) => ({
        ...shipment,
        order: {
          ...shipment.order,
          customer: shipment.order.userId ? userMap[shipment.order.userId] || null : null,
        },
      }));

      return c.json({
        items: shipmentsWithUsers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error fetching shipments:", error);
      return c.json({ error: "Failed to fetch shipments" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/shipments/:id - Get Shipment Details
// ============================================================================

adminShipmentsApp.get("/:id", async (c) => {
  const shipmentId = c.req.param("id");

  // Validate UUID format
  if (!shipmentId || !/^[0-9a-f-]{36}$/i.test(shipmentId)) {
    return c.json({ error: "Invalid shipment ID" }, 400);
  }

  try {
    const shipmentResult = await db
      .select({
        id: orderShipments.id,
        orderId: orderShipments.orderId,
        shippingOptionId: orderShipments.shippingOptionId,
        trackingNumber: orderShipments.trackingNumber,
        carrier: orderShipments.carrier,
        trackingUrl: orderShipments.trackingUrl,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
        estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
        deliveredAt: orderShipments.deliveredAt,
        notes: orderShipments.notes,
        createdAt: orderShipments.createdAt,
        updatedAt: orderShipments.updatedAt,
        order: {
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          userId: orders.userId,
          shippingAddress: orders.shippingAddress,
        },
        shippingOption: {
          id: shippingOptions.id,
          name: shippingOptions.name,
          carrier: shippingOptions.carrier,
          baseCost: shippingOptions.baseCost,
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

    // Get customer info if userId exists
    let customer = null;
    if (shipment.order.userId) {
      const customerResult = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, shipment.order.userId))
        .limit(1);

      customer = customerResult[0] || null;
    }

    return c.json({
      ...shipment,
      order: {
        ...shipment.order,
        customer,
      },
    });
  } catch (error) {
    console.error("Error fetching shipment:", error);
    return c.json({ error: "Failed to fetch shipment" }, 500);
  }
});

// ============================================================================
// POST /api/admin/orders/:orderId/ship - Create Shipment for Order
// ============================================================================

adminShipmentsApp.post(
  "/orders/:orderId/ship",
  zValidator("json", createShipmentSchema),
  async (c) => {
    const orderId = c.req.param("orderId");
    const data = c.req.valid("json");

    // Validate UUID format
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return c.json({ error: "Invalid order ID" }, 400);
    }

    try {
      // Get the order
      const orderResult = await db
        .select({
          id: orders.id,
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

      // Check if order can be shipped
      const shippableStatuses: OrderStatus[] = ["confirmed", "processing"];
      if (!shippableStatuses.includes(order.status as OrderStatus)) {
        return c.json(
          {
            error: `Cannot create shipment for order with status '${order.status}'`,
          },
          400
        );
      }

      // Validate shipping option if provided
      if (data.shippingOptionId) {
        const optionResult = await db
          .select({ id: shippingOptions.id })
          .from(shippingOptions)
          .where(eq(shippingOptions.id, data.shippingOptionId))
          .limit(1);

        if (!optionResult.length) {
          return c.json({ error: "Shipping option not found" }, 404);
        }
      }

      // Generate tracking URL if tracking number provided
      const trackingUrl = data.trackingNumber
        ? generateTrackingUrl(data.carrier, data.trackingNumber)
        : null;

      // Create the shipment
      const [newShipment] = await db
        .insert(orderShipments)
        .values({
          orderId,
          shippingOptionId: data.shippingOptionId || null,
          trackingNumber: data.trackingNumber || null,
          carrier: data.carrier,
          trackingUrl,
          status: "pending",
          estimatedDeliveryAt: data.estimatedDeliveryAt
            ? new Date(data.estimatedDeliveryAt)
            : null,
          notes: data.notes || null,
        })
        .returning();

      // Update order status to 'processing' if it's 'confirmed'
      if (order.status === "confirmed") {
        await db
          .update(orders)
          .set({
            status: "processing",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));
      }

      return c.json(
        {
          message: "Shipment created successfully",
          shipment: newShipment,
        },
        201
      );
    } catch (error) {
      console.error("Error creating shipment:", error);
      return c.json({ error: "Failed to create shipment" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/shipments/:id - Update Shipment
// ============================================================================

adminShipmentsApp.patch(
  "/:id",
  zValidator("json", updateShipmentSchema),
  async (c) => {
    const shipmentId = c.req.param("id");
    const updates = c.req.valid("json");

    // Validate UUID format
    if (!shipmentId || !/^[0-9a-f-]{36}$/i.test(shipmentId)) {
      return c.json({ error: "Invalid shipment ID" }, 400);
    }

    // Must provide at least one field to update
    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    try {
      // Get existing shipment
      const existingResult = await db
        .select({
          id: orderShipments.id,
          orderId: orderShipments.orderId,
          status: orderShipments.status,
          carrier: orderShipments.carrier,
        })
        .from(orderShipments)
        .where(eq(orderShipments.id, shipmentId))
        .limit(1);

      if (!existingResult.length) {
        return c.json({ error: "Shipment not found" }, 404);
      }

      const existing = existingResult[0];

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (updates.trackingNumber !== undefined) {
        updateData.trackingNumber = updates.trackingNumber;
        // Auto-generate tracking URL if we have a new tracking number
        if (updates.trackingNumber && !updates.trackingUrl) {
          updateData.trackingUrl = generateTrackingUrl(existing.carrier, updates.trackingNumber);
        }
      }

      if (updates.trackingUrl !== undefined) {
        updateData.trackingUrl = updates.trackingUrl;
      }

      if (updates.status !== undefined) {
        updateData.status = updates.status;

        // Update timestamps based on status
        if (updates.status === "shipped" && existing.status !== "shipped") {
          updateData.shippedAt = new Date();
        }
        if (updates.status === "delivered" && existing.status !== "delivered") {
          updateData.deliveredAt = new Date();
        }
      }

      if (updates.estimatedDeliveryAt !== undefined) {
        updateData.estimatedDeliveryAt = updates.estimatedDeliveryAt
          ? new Date(updates.estimatedDeliveryAt)
          : null;
      }

      if (updates.notes !== undefined) {
        updateData.notes = updates.notes;
      }

      // Update the shipment
      const [updatedShipment] = await db
        .update(orderShipments)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(orderShipments.id, shipmentId))
        .returning();

      // Update order status if shipment status changed
      if (updates.status) {
        let newOrderStatus: OrderStatus | null = null;

        if (updates.status === "shipped") {
          newOrderStatus = "shipped";
        } else if (updates.status === "out_for_delivery") {
          newOrderStatus = "out_for_delivery";
        } else if (updates.status === "delivered") {
          newOrderStatus = "delivered";
        }

        if (newOrderStatus) {
          const orderUpdateData: Record<string, unknown> = {
            status: newOrderStatus,
            updatedAt: new Date(),
          };

          if (newOrderStatus === "shipped") {
            orderUpdateData.shippedAt = new Date();
          } else if (newOrderStatus === "delivered") {
            orderUpdateData.deliveredAt = new Date();
          }

          await db
            .update(orders)
            .set(orderUpdateData)
            .where(eq(orders.id, existing.orderId));
        }
      }

      return c.json({
        message: "Shipment updated successfully",
        shipment: updatedShipment,
      });
    } catch (error) {
      console.error("Error updating shipment:", error);
      return c.json({ error: "Failed to update shipment" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/shipments/:id/mark-delivered - Mark Shipment as Delivered
// ============================================================================

adminShipmentsApp.post("/:id/mark-delivered", async (c) => {
  const shipmentId = c.req.param("id");

  // Validate UUID format
  if (!shipmentId || !/^[0-9a-f-]{36}$/i.test(shipmentId)) {
    return c.json({ error: "Invalid shipment ID" }, 400);
  }

  try {
    // Get existing shipment
    const existingResult = await db
      .select({
        id: orderShipments.id,
        orderId: orderShipments.orderId,
        status: orderShipments.status,
      })
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId))
      .limit(1);

    if (!existingResult.length) {
      return c.json({ error: "Shipment not found" }, 404);
    }

    const existing = existingResult[0];

    // Check if already delivered
    if (existing.status === "delivered") {
      return c.json({ error: "Shipment is already marked as delivered" }, 400);
    }

    const now = new Date();

    // Update the shipment
    const [updatedShipment] = await db
      .update(orderShipments)
      .set({
        status: "delivered",
        deliveredAt: now,
        updatedAt: now,
      })
      .where(eq(orderShipments.id, shipmentId))
      .returning();

    // Update order status to delivered
    await db
      .update(orders)
      .set({
        status: "delivered",
        deliveredAt: now,
        updatedAt: now,
      })
      .where(eq(orders.id, existing.orderId));

    return c.json({
      message: "Shipment marked as delivered",
      shipment: updatedShipment,
    });
  } catch (error) {
    console.error("Error marking shipment as delivered:", error);
    return c.json({ error: "Failed to mark shipment as delivered" }, 500);
  }
});

// Export the router and schemas
export {
  adminShipmentsApp,
  listShipmentsSchema,
  createShipmentSchema,
  updateShipmentSchema,
};
export default adminShipmentsApp;
