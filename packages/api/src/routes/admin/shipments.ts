/**
 * Admin Shipments API Routes
 *
 *   GET   /api/admin/shipments                     list, filtered and paged
 *   GET   /api/admin/shipments/ready               the ready-to-label queue
 *   POST  /api/admin/orders/:orderId/ship          buy the label (#729)
 *   GET   /api/admin/shipments/:id                 one shipment and its order
 *   PATCH /api/admin/shipments/:id                 status, tracking, carrier
 *   POST  /api/admin/shipments/:id/mark-delivered  close it out
 *   POST  /api/admin/shipments/:id/void            void the label (#731)
 *   GET   /api/admin/shipments/:id/label           the label PDF, as bytes (#735)
 *
 * Every route requires an admin session; patterns from
 * docs/poster-app-tech-stack.md.
 *
 * ## The ready-to-label queue (#730)
 *
 * `GET /ready` is the only route here that asks production a question. An admin
 * opening a dispatch screen wants the work, not the backlog: which orders could
 * be labelled right now, and for the ones that are close, what is stopping
 * them. Three rules hold it together, each naming the test in
 * `tests/routes/admin/shipments-ready-queue.test.ts` that enforces it, because
 * a rule whose only enforcer is a reader is a rule with an expiry date:
 *
 * 1. **The verdict is the seam's.** This route calls `evaluateLabelReadiness`
 *    — the exact pure predicate `getOrderLabelReadiness` is defined as — and
 *    decides nothing about a job, a transfer or a consolidator itself. What it
 *    DOES own is which orders get asked at all, which are facts about the order
 *    rather than opinions about production. `regrouping the batched rows` holds
 *    this route's answer against the seam's own order by order, and
 *    `the candidate predicate` renders the scan's SQL clause by clause.
 * 2. **The reads are batched; the predicate is not.** See
 *    `loadOrderProductionSnapshots`, and `parity with lib/production-readiness`.
 * 3. **The candidate set is bounded before anything is evaluated,** and the
 *    bound is escapable. See `READY_QUEUE_SCAN_LIMIT`, `bounds and refusals`
 *    and `READY_QUEUE_CURSOR_PATTERN`.
 *
 * The envelope has two axes and one set of keys per axis: the page keys mean
 * what the two sibling admin lists mean by them, and `scanTruncated` with
 * `nextScanCursor` is the window axis. `hasNextPage` argues at the key itself
 * why answering for both axes made the walk this console runs non-terminating,
 * and `terminates the page walk it tells a client to do` is the enforcer.
 *
 * The rest of this file arrived with the queue and could not be landed after it
 * without landing a known defect first: sharing `SHIPPABLE_ORDER_STATUSES` so
 * the screen and the write agree exposed the double shipment row, refusing that
 * needs a lock, a lock needs a transaction, and the transaction exposed the
 * half-applied write pairs beside it.
 *
 * ## An order that already has a shipment is reported, not hidden
 *
 * There is a wrong answer in each direction: a queue looking only for a label
 * re-offers work an admin has already actioned, because
 * `PATCH /admin/orders/:id/shipping` (and the legacy data #708 backfilled)
 * leaves rows with no label bought, on which every column
 * `ORDER_HAS_LIVE_LABEL` coalesces NULL; and excluding those orders
 * instead deletes ready-to-LABEL work from the endpoint whose purpose is to
 * surface it. So the WRITE — `lib/shipment-dispatch.ts` since #729 — refuses
 * a second live label (`ORDER_HAS_LIVE_LABEL`) or an in-flight claim
 * (`LABEL_PURCHASE_IN_PROGRESS`) under its lock, and the QUEUE reports the
 * open row on `ReadyQueueItem.openShipment`.
 *
 * `openShipmentsOf` is the file's only spelling of "still open" and
 * `NEWEST_OPEN_SHIPMENT_FIRST` the only answer to WHICH open row is meant —
 * both argued where they are defined, along with the afternoon on which a third
 * spelling left an order shippable to the write and invisible to the screen for
 * ever, and why a 409 naming a row the screen never showed is a remedy an admin
 * cannot follow.
 *
 * ## The queue is advisory
 *
 * This file is on `LABEL_READINESS_CONSUMERS` in `lib/production-readiness.ts`
 * as "the gate itself". Read that as where the gate BELONGS, not as what is
 * here now: `POST /orders/:orderId/ship` tests `SHIPPABLE_ORDER_STATUSES`,
 * refuses a second live shipment, and asks production nothing. Nothing matching
 * the allow-list's `lib/shipment-*` exists yet, so today NOTHING in this system
 * refuses a shipment on production grounds. The seam's one other caller reads
 * too, and neither is what the allow-list polices:
 * `tests/lib/production-seam.test.ts` scans for the GATE token
 * `isOrderReadyToLabel(`, so a `getOrderLabelReadiness` reader is outside it by
 * construction rather than by permission.
 *
 * An order this screen shows as blocked can therefore still be shipped, and
 * that is not a bug in the seam. Claiming the two routes ask the same question,
 * one to refuse with and one to plan with, is how — at 2am, after a label was
 * bought for an order the queue showed red — the person holding the pager ends
 * up in `lib/production-readiness` hunting a bug over a state this file told
 * them was impossible. They share a status list and a shipment-liveness
 * predicate, not a verdict. `the readiness verdict is asked for in exactly one
 * place` counts the call sites here and fails in BOTH directions, so whoever
 * puts the gate on the ship route is told to rewrite this section.
 *
 * ## The three write pairs are atomic
 *
 * `POST /orders/:orderId/ship`, `PATCH /:id` and `POST /:id/mark-delivered`
 * each write `order_shipments` and then `orders`. As two independent statements
 * with no transaction anywhere in the file, a throw between them left:
 *
 * - `/mark-delivered` — the shipment saying `delivered` with a `delivered_at`
 *   and the order still `shipped`. The customer's tracking page reads
 *   `order_shipments` (`routes/tracking.ts`) and says delivered; the admin
 *   orders list reads `orders` and says in transit; the return window, counted
 *   from the order, has not started.
 * - `PATCH /:id` — a shipment at `shipped` against an order still
 *   `processing`: the same split one step earlier.
 * - `POST /:orderId/ship` — a shipment row for an order still `confirmed`, the
 *   mildest of the three, since `SHIPPABLE_ORDER_STATUSES` admits both.
 *
 * Each now runs in one `db.transaction`, in the shape `lib/vendor-scope.ts`
 * sets for a scoped write: a locked scoped re-read `.for("update")` first;
 * refusals raised by THROWING `AdminShipmentWriteRefused` so they roll back
 * rather than return; the predicate REPEATED in the write; the row count
 * checked and a mismatch answered `CONCURRENT_MODIFICATION`; and the success
 * audit row written INSIDE the transaction with the `tx`, because a row
 * asserting a delivery that rolled back is the audit trail lying.
 *
 * The lock is not decoration on `/mark-delivered`: two concurrent calls both
 * cleared the `already delivered` guard and both wrote, and the second moved
 * `delivered_at` and with it the apparent start of the return window. The
 * un-concurrent way to move that same date was a guard on the wrong table, and
 * `orderShouldMoveTo` — the one gate both handlers ask — carries that argument
 * and what `routes/returns.ts` anchors on the column.
 *
 * `every handler that writes both tables does it in one transaction` is the
 * enforcer, written to fail four ways: no transaction, a second write through
 * the ROOT `db` handle inside the callback, a pair split across the callback
 * boundary, and a pair spread over two transactions that commit separately.
 * The second is the one a scan misses, because `db.update(orders)` written
 * inside `db.transaction(async (tx) => …)` runs on the root connection and
 * commits whatever the transaction does.
 *
 * What none of that covers is a BACKWARDS move among the statuses that follow
 * their shipment, which needs an order-status transition matrix this repo has
 * for production jobs and not for orders. `ORDER_FOLLOWS_ITS_SHIPMENT` argues
 * the deferral, and `tests/routes/admin/shipments-status-propagation.test.ts`
 * pins the wrong behaviour so it is executable rather than prose.
 *
 * ## One allow-list per table, and citations by symbol
 *
 * Every `order_shipments` projection here is one constant — `GET /` and
 * `GET /:id` each carried an inline list beside `SHIPMENT_RESPONSE_COLUMNS`,
 * three lists with one signpost — and the four constants argue themselves.
 * `every order_shipments projection in this file is one allow-list` holds the
 * recorded projections against all four at runtime, with `deliveredAt` as the
 * sentinel for a fifth list appearing.
 *
 * The comments cite SYMBOLS where the repo's house style is `path:line`, a
 * departure scoped to this file and its ready-queue suite, argued from a
 * measurement: a 198-line insertion into `lib/production-readiness.ts` broke
 * five of this file's citations at once — each correct before it, each landing
 * on unrelated code after it, with nothing going red. The house style works
 * where a file cites itself, because the citation moves with the edit; every
 * citation here crosses a seam into a file this ticket does not own.
 * `the citations in this feature name symbols, never line numbers` enforces it,
 * resolves the filenames on disk, and holds the cross-seam symbols against the
 * files supposed to define them.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  gt,
  gte,
  lte,
  ne,
  isNull,
  inArray,
  notInArray,
  type SQL,
} from "drizzle-orm";

import { db } from "../../database";
import {
  orderShipments,
  shippingOptions,
  shipmentStatusEnum,
  type ShipmentStatus,
} from "../../database/schema/shipping";
import {
  orders,
  orderItems,
  type OrderStatus,
  type OrderType,
} from "../../database/schema/orders";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { generateTrackingUrl } from "../shipments";
import { recordAudit } from "../../lib/audit";
import {
  ORDER_FOLLOWS_ITS_SHIPMENT,
  ORDER_STATUS_FOR_SHIPMENT_STATUS,
  orderShouldMoveTo,
} from "../../lib/shipment-status";
import {
  buyLabelForOrder,
  voidLabel,
  DISPATCH_REFUSAL_STATUS,
  LABEL_OBJECT_PREFIX,
  ShipmentDispatchError,
} from "../../lib/shipment-dispatch";
import { getFile } from "../../lib/storage";
import { ShiprocketError, SHIPROCKET_REFUSAL_STATUS } from "../../services/shiprocket";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "../../lib/logger";
import {
  evaluateLabelReadiness,
  loadOrderProductionSnapshots,
  NON_PRODUCIBLE_ORDER_TYPES,
  type LabelBlocker,
} from "../../lib/production-readiness";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * The shipment statuses, as zod wants them.
 *
 * The cast is to a NON-EMPTY TUPLE, which is the only shape `z.enum` accepts,
 * and it keeps the literal union — it used to be `as unknown as [string,
 * ...string[]]`, which typed every parsed `status` as a bare `string`. That is
 * what let `PATCH /:id` build its update object as `Record<string, unknown>`
 * and hand it to drizzle unchecked: with the real union, an update assembled
 * from the status table is checked against the column on the way through.
 */
const SHIPMENT_STATUS_VALUES = [...shipmentStatusEnum.enumValues] as [
  ShipmentStatus,
  ...ShipmentStatus[],
];

/**
 * The order statuses a shipment may be opened against.
 *
 * Hoisted out of `POST /orders/:orderId/ship`, where it was a local
 * `shippableStatuses`, so the ready-to-label queue and the route that acts on
 * it read ONE list. A queue built from its own idea of which orders are in play
 * is a screen that offers an admin work the next request answers `400 Cannot
 * create shipment for order with status '...'` — and the admin has no way to
 * tell that from a bug.
 *
 * Payment is deliberately not a second condition: `confirmed` is *defined* as
 * "payment confirmed, order accepted" (`schema/orders.ts`), so a
 * `payment_status` clause would either be redundant or would quietly disagree
 * with the status enum. It would also be wrong the day cash-on-delivery lands —
 * a COD order is shippable and never `paid`.
 */
const SHIPPABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "confirmed",
  "processing",
];

/**
 * Order types that never need a courier at all — half a rule; see the fragment
 * below for the other half and for why one of them alone was not enough.
 *
 * IMPORTED, not listed. `producibleItems` short-circuits on exactly this list
 * (`producibleItems` in `lib/production-readiness.ts`), and this scan has to keep the same
 * orders out of a screen no label is ever bought from. It used to be a second
 * `["gift_card"]` tuple spelled here with nothing holding the two together, so
 * a fourth non-shipping order type would have entered this queue and stuck at
 * the top of it. `the non-shipping order types are the seam's list` asserts the
 * tuple is non-empty and that every member of it is bound into the SQL, because
 * `notInArray(order_type, [])` renders `true` and would exclude nothing.
 *
 * The two names are not the same sentence — "produces nothing" and "needs no
 * courier" would come apart the day we resell stock we did not make — and the
 * import is still right today, because nothing produced is nothing to ship. The
 * day that stops holding, this constant grows a body of its own and the comment
 * above the divergence is the whole point of naming it separately now.
 */
const NON_SHIPPING_ORDER_TYPES: readonly OrderType[] = NON_PRODUCIBLE_ORDER_TYPES;

