/**
 * CLI argument parsing and template selection.
 *
 * Extracted from the CLI driver so the contract is testable without a
 * filesystem. The driver itself is a thin loop over these results.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPLATES_DIR, parseArgs, selectTemplates } from '../../../src/lib/room-mockup/cli-args';
import type { RoomTemplate } from '../../../src/lib/room-mockup/templates';

const argv = (...args: string[]) => ['bun', 'generate-room-mockups.ts', ...args];

const t = (id: string): RoomTemplate => ({
  id,
  file: `${id}.jpg`,
  placement: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
  light: 'left',
  frame: 'oak',
  label: id,
});

describe('parseArgs', () => {
  it('requires --posters', () => {
    expect(() => parseArgs(argv())).toThrow(/--posters/);
  });

  it('reads --posters and defaults the rest', () => {
    const opts = parseArgs(argv('--posters', './art'));

    expect(opts.posters).toBe('./art');
    // `--templates` omitted entirely -> null, distinct from any string the
    // caller could pass. The driver is what resolves null to a repo-root
    // path; parseArgs itself must not collapse "omitted" into the default
    // string, or an explicit `--templates .cache/room-templates` becomes
    // indistinguishable from not passing the flag at all.
    expect(opts.templates).toBeNull();
    expect(opts.out).toBe('./out');
    expect(opts.only).toBeNull();
    expect(opts.frame).toBeNull();
    expect(opts.dryRun).toBe(false);
  });

  it('reads the optional flags', () => {
    const opts = parseArgs(
      argv('--posters', './art', '--templates', './rooms', '--out', './build', '--dry-run')
    );

    expect(opts.templates).toBe('./rooms');
    expect(opts.out).toBe('./build');
    expect(opts.dryRun).toBe(true);
  });

  it('returns the literal default string when --templates is passed explicitly, not null', () => {
    // Proves the omitted case (null) and an explicit flag that happens to
    // spell out the same default are distinguishable — the bug this fixes
    // was that both collapsed to the same value before the driver could
    // tell them apart.
    const opts = parseArgs(argv('--posters', './art', '--templates', DEFAULT_TEMPLATES_DIR));

    expect(opts.templates).toBe(DEFAULT_TEMPLATES_DIR);
    expect(opts.templates).not.toBeNull();
  });

  it('splits --only on commas and trims', () => {
    const opts = parseArgs(argv('--posters', './art', '--only', 'living-room, nook'));

    expect(opts.only).toEqual(['living-room', 'nook']);
  });

  it('reads a --frame override', () => {
    expect(parseArgs(argv('--posters', './art', '--frame', 'black')).frame).toBe('black');
  });

  it('rejects a flag that expects a value but has none', () => {
    expect(() => parseArgs(argv('--posters'))).toThrow(/--posters/);
  });

  it('rejects an unknown flag rather than ignoring a typo', () => {
    expect(() => parseArgs(argv('--posters', './art', '--postrs', 'x'))).toThrow(/--postrs/);
  });
});

describe('selectTemplates', () => {
  it('returns everything when no subset is requested', () => {
    const all = [t('a'), t('b')];

    expect(selectTemplates(all, null)).toHaveLength(2);
  });

  it('returns only the named templates, in template order', () => {
    const all = [t('a'), t('b'), t('c')];

    expect(selectTemplates(all, ['c', 'a']).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('throws on an id that matches no template, naming it', () => {
    expect(() => selectTemplates([t('a')], ['nope'])).toThrow(/nope/);
  });
});
