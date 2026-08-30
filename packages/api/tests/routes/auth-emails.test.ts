/**
 * Auth transactional emails (#342, #242)
 *
 * Proves the two Better Auth email hooks actually send through the email
 * service instead of being console.log stubs:
 * - sign-up → verification email (production signups dead-ended without it)
 * - request-password-reset → reset email (forgot-password flow, #242)
 *
 * The email service is mocked; assertions are on what would be sent.
 * Requires a reachable database (users are created); each run uses unique
 * emails and cleans up after itself.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const sendEmailMock = vi.fn().mockResolvedValue({ success: true, id: 'mock' });

vi.mock('../../src/services/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/email')>();
  return {
    ...original,
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  };
});

// The hooks skip real sends outside production unless explicitly opted in
// (dev .env carries a real Resend key; fake-address bounces hurt reputation)
process.env.SEND_AUTH_EMAILS = 'true';

// Import AFTER the mock so the auth config captures the mocked module
import { app } from '../../src/index';

const RUN_ID = Math.random().toString(36).slice(2, 10);
const SIGNUP_EMAIL = `auth-email-test-${RUN_ID}@example.com`;
const PASSWORD = 'AuthEmailTest123!';

async function cleanup() {
  const { db } = await import('../../src/database');
  const { users } = await import('../../src/database/schema/users');
  await db.delete(users).where(eq(users.email, SIGNUP_EMAIL));
}

afterAll(cleanup);

describe('auth transactional emails', () => {
  it('sign-up sends a verification email through the email service (#342)', async () => {
    sendEmailMock.mockClear();

    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Auth Email Test',
        email: SIGNUP_EMAIL,
        password: PASSWORD,
      }),
    });
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe(SIGNUP_EMAIL);
    expect(call.subject.toLowerCase()).toContain('verify');
    // The verification link must be present in the body
    expect(call.html).toContain('verify-email');
  });

  it('request-password-reset sends a reset email through the email service (#242)', async () => {
    sendEmailMock.mockClear();

    const res = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: SIGNUP_EMAIL,
        redirectTo: '/auth/reset-password',
      }),
    });
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe(SIGNUP_EMAIL);
    expect(call.subject.toLowerCase()).toContain('reset');
    expect(call.html).toContain('reset-password');
  });

  it('does not send outside production without SEND_AUTH_EMAILS opt-in', async () => {
    sendEmailMock.mockClear();
    const prev = process.env.SEND_AUTH_EMAILS;
    delete process.env.SEND_AUTH_EMAILS;
    try {
      const res = await app.request('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: SIGNUP_EMAIL,
          redirectTo: '/auth/reset-password',
        }),
      });
      expect(res.status).toBe(200);
      expect(sendEmailMock).not.toHaveBeenCalled();
    } finally {
      process.env.SEND_AUTH_EMAILS = prev;
    }
  });

  it('request-password-reset for an unknown email still returns 200 (no user enumeration) and sends nothing', async () => {
    sendEmailMock.mockClear();

    const res = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `nobody-${RUN_ID}@example.com`,
        redirectTo: '/auth/reset-password',
      }),
    });
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
