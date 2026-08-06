/**
 * What a framed line is stored — and therefore charged — at (#511 final
 * review, finding 1).
 *
 * `POST /api/cart/items` and `PATCH /api/cart/items/:id` used to read the flat
 * `priceAddition` column on its own. Every seeded frame carries `0.00` there
 * and the real price in `priceModifier` (1.33–1.40, "the piece plus 33–40%"),
 * so every framed line was written with `framePrice 0.00` and a `lineTotal`
 * equal to the bare poster. `POST /api/orders` sums those stored `lineTotal`s,
 * so every framed order undercharged by the whole frame markup while the
 * storefront's buy panel quoted the customer the correct, higher figure.
 *
 * `db` is mocked, per the convention in this directory, and the values written
 * are recorded rather than counted: the whole bug was a route that happily
 * wrote a wrong number, so an assertion that "an insert happened" would have
 * passed against the broken code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();
const cartFindFirstMock = vi.fn();

/** Every `.values(...)` argument seen on any insert chain, in call order. */
const valueCalls: Record<string, unknown>[] = [];
/** Every `.set(...)` argument seen on any update chain, in call order. */
const setCalls: Record<string, unknown>[] = [];

function chain(rows: unknown[]) {
  const link: Record<string, unknown> = {};
  const self = () => link;
  Object.assign(link, {
    from: self,
    where: self,
    innerJoin: self,
    set: (values: Record<string, unknown>) => {
      setCalls.push(values);
      return link;
    },
    values: (values: Record<string, unknown>) => {
      valueCalls.push(values);
      return link;
    },
    limit: () => Promise.resolve(rows),
    returning: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  });
  return link;
}

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    query: {
      carts: { findFirst: (...args: unknown[]) => cartFindFirstMock(...args) },
    },
  },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { CART: 'cart:' },
}));

const getSessionMock = vi.fn();

vi.mock('../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

vi.mock('../../src/lib/promotion-pricing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/promotion-pricing')>();
  return {
    ...actual,
    getActivePromotions: vi.fn().mockResolvedValue([]),
    loadPromotionProductSets: vi.fn().mockResolvedValue(new Map()),
  };
});

import { cartApp } from '../../src/routes/cart';

const app = new Hono();
app.route('/api/cart', cartApp);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CART_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const VARIANT_ID = '44444444-4444-4444-8444-444444444444';
const FRAME_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_ID = '66666666-6666-4666-8666-666666666666';

/** The seeded Black Frame: nothing in the flat column, +40% in the modifier. */
function blackFrameRow() {
  return {
    id: FRAME_ID,
    priceModifier: '1.40',
    priceAddition: '0.00',
    isActive: true,
  };
}

function cartRow() {
  return { id: CART_ID, userId: USER_ID, sessionId: null, isActive: true };
}

/**
 * The select sequence `POST /items` walks: product, variant, frame, the user's
 * cart (getOrCreateCart), the existing-line lookup, then updateCartTotals'
 * aggregate.
 */
function postSelects(frameRow: Record<string, unknown> | null, price = '2000.00') {
  selectMock
    .mockReturnValueOnce(chain([{ id: PRODUCT_ID, status: 'active' }]))
    .mockReturnValueOnce(
      chain([{ id: VARIANT_ID, price, isInStock: true, stockQuantity: 10 }])
    );
  if (frameRow) selectMock.mockReturnValueOnce(chain([frameRow]));
  selectMock
    .mockReturnValueOnce(chain([cartRow()])) // getOrCreateCart
    .mockReturnValueOnce(chain([])) // no existing line
    .mockReturnValue(chain([{ itemCount: 1, subtotal: '2800.00' }]));
}

function addItem(body: Record<string, unknown>) {
  return app.request('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      quantity: 1,
      ...body,
    }),
  });
}

/** The row the route actually wrote into `cart_items`. */
function insertedLine(): Record<string, unknown> {
  const line = valueCalls.find((values) => 'lineTotal' in values);
  expect(line, 'no cart_items row was inserted').toBeDefined();
  return line!;
}

beforeEach(() => {
  vi.clearAllMocks();
  valueCalls.length = 0;
  setCalls.length = 0;
  selectMock.mockReturnValue(chain([]));
  updateMock.mockReturnValue(chain([]));
  insertMock.mockReturnValue(chain([{ id: ITEM_ID }]));
  getSessionMock.mockResolvedValue({ user: { id: USER_ID, email: 'a@b.c' } });
});

