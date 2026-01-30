/**
 * Production Photo Approval Service
 *
 * Manages the photo approval workflow for made-to-order items.
 * Handles approval creation, photo uploads, change requests, and approvals.
 */

import { eq, and, lt, isNull } from "drizzle-orm";
import { db } from "../database";
import {
  productionApprovals,
  approvalPhotos,
  approvalComments,
  type ProductionApproval,
  type ApprovalPhoto,
  type ApprovalComment,
  type ApprovalStatus,
  type NewProductionApproval,
  type NewApprovalPhoto,
  type NewApprovalComment,
} from "../database/schema/approvals";
import { orders, orderItems } from "../database/schema/orders";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface CreateApprovalOptions {
  orderId: string;
  orderItemId: string;
  /** Deadline in days from now (default: 7) */
  deadlineDays?: number;
}

export interface CreateApprovalResult {
  success: boolean;
  approval?: ProductionApproval;
  error?: string;
}

export interface UploadPhotosOptions {
  approvalId: string;
  photos: {
    url: string;
    thumbnailUrl?: string;
    sortOrder?: number;
  }[];
  uploadedBy: string;
}

export interface UploadPhotosResult {
  success: boolean;
  photos?: ApprovalPhoto[];
  error?: string;
}

export interface RequestChangesOptions {
  approvalToken: string;
  comment: string;
  authorId?: string;
}

export interface RequestChangesResult {
  success: boolean;
  approval?: ProductionApproval;
  comment?: ApprovalComment;
  error?: string;
}

export interface ApproveProductionOptions {
  approvalToken: string;
  approvedBy?: string;
}

export interface ApproveProductionResult {
  success: boolean;
  approval?: ProductionApproval;
  error?: string;
}

export interface ApprovalWithDetails extends ProductionApproval {
  photos: ApprovalPhoto[];
  comments: ApprovalComment[];
  order?: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  orderItem?: {
    id: string;
    snapshot: unknown;
  } | null;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a secure approval token
 * Format: apv_<uuid without dashes>
 */
function generateApprovalToken(): string {
  const uuid = randomUUID().replace(/-/g, "");
  return `apv_${uuid}`;
}

/**
 * Calculate deadline date from now
 */
function calculateDeadline(days: number): Date {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);
  return deadline;
}

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Create a new production approval for an order item
 */
export async function createApproval(
  options: CreateApprovalOptions
): Promise<CreateApprovalResult> {
  const { orderId, orderItemId, deadlineDays = 7 } = options;

  try {
    // Verify order exists
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    // Verify order item exists and belongs to order
    const orderItem = await db.query.orderItems.findFirst({
      where: and(
        eq(orderItems.id, orderItemId),
        eq(orderItems.orderId, orderId)
      ),
    });

    if (!orderItem) {
      return { success: false, error: "Order item not found" };
    }

    // Check if approval already exists for this order item
    const existingApproval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.orderItemId, orderItemId),
    });

    if (existingApproval) {
      return {
        success: false,
        error: "Approval already exists for this order item",
      };
    }

    // Create approval
    const approvalData: NewProductionApproval = {
      orderId,
      orderItemId,
      status: "pending_upload",
      approvalToken: generateApprovalToken(),
      deadlineAt: calculateDeadline(deadlineDays),
    };

    const [approval] = await db
      .insert(productionApprovals)
      .values(approvalData)
      .returning();

    return { success: true, approval };
  } catch (error) {
    console.error("[Approval] Error creating approval:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create approval",
    };
  }
}

/**
 * Upload production photos for an approval
 */
