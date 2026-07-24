/**
 * Public Approvals API Routes
 *
 * Provides public API endpoints for production photo approvals:
 * - GET /api/approvals/:token - Get approval details by token
 * - POST /api/approvals/:token/changes - Request changes to production photos
 * - POST /api/approvals/:token/approve - Approve for shipping
 *
 * These endpoints do NOT require authentication - they use secure tokens for access.
 * Each token is unique per approval and provides access to that specific approval only.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  getApprovalByToken,
  requestChanges,
  approveProduction,
} from "../services/approval";
import { sendEmail } from "../services/email";
import {
  getApprovalConfirmedTemplate,
  type ApprovalEmailContext,
} from "../services/email-templates";
import { db } from "../database";
import { orders } from "../database/schema/orders";
import { eq } from "drizzle-orm";

// ============================================================================
// Constants
// ============================================================================

const APPROVAL_BASE_URL = process.env.APP_URL || "https://chobii.art";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for requesting changes
 */
const requestChangesSchema = z.object({
  comment: z.string().min(1, "Please describe the changes you'd like").max(2000),
  authorId: z.string().optional(),
});

/**
 * Schema for approving production
 */
const approveSchema = z.object({
  approvedBy: z.string().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const approvalsApp = new Hono();

// ============================================================================
// GET /api/approvals/:token - Get Approval Details
// ============================================================================

approvalsApp.get("/:token", async (c) => {
  const { token } = c.req.param();

  try {
    const approval = await getApprovalByToken(token);

    if (!approval) {
      return c.json(
        { success: false, error: "Approval not found or link expired" },
        404
      );
    }

    // Check if token has expired
    if (approval.tokenExpiresAt && approval.tokenExpiresAt < new Date()) {
      return c.json(
        { success: false, error: "This approval link has expired" },
        410
      );
    }

    // Check if already expired by deadline
    if (approval.status === "expired") {
      return c.json(
        {
          success: false,
          error:
            "The approval deadline has passed. Your order will proceed to shipping.",
          status: "expired",
        },
        410
      );
    }

    // Return approval details (excluding sensitive internal data)
    return c.json({
      success: true,
      data: {
        id: approval.id,
        status: approval.status,
        deadlineAt: approval.deadlineAt,
        approvedAt: approval.approvedAt,
        photos: approval.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          thumbnailUrl: photo.thumbnailUrl,
        })),
        comments: approval.comments.map((comment) => ({
          id: comment.id,
          authorType: comment.authorType,
          comment: comment.comment,
          createdAt: comment.createdAt,
        })),
        order: approval.order
          ? {
              orderNumber: approval.order.orderNumber,
              status: approval.order.status,
            }
          : null,
        orderItem: approval.orderItem
          ? {
              title: (approval.orderItem.snapshot as { title?: string })?.title,
              sizeLabel: (approval.orderItem.snapshot as { sizeLabel?: string })
                ?.sizeLabel,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[Approvals] Error getting approval:", error);
    return c.json(
      { success: false, error: "Failed to get approval details" },
      500
    );
  }
});

// ============================================================================
// POST /api/approvals/:token/changes - Request Changes
// ============================================================================

approvalsApp.post(
  "/:token/changes",
  zValidator("json", requestChangesSchema),
  async (c) => {
    const { token } = c.req.param();
    const { comment, authorId } = c.req.valid("json");

    try {
      const result = await requestChanges({
        approvalToken: token,
        comment,
        authorId,
      });

      if (!result.success) {
        const status = result.error?.includes("not found") ? 404 : 400;
        return c.json({ success: false, error: result.error }, status);
      }

      return c.json({
        success: true,
        message: "Change request submitted successfully",
        data: {
          status: result.approval?.status,
          comment: result.comment
            ? {
                id: result.comment.id,
                comment: result.comment.comment,
                createdAt: result.comment.createdAt,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("[Approvals] Error requesting changes:", error);
      return c.json({ success: false, error: "Failed to submit change request" }, 500);
    }
  }
);

// ============================================================================
// POST /api/approvals/:token/approve - Approve for Shipping
// ============================================================================

approvalsApp.post(
  "/:token/approve",
  zValidator("json", approveSchema),
  async (c) => {
    const { token } = c.req.param();
    const { approvedBy } = c.req.valid("json");

    try {
      const result = await approveProduction({
        approvalToken: token,
        approvedBy,
      });

      if (!result.success) {
        const status = result.error?.includes("not found") ? 404 : 400;
        return c.json({ success: false, error: result.error }, status);
      }

      // Send confirmation email
      if (result.approval) {
        try {
          const order = await db.query.orders.findFirst({
            where: eq(orders.id, result.approval.orderId),
          });

          if (order) {
            // Get recipient email
            let recipientEmail: string | null = null;
            if (order.userId) {
              const user = await db.query.users.findFirst({
                where: eq(
                  (await import("../database/schema/users")).users.id,
                  order.userId
                ),
              });
              recipientEmail = user?.email || null;
            } else {
              recipientEmail = order.guestEmail;
            }

            if (recipientEmail) {
              // Get full approval details for email
              const fullApproval = await getApprovalByToken(token);

              if (fullApproval) {
                const approvalUrl = `${APPROVAL_BASE_URL}/approve/${token}`;

                const emailContext: ApprovalEmailContext = {
                  approval: fullApproval,
                  order: {
                    orderNumber: order.orderNumber,
                    shippingAddress: order.shippingAddress as {
                      fullName?: string;
                    },
                  },
                  orderItem: {
                    snapshot: (fullApproval.orderItem?.snapshot || {}) as {
                      title?: string;
                      sizeLabel?: string;
                    },
                  },
                  photos: fullApproval.photos,
                  approvalUrl,
                };

                const template = getApprovalConfirmedTemplate(emailContext);

                await sendEmail({
                  to: recipientEmail,
                  subject: template.subject,
                  html: template.html,
                  text: template.text,
                  tags: [
                    { name: "type", value: "approval_confirmed" },
                    { name: "approval_id", value: result.approval.id },
                    { name: "order_number", value: order.orderNumber },
                  ],
                });
              }
            }
          }
        } catch (emailError) {
          // Log email error but don't fail the approval
          console.error("[Approvals] Error sending confirmation email:", emailError);
        }
      }

      return c.json({
        success: true,
        message: "Production approved! Your order will proceed to shipping.",
        data: {
          status: result.approval?.status,
          approvedAt: result.approval?.approvedAt,
        },
      });
    } catch (error) {
      console.error("[Approvals] Error approving production:", error);
      return c.json({ success: false, error: "Failed to approve production" }, 500);
    }
  }
);

export { approvalsApp };
