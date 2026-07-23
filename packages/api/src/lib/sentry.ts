/**
 * Sentry Error Tracking
 *
 * Initializes Sentry for the API server. Only active when SENTRY_DSN is set.
 * Captures unhandled exceptions, rejections, and provides request context.
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1");

/**
 * Initialize Sentry. Call this early in app startup.
 * No-op if SENTRY_DSN is not set.
 */
export function initSentry(): void {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate,
    release: process.env.SENTRY_RELEASE || "chobi-api@1.0.0",
    integrations: [
      Sentry.onUnhandledRejectionIntegration(),
    ],
    // Don't send in test environment
    enabled: environment !== "test",
    // Filter out health check errors
    beforeSend(event) {
      const url = event.request?.url || "";
      if (url.includes("/health")) {
        return null;
      }
      return event;
    },
  });
}

/**
 * Capture an exception and send to Sentry.
 * Falls through silently if Sentry is not initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return;

  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Set user context for subsequent error reports.
 */
export function setUser(user: { id: string; email?: string }): void {
  if (!dsn) return;
  Sentry.setUser(user);
}

/**
 * Clear user context (e.g., on sign-out).
 */
export function clearUser(): void {
  if (!dsn) return;
  Sentry.setUser(null);
}

export { Sentry };
