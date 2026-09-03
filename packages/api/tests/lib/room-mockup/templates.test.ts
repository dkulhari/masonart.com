/**
 * Frame-render validation.
 *
 * The frame file is typed by a human, so every error here is a typo. The
 * requirement is that each one FAILS LOUDLY and names the offending slug. A
 * silent fallback would render a wrong image that looks plausible, which is
 * the expensive failure.
 */

import { describe, it, expect } from 'vitest';
import { loadFrames } from '../../../src/lib/room-mockup/templates';

const black = {
  widthRatio: 0.028,
  color: [26, 26, 28],
  depthRatio: 0.022,
  widthCm: 1.8,
  depthCm: 3,
};

describe('loadFrames', () => {
  it('accepts a frame with physical dimensions', () => {
    const frames = loadFrames({ black });

    expect(frames.black.depthCm).toBe(3);
    expect(frames.black.widthCm).toBe(1.8);
    expect(frames.black.color).toEqual([26, 26, 28]);
  });

  it('accepts several frames and keeps each by slug', () => {
    const frames = loadFrames({ black, white: { ...black, color: [242, 240, 236] } });

    expect(Object.keys(frames).sort()).toEqual(['black', 'white']);
    expect(frames.white.color[0]).toBe(242);
  });

  it('rejects a frame without widthCm, naming the slug', () => {
    const { widthCm: _w, ...noWidth } = black;

    expect(() => loadFrames({ black: noWidth })).toThrow(/"black".*widthCm/);
  });

  it('rejects a zero depth in cm: even a canvas stands off the wall', () => {
    expect(() => loadFrames({ black: { ...black, depthCm: 0 } })).toThrow(/depthCm/);
  });

  it('rejects a zero depth ratio for the same reason', () => {
    expect(() => loadFrames({ black: { ...black, depthRatio: 0 } })).toThrow(/depthRatio/);
  });

  it('allows widthCm 0 for gallery-wrap', () => {
    const frames = loadFrames({ frameless: { ...black, widthRatio: 0, widthCm: 0 } });

    expect(frames.frameless.widthCm).toBe(0);
  });

  it('rejects an absurd face width', () => {
    expect(() => loadFrames({ black: { ...black, widthCm: 40 } })).toThrow(/widthCm/);
  });

  it('rejects a colour channel out of range, naming the slug', () => {
    expect(() => loadFrames({ oak: { ...black, color: [300, 0, 0] } })).toThrow(/"oak"/);
  });

  it('rejects a non-object frame file', () => {
    expect(() => loadFrames([])).toThrow();
  });
});
