/**
 * Two admins press Ship at once, and exactly one label is bought (#728).
 *
 * The property a mock cannot have. `tests/lib/shipment-dispatch.test.ts`
 * proves the ORDER of the split transaction against a recorder; this file
 * proves the CLAIM against a real Postgres — the `FOR UPDATE` on the job rows
 * that queues the second caller, the guarded token write it then finds
 * already taken, and `order_shipments_live_label_idx` behind both.
 *
 * ## Two processes, simulated honestly
 *
 * `buyLabelForOrder` joins overlapping callers inside one process on purpose,
 * so two calls from one module instance would share one purchase and prove
 * nothing about the database. Each caller here is a FRESH module instance
 * (`vi.resetModules` + a dynamic import), with its own in-flight map and its
 * own connection pool — the closest a single test worker gets to two API
 * instances behind a load balancer.
 *
 * ## What is real and what is not
 *
 * Real: the database, the schema, the lock, the index, every row the library
 * writes. Mocked: readiness (a fixture order would need jobs, transfers, QC
 * photos and a consolidator to be truly ready; what this file asserts is the
 * claim, not the predicate — that is `tests/lib/production-readiness.test.ts`),
 * the courier client (counted, never called), storage (in memory) and the
 * audit writer. The fixture rows are committed, because the claim has to be —
 * that is the design — and are deleted after each test by their marker.
 *
 * ## Falsification, recorded on the ticket rather than automated here
 *
 * The claim has three layers and removing one alone does not break it: drop
 * the lock and the guarded update still refuses; drop both and the index
 * still does. So the ticket's "remove it and watch it fail" was done by hand
 * on all three at once, watched fail (two labels), and restored — see #728's
 * completion comment. This file is the property; the comment is the proof
 * the property is load-bearing.
 *
 * @see packages/api/src/lib/shipment-dispatch.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import postgres from 'postgres';

import { liveDbUrl, assertLiveDbReachable } from '../helpers/live-db';

// Every fresh "process" below opens its own pool. Four of them at the default
// of 20 would be eighty connections against a shared dev database; a claim
// needs one.
process.env.DB_POOL_MAX = '3';

// ----------------------------------------------------------------------------
// Shared state, hoisted so every fresh module instance's mocks see ONE ledger
// ----------------------------------------------------------------------------

const ledger = vi.hoisted(() => ({
  vendorId: '' as string,
  createCalls: 0,
  createdFresh: 0,
  assignCalls: 0,
  labelCalls: 0,
  pickupCalls: 0,
  readinessCalls: [] as { orderId: string; throughTx: boolean }[],
  auditRows: [] as string[],
  objects: new Map<string, number>(),
  /** Make the next generateLabel throw, to simulate a crash after the waybill. */
  failNextLabel: false,
  /** How long the courier "takes" to create the order. Widens the window. */
  createDelayMs: 150,
}));

vi.mock('../../src/lib/logger', () => {
  const noop = () => undefined;
  const logger = { error: noop, warn: noop, info: noop, debug: noop };
  return { logger, createLogger: () => logger, REDACTED_LOG_PATHS: [] };
});

vi.mock('../../src/lib/production-readiness', () => ({
  getOrderLabelReadiness: async (orderId: string, reader?: unknown) => {
    ledger.readinessCalls.push({ orderId, throughTx: reader !== undefined });
    return { ready: true, consolidatorVendorId: ledger.vendorId, blockers: [] };
  },
  isOrderReadyToLabel: async () => true,
}));

