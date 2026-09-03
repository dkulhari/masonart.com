/**
 * Room scene validation.
 *
 * The scene file is measured by a person clicking four corners and typing a
 * handful of numbers. Every plausible mistake has to FAIL LOUDLY on load and
 * name the scene, because every one of them still renders an image if it is
 * let through — and a mirrored, mis-scaled or clipped poster looks like a
 * perfectly good photograph.
 */

import { describe, it, expect } from 'vitest';
import {
  loadRoomScene,
  loadRoomScenes,
  nearSideForYaw,
} from '../../../src/lib/room-mockup/scene';

const scene = (over: Record<string, unknown> = {}) => ({
  id: 'room-01',
  image: 'room-01.png',
  imageSize: [2048, 2048],
  wall: {
    quad: { tl: [0.18, 0.09], tr: [0.79, 0.14], br: [0.79, 0.71], bl: [0.18, 0.78] },
    widthCm: 320,
    heightCm: 260,
  },
  anchor: { x: 0.5, y: 0.42 },
  allowable: { maxWidthCm: 120, maxHeightCm: 150, minMarginCm: 25 },
  view: { yawDeg: -25 },
  light: { direction: 'left', elevationDeg: 35, softness: 0.6, strength: 0.45 },
  ...over,
});

const exists = () => true;

const load = (over: Record<string, unknown> = {}, minPosterPx?: number) =>
  loadRoomScene(scene(over), { imageExists: exists, minPosterPx });

describe('nearSideForYaw', () => {
  it('derives the near side from the sign', () => {
    expect(nearSideForYaw(-25)).toBe('left');
    expect(nearSideForYaw(25)).toBe('right');
    expect(nearSideForYaw(0)).toBe('none');
    expect(nearSideForYaw(0.2)).toBe('none');
  });
});

describe('loadRoomScene', () => {
  it('accepts the spec example and converts the quad to points', () => {
    const s = load();

    expect(s.id).toBe('room-01');
    expect(s.wall.quad[0]).toEqual({ x: 0.18, y: 0.09 });
    expect(s.wall.quad[2]).toEqual({ x: 0.79, y: 0.71 });
    expect(s.view.nearSide).toBe('left');
    expect(s.label).toBe('room-01');
  });

  it('keeps a declared label', () => {
    expect(load({ label: 'Living room' }).label).toBe('Living room');
  });

  it('accepts a declared nearSide that agrees with the yaw', () => {
    expect(load({ view: { yawDeg: -25, nearSide: 'left' } }).view.nearSide).toBe('left');
  });

  it('rejects an id that is not a slug, naming it', () => {
    expect(() => load({ id: 'Living/Room' })).toThrow(/"Living\/Room"/);
  });

  it('rejects a missing image file', () => {
    expect(() => loadRoomScene(scene(), { imageExists: () => false })).toThrow(/room-01\.png/);
  });

  it('rejects a clockwise quad, because it would mirror the poster', () => {
    const mirrored = {
      ...scene().wall,
      quad: { tl: [0.18, 0.09], tr: [0.18, 0.78], br: [0.79, 0.71], bl: [0.79, 0.14] },
    };

    expect(() => load({ wall: mirrored })).toThrow(/mirror/);
  });

  it('rejects a yaw whose sign disagrees with the quad', () => {
    expect(() => load({ view: { yawDeg: 25 } })).toThrow(/yaw.*left/i);
  });

  it('rejects a declared nearSide that disagrees with the yaw', () => {
    expect(() => load({ view: { yawDeg: -25, nearSide: 'right' } })).toThrow(/nearSide/);
  });

  it('rejects yaw 0 on a quad that is not a rectangle', () => {
    expect(() => load({ view: { yawDeg: 0 } })).toThrow(/straight-on/);
  });

  it('accepts yaw 0 on a rectangle', () => {
    const s = load({
      wall: {
        ...scene().wall,
        quad: { tl: [0.2, 0.1], tr: [0.8, 0.1], br: [0.8, 0.7], bl: [0.2, 0.7] },
      },
      view: { yawDeg: 0 },
    });

    expect(s.view.nearSide).toBe('none');
  });

  it('rejects an anchor whose max poster would cross the margin', () => {
    expect(() => load({ anchor: { x: 0.1, y: 0.42 } })).toThrow(/margin/);
  });

  it('rejects a room whose max poster projects to fewer pixels than the floor', () => {
    expect(() => load({ imageSize: [400, 400] }, 900)).toThrow(/900/);
  });

  it('honours a lower pixel floor for small test rooms', () => {
    expect(() => load({ imageSize: [400, 400] }, 50)).not.toThrow();
  });

  it('rejects a light strength above 1, naming the scene', () => {
    expect(() => load({ light: { ...scene().light, strength: 1.5 } })).toThrow(/"room-01"/);
  });

  it('rejects a corner outside the image', () => {
    const outside = {
      ...scene().wall,
      quad: { tl: [0.18, 0.09], tr: [1.2, 0.14], br: [0.79, 0.71], bl: [0.18, 0.78] },
    };

    expect(() => load({ wall: outside })).toThrow(/"room-01"/);
  });
});

describe('loadRoomScene (poster-box scene)', () => {
  // What tools/room-measure.html writes in "poster box" mode: the four
  // clicks are the poster's own rectangle, so the wall IS the box — anchor at
  // its centre, allowable the whole box, no margin. The loader must accept
  // that boundary case, or the box mode cannot exist. Two rules the tool
  // honours: a yaw-0 box is snapped to a true rectangle, and the box is at
  // least 400 px wide on the image.
  it('accepts a box that is the whole wall with a zero margin', () => {
    const s = load({
      wall: {
        quad: { tl: [0.5, 0.17], tr: [0.75, 0.17], br: [0.75, 0.5], bl: [0.5, 0.5] },
        widthCm: 100,
        heightCm: 133.3333,
      },
      anchor: { x: 0.5, y: 0.5 },
      allowable: { maxWidthCm: 100, maxHeightCm: 133.3333, minMarginCm: 0 },
      view: { yawDeg: 0 },
    });

    expect(s.allowable.minMarginCm).toBe(0);
    expect(s.view.nearSide).toBe('none');
  });

  it('accepts a hand-drawn box with a slight lean when a yaw is declared', () => {
    const s = load({
      wall: {
        quad: { tl: [0.5, 0.17], tr: [0.75, 0.185], br: [0.75, 0.5], bl: [0.5, 0.51] },
        widthCm: 100,
        heightCm: 133.3333,
      },
      anchor: { x: 0.5, y: 0.5 },
      allowable: { maxWidthCm: 100, maxHeightCm: 133.3333, minMarginCm: 0 },
      view: { yawDeg: -20 },
    });

    expect(s.view.nearSide).toBe('left');
  });
});

describe('loadRoomScenes', () => {
  it('rejects duplicate ids', () => {
    expect(() => loadRoomScenes([scene(), scene()], { imageExists: exists })).toThrow(
      /more than once/
    );
  });

  it('rejects an empty list', () => {
    expect(() => loadRoomScenes([], { imageExists: exists })).toThrow(/No room scenes/);
  });

  it('returns scenes in input order', () => {
    const list = loadRoomScenes([scene(), scene({ id: 'room-02' })], { imageExists: exists });

    expect(list.map((s) => s.id)).toEqual(['room-01', 'room-02']);
  });
});