/**
 * The order has at least one line somebody has to make.
 *
 * `lib/production-readiness` calls an order with nothing to produce READY, and
 * it is right to: nothing is made for a voucher, so it is not waiting on
 * production. It is not waiting on a parcel either, and no label is ever bought
 * for it — so an order like that sits at the TOP of this queue, zero blockers
 * and the oldest timestamp, and nothing moves it off, because the live-label
 * clause cannot fire on an order no label is ever bought for. Readiness asks
 * whether the goods are at the consolidator; this asks whether there are goods,
 * which is a fact about the order and belongs to the scan.
 *
 * **The `order_type` clause alone used to be the whole rule, and it was a
 * proxy.** It matched `producibleItems`'s first line and not its second, and
 * the difference is not theoretical:
 * `routes/cart.ts` writes a cart gift card as an `order_items` row carrying
 * a `gift_card_purchase` payload, and `routes/orders.ts` then stamps the
 * ORDER `ai_generated` or `regular` — never `gift_card`, which only the
 * standalone `/gift-cards` flow (`routes/gift-cards.ts`) writes. Every gift
 * card bought through the cart therefore arrived here as a `regular`,
 * `confirmed` order with no jobs, read ready with no blockers, and stuck to the
 * top of the queue. `an order with nothing to produce` in the suite runs the
 * seam over that exact row shape, so the reason is executable, not asserted.
 *
 * Both halves stay, and they are not redundant: drop the `order_type` one and a
 * standalone `/gift-cards` order carrying a stray product line enters the queue
 * too, because `producibleItems` short-circuits on the order type before it
 * ever looks at a line and would call that order ready with nothing to do.
 *
 * `is null` rather than a `line_type` test, because `gift_card_purchase` is the
 * column the seam reads (`loadOrderProductionSnapshot` in `lib/production-readiness.ts`) — agreeing with it
 * through a different column is agreeing only until the two drift.
 */
const ORDER_HAS_A_LINE_TO_PRODUCE = sql`exists (
  select 1
  from ${orderItems}
  where ${orderItems.orderId} = ${orders.id}
    and ${orderItems.giftCardPurchase} is null
)`;

/**
 * How many candidate orders one request will rank.
 *
 * Ranking by readiness means readiness has to be known for every candidate
 * before the page can be cut, so this bound — not `pageSize` — is what decides
 * the work. At the cap that is five batched reads over 200 order ids, which is
 * the same five reads it would be over five orders.
 *
 * The scan asks for `LIMIT + 1` and reports `scanTruncated` when it comes back
 * full. A queue that silently ranks the first 200 of 600 orders and calls the
 * result "the queue" is lying to the person deciding what to ship today; one
 * extra row is a cheaper way to be honest than a second `count(*)`.
 *
 * **A cap without a way past it is a bug, not a bound.** The cap alone — 200
 * oldest, ranked in memory, `page` applied to the ranked list — leaves every
 * ready order outside the oldest 200 unreachable once the backlog is deeper
 * than the cap, from the endpoint whose stated purpose is to surface exactly
 * those. The state that produces it is the ordinary one: a stall at the FRONT
 * of the pipeline, 200 old orders with no consolidator sitting at the head of
 * the scan and the finished work behind them. `scanTruncated` names that and
 * offers nothing to do about it; `scanAfter` is what to do about it — see
 * `READY_QUEUE_CURSOR_PATTERN` (#730).
 */
const READY_QUEUE_SCAN_LIMIT = 200;

// The shipment-to-order tables and `orderShouldMoveTo` moved to
// `lib/shipment-status.ts` in #733, so this route and the courier webhook read
// ONE table. Both tables are still re-exported at the bottom of this file for
// `tests/routes/admin/shipments-status-propagation.test.ts`.

/**
 * A uuid, as four hyphen-separated hex groups and a fifth.
 *
 * It used to be a 36-character class of hex-digits-and-hyphen, spelled out at
 * each of this file's four `:id` routes — a length check wearing a pattern's
 * clothes. The hyphen is inside that class, so thirty-six hyphens walk through
 * the guard into a query that binds them as a uuid; Postgres answers `invalid
 * input syntax for type uuid`, the catch turns that into a 500, and a caller's
 * typo is reported back to them as our outage.
 *
 * Version and variant nibbles are deliberately NOT pinned: real ids here
 * include `00000000-0000-0000-0000-0000000000cc`
 * (`tests/routes/admin/shipments-audit.test.ts`), and a guard stricter than
 * the column it guards refuses rows the database is happy to hold. `the id
 * guard every :id route in this file shares` pins both directions.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The SHAPE of a scan cursor: `<placed-at ISO>|<order id>`.
 *
 * A keyset cursor over the scan's own `ORDER BY created_at, id`, and both
 * halves are load-bearing. `created_at` alone is not a total order — two orders
 * placed in the same clock tick would make a walk either skip one or loop on
 * it — which is the same reason `rankReadyQueue` ends on the id.
 *
 * **Built FROM `UUID_PATTERN`, not beside it.** A second uuid spelling here
 * would be a second place to make the mistake that pattern was fixed for: a
 * 36-character class of hex-and-hyphen accepts thirty-six hyphens, which reach
 * a query as a uuid and come back as a 500 over a caller's typo. Deriving it
 * means the cursor inherits the fix instead of re-deriving it.
 *
 * **Shape is not validity, so this pattern is not the gate.** `\d{2}` has no
 * opinion about calendars, so two strings walk straight through it:
 *
 * - `2026-13-45T09:00:00.000Z` — `new Date` answers Invalid Date, drizzle binds
 *   a timestamp by calling `toISOString()` on it, and that throws `RangeError:
 *   Invalid Date` while the query is still being BUILT. The handler's catch
 *   turns it into `500 Failed to build the ready-to-label queue` — a caller's
 *   typo reported as our outage, which is the exact failure the comment above
 *   said this pattern existed to prevent.
 * - `2026-02-30T09:00:00.000Z` — no error at all. JS rolls it forward to
 *   `2026-03-02T09:00:00.000Z`, so the window starts two days after the string
 *   the caller sent and every candidate placed in between is dropped with a
 *   200 and nothing anywhere admitting it — a skip, which is the one thing a
 *   cursor is supposed never to do.
 *
 * Both were measured — `is refusing something real` runs the same two values
 * through `Date` and through `PgDialect`, because the recording database never
 * builds SQL and answered 200 to both. So the gate is `parseScanCursor`, not
 * this constant; the pattern still comes first, and still from `UUID_PATTERN`,
 * because it is what makes the calendar check total on its input.
 *
 * The timestamp half is milliseconds because that is all a JS `Date` holds,
 * while `orders.created_at` is a Postgres `timestamp` with microseconds. So a
 * cursor can be very slightly BEHIND the row it names, and the next window can
 * repeat that row. A repeat, never a skip: that is the guarantee this cursor
 * makes, and it holds for every cursor this route emits.
 */
