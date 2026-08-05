/**
 * Staging a curated collection from the wishlist.
 *
 * Browsing the store and clicking hearts already IS a product picker — it has
 * search, filters, and the artwork at full size. What it lacked was an export.
 * This is that export, and it retires the raw-UUID textarea recorded as a
 * limitation on #473.
 *
 * Staff only. Product ids are not secret — they are already in the DOM and in
 * every API response — so this is about not putting internal identifiers in
 * front of every shopper, not about exposure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { WishlistStagingBar } = await import(
  '~/components/wishlist/WishlistStagingBar'
)

const IDS = ['id-a', 'id-b', 'id-c']

const writeText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  writeText.mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ collection: { id: 'new-collection-id' } }),
    })
  )
})

const renderBar = (role: string | null, ids = IDS) =>
  render(<WishlistStagingBar role={role} productIds={ids} />)

describe('who sees it', () => {
  it('is hidden from a signed-out visitor', () => {
    const { container } = renderBar(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('is hidden from a shopper', () => {
    const { container } = renderBar('customer')
    expect(container).toBeEmptyDOMElement()
  })

  it.each(['content-manager', 'admin', 'super-admin'])(
    'is shown to %s',
    (role) => {
      renderBar(role)
      expect(screen.getByRole('button', { name: /Copy IDs/i })).toBeTruthy()
    }
  )
})

describe('what it says', () => {
  it('reports how many items are staged', () => {
    renderBar('admin')
    expect(screen.getByText(/3 items/i)).toBeTruthy()
  })

  it('warns that this is the admin own wishlist', () => {
    // A single staging slot shared with their real saved items. Stated rather
    // than discovered halfway through curating a second collection.
    renderBar('admin')
    expect(screen.getByText(/your own wishlist/i)).toBeTruthy()
  })
})

describe('copying', () => {
  it('copies the ids in list order, one per line', () => {
    renderBar('admin')
    fireEvent.click(screen.getByRole('button', { name: /Copy IDs/i }))
    expect(writeText).toHaveBeenCalledWith('id-a\nid-b\nid-c')
  })

  it('falls back to a selectable field when the clipboard is unavailable', async () => {
    // navigator.clipboard is absent on insecure origins. A copy button that
    // silently does nothing is worse than no button.
    Object.assign(navigator, { clipboard: undefined })

    renderBar('admin')
    fireEvent.click(screen.getByRole('button', { name: /Copy IDs/i }))

    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
        'id-a\nid-b\nid-c'
      )
    )
  })
})

/**
 * Creating now sits behind the destination chooser (#508): the wishlist can be
 * saved as a NEW collection or over an existing one, and the choice is made at
 * save time rather than carried from wherever the products were loaded.
 */
const openCreate = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Save as collection/i }))
  fireEvent.click(await screen.findByRole('button', { name: /New collection/i }))
}

describe('creating a collection', () => {
  it('posts a manual collection, then its ordered membership', async () => {
    renderBar('admin')
    await openCreate()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    const [createUrl, createInit] = calls[0]
    expect(String(createUrl)).toMatch(/\/api\/admin\/collections$/)
    expect(JSON.parse(createInit.body).kind).toBe('manual')

    const [membersUrl, membersInit] = calls[1]
    expect(String(membersUrl)).toMatch(/\/api\/admin\/collections\/.+\/products$/)
    // The order is the entire value of staging.
    expect(JSON.parse(membersInit.body).productIds).toEqual(IDS)
  })

  it('lands on the new collection edit form so it can be named', async () => {
    renderBar('admin')
    await openCreate()

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/admin/collections/$id' })
      )
    )
  })

  it('surfaces a failure rather than pretending it worked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'exists', slug: 'taken' }),
      })
    )

    renderBar('admin')
    await openCreate()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('an empty wishlist', () => {
  it('disables both actions rather than creating an empty collection', () => {
    renderBar('admin', [])

    expect(screen.getByRole('button', { name: /Copy IDs/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Save as collection/i })
    ).toBeDisabled()
  })
})
