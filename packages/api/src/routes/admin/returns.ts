/**
 * Admin Returns API Routes
 *
 * Provides admin API endpoints for return request management:
 * - GET /api/admin/returns - List all return requests with filters
 * - GET /api/admin/returns/stats - Get return statistics
 * - GET /api/admin/returns/:id - Get return request details
 * - PATCH /api/admin/returns/:id - Update return request
 * - POST /api/admin/returns/:id/approve - Approve return request
 * - POST /api/admin/returns/:id/reject - Reject return request
 * - POST /api/admin/returns/:id/process-refund - Process refund
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, gte, lte, inArray } from "drizzle-orm";

import { db } from "../../database";
import {
  returnRequests,
  returnStatusEnum,
  returnReasonEnum,
  refundTypeEnum,
  type ReturnStatus,
  type ReturnReason,
  type RefundType,
} from "../../database/schema/returns";
import { orders, type PaymentStatus } from "../../database/schema/orders";
import { users } from "../../database/schema/users";
import { giftCards } from "../../database/schema/gift-cards";
import { issueGiftCard } from "../../services/gift-card";
import { sendGiftCardEmail } from "../../services/gift-card-delivery";
import {
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from "@chobii/shared";
import { recordAudit } from "../../lib/audit";

/**
 * Store credit and a card refund are both "the money came back", but they are
 * not the same event: one issues a bearer instrument that stays on our books,
 * the other releases cash. Finance filters on them separately.
 */
const auditActionFor = (refundType: string) =>
  refundType === "store_credit"
    ? ("return.store_credit_issued" as const)
    : ("return.refund_processed" as const);
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Valid enum values
const RETURN_STATUS_VALUES = returnStatusEnum.enumValues;
const RETURN_REASON_VALUES = returnReasonEnum.enumValues;
const REFUND_TYPE_VALUES = refundTypeEnum.enumValues;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for listing return requests
 */
