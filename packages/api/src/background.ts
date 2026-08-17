/**
 * Background Workers
 *
 * The one place periodic work starts.
 *
 * Two sweeps were written, tested and exported, and then nothing ever called
 * them: `startGiftCardDeliveryScheduler` and `startDeadlineChecker`. A
 * customer who bought a gift card with a future send date paid for it and the
 * recipient was never emailed (#573). There was no established startup site
 * for periodic work, so neither commit made one silently. This is it.
 *
 * BullMQ is already in the repo for review media, but these two are plain
 * `setInterval` sweeps and converting them is a separate decision. What
 * matters first is that they run at all.
 *
 * ## More than one API process
 *
 * Every instance runs these sweeps, and that is safe rather than accidental:
 *
 * - Gift card delivery mints through a unique constraint on
 *   `gift_card.purchase_order_id`, so the loser of a race gets a constraint
 *   violation and treats it as "someone else delivered it"
 *   (`gift-card-delivery.test.ts` covers exactly that).
 * - The deadline checker marks reminders sent before moving on, so a second
 *   pass finds nothing to do.
 *
 * What it costs is duplicate polling. An instance that should not poll — an
 * extra web replica, a one-off container, a worker doing something else — sets
 * `DISABLE_BACKGROUND_WORKERS=true` and starts none of it.
 */

import { startGiftCardDeliveryScheduler } from "./services/gift-card-delivery";
import { startDeadlineChecker } from "./services/approval-deadline";
import { startAuditRetentionWorker } from "./queues/audit-retention";
import { logger } from "./lib/logger";

export interface BackgroundWorkers {
  /** Stops every sweep this call started. Safe to call twice. */
  stop: () => void;
}

/**
 * Starts the periodic sweeps and returns a handle that stops them.
 *
 * Called from `src/index.ts` outside test runs, and stopped from the same
 * shutdown path that closes the review media queue.
 */
export function startBackgroundWorkers(): BackgroundWorkers {
  if (process.env.DISABLE_BACKGROUND_WORKERS === "true") {
    logger.info(
      "Background workers disabled by DISABLE_BACKGROUND_WORKERS — gift card delivery, approval deadlines and audit retention will not run in this process",
    );
    return { stop: () => {} };
  }

  // Scheduled gift cards are minted at send time, so this sweep is the only
  // thing that delivers them. Immediate purchases go through the payment
  // verification path instead and do not depend on it.
  const giftCardDelivery = startGiftCardDeliveryScheduler();

  const deadlineChecker = startDeadlineChecker();

  // Retention on the audit log. Safe to run in every instance for the same
  // reason as the sweeps above: deleting rows that are already gone is a no-op,
  // and the delete is bounded by age rather than by count.
  const auditRetention = startAuditRetentionWorker();

  logger.info(
    "Background workers started: gift card delivery, approval deadlines, audit retention",
  );

  let stopped = false;

  return {
    stop: () => {
      // Shutdown can be entered from SIGTERM and SIGINT both; stopping twice
      // must not throw on a signal path that owns process exit.
      if (stopped) return;
      stopped = true;

      clearInterval(giftCardDelivery);
      deadlineChecker.stop();
      auditRetention.stop();
      logger.info("Background workers stopped");
    },
  };
}
