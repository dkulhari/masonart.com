/**
 * Order numbers.
 *
 * Extracted from `routes/orders.ts` so that other routes creating orders —
 * gift card purchases, for one — can number them without importing a route
 * module and, with it, the whole middleware graph that module pulls in.
 *
 * Numbers are issued under the chobii prefix `CA-` and read under both it and
 * the masonart prefix `MA-` that preceded the rebrand (#361). Reading has to
 * accept both because customers already hold `MA-` numbers, in confirmation
 * emails and SMS that cannot be recalled, and the order routes decide whether
 * a path segment is an order number *before* they will query for it.
 */

import { or, sql } from "drizzle-orm";

import { db } from "../database";
import { orders } from "../database/schema/orders";

/** The prefix new orders are issued under. */
export const ORDER_NUMBER_PREFIX = "CA";

/**
 * Prefixes no longer issued but still in customers' hands.
 *
 * `MA` is masonart, the brand this store carried before the chobii rebrand.
 */
export const LEGACY_ORDER_NUMBER_PREFIXES = ["MA"] as const;

/** Every prefix an order number may legitimately carry, current one first. */
export const ORDER_NUMBER_PREFIXES: readonly string[] = [
  ORDER_NUMBER_PREFIX,
  ...LEGACY_ORDER_NUMBER_PREFIXES,
];

/**
 * Whether `id` looks like an order number rather than an order UUID.
 *
 * The separator is part of the test on purpose: without it "CANCELLED" reads as
 * an order number, and the routes would go on to query for it.
 */
export function isOrderNumber(id: string): boolean {
  return ORDER_NUMBER_PREFIXES.some((prefix) => id.startsWith(`${prefix}-`));
}

/**
 * The year-scoped prefixes that count towards `year`'s sequence.
 *
 * Legacy prefixes are included so the sequence carries on across the rebrand.
 * Counting only the current prefix would restart at 000001 partway through the
 * year and leave two different orders sitting at sequence 1 in it.
 */
export function orderNumberYearPrefixes(year: number): string[] {
  return ORDER_NUMBER_PREFIXES.map((prefix) => `${prefix}-${year}-`);
}

/**
 * Generate a unique order number.
 * Format: CA-YYYY-NNNNNN (e.g. CA-2026-000123)
 */
export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      or(
        ...orderNumberYearPrefixes(year).map(
          (prefix) => sql`${orders.orderNumber} LIKE ${prefix + "%"}`,
        ),
      ),
    );

  const count = (result[0]?.count ?? 0) + 1;
  const sequenceNumber = count.toString().padStart(6, "0");

  return `${ORDER_NUMBER_PREFIX}-${year}-${sequenceNumber}`;
}
