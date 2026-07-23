/**
 * Error Alerting
 *
 * Sends critical error alerts to Slack via incoming webhook.
 * Supplements Sentry by providing instant team notification
 * for high-severity events.
 *
 * Set SLACK_WEBHOOK_URL env var to enable.
 * No-op when not configured.
 */

import { logger } from "./logger";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

type AlertSeverity = "critical" | "warning" | "info";

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ":rotating_light:",
  warning: ":warning:",
  info: ":information_source:",
};

interface AlertOptions {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, string>;
}

/**
 * Send an alert to the configured Slack channel.
 * Non-blocking — errors in alert delivery are logged but don't propagate.
 */
export async function sendAlert(options: AlertOptions): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  const { severity, title, message, context } = options;
  const emoji = SEVERITY_EMOJI[severity];

  const fields = context
    ? Object.entries(context).map(([key, value]) => ({
        type: "mrkdwn" as const,
        text: `*${key}:*\n${value}`,
      }))
    : [];

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} [${severity.toUpperCase()}] ${title}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
      ...(fields.length > 0
        ? [{ type: "section", fields }]
        : []),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Service:* chobii-api | *Time:* ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Failed to send Slack alert"
      );
    }
  } catch (err) {
    logger.warn({ err }, "Error sending Slack alert");
  }
}

/**
 * Alert for critical errors (payment failures, auth system down, etc.)
 */
export function alertCritical(title: string, message: string, context?: Record<string, string>): void {
  sendAlert({ severity: "critical", title, message, context });
}

/**
 * Alert for warnings (rate limit exceeded, email delivery failure, etc.)
 */
export function alertWarning(title: string, message: string, context?: Record<string, string>): void {
  sendAlert({ severity: "warning", title, message, context });
}

/**
 * Alert for informational events (deployments, health check status changes, etc.)
 */
export function alertInfo(title: string, message: string, context?: Record<string, string>): void {
  sendAlert({ severity: "info", title, message, context });
}