vi.mock('../../src/services/shiprocket', () => {
  class ShiprocketPickupNotScheduledError extends Error {
    readonly retryable = true as const;
    readonly code = 'SHIPROCKET_PICKUP_NOT_SCHEDULED';
  }
  return {
    ShiprocketPickupNotScheduledError,
    selectCourierFor: async () => ({
      courierCompanyId: 51,
      courierName: 'Delhivery Surface',
      ratePaise: 15315,
      etd: 'Sep 05, 2026',
      supportsCod: true,
      blocked: false,
    }),
    createCourierOrder: async (
      input: { shipmentRowId: string },
      lookup: (id: string) => Promise<{ externalOrderId: string | null; externalShipmentId: string | null } | null>
    ) => {
      ledger.createCalls += 1;
      const existing = await lookup(input.shipmentRowId);
      if (existing?.externalOrderId && existing.externalShipmentId) {
        return { ...existing, created: false };
      }
      await new Promise((r) => setTimeout(r, ledger.createDelayMs));
      ledger.createdFresh += 1;
      return { externalOrderId: '812345678', externalShipmentId: '912345678', created: true };
    },
    assignAwb: async () => {
      ledger.assignCalls += 1;
      return {
        awbNumber: '141123221084922',
        courierName: 'Delhivery Surface',
        courierCompanyId: 51,
        requestedCourierCompanyId: 51,
      };
    },
    generateLabel: async ({ heldLabelObjectToken }: { heldLabelObjectToken: string | null }) => {
      ledger.labelCalls += 1;
      if (ledger.failNextLabel) {
        ledger.failNextLabel = false;
        throw new Error('simulated crash between the waybill and the label');
      }
      return heldLabelObjectToken
        ? { generated: false, labelObjectToken: heldLabelObjectToken }
        : { generated: true, pdf: new TextEncoder().encode('%PDF-1.4\n%%EOF\n') };
    },
    schedulePickup: async () => {
      ledger.pickupCalls += 1;
      return { scheduledFor: '2026-09-04 14:00:00', tokenNumber: 'PKP-1', alreadyScheduled: false };
    },
  };
});

vi.mock('../../src/lib/storage', () => ({
  uploadFile: async (buffer: Buffer, key: string) => {
    ledger.objects.set(key, buffer.byteLength);
    return { url: 'unused', key, bucket: 'unused' };
  },
  fileExists: async (key: string) => ledger.objects.has(key),
}));

vi.mock('../../src/lib/audit', () => ({
  recordAudit: async (_c: unknown, entry: { action: string }) => {
    ledger.auditRows.push(entry.action);
  },
}));

// ----------------------------------------------------------------------------
// The database
// ----------------------------------------------------------------------------

const DATABASE_URL = liveDbUrl();
const MARKER = `dispatch-conc-${process.pid}`;

let client: ReturnType<typeof postgres>;
let reachable = false;

/** Every fresh module epoch's database handle, so its pool can be closed. */
const epochs: { closeDatabase: () => Promise<void> }[] = [];

type Dispatch = typeof import('../../src/lib/shipment-dispatch');

/**
 * A fresh instance of the library, with its own in-flight map and its own
 * pool — one "process". Every mock above is re-applied to it, and every mock
 * writes to the one hoisted ledger.
 */
async function freshProcess(): Promise<Dispatch> {
  vi.resetModules();
  const database = await import('../../src/database');
  epochs.push(database);
  return import('../../src/lib/shipment-dispatch');
}

const actor = () => ({
  get: (key: string) => (key === 'user' ? { id: 'admin-1', email: 'ops@example.test', role: 'admin' } : undefined),
  set: () => undefined,
  req: { method: 'POST', path: '/api/admin/orders/x/ship', header: () => undefined },
});

const PARCEL = { weightGrams: 850, lengthCm: 40, widthCm: 30, heightCm: 6 };

interface Fixture {
  orderId: string;
  vendorId: string;
  jobId: string;
}

async function seedOrder(): Promise<Fixture> {
  const [vendor] = await client`
    INSERT INTO vendors (name, postal_code, shiprocket_pickup_location)
    VALUES (${MARKER}, '400072', 'warehouse')
    RETURNING id
  `;
  const vendorId = vendor!.id as string;
  ledger.vendorId = vendorId;

  const [order] = await client`
    INSERT INTO orders (order_number, shipping_address, subtotal, total, guest_email, status)
    VALUES (
      ${MARKER},
      ${client.json({
        fullName: 'Ananya Iyer',
        phone: '9820011223',
        addressLine1: '12 Turner Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        countryCode: 'IN',
      })},
      0, 0, 'guest@example.test', 'processing'
    )
    RETURNING id
  `;
  const orderId = order!.id as string;

  // One job row: what the claim takes FOR UPDATE on.
  const [job] = await client`
    INSERT INTO production_jobs (order_id, stage, vendor_id, status)
    VALUES (${orderId}, 'print', ${vendorId}, 'qc_passed')
    RETURNING id
  `;

  return { orderId, vendorId, jobId: job!.id as string };
}

