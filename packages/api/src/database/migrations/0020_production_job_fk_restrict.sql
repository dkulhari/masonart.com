-- Corrective migration for 0019_vendor_management_phase_1.
--
-- Two foreign keys on the production tables were created ON DELETE cascade
-- when they should restrict. A production job carries amount_expected,
-- amount_actual and settlement_id, which makes it a financial record: cascading
-- it away with its order would destroy the proof that we owe, or have already
-- paid, a vendor for work they actually did. production_job_items is the record
-- of WHAT that billed work was for, so losing it leaves a job with an amount
-- and no explanation.
--
-- Both now match production_jobs.vendor_id, which was already restrict.
-- production_job_items.job_id stays cascade — a join row genuinely is
-- meaningless without its job.
--
-- Only constraints are dropped here; no table, column or row is touched.

ALTER TABLE "production_jobs" DROP CONSTRAINT "production_jobs_order_id_orders_id_fk";--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_items" DROP CONSTRAINT "production_job_items_order_item_id_order_items_id_fk";--> statement-breakpoint
ALTER TABLE "production_job_items" ADD CONSTRAINT "production_job_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;
