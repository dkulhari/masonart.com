/**
 * Seed media directory resolution — #450.
 *
 * The defaults in seed-images.ts were anchored to process.cwd(), so which
 * directory you invoked the seed from decided whether the catalogue got the
 * reference imagery. The package's own script — `bun run seed` in
 * packages/api — runs with cwd at the package root, resolving to
 * packages/api/.cache/seed-media, which does not exist. localSeedMediaSet
 * reads an empty set as "no local media, use the declared URLs", so the run
 * succeeded and quietly seeded 41 products from stock photo URLs.
 *
 * These assert the defaults are cwd-independent. Vitest runs from
 * packages/api, so a cwd-relative default fails them the same way the seed
 * script did.
 *
 * Neither vitest.config.ts nor tests/setup.ts sets SEED_MEDIA_DIR, so these
 * exercise the default rather than an override.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

const { SEED_MEDIA_DIR, SEED_IMAGE_CACHE_DIR, summarizeLocalSeedMedia } =
  await import('../../src/database/seed-images')

describe('SEED_MEDIA_DIR', () => {
  it('resolves to the repo root, not the caller cwd', () => {
    expect(SEED_MEDIA_DIR).toBe(join(REPO_ROOT, '.cache', 'seed-media'))
  })

  it('does not land under packages/api when invoked from packages/api', () => {
    expect(SEED_MEDIA_DIR).not.toContain(join('packages', 'api', '.cache'))
  })

  it('still honours an explicit SEED_MEDIA_DIR override', async () => {
    const override = await mkdtemp(join(tmpdir(), 'seed-media-override-'))
    process.env.SEED_MEDIA_DIR = override
    vi.resetModules()
    try {
      const fresh = await import('../../src/database/seed-images')
      expect(fresh.SEED_MEDIA_DIR).toBe(override)
    } finally {
      delete process.env.SEED_MEDIA_DIR
      vi.resetModules()
    }
  })
})

describe('SEED_IMAGE_CACHE_DIR', () => {
  it('resolves to the repo root, not the caller cwd', () => {
    expect(SEED_IMAGE_CACHE_DIR).toBe(join(REPO_ROOT, '.cache', 'seed-images'))
  })
})

describe('summarizeLocalSeedMedia', () => {
  it('counts the prefixes that resolved to a main file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seed-media-'))
    await writeFile(join(dir, 'aa-main.webp'), 'x')

    expect(summarizeLocalSeedMedia(['aa', 'bb', 'cc'], dir)).toEqual({
      resolved: 1,
      total: 3,
      dir,
    })
  })

  it('reports every prefix unresolved when the directory is absent', () => {
    const dir = join(tmpdir(), 'seed-media-absent-450')

    expect(summarizeLocalSeedMedia(['aa', 'bb'], dir)).toEqual({
      resolved: 0,
      total: 2,
      dir,
    })
  })

  it('defaults to SEED_MEDIA_DIR when no directory is given', () => {
    expect(summarizeLocalSeedMedia([]).dir).toBe(SEED_MEDIA_DIR)
  })
})
