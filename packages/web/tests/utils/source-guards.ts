/**
 * Helpers for the source-level guards — the tests that read a file as text and
 * assert something about what it does.
 *
 * Those guards exist because some couplings are invisible to the type system:
 * a native dialog blocking the E2E harness (#625), an auth guard appearing on a
 * page that must stay open to guests (#477), a design token quietly bypassed.
 * They all share one failure mode: a file that EXPLAINS the rule mentions the
 * thing the rule bans, and a naive matcher flags the explanation. That makes
 * documenting the rule impossible, and a guard nobody can document beside the
 * code it governs gets deleted rather than fixed — #604 had to reword a comment
 * to get past one, and #627 was two guards firing at prose.
 */

/**
 * Blank out comments and string literals so a matcher reads code, not prose.
 *
 * Deliberately not a parser. A regex that eats block comments, line comments
 * and quoted runs is enough to tell an explanation from a call, and every
 * caller pins the cases it cares about with fixtures. Two known limits, neither
 * of which has bitten yet: a `//` inside a string literal takes the rest of the
 * line with it, and template literals are emptied whole rather than preserving
 * their `${}` expressions.
 */
export function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}
