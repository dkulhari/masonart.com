import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findRepoRoot,
  parseEnvFile,
  resolveDatabaseUrl,
  resolveTestDatabaseUrl,
} from '../../src/config/database-url'

/**
 * Builds a throwaway repo-shaped directory: <root>/{.env,package.json} plus a
 * nested package dir to resolve upward from.
 */
function makeRepo(envContents: string | null) {
  const root = mkdtempSync(join(tmpdir(), 'chobii-dburl-'))
  writeFileSync(join(root, 'package.json'), '{"name":"chobii"}')
  if (envContents !== null) writeFileSync(join(root, '.env'), envContents)
  const nested = join(root, 'packages', 'api', 'src', 'config')
  mkdirSync(nested, { recursive: true })
  return { root, nested }
}

const DEV_URL = 'postgresql://poster_app:dev_password@localhost:5440/poster_app_dev'

describe('parseEnvFile', () => {
  it('reads a plain KEY=value line', () => {
    expect(parseEnvFile('DATABASE_URL=postgres://a/b')).toEqual({
      DATABASE_URL: 'postgres://a/b',
    })
  })

  it('ignores comments and blank lines', () => {
    const parsed = parseEnvFile('# a comment\n\nDATABASE_URL=postgres://a/b\n')
    expect(parsed).toEqual({ DATABASE_URL: 'postgres://a/b' })
  })

  it('strips surrounding single or double quotes', () => {
    expect(parseEnvFile('A="one"\nB=\'two\'').A).toBe('one')
    expect(parseEnvFile('A="one"\nB=\'two\'').B).toBe('two')
  })

  it('keeps "=" that appear inside the value', () => {
    expect(parseEnvFile('URL=postgres://u:p@h/db?x=1&y=2').URL).toBe(
      'postgres://u:p@h/db?x=1&y=2',
    )
  })

  it('tolerates a leading "export "', () => {
    expect(parseEnvFile('export DATABASE_URL=postgres://a/b').DATABASE_URL).toBe(
      'postgres://a/b',
    )
  })
})

describe('findRepoRoot', () => {
  it('walks up to the directory holding .env and package.json', () => {
    const { root, nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    expect(findRepoRoot(nested)).toBe(root)
  })

  it('returns null when no such directory exists above the start', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'chobii-orphan-'))
    expect(findRepoRoot(orphan)).toBeNull()
  })
})

describe('resolveDatabaseUrl', () => {
  it('prefers an explicitly set DATABASE_URL over .env', () => {
    const { nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    const url = resolveDatabaseUrl({
      env: { DATABASE_URL: 'postgres://explicit/win' },
      startDir: nested,
    })
    expect(url).toBe('postgres://explicit/win')
  })

  it('falls back to .env when the variable is unset', () => {
    const { nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    expect(resolveDatabaseUrl({ env: {}, startDir: nested })).toBe(DEV_URL)
  })

  it('treats an empty DATABASE_URL as unset', () => {
    const { nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    expect(resolveDatabaseUrl({ env: { DATABASE_URL: '' }, startDir: nested })).toBe(DEV_URL)
  })

  // The whole point of this module: never silently connect to whatever
  // happens to be listening on a guessed port. Several projects run their
  // own postgres on this dev machine.
  it('throws instead of guessing a port when .env is missing', () => {
    const { nested } = makeRepo(null)
    expect(() => resolveDatabaseUrl({ env: {}, startDir: nested })).toThrow(/DATABASE_URL/)
  })

  it('throws when .env exists but has no DATABASE_URL', () => {
    const { nested } = makeRepo('REDIS_URL=redis://localhost:6380')
    expect(() => resolveDatabaseUrl({ env: {}, startDir: nested })).toThrow(/DATABASE_URL/)
  })

  it('names the .env path in the error so the fix is obvious', () => {
    const { root, nested } = makeRepo(null)
    expect(() => resolveDatabaseUrl({ env: {}, startDir: nested })).toThrow(
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })
})

describe('resolveTestDatabaseUrl', () => {
  it('prefers an explicitly set TEST_DATABASE_URL', () => {
    const { nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    const url = resolveTestDatabaseUrl({
      env: { TEST_DATABASE_URL: 'postgres://explicit/test' },
      startDir: nested,
    })
    expect(url).toBe('postgres://explicit/test')
  })

  it('derives the *_test database from the dev URL, keeping host and port', () => {
    const { nested } = makeRepo('DATABASE_URL=' + DEV_URL)
    expect(resolveTestDatabaseUrl({ env: {}, startDir: nested })).toBe(
      'postgresql://poster_app:dev_password@localhost:5440/poster_app_test',
    )
  })

  it('leaves a URL that already targets a *_test database alone', () => {
    const { nested } = makeRepo('DATABASE_URL=postgresql://u:p@localhost:5440/poster_app_test')
    expect(resolveTestDatabaseUrl({ env: {}, startDir: nested })).toBe(
      'postgresql://u:p@localhost:5440/poster_app_test',
    )
  })

  it('preserves query parameters when swapping the database name', () => {
    const { nested } = makeRepo(
      'DATABASE_URL=postgresql://u:p@localhost:5440/poster_app_dev?sslmode=disable',
    )
    expect(resolveTestDatabaseUrl({ env: {}, startDir: nested })).toBe(
      'postgresql://u:p@localhost:5440/poster_app_test?sslmode=disable',
    )
  })
})
