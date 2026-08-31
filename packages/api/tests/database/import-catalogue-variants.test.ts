import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const buildProductMedia = vi.fn()
vi.mock('../../src/lib/product-media', () => ({ buildProductMedia }))

import {
  buildVariantRows,
  importCatalogue,
} from '../../src/database/import-catalogue'

const mediaDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-catalogue-variants-'))
  writeFileSync(join(dir, 'art-main.webp'), 'x')
  return dir
}

const HEADER = 'sku,title,slug,basePrice,orientation,mainImage,altText'
const manifestFor = (orientation: string, sku = 'ABS-001') =>
  `${HEADER}\n${sku},Art,${sku.toLowerCase()},1499.00,${orientation},art-main.webp,Art`

beforeEach(() => buildProductMedia.mockReset())

describe('buildVariantRows', () => {
  it('gives a portrait product the whole shared ladder', () => {
    const rows = buildVariantRows({
      sku: 'ABS-001',
      orientation: 'portrait',
      basePrice: '1499.00',
    })

    expect(rows).toHaveLength(17)
    expect(rows[0]!.widthInches).toBe(12)
    expect(rows[0]!.heightInches).toBe(16)
    // The smallest step is the product's own entry price, not a markup on it.
    expect(rows[0]!.price).toBe('1499.00')
  })

  it('names each variant so a re-import can find it again', () => {
    const rows = buildVariantRows({
      sku: 'ABS-001',
      orientation: 'portrait',
      basePrice: '1499.00',
    })

    expect(rows[0]!.variantSku).toBe('ABS-001-12x16')
    // Unique within the product — this is what the upsert keys on.
    const skus = rows.map((r) => r.variantSku)
    expect(new Set(skus).size).toBe(rows.length)
  })

  it('turns the ladder for landscape, so the step is wider than it is tall', () => {
    const rows = buildVariantRows({
      sku: 'ABS-002',
      orientation: 'landscape',
      basePrice: '1499.00',
    })

    expect(rows[0]!.widthInches).toBe(16)
    expect(rows[0]!.heightInches).toBe(12)
  })

  it('returns nothing for an orientation the ladder does not cover', () => {
    expect(
      buildVariantRows({
        sku: 'ABS-003',
        orientation: 'round',
        basePrice: '1499.00',
      })
    ).toEqual([])
  })
})

describe('importCatalogue variants', () => {
  it('reports how many variants a dry run would create', async () => {
    const report = await importCatalogue({
      manifest: manifestFor('portrait'),
      mediaDir: mediaDir(),
      dryRun: true,
    })

    expect(report.failures).toEqual([])
    expect(report.validated).toBe(1)
    expect(report.variantsPlanned).toBe(17)
  })

  it('fails an unladdered orientation instead of selling it as a portrait', async () => {
    const report = await importCatalogue({
      manifest: manifestFor('round'),
      mediaDir: mediaDir(),
      dryRun: true,
    })

    expect(report.validated).toBe(0)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.reason).toMatch(/round/i)
    expect(report.variantsPlanned).toBe(0)
  })
})