async function deleteFixture(fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  await client`DELETE FROM order_shipments WHERE order_id = ${fixture.orderId}`;
  await client`DELETE FROM production_jobs WHERE order_id = ${fixture.orderId}`;
  await client`DELETE FROM orders WHERE id = ${fixture.orderId}`;
  await client`DELETE FROM vendors WHERE id = ${fixture.vendorId}`;
}

async function shipmentRows(orderId: string) {
  return client`
    SELECT id, status, label_object_token, awb_number, external_shipment_id, voided_at
    FROM order_shipments
    WHERE order_id = ${orderId}
    ORDER BY created_at
  `;
}

function resetLedger() {
  ledger.createCalls = 0;
  ledger.createdFresh = 0;
  ledger.assignCalls = 0;
  ledger.labelCalls = 0;
  ledger.pickupCalls = 0;
  ledger.readinessCalls = [];
  ledger.auditRows = [];
  ledger.objects.clear();
  ledger.failNextLabel = false;
  ledger.createDelayMs = 150;
}

let fixture: Fixture | null = null;

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

afterEach(async () => {
  if (!reachable) return;
  await deleteFixture(fixture);
  fixture = null;
  resetLedger();
});

afterAll(async () => {
  for (const epoch of epochs) await epoch.closeDatabase().catch(() => undefined);
  if (client) await client.end();
});

const outcomeOf = async <T>(run: Promise<T>) =>
  run.then((value) => ({ ok: true as const, value })).catch((error: Error) => ({ ok: false as const, error }));

// ----------------------------------------------------------------------------
// The property
// ----------------------------------------------------------------------------

describe('two simultaneous dispatches of one order', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable);
  });

  it('buy exactly one label: one claim wins, the other is refused as in progress', async () => {
    if (!reachable) return;
    fixture = await seedOrder();
    resetLedger();

    // Sequential on purpose: two resets in flight at once can hand both
    // imports ONE instance, whose in-process join would make the pair share a
    // purchase and prove nothing about the database.
    const a = await freshProcess();
    const b = await freshProcess();
    expect(a, 'the two callers are one module instance').not.toBe(b);

    const [ra, rb] = await Promise.all([
      outcomeOf(a.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor())),
      outcomeOf(b.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor())),
    ]);

    const won = [ra, rb].filter((r) => r.ok);
    const lost = [ra, rb].filter((r) => !r.ok);
    expect(won, `expected exactly one winner, got ${won.length}`).toHaveLength(1);
    expect(lost, `expected exactly one refusal, got ${lost.length}`).toHaveLength(1);

    const loser = (lost[0] as { error: Error }).error as Error & { code?: string; shipmentId?: string };
    expect(loser.name).toBe('ShipmentDispatchError');
    expect(loser.code).toBe('LABEL_PURCHASE_IN_PROGRESS');
    const winner = (won[0] as { value: { shipmentId: string; labelObjectToken: string } }).value;
    expect(loser.shipmentId).toBe(winner.shipmentId);

    // One of everything that costs money.
    expect(ledger.createdFresh).toBe(1);
    expect(ledger.assignCalls).toBe(1);
    expect(ledger.labelCalls).toBe(1);
    expect([...ledger.objects.keys()]).toEqual([`fulfilment/labels/${winner.labelObjectToken}.pdf`]);
    // The winner opened the row (the fixture has none) and then bought the label.
    expect(ledger.auditRows).toEqual(['shipment.created', 'shipment.label_issued']);

    // Both claimants asked readiness, and both asked it through a transaction.
    expect(ledger.readinessCalls).toHaveLength(2);
    expect(ledger.readinessCalls.every((c) => c.throughTx)).toBe(true);

    // The database agrees: one live labelled row, finished.
    const rows = await shipmentRows(fixture.orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'label_created',
      label_object_token: winner.labelObjectToken,
      awb_number: '141123221084922',
      voided_at: null,
    });
  });

  it('a dispatch after the first has finished is refused as a live label, and buys nothing', async () => {
    if (!reachable) return;
    fixture = await seedOrder();
    resetLedger();

    const first = await freshProcess();
    await first.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor());
    const second = await freshProcess();

    const outcome = await outcomeOf(second.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor()));

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code?: string } }).error.code).toBe('ORDER_HAS_LIVE_LABEL');
    expect(ledger.createdFresh).toBe(1);
    expect(ledger.labelCalls).toBe(1);
    expect(await shipmentRows(fixture.orderId)).toHaveLength(1);
  });
});

