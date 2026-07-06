/**
 * Email Service - Resend Integration
 *
 * Provides transactional email functionality using Resend.
 * Supports order-related notification emails with HTML templates.
 *
 * @see https://resend.com/docs
 */

import { Resend } from "resend";
import { withRetry } from "../lib/retry";
import { logger } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || "MasonArt <notifications@masonart.com>";
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || "support@masonart.com";

// Initialize Resend client (only if API key is available)
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

// ============================================================================
// Email Service
// ============================================================================

/**
 * Send an email using Resend
 *
 * @param options - Email options including recipient, subject, and content
 * @returns Result with success status and message ID or error
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResponse> {
  const { to, subject, html, text, from, replyTo, tags } = options;

  try {
    const client = getResendClient();

    // Development/test mode - log email instead of sending
    if (!client) {
      if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
        const recipients = Array.isArray(to) ? to.join(", ") : to;
        logger.info(
          {
            to: recipients,
            subject,
            from: from || DEFAULT_FROM_EMAIL,
            preview: html.substring(0, 200),
          },
          "Dev mode: would send email"
        );
        return {
          success: true,
          messageId: `dev_${Date.now()}`,
        };
      }

      return {
        success: false,
        error: "Email service not configured (missing RESEND_API_KEY)",
      };
    }

    // Send email via Resend with retry for transient failures
    const result = await withRetry(
      async () => {
        const { data, error } = await client.emails.send({
          from: from || DEFAULT_FROM_EMAIL,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text,
          replyTo: replyTo || DEFAULT_REPLY_TO,
          tags,
        });

        if (error) {
          throw new Error(error.message || "Failed to send email");
        }

        return data;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        operationName: "email-send",
      }
    );

    if (!result.success) {
      logger.error(
        { err: result.error, to, subject, attempts: result.attempts },
        "Email delivery failed after retries"
      );
      return {
        success: false,
        error: result.error instanceof Error ? result.error.message : "Failed to send email",
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    logger.error({ err: error, to, subject }, "Email send error");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

/**
 * Send an email using a template
 *
 * @param to - Recipient email address(es)
 * @param template - Email template with subject and content
 * @param options - Additional options (from, replyTo, tags)
 */
export async function sendTemplateEmail(
  to: string | string[],
  template: EmailTemplate,
  options?: Partial<Omit<SendEmailOptions, "to" | "subject" | "html" | "text">>
): Promise<SendEmailResponse> {
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    ...options,
  });
}

/**
 * Check if email service is properly configured
 */
export function isEmailServiceConfigured(): boolean {
  return (
    !!RESEND_API_KEY || process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
  );
}

/**
 * Get email service status
 */
export function getEmailServiceStatus(): {
  configured: boolean;
  provider: string;
  mode: "production" | "development";
} {
  return {
    configured: isEmailServiceConfigured(),
    provider: "resend",
    mode: RESEND_API_KEY ? "production" : "development",
  };
}