const listReturnsSchema = z.object({
  status: z.enum(RETURN_STATUS_VALUES as unknown as [string, ...string[]]).optional(),
  reason: z.enum(RETURN_REASON_VALUES as unknown as [string, ...string[]]).optional(),
  userId: z.string().optional(),
  orderId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["requestedAt", "status", "createdAt"]).default("requestedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Schema for updating a return request
 */
const updateReturnSchema = z.object({
  status: z.enum(RETURN_STATUS_VALUES as unknown as [string, ...string[]]).optional(),
  adminNotes: z.string().max(2000).optional().nullable(),
  refundAmount: z.number().min(0).optional(),
});

/**
 * Schema for rejecting a return request
 */
const rejectReturnSchema = z.object({
  reason: z.string().min(10).max(1000),
});

/**
 * Schema for processing a refund
 */
const processRefundSchema = z.object({
  refundAmount: z.number().positive(),
  refundType: z.enum(REFUND_TYPE_VALUES as unknown as [string, ...string[]]),
});

/**
 * Settles a return as store credit: a gift card for the refund amount, emailed
 * to the customer.
 *
 * Deliberately its own function, called from exactly one place under an
 * explicit `refundType === "store_credit"` test. Store credit is a
 * substitution — the customer is given a voucher *instead of* their money —
 * and an ordinary refund goes back proportionally to whatever paid for the
 * order (#557). It must never become what happens when a gateway refund
 * fails: doing that to someone's card payment without their agreement is what
 * invites chargebacks.
 *
 * Consent is checked by the caller before anything is created.
 */
async function issueStoreCredit(input: {
  returnId: string;
  orderId: string;
  orderNumber: string;
  refundAmountPaise: number;
  customerEmail: string;
  customerName: string | null;
}): Promise<{ giftCardId: string }> {
  const { card, code } = await issueGiftCard({
    amountPaise: input.refundAmountPaise,
    recipientEmail: input.customerEmail,
    recipientName: input.customerName,
    senderName: "chobii.art",
    // The code exists once, in this return value. It is emailed below and
    // never stored, logged, or returned to the admin caller.
    description: `Store credit for return ${input.returnId.slice(0, 8)} on order ${input.orderId.slice(0, 8)} (${input.orderNumber})`,
  });

  await sendGiftCardEmail(card, code);

  await db
    .update(giftCards)
    .set({ sentAt: new Date() })
    .where(eq(giftCards.id, card.id));

  return { giftCardId: card.id };
}

// ============================================================================
// Route Handler
// ============================================================================

const adminReturnsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminReturnsApp.use("*", requireAuth);
adminReturnsApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/returns - List All Return Requests
// ============================================================================

adminReturnsApp.get(
  "/",
  zValidator("query", listReturnsSchema),
  async (c) => {
    const {
      status,
      reason,
      userId,
      orderId,
      dateFrom,
      dateTo,
      page,
      pageSize,
      sortBy,
      sortOrder: order,
    } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(returnRequests.status, status as ReturnStatus));
      }

      if (reason) {
        conditions.push(eq(returnRequests.reason, reason as ReturnReason));
      }

      if (userId) {
        conditions.push(eq(returnRequests.userId, userId));
      }

      if (orderId) {
        conditions.push(eq(returnRequests.orderId, orderId));
      }

      if (dateFrom) {
        conditions.push(gte(returnRequests.requestedAt, new Date(dateFrom)));
      }

      if (dateTo) {
        conditions.push(lte(returnRequests.requestedAt, new Date(dateTo)));
      }

      // Build sort order
      const orderFn = order === "asc" ? asc : desc;
      const orderByColumn = {
        requestedAt: returnRequests.requestedAt,
        status: returnRequests.status,
        createdAt: returnRequests.createdAt,
      }[sortBy];

      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(returnRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Get return requests with order info
      const returnsList = await db
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
          adminNotes: returnRequests.adminNotes,
          createdAt: returnRequests.createdAt,
          order: {
            id: orders.id,
            orderNumber: orders.orderNumber,
            total: orders.total,
            status: orders.status,
          },
        })
        .from(returnRequests)
        .innerJoin(orders, eq(returnRequests.orderId, orders.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderFn(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      // Get user info
      const userIds = [...new Set(returnsList.map((r) => r.userId))];
      let userMap: Record<string, { id: string; name: string | null; email: string }> = {};

      if (userIds.length > 0) {
        const userList = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          // Not `sql\`${users.id} = ANY(${userIds})\``: that interpolates one
          // parameter per element, rendering `= ANY(($1, $2))` — ANY over a row
          // expression, which Postgres refuses with "op ANY/ALL (array)
          // requires array on right side". This list 500ed as soon as it
          // contained a single return. Same fix as orders (#624).
          .where(inArray(users.id, userIds));

        userMap = userList.reduce(
          (acc, user) => {
            acc[user.id] = user;
            return acc;
          },
          {} as Record<string, { id: string; name: string | null; email: string }>
        );
      }

      // Add user info to returns
      const returnsWithUsers = returnsList.map((returnReq) => ({
        ...returnReq,
        customer: userMap[returnReq.userId] || null,
      }));

      return c.json({
        items: returnsWithUsers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error fetching return requests:", error);
      return c.json({ error: "Failed to fetch return requests" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/returns/stats - Get Return Statistics
// ============================================================================

adminReturnsApp.get("/stats", async (c) => {
  try {
    // Get counts by status
    const statusCounts = await db
      .select({
        status: returnRequests.status,
        count: sql<number>`count(*)::int`,
      })
      .from(returnRequests)
      .groupBy(returnRequests.status);

    // Get counts by reason
    const reasonCounts = await db
      .select({
        reason: returnRequests.reason,
        count: sql<number>`count(*)::int`,
      })
      .from(returnRequests)
      .groupBy(returnRequests.reason);

    // Get today's count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(returnRequests)
      .where(gte(returnRequests.requestedAt, today));

    // Get total refund amount
    const refundTotalResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${returnRequests.refundAmount})::numeric(10,2), 0)::text`,
      })
      .from(returnRequests)
      .where(eq(returnRequests.status, "refunded" as ReturnStatus));

    // Format status counts
    const statusCountsMap = statusCounts.reduce(
      (acc, row) => {
        acc[row.status] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    // Format reason counts
    const reasonCountsMap = reasonCounts.reduce(
      (acc, row) => {
        acc[row.reason] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return c.json({
      byStatus: {
        pending: statusCountsMap.pending || 0,
        approved: statusCountsMap.approved || 0,
        rejected: statusCountsMap.rejected || 0,
        shipped_back: statusCountsMap.shipped_back || 0,
        received: statusCountsMap.received || 0,
        refunded: statusCountsMap.refunded || 0,
        closed: statusCountsMap.closed || 0,
      },
      byReason: {
        defective: reasonCountsMap.defective || 0,
        wrong_item: reasonCountsMap.wrong_item || 0,
        not_as_described: reasonCountsMap.not_as_described || 0,
        changed_mind: reasonCountsMap.changed_mind || 0,
        other: reasonCountsMap.other || 0,
      },
      today: todayCountResult[0]?.count ?? 0,
      totalRefunded: parseFloat(refundTotalResult[0]?.total || "0"),
      total: Object.values(statusCountsMap).reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    console.error("Error fetching return statistics:", error);
    return c.json({ error: "Failed to fetch return statistics" }, 500);
  }
});

// ============================================================================
// GET /api/admin/returns/:id - Get Return Request Details
// ============================================================================

adminReturnsApp.get("/:id", async (c) => {
  const returnId = c.req.param("id");

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
        adminNotes: returnRequests.adminNotes,
        createdAt: returnRequests.createdAt,
        updatedAt: returnRequests.updatedAt,
        order: {
          id: orders.id,
          orderNumber: orders.orderNumber,
          total: orders.total,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          shippingAddress: orders.shippingAddress,
          deliveredAt: orders.deliveredAt,
        },
      })
      .from(returnRequests)
      .innerJoin(orders, eq(returnRequests.orderId, orders.id))
      .where(eq(returnRequests.id, returnId))
      .limit(1);

    const returnReq = returnResult[0];

    if (!returnReq) {
      return c.json({ error: "Return request not found" }, 404);
    }

    // Get customer info
    const customerResult = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, returnReq.userId))
      .limit(1);

    return c.json({
      ...returnReq,
      customer: customerResult[0] || null,
    });
  } catch (error) {
    console.error("Error fetching return request:", error);
    return c.json({ error: "Failed to fetch return request" }, 500);
  }
});

// ============================================================================
// PATCH /api/admin/returns/:id - Update Return Request
// ============================================================================

adminReturnsApp.patch(
  "/:id",
  zValidator("json", updateReturnSchema),
  async (c) => {
    const returnId = c.req.param("id");
    const updates = c.req.valid("json");

    // Validate UUID format
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return c.json({ error: "Invalid return ID" }, 400);
    }

    // Must provide at least one field to update
    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    try {
      // Check if return exists
      const existingResult = await db
        .select({ id: returnRequests.id, status: returnRequests.status })
        .from(returnRequests)
        .where(eq(returnRequests.id, returnId))
        .limit(1);

      if (!existingResult.length) {
        return c.json({ error: "Return request not found" }, 404);
      }

      // Build update object
      const updateData: Record<string, unknown> = {};

      if (updates.status !== undefined) {
        updateData.status = updates.status;

        // Update timestamps based on status
        if (updates.status === "approved") {
          updateData.approvedAt = new Date();
        } else if (updates.status === "refunded") {
          updateData.processedAt = new Date();
        }
      }

      if (updates.adminNotes !== undefined) {
        updateData.adminNotes = updates.adminNotes;
      }

      if (updates.refundAmount !== undefined) {
        updateData.refundAmount = updates.refundAmount.toFixed(2);
      }

      // Update the return request
      const [updatedReturn] = await db
        .update(returnRequests)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(returnRequests.id, returnId))
        .returning();

      await recordAudit(c, {
        action: "return.status_changed",
        entityType: "return",
        entityId: returnId,
        summary: `Edited return ${returnId}${
          updates.status ? ` → ${updates.status}` : ""
        }`,
        before: { status: existingResult[0]?.status ?? null },
        after: {
          status: updatedReturn?.status ?? null,
          ...(updates.refundAmount !== undefined
            ? { refundAmount: updatedReturn?.refundAmount ?? null }
            : {}),
          ...(updates.adminNotes !== undefined
            ? { adminNotes: updatedReturn?.adminNotes ?? null }
            : {}),
        },
      });

      return c.json({
        message: "Return request updated successfully",
        return: updatedReturn,
      });
    } catch (error) {
      console.error("Error updating return request:", error);
      return c.json({ error: "Failed to update return request" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/returns/:id/approve - Approve Return Request
// ============================================================================

adminReturnsApp.post("/:id/approve", async (c) => {
  const returnId = c.req.param("id");

  // Validate UUID format
  if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
    return c.json({ error: "Invalid return ID" }, 400);
  }

  try {
    // Get existing return
    const existingResult = await db
      .select({
        id: returnRequests.id,
        status: returnRequests.status,
        orderId: returnRequests.orderId,
      })
      .from(returnRequests)
      .where(eq(returnRequests.id, returnId))
      .limit(1);

    const existing = existingResult[0];

    if (!existing) {
      return c.json({ error: "Return request not found" }, 404);
    }

    // Can only approve pending returns
    if (existing.status !== "pending") {
      // A refused approval is evidence: "who tried to re-approve a refunded
      // return" is exactly the question an investigation asks.
      await recordAudit(c, {
        action: "return.approved",
        entityType: "return",
        entityId: returnId,
        outcome: "failure",
        summary: `Refused: cannot approve a return in status '${existing.status}'`,
        before: { status: existing.status },
      });

      return c.json(
        {
          error: `Cannot approve return request with status '${existing.status}'. Only pending requests can be approved.`,
        },
        400
      );
    }

    // Update the return request
    const [approvedReturn] = await db
      .update(returnRequests)
      .set({
        status: "approved",
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(returnRequests.id, returnId))
      .returning();

    // Update order status to refund_requested
    await db
      .update(orders)
      .set({
        status: "refund_requested",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, existing.orderId));

    await recordAudit(c, {
      action: "return.approved",
      entityType: "return",
      entityId: returnId,
      summary: `Approved return ${returnId} on order ${existing.orderId}`,
      before: { status: existing.status },
      after: { status: approvedReturn?.status ?? "approved" },
      metadata: { orderId: existing.orderId },
    });

    return c.json({
      message: "Return request approved successfully",
      return: approvedReturn,
    });
  } catch (error) {
    console.error("Error approving return request:", error);
    return c.json({ error: "Failed to approve return request" }, 500);
  }
});

// ============================================================================
// POST /api/admin/returns/:id/reject - Reject Return Request
// ============================================================================

adminReturnsApp.post(
  "/:id/reject",
  zValidator("json", rejectReturnSchema),
  async (c) => {
    const returnId = c.req.param("id");
    const { reason } = c.req.valid("json");

    // Validate UUID format
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return c.json({ error: "Invalid return ID" }, 400);
    }

    try {
      // Get existing return
      const existingResult = await db
        .select({
          id: returnRequests.id,
          status: returnRequests.status,
        })
        .from(returnRequests)
        .where(eq(returnRequests.id, returnId))
        .limit(1);

      const existing = existingResult[0];

      if (!existing) {
        return c.json({ error: "Return request not found" }, 404);
      }

      // Can only reject pending returns
      if (existing.status !== "pending") {
        return c.json(
          {
            error: `Cannot reject return request with status '${existing.status}'. Only pending requests can be rejected.`,
          },
          400
        );
      }

      // Update the return request
      const [rejectedReturn] = await db
        .update(returnRequests)
        .set({
          status: "rejected",
          adminNotes: reason,
          updatedAt: new Date(),
        })
        .where(eq(returnRequests.id, returnId))
        .returning();

      await recordAudit(c, {
        action: "return.rejected",
        entityType: "return",
        entityId: returnId,
        summary: `Rejected return ${returnId}: ${reason}`,
        before: { status: existing.status },
        after: {
          status: rejectedReturn?.status ?? "rejected",
          adminNotes: rejectedReturn?.adminNotes ?? reason,
        },
      });

      return c.json({
        message: "Return request rejected",
        return: rejectedReturn,
      });
    } catch (error) {
      console.error("Error rejecting return request:", error);
      return c.json({ error: "Failed to reject return request" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/returns/:id/process-refund - Process Refund
// ============================================================================

adminReturnsApp.post(
  "/:id/process-refund",
  zValidator("json", processRefundSchema),
  async (c) => {
    const returnId = c.req.param("id");
    const { refundAmount, refundType } = c.req.valid("json");

    // Validate UUID format
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return c.json({ error: "Invalid return ID" }, 400);
    }

    try {
      // Get existing return with order info
      const existingResult = await db
        .select({
          id: returnRequests.id,
          status: returnRequests.status,
          orderId: returnRequests.orderId,
          storeCreditAcceptedAt: returnRequests.storeCreditAcceptedAt,
          storeCreditGiftCardId: returnRequests.storeCreditGiftCardId,
          customerEmail: users.email,
          customerName: users.name,
          order: {
            id: orders.id,
            total: orders.total,
            orderNumber: orders.orderNumber,
          },
        })
        .from(returnRequests)
        .innerJoin(orders, eq(returnRequests.orderId, orders.id))
        .innerJoin(users, eq(returnRequests.userId, users.id))
        .where(eq(returnRequests.id, returnId))
        .limit(1);

      const existing = existingResult[0];

      if (!existing) {
        return c.json({ error: "Return request not found" }, 404);
      }

      // Can only process refund for approved/received returns
      const refundableStatuses: ReturnStatus[] = ["approved", "shipped_back", "received"];
      if (!refundableStatuses.includes(existing.status as ReturnStatus)) {
        await recordAudit(c, {
          action: auditActionFor(refundType),
          entityType: "return",
          entityId: returnId,
          outcome: "failure",
          summary: `Refused: cannot refund a return in status '${existing.status}'`,
          before: { status: existing.status },
          metadata: { refundAmount, refundType },
        });

        return c.json(
          {
            error: `Cannot process refund for return request with status '${existing.status}'. Return must be approved first.`,
          },
          400
        );
      }

      // Validate refund amount against order total
      const orderTotal = parseFloat(existing.order.total);
      if (refundAmount > orderTotal) {
        await recordAudit(c, {
          action: auditActionFor(refundType),
          entityType: "return",
          entityId: returnId,
          outcome: "failure",
          summary: `Refused: refund of ${refundAmount} exceeds the order total of ${orderTotal}`,
          metadata: { refundAmount, refundType, orderTotal, orderId: existing.orderId },
        });

        return c.json(
          {
            error: `Refund amount (${refundAmount}) cannot exceed order total (${orderTotal})`,
          },
          400
        );
      }

      const isStoreCredit = refundType === "store_credit";
      let storeCreditGiftCardId: string | null = null;

      if (isStoreCredit) {
        // Consent, checked before anything is created. The customer has to
        // have agreed to take a voucher instead of their money; substituting
        // it silently is what invites chargebacks.
        if (!existing.storeCreditAcceptedAt) {
          await recordAudit(c, {
            action: "return.store_credit_issued",
            entityType: "return",
            entityId: returnId,
            outcome: "failure",
            summary:
              "Refused: store credit attempted without the customer's recorded consent",
            metadata: { refundAmount, orderId: existing.orderId },
          });

          return c.json(
            {
              error:
                "This return cannot be settled as store credit: the customer has not accepted store credit for it.",
            },
            400,
          );
        }

        // Belt to the status guard's braces. Re-settling is already blocked
        // because the return leaves the refundable statuses, but a duplicate
        // here is duplicated money.
        if (existing.storeCreditGiftCardId) {
          await recordAudit(c, {
            action: "return.store_credit_issued",
            entityType: "return",
            entityId: returnId,
            outcome: "failure",
            summary: "Refused: store credit was already issued for this return",
            metadata: {
              refundAmount,
              existingGiftCardId: existing.storeCreditGiftCardId,
            },
          });

          return c.json(
            { error: "Store credit has already been issued for this return" },
            400,
          );
        }

        const refundAmountPaise = Math.round(refundAmount * 100);

        // A card has a floor and a ceiling, and a refund does not. Say so
        // rather than quietly rounding someone's money to fit.
        if (refundAmountPaise < GIFT_CARD_MIN_PAISE) {
          return c.json(
            {
              error: `Store credit must be at least Rs ${GIFT_CARD_MIN_PAISE / 100}. Refund this return to the original payment method instead.`,
            },
            400,
          );
        }
        if (refundAmountPaise > GIFT_CARD_MAX_PAISE) {
          return c.json(
            {
              error: `Store credit cannot exceed Rs ${GIFT_CARD_MAX_PAISE / 100}. Refund this return to the original payment method instead.`,
            },
            400,
          );
        }

        // Before the return is marked refunded: if issuing or emailing fails,
        // the return stays settleable rather than closing with nothing behind
        // it.
        const issued = await issueStoreCredit({
          returnId,
          orderId: existing.orderId,
          orderNumber: existing.order.orderNumber,
          refundAmountPaise,
          customerEmail: existing.customerEmail,
          customerName: existing.customerName,
        });
        storeCreditGiftCardId = issued.giftCardId;
      }

      const now = new Date();

      // Update the return request
      const [refundedReturn] = await db
        .update(returnRequests)
        .set({
          status: "refunded",
          refundAmount: refundAmount.toFixed(2),
          refundType: refundType as RefundType,
          storeCreditGiftCardId,
          processedAt: now,
          updatedAt: now,
        })
        .where(eq(returnRequests.id, returnId))
        .returning();

      // Update order payment status
      const newPaymentStatus: PaymentStatus =
        refundAmount >= orderTotal ? "refunded" : "partially_refunded";

      await db
        .update(orders)
        .set({
          status: "refunded",
          paymentStatus: newPaymentStatus,
          updatedAt: now,
        })
        .where(eq(orders.id, existing.orderId));

      await recordAudit(c, {
        action: auditActionFor(refundType),
        entityType: "return",
        entityId: returnId,
        summary: isStoreCredit
          ? `Issued store credit of ${refundAmount} for return ${returnId} on order ${existing.order.orderNumber}`
          : `Refunded ${refundAmount} (${refundType}) on return ${returnId}, order ${existing.order.orderNumber}`,
        before: { status: existing.status, paymentStatus: null },
        after: {
          status: refundedReturn?.status ?? "refunded",
          refundAmount: refundedReturn?.refundAmount ?? refundAmount.toFixed(2),
          refundType,
          paymentStatus: newPaymentStatus,
          storeCreditGiftCardId,
        },
        metadata: {
          orderId: existing.orderId,
          orderNumber: existing.order.orderNumber,
          orderTotal,
        },
      });

      return c.json({
        message: isStoreCredit
          ? "Store credit issued and emailed to the customer"
          : "Refund processed successfully",
        return: refundedReturn,
        refund: {
          amount: refundAmount,
          type: refundType,
          processedAt: now.toISOString(),
          // The id, never the code. The plaintext went to the customer's
          // inbox; putting it here would leave a bearer instrument in a
          // support tool's network log.
          storeCreditGiftCardId,
        },
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      return c.json({ error: "Failed to process refund" }, 500);
    }
  }
);

// Export the router and schemas
export {
  adminReturnsApp,
  listReturnsSchema,
  updateReturnSchema,
  rejectReturnSchema,
  processRefundSchema,
};
export default adminReturnsApp;
