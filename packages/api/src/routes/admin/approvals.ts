/**
 * Admin Approvals API Routes
 *
 * Provides admin API endpoints for production photo approval management:
 * - GET /api/admin/approvals - List approvals with filters
 * - GET /api/admin/approvals/stats - Get approval statistics
 * - GET /api/admin/approvals/:id - Get full approval details
 * - POST /api/admin/approvals/:id/photos - Upload production photos
 * - DELETE /api/admin/approvals/:id/photos - Delete all photos (for re-upload)
 * - POST /api/admin/approvals/:id/comments - Add admin comment/response
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, and, desc, isNotNull } from "drizzle-orm";

import { db } from "../../database";
import { productionApprovals } from "../../database/schema/approvals";
import { orders } from "../../database/schema/orders";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  uploadPhotos,
  getApprovalById,
  addAdminComment,
  deleteApprovalPhotos,
} from "../../services/approval";
import { sendEmail } from "../../services/email";
import {
  getPhotoReadyForReviewTemplate,
  getChangesRequestedResponseTemplate,
  type ApprovalEmailContext,
} from "../../services/email-templates";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const APPROVAL_BASE_URL = process.env.APP_URL || "https://chobii.xtoms.xyz";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for admin approval listing
 */
const listApprovalsSchema = z.object({
  status: z
    .enum([
      "pending_upload",
      "pending_approval",
      "changes_requested",
      "approved",
      "expired",
    ])
    .optional(),
  orderId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

/**
 * Schema for uploading photos
 */
const uploadPhotosSchema = z.object({
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        thumbnailUrl: z.string().url().optional(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .min(1)
    .max(10),
  sendNotification: z.boolean().default(true),
});

/**
 * Schema for adding admin comment
 */
const addCommentSchema = z.object({
  comment: z.string().min(1).max(2000),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminApprovalsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminApprovalsApp.use("*", requireAuth);
adminApprovalsApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/approvals - List Approvals
// ============================================================================

adminApprovalsApp.get(
  "/",
  zValidator("query", listApprovalsSchema),
  async (c) => {
    const { status, orderId, page, pageSize } = c.req.valid("query");
    const offset = (page - 1) * pageSize;

    try {
      // Build query conditions
      const conditions = [];
      if (status) {
        conditions.push(eq(productionApprovals.status, status));
      }
      if (orderId) {
        conditions.push(eq(productionApprovals.orderId, orderId));
      }

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(productionApprovals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = Number(countResult[0]?.count || 0);

      // Get approvals with order info
      const approvals = await db.query.productionApprovals.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          order: {
            columns: {
              id: true,
              orderNumber: true,
              status: true,
              shippingAddress: true,
            },
          },
          orderItem: {
            columns: {
              id: true,
              snapshot: true,
            },
          },
          photos: {
            columns: {
              id: true,
              url: true,
              thumbnailUrl: true,
            },
          },
        },
        orderBy: [desc(productionApprovals.createdAt)],
        limit: pageSize,
        offset,
      });

      return c.json({
        success: true,
        data: {
          approvals,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        },
      });
    } catch (error) {
      console.error("[Admin Approvals] Error listing approvals:", error);
      return c.json(
        { success: false, error: "Failed to list approvals" },
        500
      );
    }
  }
);

// ============================================================================
// GET /api/admin/approvals/stats - Get Approval Statistics
// ============================================================================

adminApprovalsApp.get("/stats", async (c) => {
  try {
    const stats = await db
      .select({
        status: productionApprovals.status,
        count: sql<number>`count(*)`,
      })
      .from(productionApprovals)
      .groupBy(productionApprovals.status);

    const statsMap = {
      pending_upload: 0,
      pending_approval: 0,
      changes_requested: 0,
      approved: 0,
      expired: 0,
      total: 0,
    };

    for (const stat of stats) {
      const key = stat.status as keyof typeof statsMap;
      if (key in statsMap && key !== "total") {
        statsMap[key] = Number(stat.count);
        statsMap.total += Number(stat.count);
      }
    }

    // Get recent activity (approvals in last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentApproved = await db
      .select({ count: sql<number>`count(*)` })
      .from(productionApprovals)
      .where(
        and(
          eq(productionApprovals.status, "approved"),
          isNotNull(productionApprovals.approvedAt)
        )
      );

    return c.json({
      success: true,
      data: {
        byStatus: statsMap,
        recentApproved: Number(recentApproved[0]?.count || 0),
      },
    });
  } catch (error) {
    console.error("[Admin Approvals] Error getting stats:", error);
    return c.json({ success: false, error: "Failed to get statistics" }, 500);
  }
});

// ============================================================================
// GET /api/admin/approvals/:id - Get Approval Details
// ============================================================================

adminApprovalsApp.get("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const approval = await getApprovalById(id);

    if (!approval) {
      return c.json({ success: false, error: "Approval not found" }, 404);
    }

    // Get full order details
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, approval.orderId),
      with: {
        items: true,
      },
    });

    return c.json({
      success: true,
      data: {
        ...approval,
        order,
      },
    });
  } catch (error) {
    console.error("[Admin Approvals] Error getting approval:", error);
    return c.json({ success: false, error: "Failed to get approval" }, 500);
  }
});