describe('a purchase that died between the waybill and the label', () => {
  it('leaves a claimed row that is listed, refused while young, and resumed once stale — buying nothing twice', async () => {
    if (!reachable) return;
    fixture = await seedOrder();
    resetLedger();
    ledger.failNextLabel = true;

    const dying = await freshProcess();
    const crash = await outcomeOf(dying.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor()));
    expect(crash.ok).toBe(false);
    expect((crash as { error: Error }).error.message).toContain('simulated crash');

    // What the crash left: a claim with ids and a waybill, never finished.
    let rows = await shipmentRows(fixture.orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', awb_number: '141123221084922' });
    expect(rows[0]!.label_object_token).toBeTruthy();
    const token = rows[0]!.label_object_token as string;
    // The row was opened and audited; the label was never recorded as issued.
    expect(ledger.auditRows).toEqual(['shipment.created']);

    const next = await freshProcess();

    // Listed as unfinished.
    const unfinished = await next.findUnfinishedLabelPurchases();
    expect(unfinished.map((u) => u.shipmentId)).toContain(rows[0]!.id);

    // Young: refused as in progress, because the process that claimed it may
    // still be on the phone.
    const young = await outcomeOf(next.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor()));
    expect((young as { error: { code?: string } }).error.code).toBe('LABEL_PURCHASE_IN_PROGRESS');

    // Stale: resumed. Nothing that already has an answer is asked again.
    await client`
      UPDATE order_shipments SET updated_at = now() - interval '10 minutes'
      WHERE order_id = ${fixture.orderId}
    `;
    const before = { create: ledger.createCalls, fresh: ledger.createdFresh, assign: ledger.assignCalls };

    const resumed = await next.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor());

    expect(resumed.resumed).toBe(true);
    expect(resumed.labelObjectToken).toBe(token);
    expect(ledger.createdFresh).toBe(before.fresh); // the lookup found the ids
    expect(ledger.createCalls).toBe(before.create + 1); // ...but was asked, through the client
    expect(ledger.assignCalls).toBe(before.assign); // the waybill was on the row
    expect(ledger.objects.has(`fulfilment/labels/${token}.pdf`)).toBe(true);
    expect(ledger.auditRows).toEqual(['shipment.created', 'shipment.label_issued']);

    rows = await shipmentRows(fixture.orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'label_created', label_object_token: token });
  });

  it('reconcileLabelPurchase resumes a young claim by id, when an operator says so', async () => {
    if (!reachable) return;
    fixture = await seedOrder();
    resetLedger();
    ledger.failNextLabel = true;

    const dying = await freshProcess();
    await outcomeOf(dying.buyLabelForOrder(fixture.orderId, { parcel: PARCEL }, actor()));
    const [row] = await shipmentRows(fixture.orderId);

    const operator = await freshProcess();
    const result = await operator.reconcileLabelPurchase(row!.id as string, actor());

    expect(result.resumed).toBe(true);
    expect(result.shipmentId).toBe(row!.id);
    const [after] = await shipmentRows(fixture.orderId);
    expect(after).toMatchObject({ status: 'label_created' });
    // Readiness is not re-asked on a reconcile.
    expect(ledger.readinessCalls.filter((c) => c.orderId === fixture!.orderId)).toHaveLength(1);
  });
});
