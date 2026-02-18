/**
 * Sentry Error Tracking (Client-Side)
 *
 * Initializes Sentry for the React frontend. Only active when
 * VITE_SENTRY_DSN is set. Captures React render errors and
 * unhandled exceptions in the browser.
 */

import * as Sentry from "@sentry/react";

const dsn = typeof window !== "undefined"
  ? (import.meta as any).env?.VITE_SENTRY_DSN
  : undefined;

/**
 * Initialize Sentry for the browser. Call in root component.
 * No-op if VITE_SENTRY_DSN is not set.
 */
export function initSentry(): void {
  if (!dsn || typeof window === "undefined") {
    return;
  }

  Sentry.init({
    dsn,
    environment: (import.meta as any).env?.VITE_SENTRY_ENVIRONMENT || "production",
    tracesSampleRate: parseFloat(
      (import.meta as any).env?.VITE_SENTRY_TRACES_SAMPLE_RATE || "0.1"
    ),
    release: (import.meta as any).env?.VITE_SENTRY_RELEASE || "masonart-web@1.0.0",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

/**
 * Capture an exception and send to Sentry.
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

export { Sentry };
