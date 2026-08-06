/**
 * Admin Orders API Routes
 *
 * Provides admin API endpoints for order management:
 * - GET /api/admin/orders - List all orders with pagination and filters
 * - GET /api/admin/orders/stats - Get order statistics
 * - GET /api/admin/orders/:id - Get order details by ID or order number
 * - PATCH /api/admin/orders/:id - Update order (status, notes, etc.)
 * - PATCH /api/admin/orders/:id/status - Update order status only
 * - PATCH /api/admin/orders/:id/shipping - Update shipping details
 * - POST /api/admin/orders/:id/refund - Initiate refund
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, ilike, or, gte, lte } from "drizzle-orm";

import { db } from "../../database";
import {
  orders,
  type PaymentStatus,
  type OrderShippingDetails,
  type OrderPaymentDetails,
} from "../../database/schema/orders";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  voidGiftCardHold,
  refundToGiftCards,
} from "../../services/gift-card";
import {
  createRefund,
  isRazorpayConfigured,
  RazorpayError,
} from "../../lib/razorpay";
import { notifyOrderStatusChange } from "../../services/notifications";
import { createApprovalsForOrder } from "../../services/approval";
import { productionApprovals } from "../../database/schema/approvals";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ORDER_NUMBER_PREFIX = "MA";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for admin order listing
 */
const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
  status: z
    .enum([
      "pending",
      "pending_payment",
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "refund_requested",
      "refunded",
      "failed",
    ])
    .optional(),
  paymentStatus: z
    .enum([
      "pending",
      "processing",
      "paid",
      "failed",
      "refunded",
      "partially_refunded",
      "cancelled",
    ])
    .optional(),
  orderType: z
    .enum(["regular", "ai_generated", "trade", "gift_card"])
    .optional(),
  search: z.string().optional(), // Search by order number, customer email, phone
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "total", "orderNumber"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * Schema for updating an order
 */
const updateOrderSchema = z.object({
  status: z
    .enum([
      "pending",
      "pending_payment",
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "refund_requested",
      "refunded",
      "failed",
    ])
    .optional(),
  paymentStatus: z
    .enum([
      "pending",
      "processing",
      "paid",
      "failed",
      "refunded",
      "partially_refunded",
      "cancelled",
    ])
    .optional(),
  internalNotes: z.string().max(2000).optional(),
  shippingMethod: z.string().max(50).optional(),
});

/**
 * Schema for updating order status
 */
const updateStatusSchema = z.object({
  status: z.enum([
    "pending",
    "pending_payment",
    "confirmed",
    "processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refund_requested",
    "refunded",
    "failed",
  ]),
  reason: z.string().max(500).optional(),
});

/**
 * Schema for updating shipping details
 */
const updateShippingSchema = z.object({
  carrier: z.string().max(100).optional(),
  trackingNumber: z.string().max(100).optional(),
  trackingUrl: z.string().url().optional(),
  awbNumber: z.string().max(100).optional(),
  shipmentId: z.string().max(100).optional(),
  estimatedDelivery: z.string().optional(), // ISO date
});

/**
 * Schema for initiating a refund
 */
