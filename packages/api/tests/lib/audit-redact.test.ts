/**
 * Audit payload hygiene.
 *
 * Audit rows live for 400 days and are readable by every admin, so what goes
 * into `before`/`after`/`metadata` is a privacy decision, not a formatting one.
 * Two rules:
 *
 * 1. A secret must never reach the table. The redactor is keyed on the key
 *    NAME, not on where it appears, because the whole point is to survive a
 *    caller passing a request body wholesale.
 * 2. Only changed keys are stored. An unfiltered row snapshot would make every
 *    price edit carry the product's entire record, forever, and would bury the
 *    one field that actually moved.
 */

import { describe, it, expect } from 'vitest';
import {
  redactAuditPayload,
  diffRecords,
  AUDIT_REDACTED,
  AUDIT_MAX_STRING_LENGTH,
} from '../../src/lib/audit';

describe('redactAuditPayload', () => {
  it('replaces secret-ish values rather than deleting the keys', () => {
    // Deleting would hide that the caller sent a secret at all. Replacing keeps
    // the shape reviewable.
    const out = redactAuditPayload({ email: 'a@b.com', password: 'hunter2' }) as Record<
      string,
      unknown
    >;

    expect(out.email).toBe('a@b.com');
    expect(out.password).toBe(AUDIT_REDACTED);
  });

  it('catches every secret-ish key name, whatever the casing or compound', () => {
    const out = redactAuditPayload({
      password: 'x',
      passwordHash: 'x',
      token: 'x',
      refreshToken: 'x',
      apiSecret: 'x',
      otp: 'x',
      razorpay_signature: 'x',
      cvv: '123',
      cardNumber: '4111111111111111',
      AUTHORIZATION: 'Bearer x',
      cookie: 'session=x',
    }) as Record<string, unknown>;

    for (const key of Object.keys(out)) {
      expect(out[key]).toBe(AUDIT_REDACTED);
    }
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactAuditPayload({
      order: { payment: { token: 'secret', amount: 100 } },
      attempts: [{ otp: '123456' }, { otp: '654321' }],
    }) as any;

    expect(out.order.payment.token).toBe(AUDIT_REDACTED);
    expect(out.order.payment.amount).toBe(100);
    expect(out.attempts[0].otp).toBe(AUDIT_REDACTED);
    expect(out.attempts[1].otp).toBe(AUDIT_REDACTED);
  });

  it('truncates a long string instead of letting a base64 image into the table', () => {
    const out = redactAuditPayload({ note: 'x'.repeat(AUDIT_MAX_STRING_LENGTH + 500) }) as Record<
      string,
      unknown
    >;

    expect(String(out.note).length).toBeLessThanOrEqual(AUDIT_MAX_STRING_LENGTH + 20);
    expect(String(out.note)).toContain('truncated');
  });

  it('leaves dates, numbers, booleans and null alone', () => {
    const when = new Date('2026-08-17T00:00:00.000Z');
    const out = redactAuditPayload({ when, count: 3, ok: true, gone: null }) as Record<
      string,
      unknown
    >;

    expect(out.when).toEqual(when.toISOString());
    expect(out.count).toBe(3);
    expect(out.ok).toBe(true);
    expect(out.gone).toBeNull();
  });

  it('passes a bare primitive straight through', () => {
    expect(redactAuditPayload('hello')).toBe('hello');
    expect(redactAuditPayload(undefined)).toBeUndefined();
  });

  it('does not blow the stack on a self-referencing object', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;

    const out = redactAuditPayload(cyclic) as Record<string, unknown>;
    expect(out.name).toBe('loop');
    expect(out.self).toBe('[Circular]');
  });
});

describe('diffRecords', () => {
  it('returns only the keys that changed, on both sides', () => {
    const { before, after } = diffRecords(
      { price: '1000', stock: 5, title: 'Poster' },
      { price: '1200', stock: 5, title: 'Poster' }
    );

    expect(before).toEqual({ price: '1000' });
    expect(after).toEqual({ price: '1200' });
  });

  it('reports an added key as a change from undefined', () => {
    const { before, after } = diffRecords({ a: 1 }, { a: 1, b: 2 });

    expect(before).toEqual({ b: null });
    expect(after).toEqual({ b: 2 });
  });

  it('compares nested values structurally, not by reference', () => {
    const { after } = diffRecords(
      { images: [{ url: 'a' }] },
      { images: [{ url: 'a' }] }
    );

    expect(after).toEqual({});
  });

  it('honours an explicit key list, so a caller can audit price without dragging the row along', () => {
    const { before, after } = diffRecords(
      { price: '1000', updatedAt: 'then' },
      { price: '1200', updatedAt: 'now' },
      ['price']
    );

    expect(before).toEqual({ price: '1000' });
    expect(after).toEqual({ price: '1200' });
  });

  it('redacts what it returns — a diff of a body with a token must not carry it', () => {
    const { after } = diffRecords({ token: 'old' }, { token: 'new' });
    expect(after).toEqual({ token: AUDIT_REDACTED });
  });

  it('survives a null before, which is what a create looks like', () => {
    const { before, after } = diffRecords(null, { id: 'p1', price: '1000' });

    expect(before).toBeNull();
    expect(after).toEqual({ id: 'p1', price: '1000' });
  });
});
