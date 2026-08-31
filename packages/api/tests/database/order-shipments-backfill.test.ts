/**
 * The customers who could never track their parcel.
 *
 * `PATCH /admin/orders/:id/shipping` wrote `orders.shipping_details` for months
 * while `GET /api/tracking/*` read `order_shipments`, so every order whose
 * tracking was typed into the admin screen answered `tracking: null`. Fixing
 * the writer (#707) helps orders shipped from now on; it does not reach the
 * ones already sitting in the table.
 *
 * Asserted as TEXT, like every migration test here. The suite has no live
 * database of its own and a mocked one would be testing the mock —
 * `migrations.test.ts` and `migration-enum-literals.test.ts` work the same way,
 * and the reasoning is written up in `raw-sql-objects.test.ts`.
 *
 * @see packages/api/src/database/migrations/0028_backfill_order_shipments.sql
 * @see packages/api/src/routes/admin/orders.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS = resolve(__dirname, '../../src/database/migrations');
const MIGRATION = resolve(MIGRATIONS, '0028_backfill_order_shipments.sql');

const sql = readFileSync(MIGRATION, 'utf8');
/** Comments carry prose about these values on purpose; they execute nothing. */
const body = sql.replace(/^\s*--.*$/gm, '');

describe('the old tracking data reaches the store the customer reads', () => {
  it('inserts into order_shipments from orders', () => {
    expect(body).toMatch(/insert\s+into\s+"?order_shipments"?/i);
    expect(body).toContain('shipping_details');
  });

  it('is idempotent BY CONSTRUCTION, not by luck', () => {
    // A migration that is only accidentally idempotent gets run twice by
    // somebody who does not know that.
    expect(body.toLowerCase()).toContain('not exists');
  });

  it('skips an order that already has a live shipment', () => {
    // #707 writes those. Backfilling over one would replace a tracking number
    // an admin entered today with whatever the jsonb still remembers.
    expect(body.toLowerCase()).toMatch(/voided_at"?\s+is\s+null/);
  });

  it('requires a tracking handle — an empty shipment is not worth a row', () => {
    // It would tell the customer nothing the order status does not, and it
    // would occupy the live-shipment slot a real label needs.
    expect(body).toMatch(/trackingNumber|awbNumber/);
    expect(body.toLowerCase()).toContain('is not null');
  });

  it("defaults carrier rather than dropping a real tracking number", () => {
    // `carrier` is NOT NULL and there is nobody to ask inside a migration. The
    // interactive path refuses instead (#707); here the alternative is losing
    // the data.
    expect(body).toContain("'Unknown'");
  });

  it('uses no enum value that 0026 added, so batch order cannot matter', () => {
    // #580: a value added by ALTER TYPE cannot be used in the transaction that
    // added it, and on a fresh database every pending migration is one batch.
    // Sticking to values from the original CREATE TYPE sidesteps it rather
    // than depending on ordering.
    for (const added of ['undelivered', 'rto_initiated', 'rto_delivered', "'lost'", "'cancelled'"]) {
      expect(body, `${added} was added by 0026`).not.toContain(added);
    }
  });

  it('leaves the source column intact', () => {
    // Not cleared, not dropped. That is what makes this re-runnable if the
    // mapping turns out wrong — and why #707 deliberately stopped WRITING the
    // jsonb without destroying it.
    expect(body.toLowerCase()).not.toMatch(/drop\s+column/);
    expect(body.toLowerCase()).not.toMatch(/set\s+shipping_details/);
  });

  it('is registered in the journal, or db:migrate never runs it', () => {
    // drizzle-kit does not generate data migrations, so the entry is written
    // by hand and is the easiest half to forget.
    const journal = JSON.parse(readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8'));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);

    expect(tags).toContain('0028_backfill_order_shipments');
    // Ordering matters: the columns it writes arrive in 0027.
    expect(tags.indexOf('0028_backfill_order_shipments')).toBeGreaterThan(
      tags.indexOf('0027_order_shipments_dispatch')
    );
  });
});
