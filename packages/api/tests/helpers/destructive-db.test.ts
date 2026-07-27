/**
 * Tests for the destructive-DB guard (#332)
 *
 * Destructive suites (DROP TABLE ... CASCADE in tests/database/) must only
 * ever run against a DISPOSABLE database. A database is disposable iff its
 * name ends in `_test`. The guard resolves the URL destructive suites may
 * use, or null when none is safe — regardless of what DATABASE_URL points at.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isDisposableDbUrl,
  getDestructiveDbUrl,
} from './destructive-db';

const DEV_URL = 'postgresql://poster_app:pw@localhost:5433/poster_app_dev';
const TEST_URL = 'postgresql://poster_app:pw@localhost:5433/poster_app_test';

describe('isDisposableDbUrl', () => {
  it('accepts a database name ending in _test', () => {
    expect(isDisposableDbUrl(TEST_URL)).toBe(true);
  });

  it('accepts _test with query params', () => {
    expect(isDisposableDbUrl(`${TEST_URL}?sslmode=disable`)).toBe(true);
  });

  it('rejects the dev database', () => {
    expect(isDisposableDbUrl(DEV_URL)).toBe(false);
  });

  it('rejects a database merely containing _test in the middle', () => {
    expect(
      isDisposableDbUrl('postgresql://u:p@h:5432/poster_test_data')
    ).toBe(false);
  });

  it('rejects garbage that cannot be parsed', () => {
    expect(isDisposableDbUrl('not-a-url')).toBe(false);
  });
});

describe('getDestructiveDbUrl', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    for (const key of ['TEST_DATABASE_URL', 'DATABASE_URL'] as const) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('returns TEST_DATABASE_URL when it is disposable', () => {
    process.env.TEST_DATABASE_URL = TEST_URL;
    process.env.DATABASE_URL = DEV_URL;
    expect(getDestructiveDbUrl()).toBe(TEST_URL);
  });

  it('refuses a non-disposable TEST_DATABASE_URL (no dev fallback)', () => {
    process.env.TEST_DATABASE_URL = DEV_URL;
    process.env.DATABASE_URL = DEV_URL;
    expect(getDestructiveDbUrl()).toBeNull();
  });

  it('falls back to DATABASE_URL only when IT is disposable', () => {
    process.env.DATABASE_URL = TEST_URL;
    expect(getDestructiveDbUrl()).toBe(TEST_URL);
  });

  it('returns null for a dev DATABASE_URL — the #332 disaster case', () => {
    process.env.DATABASE_URL = DEV_URL;
    expect(getDestructiveDbUrl()).toBeNull();
  });

  it('returns null when nothing is set', () => {
    expect(getDestructiveDbUrl()).toBeNull();
  });
});
