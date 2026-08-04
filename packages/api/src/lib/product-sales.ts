/**
 * Units sold, as a real number.
 *
 * The parity analysis (§1.3.5) put "Best selling" among the three sorts we
 * could not offer, on the reading that no sales signal existed. One does:
 * `order_items` carries `quantity` and `orders` carries payment status. What
 * did not exist was a place to express the aggregate once.
 *
 * ## Why a correlated subquery rather than a join
 *
 * The product list already `leftJoin`s `reviews` and groups by `products.id`.
 * A second join against `order_items` fans the rows out across that first
 * join: `sum(quantity)` would multiply by the review count and
 * `count(reviews.id)` would multiply by the order-item count. Both numbers
 * corrupt silently — no error, just wrong figures on a public page.
 *
 * A scalar subquery cannot fan out. It is evaluated per candidate row, which
 * an index on `order_items(product_id)` makes an index lookup rather than a
 * scan. If the catalogue ever grows to where sorting the whole set costs
 * real time, the upgrade path is a materialised view refreshed on order
 * settlement — not a join back into this query.
 *
 * ## What counts as a sale
 *
 * Payment must have succeeded, and the order must not have been undone. The
 * status test is a denylist so that a status added later counts by default
 * rather than being silently dropped from every seller's total.
 *
 * With no orders in the database this returns 0 for every product, and the
 * Best-selling sort falls through to its tie-break. That is the honest
 * answer for an unsold catalogue — the alternative is inventing a ranking.
 */

import { sql, type SQL } from "drizzle-orm";
import { products } from "../database/schema/products";

/** Order statuses that undo a sale. Everything else with a paid order counts. */
const VOIDED_ORDER_STATUSES = ["cancelled", "refunded", "failed"] as const;

/**
 * `coalesce(sum(quantity), 0)` over settled orders for the given product row.
 *
 * Correlates against `products.id`, so it belongs in a query that has
 * `products` in scope. Safe inside a grouped query because `products.id` is
 * the grouping key.
 */
export function unitsSoldSql(): SQL<number> {
  return sql<number>`coalesce((
    select sum(order_items.quantity)::int
    from order_items
    join orders on orders.id = order_items.order_id
    where order_items.product_id = ${products.id}
      and orders.payment_status = 'paid'
      and orders.status not in (${sql.join(
        VOIDED_ORDER_STATUSES.map((status) => sql`${status}`),
        sql`, `
      )})
  ), 0)`;
}
