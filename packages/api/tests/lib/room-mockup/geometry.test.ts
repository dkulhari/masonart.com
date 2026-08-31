/**
 * Room mockup geometry.
 *
 * Two pure functions carry the design decisions that matter most:
 *
 *   fitIntoBox   — a template's placement rect is a BOUNDING BOX, not a
 *                  stretch target. A poster keeps its own aspect ratio and is
 *                  centred in the box. Stretching would misrepresent the
 *                  product, which is worse than an empty margin.
 *
 *   shadowParams — a single shadow always reads as a sticker pasted onto a
 *                  photo. A tight dark contact shadow plus a wide faint
 *                  ambient one reads as an object with thickness.
 */

import { describe, it, expect } from 'vitest';
import { fitIntoBox, shadowParams } from '../../../src/lib/room-mockup/geometry';

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

describe('shadowParams', () => {
  it('throws the shadow right when the light comes from the left', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'left');

    expect(contact.offsetX).toBeGreaterThan(0);
    expect(ambient.offsetX).toBeGreaterThan(0);
  });

  it('throws the shadow left when the light comes from the right', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'right');

    expect(contact.offsetX).toBeLessThan(0);
    expect(ambient.offsetX).toBeLessThan(0);
  });

  it('always drops the shadow downward, whichever way the light falls', () => {
    expect(shadowParams(1000, 0.024, 'left').contact.offsetY).toBeGreaterThan(0);
    expect(shadowParams(1000, 0.024, 'right').contact.offsetY).toBeGreaterThan(0);
  });

  it('makes the ambient shadow wider and fainter than the contact shadow', () => {
    const { contact, ambient } = shadowParams(1000, 0.024, 'left');

    expect(ambient.blurSigma).toBeGreaterThan(contact.blurSigma);
    expect(ambient.opacity).toBeLessThan(contact.opacity);
  });

  it('scales blur and offset linearly with depth', () => {
    const thin = shadowParams(1000, 0.02, 'left');
    const thick = shadowParams(1000, 0.04, 'left');

    expect(thick.contact.blurSigma).toBeCloseTo(thin.contact.blurSigma * 2, 5);
    expect(thick.ambient.offsetY).toBeCloseTo(thin.ambient.offsetY * 2, 5);
  });

  it('does not change opacity with depth — depth is a size cue, not a darkness cue', () => {
    expect(shadowParams(1000, 0.02, 'left').contact.opacity).toBe(
      shadowParams(1000, 0.06, 'left').contact.opacity
    );
  });

  it('keeps blur above the floor sharp requires, even for a hairline frame', () => {
    expect(shadowParams(10, 0.001, 'left').contact.blurSigma).toBeGreaterThanOrEqual(0.4);
  });
});