// ============================================================================
// POST /api/cart/items
// ============================================================================

describe('POST /api/cart/items — framed lines', () => {
  it('prices the frame off priceModifier, not the empty flat column', async () => {
    postSelects(blackFrameRow());

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    const line = insertedLine();
    // A 2,000 poster in a +40% frame: the buy panel quotes 2,800, so the row
    // has to be written at 2,800. Reading `priceAddition` alone wrote
    // `framePrice: '0.00'` and `lineTotal: '2000.00'` here.
    expect(line.framePrice).toBe('800.00');
    expect(line.lineTotal).toBe('2800.00');
    expect(line.unitPrice).toBe('2000.00');
  });

  it('multiplies the framed line total by the quantity', async () => {
    postSelects(blackFrameRow());

    const response = await addItem({ frameId: FRAME_ID, quantity: 3 });

    expect(response.status).toBe(201);
    expect(insertedLine().lineTotal).toBe('8400.00');
  });

  it('rounds the addition to the rupee, the way the storefront quotes it', async () => {
    // 2,499 at +33% is 824.67. The quickview quotes `Math.round(...)` — 825 —
    // and the panel has to agree with the row to the paisa or the drawer
    // visibly re-prices itself when the write lands.
    postSelects({ ...blackFrameRow(), priceModifier: '1.33' }, '2499.00');

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    expect(insertedLine().framePrice).toBe('825.00');
    expect(insertedLine().lineTotal).toBe('3324.00');
  });

  it('adds a flat priceAddition on top of the percentage', async () => {
    postSelects({ ...blackFrameRow(), priceAddition: '150.00' });

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    expect(insertedLine().framePrice).toBe('950.00');
  });

  it('charges nothing extra for a frame that does not mark the piece up', async () => {
    // The rolled-canvas row: `1.00` means the piece as it is.
    postSelects({ ...blackFrameRow(), priceModifier: '1.00' });

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    expect(insertedLine().framePrice).toBe('0.00');
    expect(insertedLine().lineTotal).toBe('2000.00');
  });

  it('leaves an unframed line at the bare poster price', async () => {
    postSelects(null);

    const response = await addItem({});

    expect(response.status).toBe(201);
    expect(insertedLine().framePrice).toBe('0.00');
    expect(insertedLine().lineTotal).toBe('2000.00');
  });

  it('sums the quantity onto an existing framed line at the framed rate', async () => {
    selectMock
      .mockReturnValueOnce(chain([{ id: PRODUCT_ID, status: 'active' }]))
      .mockReturnValueOnce(
        chain([
          { id: VARIANT_ID, price: '2000.00', isInStock: true, stockQuantity: 10 },
        ])
      )
      .mockReturnValueOnce(chain([blackFrameRow()]))
      .mockReturnValueOnce(chain([cartRow()]))
      .mockReturnValueOnce(
        chain([
          {
            id: ITEM_ID,
            quantity: 1,
            cartId: CART_ID,
            unitPrice: '2000.00',
            framePrice: '800.00',
            lineTotal: '2800.00',
          },
        ])
      )
      .mockReturnValue(chain([{ itemCount: 2, subtotal: '5600.00' }]));

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    // The dedupe branch writes through `.set(...)`, not `.values(...)`, and it
    // recomputes the line total from the same frame price — 2 x 2,800.
    expect(setCalls[0]).toMatchObject({
      quantity: 2,
      unitPrice: '2000.00',
      framePrice: '800.00',
      lineTotal: '5600.00',
    });
  });

  it('prices a re-add off the row\'s own stored unit price, not a variant price that moved since', async () => {
    // The line was added at 2,000. The catalogue has since moved the variant
    // to 2,500. Re-adding the same product+variant+frame must price off what
    // is on the row — the way PATCH already does at cart.ts:936 — not off the
    // variant's current price, or the written lineTotal stops being a number
    // its own stored unitPrice/framePrice can produce.
    selectMock
      .mockReturnValueOnce(chain([{ id: PRODUCT_ID, status: 'active' }]))
      .mockReturnValueOnce(
        chain([
          { id: VARIANT_ID, price: '2500.00', isInStock: true, stockQuantity: 10 },
        ])
      )
      .mockReturnValueOnce(chain([blackFrameRow()]))
      .mockReturnValueOnce(chain([cartRow()]))
      .mockReturnValueOnce(
        chain([
          {
            id: ITEM_ID,
            quantity: 1,
            cartId: CART_ID,
            unitPrice: '2000.00',
            framePrice: '800.00',
            lineTotal: '2800.00',
          },
        ])
      )
      .mockReturnValue(chain([{ itemCount: 2, subtotal: '5600.00' }]));

    const response = await addItem({ frameId: FRAME_ID });

    expect(response.status).toBe(201);
    const written = setCalls[0];
    const unitPrice = parseFloat(written.unitPrice as string);
    const framePrice = parseFloat(written.framePrice as string);
    const quantity = written.quantity as number;
    // The invariant: whatever ends up on the row, lineTotal has to be
    // reproducible from the row's own other columns.
    expect(parseFloat(written.lineTotal as string)).toBeCloseTo(
      (unitPrice + framePrice) * quantity
    );
    // Pinned: the row keeps the 2,000 + 800 it was added at, not a reprice
    // to the 2,500 variant that's current now.
    expect(written).toMatchObject({
      quantity: 2,
      unitPrice: '2000.00',
      framePrice: '800.00',
      lineTotal: '5600.00',
    });
  });
});