const READY_QUEUE_CURSOR_PATTERN = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z)\\|(${UUID_PATTERN.source.slice(
    1,
    -1
  )})$`,
  "i"
);

/** The two halves of a cursor, once `parseScanCursor` has vouched for them. */
interface ReadyQueueScanCursor {
  placedAt: Date;
  orderId: string;
}

/**
 * A matched timestamp in the one spelling `Date.prototype.toISOString` uses.
 *
 * Round-tripping is the calendar check, and it only works against a single
 * spelling: `toISOString` always emits three fraction digits and an upper-case
 * `T`/`Z`, while the pattern accepts one to three digits, none at all, and
 * either case — all of which `new Date` reads as the same instant. Normalising
 * instead of tightening the pattern keeps every cursor this route has ever
 * emitted readable, which is the whole point of a cursor.
 */
function canonicalIsoMillis(stamp: string): string {
  const upper = stamp.toUpperCase();
  const dot = upper.indexOf(".");
  if (dot < 0) return `${upper.slice(0, -1)}.000Z`;
  return `${upper.slice(0, dot)}.${upper.slice(dot + 1, -1).padEnd(3, "0")}Z`;
}

/**
 * A cursor string as the pair the predicate binds — and the gate that decides
 * whether there is one.
 *
 * Three checks, in the only order that is total: the shape, so the halves
 * exist; `NaN`, because `toISOString` THROWS on an Invalid Date and a check
 * that throws is not a check; then the round trip, which is what catches a date
 * the calendar does not have. A month of 13 dies at the second; a February 30th
 * dies at the third, and only at the third, because rolling forward is not an
 * error to `Date`.
 *
 * `null` means "no window to start after", and the two ways to get it are not
 * ambiguous at any call site: the zod schema calls this to DECIDE (a present
 * string that answers null is refused, 400, before a query is built), so by the
 * time the handler calls it again a present string is known to parse and null
 * can only mean the parameter was absent. One implementation, used as the
 * validator and as the parse, rather than a pattern that vouches and a parser
 * that hopes.
 */
function parseScanCursor(raw: string | undefined): ReadyQueueScanCursor | null {
  const match = raw ? READY_QUEUE_CURSOR_PATTERN.exec(raw) : null;
  if (!match) return null;

  const stamp = match[1] as string;
  const placedAt = new Date(stamp);
  if (Number.isNaN(placedAt.getTime())) return null;
  if (placedAt.toISOString() !== canonicalIsoMillis(stamp)) return null;

  return { placedAt, orderId: match[2] as string };
}

/** The position a caller sends back to read the window after this one. */
function formatScanCursor(placedAt: Date, orderId: string): string {
  return `${placedAt.toISOString()}|${orderId}`;
}

/**
 * The shipment statuses that mean a shipment is over and did not carry the
 * goods — so the order behind it is work again.
 *
 * A LITERAL, and the departure from this file's derive-don't-list rule is
 * deliberate: there is no shipment-status transition matrix to derive from.
 * `lib/production-transitions.ts` is production's, and inventing an equivalent
 * for `shipment_status` inside a route is how a matrix ends up with two homes.
 * `the shipment statuses that end a shipment` in the suite holds every member
 * against `shipmentStatusEnum`, so a renamed enum value is a red test rather
 * than a set that quietly stopped matching anything.
 *
 * Only `cancelled`. `schema/shipping.ts` draws the distinction this rests
 * on: `cancelled` is the label voided or the shipment called off, `failed` is a
 * failed DELIVERY of a parcel that still exists. Deliberately absent, each for
 * a stated reason rather than by oversight:
 *
 * - `failed`, `undelivered` — the parcel exists and a courier is holding it. A
 *   second shipment for the same goods is not the remedy.
 * - `lost`, `rto_delivered` — the goods really are gone or back, and a remake
 *   or a return is owed. Both are decisions with their own routes, and the
 *   order carrying them has left `SHIPPABLE_ORDER_STATUSES` anyway, so this
 *   list would not be what decided it.
 *
 * The empty case fails in the safe direction and that is not luck:
 * `notInArray(status, [])` renders `true`, so every non-voided row would keep
 * its order out of the queue. Work an admin cannot find, rather than a second
 * label bought for a parcel already moving.
 */
const CLOSED_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ["cancelled"];

/**
 * A shipment is open on this order: not voided, and not in a status that ends
 * it.
 *
 * THE definition of "open" in this file, and there is exactly one on purpose.
 * Three readers use it and every one of them would be a place to get it wrong
 * separately: `POST /orders/:orderId/ship` refuses on it, the ready queue
 * REPORTS on it, and `ORDER_HAS_LIVE_LABEL` — the queue's exclusion — asks it
 * before it looks for a courier handle.
 *
 * The third is why this paragraph is worded as an absolute.
 * `ORDER_HAS_LIVE_LABEL` spelling `voided_at IS NULL` itself reads as a
 * harmless duplication and is not: an order whose only shipment has been
 * CANCELLED is then shippable to the write and invisible to the queue,
 * permanently. Two spellings of "still open" is how the screen and the write
 * come to disagree; three is how one of them disagrees silently.
 *
 * **The refusal belongs on the WRITE, not in the queue's WHERE (#730).** The
 * defect it answers is real: the ship route writes a row with `trackingNumber`
 * optional, `awb_number` and `label_object_token` untouched and status
 * `pending`, so all three columns `ORDER_HAS_LIVE_LABEL` coalesces are NULL and
 * the order comes back at rank 1 forever. But an order with an unlabelled
 * shipment row is still ready-to-LABEL work — no label has been bought, which
 * is the queue's entire subject — so excluding it from the queue deletes the
 * work from the endpoint whose stated purpose is to surface it, with no
 * reachable way back: the only remedy such an exclusion can name is
 * `voided_at`, and nothing in this repo writes `voided_at` outside its own
 * column declaration.
 *
 * The damage is done by the WRITE, so that is where the refusal lives. The
 * queue reports the row, and both are held to this one predicate.
 *
 * **Why the database cannot do it instead.**
 * `order_shipments_live_label_idx` is UNIQUE on `(order_id)` but PARTIAL on
 * `voided_at IS NULL AND label_object_token IS NOT NULL`, and the token half is
 * load-bearing there — without it the index would refuse the second UNLABELLED
 * row, which is exactly what a re-open after a cancellation is. So the second
 * unlabelled row is legal SQL, and the only thing that can refuse it is a read
 * under a lock.
 *
 * `CLOSED_SHIPMENT_STATUSES` is what makes the refusal recoverable without a
 * `voided_at` write: cancelling the open row through
 * `PATCH /api/admin/shipments/:id` releases the order, and that route exists
 * today. Because `ORDER_HAS_LIVE_LABEL` goes through here too, the SAME
 * cancellation also releases the order back into the queue — which is the whole
 * point of there being one predicate. A remedy that unblocks the write and
 * leaves the screen blank is not a remedy.
 */
function openShipmentsOf(orderMatch: SQL) {
  return and(
    // The caller supplies the order match — `eq` for the one order the write
    // refuses on, `inArray` for the page the queue reports on — and everything
    // that decides what OPEN means is here. Passing the match in rather than
    // writing the predicate twice is the point of the function: two spellings
    // of "still open" is how the screen and the write come to disagree.
    orderMatch,
    isNull(orderShipments.voidedAt),
    notInArray(orderShipments.status, [...CLOSED_SHIPMENT_STATUSES])
  );
}

/**
 * Which of an order's open shipments is THE one: the newest, and the tiebreak
 * is total.
 *
 * Legacy data can hold more than one open row on an order — the write refusal
 * is new and `order_shipments_live_label_idx` never forbade the second
 * UNLABELLED row — so both readers of `openShipmentsOf` have to pick one, and
 * this is the pick. Spelled once for the same reason the predicate beside it
 * is: the queue reports a row and the ship route refuses on a row, and if they
 * rank the candidates differently they name different shipments.
 *
 * That divergence is not hypothetical arithmetic. `POST /orders/:orderId/ship`
 * read its blocking row under `LIMIT 1` with no `ORDER BY` at all, so the
 * planner chose. An admin reading the queue sees S2, follows the 409's own
 * remedy, cancels the shipment it names, retries, and is refused again over S1
 * — a row neither screen ever showed them, with nothing anywhere explaining the
 * second refusal.
 *
 * **`created_at DESC` alone is not the answer, and the second key is not
 * decoration.** Two rows written in the same clock tick tie on the timestamp
 * and fall back to whatever the planner returns first, which is the same defect
 * one step down. It is the argument `bestHolding` in `lib/production-readiness`
 * makes for its own tiebreak, and the one `rankReadyQueue` below makes for
 * ending on the order id.
 *
 * Deliberately NOT `order_id`: the queue's read leads with that column because
 * Postgres requires a `DISTINCT ON` expression to lead the `ORDER BY`, not
 * because it decides anything. A read already scoped to one order would gain
 * nothing from it, and a constant carrying it would be describing one caller's
 * grouping to another caller as if it were a ranking.
 *
 * `names the row the queue reports, because it reads them in the same order`
 * renders this on the write side, and
 * `reads them in the SAME order the queue does` renders BOTH and compares them,
 * so re-spelling either by hand fails even when the SQL happens to agree.
 */
const NEWEST_OPEN_SHIPMENT_FIRST = [
  desc(orderShipments.createdAt),
  desc(orderShipments.id),
] as const;

/**
 * The order has a live carrier label already — so it is out the door, not
 * waiting for one.
 *
 * A deliberate twin of `ORDER_HAS_LABEL` in `lib/vendor-scope.ts`, spelled out
 * again rather than imported because that one is module-private to the vendor
 * seam and exporting it would put a vendor-scoped fragment on a general import
 * path. The two must agree on all three HANDLES: `label_object_token` is a
 * label we bought, `awb_number` is one a carrier gave us, and `tracking_number`
 * is one an admin pasted in by hand. Any of the three means the parcel has a
 * courier handle on it.
 *
 * "Must agree" is not left to a reader: `name the same courier handles` slices
 * the `coalesce(...)` out of both templates and compares the `order_shipments`
 * columns each one names. Add a fourth handle to one side and the suite says
 * so, rather than an order that has already shipped sitting in this queue.
 *
 * **The liveness half comes from `openShipmentsOf`, never from an inline
 * `voided_at IS NULL`.** An inline one is a THIRD spelling of "still open" in a
 * file that already has two, and the divergence is not cosmetic:
 *
 * - an admin pastes a carrier handle onto the wrong order, through
 *   `PATCH /api/admin/orders/:id/shipping` or `POST /orders/:orderId/ship`.
 *   The row lands with `voided_at` NULL, the clause matches, and the order
 *   drops out of this queue;
 * - they follow the remedy this file's own 409 names and cancel it,
 *   `PATCH /api/admin/shipments/:id {"status":"cancelled"}`;
 * - `ORDER_STATUS_FOR_SHIPMENT_STATUS.cancelled` is null, so the order stays
 *   `processing` and still passes the status clause. `openShipmentsOf` now
 *   reads the row as closed, so the ship route will open another. But a clause
 *   that looks only at `voided_at` still matches, and the order never comes
 *   back.
 *
 * There is no way out of that: nothing in this repo writes `voided_at`,
 * `updateShipmentSchema` has no `awbNumber` field, and the shipping upsert in
 * `routes/admin/orders.ts` MERGES `awbNumber` so it cannot be nulled. Ready-to-
 * label work, invisible in the ready-to-label queue, permanently, while the
 * write route says the order is shippable. It is the same defect
 * `openShipmentsOf` exists to close, sitting one clause to the left, and
 * `takes its liveness from the one predicate this file has for it` is what
 * stops it being re-spelled.
 *
 * `voided_at IS NULL` is still half of what that predicate tests, and still the
 * half that is easy to drop: without it, voiding a label would leave the order
 * out of the queue forever, which is the exact state a re-buy exists to fix. It
 * is the same pair the partial unique index `order_shipments_live_label_idx` is
 * built on (migration 0027).
 *
 * **How reachable that re-entry is, stated rather than implied.** An order that
 * reached a live label has normally been PATCHed to `shipped`, which is outside
 * `SHIPPABLE_ORDER_STATUSES`, so after a void the status clause holds it out
 * regardless. The window in which this clause is the one doing the work is a
 * handle attached and withdrawn while the order is still `confirmed` or
 * `processing` — a mis-buy corrected the same afternoon, which is the ordinary
 * case and the reason the clause stays. The claim is the size of the fact.
 */
const ORDER_HAS_LIVE_LABEL = sql`exists (
  select 1
  from ${orderShipments}
  where ${openShipmentsOf(eq(orderShipments.orderId, orders.id))}
    and coalesce(
      ${orderShipments.labelObjectToken},
      ${orderShipments.awbNumber},
      ${orderShipments.trackingNumber}
    ) is not null
)`;

/**
 * One row of the queue, as an allow-list.
 *
 * Deliberately absent, and none of them by accident:
 *
 * - **Every customer field** — name, email, phone, `shipping_address`. The
 *   question this screen answers is "what can I ship", and the address is read
 *   by the route that buys the label, one order at a time. A queue carrying 200
 *   customers' addresses is a PII surface with no job to do.
 * - **Money** — `total`, `subtotal`, `cost_paise`. Nothing here is a decision
 *   about money.
 * - **The shipment row itself** — `label_object_token` above all, which is the
 *   handle on a signed PDF of a customer's address.
 * - **`internal_notes`.**
 *
 * `orderStatus` and `itemCount` stay because they are what an admin scanning a
 * queue reads to decide what to open first, and `consolidatorVendorId` is the
 * seam's own answer to "whose shelf is this on" — an id, not a name, because a
 * name is a fifth read for a display string the vendor directory already owns.
 *
 * `itemCount` is `orders.item_count`, which is a QUANTITY sum
 * (`routes/orders.ts`) and not the number of lines readiness reasoned
 * about: one poster ordered three times shows 3 here while the seam looked at
 * one item. It stays that number on purpose — it is the same count the orders
 * list and the order detail screen show, and a queue that quietly redefined a
 * column an admin already knows would be worse than one that agrees with the
 * rest of the console. Line-level facts are in `blockers`, which name the item.
 */
interface ReadyQueueItem {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  placedAt: Date;
  itemCount: number;
  ready: boolean;
  consolidatorVendorId: string | null;
  blockers: ReadyQueueBlocker[];
  openShipment: ReadyQueueOpenShipment | null;
}

/**
 * The shipment somebody has already opened on this order, as a POINTER.
 *
 * Two fields, and it is an allow-list rather than a narrow read that grew: an
 * admin needs to know that a row is in the way, what state it is in, and how to
 * address it. Everything else about that shipment is `GET /api/admin/shipments/
 * :id`, which answers one order at a time and is the right place for it.
 *
 * Deliberately absent: `tracking_number`, `awb_number`, `carrier`,
 * `label_object_token`, `cost_paise`. A queue is up to 200 rows wide, and a
 * carrier handle on every one of them is a PII surface with no job to do on
 * this screen — the same argument `ReadyQueueItem` makes about the customer's
 * address.
 *
 * `null`, never an absent key, so a client can tell "no open shipment" from
 * "this build does not answer that question".
 */
interface ReadyQueueOpenShipment {
  id: string;
  status: ShipmentStatus;
}

/**
 * A blocker on its way out of the process.
 *
 * Projected field by field rather than passed through, for the same reason
 * every other boundary in this feature is an allow-list: a field added to
 * `LabelBlocker` reaches this response only when someone adds it here. That
 * trades a display gap for a leak, which is the direction the failure should
 * go — and the failure is visible, because the screen simply does not show the
 * new field.
 */
interface ReadyQueueBlocker {
  code: LabelBlocker["code"];
  message: string;
  jobId?: string;
  orderItemId?: string;
  transferId?: string;
  stage?: LabelBlocker["stage"];
}

function readyQueueBlocker(blocker: LabelBlocker): ReadyQueueBlocker {
  return {
    code: blocker.code,
    message: blocker.message,
    jobId: blocker.jobId,
    orderItemId: blocker.orderItemId,
    transferId: blocker.transferId,
    stage: blocker.stage,
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for listing shipments
 */
const listShipmentsSchema = z.object({
  status: z.enum(SHIPMENT_STATUS_VALUES).optional(),
  orderId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["createdAt", "status", "shippedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Every refusal this file can answer with, named rather than inferred.
 *
 * **It was one member, and one member was the wrong shape.** `#730` introduced
 * this as `ReadyQueueRefusalCode`, a single code for the one new route, while
 * the four handlers around it went on answering `{ error: string }` — so a
 * client reading `/ready` branched on `code` and a client reading `GET /:id`
 * had to string-match an English sentence, from the same file. That is two
 * vocabularies, and the smaller one being new does not make it a vocabulary.
 * `lib/vendor-scope.ts's `VendorJobRefusalCode`` settles the same question the other way: a code
 * emitted by the ROUTE rather than the module is declared alongside the rest
 * anyway, "so the portal reads ONE vocabulary of refusal codes".
 *
 * A tuple with the union DERIVED from it, not a union with a tuple beside it:
 * `every declared refusal code is emitted, and every emitted one is declared`
 * reads this array at runtime and holds it against the file's own source, which
 * a bare `type` cannot be held to.
 *
 * 400 the request could not be read as a claim about this resource, 404 the row
 * is not there. Deliberately absent: 403, which is `requireAdmin`'s and never
 * reaches this vocabulary; and the 500s, which carry no code at all — argued at
 * the handlers' catches, where the point is that a failed read says nothing
 * about the schema it failed on, and a code is one more thing to say.
 *
 * The discriminated `{ ok: true } | { ok: false, status, body }` result of
 * `lib/vendor-scope.ts's `VendorJobRefusal`` is deliberately NOT built here, and the
 * departure is argued rather than accidental: that shape earns its keep where a
 * scoped write has seven ways to refuse inside a transaction and must ROLL BACK
 * on each. These are read-path refusals returned from the line that discovers
 * them, with nothing to unwind.
 */
const ADMIN_SHIPMENT_REFUSAL_CODES = [
  /** The query string could not be read as a request for a page of the queue. */
  "READY_QUEUE_QUERY_INVALID",
  /** The `:id` in the path is not a uuid — see `UUID_PATTERN`. */
  "SHIPMENT_ID_INVALID",
  /** The `:orderId` in the path is not a uuid. */
  "ORDER_ID_INVALID",
  /** No shipment with that id. Not "not yours" — every caller here is an admin. */
  "SHIPMENT_NOT_FOUND",
  "ORDER_NOT_FOUND",
  /** The order is outside `SHIPPABLE_ORDER_STATUSES`, and the message says which. */
  "ORDER_NOT_SHIPPABLE",
  /** A PATCH body with no fields in it: nothing to do, and saying so beats a no-op 200. */
  "SHIPMENT_UPDATE_EMPTY",
  /** Already delivered. Re-stamping would move the delivery date, and the return window with it. */
  "SHIPMENT_ALREADY_DELIVERED",
  /**
   * The row moved between the locked read and the write inside the same
   * transaction. 409, and the whole transaction rolls back with it.
   */
  "CONCURRENT_MODIFICATION",
  /** A shipment body that could not be read as a claim about a shipment. */
  "SHIPMENT_BODY_INVALID",
  /** A shipments-list query string that could not be read as a page request. */
  "SHIPMENT_LIST_QUERY_INVALID",
] as const;

