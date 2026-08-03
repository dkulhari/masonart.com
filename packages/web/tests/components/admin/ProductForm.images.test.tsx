/**
 * ProductForm media-row tests (#368)
 *
 * The admin image grid must expose per-row metadata controls for the square
 * contract: a type selector enforcing exactly one `main`, drag reordering that
 * renumbers sortOrder contiguously, and a required alt text input.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ProductForm, type ProductFormData } from '~/components/admin/ProductForm'
import type { ProductImage } from '@chobii/shared'

const image = (id: string, type: ProductImage['type'], sortOrder: number): ProductImage => ({
  id,
  url: `https://cdn.test/${id}.webp`,
  altText: `alt ${id}`,
  type,
  sortOrder,
  width: 1500,
  height: 1500,
  originalKey: `products/originals/${id}.jpg`,
})

const initialData: Partial<ProductFormData> = {
  title: 'Test product',
  sku: 'SKU-1',
  slug: 'test-product',
  basePrice: '599.00',
  images: [image('img-a', 'main', 0), image('img-b', 'detail', 1)],
}

function renderForm() {
  return render(
    <ProductForm initialData={initialData} onSubmit={vi.fn()} onCancel={vi.fn()} />
  )
}

const mediaRows = () => screen.getAllByTestId('media-row')

describe('ProductForm media rows', () => {
  it('renders a type selector on every row reflecting the image type', () => {
    renderForm()
    const rows = mediaRows()
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByLabelText(/image type/i)).toHaveValue('main')
    expect(within(rows[1]).getByLabelText(/image type/i)).toHaveValue('detail')
  })

  it('demotes the previous main when a second row selects main', () => {
    renderForm()
    const rows = mediaRows()
    fireEvent.change(within(rows[1]).getByLabelText(/image type/i), {
      target: { value: 'main' },
    })
    const after = mediaRows()
    expect(within(after[0]).getByLabelText(/image type/i)).toHaveValue('detail')
    expect(within(after[1]).getByLabelText(/image type/i)).toHaveValue('main')
  })

  it('marks the alt text input required', () => {
    renderForm()
    const rows = mediaRows()
    expect(within(rows[0]).getByPlaceholderText(/alt text/i)).toBeRequired()
  })

  it('has a drag handle on every row', () => {
    renderForm()
    for (const row of mediaRows()) {
      expect(within(row).getByLabelText(/drag to reorder/i)).toBeInTheDocument()
    }
  })

  it('reordering by drag renumbers rows contiguously from 0', () => {
    renderForm()
    const rows = mediaRows()
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])

    const after = mediaRows()
    // img-b moved first; sortOrder is surfaced on the row for verification
    expect(after[0]).toHaveAttribute('data-image-id', 'img-b')
    expect(after[0]).toHaveAttribute('data-sort-order', '0')
    expect(after[1]).toHaveAttribute('data-image-id', 'img-a')
    expect(after[1]).toHaveAttribute('data-sort-order', '1')
  })
})
