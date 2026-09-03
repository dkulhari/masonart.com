/**
 * Stage 1 prompt.
 *
 * The room is the one thing in this pipeline that is generated, and the
 * prompt's load-bearing clauses — bare wall, no hard shadows, deep focus —
 * are what make everything after it deterministic. Pin them.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_ROOMS, roomPrompt } from '../../../src/lib/room-mockup/prompt';

describe('roomPrompt', () => {
  it('always carries the load-bearing clauses', () => {
    for (const yaw of [-25, 0, 25]) {
      const { prompt, negative } = roomPrompt(yaw);

      expect(prompt).toMatch(/completely bare, flat wall/);
      expect(prompt).toMatch(/no hard shadows/);
      expect(prompt).toMatch(/f\/8/);
      expect(prompt).toMatch(/nothing hanging on it/);
      expect(negative).toMatch(/\bframe\b/);
      expect(negative).toMatch(/hard shadow/);
      expect(negative).toMatch(/people/);
    }
  });

  it('states the angle and side from the yaw', () => {
    expect(roomPrompt(-25).prompt).toMatch(/25 degrees off-axis to the left/);
    expect(roomPrompt(30).prompt).toMatch(/30 degrees off-axis to the right/);
    expect(roomPrompt(0).prompt).toMatch(/straight on/);
  });

  it('places the furniture the caller asks for', () => {
    expect(roomPrompt(-25, 'a bed with white linen').prompt).toMatch(/a bed with white linen/);
  });
});

describe('DEFAULT_ROOMS', () => {
  it('defines six rooms: two straight, two left, two right, with unique slug ids', () => {
    expect(DEFAULT_ROOMS).toHaveLength(6);
    expect(DEFAULT_ROOMS.filter((r) => r.yawDeg === 0)).toHaveLength(2);
    expect(DEFAULT_ROOMS.filter((r) => r.yawDeg < 0)).toHaveLength(2);
    expect(DEFAULT_ROOMS.filter((r) => r.yawDeg > 0)).toHaveLength(2);
    expect(new Set(DEFAULT_ROOMS.map((r) => r.id)).size).toBe(6);
    for (const r of DEFAULT_ROOMS) expect(r.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('keeps every yaw inside the band the renderer accepts', () => {
    for (const r of DEFAULT_ROOMS) expect(Math.abs(r.yawDeg)).toBeLessThanOrEqual(35);
  });
});
