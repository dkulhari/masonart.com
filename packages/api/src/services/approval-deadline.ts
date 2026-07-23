/**
 * Approval Deadline Checker Service
 *
 * Handles deadline-related tasks for production approvals:
 * - Sends reminder emails when deadlines are approaching
 * - Expires overdue approvals
 *
 * Can be run as a scheduled job (cron) or BullMQ repeatable job.
 */

import { db } from "../database";
import { orders } from "../database/schema/orders";
import { eq } from "drizzle-orm";
import {
  getApprovalsNearDeadline,
  markReminderSent,
  expireOverdueApprovals,
  getApprovalById,
} from "./approval";
import { sendEmail } from "./email";
import {
  getApprovalDeadlineReminderTemplate,
  type ApprovalEmailContext,
} from "./email-templates";

// ============================================================================
// Types
// ============================================================================

export interface DeadlineCheckResult {
  remindersSent: number;
  approvalsExpired: number;
  errors: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Hours before deadline to send reminder (default: 24 hours)
 */
const REMINDER_HOURS_BEFORE_DEADLINE = 24;

/**
 * Base URL for approval pages
 */
const APPROVAL_BASE_URL =
  process.env.APP_URL || "https://chobii.xtoms.xyz";

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Check for approvals approaching deadline and send reminders
 */
export async function sendDeadlineReminders(): Promise<{
  sent: number;
  errors: string[];
}> {
  const result = { sent: 0, errors: [] as string[] };

  try {
    // Get approvals approaching deadline
    const approvals = await getApprovalsNearDeadline(
      REMINDER_HOURS_BEFORE_DEADLINE
    );

    console.log(
      `[ApprovalDeadline] Found ${approvals.length} approvals approaching deadline`
    );

    for (const approval of approvals) {
      try {
        // Get full approval details
        const fullApproval = await getApprovalById(approval.id);
        if (!fullApproval) {
          result.errors.push(`Could not fetch approval ${approval.id}`);
          continue;
        }

        // Get order details for email
        const order = await db.query.orders.findFirst({
          where: eq(orders.id, approval.orderId),
        });

        if (!order) {
          result.errors.push(`Could not find order for approval ${approval.id}`);
          continue;
        }

        // Get recipient email
        const recipientEmail = order.userId
          ? (
              await db.query.users.findFirst({
                where: eq(
                  (await import("../database/schema/users")).users.id,
                  order.userId
                ),
              })
            )?.email
          : order.guestEmail;

        if (!recipientEmail) {
          result.errors.push(`No email for approval ${approval.id}`);
          continue;
        }

        // Build email context
        const approvalUrl = `${APPROVAL_BASE_URL}/approve/${approval.approvalToken}`;

        const emailContext: ApprovalEmailContext = {
          approval: fullApproval,
          order: {
            orderNumber: order.orderNumber,
            shippingAddress: order.shippingAddress as { fullName?: string },
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

        // Generate and send email
        const template = getApprovalDeadlineReminderTemplate(emailContext);

        const emailResult = await sendEmail({
          to: recipientEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
          tags: [
            { name: "type", value: "approval_reminder" },
            { name: "approval_id", value: approval.id },
            { name: "order_number", value: order.orderNumber },
          ],
        });

        if (emailResult.success) {
          // Mark reminder as sent
          await markReminderSent(approval.id);
          result.sent++;
          console.log(
            `[ApprovalDeadline] Sent reminder for approval ${approval.id}`
          );
        } else {
          result.errors.push(
            `Failed to send email for ${approval.id}: ${emailResult.error}`
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Error processing approval ${approval.id}: ${message}`);
      }
    }
  } catch (error) {
    console.error("[ApprovalDeadline] Error sending reminders:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  return result;
}

/**
 * Expire overdue approvals and optionally notify
 */
export async function processExpiredApprovals(): Promise<{
  expired: number;
  errors: string[];
}> {
  const result = { expired: 0, errors: [] as string[] };

  try {
    // Expire overdue approvals
    const expiredCount = await expireOverdueApprovals();
    result.expired = expiredCount;

    console.log(`[ApprovalDeadline] Expired ${expiredCount} overdue approvals`);

    // Note: We could send expiration notifications here if needed
    // For now, the order can proceed to shipping when approval expires
  } catch (error) {
    console.error("[ApprovalDeadline] Error expiring approvals:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  return result;
}

/**
 * Run full deadline check (reminders + expirations)
 * This is the main entry point for scheduled jobs
 */
export async function runDeadlineCheck(): Promise<DeadlineCheckResult> {
  console.log("[ApprovalDeadline] Starting deadline check...");

  const reminderResult = await sendDeadlineReminders();
  const expireResult = await processExpiredApprovals();

  const result: DeadlineCheckResult = {
    remindersSent: reminderResult.sent,
    approvalsExpired: expireResult.expired,
    errors: [...reminderResult.errors, ...expireResult.errors],
  };

  console.log(
    `[ApprovalDeadline] Completed: ${result.remindersSent} reminders sent, ${result.approvalsExpired} expired`
  );

  if (result.errors.length > 0) {
    console.warn(
      `[ApprovalDeadline] Errors: ${result.errors.length}`,
      result.errors
    );
  }

  return result;
}

/**
 * Start scheduled deadline checker (using setInterval for simple deployment)
 * For production, consider using BullMQ repeatable jobs or external cron.
 *
 * @param intervalHours - How often to run the check (default: 1 hour)
 */
export function startDeadlineChecker(intervalHours: number = 1): {
  stop: () => void;
} {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(
    `[ApprovalDeadline] Starting deadline checker (every ${intervalHours} hour(s))`
  );

  // Run immediately on start
  runDeadlineCheck().catch((error) => {
    console.error("[ApprovalDeadline] Initial check failed:", error);
  });

  // Schedule recurring checks
  const intervalId = setInterval(() => {
    runDeadlineCheck().catch((error) => {
      console.error("[ApprovalDeadline] Scheduled check failed:", error);
    });
  }, intervalMs);

  return {
    stop: () => {
      console.log("[ApprovalDeadline] Stopping deadline checker");
      clearInterval(intervalId);
    },
  };
}
