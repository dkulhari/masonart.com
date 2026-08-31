/**
 * generate-room-mockups CLI driver.
 *
 * Only the pure, filesystem-free helper is exercised here — findSlugCollisions
 * takes an already-listed filename array and returns a plain Map, no I/O
 * involved. The rest of the driver (main()) is a thin loop over the already-
 * tested lib/room-mockup functions and is guarded behind `import.meta.main`
 * precisely so this file can import it without triggering a real CLI run.
 */

import { describe, it, expect } from 'vitest';
import { findSlugCollisions } from '../../src/database/generate-room-mockups';

describe('findSlugCollisions', () => {
  it('finds nothing when every poster has a distinct basename', () => {
    const collisions = findSlugCollisions(['sunset.jpg', 'lake.png', 'forest.webp']);

    expect(collisions.size).toBe(0);
  });

  it('finds nothing for a single poster', () => {
    expect(findSlugCollisions(['sunset.jpg']).size).toBe(0);
  });

  it('flags two posters whose accepted extensions collapse to the same output slug', () => {
    // sunset.jpg and sunset.png both map to out/sunset/ — POSTER_EXT accepts
    // both extensions, so whichever sorts last would silently overwrite the
    // first poster's entire output folder.
    const collisions = findSlugCollisions(['sunset.jpg', 'sunset.png']);

    expect(collisions.size).toBe(1);
    expect(collisions.get('sunset')).toEqual(['sunset.jpg', 'sunset.png']);
  });

  it('names every file in the colliding group, not just the first', () => {
    const collisions = findSlugCollisions(['lake.jpg', 'lake.jpeg', 'lake.png']);

    expect(collisions.get('lake')).toEqual(['lake.jpg', 'lake.jpeg', 'lake.png']);
  });

  it('reports multiple independent collisions at once', () => {
    const collisions = findSlugCollisions(['sunset.jpg', 'sunset.png', 'lake.jpg', 'lake.webp', 'forest.jpg']);

    expect([...collisions.keys()].sort()).toEqual(['lake', 'sunset']);
  });

  it('treats extension case differences as the same slug (case-insensitive filesystems collide too)', () => {
    const collisions = findSlugCollisions(['sunset.JPG', 'sunset.png']);

    expect(collisions.get('sunset')).toEqual(['sunset.JPG', 'sunset.png']);
  });
});
