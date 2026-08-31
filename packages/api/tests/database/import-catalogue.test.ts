import { describe, it, expect } from 'vitest'
import { parseManifest } from '../../src/database/import-catalogue'

const HEADER =
  'sku,title,slug,description,basePrice,orientation,styles,subjects,colors,rooms,tags,seoTitle,seoDescription,status,isFeatured,featuredOrder,mainImage,roomImages,altText'

const row = (over: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    sku: 'ABS-001',
    title: 'Cosmic Harmony',
    slug: 'cosmic-harmony',
    description: 'Swirling cosmic patterns.',
    basePrice: '1499.00',
    orientation: 'portrait',
    styles: 'abstract|modern',
    subjects: 'space|patterns',
    colors: 'blue|purple|black',
    rooms: 'living-room|bedroom',
    tags: 'bestseller|cosmic',
    seoTitle: 'Cosmic Harmony Abstract Art Print',
    seoDescription: 'Shop the Cosmic Harmony abstract art print.',
    status: 'active',
    isFeatured: 'true',
    featuredOrder: '1',
    mainImage: 'sa126-main.webp',
    roomImages: 'sa126-room-0.webp|sa126-room-1.webp|sa126-room-2.webp',
    altText: 'Cosmic Harmony Abstract Art',
    ...over,
  }
  return HEADER.split(',')
    .map((c) => base[c] ?? '')
    .join(',')
}

describe('parseManifest', () => {
  it('maps a valid row to a product record', () => {
    const { rows, errors } = parseManifest(`${HEADER}\n${row()}`)

    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].slug).toBe('cosmic-harmony')
    expect(rows[0].basePrice).toBe('1499.00')
    expect(rows[0].isFeatured).toBe(true)
  })

  it('splits pipe-separated array columns', () => {
    const { rows } = parseManifest(`${HEADER}\n${row()}`)

    expect(rows[0].styles).toEqual(['abstract', 'modern'])
    expect(rows[0].roomImages).toEqual([
      'sa126-room-0.webp',
      'sa126-room-1.webp',
      'sa126-room-2.webp',
    ])
  })

  it('reports a bad slug against its row number instead of throwing', () => {
    const { rows, errors } = parseManifest(
      `${HEADER}\n${row({ slug: 'Cosmic Harmony' })}`
    )

    expect(rows).toHaveLength(0)
    expect(errors[0].row).toBe(2)
    expect(errors[0].message).toMatch(/slug/i)
  })

  it('reports a bad price and keeps parsing later rows', () => {
    const { rows, errors } = parseManifest(
      `${HEADER}\n${row({ sku: 'BAD-1', basePrice: '1499' })}\n${row()}`
    )

    expect(errors).toHaveLength(1)
    expect(errors[0].sku).toBe('BAD-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].sku).toBe('ABS-001')
  })
})
