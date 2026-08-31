import { describe, it, expect } from 'vitest'
import sharp from 'sharp'

import {
  slugify,
  toCsv,
  measureOrientation,
  buildManifestRows,
  MANIFEST_HEADER,
} from '../../src/database/generate-manifest'

/** A solid rectangle of the given shape, as a real JPEG. */
const art = (w: number, h: number) =>
  sharp({
    create: { width: w, height: h, channels: 3, background: '#8844cc' },
  })
    .jpeg()
    .toBuffer()

describe('slugify', () => {
  it('makes a title safe for a URL', () => {
    expect(slugify('Silent Horizon')).toBe('silent-horizon')
  })

  it('strips punctuation and collapses runs', () => {
    expect(slugify("Dawn's  Edge — No. 4!")).toBe('dawns-edge-no-4')
  })

  it('produces only characters the importer accepts', () => {
    // The importer's slug rule is /^[a-z0-9-]+$/.
    expect(slugify('Café Górski & Sons')).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('toCsv', () => {
  it('quotes a field containing a comma so the column count survives', () => {
    const csv = toCsv([{ a: 'one,two', b: 'plain' }], ['a', 'b'])

    expect(csv).toBe('a,b\n"one,two",plain')
  })

  it('escapes an embedded double quote by doubling it', () => {
    const csv = toCsv([{ a: 'say "hi"' }], ['a'])

    expect(csv).toBe('a\n"say ""hi"""')
  })
})

describe('measureOrientation', () => {
  it('measures a tall picture as portrait', async () => {
    expect(await measureOrientation(await art(600, 900))).toBe('portrait')
  })

  it('measures a wide picture as landscape', async () => {
    expect(await measureOrientation(await art(900, 600))).toBe('landscape')
  })

  it('measures a square picture as square', async () => {
    expect(await measureOrientation(await art(800, 800))).toBe('square')
  })

  it('measures a 3:1 picture as panoramic', async () => {
    expect(await measureOrientation(await art(1800, 600))).toBe('panoramic')
  })
})

describe('buildManifestRows', () => {
  const opts = {
    category: 'Wabi-Sabi',
    skuPrefix: 'WS',
    basePrice: '1499.00',
    styles: ['wabi-sabi-art'],
    subjects: ['abstract'],
    colors: ['beige'],
    rooms: ['living-room'],
  }

  it('numbers skus in order and derives a unique slug per row', async () => {
    const rows = await buildManifestRows(
      [
        { filename: 'v (1).jpg', buffer: await art(600, 900) },
        { filename: 'v (2).jpg', buffer: await art(900, 600) },
      ],
      opts
    )

    expect(rows.map((r) => r.sku)).toEqual(['WS-0001', 'WS-0002'])
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2)
    expect(rows.every((r) => /^[a-z0-9-]+$/.test(r.slug))).toBe(true)
  })

  it('writes the orientation it actually measured, not a guess', async () => {
    const rows = await buildManifestRows(
      [
        { filename: 'tall.jpg', buffer: await art(600, 900) },
        { filename: 'wide.jpg', buffer: await art(900, 600) },
      ],
      opts
    )

    expect(rows[0]!.orientation).toBe('portrait')
    expect(rows[1]!.orientation).toBe('landscape')
  })

  it('emits a price the importer will accept', async () => {
    const rows = await buildManifestRows(
      [{ filename: 'a.jpg', buffer: await art(800, 800) }],
      opts
    )

    expect(rows[0]!.basePrice).toMatch(/^\d+\.\d{2}$/)
  })

  it('carries the filename through as mainImage so the media dir resolves', async () => {
    const rows = await buildManifestRows(
      [{ filename: 'v (7).jpg', buffer: await art(800, 800) }],
      opts
    )

    expect(rows[0]!.mainImage).toBe('v (7).jpg')
  })

  it('produces a CSV whose header matches the importer contract', async () => {
    const rows = await buildManifestRows(
      [{ filename: 'a.jpg', buffer: await art(800, 800) }],
      opts
    )
    const csv = toCsv(rows as unknown as Record<string, string>[], MANIFEST_HEADER)

    expect(csv.split('\n')[0]).toBe(MANIFEST_HEADER.join(','))
  })
})
