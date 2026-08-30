/**
 * ProductForm alt text tests (#664)
 *
 * An image whose `altText` is empty is valid to the API and exists on older
 * rows. The form must therefore never block the save on it: Save either works
 * or says why, and a silent no-op is the one outcome that must not survive.
 * Missing alt text is surfaced as a non-blocking warning instead.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ProductForm, type ProductFormData } from '~/components/admin/ProductForm'
import type { ProductImage } from '@chobii/shared'

const image = (id: string, altText: string): ProductImage => ({
  id,
  url: `https://cdn.test/${id}.webp`,
  altText,
  type: id === 'img-a' ? 'main' : 'detail',
  sortOrder: id === 'img-a' ? 0 : 1,
  width: 1500,
  height: 1500,
  originalKey: `products/originals/${id}.jpg`,
})

const baseData: Partial<ProductFormData> = {
  title: 'Test product',
  sku: 'SKU-1',
  slug: 'test-product',
  basePrice: '599.00',
}

function renderForm(images: ProductImage[], onSubmit = vi.fn()) {
  render(
    <ProductForm
      initialData={{ ...baseData, images }}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />
  )
  return onSubmit
}

const mediaRows = () => screen.getAllByTestId('media-row')
const saveButton = () => screen.getByRole('button', { name: /create product/i })

describe('ProductForm alt text', () => {
  it('does not mark the alt text input required', () => {
    renderForm([image('img-a', 'alt a')])
    expect(within(mediaRows()[0]).getByPlaceholderText(/alt text/i)).not.toBeRequired()
  })

  it('submits a product whose image has no alt text', async () => {
    const onSubmit = renderForm([image('img-a', '')])
    fireEvent.click(saveButton())
    await screen.findByText(/test product/i, {}, { timeout: 100 }).catch(() => {})
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].images[0].altText).toBe('')
  })

  it('warns on the row that has no alt text', () => {
    renderForm([image('img-a', ''), image('img-b', 'alt b')])
    const rows = mediaRows()
    expect(within(rows[0]).getByTestId('alt-text-warning')).toHaveTextContent(/alt text/i)
    expect(within(rows[1]).queryByTestId('alt-text-warning')).toBeNull()
  })

  it('clears the warning once alt text is typed', () => {
    renderForm([image('img-a', '')])
    const row = mediaRows()[0]
    expect(within(row).getByTestId('alt-text-warning')).toBeInTheDocument()
    fireEvent.change(within(row).getByPlaceholderText(/alt text/i), {
      target: { value: 'A framed print' },
    })
    expect(within(mediaRows()[0]).queryByTestId('alt-text-warning')).toBeNull()
  })

  it('treats whitespace-only alt text as missing', () => {
    renderForm([image('img-a', '   ')])
    expect(within(mediaRows()[0]).getByTestId('alt-text-warning')).toBeInTheDocument()
  })
})
