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
import { createChildLogger } from "../lib/logger";
import { getApprovalDeadlineReminderTemplate, type ApprovalEmailContext } from "./email-templates";

const logger = createChildLogger({ service: "approval-deadline" });

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
const APPROVAL_BASE_URL = process.env.APP_URL || "https://masonart.com";

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
    const approvals = await getApprovalsNearDeadline(REMINDER_HOURS_BEFORE_DEADLINE);

    logger.info({ count: approvals.length }, "Found approvals approaching deadline");

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
                where: eq((await import("../database/schema/users")).users.id, order.userId),
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
          logger.info({ approvalId: approval.id }, "Sent reminder for approval");
        } else {
          result.errors.push(`Failed to send email for ${approval.id}: ${emailResult.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Error processing approval ${approval.id}: ${message}`);
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error sending reminders");
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
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

    logger.info({ expiredCount }, "Expired overdue approvals");

    // Note: We could send expiration notifications here if needed
    // For now, the order can proceed to shipping when approval expires
  } catch (error) {
    logger.error({ err: error }, "Error expiring approvals");
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Run full deadline check (reminders + expirations)
 * This is the main entry point for scheduled jobs
 */
export async function runDeadlineCheck(): Promise<DeadlineCheckResult> {
  logger.info("Starting deadline check");

  const reminderResult = await sendDeadlineReminders();
  const expireResult = await processExpiredApprovals();

  const result: DeadlineCheckResult = {
    remindersSent: reminderResult.sent,
    approvalsExpired: expireResult.expired,
    errors: [...reminderResult.errors, ...expireResult.errors],
  };

  logger.info(
    { remindersSent: result.remindersSent, approvalsExpired: result.approvalsExpired },
    "Deadline check completed"
  );

  if (result.errors.length > 0) {
    logger.warn({ errors: result.errors }, "Deadline check finished with errors");
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

  logger.info({ intervalHours }, "Starting deadline checker");

  // Run immediately on start
  runDeadlineCheck().catch((error) => {
    logger.error({ err: error }, "Initial check failed");
  });

  // Schedule recurring checks
  const intervalId = setInterval(() => {
    runDeadlineCheck().catch((error) => {
      logger.error({ err: error }, "Scheduled check failed");
    });
  }, intervalMs);

  return {
    stop: () => {
      logger.info("Stopping deadline checker");
      clearInterval(intervalId);
    },
  };
}