type AdminShipmentRefusalCode = (typeof ADMIN_SHIPMENT_REFUSAL_CODES)[number];

/**
 * The status codes a refusal in this file may carry.
 *
 * 400 the request could not be read as a claim about this resource, 404 the row
 * is not there, 409 the world moved or is already in a state this request
 * assumes it is not. Deliberately absent: 403, which is `requireAdmin`'s and
 * never reaches this vocabulary; and the 500s, which carry no code at all.
 *
 * 409 is kept apart from 400, which is the split `lib/vendor-scope.ts` argues
 * for: a 400 tells a client to CHANGE the request, and neither of the two
 * refusals that carry a 409 here is fixed by changing anything about the
 * request. Teaching a client to retry the wrong thing is what conflating them
 * costs.
 */
type AdminShipmentRefusalStatus = 400 | 404 | 409;

/**
 * A refusal raised from INSIDE a transaction, so it rolls back rather than
 * returns.
 *
 * The three write handlers below decide from a locked read and then write, and
 * every reason they can refuse is discovered after that lock is held. A
 * `return` cannot leave a transaction callback with the transaction still
 * intact — drizzle commits whatever a callback returns normally — so a refusal
 * that returned would COMMIT the reads it had already made and, worse, commit a
 * partial write on any path that refuses after its first statement.
 *
 * Not exported, and not a discriminated result type either. `lib/vendor-scope.ts`
 * builds `{ ok: true } | { ok: false, status, body }` because a scoped write
 * there has seven refusals and several callers; here there are three callers,
 * all in this file, and the class plus `refusalOf` is the whole conversion. The
 * departure is deliberate and it is the smaller shape, not a different one.
 */
class AdminShipmentWriteRefused extends Error {
  readonly status: AdminShipmentRefusalStatus;
  readonly body: { error: string; code: AdminShipmentRefusalCode };

  constructor(
    status: AdminShipmentRefusalStatus,
    body: { error: string; code: AdminShipmentRefusalCode }
  ) {
    super(body.error);
    this.name = "AdminShipmentWriteRefused";
    this.status = status;
    this.body = body;
  }
}

/** Raise a typed refusal from inside a transaction. */
function refuse(
  status: AdminShipmentRefusalStatus,
  body: { error: string; code: AdminShipmentRefusalCode }
): never {
  throw new AdminShipmentWriteRefused(status, body);
}

/**
 * A caught error as the refusal it carries, or `null` if it is a real fault.
 *
 * `instanceof` and not a duck-typed `code` check: a driver error with a `code`
 * property is exactly what must NOT be answered as a refusal, because that is
 * how `23505 duplicate key value violates unique constraint
 * "order_shipments_live_label_idx"` reaches a caller as an error message. A
 * fault falls through to the handler's catch, which logs the detail and answers
 * a fixed string.
 */
function refusalOf(
  error: unknown
): { status: AdminShipmentRefusalStatus; body: { error: string; code: AdminShipmentRefusalCode } } | null {
  return error instanceof AdminShipmentWriteRefused
    ? { status: error.status, body: error.body }
    : null;
}

/**
 * The one sentence every `CONCURRENT_MODIFICATION` refusal says.
 *
 * It names the remedy — read it again — and nothing else. Which row moved, what
 * it moved to and which predicate stopped matching are all facts about our
 * tables, and the caller is about to re-read the row anyway.
 */
const CONCURRENT_MODIFICATION_MESSAGE =
  "This shipment changed while the request was being handled, so nothing was written. Read it again and retry.";

/**
 * The columns of `order_shipments` a write in this file answers with.
 *
 * An ALLOW-LIST, and it replaces a bare `.returning()` on both write handlers.
 * That returned the whole row, which is fine only for as long as every column
 * of `order_shipments` happens to be harmless — and it already is not:
 * `label_object_token` is the handle on a signed PDF of a customer's address,
 * `cost_paise` is what WE paid a carrier rather than what the customer paid
 * (`schema/shipping.ts`), and `pickup_vendor_id` names a supplier. None of them
 * is written by anything in this repo today, so the bare `.returning()` leaked
 * nothing the day it was written and would have leaked all three the day the
 * Shiprocket pass lands, with no diff anywhere near this file.
 *
 * Deliberately absent, each for the reason above plus: `external_shipment_id`
 * and `external_order_id` (a carrier's internal handles), `voided_at` /
 * `voided_reason` (the label ledger), and the parcel dimensions and weight,
 * which belong to the label-buying path and to nothing here.
 *
 * `awb_number` and `courier_name` ARE here: they are the carrier handles an
 * admin screen exists to show, and both are already in the CUSTOMER-facing
 * allow-list in `routes/tracking.ts`. A field a customer may see is not one to
 * withhold from an admin.
 */
const SHIPMENT_RESPONSE_COLUMNS = {
  id: orderShipments.id,
  orderId: orderShipments.orderId,
  shippingOptionId: orderShipments.shippingOptionId,
  trackingNumber: orderShipments.trackingNumber,
  carrier: orderShipments.carrier,
  courierName: orderShipments.courierName,
  awbNumber: orderShipments.awbNumber,
  trackingUrl: orderShipments.trackingUrl,
  status: orderShipments.status,
  shippedAt: orderShipments.shippedAt,
  estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
  deliveredAt: orderShipments.deliveredAt,
  notes: orderShipments.notes,
  createdAt: orderShipments.createdAt,
  updatedAt: orderShipments.updatedAt,
} as const;

/**
 * The `orders` columns a shipment LIST may carry about the order behind it.
 *
 * Four, and the fourth is a foreign key rather than a person: `userId` is what
 * the customer read below is keyed on. What an admin scanning a page of
 * shipments needs is which order this is and where it is; the address, the
 * totals and the internal notes are not decisions this screen makes.
 *
 * A constant rather than an inline object, because this file spends paragraphs
 * arguing that an allow-list is the only thing between a bare `.returning()`
 * and `label_object_token` leaking — and a projection written inline in a
 * handler is a second, undocumented list that nobody adding a dispatch column
 * will find. Three hand-maintained `order_shipments` projections, one of them
 * documented as a boundary and two inline, is how the boundary stops being one.
 * `names the one order column a single-shipment read carries that a page does
 * not` is what holds this apart from its detail twin (#730).
 */
const SHIPMENT_LIST_ORDER_COLUMNS = {
  id: orders.id,
  orderNumber: orders.orderNumber,
  status: orders.status,
  userId: orders.userId,
} as const;

/**
 * The same, for `GET /:id` — plus the shipping address, deliberately.
 *
 * The address is the one field that separates the two, and the argument for it
 * is the difference between the two routes rather than a difference of opinion
 * about the column. `GET /:id` answers ONE shipment to an admin who is about to
 * act on that parcel — reprint a label, chase a courier, correct a delivery —
 * and where the parcel is going is the fact that conversation turns on.
 * `GET /` answers up to a hundred, and a hundred customers' addresses on a
 * screen nobody is acting from is a PII surface with no job to do. That is the
 * same argument `ReadyQueueItem` makes for carrying none at all across 200
 * rows, applied one route down.
 *
 * Spread from the list columns rather than re-listed, so a column added for a
 * page is never accidentally withheld from the single read.
 */
const SHIPMENT_DETAIL_ORDER_COLUMNS = {
  ...SHIPMENT_LIST_ORDER_COLUMNS,
  shippingAddress: orders.shippingAddress,
} as const;

/**
 * The customer, as three columns.
 *
 * `users` also holds a phone number, an image, a role, a ban reason and the
 * better-auth bookkeeping. A shipment screen needs to know who to call this
 * about, which is a name and an email; everything else is the customers screen
 * and the order detail's to answer, and both of those are routes an admin
 * already has.
 *
 * Shared by the list route and the detail route so the two cannot drift, which
 * they had already begun to do — they were two identical inline literals, which
 * is one edit away from being two different ones.
 */
const SHIPMENT_CUSTOMER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
} as const;

/**
 * The shipping option a shipment was bought against, as an allow-list.
 *
 * `baseCost` is on the detail one and not the list one for the same reason the
 * address is: it is a number an admin reads while acting on one shipment, and
 * `shipping_options` also carries the rules that produced it, which belong to
 * the shipping settings screen.
 */
const SHIPMENT_LIST_OPTION_COLUMNS = {
  id: shippingOptions.id,
  name: shippingOptions.name,
  carrier: shippingOptions.carrier,
} as const;

const SHIPMENT_DETAIL_OPTION_COLUMNS = {
  ...SHIPMENT_LIST_OPTION_COLUMNS,
  baseCost: shippingOptions.baseCost,
} as const;

/**
 * What the caller is told when the query string does not parse, and what to do.
 *
 * `zValidator`'s default body is a dump of zod issues — `path`, `too_small`,
 * `minimum`, `invalid_type`. That narrates our validator's internals to a
 * client and says nothing the person at the screen can act on. This names the
 * two parameters, their bounds, and the fact that both have defaults, which is
 * the remedy: send neither.
 */
const READY_QUEUE_QUERY_HELP =
  "The ready-to-label queue takes `page` (1 or more), `pageSize` (1 or more, " +
  `clamped to ${MAX_PAGE_SIZE}) and \`scanAfter\`, which must be a ` +
  "`nextScanCursor` copied verbatim from an earlier response — a timestamp and " +
  "an order id, as `2026-08-01T09:00:00.000Z|<uuid>`. All three have defaults, " +
  "so the safe fix is to send none of them.";

/**
 * What a caller is told when a shipment BODY does not parse.
 *
 * The same argument `READY_QUEUE_QUERY_HELP` makes, applied to the two write
 * routes — and the reason this exists is that for one round it did not. `/ready`
 * answered a typed, coded refusal while `GET /`, `PATCH /:id` and
 * `POST /orders/:orderId/ship` next to it fell through to `zValidator`'s default
 * body: a dump of zod issues (`path`, `too_small`, `invalid_type`) with no code
 * on it. So this file introduced `ADMIN_SHIPMENT_REFUSAL_CODES` as "every
 * refusal this file can answer with, named rather than inferred" while three of
 * its four other handlers answered with something outside that vocabulary
 * entirely — the exact split the constant was written to end.
 *
 * One message for both write routes, deliberately: it names the fields and
 * their bounds, and the two schemas share every field the other has except
 * which are required. A second string would be a second thing to keep in step.
 */
const SHIPMENT_BODY_HELP =
  "A shipment takes `carrier` (1–100 characters, required when opening one), " +
  "`trackingNumber` (up to 100), `trackingUrl` (up to 500), `notes` (up to " +
  "1000), `estimatedDeliveryAt` as an ISO 8601 timestamp, `shippingOptionId` " +
  "as a uuid, and `status` as one of the shipment statuses. Send only the " +
  "fields you are changing.";

/**
 * A void needs a reason. A void with no reason is unanswerable in a dispute,
 * and a one-word one is not much better; three characters is the floor below
 * which nothing is a reason, and five hundred is the audit row's comfort.
 */
const voidLabelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const VOID_BODY_HELP =
  "Voiding a label takes `reason` — 3 to 500 characters saying why, which is " +
  "recorded on the shipment and in the audit log. Nothing else.";

const BUY_LABEL_BODY_HELP =
  "Buying a label takes `parcel` — `weightGrams`, `lengthCm`, `widthCm` and " +
  "`heightCm`, each a positive integer — and optionally `courierCompanyId`, a " +
  "positive integer naming a courier from the serviceability quote. The " +
  "consignee, the money and the pickup location come from the order.";

/**
 * A refusal the label purchase raised, as the response it maps to.
 *
 * Two vocabularies pass through here unchanged: the dispatch library's
 * (`ShipmentDispatchError`, statuses from `DISPATCH_REFUSAL_STATUS`) and the
 * courier client's (`ShiprocketError`, statuses from
 * `SHIPROCKET_REFUSAL_STATUS`). Each names its code, and `ORDER_NOT_READY`
 * carries every blocker so an admin is told which job has not passed QC
 * rather than sent to hunt for it. Anything else is a fault and gets the
 * fixed string.
 */
function dispatchRefusalOf(
  error: unknown
): { status: ContentfulStatusCode; body: Record<string, unknown> } | null {
  if (error instanceof ShipmentDispatchError) {
    return {
      status: DISPATCH_REFUSAL_STATUS[error.code] as ContentfulStatusCode,
      body: {
        error: error.message,
        code: error.code,
        ...(error.blockers ? { blockers: error.blockers } : {}),
        ...(error.shipmentId ? { shipmentId: error.shipmentId } : {}),
      },
    };
  }
  if (error instanceof ShiprocketError) {
    return {
      status: SHIPROCKET_REFUSAL_STATUS[error.code] as ContentfulStatusCode,
      body: { error: error.message, code: error.code },
    };
  }
  return null;
}

