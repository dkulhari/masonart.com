/**
 * Shiprocket configuration, and what happens when there is none.
 *
 * This is the whole of what phase 5 can deliver: there are no credentials yet,
 * so there is no client. What there IS is the difference between "we have no
 * keys" being a documented, quotable state and it being a crash at dispatch
 * time in front of a customer's parcel.
 *
 * ## Why env is read at call time
 *
 * `lib/razorpay.ts` reads its credentials into module-level `const`s at import
 * time. That is the precedent and this file deliberately departs from it: a
 * module-load read cannot be tested in both states, because by the time a test
 * can set `process.env` the constants are already frozen. `isRazorpayConfigured`
 * therefore has no test that sees it return both values. Reading inside the
 * function costs nothing measurable and makes the unconfigured path — the only
 * path that exists today — actually reachable from a test.
 *
 * ## What the refusal may not say
 *
 * The message reaches an admin who can act, so it names the configuration and
 * where it is set. It must never carry a credential. The same rule the label
 * route follows: `routes/vendor.ts` refuses without naming a column, a table or
 * a driver, because the refusal is read by someone who should not learn the
 * shape of our storage from it.
 *
 * @see packages/api/src/services/shiprocket.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isShiprocketConfigured,
  getShiprocketConfig,
  assertShiprocketConfigured,
  ShiprocketNotConfiguredError,
  SHIPROCKET_ENV_VARS,
} from '../../src/services/shiprocket';

const SECRET = 'sr-p@ssw0rd-not-in-any-message';
const EMAIL = 'ops@chobii.art';

/** Every SHIPROCKET_* key, cleared and restored around each test. */
const saved = new Map<string, string | undefined>();

function clearShiprocketEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SHIPROCKET_')) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  }
}

function configure(): void {
  process.env.SHIPROCKET_EMAIL = EMAIL;
  process.env.SHIPROCKET_PASSWORD = SECRET;
}

beforeEach(() => {
  saved.clear();
  clearShiprocketEnv();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SHIPROCKET_')) delete process.env[key];
  }
  for (const [key, value] of saved) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe('isShiprocketConfigured', () => {
  it('is false on a tree with no SHIPROCKET_* set', () => {
    expect(isShiprocketConfigured()).toBe(false);
  });

  it('is true once the credentials are present', () => {
    // The assertion the razorpay precedent cannot make about itself: both
    // values observed from one test run, because the read happens per call.
    configure();
    expect(isShiprocketConfigured()).toBe(true);
  });

  it('is false when only half the credentials are present', () => {
    process.env.SHIPROCKET_EMAIL = EMAIL;
    expect(isShiprocketConfigured()).toBe(false);
  });

  it('treats whitespace as unset', () => {
    // A key that is present-but-blank in a .env is the failure mode that looks
    // configured and is not — the #670 property, one layer up.
    configure();
    process.env.SHIPROCKET_PASSWORD = '   ';
    expect(isShiprocketConfigured()).toBe(false);
  });
});

describe('the refusal', () => {
  it('throws ShiprocketNotConfiguredError, never returns null', () => {
    // A null return is a refusal a caller can ignore, and the caller here is
    // about to buy a label with somebody's money.
    expect(() => assertShiprocketConfigured()).toThrow(ShiprocketNotConfiguredError);
    expect(() => getShiprocketConfig()).toThrow(ShiprocketNotConfiguredError);
  });

  it('names the configuration and where it is set', () => {
    let message = '';
    try {
      assertShiprocketConfigured();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/SHIPROCKET_EMAIL/);
    expect(message).toMatch(/SHIPROCKET_PASSWORD/);
    expect(message.length).toBeGreaterThan(0);
  });

  it('carries a stable code a caller can branch on', () => {
    try {
      assertShiprocketConfigured();
      expect.unreachable('assertShiprocketConfigured did not throw');
    } catch (error) {
      expect((error as ShiprocketNotConfiguredError).code).toBe('SHIPROCKET_NOT_CONFIGURED');
    }
  });

  it('never quotes a credential, even when one is half-set', () => {
    process.env.SHIPROCKET_PASSWORD = SECRET;

    let message = '';
    try {
      assertShiprocketConfigured();
    } catch (error) {
      message = (error as Error).message;
    }

    // Naming the VARIABLE is the help. Naming its VALUE is a leak, and this is
    // the path where a value exists to leak.
    expect(message).not.toContain(SECRET);
  });

  it('stops throwing once configured', () => {
    configure();
    expect(() => assertShiprocketConfigured()).not.toThrow();
  });
});

describe('getShiprocketConfig', () => {
  it('returns the credentials and a default base URL', () => {
    configure();
    const config = getShiprocketConfig();

    expect(config.email).toBe(EMAIL);
    expect(config.password).toBe(SECRET);
    expect(config.baseUrl).toMatch(/^https:\/\//);
  });

  it('lets the base URL be overridden, so a sandbox is reachable', () => {
    configure();
    process.env.SHIPROCKET_BASE_URL = 'https://sandbox.example.test/v1';
    expect(getShiprocketConfig().baseUrl).toBe('https://sandbox.example.test/v1');
  });

  it('trims the credentials it was given', () => {
    process.env.SHIPROCKET_EMAIL = `  ${EMAIL}  `;
    process.env.SHIPROCKET_PASSWORD = ` ${SECRET} `;

    const config = getShiprocketConfig();
    expect(config.email).toBe(EMAIL);
    expect(config.password).toBe(SECRET);
  });
});

describe('SHIPROCKET_ENV_VARS', () => {
  it('names every variable the module reads', () => {
    // The list .env.example is checked against, so a variable added here
    // without being documented fails the suite below rather than surprising
    // whoever deploys next.
    expect(SHIPROCKET_ENV_VARS).toContain('SHIPROCKET_EMAIL');
    expect(SHIPROCKET_ENV_VARS).toContain('SHIPROCKET_PASSWORD');
    expect(SHIPROCKET_ENV_VARS).toContain('SHIPROCKET_BASE_URL');
  });
});

describe('.env.example', () => {
  it('documents every variable the module reads', () => {
    // The deploy-time half of the contract. A variable this module starts
    // reading, without a line in .env.example, is a production incident that
    // looks like a code bug: `isShiprocketConfigured()` returns false and
    // nobody knows which key is missing.
    const example = readFileSync(resolve(__dirname, '../../../../.env.example'), 'utf8');

    for (const key of SHIPROCKET_ENV_VARS) {
      expect(example, `${key} is not documented in .env.example`).toMatch(
        new RegExp(`^${key}=`, 'm')
      );
    }
  });

  it('ships no real credential in the example', () => {
    const example = readFileSync(resolve(__dirname, '../../../../.env.example'), 'utf8');
    const emailLine = example.match(/^SHIPROCKET_EMAIL=(.*)$/m);

    // A checked-in example with somebody's actual login in it is the way
    // credentials reach a public repository.
    expect(emailLine).not.toBeNull();
    expect(emailLine![1]).not.toMatch(/@chobii\.art\s*$/);
  });
});
