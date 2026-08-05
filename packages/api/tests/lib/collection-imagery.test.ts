/**
 * Which artwork stands in for a collection that has no image of its own.
 *
 * #410 established the rule and #406 the mechanism: a chip borrows the main
 * image of a representative product, and each product may stand for at most
 * one chip — otherwise the rail shows the same picture two or three times,
 * because products carry several facet values and every collection they
 * qualify for picks them independently.
 *
 * The assignment is pure and lives apart from the query so it can be asserted
 * without a database. It is also the part most likely to be got subtly wrong:
 * greedy assignment in the wrong order starves the collections that have the
 * least to choose from.
 */

import { describe, it, expect } from 'vitest';
import { assignRepresentatives } from '../../src/lib/collection-imagery';

const candidate = (productId: string, image = `${productId}.jpg`) => ({
  productId,
  image,
  orientation: 'square' as const,
});

describe('assignRepresentatives', () => {
  it('gives each collection its top candidate when nothing is contested', () => {
    const assigned = assignRepresentatives(
      new Map([
        ['a', [candidate('p1'), candidate('p2')]],
        ['b', [candidate('p3')]],
      ]),
      new Map([
        ['a', 10],
        ['b', 4],
      ])
    );

    expect(assigned.get('a')?.productId).toBe('p1');
    expect(assigned.get('b')?.productId).toBe('p3');
  });

  it('never hands one product to two collections', () => {
    const assigned = assignRepresentatives(
      new Map([
        ['a', [candidate('shared'), candidate('p2')]],
        ['b', [candidate('shared'), candidate('p3')]],
      ]),
      new Map([
        ['a', 10],
        ['b', 10],
      ])
    );

    const chosen = [...assigned.values()].map((row) => row.productId);
    expect(new Set(chosen).size).toBe(chosen.length);
  });

  it('lets the scarcest collection pick first', () => {
    // 'small' has exactly one candidate. If 'big' picks first it takes the
    // shared product and 'small' is left with a duplicate — the failure this
    // ordering exists to prevent.
    const assigned = assignRepresentatives(
      new Map([
        ['big', [candidate('shared'), candidate('spare')]],
        ['small', [candidate('shared')]],
      ]),
      new Map([
        ['big', 40],
        ['small', 1],
      ])
    );

    expect(assigned.get('small')?.productId).toBe('shared');
    expect(assigned.get('big')?.productId).toBe('spare');
  });

  it('breaks ties deterministically so the rail does not shuffle', () => {
    // A chip that changes picture between two identical requests reads as a
    // bug even when both pictures are valid.
    const build = () =>
      assignRepresentatives(
        new Map([
          ['b', [candidate('shared'), candidate('p2')]],
          ['a', [candidate('shared'), candidate('p3')]],
        ]),
        new Map([
          ['a', 5],
          ['b', 5],
        ])
      );

    expect([...build().entries()]).toEqual([...build().entries()]);
  });

  it('reuses a taken product rather than dropping the collection', () => {
    // A duplicate picture is a smaller failure than a collection missing from
    // the rail entirely — #406's judgement, kept.
    const assigned = assignRepresentatives(
      new Map([
        ['a', [candidate('only')]],
        ['b', [candidate('only')]],
      ]),
      new Map([
        ['a', 3],
        ['b', 3],
      ])
    );

    expect(assigned.size).toBe(2);
  });

  it('finds a free candidate when only the head of the shortlist is taken', () => {
    // Caught live: `new` and `best-selling` both resolve to the whole
    // catalogue, so their shortlists are identical AND overlap every style
    // collection's. With a shortlist shorter than the number of collections
    // competing, both ran out and fell back to the same claimed product —
    // three chips, one picture. The shortlist has to be deep enough that a
    // collection cannot lose every candidate to the ones that picked first.
    const deep = Array.from({ length: 6 }, (_, i) => candidate(`p${i}`));
    const assigned = assignRepresentatives(
      new Map([
        ['s1', [candidate('p0')]],
        ['s2', [candidate('p1')]],
        ['s3', [candidate('p2')]],
        ['big-a', deep],
        ['big-b', deep],
      ]),
      new Map([
        ['s1', 1],
        ['s2', 1],
        ['s3', 1],
        ['big-a', 40],
        ['big-b', 40],
      ])
    );

    const chosen = [...assigned.values()].map((row) => row.productId);
    expect(new Set(chosen).size).toBe(chosen.length);
  });

  it('skips a collection with no candidates at all', () => {
    const assigned = assignRepresentatives(
      new Map([['empty', []]]),
      new Map([['empty', 0]])
    );
    expect(assigned.has('empty')).toBe(false);
  });
});