/**
 * What a caller is told when the shipments-list query string does not parse.
 *
 * Note `pageSize` is `.max(MAX_PAGE_SIZE)` here and CLAMPED on `/ready`, so the
 * two messages differ on exactly that sentence. The divergence is real and
 * pre-dates this ticket; naming it in the refusal is better than a shared
 * message that is wrong for one of them.
 */
const SHIPMENT_LIST_QUERY_HELP =
  "The shipments list takes `page` (1 or more), `pageSize` (1 to " +
  `${MAX_PAGE_SIZE}), \`status\`, \`orderId\` (a uuid), \`dateFrom\`/\`dateTo\` ` +
  "as ISO 8601 timestamps, `sortBy` (createdAt, status or shippedAt) and " +
  "`sortOrder` (asc or desc). All of them have defaults, so the safe fix is to " +
  "send none of them.";

/**
 * Query parameters for the ready-to-label queue.
 *
 * Three parameters and no filters. `status` and `orderId` would both be filters
 * on the CANDIDATE set, and the candidate set is not a thing a caller gets to
 * choose here: it is the definition of "could be shipped", shared with
 * `POST /orders/:orderId/ship`. A ready queue that can be filtered into showing
 * an order the ship route refuses is a queue that lies.
 *
 * **`scanAfter` is not an exception to that, and the difference is the whole
 * argument for admitting it.** A filter changes WHICH orders are candidates; a
 * cursor changes only where the reading starts. Every clause of the predicate
 * still applies with one supplied, and `moves the window without touching which
 * orders are candidates` asserts exactly that against the rendered SQL. Without
 * it the cap on the scan is not a bound but a ceiling: the ready work behind a
 * full window of stalled orders is reachable by no request at all.
 *
 * `pageSize` is CLAMPED, deliberately unlike `listShipmentsSchema` above, which
 * `.max(MAX_PAGE_SIZE)` and so answers `?pageSize=500` with a 400. This follows
 * `routes/admin/vendors.ts` instead: a dispatch screen asking for more
 * rows than we serve should get 100 rows, not an error that reads to the person
 * at the screen as the queue being broken. Nothing is unbounded either way.
 *
 * `page` is clamped too, in the handler and not here, because its bound is
 * `READY_QUEUE_SCAN_LIMIT / pageSize` and `pageSize` is not known until this
 * schema has finished with it.
 */
const readyQueueSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  // Refused here rather than parsed leniently in the handler: an unreadable
  // cursor reaches `new Date(...)`, binds an `Invalid Date`, and drizzle throws
  // `RangeError` building the query — a caller's typo reported back to them as
  // our outage, which is the same failure `UUID_PATTERN` exists for.
  //
  // `parseScanCursor` and not `.regex(READY_QUEUE_CURSOR_PATTERN)`: the pattern
  // vouches for the SHAPE, and `2026-13-45T09:00:00.000Z` is a well-shaped
  // string with no date in it. The validator and the parse are the same
  // function, so there is no gap between what is accepted and what is read.
  scanAfter: z
    .string()
    .refine((raw) => parseScanCursor(raw) !== null)
    .optional(),
});

/**
 * Schema for creating a shipment
 */
/**
 * What buying a label needs from the admin: the parcel, and at most a
 * courier preference. Everything else — the consignee, the money, the pickup
 * location — is the order's and the consolidator's, read by the library
 * under its lock. Integer grams and centimetres, matching the columns they
 * are stored in; the caps are a sanity bound on a fat-fingered field, not a
 * carrier's limits.
 */
const buyLabelSchema = z.object({
  parcel: z.object({
    weightGrams: z.number().int().positive().max(50_000),
    lengthCm: z.number().int().positive().max(300),
    widthCm: z.number().int().positive().max(300),
    heightCm: z.number().int().positive().max(300),
  }),
  courierCompanyId: z.number().int().positive().optional(),
});

/**
 * Schema for updating a shipment
 */
