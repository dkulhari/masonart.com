/**
 * Tests for the Gallery membership API
 *
 * - POST /api/gallery/join — authenticated, idempotent opt-in
 *
 * The behaviour under the most pressure here is idempotence, and specifically
 * WHICH dates survive a second call: `galleryJoinedAt` must not move and
 * `marketingConsentAt` must not be re-stamped. The first consent date is the
 * one that has to be producible if the consent is ever questioned — a route
 * that overwrites it on every join click destroys the only evidence.
 *
 * Note on the harness: this imports the route module DIRECTLY rather than
 * through the try/catch-into-null pattern some sibling suites use. That
 * pattern makes every assertion pass vacuously when the module fails to load,
 * which is exactly the case a new route's first test run is in.
 *
 * @see packages/api/src/routes/gallery.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const authUser = c.req.header('X-Test-User');
    if (authUser) {
      c.set('user', JSON.parse(authUser));
      return next();
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }),
}));

import { galleryApp } from '../../src/routes/gallery';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/gallery', galleryApp);

// ============================================================================
// Fixtures
// ============================================================================

const USER = { id: 'user-123', email: 'user@example.com', name: 'Test User' };
const AUTH = { 'X-Test-User': JSON.stringify(USER) };

/** The join that actually happened, months before the second click. */
const ORIGINAL_JOIN = new Date('2026-01-04T09:30:00.000Z');
const ORIGINAL_CONSENT = new Date('2026-01-04T09:30:00.000Z');

/** What the route last passed to `.set()`, so writes can be asserted exactly. */
let setPayload: Record<string, unknown> | undefined;

/** Stub the membership read with the row the users table would return. */
function givenMembershipRow(row: Record<string, unknown> | undefined) {
  selectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(row ? [row] : []) }),
  });
}

/** A user who has never joined: flag false, every date null. */
function givenNeverJoined() {
  givenMembershipRow({
    galleryMember: false,
    galleryJoinedAt: null,
    marketingConsentAt: null,
    joinSource: null,
  });
}

/** A user who joined already, months ago. */
function givenAlreadyJoined() {
  givenMembershipRow({
    galleryMember: true,
    galleryJoinedAt: ORIGINAL_JOIN,
    marketingConsentAt: ORIGINAL_CONSENT,
    joinSource: 'banner',
  });
}

const join = (body: unknown, headers: Record<string, string> = AUTH) =>
  app.request('/api/gallery/join', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setPayload = undefined;
  updateMock.mockReturnValue({
    set: (payload: Record<string, unknown>) => {
      setPayload = payload;
      return { where: () => Promise.resolve(undefined) };
    },
  });
});

// ============================================================================
// Schema columns the route depends on
// ============================================================================

describe('schema assumptions', () => {
  /**
   * `db` is mocked in every test below, so a reference to a column that does
   * not exist executes nowhere and every assertion still passes. These four
   * lines are the entire defence against that.
   */
  it('users carries the four gallery membership columns', async () => {
    const { users } = await import('../../src/database/schema/users');
    expect(users.galleryMember).toBeDefined();
    expect(users.galleryJoinedAt).toBeDefined();
    expect(users.marketingConsentAt).toBeDefined();
    expect(users.joinSource).toBeDefined();
  });
});

// ============================================================================
// Auth
// ============================================================================

