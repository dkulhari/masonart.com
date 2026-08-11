/**
 * Returns API Routes
 *
 * Provides public API endpoints for return requests:
 * - GET /api/orders/:orderId/returns - Get return requests for an order
 * - POST /api/orders/:orderId/returns - Create a return request
 * - GET /api/returns/:id - Get return request details
 * - DELETE /api/returns/:id - Cancel a pending return request
 * - GET /api/return-policies - Get active return policies
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "../database";
import {
  returnRequests,
  returnPolicies,
  returnReasonEnum,
  type ReturnReason,
  type ReturnStatus,
} from "../database/schema/returns";
import { orders } from "../database/schema/orders";
import {
  requireAuth,
  canAccess,
  type AuthVariables,
} from "../middleware/auth";
import { getCached, setCached } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL_RETURN_POLICIES = 3600; // 1 hour
const RETURN_CACHE_PREFIX = "returns:";
const DEFAULT_RETURN_WINDOW_DAYS = 30; // Default return window if no policy defined

// Valid return reason values from enum
const RETURN_REASON_VALUES = returnReasonEnum.enumValues;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for creating a return request
 */
const createReturnSchema = z.object({
  reason: z.enum(RETURN_REASON_VALUES as unknown as [string, ...string[]]),
  reasonDetails: z.string().min(10).max(2000),
  /**
   * The customer accepts store credit instead of their money back.
   *
   * Opt-in, defaulting to false: taking someone's card payment and returning
   * a voucher without their agreement is what invites chargebacks. The
   * acceptance is stored with a timestamp, and an admin cannot settle a
   * return as store credit without one (#577).
   */
  acceptStoreCredit: z.boolean().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an order is eligible for return
 */
async function checkReturnEligibility(
  orderId: string,
  userId: string
): Promise<{
  eligible: boolean;
  reason?: string;
  order?: {
    id: string;
    status: string;
    deliveredAt: Date | null;
    total: string;
  };
  daysRemaining?: number;
}> {
  // Get the order
  const orderResult = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      deliveredAt: orders.deliveredAt,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderResult.length) {
    return { eligible: false, reason: "Order not found" };
  }

  const order = orderResult[0]!;

  // Check ownership
  if (order.userId !== userId) {
    return { eligible: false, reason: "You can only request returns for your own orders" };
  }

  // Check if order is delivered
  if (order.status !== "delivered") {
    return {
      eligible: false,
      reason: `Cannot request return for order with status '${order.status}'. Order must be delivered first.`,
    };
  }

  // Check if there's already a pending/active return
  const existingReturn = await db
    .select({ id: returnRequests.id, status: returnRequests.status })
    .from(returnRequests)
    .where(
      and(
        eq(returnRequests.orderId, orderId),
        eq(returnRequests.userId, userId)
      )
    )
    .limit(1);

  if (existingReturn.length) {
    const existingStatus = existingReturn[0]!.status as ReturnStatus;
    if (!["rejected", "closed"].includes(existingStatus)) {
      return {
        eligible: false,
        reason: `A return request already exists for this order with status '${existingStatus}'`,
      };
    }
  }

  // Check if within return window
  if (!order.deliveredAt) {
    return { eligible: false, reason: "Order delivery date not recorded" };
  }

  // Get active return policy
  const policy = await db
    .select({
      daysAllowed: returnPolicies.daysAllowed,
    })
    .from(returnPolicies)
    .where(eq(returnPolicies.isActive, true))
    .orderBy(asc(returnPolicies.createdAt))
    .limit(1);

  const returnWindowDays = policy.length ? policy[0]!.daysAllowed : DEFAULT_RETURN_WINDOW_DAYS;
  const deliveredDate = new Date(order.deliveredAt);
  const returnDeadline = new Date(deliveredDate);
  returnDeadline.setDate(returnDeadline.getDate() + returnWindowDays);

  const now = new Date();
  const daysRemaining = Math.ceil(
    (returnDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (now > returnDeadline) {
    return {
      eligible: false,
      reason: `Return window has expired. Returns must be requested within ${returnWindowDays} days of delivery.`,
      daysRemaining: 0,
    };
  }

  return {
    eligible: true,
    order: {
      id: order.id,
      status: order.status,
      deliveredAt: order.deliveredAt,
      total: order.total,
    },
    daysRemaining,
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

// Public policies endpoint (no auth required)
// Note: This endpoint is fully public and doesn't need any auth middleware
const returnPoliciesApp = new Hono();

/**
 * GET /api/return-policies - Get active return policies
 * Public endpoint for displaying return policy info
 */
returnPoliciesApp.get("/", async (c) => {
  const cacheKey = `${RETURN_CACHE_PREFIX}policies:active`;

  // Try cache first
  const cached = await getCached<unknown[]>(cacheKey);
  if (cached) {
    return c.json({
      policies: cached,
      fromCache: true,
    });
  }

  try {
    const policies = await db
      .select({
        id: returnPolicies.id,
        name: returnPolicies.name,
        description: returnPolicies.description,
        daysAllowed: returnPolicies.daysAllowed,
        conditionRequired: returnPolicies.conditionRequired,
        refundType: returnPolicies.refundType,
        refundPercentage: returnPolicies.refundPercentage,
      })
      .from(returnPolicies)
      .where(eq(returnPolicies.isActive, true))
      .orderBy(asc(returnPolicies.createdAt));

    // Cache the result
    await setCached(cacheKey, policies, CACHE_TTL_RETURN_POLICIES);

    return c.json({
      policies,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error fetching return policies:", error);
    return c.json({ error: "Failed to fetch return policies" }, 500);
  }
});

// Protected returns routes.
// Auth is scoped to this app's own paths, never "*": the app is mounted at
// bare /api (index.ts), so a wildcard here auth-gates every later-registered
// /api route — including /api/health, public tracking, and payment webhooks.
const returnsApp = new Hono<{ Variables: AuthVariables }>();
returnsApp.use("/orders/:orderId/returns", requireAuth);
returnsApp.use("/returns/:id", requireAuth);

/**
 * GET /api/orders/:orderId/returns - Get return requests for an order
 */
returnsApp.get("/orders/:orderId/returns", async (c) => {
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
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult.length) {
      return c.json({ error: "Order not found" }, 404);
    }

    const order = orderResult[0]!;

    // Check if user owns the order (unless admin); guest orders (null userId) are admin-only
    if (!canAccess(user, order.userId ?? "")) {
      throw new HTTPException(403, { message: "You can only view returns for your own orders" });
    }

    // Get return requests for the order
    const returnsList = await db
      .select({
        id: returnRequests.id,
        orderId: returnRequests.orderId,
        reason: returnRequests.reason,
        reasonDetails: returnRequests.reasonDetails,
        status: returnRequests.status,
        requestedAt: returnRequests.requestedAt,
        approvedAt: returnRequests.approvedAt,
        processedAt: returnRequests.processedAt,
        refundAmount: returnRequests.refundAmount,
        createdAt: returnRequests.createdAt,
      })
      .from(returnRequests)
      .where(eq(returnRequests.orderId, orderId));

    // Check eligibility for creating new return
    const eligibility = await checkReturnEligibility(orderId, user.id);

    return c.json({
      orderId,
      orderNumber: order.orderNumber,
      returns: returnsList,
      totalReturns: returnsList.length,
      canRequestReturn: eligibility.eligible,
      eligibilityMessage: eligibility.eligible ? undefined : eligibility.reason,
      daysRemaining: eligibility.daysRemaining,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching order returns:", error);
    return c.json({ error: "Failed to fetch returns" }, 500);
  }
});

/**
 * POST /api/orders/:orderId/returns - Create a return request
 */
returnsApp.post(
  "/orders/:orderId/returns",
  zValidator("json", createReturnSchema),
  async (c) => {
    const orderId = c.req.param("orderId");
    const { reason, reasonDetails, acceptStoreCredit } = c.req.valid("json");
    const user = c.get("user");

    // Validate UUID format
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return c.json({ error: "Invalid order ID" }, 400);
    }

    try {
      // Check eligibility
      const eligibility = await checkReturnEligibility(orderId, user.id);

      if (!eligibility.eligible) {
        return c.json({ error: eligibility.reason }, 400);
      }

      // Create the return request
      const [newReturn] = await db
        .insert(returnRequests)
        .values({
          orderId,
          userId: user.id,
          reason: reason as ReturnReason,
          reasonDetails,
          status: "pending",
          // When, not whether: an admin settling this as store credit later
          // needs to point at the moment the customer agreed.
          storeCreditAcceptedAt: acceptStoreCredit ? new Date() : null,
        })
        .returning();

      return c.json(
        {
          message: "Return request submitted successfully",
          return: {
            id: newReturn!.id,
            orderId: newReturn!.orderId,
            reason: newReturn!.reason,
            reasonDetails: newReturn!.reasonDetails,
            status: newReturn!.status,
            requestedAt: newReturn!.requestedAt,
            storeCreditAcceptedAt: newReturn!.storeCreditAcceptedAt,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error creating return request:", error);
      return c.json({ error: "Failed to create return request" }, 500);
    }
  }
);

/**
 * GET /api/returns/:id - Get return request details
 */
returnsApp.get("/returns/:id", async (c) => {
  const returnId = c.req.param("id");
  const user = c.get("user");

  // Validate UUID format
  if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
    return c.json({ error: "Invalid return ID" }, 400);
  }

  try {
    const returnResult = await db
      .select({
        id: returnRequests.id,
        orderId: returnRequests.orderId,
        userId: returnRequests.userId,
        reason: returnRequests.reason,
        reasonDetails: returnRequests.reasonDetails,
        status: returnRequests.status,
        requestedAt: returnRequests.requestedAt,
        approvedAt: returnRequests.approvedAt,
        processedAt: returnRequests.processedAt,
        refundAmount: returnRequests.refundAmount,
        createdAt: returnRequests.createdAt,
        order: {
          id: orders.id,
          orderNumber: orders.orderNumber,
          total: orders.total,
        },
      })
      .from(returnRequests)
      .innerJoin(orders, eq(returnRequests.orderId, orders.id))
      .where(eq(returnRequests.id, returnId))
      .limit(1);

    if (!returnResult.length) {
      return c.json({ error: "Return request not found" }, 404);
    }

    const returnRequest = returnResult[0]!;

    // Check ownership (unless admin)
    if (!canAccess(user, returnRequest.userId)) {
      throw new HTTPException(403, { message: "You can only view your own return requests" });
    }

    return c.json({ return: returnRequest });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching return request:", error);
    return c.json({ error: "Failed to fetch return request" }, 500);
  }
});

/**
 * DELETE /api/returns/:id - Cancel a pending return request
 */
returnsApp.delete("/returns/:id", async (c) => {
  const returnId = c.req.param("id");
  const user = c.get("user");

  // Validate UUID format
  if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
    return c.json({ error: "Invalid return ID" }, 400);
  }

  try {
    // Get the return request
    const existingResult = await db
      .select({
        id: returnRequests.id,
        userId: returnRequests.userId,
        status: returnRequests.status,
      })
      .from(returnRequests)
      .where(eq(returnRequests.id, returnId))
      .limit(1);

    if (!existingResult.length) {
      return c.json({ error: "Return request not found" }, 404);
    }

    const existing = existingResult[0]!;

    // Check ownership
    if (!canAccess(user, existing.userId)) {
      throw new HTTPException(403, { message: "You can only cancel your own return requests" });
    }

    // Can only cancel pending returns
    if (existing.status !== "pending") {
      return c.json(
        {
          error: `Cannot cancel return request with status '${existing.status}'. Only pending requests can be cancelled.`,
        },
        400
      );
    }

    // Delete the return request
    await db.delete(returnRequests).where(eq(returnRequests.id, returnId));

    return c.json({
      message: "Return request cancelled successfully",
      returnId,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error cancelling return request:", error);
    return c.json({ error: "Failed to cancel return request" }, 500);
  }
});

// Export the routers and schemas
export {
  returnsApp,
  returnPoliciesApp,
  createReturnSchema,
  checkReturnEligibility,
  RETURN_CACHE_PREFIX,
  CACHE_TTL_RETURN_POLICIES,
  DEFAULT_RETURN_WINDOW_DAYS,
};
export default returnsApp;
