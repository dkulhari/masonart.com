/**
 * Retry Utility
 *
 * Retries async operations with exponential backoff.
 * Used for email/SMS delivery and other external API calls.
 *
 * @example
 *   const result = await withRetry(
 *     () => sendEmail(to, subject, body),
 *     { maxRetries: 3, baseDelay: 1000 }
 *   );
 */

import { logger } from "./logger";

interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms, doubled each retry (default: 1000) */
  baseDelay?: number;
  /** Operation name for logging (default: "operation") */
  operationName?: string;
  /** Function to determine if an error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
}

interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Default check for retryable errors.
 * Network errors and 5xx responses are retryable.
 * 4xx errors (client errors) are not retryable.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network errors
    if (
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset")
    ) {
      return true;
    }
  }

  // HTTP response errors
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    return status >= 500; // 5xx = retryable, 4xx = not
  }

  return true; // Default: retry unknown errors
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * Delays: baseDelay, baseDelay*4, baseDelay*16
 * (exponential with factor 4 for aggressive backoff)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    operationName = "operation",
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const data = await fn();
      if (attempt > 1) {
        logger.info(
          { operationName, attempt },
          `${operationName} succeeded after ${attempt} attempts`
        );
      }
      return { success: true, data, attempts: attempt };
    } catch (error) {
      lastError = error;

      if (attempt > maxRetries || !isRetryable(error)) {
        logger.error(
          { err: error, operationName, attempt, maxRetries },
          `${operationName} failed permanently after ${attempt} attempts`
        );
        return { success: false, error, attempts: attempt };
      }

      // Exponential backoff: 1s, 4s, 16s
      const delay = baseDelay * Math.pow(4, attempt - 1);
      logger.warn(
        { err: error, operationName, attempt, nextRetryMs: delay },
        `${operationName} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }

  return { success: false, error: lastError, attempts: maxRetries + 1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
