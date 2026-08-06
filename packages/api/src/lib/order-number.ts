/**
 * Order numbers.
 *
 * Extracted from `routes/orders.ts` so that other routes creating orders —
 * gift card purchases, for one — can number them without importing a route
 * module and, with it, the whole middleware graph that module pulls in.
 */

import { sql } from "drizzle-orm";

import { db } from "../database";
import { orders } from "../database/schema/orders";

export const ORDER_NUMBER_PREFIX = "MA";

/**
 * Generate a unique order number.
 * Format: MA-YYYY-NNNNNN (e.g. MA-2026-000123)
 */
export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${ORDER_NUMBER_PREFIX}-${year}-`;

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.orderNumber} LIKE ${prefix + "%"}`);

  const count = (result[0]?.count ?? 0) + 1;
  const sequenceNumber = count.toString().padStart(6, "0");

  return `${prefix}${sequenceNumber}`;
}
