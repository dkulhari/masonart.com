/**
 * `shipment_status` carries the states a real courier reports.
 *
 * The seven-value enum stopped at `failed`, which is a failed DELIVERY. It had
 * no word for a voided label, for an NDR the courier is holding, or for a
 * parcel on its way back to us, so dispatch could not record what a carrier
 * says without inventing one.
 *
 * The migration is asserted as TEXT rather than by connecting. `ALTER TYPE ...
 * ADD VALUE` and a use of the value it added cannot share a transaction, and
 * `drizzle-kit migrate` runs the whole pending batch in one (#580) — a test
 * that inserted a row would pass on a database where the batch had already
 * been split and fail on a fresh one. `migration-enum-literals.test.ts` is the
 * general form of that rule; this file holds the part specific to this type.
 *
 * @see packages/api/src/database/schema/shipping.ts
 * @see packages/api/src/database/migrations/0023_production_pipeline_statuses.sql
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { shipmentStatusEnum } from '../../src/database/schema/shipping';

const MIGRATION = resolve(
  __dirname,
  '../../src/database/migrations/0026_shipment_dispatch_statuses.sql'
);

/** The seven that existed before this feature. None may be dropped. */
const PRE_EXISTING = [
  'pending',
  'label_created',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
] as const;

/** The five order-dispatch-tracking adds. */
const ADDED = ['undelivered', 'rto_initiated', 'rto_delivered', 'lost', 'cancelled'] as const;

describe('shipment_status covers a real courier lifecycle', () => {
  it('keeps every pre-existing value — dropping one rewrites every dependent column', () => {
    for (const value of PRE_EXISTING) {
      expect(shipmentStatusEnum.enumValues).toContain(value);
    }
  });

  it('adds the five states a dispatch actually reports', () => {
    for (const value of ADDED) {
      expect(shipmentStatusEnum.enumValues).toContain(value);
    }
  });

  it('sorts in lifecycle order, so the enum reads as the sequence of work', () => {
    // An NDR happens on a delivery ATTEMPT, so it sits before `delivered`; the
    // three ways a parcel ends up somewhere other than the customer sit after.
    expect([...shipmentStatusEnum.enumValues]).toEqual([
      'pending',
      'label_created',
      'shipped',
      'in_transit',
      'out_for_delivery',
      'undelivered',
      'delivered',
      'rto_initiated',
      'rto_delivered',
      'lost',
      'cancelled',
      'failed',
    ]);
  });

  it('keeps `cancelled` and `failed` as different facts', () => {
    // `failed` is a failed DELIVERY and always was. `cancelled` is a dead
    // LABEL. Collapsing them is what forced `lib/vendor-scope.ts` to guess the
    // live label by recency, because the table had no way to say which one a
    // courier would still honour.
    expect(shipmentStatusEnum.enumValues).toContain('cancelled');
    expect(shipmentStatusEnum.enumValues).toContain('failed');
  });

  it('adds them in the migration, and adds NOTHING else', () => {
    const statements = readFileSync(MIGRATION, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);

    expect(statements).toHaveLength(ADDED.length);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TYPE "public"\."shipment_status" ADD VALUE/);
    }
  });

  it('uses no new value in the same batch — the #580 rule', () => {
    // The general guard is migration-enum-literals.test.ts. This is the local
    // form: nothing in THIS file may reach for a value THIS file adds.
    const sql = readFileSync(MIGRATION, 'utf8').replace(/^\s*--.*$/gm, '');

    for (const forbidden of ['UPDATE ', 'INSERT ', 'CREATE INDEX', 'CHECK (']) {
      expect(
        sql,
        `${forbidden.trim()} uses the type in the transaction that extends it`
      ).not.toContain(forbidden);
    }
  });

  it('anchors only on values it did NOT add', () => {
    // `ADD VALUE 'x' BEFORE 'y'` requires `y` to already exist. Anchoring on a
    // value added earlier in the same file would be the one way this migration
    // could break itself.
    const sql = readFileSync(MIGRATION, 'utf8').replace(/^\s*--.*$/gm, '');
    const anchors = [...sql.matchAll(/(?:BEFORE|AFTER)\s+'([^']+)'/gi)].map((m) => m[1]!);

    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(PRE_EXISTING as readonly string[]).toContain(anchor);
      expect(ADDED as readonly string[]).not.toContain(anchor);
    }
  });
});
