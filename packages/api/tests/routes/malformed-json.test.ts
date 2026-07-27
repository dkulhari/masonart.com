/**
 * Malformed JSON bodies must return 400, never 500 (#260)
 *
 * Hono's json validator returns 400 "Malformed JSON in request body" when
 * body parsing fails. This pins that contract — a framework or handler
 * regression back to 500 would page ops for what is client error.
 */
import { describe, it, expect } from 'vitest';
import { app } from '../../src/index';

describe('malformed JSON handling', () => {
  it('returns 400 (not 500) for a broken JSON body on a validated route', async () => {
    const res = await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty body with a JSON content type', async () => {
    const res = await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
