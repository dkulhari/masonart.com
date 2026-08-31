-- order-dispatch-tracking phase 3: move the tracking nobody could read.
--
-- `PATCH /admin/orders/:id/shipping` wrote `orders.shipping_details` for months
-- while `GET /api/tracking/*` read `order_shipments`, and the only writer of
-- `order_shipments` had no UI. So every customer whose tracking was typed into
-- the admin screen saw `tracking: null`. #707 fixed the writer, which helps
-- orders shipped from now on and reaches none of the ones already in the table.
--
-- IDEMPOTENT BY CONSTRUCTION. The NOT EXISTS below means a second run inserts
-- nothing. Said out loud because a migration that is only accidentally
-- idempotent gets run twice by somebody who does not know that.
--
-- THE SOURCE COLUMN IS NOT TOUCHED. `orders.shipping_details` keeps its data
-- and keeps its column — which is exactly why #707 stopped WRITING it without
-- destroying it. If this mapping turns out wrong, deleting the inserted rows
-- and re-running is the whole recovery; a migration that moved and then
-- destroyed would leave nothing to re-run against.
--
-- USES NO VALUE ADDED BY 0026. `pending`, `shipped` and `delivered` all come
-- from the original CREATE TYPE, so this cannot trip #580 whatever order the
-- batch runs in. See tests/database/migration-enum-literals.test.ts.

INSERT INTO "order_shipments" (
  "order_id",
  "carrier",
  "tracking_number",
  "tracking_url",
  "awb_number",
  "external_shipment_id",
  "status",
  "shipped_at",
  "delivered_at",
  "estimated_delivery_at",
  "notes"
)
SELECT
  o."id",
  -- NOT NULL, and there is nobody to ask inside a migration. The interactive
  -- path refuses a missing carrier (#707); here the alternative is dropping a
  -- real tracking number on the floor.
  COALESCE(NULLIF(o."shipping_details" ->> 'carrier', ''), 'Unknown'),
  NULLIF(o."shipping_details" ->> 'trackingNumber', ''),
  NULLIF(o."shipping_details" ->> 'trackingUrl', ''),
  NULLIF(o."shipping_details" ->> 'awbNumber', ''),
  NULLIF(o."shipping_details" ->> 'shipmentId', ''),
  -- Derived from the ORDER's own timeline rather than from the jsonb, which
  -- never carried a status. An order already marked delivered must not arrive
  -- here as `pending` and re-open a delivery the customer has seen closed.
  CASE
    WHEN o."delivered_at" IS NOT NULL THEN 'delivered'
    WHEN o."shipped_at" IS NOT NULL THEN 'shipped'
    ELSE 'pending'
  END::"public"."shipment_status",
  o."shipped_at",
  o."delivered_at",
  -- Text, not timestamp, in the source. A malformed value would abort the whole
  -- migration, so anything unparseable becomes NULL rather than taking the
  -- backfill down with it.
  CASE
    WHEN o."shipping_details" ->> 'estimatedDelivery' ~
         '^\d{4}-\d{2}-\d{2}([T ].*)?$'
    THEN (o."shipping_details" ->> 'estimatedDelivery')::timestamp
    ELSE NULL
  END,
  'Backfilled from orders.shipping_details by migration 0028'
FROM "orders" o
WHERE
  o."shipping_details" IS NOT NULL
  -- A row with no handle at all tells the customer nothing the order status
  -- does not, and it would occupy the live-shipment slot a real label needs.
  AND COALESCE(
    NULLIF(o."shipping_details" ->> 'trackingNumber', ''),
    NULLIF(o."shipping_details" ->> 'awbNumber', ''),
    NULLIF(o."shipping_details" ->> 'shipmentId', '')
  ) IS NOT NULL
  -- Never over a live shipment. #707 writes those, and backfilling across one
  -- would replace a tracking number an admin entered today with whatever the
  -- jsonb still remembers.
  AND NOT EXISTS (
    SELECT 1
    FROM "order_shipments" s
    WHERE s."order_id" = o."id"
      AND s."voided_at" IS NULL
  );
