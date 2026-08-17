/**
 * Structured Logger
 *
 * Provides structured JSON logging in production and pretty-printed
 * output in development. All log entries include timestamp and level.
 *
 * Usage:
 *   import { logger } from "./lib/logger";
 *   logger.info({ userId, action: "login" }, "User logged in");
 *   logger.error({ err, orderId }, "Payment failed");
 */

import pino from "pino";
import { REDACTED_LOG_PATHS } from "./logger.paths";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

export { REDACTED_LOG_PATHS };

export const logger = pino({
  level: logLevel,
  /**
   * Scrub before anything reaches a transport. Without this, one
   * `logger.info({ req })` puts a session cookie in the log aggregator
   * permanently — and the caller who wrote that line had no reason to suspect
   * it. The list is a shipped configuration, asserted in
   * tests/middleware/request-context.test.ts.
   */
  redact: {
    paths: [...REDACTED_LOG_PATHS],
    censor: "[redacted]",
  },
  ...(isProduction
    ? {
        // JSON output in production (structured, queryable)
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
      }
    : {
        // Pretty-print in development
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * Create a child logger with bound context.
 * Useful for per-request or per-service logging.
 *
 * @example
 *   const reqLogger = createChildLogger({ requestId: "abc123" });
 *   reqLogger.info("Processing request");
 */
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export default logger;
