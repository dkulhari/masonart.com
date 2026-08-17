/**
 * No admin screen may open a native dialog (#625, widened from #604).
 *
 * `alert`, `prompt` and `confirm` all block the page's event loop. A run that
 * clicks a Delete, Cancel or Refund control stops dead until a human dismisses
 * the dialog, which is why none of the destructive admin flows could be driven
 * end-to-end before this ticket. Being a rule stated in prose was not enough:
 * `reviews.tsx` carried a comment about this exact hazard and called
 * `confirm()` three times anyway. So it is a test.
 *
 * Two things this guard has to get right to stay useful:
 *
 * 1. **Comments and strings are not calls.** Every file that explains why the
 *    ban exists mentions the banned names, this one included. A guard that
 *    cannot tell prose from code makes documenting the rule impossible — #604's
 *    fix had to reword a comment to get past the narrower version of it.
 * 2. **`onConfirm(`, `confirmLabel`, `setAlert(` are innocent.** A guard that
 *    fires on those gets suppressed rather than fixed, and a suppressed guard
 *    guards nothing. The fixtures at the bottom pin both directions.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN_TREES = [
  join(process.cwd(), 'app/routes/admin'),
  join(process.cwd(), 'app/components/admin'),
]

/**
 * Bare or `window.`-qualified, and only these three names. The lookbehind stops
 * `setAlert(` and `onConfirm(` matching on their tails; `\bwindow\.` is spelled
 * out so `props.confirm(` — a caller's own callback — is not swept up either.
 */
const NATIVE_DIALOG = /(?<![\w$.])(?:window\.)?(?:alert|prompt|confirm)\s*\(/

/**
 * Comments and string literals stripped before matching, so prose about the
 * ban is not itself a violation. Deliberately not a parser: a regex that eats
 * `/* *\/`, `//` and quoted runs is enough to tell an explanation from a call,
 * and the fixtures below prove the cases that matter.
 */
export function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : []
  })
}

describe('admin screens and native dialogs', () => {
  it('opens no native dialog anywhere under the admin tree', () => {
    const offenders = ADMIN_TREES.flatMap(walk)
      .filter((file) => NATIVE_DIALOG.test(stripCommentsAndStrings(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })

  it('covers both trees, so the walk cannot silently stop finding files', () => {
    const files = ADMIN_TREES.flatMap(walk)

    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.includes('/routes/admin/'))).toBe(true)
    expect(files.some((file) => file.includes('/components/admin/'))).toBe(true)
  })
})

describe('the guard itself', () => {
  const flags = (source: string) => NATIVE_DIALOG.test(stripCommentsAndStrings(source))

  it('catches the calls it exists to catch', () => {
    expect(flags('if (!confirm("sure?")) return')).toBe(true)
    expect(flags('const v = window.confirm("sure?")')).toBe(true)
    expect(flags('const s = prompt("status:")')).toBe(true)
    expect(flags('alert("coming soon")')).toBe(true)
    expect(flags('  window.alert ("spaced")')).toBe(true)
  })

  it('leaves innocent names alone, so it does not get suppressed', () => {
    expect(flags('setAlert("failed to save")')).toBe(false)
    expect(flags('onConfirm(order)')).toBe(false)
    expect(flags('const { confirmLabel } = request')).toBe(false)
    expect(flags('const confirmed = await confirmAction({})')).toBe(false)
    expect(flags('await promptForValues({ fields })')).toBe(false)
  })

  it('reads prose about the ban as prose', () => {
    expect(flags('// never call confirm( here')).toBe(false)
    expect(flags('/* the old code called prompt() for the status */')).toBe(false)
    expect(flags('const message = "we used to alert() at this point"')).toBe(false)
  })
})
