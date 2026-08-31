/**
 * Room template validation.
 *
 * The template file is measured and typed by a human, so every error here is a
 * typo. The requirement is that each one FAILS LOUDLY and names the offending
 * template id. A silent fallback would render a wrong image that looks
 * plausible, which is the expensive failure.
 */

import { describe, it, expect } from 'vitest';
import { loadTemplates } from '../../../src/lib/room-mockup/templates';

const FRAMES = {
  oak: { widthRatio: 0.032, color: [178, 141, 94], depthRatio: 0.024 },
  frameless: { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03 },
};

const template = (over: Record<string, unknown> = {}) => ({
  id: 'living-room-warm',
  file: 'living-room-warm.jpg',
  placement: { x: 0.286, y: 0.047, w: 0.483, h: 0.622 },
  light: 'left',
  frame: 'oak',
  label: 'Living room',
  ...over,
});

const allExist = () => true;

describe('loadTemplates', () => {
  it('accepts a well-formed template set', () => {
    const { templates, frames } = loadTemplates([template()], FRAMES, allExist);

    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('living-room-warm');
    expect(templates[0].placement.w).toBe(0.483);
    expect(frames.oak.depthRatio).toBe(0.024);
  });

  it('rejects a placement outside 0..1, naming the template', () => {
    expect(() => loadTemplates([template({ placement: { x: -0.1, y: 0, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a placement that runs off the right edge', () => {
    expect(() => loadTemplates([template({ placement: { x: 0.7, y: 0, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a placement that runs off the bottom edge', () => {
    expect(() => loadTemplates([template({ placement: { x: 0, y: 0.7, w: 0.5, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a zero-width placement', () => {
    expect(() => loadTemplates([template({ placement: { x: 0, y: 0, w: 0, h: 0.5 } })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects an unknown light direction', () => {
    expect(() => loadTemplates([template({ light: 'above' })], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects a frame slug with no render spec, naming both the template and the slug', () => {
    expect(() => loadTemplates([template({ frame: 'walnut' })], FRAMES, allExist))
      .toThrow(/living-room-warm.*walnut|walnut.*living-room-warm/);
  });

  it('rejects a template whose image file is missing, naming the file', () => {
    expect(() => loadTemplates([template()], FRAMES, () => false))
      .toThrow(/living-room-warm\.jpg/);
  });

  it('rejects duplicate template ids', () => {
    expect(() => loadTemplates([template(), template()], FRAMES, allExist))
      .toThrow(/living-room-warm/);
  });

  it('rejects an empty template set rather than rendering nothing silently', () => {
    expect(() => loadTemplates([], FRAMES, allExist)).toThrow(/no room templates/i);
  });

  it('accepts a frameless spec with widthRatio 0', () => {
    const { templates } = loadTemplates([template({ frame: 'frameless' })], FRAMES, allExist);

    expect(templates[0].frame).toBe('frameless');
  });

  it('rejects a frame render whose colour channel is out of range', () => {
    const bad = { oak: { widthRatio: 0.03, color: [300, 0, 0], depthRatio: 0.02 } };

    expect(() => loadTemplates([template()], bad, allExist)).toThrow(/oak/);
  });

  it('rejects a frame render with zero depth — every hung object stands off the wall', () => {
    const bad = { oak: { widthRatio: 0.03, color: [1, 2, 3], depthRatio: 0 } };

    expect(() => loadTemplates([template()], bad, allExist)).toThrow(/oak/);
  });
});
