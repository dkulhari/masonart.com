/**
 * Request correlation.
 *
 * An audit row says who changed a price; the log lines say what the request did
 * on its way there. Without a shared id those are two piles of text and joining
 * them is manual archaeology.
 *
 * So: one id per request — taken from `x-request-id`, else Cloudflare's `cf-ray`,
 * else generated — echoed back to the client so a support ticket carries the join
 * key, put on the context for `recordAudit`, and bound to a child logger so no
 * call site has to remember to pass it.
 *
 * This middleware also owns the single request-completion log line. It replaces
 * the ad-hoc one that used to live inline in index.ts, which logged method, path,
 * status and duration but no id and no actor — enough to see traffic, not enough
 * to answer a question about one request.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.4
 */

import { createMiddleware } from "hono/factory";
import { createChildLogger } from "../lib/logger";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Long enough for a UUID or a cf-ray, short enough that a client cannot use the
 * header as a log-injection channel. An id arriving longer than this is replaced
 * rather than truncated: a truncated attacker string is still an attacker string.
 */
const MAX_REQUEST_ID_LENGTH = 128;

/** Ids appear in logs and audit rows, so keep them to characters that cannot lie. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.:-]+$/;

/**
 * Variables this middleware puts on the context.
 *
 * `audited` is declared here rather than in the audit middleware because both
 * halves of the trail read it: `recordAudit` sets it to claim a request, and
 * `middleware/audit.ts` checks it before writing its coarse fallback row.
 */
export interface RequestContextVariables {
  requestId: string;
  log: ReturnType<typeof createChildLogger>;
  audited?: boolean;
  /**
   * Set by `requireAuth`, which runs later on the routes that have it. Declared
   * here — narrowed to what the log line reads — because this middleware runs
   * before any auth and must compile without assuming the auth variables exist.
   */
  user?: { id?: string; role?: string } | null;
}

function resolveRequestId(candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (value.length > MAX_REQUEST_ID_LENGTH) continue;
    if (!SAFE_REQUEST_ID.test(value)) continue;
    return value;
  }
  return crypto.randomUUID();
}

/**
 * Health checks are the bulk of production log volume and say nothing. Logged at
 * debug so they stay visible in dev and disappear under the production level.
 */
const QUIET_PATHS = new Set(["/api/health", "/health", "/"]);

export function requestContext() {
  return createMiddleware<{ Variables: RequestContextVariables }>(async (c, next) => {
    const requestId = resolveRequestId([
      c.req.header(REQUEST_ID_HEADER),
      c.req.header("cf-ray"),
    ]);

    c.set("requestId", requestId);
    c.set("log", createChildLogger({ requestId }));

    // Set before `next()` so the header survives a handler that throws — the
    // 500 the client sees must carry the id they will quote back at us.
    c.header(REQUEST_ID_HEADER, requestId);

    const start = Date.now();
    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      const user = c.get("user");

      const payload = {
        method: c.req.method,
        path: c.req.path,
        status: c.res?.status,
        duration,
        ...(user?.id ? { actorId: user.id, actorRole: user.role } : {}),
      };

      const log = c.get("log");
      if (QUIET_PATHS.has(c.req.path)) {
        log.debug(payload, `${c.req.method} ${c.req.path} ${c.res?.status} ${duration}ms`);
      } else {
        log.info(payload, `${c.req.method} ${c.req.path} ${c.res?.status} ${duration}ms`);
      }
    }
  });
}
