import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  findRateLimitHit,
  loginFailureMessage,
  type AuthResponseProbe,
} from '../e2e/helpers/auth-diagnostics';

/**
 * Regression guards for #451 — auth.setup fails for trade/admin/content-manager.
 *
 * Two independent holes let the 5/min sliding-window auth limiter kill the
 * suite in setup:
 *
 * 1. The #332 bypass was declared only in `playwright.config.ts`'s webServer
 *    env block. Locally `reuseExistingServer` is true and a dev server is
 *    almost always already up, so Playwright never spawns the server and the
 *    env block never reaches the API. The bypass has to live on the dev
 *    entrypoint itself to hold regardless of who started the server.
 *
 * 2. A 429 renders neither string `loginUser` looked for, so it fell through
 *    to a generic "Login failed with unexpected error" that named nothing.
 */

const rootDir = process.cwd();

describe('#451 — API dev server carries the rate-limit bypass', () => {
  it('sets DISABLE_RATE_LIMIT=true on the api dev script', () => {
    const pkg = JSON.parse(
      readFileSync(join(rootDir, 'packages/api/package.json'), 'utf-8')
    );

    expect(pkg.scripts.dev).toContain('DISABLE_RATE_LIMIT=true');
  });

  it('does not leak the bypass into the production start script', () => {
    const pkg = JSON.parse(
      readFileSync(join(rootDir, 'packages/api/package.json'), 'utf-8')
    );

    expect(pkg.scripts.start).not.toContain('DISABLE_RATE_LIMIT');
  });
});

describe('#451 — login failures name the rate limit', () => {
  const probe = (over: Partial<AuthResponseProbe> = {}): AuthResponseProbe => ({
    url: 'http://localhost:3000/api/auth/sign-in/email',
    status: 200,
    retryAfter: null,
    ...over,
  });

  it('finds a 429 on an auth request', () => {
    const hit = findRateLimitHit([
      probe({ url: 'http://localhost:3001/auth/login', status: 200 }),
      probe({ status: 429, retryAfter: '47' }),
    ]);

    expect(hit?.status).toBe(429);
    expect(hit?.retryAfter).toBe('47');
  });

  it('ignores non-429 responses and 429s from non-auth requests', () => {
    expect(findRateLimitHit([probe({ status: 200 }), probe({ status: 401 })])).toBeUndefined();
    expect(
      findRateLimitHit([
        probe({ url: 'http://localhost:3000/api/products', status: 429 }),
      ])
    ).toBeUndefined();
  });

  it('reports the throttle, the wait, and the fix when a 429 was seen', () => {
    const message = loginFailureMessage(
      'test-admin@chobii.art',
      findRateLimitHit([probe({ status: 429, retryAfter: '47' })])
    );

    expect(message).toContain('test-admin@chobii.art');
    expect(message).toContain('429');
    expect(message).toContain('47s');
    expect(message).toContain('DISABLE_RATE_LIMIT=true');
  });

  it('still reports an unexplained failure when no 429 was seen', () => {
    const message = loginFailureMessage('test-trade@interior.com', undefined);

    expect(message).toContain('test-trade@interior.com');
    expect(message).not.toContain('429');
  });
});
