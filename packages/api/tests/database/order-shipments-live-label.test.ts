/**
 * The one-live-label index, against a real Postgres.
 *
 * `tests/database/order-shipments-dispatch.test.ts` asserts the drizzle
 * objects: the index is unique, spans `(order_id)`, and carries a `where`.
 * That is the right test for "the DSL says what we meant" and the wrong test
 * for "the database does what we meant" — `config.where` being *defined* says
 * nothing about the predicate being `voided_at IS NULL AND label_object_token
 * IS NOT NULL` rather than something that merely compiles. The split follows
 * `production-job-photos-live-slot.test.ts`, and the reasoning is written up in
 * `tests/database/raw-sql-objects.test.ts`.
 *
 * Three properties, each failing differently if the predicate is wrong:
 *
 *   - Two LIVE LABELLED shipments cannot share an order. Without the index,
 *     `getVendorJobLabelKey` picks whichever row the planner reached first and
 *     a vendor who reloads is handed a different PDF — one of which the courier
 *     will not honour.
 *   - A re-buy AFTER a void IS accepted. With a blanket unique this is refused,
 *     and voiding a label would permanently prevent buying another for that
 *     order.
 *   - Two UNLABELLED shipments are accepted. `POST /admin/orders/:orderId/ship`
 *     opens a row before any label exists; a predicate that forgot
 *     `label_object_token IS NOT NULL` would make the second call a 500.
 *
 * Every row is created inside a transaction that always rolls back, so this
 * suite adds nothing to whatever database it is pointed at — including the
 * shared dev one.
 *
 * Reachability is checked inside each body rather than with `it.runIf`: the
 * modifier is evaluated at COLLECTION time, before `beforeAll` has connected,
 * so every test would report as skipped no matter what database is running.
 *
 * @see packages/api/src/lib/vendor-scope.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

import { liveDbUrl, assertLiveDbReachable } from '../helpers/live-db';

/** See production-job-photos-live-slot.test.ts — `Omit` erases call signatures. */
type Tx = postgres.Sql & Pick<postgres.TransactionSql, 'savepoint'>;

const DATABASE_URL = liveDbUrl();

let client: ReturnType<typeof postgres>;
let reachable = false;

/** Marks the throwaway order, though the rollback is what actually removes it. */
const MARKER = `os-live-label-${process.pid}`;

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

/**
 * Run `body` against an order that exists only for the duration of the call.
 *
 * Built here rather than borrowed from seed data: a disposable `*_test`
 * database has no seed rows, and a suite that quietly skips when it finds none
 * is worse than no suite.
 */
async function withThrowawayOrder<T>(body: (tx: Tx, orderId: string) => Promise<T>): Promise<T> {
  let result!: T;

  try {
    await client.begin(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const [order] = await tx`
        INSERT INTO orders (order_number, shipping_address, subtotal, total)
        VALUES (${MARKER}, ${tx.json({ marker: MARKER })}, 0, 0)
        RETURNING id
      `;

      result = await body(tx, order!.id as string);

      // Never commit. The assertions have already run against a real index.
      throw new Error('__rollback__');
    });
  } catch (error) {
    if ((error as Error).message !== '__rollback__') throw error;
  }

  return result;
}

/** Insert one shipment, reporting the constraint that refused it rather than throwing. */
async function insertShipment(
  tx: Tx,
  orderId: string,
  { token, voided }: { token?: string | null; voided?: boolean } = {}
): Promise<{ id?: string; refusedBy?: string }> {
  try {
    let inserted: string | undefined;

    await tx.savepoint(async (rawSp) => {
      const sp = rawSp as unknown as Tx;
      const [row] = await sp`
        INSERT INTO order_shipments (order_id, carrier, label_object_token, voided_at)
        VALUES (
          ${orderId},
          'Shiprocket',
          ${token ?? null},
          ${voided ? sp`now()` : null}
        )
        RETURNING id
      `;
      inserted = row!.id as string;
    });

    return { id: inserted };
  } catch (error) {
    const pg = error as { code?: string; constraint_name?: string };
    return { refusedBy: pg.constraint_name ?? pg.code ?? String(error) };
  }
}

describe('order_shipments live-label index', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable);
  });

  it('refuses a second LIVE LABELLED shipment on the same order', async () => {
    if (!reachable) return;

    const refusal = await withThrowawayOrder(async (tx, orderId) => {
      const first = await insertShipment(tx, orderId, { token: 'live-one' });
      expect(first.id).toBeDefined();

      return insertShipment(tx, orderId, { token: 'live-two' });
    });

    // Named, not merely "some error": a NOT NULL or FK violation would also
    // throw and would pass a test that only asserted failure.
    expect(refusal.refusedBy).toBe('order_shipments_live_label_idx');
  });

  it('allows a re-buy once the first label is voided', async () => {
    if (!reachable) return;

    const outcome = await withThrowawayOrder(async (tx, orderId) => {
      const first = await insertShipment(tx, orderId, { token: 'dead-label' });
      await tx`UPDATE order_shipments SET voided_at = now() WHERE id = ${first.id!}`;

      const rebuy = await insertShipment(tx, orderId, { token: 'fresh-label' });
      const [{ n }] = await tx`
        SELECT count(*)::int AS n FROM order_shipments WHERE order_id = ${orderId}
      `;

      return { rebuy, rows: n as number };
    });

    // A blanket unique refuses this, and voiding a label would then prevent
    // ever buying another for that order.
    expect(outcome.rebuy.refusedBy).toBeUndefined();
    expect(outcome.rebuy.id).toBeDefined();
    // Both rows kept: voiding is not deleting. The dead label is what a
    // dispute is argued from.
    expect(outcome.rows).toBe(2);
  });

  it('allows several UNLABELLED shipments, which is an ordinary state', async () => {
    if (!reachable) return;

    const outcome = await withThrowawayOrder(async (tx, orderId) => {
      const first = await insertShipment(tx, orderId, { token: null });
      const second = await insertShipment(tx, orderId, { token: null });

      return { first, second };
    });

    // `POST /admin/orders/:orderId/ship` opens a row before a label is bought.
    // A predicate that forgot `label_object_token IS NOT NULL` would turn the
    // second call into a 500.
    expect(outcome.first.id).toBeDefined();
    expect(outcome.second.refusedBy).toBeUndefined();
    expect(outcome.second.id).toBeDefined();
  });

  it('refuses two orders sharing one label token', async () => {
    if (!reachable) return;

    const refusal = await withThrowawayOrder(async (tx, orderId) => {
      const [other] = await tx`
        INSERT INTO orders (order_number, shipping_address, subtotal, total)
        VALUES (${`${MARKER}-b`}, ${tx.json({ marker: MARKER })}, 0, 0)
        RETURNING id
      `;

      const first = await insertShipment(tx, orderId, { token: 'shared-token' });
      expect(first.id).toBeDefined();

      return insertShipment(tx, other!.id as string, { token: 'shared-token' });
    });

    // The token names an object in the bucket. Two orders resolving to one
    // `fulfilment/labels/<token>.pdf` means one customer's address handed to
    // the other's vendor.
    expect(refusal.refusedBy).toBeDefined();
  });
});
