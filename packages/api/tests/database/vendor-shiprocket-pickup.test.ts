/**
 * `vendors.shiprocket_pickup_location` — the nickname, not the address.
 *
 * A vendor row here can carry a complete address while Shiprocket has no
 * pickup location registered for it, or has one filed under a name nobody
 * would guess. So this column holds a nickname an admin pastes from
 * Shiprocket's own dashboard, and nothing derives it from `address_line1` and
 * friends. Deriving would produce a value that is well-formed and wrong, and
 * the failure would land as a rejected pickup at dispatch time — long after
 * the admin who could fix it has moved on.
 *
 * This file asserts the DRIZZLE OBJECT and the migration text, matching
 * `order-shipments-dispatch.test.ts`. Whether a real Postgres round-trips a
 * pasted nickname verbatim is a different question and lives in
 * `vendor-shiprocket-pickup-live.test.ts`, for the reason written up in
 * `raw-sql-objects.test.ts`: a drizzle column being `text` and nullable says
 * nothing about what the column in the database actually accepts.
 *
 * @see packages/api/src/database/schema/vendors.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { vendors } from '../../src/database/schema/vendors';

const MIGRATION = resolve(
  __dirname,
  '../../src/database/migrations/0029_vendor_shiprocket_pickup.sql'
);

const config = getTableConfig(vendors);
const columnNames = config.columns.map((c) => c.name);
const columnByName = new Map(config.columns.map((c) => [c.name, c]));

describe('vendors carries a Shiprocket pickup nickname', () => {
  it('names the column in snake_case, as the migration writes it', () => {
    expect(columnNames).toContain('shiprocket_pickup_location');
    expect(vendors.shiprocketPickupLocation.name).toBe('shiprocket_pickup_location');
  });

  it('is nullable, because most vendors will never have one', () => {
    // NOT NULL with a placeholder default would make "nobody has set this" and
    // "somebody set it to something meaningless" the same value, and only one
    // of those should stop a dispatch.
    const column = columnByName.get('shiprocket_pickup_location');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
    expect(column!.hasDefault).toBe(false);
  });

  it('is free text, not an enum or a foreign key', () => {
    // The nickname is whatever the admin registered in Shiprocket. We do not
    // own the vocabulary, so we cannot constrain it to one.
    const column = columnByName.get('shiprocket_pickup_location');
    expect(column!.dataType).toBe('string');
    expect(config.foreignKeys.some((fk) => fk.reference().columns.some((c) => c.name === 'shiprocket_pickup_location'))).toBe(false);
  });

  it('is unbounded, so the zod cap is the only limit', () => {
    // The other side of this pairing is `routes/admin/vendors.ts`, which caps
    // the field at 200. That cap is a product decision, not a storage one, and
    // it is safe only while the column has no length of its own. The dispatch
    // review found a 100-char zod cap sitting over a varchar(64) — a value the
    // API accepted and the database refused. Asserting from both sides is what
    // stops that recurring.
    const column = columnByName.get('shiprocket_pickup_location');
    expect(column!.columnType).toBe('PgText');
    expect((column as unknown as { length?: number }).length).toBeUndefined();
  });

  it('leaves the address columns alone', () => {
    // The whole point of the decision: these coexist with the nickname and
    // never produce it.
    for (const name of ['address_line1', 'city', 'state', 'postal_code', 'country']) {
      expect(columnNames).toContain(name);
    }
  });

  it('has a migration that adds the column without rewriting the table', () => {
    const sql = readFileSync(MIGRATION, 'utf8');

    expect(sql).toMatch(/ALTER TABLE\s+"?vendors"?\s+ADD COLUMN/i);
    expect(sql).toMatch(/shiprocket_pickup_location/);
    // A NOT NULL or a DEFAULT here is the accident this asserts against: either
    // one turns an additive migration into a table rewrite on a live table.
    expect(sql).not.toMatch(/shiprocket_pickup_location[^;]*NOT NULL/i);
    expect(sql).not.toMatch(/shiprocket_pickup_location[^;]*DEFAULT/i);
  });
});
