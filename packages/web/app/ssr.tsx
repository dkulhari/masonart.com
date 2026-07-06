/**
 * SSR Entry Point
 *
 * Server-side rendering entry point for TanStack Start.
 * Creates the start handler with the default stream handler.
 * Adds security headers to all responses.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
 */

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Security headers applied to all responses from the web server.
 * CSP is relaxed in development to allow Vite HMR and inline scripts.
 */
const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(isProduction
    ? {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https:",
          "frame-ancestors 'none'",
        ].join("; "),
      }
    : {}),
};

/**
 * Create the SSR handler with security headers
 */
export default createServerEntry({
  async fetch(request) {
    const response = await handler.fetch(request);

    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  },
});
