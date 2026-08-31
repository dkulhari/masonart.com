/**
 * The pickup nickname survives a real Postgres round trip, verbatim.
 *
 * `vendor-shiprocket-pickup.test.ts` asserts the drizzle object and the
 * migration text — "the DSL says what we meant". This asserts what the database
 * actually accepts and returns, which is a different question: a `text` column
 * in the DSL says nothing about whether the column exists in the database the
 * app connects to, and a migration file that was never applied looks identical
 * to one that was.
 *
 * Verbatim matters more than it looks. A Shiprocket pickup nickname is chosen
 * by whoever registered it in their dashboard, so it can carry inner spaces,
 * mixed case and punctuation. Anything that normalises it here produces a value
 * that looks right and matches nothing on their side, and the failure surfaces
 * as a rejected pickup at dispatch — not at the screen where it was typed.
 *
 * Every row is created inside a transaction that always rolls back, so this
 * suite adds nothing to whatever database it is pointed at, including the
 * shared dev one.
 *
 * Reachability is checked inside each body rather than with `it.runIf`: the
 * modifier is evaluated at COLLECTION time, before `beforeAll` has connected,
 * so every test would report skipped no matter what database is running.
 *
 * @see packages/api/src/database/schema/vendors.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

import { liveDbUrl, assertLiveDbReachable } from '../helpers/live-db';

/** See order-shipments-live-label.test.ts — `Omit` erases call signatures. */
type Tx = postgres.Sql & Pick<postgres.TransactionSql, 'savepoint'>;

const DATABASE_URL = liveDbUrl();
const MARKER = `vendor-pickup-live-${process.pid}`;

let client: ReturnType<typeof postgres>;
let reachable = false;

beforeAll(async () => {
  if (!DATABASE_URL) return;

  try {
    client = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
    await client`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
});

afterAll(async () => {
  if (client) await client.end();
});

/** Run `body` against a vendor that exists only for the duration of the call. */
async function withThrowawayVendor<T>(body: (tx: Tx, vendorId: string) => Promise<T>): Promise<T> {
  let result!: T;

  try {
    await client.begin(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const [vendor] = await tx`
        INSERT INTO vendors (name)
        VALUES (${MARKER})
        RETURNING id
      `;

      result = await body(tx, vendor!.id as string);

      // Never commit. The assertions have already run against a real column.
      throw new Error('__rollback__');
    });
  } catch (error) {
    if ((error as Error).message !== '__rollback__') throw error;
  }

  return result;
}

describe('vendors.shiprocket_pickup_location, against a real Postgres', () => {
  it('exists in the database, not only in the schema file', async () => {
    assertLiveDbReachable(reachable);

    const [column] = await client`
      SELECT is_nullable, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'vendors' AND column_name = 'shiprocket_pickup_location'
    `;

    // A migration that was generated but never applied fails exactly here, and
    // the drizzle-object suite beside this one stays green while it does.
    expect(column, 'migration 0029 has not been applied to this database').toBeDefined();
    expect(column!.is_nullable).toBe('YES');
    expect(column!.column_default).toBeNull();
  });

  it('returns a pasted nickname byte for byte', async () => {
    assertLiveDbReachable(reachable);

    // Inner spaces, mixed case, punctuation — all legal in Shiprocket's own
    // dashboard, so all of it has to survive.
    const nickname = 'Chobii Warehouse #2 (Andheri East)';

    const stored = await withThrowawayVendor(async (tx, vendorId) => {
      await tx`
        UPDATE vendors SET shiprocket_pickup_location = ${nickname} WHERE id = ${vendorId}
      `;
      const [row] = await tx`
        SELECT shiprocket_pickup_location FROM vendors WHERE id = ${vendorId}
      `;
      return row!.shiprocket_pickup_location as string;
    });

    expect(stored).toBe(nickname);
  });

  it('defaults to NULL for a vendor nobody has configured', async () => {
    assertLiveDbReachable(reachable);

    const stored = await withThrowawayVendor(async (tx, vendorId) => {
      const [row] = await tx`
        SELECT shiprocket_pickup_location FROM vendors WHERE id = ${vendorId}
      `;
      return row!.shiprocket_pickup_location;
    });

    // Not '' — unset has to be distinguishable from set-to-nothing, which is
    // the #670 lesson: an empty string satisfies `IS NOT NULL`.
    expect(stored).toBeNull();
  });
});
