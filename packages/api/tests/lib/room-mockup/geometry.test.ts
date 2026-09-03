/**
 * Room mockup geometry.
 *
 * One pure function carries the design decision that matters most:
 *
 *   fitIntoBox   — a template's placement rect is a BOUNDING BOX, not a
 *                  stretch target. A poster keeps its own aspect ratio and is
 *                  centred in the box. Stretching would misrepresent the
 *                  product, which is worse than an empty margin.
 * */

import { describe, it, expect } from 'vitest';
import { fitIntoBox } from '../../../src/lib/room-mockup/geometry';

const FULL = { x: 0, y: 0, w: 1, h: 1 };

describe('fitIntoBox', () => {
  it('preserves a portrait aspect ratio and centres horizontally', () => {
    const placed = fitIntoBox(500, 1000, FULL, 1000, 1000);

    expect(placed.width).toBe(500);
    expect(placed.height).toBe(1000);
    expect(placed.left).toBe(250);
    expect(placed.top).toBe(0);
  });

  it('preserves a landscape aspect ratio and centres vertically', () => {
    const placed = fitIntoBox(1000, 500, FULL, 1000, 1000);

    expect(placed.width).toBe(1000);
    expect(placed.height).toBe(500);
    expect(placed.left).toBe(0);
    expect(placed.top).toBe(250);
  });

  it('scales up to fill a small box and offsets by the box origin', () => {
    const placed = fitIntoBox(100, 100, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1000, 1000);

    expect(placed).toEqual({ left: 250, top: 250, width: 500, height: 500 });
  });

  it('bounds by width when the art is wider than the box', () => {
    const placed = fitIntoBox(2000, 1000, { x: 0, y: 0, w: 0.5, h: 1 }, 1000, 1000);

    expect(placed.width).toBe(500);
    expect(placed.height).toBe(250);
    expect(placed.top).toBe(375);
  });

  it('bounds by height when the art is taller than the box', () => {
    const placed = fitIntoBox(1000, 2000, { x: 0, y: 0, w: 1, h: 0.5 }, 1000, 1000);

    expect(placed.width).toBe(250);
    expect(placed.height).toBe(500);
    expect(placed.left).toBe(375);
  });

  it('never distorts: output aspect matches input aspect', () => {
    const placed = fitIntoBox(1234, 789, { x: 0.1, y: 0.1, w: 0.7, h: 0.6 }, 1600, 1600);

    expect(placed.width / placed.height).toBeCloseTo(1234 / 789, 2);
  });

  it('returns whole pixels', () => {
    const placed = fitIntoBox(333, 777, { x: 0.137, y: 0.211, w: 0.409, h: 0.633 }, 1601, 1601);

    for (const v of [placed.left, placed.top, placed.width, placed.height]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