// ============================================================================
// PATCH /api/cart/items/:id
// ============================================================================

describe('PATCH /api/cart/items/:id — changing the frame', () => {
  function existingLine(overrides: Record<string, unknown> = {}) {
    return {
      cartItem: {
        id: ITEM_ID,
        cartId: CART_ID,
        quantity: 1,
        unitPrice: '2000.00',
        framePrice: '0.00',
        lineTotal: '2000.00',
        ...overrides,
      },
      cart: cartRow(),
    };
  }

  function patch(body: Record<string, unknown>) {
    return app.request(`/api/cart/items/${ITEM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('prices a newly chosen frame off priceModifier', async () => {
    selectMock
      .mockReturnValueOnce(chain([existingLine()])) // the line + its cart
      .mockReturnValueOnce(chain([blackFrameRow()])) // the new frame
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2800.00' }]));

    const response = await patch({ frameId: FRAME_ID });

    expect(response.status).toBe(200);
    // Same trap as the POST path: `priceAddition` alone left this at '0.00'
    // and the line total unchanged, so adding a frame to a cart line was free.
    expect(setCalls[0]).toMatchObject({
      frameId: FRAME_ID,
      framePrice: '800.00',
      lineTotal: '2800.00',
    });
  });

  it('re-prices the frame against the line s own stored unit price', async () => {
    // The variant may have moved since; the line has not. The frame is a
    // percentage OF THIS LINE.
    selectMock
      .mockReturnValueOnce(
        chain([
          existingLine({ unitPrice: '1000.00', lineTotal: '1000.00' }),
        ])
      )
      .mockReturnValueOnce(chain([blackFrameRow()]))
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '1400.00' }]));

    const response = await patch({ frameId: FRAME_ID });

    expect(response.status).toBe(200);
    expect(setCalls[0]).toMatchObject({ framePrice: '400.00', lineTotal: '1400.00' });
  });

  it('drops the frame price back to zero when the frame is removed', async () => {
    selectMock
      .mockReturnValueOnce(
        chain([existingLine({ framePrice: '800.00', lineTotal: '2800.00' })])
      )
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2000.00' }]));

    const response = await patch({ frameId: null });

    expect(response.status).toBe(200);
    expect(setCalls[0]).toMatchObject({
      frameId: null,
      framePrice: '0.00',
      lineTotal: '2000.00',
    });
  });

  it('keeps the framed rate when only the quantity changes', async () => {
    selectMock
      .mockReturnValueOnce(
        chain([existingLine({ framePrice: '800.00', lineTotal: '2800.00' })])
      )
      .mockReturnValue(chain([{ itemCount: 2, subtotal: '5600.00' }]));

    const response = await patch({ quantity: 2 });

    expect(response.status).toBe(200);
    expect(setCalls[0]).toMatchObject({ quantity: 2, lineTotal: '5600.00' });
  });
});