export async function uploadPhotos(
  options: UploadPhotosOptions
): Promise<UploadPhotosResult> {
  const { approvalId, photos, uploadedBy } = options;

  try {
    // Verify approval exists
    const approval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.id, approvalId),
    });

    if (!approval) {
      return { success: false, error: "Approval not found" };
    }

    // Only allow photo uploads for pending_upload or changes_requested status
    if (
      approval.status !== "pending_upload" &&
      approval.status !== "changes_requested"
    ) {
      return {
        success: false,
        error: `Cannot upload photos when status is ${approval.status}`,
      };
    }

    // Insert photos
    const photoData: NewApprovalPhoto[] = photos.map((photo, index) => ({
      approvalId,
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      sortOrder: photo.sortOrder ?? index,
      uploadedBy,
    }));

    const insertedPhotos = await db
      .insert(approvalPhotos)
      .values(photoData)
      .returning();

    // Update approval status to pending_approval
    await db
      .update(productionApprovals)
      .set({
        status: "pending_approval",
        updatedAt: new Date(),
      })
      .where(eq(productionApprovals.id, approvalId));

    return { success: true, photos: insertedPhotos };
  } catch (error) {
    console.error("[Approval] Error uploading photos:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload photos",
    };
  }
}

/**
 * Customer requests changes to production photos
 */
export async function requestChanges(
  options: RequestChangesOptions
): Promise<RequestChangesResult> {
  const { approvalToken, comment, authorId } = options;

  try {
    // Get approval by token
    const approval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.approvalToken, approvalToken),
    });

    if (!approval) {
      return { success: false, error: "Approval not found" };
    }

    // Only allow changes request for pending_approval status
    if (approval.status !== "pending_approval") {
      return {
        success: false,
        error: `Cannot request changes when status is ${approval.status}`,
      };
    }

    // Check if token has expired
    if (approval.tokenExpiresAt && approval.tokenExpiresAt < new Date()) {
      return { success: false, error: "Approval link has expired" };
    }

    // Create comment
    const commentData: NewApprovalComment = {
      approvalId: approval.id,
      authorType: "customer",
      authorId,
      comment,
    };

    const [insertedComment] = await db
      .insert(approvalComments)
      .values(commentData)
      .returning();

    // Update approval status
    const [updatedApproval] = await db
      .update(productionApprovals)
      .set({
        status: "changes_requested",
        updatedAt: new Date(),
      })
      .where(eq(productionApprovals.id, approval.id))
      .returning();

    return {
      success: true,
      approval: updatedApproval,
      comment: insertedComment,
    };
  } catch (error) {
    console.error("[Approval] Error requesting changes:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to request changes",
    };
  }
}

/**
 * Customer approves production for shipping
 */
export async function approveProduction(
  options: ApproveProductionOptions
): Promise<ApproveProductionResult> {
  const { approvalToken, approvedBy } = options;

  try {
    // Get approval by token
    const approval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.approvalToken, approvalToken),
    });

    if (!approval) {
      return { success: false, error: "Approval not found" };
    }

    // Only allow approval for pending_approval status
    if (approval.status !== "pending_approval") {
      return {
        success: false,
        error: `Cannot approve when status is ${approval.status}`,
      };
    }

    // Check if token has expired
    if (approval.tokenExpiresAt && approval.tokenExpiresAt < new Date()) {
      return { success: false, error: "Approval link has expired" };
    }

    // Update approval status
    const [updatedApproval] = await db
      .update(productionApprovals)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy,
        updatedAt: new Date(),
      })
      .where(eq(productionApprovals.id, approval.id))
      .returning();

    return { success: true, approval: updatedApproval };
  } catch (error) {
    console.error("[Approval] Error approving production:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to approve production",
    };
  }
}

/**
 * Get approval by token with full details
 */
export async function getApprovalByToken(
  token: string
): Promise<ApprovalWithDetails | null> {
  try {
    const approval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.approvalToken, token),
      with: {
        photos: {
          orderBy: (photos, { asc }) => [asc(photos.sortOrder)],
        },
        comments: {
          orderBy: (comments, { asc }) => [asc(comments.createdAt)],
        },
        order: {
          columns: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
        orderItem: {
          columns: {
            id: true,
            snapshot: true,
          },
        },
      },
    });

    if (!approval) return null;
    return approval as unknown as ApprovalWithDetails;
  } catch (error) {
    console.error("[Approval] Error getting approval by token:", error);
    return null;
  }
}

/**
 * Get approval by ID with full details
 */
