/**
 * The gallery join INTENT — how a guest's "yes" survives the auth redirect.
 *
 * A guest cannot join: `POST /api/gallery/join` is authenticated (#440). So the
 * offer sends them to registration carrying the intent, and the join happens on
 * the far side of an auth round trip they may leave the tab for (Google OAuth
 * is a full navigation to another origin and back). Component state does not
 * survive that. A cookie does, so the intent is a cookie, and better-auth's
 * `session.create.after` hook is the first moment on the far side where a user
 * id and the request's cookies are both in hand.
 *
 * What these tests actually defend:
 *
 * 1. **One join routine, not two.** #440 owns the idempotence guarantee — which
 *    dates survive a second join. A second implementation on the auto-join path
 *    would hold that guarantee on one path and quietly break it on the other,
 *    so `joinGallery` is extracted and BOTH paths call it. The reuse is
 *    asserted, not assumed.
 *
 * 2. **An existing member is not re-joined.** A stale intent cookie riding along
 *    on a later login must not re-stamp `marketingConsentAt`. That first consent
 *    date is the evidence produced if consent is ever questioned.
 *
 * 3. **No cookie, no database work at all.** Every login in the system runs this
 *    hook. An ordinary sign-in must not cost a membership SELECT.
 *
 * @see packages/api/src/services/gallery-membership.ts
 * @see packages/api/src/routes/gallery.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
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

// Imported directly rather than through a try/catch-into-null helper: that
// pattern makes every assertion below pass vacuously the one time it matters
// most, which is the first run against a module that does not exist yet.
import {
  JOIN_INTENT_COOKIE,
  JOIN_INTENT_VALUE,
  consumeJoinIntent,
  hasJoinIntent,
  joinGallery,
} from '../../src/services/gallery-membership';

// ============================================================================
// Fixtures
// ============================================================================

const USER_ID = 'user-123';

/** The join that actually happened, months before this login. */
const ORIGINAL_JOIN = new Date('2026-01-04T09:30:00.000Z');
const ORIGINAL_CONSENT = new Date('2026-01-04T09:30:00.000Z');

/** What the routine last passed to `.set()`, so writes can be asserted exactly. */
let setPayload: Record<string, unknown> | undefined;

function givenMembershipRow(row: Record<string, unknown> | undefined) {
  selectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(row ? [row] : []) }),
  });
}

function givenNeverJoined() {
  givenMembershipRow({
    galleryMember: false,
    galleryJoinedAt: null,
    marketingConsentAt: null,
    joinSource: null,
  });
}

function givenAlreadyJoined() {
  givenMembershipRow({
    galleryMember: true,
    galleryJoinedAt: ORIGINAL_JOIN,
    marketingConsentAt: ORIGINAL_CONSENT,
    joinSource: 'banner',
  });
}

/** The shape better-auth hands a database hook: headers, and a cookie setter. */
function contextWithCookie(cookie: string | null) {
  const cookies: Array<{ name: string; value: string; options?: unknown }> = [];
  return {
    ctx: {
      headers: new Headers(cookie ? { cookie } : {}),
      setCookie: (name: string, value: string, options?: unknown) => {
        cookies.push({ name, value, options });
      },
    },
    cookies,
  };
}

const INTENT_COOKIE = `${JOIN_INTENT_COOKIE}=${JOIN_INTENT_VALUE}`;

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
// Reading the intent off a cookie header
// ============================================================================

describe('hasJoinIntent', () => {
  it('finds the intent among the other cookies the browser sends', () => {
    expect(
      hasJoinIntent(`chobii.session_token=abc; ${INTENT_COOKIE}; theme=dark`)
    ).toBe(true);
  });

  it('reads it as the only cookie', () => {
    expect(hasJoinIntent(INTENT_COOKIE)).toBe(true);
  });

  it('tolerates the URL encoding a browser may apply to the value', () => {
    expect(
      hasJoinIntent(`${JOIN_INTENT_COOKIE}=${encodeURIComponent(JOIN_INTENT_VALUE)}`)
    ).toBe(true);
  });

  it('is false when the cookie is absent', () => {
    expect(hasJoinIntent('chobii.session_token=abc; theme=dark')).toBe(false);
  });

  it('is false for an empty or missing header', () => {
    expect(hasJoinIntent('')).toBe(false);
    expect(hasJoinIntent(null)).toBe(false);
    expect(hasJoinIntent(undefined)).toBe(false);
  });

  it('is false for a cookie carrying some other value', () => {
    // The value is checked, not just the name: clearing the cookie writes it
    // back empty, and an empty value must not read as a standing intent.
    expect(hasJoinIntent(`${JOIN_INTENT_COOKIE}=`)).toBe(false);
    expect(hasJoinIntent(`${JOIN_INTENT_COOKIE}=something-else`)).toBe(false);
  });

  it('is not fooled by a cookie whose name merely ends with the intent name', () => {
    expect(hasJoinIntent(`not_${JOIN_INTENT_COOKIE}=${JOIN_INTENT_VALUE}`)).toBe(
      false
    );
  });
});

// ============================================================================
// The shared join routine
// ============================================================================

