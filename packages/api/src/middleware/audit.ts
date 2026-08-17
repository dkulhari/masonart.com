/**
 * The audit floor.
 *
 * `recordAudit` is precise but opt-in — and opt-in is exactly how the gap this
 * feature closes happened. Refunds, order cancellation, role assignment and
 * price edits each shipped without anyone remembering to record the actor, not
 * because the pattern was hard but because nothing forced the question.
 *
 * This middleware forces it. Every mutating request under a mounted prefix lands
 * a row whether or not its handler cooperated, so the worst case for a route
 * added next month is a coarse entry — never a missing one.
 *
 * It deliberately records less than `recordAudit`: method, path, params, status.
 * No entity delta, because a middleware cannot know what changed. The precise
 * rows are an upgrade on top of the floor, not a replacement for it.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.5
 */

import { createMiddleware } from "hono/factory";
import type { AuditAction } from "@chobii/shared";
import { recordAudit } from "../lib/audit";
import type { RequestContextVariables } from "./request-context";

/** Reads change nothing, and a table that is 99% GETs is unreadable. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whose write this was, derived from the path rather than from how the
 * middleware was mounted. A vendor's own writes are then separable from staff
 * writes with one category filter, and a second mount cannot be misconfigured
 * into mislabelling a whole tree.
 */
function floorAction(path: string, fallback: AuditAction): AuditAction {
  return path.startsWith("/api/vendor") ? "vendor.request" : fallback;
}

/**
 * Record every mutating request on this prefix that no handler claimed.
 *
 * @param action Floor action for non-vendor paths. Overridable for a tree that
 *   is neither admin nor vendor; the default is what every current mount wants.
 */
export function auditRequests(action: AuditAction = "admin.request") {
  return createMiddleware<{ Variables: RequestContextVariables }>(async (c, next) => {
    if (READ_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    // `finally`, not a straight-line await: a handler that threw is exactly the
    // attempt worth keeping. The 500 lands as an outcome and the error still
    // propagates to app.onError untouched.
    try {
      await next();
    } finally {
      // A cooperating handler already described this action better than a
      // middleware can. One action, one row.
      if (!c.get("audited")) {
        const status = c.res?.status ?? 500;

        // An unauthenticated rejection is not somebody doing something. It has
        // no actor, no entity and no action, and any bot probing /api/admin/*
        // can produce them without limit — measured on the live table before
        // this rule existed, 863 anonymous 401s against 15 real rows, all kept
        // for the full 400-day window.
        //
        // A 403 is the opposite and is kept: authenticated, identified, and
        // told no. So is anything with an actor, and so is a 500 — a crash is
        // not nobody doing nothing. The 401s remain in the request log, where
        // volume is cheap and retention is short.
        if (status === 401 && !c.get("user")) {
          return;
        }

        // Awaited rather than fired and forgotten: recordAudit never throws, so
        // the only cost is one insert of latency, and in exchange the row is
        // durable before the response is finished — which is what makes an
        // assertion right after a request honest instead of racy.
        await recordAudit(c, {
          action: floorAction(c.req.path, action),
          outcome: status >= 400 ? "failure" : "success",
          summary: `${c.req.method} ${c.req.path} → ${status}`,
          metadata: {
            status,
            params: c.req.param(),
            query: c.req.query(),
          },
        });
      }
    }
  });
}
