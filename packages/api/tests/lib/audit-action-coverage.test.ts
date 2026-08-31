/**
 * Every declared audit action is written by some source file (#671)
 *
 * `AUDIT_ACTIONS` is the guard rail for the audit trail, and its type safety
 * runs one way: a misspelled action at a call site fails typecheck against
 * `AuditAction`, but an action declared with no call site is checked by nothing.
 * Ten of the forty-one declared actions were emitted by no code at all, and the
 * registry described a trail wider than the one that existed.
 *
 * This is the same shape of guard as `tests/database/raw-sql-objects.test.ts`
 * (#663): a manifest of the known exceptions, plus a scan that fails when
 * reality drifts from it, naming what drifted and what to do about it.
 *
 * ## Why a text scan and not a runtime assertion
 *
 * The question is "does the registry describe code that exists", which is a
 * fact about the source, not about a request. A runtime check would only cover
 * actions some fixture happens to exercise, so it would report an action as
 * dead when the truth was that no test called that route — a guard that fails
 * for reasons unrelated to its subject. The text scan also counts an action
 * emitted only on an error branch as wired, which is correct: `qc_rejected` and
 * `transition_refused` are refusals by definition.
 *
 * The cost of that choice is stated where the waivers live: presence is not
 * reachability. See `audit-action-waivers.ts`.
 *
 * ## Why comments are stripped before matching
 *
 * The registry's own prose names actions it is explaining, and route files
 * carry doc comments that quote the action they are about. Counting a comment
 * as an emitter would let this test pass on a file that documents an action it
 * no longer writes — the exact failure mode the guard exists to catch, one
 * level up.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';

import { AUDIT_ACTIONS } from '@chobii/shared';

import {
  DEAD_AUDIT_ACTION_WAIVERS,
  deadAuditActionsMessage,
  staleAuditWaiversMessage,
  type DeadAuditActionWaiver,
} from './audit-action-waivers';

const API_SRC = resolve(__dirname, '../../src');

/** Every TypeScript source file under packages/api/src. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

/**
 * Source text with comments removed.
 *
 * The `://` carve-out keeps a URL in a string literal from swallowing the rest
 * of its line — `https://cdn...` is not a comment, and eating the remainder of
 * that line could hide a real emitter sitting after it.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES: { file: string; code: string }[] = sourceFiles(API_SRC).map((file) => ({
  file: relative(API_SRC, file),
  code: withoutComments(readFileSync(file, 'utf8')),
}));

/** The files that write `action` as a string literal, in code rather than prose. */
function filesWriting(action: string): string[] {
  const literal = new RegExp(`['"\`]${action.replace(/\./g, '\\.')}['"\`]`);

  return SOURCES.filter(({ code }) => literal.test(code)).map(({ file }) => file);
}

const waived = new Set(DEAD_AUDIT_ACTION_WAIVERS.map((waiver) => waiver.action));

describe('the audit action registry describes code that exists', () => {
  it('scans the api source tree at all', () => {
    // A broken walk would report every action dead, which is loud. A walk that
    // silently found nothing to read is the failure that would look like a
    // pass if the rest of this suite were ever narrowed to a subset.
    expect(SOURCES.length).toBeGreaterThan(50);
    expect(SOURCES.some(({ file }) => file === join('lib', 'audit.ts'))).toBe(true);
  });

  it('can tell a written action from an unwritten one', () => {
    // Proves the scan is capable of both answers. If the matcher were ever
    // loosened into matching anything, every assertion below would pass
    // vacuously and the registry would go unguarded with a green build.
    //
    // `admin.request` is the middleware floor, so its emitter's location is a
    // fact worth pinning rather than an arbitrary positive control.
    expect(filesWriting('admin.request')).toContain(join('middleware', 'audit.ts'));
    expect(filesWriting('never_emitted.sentinel_for_671')).toEqual([]);
  });

  it('writes every declared action somewhere under packages/api/src', () => {
    const dead = AUDIT_ACTIONS.filter(
      (action) => !waived.has(action) && filesWriting(action).length === 0
    );

    expect(dead, dead.length === 0 ? '' : deadAuditActionsMessage(dead)).toEqual([]);
  });

  it('waives nothing that is now written', () => {
    const stale: DeadAuditActionWaiver[] = DEAD_AUDIT_ACTION_WAIVERS.filter(
      (waiver) => filesWriting(waiver.action).length > 0
    );

    expect(stale.map((w) => w.action), stale.length === 0 ? '' : staleAuditWaiversMessage(stale)).toEqual(
      []
    );
  });

  it('gives every waiver a reason', () => {
    const unreasoned = DEAD_AUDIT_ACTION_WAIVERS.filter(
      (waiver) => waiver.reason.trim().length < 20
    ).map((waiver) => waiver.action);

    expect(
      unreasoned,
      'every waiver carries a one-line reason naming what is missing — a waiver with no ' +
        'reason is how the list becomes a graveyard (#671)'
    ).toEqual([]);
  });

  it('waives only actions the registry still declares', () => {
    const unknown = DEAD_AUDIT_ACTION_WAIVERS.map((waiver) => waiver.action).filter(
      (action) => !AUDIT_ACTIONS.includes(action)
    );

    expect(
      unknown,
      'waived but no longer in AUDIT_ACTIONS — delete the waiver with the action (#671)'
    ).toEqual([]);
  });
});