const refundSchema = z.object({
  amount: z.number().positive().optional(), // If not provided, full refund
  reason: z.string().max(500),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminOrdersApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminOrdersApp.use("*", requireAuth);
adminOrdersApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/orders - List Orders (Admin)
// ============================================================================

adminOrdersApp.get(
  "/",
  zValidator("query", listOrdersQuerySchema),
  async (c) => {
    const {
      page,
      pageSize,
      status,
      paymentStatus,
      orderType,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(orders.status, status));
      }

      if (paymentStatus) {
        conditions.push(eq(orders.paymentStatus, paymentStatus));
      }

      if (orderType) {
        conditions.push(eq(orders.orderType, orderType));
      }

      if (dateFrom) {
        conditions.push(gte(orders.createdAt, dateFrom));
      }

      if (dateTo) {
        conditions.push(lte(orders.createdAt, dateTo));
      }

      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          or(
            ilike(orders.orderNumber, searchPattern),
            ilike(orders.guestEmail, searchPattern),
            ilike(orders.guestPhone, searchPattern)
          )!
        );
      }

      // Build sort order
      const orderByColumn = {
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        total: orders.total,
        orderNumber: orders.orderNumber,
      }[sortBy];

      const orderByDirection = sortOrder === "asc" ? asc : desc;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Get orders with user info
      const orderList = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          guestEmail: orders.guestEmail,
          guestPhone: orders.guestPhone,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          orderType: orders.orderType,
          shippingMethod: orders.shippingMethod,
          shippingCost: orders.shippingCost,
          subtotal: orders.subtotal,
          discount: orders.discount,
          tax: orders.tax,
          total: orders.total,
          itemCount: orders.itemCount,
          currency: orders.currency,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          paidAt: orders.paidAt,
          shippedAt: orders.shippedAt,
          deliveredAt: orders.deliveredAt,
          cancelledAt: orders.cancelledAt,
        })
        .from(orders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderByDirection(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      // Fetch user info for orders with userId
      const userIds = orderList
        .filter((o) => o.userId)
        .map((o) => o.userId as string);

      let userMap: Record<string, { name: string | null; email: string }> = {};
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
            acc[user.id] = { name: user.name, email: user.email };
            return acc;
          },
          {} as Record<string, { name: string | null; email: string }>
        );
      }

      // Add user info to orders
      const ordersWithCustomer = orderList.map((order) => ({
        ...order,
        customer: order.userId
          ? userMap[order.userId]
          : order.guestEmail
            ? { name: null, email: order.guestEmail }
            : null,
      }));

      return c.json({
        items: ordersWithCustomer,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      return c.json({ error: "Failed to fetch orders" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/orders/stats - Get Order Statistics
// ============================================================================

adminOrdersApp.get("/stats", async (c) => {
  try {
    // Get counts by status
    const statusCounts = await db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status);

    // Get counts by payment status
    const paymentStatusCounts = await db
      .select({
        paymentStatus: orders.paymentStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.paymentStatus);

    // Get total revenue (paid orders)
    const revenueResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.total}::numeric), 0)::text`,
      })
      .from(orders)
      .where(eq(orders.paymentStatus, "paid"));

    // Get today's orders count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(gte(orders.createdAt, today));

    // Get this month's revenue
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthRevenueResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.total}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(eq(orders.paymentStatus, "paid"), gte(orders.createdAt, monthStart))
      );

    // Format status counts as object
    const statusCountsMap = statusCounts.reduce(
      (acc, row) => {
        acc[row.status] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    const paymentStatusCountsMap = paymentStatusCounts.reduce(
      (acc, row) => {
        acc[row.paymentStatus] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return c.json({
      byStatus: statusCountsMap,
      byPaymentStatus: paymentStatusCountsMap,
      totalRevenue: revenueResult[0]?.total ?? "0",
      todayOrders: todayCountResult[0]?.count ?? 0,
      monthRevenue: monthRevenueResult[0]?.total ?? "0",
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch order statistics" }, 500);
  }
});

// ============================================================================
// GET /api/admin/orders/:id - Get Order by ID or Order Number (Admin)
// ============================================================================

adminOrdersApp.get("/:id", async (c) => {
  const { id } = c.req.param();

  // Determine if ID is UUID or order number
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

  if (!isUUID && !isOrderNumber) {
    return c.json({ error: "Invalid order ID format" }, 400);
  }

  try {
    // Build where condition
    const whereCondition = isUUID
      ? eq(orders.id, id)
      : eq(orders.orderNumber, id);

    // Get order with items
    const order = await db.query.orders.findFirst({
      where: whereCondition,
      with: {
        items: {
          with: {
            product: {
              columns: {
                id: true,
                slug: true,
                title: true,
                images: true,
                sku: true,
              },
            },
            variant: {
              columns: {
                id: true,
                sizeLabel: true,
                widthInches: true,
                heightInches: true,
                price: true,
              },
            },
            frame: {
              columns: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Fetch approvals for this order
    const approvals = await db
      .select({
        id: productionApprovals.id,
        orderItemId: productionApprovals.orderItemId,
        status: productionApprovals.status,
        approvalToken: productionApprovals.approvalToken,
        deadlineAt: productionApprovals.deadlineAt,
        approvedAt: productionApprovals.approvedAt,
        createdAt: productionApprovals.createdAt,
        updatedAt: productionApprovals.updatedAt,
      })
      .from(productionApprovals)
      .where(eq(productionApprovals.orderId, order.id));

    // Return full order details including all admin-relevant fields
    return c.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      orderType: order.orderType,
      customer: order.user || {
        email: order.guestEmail,
        phone: order.guestPhone,
      },
      shippingAddress: order.shippingAddress,
      shippingDetails: order.shippingDetails,
      shippingMethod: order.shippingMethod,
      shippingCost: order.shippingCost,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      promotionId: order.promotionId,
      promotionDiscount: order.promotionDiscount,
      // Tender, not a discount. Surfaces render it below the total.
      giftCardAmount: order.giftCardAmount,
      tradeDiscount: order.tradeDiscount,
      itemCount: order.itemCount,
      currency: order.currency,
      customerNotes: order.customerNotes,
      internalNotes: order.internalNotes,
      paymentDetails: order.paymentDetails,
      items: order.items.map((item) => ({
        id: item.id,
        snapshot: item.snapshot,
        unitPrice: item.unitPrice,
        framePrice: item.framePrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        itemDiscount: item.itemDiscount,
        isAiGenerated: item.isAiGenerated,
        aiGenerationId: item.aiGenerationId,
        customizations: item.customizations,
        isFulfilled: item.isFulfilled,
        fulfilledAt: item.fulfilledAt,
        product: item.product,
        variant: item.variant,
        frame: item.frame,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      approvals: approvals.map((a) => ({
        id: a.id,
        orderItemId: a.orderItemId,
        status: a.status,
        approvalToken: a.approvalToken,
        deadlineAt: a.deadlineAt,
        approvedAt: a.approvedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch order" }, 500);
  }
});

// ============================================================================
// PATCH /api/admin/orders/:id - Update Order
// ============================================================================

adminOrdersApp.patch(
  "/:id",
  zValidator("json", updateOrderSchema),
  async (c) => {
    const { id } = c.req.param();
    const input = c.req.valid("json");

    // Determine if ID is UUID or order number
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    try {
      // Build where condition
      const whereCondition = isUUID
        ? eq(orders.id, id)
        : eq(orders.orderNumber, id);

      // Check if order exists. paymentStatus comes along because cancelling
      // an UNPAID order has to release any gift card hold, while a paid one
      // must be left to the refund path.
      const existing = await db
        .select({ id: orders.id, paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(whereCondition)
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.status !== undefined) {
        updateData.status = input.status;
        // Set timestamp based on status
        if (input.status === "cancelled") {
          updateData.cancelledAt = new Date();
        } else if (input.status === "shipped") {
          updateData.shippedAt = new Date();
        } else if (input.status === "delivered") {
          updateData.deliveredAt = new Date();
        }
      }

      if (input.paymentStatus !== undefined) {
        updateData.paymentStatus = input.paymentStatus;
        if (input.paymentStatus === "paid") {
          updateData.paidAt = new Date();
        }
      }

      if (input.internalNotes !== undefined) {
        updateData.internalNotes = input.internalNotes;
      }

      if (input.shippingMethod !== undefined) {
        updateData.shippingMethod = input.shippingMethod;
      }

      const existingOrder = existing[0];
      if (!existingOrder) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Update order, releasing any gift card hold in the same transaction —
      // a cancel that fails must not leave the card credited.
      const updatedOrders = await db.transaction(async (tx) => {
        const result = await tx
          .update(orders)
          .set(updateData)
          .where(eq(orders.id, existingOrder.id))
          .returning();

        /**
         * Cancelling an UNPAID order hands the held balance back.
         *
         * Only when unpaid. Once the money has moved, returning it belongs to
         * the refund path, which splits proportionally across tenders and
         * caps what each card may receive. Releasing here as well would
         * credit the card twice.
         */
        if (
          input.status === "cancelled" &&
          existingOrder.paymentStatus !== "paid"
        ) {
          await voidGiftCardHold(tx, existingOrder.id);
        }

        return result;
      });

      const updatedOrder = updatedOrders[0];
      if (!updatedOrder) {
        return c.json({ error: "Failed to update order" }, 500);
      }

      // Create approvals for made-to-order items when moving to processing
      if (input.status === "processing") {
        createApprovalsForOrder(updatedOrder.id).catch((err) => {
          console.error("[Orders] Failed to create approvals:", err);
        });
      }

      return c.json({
        message: "Order updated successfully",
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          paymentStatus: updatedOrder.paymentStatus,
          updatedAt: updatedOrder.updatedAt,
        },
      });
    } catch (error) {
      return c.json({ error: "Failed to update order" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/orders/:id/status - Update Order Status
// ============================================================================

adminOrdersApp.patch(
  "/:id/status",
  zValidator("json", updateStatusSchema),
  async (c) => {
    const { id } = c.req.param();
    const { status, reason } = c.req.valid("json");

    // Determine if ID is UUID or order number
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    try {
      // Build where condition
      const whereCondition = isUUID
        ? eq(orders.id, id)
        : eq(orders.orderNumber, id);

      // Check if order exists. paymentStatus comes along because cancelling
      // an unpaid order releases any gift card hold.
      const existing = await db
        .select({
          id: orders.id,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          internalNotes: orders.internalNotes,
        })
        .from(orders)
        .where(whereCondition)
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };

      // Set timestamp based on status
      if (status === "cancelled") {
        updateData.cancelledAt = new Date();
      } else if (status === "shipped") {
        updateData.shippedAt = new Date();
      } else if (status === "delivered") {
        updateData.deliveredAt = new Date();
      }

      const existingOrder = existing[0];
      if (!existingOrder) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Append reason to internal notes if provided
      if (reason) {
        const existingNotes = existingOrder.internalNotes || "";
        const timestamp = new Date().toISOString();
        const noteAddition = `[${timestamp}] Status changed to ${status}: ${reason}`;
        updateData.internalNotes = existingNotes
          ? `${existingNotes}\n${noteAddition}`
          : noteAddition;
      }

      // Update order, releasing any gift card hold in the same transaction.
      const updatedOrders = await db.transaction(async (tx) => {
        const result = await tx
          .update(orders)
          .set(updateData)
          .where(eq(orders.id, existingOrder.id))
          .returning();

        // Same rule as the general update route: an unpaid cancellation
        // hands the balance back, a paid one is the refund path's business.
        // Both routes can cancel, so a release wired into only one of them
        // would lose balance through the other.
        if (status === "cancelled" && existingOrder.paymentStatus !== "paid") {
          await voidGiftCardHold(tx, existingOrder.id);
        }

        return result;
      });

      const updatedOrder = updatedOrders[0];
      if (!updatedOrder) {
        return c.json({ error: "Failed to update order" }, 500);
      }

      // Trigger notification for status change (non-blocking)
      // This runs in the background and doesn't affect the response
      notifyOrderStatusChange(updatedOrder.id, status).catch((err) => {
        console.error("[Orders] Failed to send notification:", err);
      });

      // Create approvals for made-to-order items when moving to processing
      // This runs in the background and doesn't block the response
      if (status === "processing") {
        createApprovalsForOrder(updatedOrder.id).catch((err) => {
          console.error("[Orders] Failed to create approvals:", err);
        });
      }

      return c.json({
        message: "Order status updated successfully",
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          previousStatus: existingOrder.status,
        },
      });
    } catch (error) {
      return c.json({ error: "Failed to update order status" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/orders/:id/shipping - Update Shipping Details
// ============================================================================

adminOrdersApp.patch(
  "/:id/shipping",
  zValidator("json", updateShippingSchema),
  async (c) => {
    const { id } = c.req.param();
    const input = c.req.valid("json");

    // Determine if ID is UUID or order number
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    try {
      // Build where condition
      const whereCondition = isUUID
        ? eq(orders.id, id)
        : eq(orders.orderNumber, id);

      // Get existing order
      const existing = await db
        .select({
          id: orders.id,
          shippingDetails: orders.shippingDetails,
        })
        .from(orders)
        .where(whereCondition)
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Order not found" }, 404);
      }

      const existingOrder = existing[0];
      if (!existingOrder) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Merge shipping details
      const currentShippingDetails =
        (existingOrder.shippingDetails as OrderShippingDetails) || {};
      const newShippingDetails: OrderShippingDetails = {
        ...currentShippingDetails,
      };

      if (input.carrier !== undefined)
        newShippingDetails.carrier = input.carrier;
      if (input.trackingNumber !== undefined)
        newShippingDetails.trackingNumber = input.trackingNumber;
      if (input.trackingUrl !== undefined)
        newShippingDetails.trackingUrl = input.trackingUrl;
      if (input.awbNumber !== undefined)
        newShippingDetails.awbNumber = input.awbNumber;
      if (input.shipmentId !== undefined)
        newShippingDetails.shipmentId = input.shipmentId;
      if (input.estimatedDelivery !== undefined)
        newShippingDetails.estimatedDelivery = input.estimatedDelivery;

      // If tracking number is being added and shippedAt is not set, set it now
      const updateData: Record<string, unknown> = {
        shippingDetails: newShippingDetails,
        updatedAt: new Date(),
      };

      // Update order
      const updatedOrders = await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, existingOrder.id))
        .returning();

      const updatedOrder = updatedOrders[0];
      if (!updatedOrder) {
        return c.json({ error: "Failed to update shipping details" }, 500);
      }

      return c.json({
        message: "Shipping details updated successfully",
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          shippingDetails: updatedOrder.shippingDetails,
        },
      });
    } catch (error) {
      return c.json({ error: "Failed to update shipping details" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/orders/:id/refund - Initiate Refund
// ============================================================================

adminOrdersApp.post(
  "/:id/refund",
  zValidator("json", refundSchema),
  async (c) => {
    const { id } = c.req.param();
    const { amount, reason } = c.req.valid("json");

    // Check if Razorpay is configured
    if (!isRazorpayConfigured()) {
      return c.json({ error: "Payment gateway not configured" }, 503);
    }

    // Determine if ID is UUID or order number
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    try {
      // Build where condition
      const whereCondition = isUUID
        ? eq(orders.id, id)
        : eq(orders.orderNumber, id);

      // Get existing order
      const existing = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          total: orders.total,
          // Needed to split the refund by tender.
          giftCardAmount: orders.giftCardAmount,
          paymentStatus: orders.paymentStatus,
          paymentDetails: orders.paymentDetails,
          internalNotes: orders.internalNotes,
        })
        .from(orders)
        .where(whereCondition)
        .limit(1);

      if (existing.length === 0) {
        return c.json({ error: "Order not found" }, 404);
      }

      const order = existing[0];
      if (!order) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Validate order can be refunded
      if (order.paymentStatus !== "paid") {
        return c.json(
          { error: "Order has not been paid or already refunded" },
          400
        );
      }

      const paymentDetails = order.paymentDetails as OrderPaymentDetails | null;

      // Calculate refund amount
      const refundAmount = amount || parseFloat(order.total);
      const totalAmount = parseFloat(order.total);

      if (refundAmount > totalAmount) {
        return c.json(
          { error: "Refund amount cannot exceed order total" },
          400
        );
      }

      /**
       * Split the refund by tender, in paise.
       *
       * `refundAmount` is a float in rupees, and splitting a float is how a
       * rupee goes missing. Everything below is integer paise.
       *
       * The Razorpay leg is SUBTRACTED rather than rounded independently, so
       * the two legs always sum to exactly the refund.
       */
      const refundPaise = Math.round(refundAmount * 100);
      const totalPaise = Math.round(totalAmount * 100);
      const giftCardPaise = Math.round(parseFloat(order.giftCardAmount) * 100);
      const capturedPaise = totalPaise - giftCardPaise;

      const giftCardLeg =
        giftCardPaise > 0
          ? Math.round((refundPaise * giftCardPaise) / totalPaise)
          : 0;
      const razorpayLeg = refundPaise - giftCardLeg;

      // The old guard only compared against the order total, which would
      // happily ask Razorpay for more than it ever captured.
      if (razorpayLeg > capturedPaise) {
        return c.json(
          {
            error:
              "Refund exceeds the amount captured by the payment gateway",
          },
          400
        );
      }

      /**
       * Razorpay first, deliberately.
       *
       * If the gateway fails, the gift card has not been credited yet and
       * the whole refund can be retried. Crediting the card first would
       * leave the customer holding balance for a refund that never
       * completed.
       */
      let refund: { id: string; status: string } = {
        id: "",
        status: "processed",
      };

      if (razorpayLeg > 0) {
        // A missing paymentId is only legitimate when gift cards covered
        // everything — which is exactly when this branch does not run.
        if (!paymentDetails?.paymentId) {
          return c.json({ error: "Payment ID not found for this order" }, 400);
        }

        refund = await createRefund({
          paymentId: paymentDetails.paymentId,
          amount: razorpayLeg,
          notes: {
            reason,
            orderNumber: order.orderNumber,
            orderId: order.id,
          },
        });
      }

      if (giftCardLeg > 0) {
        // refundToGiftCards splits this across the cards that paid and caps
        // each at what it actually contributed to this order.
        await db.transaction((tx) =>
          refundToGiftCards(tx, order.id, giftCardLeg),
        );
      }

      // Determine new payment status
      const isFullRefund = refundAmount >= totalAmount;
      const newPaymentStatus: PaymentStatus = isFullRefund
        ? "refunded"
        : "partially_refunded";

      // Update order with refund details
      const timestamp = new Date().toISOString();
      const noteAddition = `[${timestamp}] Refund initiated: ${refundAmount} INR. Reason: ${reason}`;
      const existingNotes = order.internalNotes || "";

      // paymentDetails is legitimately absent when gift cards covered the
      // whole order, so the provider is stated rather than spread from it.
      const updatedPaymentDetails: OrderPaymentDetails = {
        provider: "razorpay",
        ...(paymentDetails ?? {}),
        refundId: refund.id,
        refundAmount: refundAmount,
        refundedAt: timestamp,
      };

      await db
        .update(orders)
        .set({
          status: isFullRefund ? "refunded" : orders.status,
          paymentStatus: newPaymentStatus,
          paymentDetails: updatedPaymentDetails,
          internalNotes: existingNotes
            ? `${existingNotes}\n${noteAddition}`
            : noteAddition,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      return c.json({
        message: "Refund initiated successfully",
        refund: {
          id: refund.id,
          amount: refundAmount,
          currency: "INR",
          status: refund.status,
          orderNumber: order.orderNumber,
        },
      });
    } catch (error) {
      if (error instanceof RazorpayError) {
        return c.json(
          { error: `Refund failed: ${error.message}` },
          500
        );
      }
      return c.json({ error: "Failed to process refund" }, 500);
    }
  }
);

// Export the router
export { adminOrdersApp };
export default adminOrdersApp;