describe('joinGallery', () => {
  it('joins a user who has never joined and stamps both dates at one instant', async () => {
    givenNeverJoined();

    const result = await joinGallery(USER_ID, 'registration');

    expect(result.status).toBe('joined');
    expect(setPayload).toMatchObject({
      galleryMember: true,
      joinSource: 'registration',
    });
    expect(setPayload?.galleryJoinedAt).toEqual(setPayload?.marketingConsentAt);
  });

  it('reports an existing member without writing anything', async () => {
    givenAlreadyJoined();

    const result = await joinGallery(USER_ID, 'registration');

    expect(result.status).toBe('already-member');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reports a session whose user row is gone', async () => {
    givenMembershipRow(undefined);

    const result = await joinGallery(USER_ID, 'registration');

    expect(result.status).toBe('not-found');
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Consuming the intent on the far side of the auth redirect
// ============================================================================

describe('consumeJoinIntent', () => {
  it('joins the new account with joinSource "registration"', async () => {
    givenNeverJoined();
    const { ctx } = contextWithCookie(INTENT_COOKIE);

    const result = await consumeJoinIntent(USER_ID, ctx);

    expect(result?.status).toBe('joined');
    expect(setPayload).toMatchObject({
      galleryMember: true,
      joinSource: 'registration',
    });
  });

  it('does nothing at all without the cookie — not even a read', async () => {
    // Every login in the system runs this hook. An ordinary sign-in must not
    // pay for a membership SELECT it has no use for.
    givenNeverJoined();
    const { ctx } = contextWithCookie(null);

    const result = await consumeJoinIntent(USER_ID, ctx);

    expect(result).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not re-join an existing member or re-stamp their consent', async () => {
    // A stale intent cookie riding along on a later login. The first consent
    // date is the evidence produced if the consent is ever questioned.
    givenAlreadyJoined();
    const { ctx } = contextWithCookie(INTENT_COOKIE);

    const result = await consumeJoinIntent(USER_ID, ctx);

    expect(result?.status).toBe('already-member');
    expect(updateMock).not.toHaveBeenCalled();
    if (result && result.status === 'already-member') {
      expect(result.membership.marketingConsentAt).toEqual(ORIGINAL_CONSENT);
      expect(result.membership.galleryJoinedAt).toEqual(ORIGINAL_JOIN);
      expect(result.membership.joinSource).toBe('banner');
    }
  });

  it('clears the cookie once it has been acted on', async () => {
    // Otherwise it rides every subsequent login until it expires, re-running a
    // join that has already happened.
    givenNeverJoined();
    const { ctx, cookies } = contextWithCookie(INTENT_COOKIE);

    await consumeJoinIntent(USER_ID, ctx);

    const cleared = cookies.find((c) => c.name === JOIN_INTENT_COOKIE);
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe('');
    expect(cleared?.options).toMatchObject({ maxAge: 0, path: '/' });
  });

  it('clears the cookie for an existing member too', async () => {
    givenAlreadyJoined();
    const { ctx, cookies } = contextWithCookie(INTENT_COOKIE);

    await consumeJoinIntent(USER_ID, ctx);

    expect(cookies.map((c) => c.name)).toContain(JOIN_INTENT_COOKIE);
  });

  it('sets no cookie when there was no intent to consume', async () => {
    const { ctx, cookies } = contextWithCookie(null);

    await consumeJoinIntent(USER_ID, ctx);

    expect(cookies).toHaveLength(0);
  });

  it('reads the cookie off ctx.request when ctx.headers is absent', async () => {
    // better-auth populates one or the other depending on the entry point;
    // the OAuth callback is a plain navigation carrying a Request.
    givenNeverJoined();

    const result = await consumeJoinIntent(USER_ID, {
      request: new Request('http://localhost:3000/api/auth/callback/google', {
        headers: { cookie: INTENT_COOKIE },
      }),
    });

    expect(result?.status).toBe('joined');
  });

  it('survives a context that carries no headers at all', async () => {
    // A hook firing outside a request must not take signup down with it.
    await expect(consumeJoinIntent(USER_ID, undefined)).resolves.toBeNull();
    await expect(consumeJoinIntent(USER_ID, {})).resolves.toBeNull();
  });

  it('survives a context with no cookie setter', async () => {
    givenNeverJoined();

    const result = await consumeJoinIntent(USER_ID, {
      headers: new Headers({ cookie: INTENT_COOKIE }),
    });

    expect(result?.status).toBe('joined');
  });

  it('does nothing without a user id', async () => {
    givenNeverJoined();
    const { ctx } = contextWithCookie(INTENT_COOKIE);

    expect(await consumeJoinIntent('', ctx)).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// One join routine, not two
// ============================================================================

describe('the two join paths share one routine', () => {
  const src = (relative: string) =>
    readFileSync(joinPath(process.cwd(), relative), 'utf8');

  it('the HTTP route delegates to joinGallery rather than writing its own', () => {
    // #440 owns the idempotence guarantee. A second write here would hold it
    // on one path and quietly break it on the other.
    const route = src('src/routes/gallery.ts');
    expect(route).toContain('joinGallery');
    expect(route).not.toContain('galleryMember: true,');
  });

  it('only the service writes the membership columns', () => {
    const service = src('src/services/gallery-membership.ts');
    expect(service).toContain('galleryMember: true');
  });

  it('better-auth runs the intent on session creation', () => {
    // The post-signup path, not a reimplementation of signup. Both the email
    // and the OAuth flows end in a session, which is why the hook hangs there.
    const auth = src('src/auth/index.ts');
    expect(auth).toContain('databaseHooks');
    expect(auth).toMatch(/session:\s*\{[\s\S]*create:\s*\{[\s\S]*after/);
    expect(auth).toContain('consumeJoinIntent');
  });
});
