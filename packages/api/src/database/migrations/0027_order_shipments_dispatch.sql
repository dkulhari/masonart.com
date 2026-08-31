-- order-dispatch-tracking phase 1: what a real dispatch has to record.
--
-- Separate from 0026 on purpose. That one is ALTER TYPE ADD VALUE, and nothing
-- in the same batch may USE a value it added (#580) — so this file deliberately
-- names no `shipment_status` literal at all, in the index predicate or anywhere
-- else, and the batch order therefore cannot matter.
--
-- Two of these columns are not new requests:
--
--   * `label_object_token` is read TODAY by lib/vendor-scope.ts as a raw SQL
--     fragment, which is why GET /api/vendor/jobs/:id/label answers a
--     deliberate 503 in every environment. #704 unwires that.
--   * `voided_at` is the void marker that file's doc block defers to this
--     feature by name, so getVendorJobLabelKey can stop choosing the live label
--     by recency. #705 consumes it.
--
-- The partial unique index is the property getVendorJobLabelKey needs: at most
-- ONE live labelled shipment per order. Both halves of the predicate are load
-- bearing. Drop `voided_at IS NULL` and it becomes a blanket unique that
-- refuses the re-buy after a void, so voiding a label would permanently prevent
-- buying another. Drop `label_object_token IS NOT NULL` and it refuses the
-- second unlabelled row — and POST /admin/orders/:orderId/ship opens exactly
-- those, before any label exists.
--
-- `pickup_vendor_id` is ON DELETE restrict, matching production_jobs.vendor_id:
-- a vendor who has despatched an order cannot be deleted out from under the
-- record of where the courier collected the parcel.

ALTER TABLE "order_shipments" ADD COLUMN "label_object_token" text;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "voided_reason" text;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "awb_number" varchar(64);--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "external_shipment_id" varchar(64);--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "external_order_id" varchar(64);--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "courier_name" varchar(100);--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "shipped_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "width_cm" integer;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "cost_paise" integer;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "pickup_vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_pickup_vendor_id_vendors_id_fk" FOREIGN KEY ("pickup_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_shipments_pickup_vendor_id_idx" ON "order_shipments" USING btree ("pickup_vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipments_live_label_idx" ON "order_shipments" USING btree ("order_id") WHERE "order_shipments"."voided_at" IS NULL AND "order_shipments"."label_object_token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_label_object_token_unique" UNIQUE("label_object_token");