describe('authentication', () => {
  it('rejects a guest with 401', async () => {
    // The join modal routes guests through registration first; there is no
    // anonymous membership to create.
    const res = await join({ source: 'banner' }, {});
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// POST /api/gallery/join — first join
// ============================================================================

describe('POST /api/gallery/join', () => {
  it('joins an authenticated user and stamps consent', async () => {
    givenNeverJoined();

    const res = await join({ source: 'banner' });
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.galleryMember).toBe(true);
    expect(body.galleryJoinedAt).toBeTruthy();
    expect(body.marketingConsentAt).toBeTruthy();

    expect(setPayload).toMatchObject({
      galleryMember: true,
      joinSource: 'banner',
    });
    expect(setPayload?.galleryJoinedAt).toBeInstanceOf(Date);
    expect(setPayload?.marketingConsentAt).toBeInstanceOf(Date);
  });

  it('returns membership state so the client unlocks without a refetch', async () => {
    givenNeverJoined();

    const body = await readJson(await join({ source: 'rail' }));
    expect(body).toMatchObject({ galleryMember: true, joinSource: 'rail' });
    expect(Date.parse(body.galleryJoinedAt)).not.toBeNaN();
    expect(Date.parse(body.marketingConsentAt)).not.toBeNaN();
  });

  it('stamps the join and the consent at the same instant', async () => {
    // Two different timestamps for one click would make the audit trail look
    // like consent was collected separately from the join.
    givenNeverJoined();

    const body = await readJson(await join({ source: 'cart' }));
    expect(body.marketingConsentAt).toBe(body.galleryJoinedAt);
  });
});

// ============================================================================
// Idempotence — the point of the ticket
// ============================================================================

describe('idempotence', () => {
  it('a second call keeps the original consent date', async () => {
    // The first consent is the one that has to be producible later. A route
    // that re-stamps on every click destroys the only evidence there was.
    givenAlreadyJoined();

    const res = await join({ source: 'sale-page' });
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.marketingConsentAt).toBe(ORIGINAL_CONSENT.toISOString());
    expect(body.galleryJoinedAt).toBe(ORIGINAL_JOIN.toISOString());
  });

  it('a second call does not write at all', async () => {
    givenAlreadyJoined();

    await join({ source: 'sale-page' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('a second call does not overwrite the original join source', async () => {
    // Attribution belongs to the touchpoint that actually converted them.
    givenAlreadyJoined();

    const body = await readJson(await join({ source: 'sale-page' }));
    expect(body.joinSource).toBe('banner');
  });

  it('keeps consent given before the membership flag was set', async () => {
    // Consent can predate the flag — an older opt-in, or a half-applied write.
    // Re-stamping it "because galleryMember was false" loses the real date.
    givenMembershipRow({
      galleryMember: false,
      galleryJoinedAt: null,
      marketingConsentAt: ORIGINAL_CONSENT,
      joinSource: null,
    });

    const body = await readJson(await join({ source: 'banner' }));
    expect(setPayload?.marketingConsentAt).toEqual(ORIGINAL_CONSENT);
    expect(body.marketingConsentAt).toBe(ORIGINAL_CONSENT.toISOString());
  });
});

// ============================================================================
// joinSource validation
// ============================================================================

describe('joinSource validation', () => {
  it('rejects an unknown joinSource rather than storing free text', async () => {
    givenNeverJoined();

    const res = await join({ source: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a missing source', async () => {
    givenNeverJoined();

    const res = await join({});
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON at all', async () => {
    givenNeverJoined();

    const res = await app.request('/api/gallery/join', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  for (const source of ['banner', 'rail', 'cart', 'registration', 'sale-page']) {
    it(`accepts "${source}" from the fixed set`, async () => {
      givenNeverJoined();

      const res = await join({ source });
      expect(res.status).toBe(200);
      expect(setPayload?.joinSource).toBe(source);
    });
  }

  it('accepts joinSource as the body key too', async () => {
    // The client sends the field under the name the column carries.
    givenNeverJoined();

    const res = await join({ joinSource: 'registration' });
    expect(res.status).toBe(200);
    expect(setPayload?.joinSource).toBe('registration');
  });
});

// ============================================================================
// Missing account
// ============================================================================

describe('a session whose user row is gone', () => {
  it('is 404 rather than a silent success', async () => {
    // The update would match no rows and the response would claim a
    // membership that does not exist anywhere.
    givenMembershipRow(undefined);

    const res = await join({ source: 'banner' });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
