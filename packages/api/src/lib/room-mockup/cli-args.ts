/**
 * CLI contract for generate-room-mockups.
 *
 * Split out from the driver so it can be tested without a filesystem. Unknown
 * flags are an error rather than a shrug: a typo in --templates would
 * otherwise silently render against the default directory.
 */

import type { RoomTemplate } from './templates';

/**
 * The single source of truth for the `--templates` default. Exported so the
 * driver can resolve the "flag omitted" case (see `RunOptions.templates`
 * below) without duplicating the literal.
 */
export const DEFAULT_TEMPLATES_DIR = '.cache/room-templates';

export interface RunOptions {
  posters: string;
  /**
   * `null` means the flag was not supplied at all — the driver resolves that
   * to a repo-root-anchored default. Any string, including one that happens
   * to equal `DEFAULT_TEMPLATES_DIR`, means the caller passed `--templates`
   * explicitly and it stays relative to the caller's own cwd, same as every
   * other flag. Distinguishing these here (rather than folding "omitted"
   * into the default string) is what lets the driver tell them apart.
   */
  templates: string | null;
  out: string;
  only: string[] | null;
  frame: string | null;
  dryRun: boolean;
}

const VALUE_FLAGS = ['--posters', '--templates', '--out', '--only', '--frame'] as const;
const BOOL_FLAGS = ['--dry-run'] as const;

export function parseArgs(argv: string[]): RunOptions {
  const args = argv.slice(2);
  const values = new Map<string, string>();
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    // args[i] is `string | undefined` under noUncheckedIndexedAccess, but the
    // loop bound guarantees it is defined here — narrow so the checks below
    // (Array#includes, Map#set) can take a plain string.
    if (flag === undefined) continue;

    if ((BOOL_FLAGS as readonly string[]).includes(flag)) {
      dryRun = true;
      continue;
    }

    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) {
      throw new Error(`Unknown flag: ${flag}`);
    }

    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Flag ${flag} needs a value.`);
    }

    values.set(flag, value);
    i++;
  }

  const posters = values.get('--posters');
  if (!posters) {
    throw new Error('--posters <dir> is required.');
  }

  const only = values.get('--only');

  return {
    posters,
    templates: values.get('--templates') ?? null,
    out: values.get('--out') ?? './out',
    only: only ? only.split(',').map((s) => s.trim()).filter(Boolean) : null,
    frame: values.get('--frame') ?? null,
    dryRun,
  };
}

/**
 * Narrow the template set to the requested ids, preserving template file order
 * so the contact sheet's numbering is stable across runs.
 */
export function selectTemplates(
  all: RoomTemplate[],
  only: string[] | null
): RoomTemplate[] {
  if (!only) return all;

  const known = new Set(all.map((t) => t.id));
  const missing = only.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`No template with id: ${missing.join(', ')}`);
  }

  const wanted = new Set(only);
  return all.filter((t) => wanted.has(t.id));
}