export async function getApprovalById(
  id: string
): Promise<ApprovalWithDetails | null> {
  try {
    const approval = await db.query.productionApprovals.findFirst({
      where: eq(productionApprovals.id, id),
      with: {
        photos: {
          orderBy: (photos, { asc }) => [asc(photos.sortOrder)],
        },
        comments: {
          orderBy: (comments, { asc }) => [asc(comments.createdAt)],
        },
        order: {
          columns: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
        orderItem: {
          columns: {
            id: true,
            snapshot: true,
          },
        },
      },
    });

    if (!approval) return null;
    return approval as unknown as ApprovalWithDetails;
  } catch (error) {
    console.error("[Approval] Error getting approval by ID:", error);
    return null;
  }
}

/**
 * Get all approvals for an order
 */
export async function getOrderApprovals(
  orderId: string
): Promise<ProductionApproval[]> {
  try {
    return await db.query.productionApprovals.findMany({
      where: eq(productionApprovals.orderId, orderId),
      orderBy: (approvals, { asc }) => [asc(approvals.createdAt)],
    });
  } catch (error) {
    console.error("[Approval] Error getting order approvals:", error);
    return [];
  }
}

/**
 * Get approvals by status
 */
export async function getApprovalsByStatus(
  status: ApprovalStatus,
  limit?: number
): Promise<ProductionApproval[]> {
  try {
    return await db.query.productionApprovals.findMany({
      where: eq(productionApprovals.status, status),
      orderBy: (approvals, { asc }) => [asc(approvals.createdAt)],
      limit,
    });
  } catch (error) {
    console.error("[Approval] Error getting approvals by status:", error);
    return [];
  }
}

/**
 * Get approvals approaching deadline (for reminder emails)
 * Returns approvals that:
 * - Are in pending_approval status
 * - Have a deadline within the specified hours
 * - Haven't had a reminder sent yet
 */
export async function getApprovalsNearDeadline(
  hoursBeforeDeadline: number = 24
): Promise<ProductionApproval[]> {
  try {
    const deadlineThreshold = new Date();
    deadlineThreshold.setHours(
      deadlineThreshold.getHours() + hoursBeforeDeadline
    );

    return await db.query.productionApprovals.findMany({
      where: and(
        eq(productionApprovals.status, "pending_approval"),
        lt(productionApprovals.deadlineAt, deadlineThreshold),
        isNull(productionApprovals.reminderSentAt)
      ),
    });
  } catch (error) {
    console.error("[Approval] Error getting approvals near deadline:", error);
    return [];
  }
}

/**
 * Mark reminder as sent for an approval
 */
export async function markReminderSent(approvalId: string): Promise<boolean> {
  try {
    await db
      .update(productionApprovals)
      .set({
        reminderSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productionApprovals.id, approvalId));
    return true;
  } catch (error) {
    console.error("[Approval] Error marking reminder sent:", error);
    return false;
  }
}

/**
 * Expire overdue approvals
 * Updates status to 'expired' for approvals past their deadline
 */
export async function expireOverdueApprovals(): Promise<number> {
  try {
    const now = new Date();
    const result = await db
      .update(productionApprovals)
      .set({
        status: "expired",
        updatedAt: now,
      })
      .where(
        and(
          eq(productionApprovals.status, "pending_approval"),
          lt(productionApprovals.deadlineAt, now)
        )
      )
      .returning({ id: productionApprovals.id });

    return result.length;
  } catch (error) {
    console.error("[Approval] Error expiring overdue approvals:", error);
    return 0;
  }
}

/**
 * Add an admin comment to an approval
 */
export async function addAdminComment(
  approvalId: string,
  adminId: string,
  comment: string
): Promise<ApprovalComment | null> {
  try {
    const commentData: NewApprovalComment = {
      approvalId,
      authorType: "admin",
      authorId: adminId,
      comment,
    };

    const [inserted] = await db
      .insert(approvalComments)
      .values(commentData)
      .returning();

    return inserted ?? null;
  } catch (error) {
    console.error("[Approval] Error adding admin comment:", error);
    return null;
  }
}

/**
 * Delete photos for an approval (used when re-uploading)
 */
export async function deleteApprovalPhotos(approvalId: string): Promise<boolean> {
  try {
    await db
      .delete(approvalPhotos)
      .where(eq(approvalPhotos.approvalId, approvalId));
    return true;
  } catch (error) {
    console.error("[Approval] Error deleting approval photos:", error);
    return false;
  }
}
