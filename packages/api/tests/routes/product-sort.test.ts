/**
 * Sort options on GET /api/products.
 *
 * Two gaps from the parity analysis §1.3.5, which measured mesonart at nine
 * sort options against our six:
 *
 *   - Best selling had no signal. It does now — order_items carries quantity
 *     and orders carry payment status, so units sold is a real number rather
 *     than an invented ranking. With nothing sold it returns zero for every
 *     product and the tie-break decides; that is the honest result.
 *   - Featured was reachable through the API but nulls-first, and
 *     `featuredOrder` is null on most of the catalogue — so "Featured" would
 *     have led with the products nobody featured.
 *
 * The ninth, "Most relevant", is deliberately absent: on a collection page
 * with no search query there is nothing for relevance to mean.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

const selectMock = vi.fn();
const orderByCalls: unknown[][] = [];

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT_LIST: 'products:list:', PRODUCT: 'products:' },
}));

import { productsApp } from '../../src/routes/products';

const app = new Hono();
app.route('/api/products', productsApp);

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from',
      'where',
      'groupBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ]) {
      chain[key] = () => chain;
    }
    // Captured rather than swallowed: the ordering IS the behaviour here.
    chain.orderBy = (...args: unknown[]) => {
      orderByCalls.push(args);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

/**
 * Drizzle SQL objects keep their literal text in nested chunks, and columns
 * hold a back-reference to their table — so JSON.stringify hits a cycle.
 * Walk the chunks instead, collecting the literal text, column names and
 * bound values.
 */
function renderedSql(clause: unknown, seen = new Set<unknown>()): string {
  if (clause === null || clause === undefined) return '';
  if (typeof clause === 'string') return clause;
  if (typeof clause === 'number' || typeof clause === 'boolean') return String(clause);
  if (Array.isArray(clause)) return clause.map((c) => renderedSql(c, seen)).join(' ');
  if (typeof clause !== 'object') return '';
  if (seen.has(clause)) return '';
  seen.add(clause);

  const node = clause as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['queryChunks', 'value', 'name', 'table', 'sql']) {
    if (key in node) {
      // `table` is the cycle: take its name only, never recurse into it.
      if (key === 'table') {
        const table = node.table as Record<string, unknown> | undefined;
        const symbols = table ? Object.getOwnPropertySymbols(table) : [];
        for (const symbol of symbols) {
          const value = (table as Record<symbol, unknown>)[symbol];
          if (typeof value === 'string') parts.push(value);
        }
        continue;
      }
      parts.push(renderedSql(node[key], seen));
    }
  }
  return parts.join(' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  queueSelects([{ count: 0 }], []);
});

describe('sortBy vocabulary', () => {
  it('accepts salesCount', async () => {
    const res = await app.request('/api/products?sortBy=salesCount&sortOrder=desc');
    expect(res.status).toBe(200);
  });

  it('still accepts the six that already shipped', async () => {
    for (const sortBy of ['createdAt', 'updatedAt', 'title', 'basePrice', 'featuredOrder']) {
      const res = await app.request(`/api/products?sortBy=${sortBy}`);
      expect(res.status).toBe(200);
    }
  });

  it('rejects a sortBy outside the enum', async () => {
    const res = await app.request('/api/products?sortBy=vibes');
    expect(res.status).toBe(400);
  });
});

describe('Featured sort', () => {
  it('does not float null featuredOrder to the top', async () => {
    await app.request('/api/products?sortBy=featuredOrder&sortOrder=asc');
    const clauses = orderByCalls.at(-1) ?? [];
    expect(renderedSql(clauses)).toContain('nulls last');
  });

  it('applies nulls last in the descending direction too', async () => {
    await app.request('/api/products?sortBy=featuredOrder&sortOrder=desc');
    const clauses = orderByCalls.at(-1) ?? [];
    expect(renderedSql(clauses)).toContain('nulls last');
  });

  it('breaks ties on recency rather than leaving them to the planner', async () => {
    await app.request('/api/products?sortBy=featuredOrder&sortOrder=asc');
    expect((orderByCalls.at(-1) ?? []).length).toBe(2);
  });
});

describe('Best selling sort', () => {
  it('orders by the pin, then real units, then the featured fallback', async () => {
    await app.request('/api/products?sortBy=salesCount&sortOrder=desc');
    const clauses = orderByCalls.at(-1) ?? [];
    expect(clauses.length).toBe(5);
  });

  it('counts quantity from order_items, not rows', async () => {
    await app.request('/api/products?sortBy=salesCount');
    const rendered = renderedSql(orderByCalls.at(-1) ?? []);
    expect(rendered).toContain('quantity');
    expect(rendered).toContain('order_items');
  });

  it('excludes cancelled, refunded and failed orders from the count', async () => {
    await app.request('/api/products?sortBy=salesCount');
    const rendered = renderedSql(orderByCalls.at(-1) ?? []);
    expect(rendered).toContain('cancelled');
    expect(rendered).toContain('refunded');
    expect(rendered).toContain('failed');
  });

  it('requires the order to be paid', async () => {
    await app.request('/api/products?sortBy=salesCount');
    expect(renderedSql(orderByCalls.at(-1) ?? [])).toContain('paid');
  });

  it('coalesces an unsold product to zero rather than dropping it', async () => {
    // An unsold catalogue must still return every product, ordered by the
    // tie-break. NULL here would sort them all to one end at best and
    // exclude them at worst.
    await app.request('/api/products?sortBy=salesCount');
    expect(renderedSql(orderByCalls.at(-1) ?? [])).toContain('coalesce');
  });
});

describe('the other sorts are untouched', () => {
  it('createdAt still orders on one column', async () => {
    await app.request('/api/products?sortBy=createdAt&sortOrder=desc');
    expect((orderByCalls.at(-1) ?? []).length).toBe(1);
  });
});
