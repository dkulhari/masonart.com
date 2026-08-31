-- order-dispatch-tracking phase 5: where a courier collects from this vendor.
--
-- The nickname of a pickup address as registered in Shiprocket's own dashboard.
-- An admin pastes it. Nothing derives it from `address_line1` and friends, and
-- that is the decision this column encodes rather than an omission: a vendor
-- row can carry a complete address while Shiprocket has no pickup location for
-- it, or has one filed under a name nobody would guess. A derived value would
-- be well-formed and wrong, and would fail as a rejected pickup at dispatch
-- time -- long after the admin who could fix it has moved on.
--
-- Nullable, no default, and deliberately so. Most vendors will never have one,
-- and NOT NULL with a placeholder would make "nobody has set this" and
-- "somebody set it to something meaningless" the same value. Only one of those
-- should stop a dispatch. It also keeps this additive: no table rewrite on a
-- live `vendors`.
--
-- Nothing reads it yet. The admin field that sets it is #723; the client that
-- sends it to Shiprocket is phase 6.

ALTER TABLE "vendors" ADD COLUMN "shiprocket_pickup_location" text;
