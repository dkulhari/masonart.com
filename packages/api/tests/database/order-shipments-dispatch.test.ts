/**
 * The columns real dispatch needs, and the two that other code already names.
 *
 * `label_object_token` is not a new idea here. `lib/vendor-scope.ts` reads it
 * TODAY as a raw SQL fragment against a column that does not exist, which is
 * why `GET /api/vendor/jobs/:id/label` answers a deliberate 503 in every
 * environment. `voided_at` is the void marker that same file's doc block defers
 * to this feature by name, so `getVendorJobLabelKey` can stop choosing the live
 * label by recency.
 *
 * This file asserts the DRIZZLE OBJECTS — "the DSL says what we meant". The
 * behaviour of the partial unique index against a real Postgres lives in
 * `order-shipments-live-label.test.ts`, because `config.where` being *defined*
 * says nothing about the predicate being the one we wanted rather than
 * something that merely compiles. The split follows
 * `production-job-photos.test.ts` beside `production-job-photos-live-slot.test.ts`.
 *
 * @see packages/api/src/lib/vendor-scope.ts
 * @see packages/api/tests/lib/vendor-label-seam.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { orderShipments } from '../../src/database/schema/shipping';

const MIGRATION = resolve(
  __dirname,
  '../../src/database/migrations/0027_order_shipments_dispatch.sql'
);

/** `LABEL_TOKEN_PATTERN`, copied from lib/vendor-scope.ts on purpose. */
const LABEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

const config = getTableConfig(orderShipments);
const columnNames = config.columns.map((c) => c.name);
const columnByName = new Map(config.columns.map((c) => [c.name, c]));

describe('order_shipments carries a real dispatch', () => {
  it('names the label token exactly as vendor-scope spells it', () => {
    // A rename here is SILENT: the fragment in vendor-scope.ts is a string, so
    // the route would keep 503ing with this whole suite green.
    expect(columnNames).toContain('label_object_token');
    expect(orderShipments.labelObjectToken.name).toBe('label_object_token');
  });

  it('adds the void marker vendor-scope asks for by name', () => {
    expect(columnNames).toContain('voided_at');
    expect(columnNames).toContain('voided_reason');
  });

  it('adds the carrier handles, the parcel and what we paid', () => {
    for (const name of [
      'awb_number',
      'external_shipment_id',
      'external_order_id',
      'courier_name',
      'shipped_weight_grams',
      'length_cm',
      'width_cm',
      'height_cm',
      'cost_paise',
      'pickup_vendor_id',
    ]) {
      expect(columnNames, `${name} is missing`).toContain(name);
    }
  });

  it('keeps courier_name separate from carrier', () => {
    // `carrier` is the aggregator we bought through; `courier_name` is who
    // actually carries it. Collapsing them loses the only name a customer
    // recognises on a tracking page.
    expect(columnNames).toContain('carrier');
    expect(columnNames).toContain('courier_name');
  });

  it('leaves every dispatch column nullable — an unlabelled shipment is ordinary', () => {
    // `POST /admin/orders/:orderId/ship` opens a row before any label is
    // bought. NOT NULL on any of these would refuse it.
    for (const name of [
      'label_object_token',
      'awb_number',
      'cost_paise',
      'voided_at',
      'pickup_vendor_id',
    ]) {
      expect(columnByName.get(name)!.notNull, `${name} is NOT NULL`).toBe(false);
    }
  });

  it('restricts deletion of the vendor the courier collected from', () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'pickup_vendor_id')
    );

    expect(fk, 'pickup_vendor_id has no foreign key').toBeDefined();
    // A vendor who has despatched an order cannot be deleted out from under
    // the record of where the courier collected the parcel.
    expect(fk!.onDelete).toBe('restrict');
  });

  it('adds no CHECK constraint — this repo has none, and db:push would drop it', () => {
    expect(config.checks).toHaveLength(0);
  });
});

describe('one live labelled shipment per order', () => {
  const liveLabelIndex = () =>
    config.indexes.find((index) => index.config.name === 'order_shipments_live_label_idx');

  it('is a UNIQUE index on (order_id), not a plain one', () => {
    const index = liveLabelIndex();

    expect(index, 'order_shipments_live_label_idx is missing').toBeDefined();
    // Non-unique and "which label will the courier honour" is answered by
    // whichever row the planner reached first — so a vendor who reloads their
    // label page can be handed a different PDF each time.
    expect(index!.config.unique).toBe(true);
    expect(index!.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual(['order_id']);
  });

  it('is PARTIAL, so a voided label and its replacement can coexist', () => {
    // A blanket unique would refuse the re-buy after a void, which is the one
    // moment more than one shipment row on an order is normal.
    expect(liveLabelIndex()!.config.where).toBeDefined();
  });

  it('indexes the pickup vendor, for "what am I despatching today"', () => {
    const names = config.indexes.map((i) => i.config.name);
    expect(names).toContain('order_shipments_pickup_vendor_id_idx');
  });
});

describe('the migration', () => {
  it('makes the token unique, so two orders cannot share one object key', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('label_object_token');
    expect(sql).toMatch(/unique/i);
  });

  it('adds no enum value — that was 0026, and the two cannot share a batch', () => {
    // #580: a value added by ALTER TYPE cannot be used in the transaction that
    // added it, and on a fresh database every pending migration is one batch.
    const sql = readFileSync(MIGRATION, 'utf8').replace(/^\s*--.*$/gm, '');
    expect(sql).not.toContain('ADD VALUE');
  });

  it('names no shipment_status literal, so batch order cannot matter', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/^\s*--.*$/gm, '');
    for (const value of ['undelivered', 'rto_initiated', 'rto_delivered', "'lost'", "'cancelled'"]) {
      expect(sql, `${value} was added by 0026`).not.toContain(value);
    }
  });
});

describe('the token contract the writer must honour', () => {
  it('accepts the shape the signed-URL path requires', () => {
    // The key is `fulfilment/labels/<token>.pdf` and the token rides in the
    // PATH of a signed URL. A slash would escape the prefix; an empty token
    // would sign a valid-looking URL to nothing.
    expect(LABEL_TOKEN_PATTERN.test('r7Kq2-_aZ9')).toBe(true);
    expect(LABEL_TOKEN_PATTERN.test('a/b')).toBe(false);
    expect(LABEL_TOKEN_PATTERN.test('')).toBe(false);
  });

  it('is a text column, not a uuid — the token is not required to be one', () => {
    // `production_approvals.approval_token` is the precedent. Typing it as uuid
    // would forbid the base64url tokens the pattern above allows.
    expect(columnByName.get('label_object_token')!.getSQLType()).toBe('text');
  });
});