const updateShipmentSchema = z.object({
  trackingNumber: z.string().max(100).optional().nullable(),
  trackingUrl: z.string().max(500).optional().nullable(),
  status: z.enum(SHIPMENT_STATUS_VALUES).optional(),
  estimatedDeliveryAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminShipmentsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminShipmentsApp.use("*", requireAuth);
adminShipmentsApp.use("*", requireAdmin);

/**
 * The one order-scoped route, in its own router.
 *
 * `POST /api/admin/orders/:orderId/ship` hangs off `/api/admin`, not off
 * `/api/admin/shipments`, so it cannot live on the router above: mounting THAT
 * one at `/api/admin` also mounts its `GET /:id`, and `GET /api/admin/:id`
 * swallows every single-segment admin list route registered after it —
 * `/api/admin/vendors` and `/api/admin/production` both answered
 * `400 Invalid shipment ID` until this was split out.
 *
 * A one-route router is the price of a prefix that is a parent of the whole
 * admin tree. Keep it that way: nothing with a bare `/:id` may be mounted at
 * `/api/admin`.
 */
const adminOrderShipmentsApp = new Hono<{ Variables: AuthVariables }>();

adminOrderShipmentsApp.use("*", requireAuth);
adminOrderShipmentsApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/shipments - List All Shipments
// ============================================================================

adminShipmentsApp.get(
  "/",
  zValidator("query", listShipmentsSchema, (result, c) => {
    if (result.success) return;

    return c.json(
      {
        error: SHIPMENT_LIST_QUERY_HELP,
        code: "SHIPMENT_LIST_QUERY_INVALID" satisfies AdminShipmentRefusalCode,
      },
      400
    );
  }),
  async (c) => {
    const { status, orderId, dateFrom, dateTo, page, pageSize, sortBy, sortOrder: order } = c.req.valid("query");

    try {
      // `SQL[]`, not `ReturnType<typeof eq>[]`. The old annotation named one
      // helper's return type and happened to admit the others because drizzle
      // returns the same `SQL` from all of them; it would have stopped
      // admitting them the day a filter needed `or(...)` or a raw fragment, and
      // the fix then reads as a type error rather than as the annotation having
      // been a guess. Same shape as the ready queue's predicate below.
      const conditions: SQL[] = [];

      if (status) {
        conditions.push(eq(orderShipments.status, status));
      }

      if (orderId) {
        conditions.push(eq(orderShipments.orderId, orderId));
      }

      if (dateFrom) {
        conditions.push(gte(orderShipments.createdAt, new Date(dateFrom)));
      }

      if (dateTo) {
        conditions.push(lte(orderShipments.createdAt, new Date(dateTo)));
      }

      const orderFn = order === "asc" ? asc : desc;
      const orderByColumn = {
        createdAt: orderShipments.createdAt,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
      }[sortBy];

      const offset = (page - 1) * pageSize;

      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orderShipments)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Every `order_shipments` column list in this file is now the same
      // constant. It used to be three — this one, `GET /:id`'s, and
      // `SHIPMENT_RESPONSE_COLUMNS` on the writes — and only the third was
      // documented as a boundary, so the next person adding a dispatch column
      // had three lists to find and one signpost. Two of them silently omitted
      // `awbNumber` and `courierName`, which the CUSTOMER-facing allow-list in
      // `routes/tracking.ts` already carries: an admin list that shows less
      // about a parcel than the customer's own tracking page.
      const shipmentsList = await db
        .select({
          ...SHIPMENT_RESPONSE_COLUMNS,
          order: SHIPMENT_LIST_ORDER_COLUMNS,
          shippingOption: SHIPMENT_LIST_OPTION_COLUMNS,
        })
        .from(orderShipments)
        .innerJoin(orders, eq(orderShipments.orderId, orders.id))
        .leftJoin(shippingOptions, eq(orderShipments.shippingOptionId, shippingOptions.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderFn(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      // One read for the whole page, keyed on the ids the page already has —
      // the same batching argument the ready queue makes for its six reads.
      const userIds = [...new Set(shipmentsList.map((s) => s.order.userId).filter(Boolean))];
      let userMap: Record<string, { id: string; name: string | null; email: string }> = {};

      if (userIds.length > 0) {
        const userList = await db
          .select(SHIPMENT_CUSTOMER_COLUMNS)
          .from(users)
          // `= ANY(${userIds})` renders `= ANY(($1, $2))`, which Postgres
          // rejects — see the same correction in returns and orders (#624).
          .where(inArray(users.id, userIds as string[]));

        userMap = userList.reduce(
          (acc, user) => {
            acc[user.id] = user;
            return acc;
          },
          {} as Record<string, { id: string; name: string | null; email: string }>
        );
      }

      const shipmentsWithUsers = shipmentsList.map((shipment) => ({
        ...shipment,
        order: {
          ...shipment.order,
          customer: shipment.order.userId ? userMap[shipment.order.userId] || null : null,
        },
      }));

      return c.json({
        items: shipmentsWithUsers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      logger.error({ err: error }, "admin shipments: failed to fetch shipments");
      return c.json({ error: "Failed to fetch shipments" }, 500);
    }
  }
);

/**
 * When the order was placed, in milliseconds, for the tiebreak below.
 *
 * An unreadable timestamp sorts LAST rather than first: a clock nobody can read
 * is not evidence of having waited longest. Same shape as `bestHolding` in
 * `lib/production-readiness.ts`, where a job with no `assigned_at` sorts last
 * for the same reason.
 */
function placedAtMs(placedAt: Date | string | null): number {
  if (!placedAt) return Number.POSITIVE_INFINITY;
  const ms = new Date(placedAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Fewest blockers first, then the customer who has waited longest, then the id.
 *
 * **Ready-first is not a separate key, and writing one would be a second
 * opinion.** `ready` IS `blockers.length === 0` — that is the seam's own
 * definition of `isOrderReadyToLabel` — so ordering by blocker count puts every
 * shippable order at the top and then ranks the near-misses by how near they
 * are, which is what "for those that are close, what is stopping them" asks
 * for.
 *
 * The last key is not decoration. Without a total order two orders placed in
 * the same clock tick would fall back to row order, and "the queue reordered
 * itself on refresh" is a bug an admin reports as "the screen is broken".
 */
function rankReadyQueue(a: ReadyQueueItem, b: ReadyQueueItem): number {
  if (a.blockers.length !== b.blockers.length) {
    return a.blockers.length - b.blockers.length;
  }

  const at = placedAtMs(a.placedAt);
  const bt = placedAtMs(b.placedAt);
  if (at !== bt) return at - bt;

  return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0;
}

// ============================================================================
// GET /api/admin/shipments/ready - The Ready-to-Label Queue
// ============================================================================

/**
 * REGISTERED BEFORE `GET /:id`, and that is load-bearing.
 *
 * Hono matches in registration order. With `/:id` first, `/ready` is read as a
 * shipment id and answered `400 Invalid shipment ID` — measured against hono
 * 4.11.4 in this tree, not assumed. It is the same failure the note on
 * `adminOrderShipmentsApp` records, where mounting this router at `/api/admin`
 * made `GET /api/admin/vendors` answer `400 Invalid shipment ID`; a parameter
 * route swallows every literal registered after it.
 *
 * `tests/routes/admin/shipments-ready-queue.test.ts` asserts a 200 here rather
 * than trusting the order, because moving this block below `/:id` is a
 * plausible tidy-up that breaks the endpoint without touching a line of it.
 */
adminShipmentsApp.get(
  "/ready",
  zValidator("query", readyQueueSchema, (result, c) => {
    if (result.success) return;

    // Typed, coded, and carrying its own remedy — the one refusal this route
    // owns, answered here rather than by the validator's default body.
    return c.json(
      {
        error: READY_QUEUE_QUERY_HELP,
        code: "READY_QUEUE_QUERY_INVALID" satisfies AdminShipmentRefusalCode,
      },
      400
    );
  }),
  async (c) => {
    const { page: requestedPage, pageSize, scanAfter } = c.req.valid("query");

    try {
      const cursor = parseScanCursor(scanAfter);

      // Four conditions, every one a FACT about the order rather than a proxy
      // for readiness. The middle two together are `producibleItems` in SQL;
      // everything subtler than these four is the seam's to decide.
      //
      // It was five for one round. The fifth excluded orders somebody had
      // already opened a shipment for, and it deleted ready-to-label work from
      // the ready-to-label queue — see `openShipmentsOf`, which is where that
      // condition lives now, on the write and as a report.
      //
      // No transaction, which departs from how the seam documents its own
      // sequencing (`loadOrderProductionSnapshot` in
      // `lib/production-readiness.ts` is sequential because "the caller that
      // matters runs this inside its own transaction"). This caller does not,
      // so the reads can answer from a torn view — the scan sees no live label,
      // the job read a moment later sees the order dispatched. Tolerable
      // precisely BECAUSE this screen is advisory (see the header): the row is
      // stale, not wrong, and a refresh corrects it. Not tolerable in a gate,
      // so whoever writes that gate should not copy this. The three write
      // handlers below, which are not advisory, each take one.
      //
      // Ordered oldest-first because that is the order the CURSOR walks, and
      // for no other reason. It is NOT a claim that truncating at the cap
      // "drops the newest orders — the ones least likely to be finished": that
      // is wrong in precisely the state that produces a 200-deep backlog, a
      // stall at the front of the pipeline where the oldest orders are the
      // stuck ones and the finished work is behind them. Nothing about a fixed
      // direction makes truncation safe; `scanAfter` does, by making the next
      // window addressable. The fixed order is also what lets the suite assert
      // what was read.
      //
      // The response is re-ranked below, so this ordering decides only which
      // candidates a window contains, never how they are presented.
      const candidates = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          createdAt: orders.createdAt,
          itemCount: orders.itemCount,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.status, [...SHIPPABLE_ORDER_STATUSES]),
            notInArray(orders.orderType, [...NON_SHIPPING_ORDER_TYPES]),
            ORDER_HAS_A_LINE_TO_PRODUCE,
            sql`not ${ORDER_HAS_LIVE_LABEL}`,
            // The window, and nothing else. Spelled as the two-comparison
            // keyset rather than a row-value `(a, b) > (c, d)` because the
            // repo's rule is drizzle rather than raw SQL, and because this
            // form renders column names a test can assert on. `and(...)` drops
            // an `undefined` member, so the first window carries no clause at
            // all rather than a tautology.
            cursor
              ? or(
                  gt(orders.createdAt, cursor.placedAt),
                  and(
                    eq(orders.createdAt, cursor.placedAt),
                    gt(orders.id, cursor.orderId)
                  )
                )
              : undefined
          )
        )
        .orderBy(asc(orders.createdAt), asc(orders.id))
        .limit(READY_QUEUE_SCAN_LIMIT + 1);

      // One row over the cap is how truncation is detected; it is never ranked.
      const scanTruncated = candidates.length > READY_QUEUE_SCAN_LIMIT;
      const scanned = candidates.slice(0, READY_QUEUE_SCAN_LIMIT);

      // Cut from the last candidate this request actually RANKED, never from
      // the probe row past the cap: starting the next window after the probe
      // would skip the one order the probe stands for.
      const lastScanned = scanned[scanned.length - 1];
      const nextScanCursor =
        scanTruncated && lastScanned
          ? formatScanCursor(lastScanned.createdAt, lastScanned.id)
          : null;

      // Batched, and the batching lives in the SEAM: five reads for the whole
      // page rather than five per order, built from the same collapse rules
      // `getOrderLabelReadiness` uses. See the function's own header for why it
      // is there and not here — an earlier round of #730 had a copy of it in
      // this file, and a copy of a private rule is a rule with no enforcer.
      const snapshots = await loadOrderProductionSnapshots(
        scanned.map((candidate) => candidate.id)
      );

      // The open shipment each candidate already has, batched over the same
      // ids — a SIXTH read for the whole page, not one per row, on the same
      // argument the five readiness reads are batched on.
      //
      // **`DISTINCT ON (order_id)`, and the LIMIT is what it buys.** The read
      // used to have no bound at all: scoped to at most 200 order ids, and then
      // every open row all of them have. Legacy data can hold more than one per
      // order — the write refusal is new and the partial unique index never
      // forbade it — so "200 ids" is not a row count.
      //
      // A plain `LIMIT` would have been worse than none. The rows are ordered
      // so the newest per order wins, so truncating drops whole orders off the
      // end and reports `openShipment: null` for an order that has one — a
      // silent wrong answer, which is the failure a cap exists to prevent.
      // Collapsing in SQL makes one row per order a fact rather than a hope, so
      // the bound can be the number of ids asked about and can never cut
      // anything. `bounds the report read to one row per candidate order` reads
      // both halves off the recorded query.
      //
      // Newest first WITHIN each order, which is what `DISTINCT ON` keeps: the
      // row an admin acting on this order will meet. Note it is deliberately
      // not "the row the customer sees" — this read filters through
      // `openShipmentsOf`, which excludes `cancelled`, while
      // `liveShipmentForOrder` (`routes/tracking.ts`) and `liveShipmentFor`
      // (`services/notifications.ts`) filter on `voided_at IS NULL` alone. On
      // legacy data holding a pending row and a newer cancelled one, the two
      // name different shipments. That divergence belongs to the customer-
      // facing read, not to this queue — reporting a cancelled row as a
      // shipment in the way would contradict the write route, which will open
      // another — and it is pinned by
      // `and the customer-facing read can still follow a row this one hides`
      // rather than left as prose here.
      //
      // Projected, never spread: `id` and `status` and nothing else. The row
      // this reads from is the widest in the feature.
      const candidateIds = scanned.map((candidate) => candidate.id);

      const openShipmentRows = candidateIds.length
        ? await db
            .selectDistinctOn([orderShipments.orderId], {
              orderId: orderShipments.orderId,
              id: orderShipments.id,
              status: orderShipments.status,
            })
            .from(orderShipments)
            .where(openShipmentsOf(inArray(orderShipments.orderId, candidateIds)))
            // `order_id` first because Postgres requires the ON expressions to
            // lead the ORDER BY; the two after it are what decides WHICH row of
            // each order survives, and they are the module constant so the
            // write next door cannot rank the same rows differently.
            .orderBy(asc(orderShipments.orderId), ...NEWEST_OPEN_SHIPMENT_FIRST)
            .limit(candidateIds.length)
        : [];

      // Belt to the SQL's braces. `DISTINCT ON` already guarantees one row per
      // order, so this loop cannot see a second one — and it keeps the FIRST
      // rather than the last anyway, which is the same row the read chose, so a
      // database that ever stopped collapsing would degrade to the old
      // behaviour instead of to a different one.
      const openShipments = new Map<string, ReadyQueueOpenShipment>();
      for (const row of openShipmentRows) {
        if (!openShipments.has(row.orderId)) {
          openShipments.set(row.orderId, { id: row.id, status: row.status });
        }
      }

      const ranked: ReadyQueueItem[] = scanned.map((candidate) => {
        const snapshot = snapshots.get(candidate.id);
        // The loader gives every id it was asked about an entry, so this cannot
        // be missing. It is still not asserted away: an `orderExists: false`
        // snapshot is the seam's own "no such order", which blocks — the safe
        // direction — where a `!` would have thrown a 500 over a bookkeeping
        // slip. `orderType` is a placeholder and never read: `orderExists` is
        // answered first and alone by `evaluateLabelReadiness`, so the
        // predicate returns before any clause looks at the type.
        const readiness = evaluateLabelReadiness(
          snapshot ?? {
            orderId: candidate.id,
            orderExists: false,
            orderType: "regular",
            items: [],
            jobs: [],
            transfers: [],
            consolidatorVendorId: null,
          }
        );

        return {
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          orderStatus: candidate.status,
          placedAt: candidate.createdAt,
          itemCount: candidate.itemCount,
          ready: readiness.ready,
          consolidatorVendorId: readiness.consolidatorVendorId,
          blockers: readiness.blockers.map(readyQueueBlocker),
          // Reported, not excluded. See `openShipmentsOf` for the round that
          // tried it the other way and what that cost.
          openShipment: openShipments.get(candidate.id) ?? null,
        };
      });

      ranked.sort(rankReadyQueue);

      const totalPages = Math.ceil(ranked.length / pageSize);

      // `page` is clamped to a page this response ACTUALLY HAS, so the two
      // numbers in the envelope agree by construction.
      //
      // It used to be `ceil(READY_QUEUE_SCAN_LIMIT / pageSize)` — the deepest
      // page a FULL window could hold — with a comment claiming the caller was
      // "told where the end is". Measured: three candidate orders and
      // `?page=999&pageSize=20` answered `page: 10, totalPages: 1` beside an
      // empty list, and it does that for every queue shallower than the 200-row
      // cap, which is the normal case. A page number that does not exist is
      // precisely what the clamp was added to stop echoing.
      //
      // Not a cost fix, and saying so is the point because the obvious reading
      // is wrong: the scan is bounded by the cap and by nothing else, so
      // `?page=999999999` costs exactly what `?page=1` costs. `pageSize` is
      // clamped in the schema for the matching reason.
      //
      // `max(1, …)` because an empty queue has zero pages and `page: 0` is not
      // a page either. `routes/admin/vendors.ts` answers `totalPages: 0` on an
      // empty list and this keeps that, so only the echoed `page` differs.
      const page = Math.min(requestedPage, Math.max(1, totalPages));

      const offset = (page - 1) * pageSize;

      return c.json({
        // `items`, matching the vendors list and the shipments list above it.
        // Not `orders`, not `shipments`: reading `orders` off this envelope is
        // what made #713's e2e spec skip its assertions and pass vacuously.
        items: ranked.slice(offset, offset + pageSize),
        // The number of candidates this request RANKED, not a `count(*)` over
        // every shippable order. They differ only when the scan truncates, and
        // a `total` larger than the ranking would advertise pages that cannot
        // be reached — `scanTruncated` is the honest way to say the same thing.
        total: ranked.length,
        page,
        pageSize,
        totalPages,
        // **`hasNextPage` is about the PAGE axis, and only about it.** It is
        // the answer to "does `page + 1` exist", which is the one question a
        // client asks it, and it is what the two sibling admin lists mean by
        // the same key (`GET /api/admin/shipments` above, and
        // `routes/admin/vendors.ts`, both `page * pageSize < total`).
        //
        // **It was widened to cover the cursor axis too, and that made the walk
        // it names non-terminating.** `page` is clamped just above to a page
        // this response actually has, so `?page=11` of a ten-page window
        // answers `page: 10` with byte-identical items. With
        // `|| nextScanCursor !== null` on this line, the loop every paginated
        // screen in this console runs —
        //
        //     do { r = GET /ready?page=n; n += 1 } while (r.hasNextPage)
        //
        // — walked `1..10` and then re-read page ten forever, paying for the
        // 200-row scan and six batched reads on every turn. A client behaving
        // correctly everywhere else in the console hangs here and nowhere else,
        // which is the worst place to put a departure.
        //
        // Clamping and the widened boolean are each defensible alone and
        // cannot both stay: one promises the echoed page exists, the other
        // promises a further page does. Dropping the clamp instead would have
        // answered a different question — the loop would still never end, it
        // would just hand out empty pages while echoing 11, 12, 13.
        //
        // **What a client does to reach the next window**, since this boolean
        // no longer says: read `nextScanCursor`. When it is non-null there is
        // another window, and the request that opens it is
        // `?scanAfter=<nextScanCursor>` with `page` back at 1. `scanTruncated`
        // says the same thing as a boolean for a screen that only wants to warn
        // that the backlog is deeper than one scan. Both are in this envelope,
        // both are documented on `READY_QUEUE_SCAN_LIMIT` and
        // `READY_QUEUE_CURSOR_PATTERN`, and neither can be mistaken for a page
        // number. That is the whole of the second axis, and it is spelled in
        // the two keys that exist for it rather than smuggled into a boolean
        // named after the first.
        hasNextPage: page * pageSize < ranked.length,
        // ...and its twin answers the same question about the same axis, which
        // is what makes the pair readable. `page > 1 || cursor !== null` said
        // "something exists before this window" — true, and not the question.
        // A client that reads `hasPreviousPage` computes `page - 1`, and on the
        // first page of a second window that is `?page=0`, which this route
        // refuses with a 400.
        //
        // The asymmetry between the two axes is real and it is in the CALLER's
        // knowledge, not in the envelope: a client on the second window knows
        // it is, because it supplied the cursor that put it there. It cannot
        // know a further window exists without being told, which is why the
        // forward direction gets `nextScanCursor` and the backward direction
        // gets nothing.
        //
        // What neither key promises, stated because someone will look for it:
        // there is no `scanBefore`, so reaching the previous WINDOW means
        // walking from the start again. A backwards keyset would be a second
        // cursor spelling for a direction this screen does not scroll.
        hasPreviousPage: page > 1,
        /** How much of `total` is work an admin could do right now. */
        readyCount: ranked.filter((row) => row.ready).length,
        scanLimit: READY_QUEUE_SCAN_LIMIT,
        scanTruncated,
        // The remedy travels with the report of the problem, which is the same
        // rule `READY_QUEUE_QUERY_HELP` follows. Null when the whole backlog
        // fitted, so a client walking cursors has a termination condition
        // rather than an invitation to loop forever.
        nextScanCursor,
      });
    } catch (error) {
      // The message goes to the log and a FIXED string goes to the client.
      // `routes/admin/vendors.ts` still appends `error.message` to its
      // 500s; ``failed()` in `routes/vendor.ts`` records what that produced when it did
      // — `500 Failed to sign label URL: column "order_shipments".
      // "label_object_token" does not exist`, our schema narrated to a caller.
      // This handler touches six tables counting the `exists` subquery, and a
      // driver error names whichever one it tripped on.
      logger.error({ err: error }, "admin shipments: failed to build the ready-to-label queue");
      return c.json({ error: "Failed to build the ready-to-label queue" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/shipments/:id - Get Shipment Details
// ============================================================================

adminShipmentsApp.get("/:id", async (c) => {
  const shipmentId = c.req.param("id");

  if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
    return c.json(
      { error: "Invalid shipment ID", code: "SHIPMENT_ID_INVALID" satisfies AdminShipmentRefusalCode },
      400
    );
  }

  try {
    // The same shipment column list as the page above and as the writes. What
    // this route carries that the page does not is one order column — the
    // shipping address — and the argument for it is on
    // `SHIPMENT_DETAIL_ORDER_COLUMNS`, beside the list itself rather than
    // buried in this handler.
    const shipmentResult = await db
      .select({
        ...SHIPMENT_RESPONSE_COLUMNS,
        order: SHIPMENT_DETAIL_ORDER_COLUMNS,
        shippingOption: SHIPMENT_DETAIL_OPTION_COLUMNS,
      })
      .from(orderShipments)
      .innerJoin(orders, eq(orderShipments.orderId, orders.id))
      .leftJoin(shippingOptions, eq(orderShipments.shippingOptionId, shippingOptions.id))
      .where(eq(orderShipments.id, shipmentId))
      .limit(1);

    const shipment = shipmentResult[0];

    if (!shipment) {
      return c.json(
        { error: "Shipment not found", code: "SHIPMENT_NOT_FOUND" satisfies AdminShipmentRefusalCode },
        404
      );
    }

    let customer = null;
    if (shipment.order.userId) {
      const customerResult = await db
        .select(SHIPMENT_CUSTOMER_COLUMNS)
        .from(users)
        .where(eq(users.id, shipment.order.userId))
        .limit(1);

      customer = customerResult[0] || null;
    }

    return c.json({
      ...shipment,
      order: {
        ...shipment.order,
        customer,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin shipments: failed to fetch shipment");
    return c.json({ error: "Failed to fetch shipment" }, 500);
  }
});

// ============================================================================
// POST /api/admin/orders/:orderId/ship - Create Shipment for Order
// ============================================================================

adminOrderShipmentsApp.post(
  "/orders/:orderId/ship",
  zValidator("json", buyLabelSchema, (result, c) => {
    if (result.success) return;

    return c.json(
      {
        error: BUY_LABEL_BODY_HELP,
        code: "SHIPMENT_BODY_INVALID" satisfies AdminShipmentRefusalCode,
      },
      400
    );
  }),
  async (c) => {
    const orderId = c.req.param("orderId");
    const data = c.req.valid("json");

    if (!orderId || !UUID_PATTERN.test(orderId)) {
      return c.json({ error: "Invalid order ID", code: "ORDER_ID_INVALID" satisfies AdminShipmentRefusalCode }, 400);
    }

    try {
      // The order-status gate stays HERE, ahead of the library, and reads the
      // same list the ready queue filters on (`SHIPPABLE_ORDER_STATUSES`).
      // Production readiness is the library's question, asked under its lock;
      // whether this order is one that ships at all is this route's, and a
      // cancelled order is refused before any lock is taken or any courier
      // asked.
      const [order] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        return c.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" satisfies AdminShipmentRefusalCode },
          404
        );
      }

      if (!SHIPPABLE_ORDER_STATUSES.includes(order.status as OrderStatus)) {
        return c.json(
          {
            error:
              `Cannot ship order ${order.orderNumber} while it is '${order.status}'. Only an order that ` +
              `is ${SHIPPABLE_ORDER_STATUSES.map((s) => `'${s}'`).join(" or ")} can be shipped.`,
            code: "ORDER_NOT_SHIPPABLE" satisfies AdminShipmentRefusalCode,
          },
          400
        );
      }

      // Everything from here is the library's: the lock, readiness under it,
      // the claim, the courier, the label, the audit rows. This route turns
      // its refusals into responses and never sees a label URL.
      const purchase = await buyLabelForOrder(
        orderId,
        { parcel: data.parcel, ...(data.courierCompanyId ? { courierCompanyId: data.courierCompanyId } : {}) },
        c
      );

      // Re-read through the response allow-list: the purchase result carries
      // the token, the cost and the pickup vendor, and none of them leave.
      const [shipment] = await db
        .select(SHIPMENT_RESPONSE_COLUMNS)
        .from(orderShipments)
        .where(eq(orderShipments.id, purchase.shipmentId))
        .limit(1);

      return c.json(
        {
          message: purchase.resumed ? "Label purchase resumed" : "Label bought",
          shipment: shipment ?? null,
          pickup: purchase.pickup,
          resumed: purchase.resumed,
        },
        201
      );
    } catch (error) {
      const refusal = dispatchRefusalOf(error);
      if (refusal) return c.json(refusal.body, refusal.status);

      logger.error({ err: error, orderId }, "admin shipments: failed to buy label");
      return c.json({ error: "Failed to buy the label" }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/shipments/:id - Update Shipment
// ============================================================================

adminShipmentsApp.patch(
  "/:id",
  zValidator("json", updateShipmentSchema, (result, c) => {
    if (result.success) return;

    return c.json(
      {
        error: SHIPMENT_BODY_HELP,
        code: "SHIPMENT_BODY_INVALID" satisfies AdminShipmentRefusalCode,
      },
      400
    );
  }),
  async (c) => {
    const shipmentId = c.req.param("id");
    const updates = c.req.valid("json");

    if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
      return c.json(
        { error: "Invalid shipment ID", code: "SHIPMENT_ID_INVALID" satisfies AdminShipmentRefusalCode },
        400
      );
    }

    // Must provide at least one field to update
    if (Object.keys(updates).length === 0) {
      return c.json(
        {
          error:
            "Send at least one of trackingNumber, trackingUrl, status, estimatedDeliveryAt or notes.",
          code: "SHIPMENT_UPDATE_EMPTY" satisfies AdminShipmentRefusalCode,
        },
        400
      );
    }

    try {
      // ONE transaction, for the same reason the ship route above has one: this
      // handler writes `order_shipments` and then `orders`, and a throw between
      // them left a shipment at `shipped` against an order still `processing`.
      const result = await db.transaction(async (tx) => {
        // The shipment AND where its order currently is, in one statement. Two
        // reads would be two chances for the order to move between them, and
        // the decision below is about the pair. `orders.status` is the only
        // column the join is for — the customer's address, the totals and the
        // notes stay out of a process that has no use for them.
        //
        // `FOR UPDATE` over the join locks the row in BOTH tables, which is
        // what makes the two predicate repetitions below meaningful rather than
        // decorative.
        const existingResult = await tx
          .select({
            id: orderShipments.id,
            orderId: orderShipments.orderId,
            status: orderShipments.status,
            carrier: orderShipments.carrier,
            orderStatus: orders.status,
          })
          .from(orderShipments)
          .innerJoin(orders, eq(orders.id, orderShipments.orderId))
          .where(eq(orderShipments.id, shipmentId))
          .limit(1)
          .for("update");

        const existing = existingResult[0];

        if (!existing) {
          refuse(404, {
            error: "Shipment not found",
            code: "SHIPMENT_NOT_FOUND",
          });
        }

        // Typed to the table's own insert model rather than
        // `Record<string, unknown>`: this object is assembled a field at a time
        // and then handed straight to drizzle, so an untyped bag is an
        // unvalidated write. A misspelled column now fails `tsc` instead of
        // arriving as a driver error at runtime.
        const updateData: Partial<typeof orderShipments.$inferInsert> = {};

        if (updates.trackingNumber !== undefined) {
          updateData.trackingNumber = updates.trackingNumber;
          // Auto-generate tracking URL if we have a new tracking number
          if (updates.trackingNumber && !updates.trackingUrl) {
            updateData.trackingUrl = generateTrackingUrl(existing.carrier, updates.trackingNumber);
          }
        }

        if (updates.trackingUrl !== undefined) {
          updateData.trackingUrl = updates.trackingUrl;
        }

        if (updates.status !== undefined) {
          updateData.status = updates.status;

          // Update timestamps based on status
          if (updates.status === "shipped" && existing.status !== "shipped") {
            updateData.shippedAt = new Date();
          }
          if (updates.status === "delivered" && existing.status !== "delivered") {
            updateData.deliveredAt = new Date();
          }
        }

        if (updates.estimatedDeliveryAt !== undefined) {
          updateData.estimatedDeliveryAt = updates.estimatedDeliveryAt
            ? new Date(updates.estimatedDeliveryAt)
            : null;
        }

        if (updates.notes !== undefined) {
          updateData.notes = updates.notes;
        }

        // The status read above is repeated in the predicate, so the row this
        // writes is provably the row it decided from — the timestamps in
        // `updateData` were chosen by comparing against `existing.status`, and
        // applying them to a row that has since moved is how a `shipped_at`
        // ends up stamped on a shipment that was already delivered.
        const [updatedShipment] = await tx
          .update(orderShipments)
          .set({
            ...updateData,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orderShipments.id, shipmentId),
              eq(orderShipments.status, existing.status)
            )
          )
          .returning(SHIPMENT_RESPONSE_COLUMNS);

        if (!updatedShipment) {
          refuse(409, {
            error: CONCURRENT_MODIFICATION_MESSAGE,
            code: "CONCURRENT_MODIFICATION",
          });
        }

        // What this shipment status means for the order — from the table, so
        // every value of the enum has an answer and the ones that mean nothing
        // say so. `null` covers `rto_initiated`, `lost`, `cancelled` and the
        // rest of the statuses that used to fall off the end of an `else if`
        // chain.
        const newOrderStatus = updates.status
          ? ORDER_STATUS_FOR_SHIPMENT_STATUS[updates.status]
          : null;

        // ...and whether this order is one that write should touch at all: it
        // must mean something, the order must still be on the fulfilment track
        // (a cancelled order does not become `shipped` because a label was
        // scanned), and the order must not already BE there — see
        // `orderShouldMoveTo` for the return window that used to restart.
        let orderStatusChanged = false;

        if (orderShouldMoveTo(existing.orderStatus, newOrderStatus)) {
          const orderUpdateData: Partial<typeof orders.$inferInsert> = {
            status: newOrderStatus,
            updatedAt: new Date(),
          };

          if (newOrderStatus === "shipped") {
            orderUpdateData.shippedAt = new Date();
          } else if (newOrderStatus === "delivered") {
            orderUpdateData.deliveredAt = new Date();
          }

          const moved = await tx
            .update(orders)
            .set(orderUpdateData)
            .where(
              and(
                eq(orders.id, existing.orderId),
                eq(orders.status, existing.orderStatus)
              )
            )
            .returning({ id: orders.id });

          if (moved.length !== 1) {
            refuse(409, {
              error: CONCURRENT_MODIFICATION_MESSAGE,
              code: "CONCURRENT_MODIFICATION",
            });
          }

          // Set from the row count, not from the intent. It used to be computed
          // before the write from `newOrderStatus !== null && follows(...)`,
          // which is what the request MEANT to do; a zero-row update left the
          // response saying the order had moved when nothing had.
          orderStatusChanged = true;
        }

        // A tracking number is the one field on this row a CUSTOMER reads, on a
        // page that has no other source of truth. When it turns out to be
        // wrong — pasted from the wrong order, or overwritten during a
        // re-book — the question is who last changed it and what it said
        // before, and the floor `admin.request` row answers neither.
        //
        // `before` is the row as read at the top of this transaction, so the
        // diff is against what was actually replaced rather than against a
        // re-read that could have moved underneath. WITH the `tx`: the row
        // asserts the update happened, and a rolled-back update that left an
        // audit row saying otherwise is the audit trail lying.
        await recordAudit(
          c,
          {
            action: "shipment.tracking_updated",
            entityType: "order_shipment",
            entityId: shipmentId,
            summary: `Shipment ${shipmentId} updated`,
            before: {
              carrier: existing.carrier,
              status: existing.status,
            },
            after: {
              carrier: updatedShipment.carrier,
              trackingNumber: updatedShipment.trackingNumber,
              status: updatedShipment.status,
            },
            metadata: { orderId: existing.orderId },
          },
          tx
        );

        return { shipment: updatedShipment, orderStatusChanged };
      });

      return c.json({
        message: "Shipment updated successfully",
        shipment: result.shipment,
        // Stated rather than inferred. A screen that assumed the order followed
        // its shipment would show `delivered` beside an order still reading
        // `cancelled`, and the only way to tell is to say.
        orderStatusChanged: result.orderStatusChanged,
      });
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal) return c.json(refusal.body, refusal.status);

      logger.error({ err: error }, "admin shipments: failed to update shipment");
      return c.json({ error: "Failed to update shipment" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/shipments/:id/mark-delivered - Mark Shipment as Delivered
// ============================================================================

adminShipmentsApp.post("/:id/mark-delivered", async (c) => {
  const shipmentId = c.req.param("id");

  if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
    return c.json(
      { error: "Invalid shipment ID", code: "SHIPMENT_ID_INVALID" satisfies AdminShipmentRefusalCode },
      400
    );
  }

  try {
    // ONE transaction, same shape as the two handlers above. The half-applied
    // state this closes is the worst of the three: a shipment saying
    // `delivered` with a `delivered_at`, and an order still `shipped`. The
    // customer's tracking page reads `order_shipments` and says delivered, the
    // admin orders list reads `orders` and says in transit, and the return
    // window — counted from the order — has not started.
    const result = await db.transaction(async (tx) => {
      // The shipment and where its order is, in one statement — same reasoning
      // as `PATCH /:id` above, and the same `FOR UPDATE` over the join.
      //
      // The lock is what makes the `already delivered` check below a check.
      // Without it two concurrent mark-delivered calls both read `shipped`,
      // both clear the guard, and both write — the second moving `delivered_at`
      // and with it the apparent start of the return window, which is exactly
      // what the refusal exists to prevent.
      const existingResult = await tx
        .select({
          id: orderShipments.id,
          orderId: orderShipments.orderId,
          status: orderShipments.status,
          orderStatus: orders.status,
        })
        .from(orderShipments)
        .innerJoin(orders, eq(orders.id, orderShipments.orderId))
        .where(eq(orderShipments.id, shipmentId))
        .limit(1)
        .for("update");

      const existing = existingResult[0];

      if (!existing) {
        refuse(404, {
          error: "Shipment not found",
          code: "SHIPMENT_NOT_FOUND",
        });
      }

      if (existing.status === "delivered") {
        refuse(400, {
          // **The remedy has to be one the caller can carry out.** This used to
          // say "To correct the date, PATCH the shipment rather than marking it
          // again", and `updateShipmentSchema` takes no delivery date — so the
          // sentence named a route that cannot do it, and the one status-
          // bearing thing PATCH does accept, `{"status":"delivered"}`, used to
          // re-stamp `orders.delivered_at` and restart the very return window
          // this refusal exists to protect. A refusal that hands the caller a
          // loaded gun is worse than one that hands them nothing.
          //
          // So it says the true thing instead: nothing here moves that date,
          // and the read that shows what it currently says is a route that
          // exists. `names a remedy the caller can actually carry out` binds
          // this to `updateShipmentSchema` rather than to the sentence, so the
          // day PATCH grows a delivery-date field it goes red and the remedy
          // comes back.
          error:
            "This shipment is already marked delivered, so nothing was written. GET /api/admin/shipments/" +
            shipmentId +
            " shows the delivery date on record. No route in this API moves that date — re-marking would restart the customer's return window, which is counted from it — so a correction is a deliberate data change rather than a retry.",
          code: "SHIPMENT_ALREADY_DELIVERED",
        });
      }

      const now = new Date();

      // `status <> 'delivered'` repeated in the predicate, so the guard above
      // is enforced by the WRITE and not only by the read. Belt and braces on
      // purpose: the lock is the mechanism, and this is what fails loudly if
      // the lock is ever dropped in a refactor.
      const [updatedShipment] = await tx
        .update(orderShipments)
        .set({
          status: "delivered",
          deliveredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderShipments.id, shipmentId),
            ne(orderShipments.status, "delivered")
          )
        )
        .returning(SHIPMENT_RESPONSE_COLUMNS);

      if (!updatedShipment) {
        refuse(409, {
          error: CONCURRENT_MODIFICATION_MESSAGE,
          code: "CONCURRENT_MODIFICATION",
        });
      }

      // The same gate the PATCH above asks, for the same two reasons. This used
      // to be unconditional, so a cancelled or refunded order could be driven
      // to `delivered` — starting its return window and erasing the only status
      // that recorded the cancellation — and marking a SECOND shipment on an
      // order already recorded delivered re-stamped `orders.delivered_at` and
      // restarted the window from scratch.
      //
      // The shipment above is written either way, deliberately: the parcel
      // really did arrive, `order_shipments` is what the customer's tracking
      // page reads, and refusing the whole request would have thrown that fact
      // away to protect a column. What stops is the write onto the commercial
      // record.
      let orderStatusChanged = false;

      if (orderShouldMoveTo(existing.orderStatus, "delivered")) {
        const moved = await tx
          .update(orders)
          .set({
            status: "delivered",
            deliveredAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, existing.orderId),
              eq(orders.status, existing.orderStatus)
            )
          )
          .returning({ id: orders.id });

        if (moved.length !== 1) {
          refuse(409, {
            error: CONCURRENT_MODIFICATION_MESSAGE,
            code: "CONCURRENT_MODIFICATION",
          });
        }

        orderStatusChanged = true;
      }

      // Delivery is what starts the return window, so a disputed return date
      // turns on who marked it delivered and when. The floor `admin.request`
      // row records that a POST happened but not which status the shipment
      // moved from — and without that, a delivery back-dated over a shipment
      // still sitting at `pending` is indistinguishable from a normal one.
      //
      // WITH the `tx`. The row asserts a delivery the transaction must make
      // true, which is `lib/audit.ts`'s own rule for when to share one. Note
      // the other half of that rule holds too: no refusal above writes an audit
      // row at all, so nothing here is a failure row written inside the
      // transaction it says was rolled back.
      await recordAudit(
        c,
        {
          action: "order.shipment_marked_delivered",
          entityType: "order_shipment",
          entityId: shipmentId,
          summary: `Shipment marked delivered (was ${existing.status})`,
          before: { status: existing.status },
          after: { status: "delivered", deliveredAt: now },
          metadata: { orderId: existing.orderId },
        },
        tx
      );

      return { shipment: updatedShipment, orderStatusChanged };
    });

    return c.json({
      message: "Shipment marked as delivered",
      shipment: result.shipment,
      orderStatusChanged: result.orderStatusChanged,
    });
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal) return c.json(refusal.body, refusal.status);

    logger.error({ err: error }, "admin shipments: failed to mark shipment delivered");
    return c.json({ error: "Failed to mark shipment as delivered" }, 500);
  }
});

// Export the router and schemas
// ============================================================================
// POST /api/admin/shipments/:id/void - Void the label (#731)
// ============================================================================

adminShipmentsApp.post(
  "/:id/void",
  zValidator("json", voidLabelSchema, (result, c) => {
    if (result.success) return;

    return c.json(
      {
        error: VOID_BODY_HELP,
        code: "SHIPMENT_BODY_INVALID" satisfies AdminShipmentRefusalCode,
      },
      400
    );
  }),
  async (c) => {
    const shipmentId = c.req.param("id");
    const { reason } = c.req.valid("json");

    if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
      return c.json(
        { error: "Invalid shipment ID", code: "SHIPMENT_ID_INVALID" satisfies AdminShipmentRefusalCode },
        400
      );
    }

    try {
      // Courier first, row second, and never the row on a courier failure —
      // the library's ordering, proved in its own suite. This route turns its
      // refusals into responses and re-reads through the allow-list.
      const voided = await voidLabel(shipmentId, reason, c);

      const [shipment] = await db
        .select(SHIPMENT_RESPONSE_COLUMNS)
        .from(orderShipments)
        .where(eq(orderShipments.id, voided.shipmentId))
        .limit(1);

      return c.json({
        message: "Label voided",
        shipment: shipment ?? null,
        alreadyCancelledAtCourier: voided.alreadyCancelledAtCourier,
      });
    } catch (error) {
      const refusal = dispatchRefusalOf(error);
      if (refusal) return c.json(refusal.body, refusal.status);

      logger.error({ err: error, shipmentId }, "admin shipments: failed to void label");
      return c.json({ error: "Failed to void the label" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/shipments/:id/label - The label PDF, as bytes (#735)
// ============================================================================

/**
 * The alphabet a label object token is minted in — base64url, nothing else.
 * `lib/vendor-scope.ts` refuses to sign a token outside it for the same
 * reason this route refuses to build a key from one: a stored value that
 * somehow escaped the alphabet must never name a path.
 */
const LABEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/** What may follow `label-` in the download's filename; anything else is dropped. */
const LABEL_FILENAME_HANDLE = /^[A-Za-z0-9_-]+$/;

/**
 * The label the courier will honour, as bytes, for the admin about to print
 * it.
 *
 * Bytes and not a signed URL, and that is the whole design. The vendor portal's
 * `GET /api/vendor/jobs/:id/label` answers a signature because a vendor's
 * browser must fetch from storage directly; an admin's browser already holds
 * a session this router trusts, so the bytes come through here with the cookie
 * and nothing naming the object — no token, no key, no URL — ever reaches the
 * screen. `packages/web/app/routes/admin/dispatch/$shipmentId.tsx` fetches it
 * on a click and hands the file to the operating system in the same tick.
 *
 * ## The read comes first, and decides
 *
 * One narrow read — the token, the void mark and the AWB, never the row — and
 * every miss ends the request BEFORE storage is asked. No such shipment is the
 * file's own `SHIPMENT_NOT_FOUND`. No token, a voided label or a token outside
 * its alphabet is a 404 that says there is no LIVE label: the two conditions
 * are `getVendorJobLabelKey`'s, and a voided label is kept for disputes and
 * not served, because the courier would refuse it at pickup.
 *
 * ## Not audited, on purpose
 *
 * The vendor route writes `production_job.label_issued` because the label is
 * the ONE customer document that crosses to a supplier. An admin already sees
 * the address on `GET /:id`; recording every print would be a row saying
 * nothing that `shipment.label_issued` (the purchase) did not already say.
 */
adminShipmentsApp.get("/:id/label", async (c) => {
  const shipmentId = c.req.param("id");

  if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
    return c.json(
      { error: "Invalid shipment ID", code: "SHIPMENT_ID_INVALID" satisfies AdminShipmentRefusalCode },
      400
    );
  }

  try {
    const [row] = await db
      .select({
        token: orderShipments.labelObjectToken,
        voidedAt: orderShipments.voidedAt,
        awbNumber: orderShipments.awbNumber,
      })
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId))
      .limit(1);

    if (!row) {
      return c.json(
        { error: "Shipment not found", code: "SHIPMENT_NOT_FOUND" satisfies AdminShipmentRefusalCode },
        404
      );
    }

    // Live, or nothing. A voided label and a never-bought one answer the same
    // sentence because the remedy is the same: buy one.
    if (row.token === null || row.voidedAt !== null || !LABEL_TOKEN_PATTERN.test(row.token)) {
      return c.json(
        {
          error:
            "This shipment has no live label. Either none was bought yet, or the " +
            "label was voided — buy a new one from the dispatch queue.",
        },
        404
      );
    }

    // Only now. Nothing above this line touched storage.
    const bytes = await getFile(`${LABEL_OBJECT_PREFIX}${row.token}.pdf`);
    if (!bytes) {
      // The row says a label exists and storage has no bytes for it: ours to
      // fix, and the fixed string is all the caller is told.
      logger.error({ shipmentId }, "admin shipments: label object missing for a labelled row");
      return c.json({ error: "Failed to read the label" }, 500);
    }

    const handle =
      row.awbNumber && LABEL_FILENAME_HANDLE.test(row.awbNumber)
        ? row.awbNumber
        : shipmentId.slice(0, 8);

    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="label-${handle}.pdf"`,
      "Cache-Control": "no-store",
    });
  } catch (error) {
    logger.error({ err: error, shipmentId }, "admin shipments: failed to read label");
    return c.json({ error: "Failed to read the label" }, 500);
  }
});

export {
  adminShipmentsApp,
  adminOrderShipmentsApp,
  listShipmentsSchema,
  buyLabelSchema,
  voidLabelSchema,
  updateShipmentSchema,
  readyQueueSchema,
  SHIPPABLE_ORDER_STATUSES,
  READY_QUEUE_SCAN_LIMIT,
  // Exported so `every order_shipments projection in this file is one
  // allow-list` can read the four column lists at runtime and hold the
  // recorded projections against them. A `const` a suite cannot read is a
  // boundary nothing enforces.
  SHIPMENT_RESPONSE_COLUMNS,
  SHIPMENT_LIST_ORDER_COLUMNS,
  SHIPMENT_DETAIL_ORDER_COLUMNS,
  SHIPMENT_CUSTOMER_COLUMNS,
  // Exported so the suite can hold it against `shipmentStatusEnum`: `tsc`
  // proves the annotation, only a runtime read proves the members still exist.
  CLOSED_SHIPMENT_STATUSES,
  // Exported so the suite can hold the vocabulary against the file that emits
  // it, in both directions. A `type` alone cannot be read at runtime.
  ADMIN_SHIPMENT_REFUSAL_CODES,
  // Exported for one consumed reason each:
  // `tests/routes/admin/shipments-status-propagation.test.ts` holds both tables
  // against the SHIPPED enums. `tsc` proves the annotation is exhaustive; only
  // a runtime read proves the annotation is over the right enum.
  ORDER_STATUS_FOR_SHIPMENT_STATUS,
  ORDER_FOLLOWS_ITS_SHIPMENT,
};
export default adminShipmentsApp;
