/**
 * `/api/shipping/estimate` prices against the configured threshold.
 *
 * The estimate endpoint is the one the checkout's shipping selector calls, and
 * it both *decides* whether an option is free and *reports* the threshold in
 * `freeShippingThreshold`. Those two have to come from the same place: an
 * endpoint that charged by ₹1,499 while telling the client ₹999 is the same
 * false-advertising gap commit 70bfa9dd closed, rebuilt inside one response
 * body. So both assertions are here, on the same request.
 *
 * `db` is mocked — the shipping options table is not what is under test — and
 * the accessor is stubbed so each case states which threshold is in force.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { FREE_SHIPPING_THRESHOLD } from '@chobii/shared';
import '../setup';

const orderByMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: (...args: unknown[]) => orderByMock(...args) }),
      }),
    }),
  },
}));

vi.mock('../../src/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));

const getFreeShippingThresholdMock = vi.fn();

vi.mock('../../src/lib/shipping-config', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/shipping-config')>();
  return {
    ...actual,
    getFreeShippingThreshold: (...args: unknown[]) =>
      getFreeShippingThresholdMock(...args),
  };
});

import { shippingApp } from '../../src/routes/shipping';

const app = new Hono();
app.route('/api/shipping', shippingApp);

const STANDARD = {
  id: '2a4b6c8d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
  name: 'Standard Shipping',
  carrier: 'Delhivery',
  description: null,
  baseCost: '99.00',
  estimatedDaysMin: 3,
  estimatedDaysMax: 7,
};

interface EstimateBody {
  freeShippingThreshold: number;
  options: Array<{ calculatedCost: string; isFree: boolean }>;
}

async function estimate(cartTotal: number): Promise<EstimateBody> {
  const res = await app.request(
    `/api/shipping/estimate?cartTotal=${cartTotal}`
  );
  expect(res.status).toBe(200);
  return (await res.json()) as EstimateBody;
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByMock.mockResolvedValue([STANDARD]);
  getFreeShippingThresholdMock.mockResolvedValue(FREE_SHIPPING_THRESHOLD);
});

describe('GET /api/shipping/estimate — the configured threshold', () => {
  it('reports the configured threshold rather than the bundled constant', async () => {
    getFreeShippingThresholdMock.mockResolvedValue(1499);

    const body = await estimate(500);

    expect(body.freeShippingThreshold).toBe(1499);
  });

  it('charges a basket that clears the constant but not the configured value', async () => {
    getFreeShippingThresholdMock.mockResolvedValue(1499);

    const body = await estimate(1200);

    expect(body.options[0]?.isFree).toBe(false);
    expect(body.options[0]?.calculatedCost).toBe('99.00');
  });

  it('ships free at the configured threshold', async () => {
    getFreeShippingThresholdMock.mockResolvedValue(1499);

    const body = await estimate(1499);

    expect(body.options[0]?.isFree).toBe(true);
    expect(body.options[0]?.calculatedCost).toBe('0.00');
  });

  it('quotes and charges by the same figure', async () => {
    // The invariant that makes the pair above more than two separate cases: a
    // basket exactly at whatever the body reports must ship free, whatever
    // that figure happens to be.
    getFreeShippingThresholdMock.mockResolvedValue(2500);

    const quoted = (await estimate(0)).freeShippingThreshold;
    const body = await estimate(quoted);

    expect(body.options[0]?.isFree).toBe(true);
  });

  it('falls back to the shared constant, so ₹999 still ships free', async () => {
    // What an empty table or an unreachable database resolves to.
    const body = await estimate(FREE_SHIPPING_THRESHOLD);

    expect(body.freeShippingThreshold).toBe(FREE_SHIPPING_THRESHOLD);
    expect(body.options[0]?.isFree).toBe(true);
  });

  it('reads the threshold once per request, not once per option', async () => {
    orderByMock.mockResolvedValue([
      STANDARD,
      { ...STANDARD, id: '3b5c7d9e-1f2a-4b3c-9d4e-5f6a7b8c9d0e', carrier: 'Express' },
    ]);

    await estimate(500);

    expect(getFreeShippingThresholdMock).toHaveBeenCalledTimes(1);
  });
});
