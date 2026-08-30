/**
 * Single source of truth for the database connection string.
 *
 * This dev machine runs several projects' postgres side by side — contrack on
 * 5432, surveytrack on 5433, chobii on 5440. Every module used to carry its own
 * hardcoded `localhost:5433` fallback, so anything started without an explicit
 * `DATABASE_URL` quietly connected to a *different application's* database.
 * Suites whose `beforeAll` failed there were reported as skipped, which reads
 * green, and one seed run wrote to the wrong server outright.
 *
 * The rule now: the root `.env` is the only place a developer sets the URL.
 * Resolution order is env var, then root `.env`, then a hard error. There is
 * deliberately no port fallback — guessing is what caused the incidents above.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse as parsePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ResolveOptions {
  /** Environment to read from. Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Directory to begin the upward search for the repo root. */
  startDir?: string
}

/**
 * Parses `.env` contents into a plain object. Deliberately minimal — enough
 * for the `KEY=value` lines this repo actually uses, with no dependency.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()

    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)

    out[key] = value
  }

  return out
}

/**
 * Walks upward from `startDir` looking for the directory that holds both
 * `.env` and `package.json` — the repo root in a checkout that has been set up.
 * Returns null when there is none (fresh clone, CI, published package).
 */
export function findRepoRoot(startDir: string): string | null {
  let dir = startDir
  const { root } = parsePath(dir)

  for (;;) {
    if (existsSync(join(dir, '.env')) && existsSync(join(dir, 'package.json'))) return dir
    if (dir === root) return null
    dir = dirname(dir)
  }
}

function defaultStartDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

function readFromEnvFile(startDir: string): { url?: string; searchedFrom: string } {
  const root = findRepoRoot(startDir)
  if (root === null) return { searchedFrom: startDir }

  const parsed = parseEnvFile(readFileSync(join(root, '.env'), 'utf8'))
  return { url: parsed.DATABASE_URL || undefined, searchedFrom: root }
}

/**
 * Returns the database URL, or throws if it cannot be determined.
 *
 * Never falls back to a guessed host/port — see the module comment.
 */
export function resolveDatabaseUrl(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env
  const startDir = options.startDir ?? defaultStartDir()

  const fromEnv = env.DATABASE_URL
  if (fromEnv) return fromEnv

  const { url, searchedFrom } = readFromEnvFile(startDir)
  if (url) return url

  throw new Error(
    `DATABASE_URL is not set and no DATABASE_URL was found in ${join(searchedFrom, '.env')}.\n` +
      'Set it in the root .env (copy .env.example), or export it for this command.\n' +
      'There is no default: several projects run postgres on this machine and ' +
      'guessing a port connects to the wrong database.',
  )
}

/**
 * Returns the URL for the throwaway `*_test` database, derived from the same
 * single source so the host and port can never drift apart from dev.
 */
export function resolveTestDatabaseUrl(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env

  const explicit = env.TEST_DATABASE_URL
  if (explicit) return explicit

  const devUrl = resolveDatabaseUrl(options)
  return toTestDatabaseName(devUrl)
}

/**
 * Swaps the database name for its `_test` sibling, leaving credentials, host,
 * port and query string untouched. Already-`_test` URLs pass through.
 */
export function toTestDatabaseName(url: string): string {
  const parsed = new URL(url)
  const name = parsed.pathname.replace(/^\//, '')

  if (name.endsWith('_test')) return url

  parsed.pathname = `/${name.replace(/_dev$/, '')}_test`
  return parsed.toString()
}