// ============================================================================
// POST /api/admin/approvals/:id/photos - Upload Production Photos
// ============================================================================

adminApprovalsApp.post(
  "/:id/photos",
  zValidator("json", uploadPhotosSchema),
  async (c) => {
    const { id } = c.req.param();
    const { photos, sendNotification } = c.req.valid("json");
    const adminUser = c.get("user");

    try {
      // Get current approval
      const approval = await getApprovalById(id);
      if (!approval) {
        return c.json({ success: false, error: "Approval not found" }, 404);
      }

      // Check if this is a response to change request
      const isChangeResponse = approval.status === "changes_requested";

      // Delete existing photos if re-uploading
      if (approval.photos.length > 0) {
        await deleteApprovalPhotos(id);
      }

      // Upload new photos
      const result = await uploadPhotos({
        approvalId: id,
        photos,
        uploadedBy: adminUser?.id || "admin",
      });

      if (!result.success) {
        return c.json(
          { success: false, error: result.error || "Failed to upload photos" },
          400
        );
      }

      // Send notification email if requested
      if (sendNotification) {
        const order = await db.query.orders.findFirst({
          where: eq(orders.id, approval.orderId),
        });

        if (order) {
          // Get recipient email
          let recipientEmail: string | null = null;
          if (order.userId) {
            const user = await db.query.users.findFirst({
              where: eq(
                (await import("../../database/schema/users")).users.id,
                order.userId
              ),
            });
            recipientEmail = user?.email || null;
          } else {
            recipientEmail = order.guestEmail;
          }

          if (recipientEmail) {
            const approvalUrl = `${APPROVAL_BASE_URL}/approve/${approval.approvalToken}`;
            const updatedApproval = await getApprovalById(id);

            const emailContext: ApprovalEmailContext = {
              approval: updatedApproval!,
              order: {
                orderNumber: order.orderNumber,
                shippingAddress: order.shippingAddress as { fullName?: string },
              },
              orderItem: {
                snapshot: (updatedApproval?.orderItem?.snapshot || {}) as {
                  title?: string;
                  sizeLabel?: string;
                },
              },
              photos: updatedApproval?.photos,
              approvalUrl,
            };

            const template = isChangeResponse
              ? getChangesRequestedResponseTemplate(emailContext)
              : getPhotoReadyForReviewTemplate(emailContext);

            await sendEmail({
              to: recipientEmail,
              subject: template.subject,
              html: template.html,
              text: template.text,
              tags: [
                { name: "type", value: "approval_photos" },
                { name: "approval_id", value: id },
              ],
            });
          }
        }
      }

      return c.json({
        success: true,
        data: {
          photos: result.photos,
          notificationSent: sendNotification,
        },
      });
    } catch (error) {
      console.error("[Admin Approvals] Error uploading photos:", error);
      return c.json({ success: false, error: "Failed to upload photos" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/admin/approvals/:id/photos - Delete All Photos
// ============================================================================

adminApprovalsApp.delete("/:id/photos", async (c) => {
  const { id } = c.req.param();

  try {
    const approval = await getApprovalById(id);
    if (!approval) {
      return c.json({ success: false, error: "Approval not found" }, 404);
    }

    const deleted = await deleteApprovalPhotos(id);

    if (!deleted) {
      return c.json({ success: false, error: "Failed to delete photos" }, 500);
    }

    return c.json({
      success: true,
      message: "Photos deleted successfully",
    });
  } catch (error) {
    console.error("[Admin Approvals] Error deleting photos:", error);
    return c.json({ success: false, error: "Failed to delete photos" }, 500);
  }
});

// ============================================================================
// POST /api/admin/approvals/:id/comments - Add Admin Comment
// ============================================================================

adminApprovalsApp.post(
  "/:id/comments",
  zValidator("json", addCommentSchema),
  async (c) => {
    const { id } = c.req.param();
    const { comment } = c.req.valid("json");
    const adminUser = c.get("user");

    try {
      const approval = await getApprovalById(id);
      if (!approval) {
        return c.json({ success: false, error: "Approval not found" }, 404);
      }

      const newComment = await addAdminComment(
        id,
        adminUser?.id || "admin",
        comment
      );

      if (!newComment) {
        return c.json({ success: false, error: "Failed to add comment" }, 500);
      }

      return c.json({
        success: true,
        data: newComment,
      });
    } catch (error) {
      console.error("[Admin Approvals] Error adding comment:", error);
      return c.json({ success: false, error: "Failed to add comment" }, 500);
    }
  }
);

export { adminApprovalsApp };
