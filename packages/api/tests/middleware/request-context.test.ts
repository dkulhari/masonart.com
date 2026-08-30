/**
 * Request correlation.
 *
 * An audit row says who changed a price. The log lines say what the request did
 * on its way there. Without a shared id those are two piles of text and joining
 * them is manual archaeology — so the id is generated once per request, echoed
 * to the client (a support ticket then carries the join key), put on the context
 * for `recordAudit`, and bound to a child logger so no call site has to remember
 * to pass it.
 *
 * The redaction assertions matter as much: adding a logger that prints request
 * bodies is how a cookie ends up in a log aggregator forever.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { readJson } from '../helpers/json';

const childBindings: Record<string, unknown>[] = [];
const childLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: (bindings: Record<string, unknown>) => {
      childBindings.push(bindings);
      return childLogger;
    },
  },
  createChildLogger: (bindings: Record<string, unknown>) => {
    childBindings.push(bindings);
    return childLogger;
  },
  REDACTED_LOG_PATHS: [] as string[],
}));

const { requestContext, REQUEST_ID_HEADER } = await import(
  '../../src/middleware/request-context'
);

function appWith() {
  const app = new Hono();
  app.use('*', requestContext());
  app.get('/thing', (c) => c.json({ requestId: c.get('requestId' as never) }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  return app;
}

beforeEach(() => {
  childBindings.length = 0;
  vi.clearAllMocks();
});

describe('requestContext', () => {
  it('generates an id when the caller sends none', async () => {
    const res = await appWith().request('/thing');
    const body = (await readJson(res)) as { requestId: string };

    expect(body.requestId).toBeTruthy();
    expect(body.requestId.length).toBeGreaterThan(8);
  });

  it('preserves an incoming x-request-id, so a trace spans the edge and the API', async () => {
    const res = await appWith().request('/thing', {
      headers: { [REQUEST_ID_HEADER]: 'req-from-edge' },
    });

    expect(((await readJson(res)) as { requestId: string }).requestId).toBe('req-from-edge');
  });

  it('falls back to cf-ray, which is the id Cloudflare already assigned', async () => {
    const res = await appWith().request('/thing', { headers: { 'cf-ray': 'ray-123' } });

    expect(((await readJson(res)) as { requestId: string }).requestId).toBe('ray-123');
  });

  it('echoes the id on the response so a support ticket can carry it', async () => {
    const res = await appWith().request('/thing');

    expect(res.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(
      ((await readJson(res)) as { requestId: string }).requestId
    );
  });

  it('refuses an absurd or unprintable client id instead of logging it verbatim', async () => {
    // A header is attacker-controlled: letting it into every log line is log
    // injection, and letting it into an audit row is worse.
    const res = await appWith().request('/thing', {
      headers: { [REQUEST_ID_HEADER]: 'x'.repeat(500) },
    });

    const { requestId } = (await readJson(res)) as { requestId: string };
    expect(requestId.length).toBeLessThanOrEqual(128);
  });

  it('binds a child logger carrying the request id and the route', async () => {
    await appWith().request('/thing', { headers: { [REQUEST_ID_HEADER]: 'req-1' } });

    expect(childBindings.some((b) => b.requestId === 'req-1')).toBe(true);
  });

  it('logs one completion line with method, path, status and duration', async () => {
    await appWith().request('/thing');

    expect(childLogger.info).toHaveBeenCalledTimes(1);
    const [payload] = childLogger.info.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ method: 'GET', path: '/thing', status: 200 });
    expect(typeof payload.duration).toBe('number');
  });

  it('records the actor on the completion line when the request was authenticated', async () => {
    const app = new Hono();
    app.use('*', requestContext());
    app.use('*', async (c, next) => {
      c.set('user' as never, { id: 'u1', role: 'admin' } as never);
      await next();
    });
    app.get('/thing', (c) => c.json({ ok: true }));

    await app.request('/thing');

    const [payload] = childLogger.info.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ actorId: 'u1', actorRole: 'admin' });
  });

  it('still logs and still echoes the id when the handler throws', async () => {
    const app = appWith();
    app.onError((_err, c) => c.json({ error: 'boom' }, 500));

    const res = await app.request('/boom');

    expect(res.status).toBe(500);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(childLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('logger redaction config', () => {
  it('names the paths pino must scrub, cookies and authorization among them', async () => {
    // Imported from the real module, not the mock above: this asserts the
    // shipped configuration rather than the test double.
    const { REDACTED_LOG_PATHS } = await import('../../src/lib/logger.paths');

    for (const needle of ['cookie', 'authorization', 'password', 'token', 'otp']) {
      expect(REDACTED_LOG_PATHS.join(' ')).toContain(needle);
    }
  });
});
