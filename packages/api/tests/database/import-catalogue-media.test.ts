import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const buildProductMedia = vi.fn()
vi.mock('../../src/lib/product-media', () => ({ buildProductMedia }))

import { resolveMedia, importCatalogue } from '../../src/database/import-catalogue'

const mediaDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-catalogue-'))
  writeFileSync(join(dir, 'sa126-main.webp'), 'x')
  writeFileSync(join(dir, 'sa126-room-0.webp'), 'x')
  return dir
}

beforeEach(() => buildProductMedia.mockReset())

describe('resolveMedia', () => {
  it('resolves the main image and every room mockup against the media dir', () => {
    const dir = mediaDir()

    const resolved = resolveMedia(
      { mainImage: 'sa126-main.webp', roomImages: ['sa126-room-0.webp'] },
      dir
    )

    expect(resolved.files.map((f) => f.type)).toEqual(['main', 'room-mockup'])
    expect(resolved.missing).toEqual([])
  })

  it('reports a missing file rather than resolving a path that is not there', () => {
    const dir = mediaDir()

    const resolved = resolveMedia(
      { mainImage: 'sa126-main.webp', roomImages: ['sa126-room-9.webp'] },
      dir
    )

    expect(resolved.missing).toEqual(['sa126-room-9.webp'])
  })
})

describe('importCatalogue --dry-run', () => {
  it('validates without processing any media', async () => {
    const dir = mediaDir()

    const report = await importCatalogue({
      manifest: 'sku,title,slug,basePrice,orientation,mainImage,roomImages,altText\nABS-001,Cosmic Harmony,cosmic-harmony,1499.00,portrait,sa126-main.webp,sa126-room-0.webp,Art',
      mediaDir: dir,
      dryRun: true,
    })

    expect(buildProductMedia).not.toHaveBeenCalled()
    expect(report.created).toBe(0)
    expect(report.validated).toBe(1)
    expect(report.failures).toEqual([])
  })

  it('fails a row whose media is missing, without aborting the run', async () => {
    const dir = mediaDir()

    const report = await importCatalogue({
      manifest:
        'sku,title,slug,basePrice,orientation,mainImage,roomImages,altText\n' +
        'BAD-1,Gone,gone,999.00,portrait,missing-main.webp,,Art\n' +
        'ABS-001,Cosmic Harmony,cosmic-harmony,1499.00,portrait,sa126-main.webp,,Art',
      mediaDir: dir,
      dryRun: true,
    })

    expect(report.failures).toHaveLength(1)
    expect(report.failures[0].sku).toBe('BAD-1')
    expect(report.validated).toBe(1)
  })
})
