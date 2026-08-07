/**
 * Frames become admin-writable, so their type stops being a ten-value ceiling.
 *
 * Shape assertions on the drizzle objects, matching
 * shipping-config-schema.test.ts: the admin route suites mock `db`, so nothing
 * else in the API catches a column that does not exist.
 *
 * The migration's ORDER is asserted too, not just its content. A backfill that
 * runs after SET NOT NULL fails on the seeded rows, and a DROP TYPE that runs
 * before the column conversion is refused outright by Postgres — both are
 * silent in a diff and loud at deploy time.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { frames, frameCategoryEnum } from '../../src/database/schema/products';
import * as productsSchema from '../../src/database/schema/products';
import { sampleFrames } from '../../src/database/seed-frames';

describe('frames.type is free text', () => {
  it('is text, not an enum, so the catalogue has no value ceiling', () => {
    expect(frames.type).toBeDefined();
    expect(frames.type.notNull).toBe(true);
    expect(frames.type.enumValues).toBeUndefined();
    expect(frames.type.getSQLType()).toBe('text');
  });

  it('no longer exports frameTypeEnum', () => {
    expect('frameTypeEnum' in productsSchema).toBe(false);
  });
});

describe('frames.category', () => {
  it('is a closed enum of the three format rungs', () => {
    expect(frameCategoryEnum.enumValues).toEqual([
      'rolled',
      'frameless',
      'framed',
    ]);
  });

  it('is required — a frame with no rung has nowhere to render', () => {
    expect(frames.category).toBeDefined();
    expect(frames.category.notNull).toBe(true);
  });
});

describe('seeded frames', () => {
  it('every row carries a category', () => {
    for (const frame of sampleFrames) {
      expect(frame.category, `${frame.name} has no category`).toBeDefined();
    }
  });

  it('maps formats to themselves and every moulding to framed', () => {
    const byName = Object.fromEntries(
      sampleFrames.map((f) => [f.name, f.category])
    );
    expect(byName['Rolled Canvas']).toBe('rolled');
    expect(byName['Frameless']).toBe('frameless');
    expect(byName['Stretch + Gold Frame']).toBe('framed');
    expect(byName['Stretch + Wood Frame']).toBe('framed');
  });

  it('keeps every type unique — the swatch colour map is keyed on it', () => {
    const types = sampleFrames.map((f) => f.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('the migration', () => {
  const dir = join(__dirname, '../../src/database/migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.startsWith('0014_') && f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

  it('exists', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('backfills category before making it NOT NULL', () => {
    const backfill = sql.indexOf('UPDATE frames SET category');
    const notNull = sql.indexOf('SET NOT NULL');
    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(backfill);
  });

  it('drops frame_type only after the column stops referencing it', () => {
    const convert = sql.indexOf('ALTER COLUMN "type" SET DATA TYPE text');
    const drop = sql.indexOf('DROP TYPE');
    expect(convert).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(convert);
  });

  it('is registered in the journal', () => {
    const journal = readFileSync(join(dir, 'meta/_journal.json'), 'utf8');
    expect(journal).toContain('"idx": 14');
  });
});
