/**
 * What pino must never print.
 *
 * Its own module because `logger.ts` builds a transport at import time, and a
 * test that only wants to assert the redaction list should not have to boot
 * pino-pretty to see it.
 *
 * These are pino `redact.paths`, so they are LITERAL paths with `*` wildcards —
 * not a regex over key names. `*.password` covers one level of nesting;
 * `req.headers.cookie` covers the case that actually happens, which is a caller
 * logging a whole request. The audit table has its own, stricter, name-based
 * redactor (`lib/audit.ts`) because there the payload shape is unknown.
 */
export const REDACTED_LOG_PATHS = [
  // Credentials in transit
  "req.headers.cookie",
  "req.headers.authorization",
  "headers.cookie",
  "headers.authorization",
  "cookie",
  "authorization",

  // Credentials at rest in a log object
  "password",
  "*.password",
  "*.passwordHash",
  "newPassword",
  "currentPassword",

  // Session and API material
  "token",
  "*.token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "apiKey",
  "*.apiKey",
  "secret",
  "*.secret",

  // Auth codes and payment material — an OTP in a log is a login, and a
  // webhook signature in a log lets someone forge the webhook.
  "otp",
  "*.otp",
  "signature",
  "*.signature",
  "razorpay_signature",
  "cardNumber",
  "cvv",
] as const;
