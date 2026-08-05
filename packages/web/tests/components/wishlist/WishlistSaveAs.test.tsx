/**
 * Saving the wishlist as a collection — new, or over an existing one.
 *
 * The destination is chosen at SAVE time, not carried from wherever the
 * products were loaded. The wishlist remembers nothing about its origin, so
 * loading collection A, rearranging, and saving over collection B is a
 * legitimate thing to do rather than a mistake to prevent.
 *
 * Overwrite REPLACES a collection's whole membership. The confirm has to say
 * which collection and what it currently holds, or it is a destructive action
 * dressed as a dropdown.
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

const COLLECTIONS = [
  { id: 'c-manual', slug: 'staff-picks', title: 'Staff Picks', kind: 'manual', count: 6 },
  { id: 'c-manual2', slug: 'gifts', title: 'Gift Ideas', kind: 'manual', count: 2 },
  { id: 'c-rule', slug: 'pop-art', title: 'Pop Art', kind: 'rule', count: 9 },
]

/** Route each call by URL so the order of requests does not have to be guessed. */
function mockFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const href = String(url)

    if (href.includes('/api/admin/collections') && (!init || init.method === undefined)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ collections: COLLECTIONS }),
      }
    }
    if (href.endsWith('/products')) {
      return {
        ok: overrides.membersOk !== false,
        status: overrides.membersOk === false ? 400 : 200,
        json: async () => ({ success: true }),
      }
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ collection: { id: 'created-id' } }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch())
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
})

const renderBar = (ids = IDS) =>
  render(<WishlistStagingBar role="admin" productIds={ids} />)

describe('choosing a destination', () => {
  it('offers both a new collection and an existing one', async () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Save as collection/i }))

    expect(await screen.findByRole('button', { name: /New collection/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Overwrite an existing/i })).toBeTruthy()
  })

  it('lists only manual collections to overwrite', async () => {
    // A rule collection has no explicit membership — offering it would be
    // offering an operation the API refuses.
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Save as collection/i }))
    fireEvent.click(screen.getByRole('button', { name: /Overwrite an existing/i }))

    const picker = (await screen.findByRole('combobox')) as HTMLSelectElement
    const labels = Array.from(picker.options).map((o) => o.textContent ?? '')

    expect(labels.join(' ')).toMatch(/Staff Picks/)
    expect(labels.join(' ')).toMatch(/Gift Ideas/)
    expect(labels.join(' ')).not.toMatch(/Pop Art/)
  })
})

describe('overwriting', () => {
  const openPicker = async () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Save as collection/i }))
    fireEvent.click(screen.getByRole('button', { name: /Overwrite an existing/i }))
    const picker = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'c-manual' } })
    return picker
  }

  it('confirms first, naming the target and what it currently holds', async () => {
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: /^Overwrite$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toMatch(/Staff Picks/)
    // Six products are about to be replaced by three — say so.
    expect(dialog.textContent).toMatch(/6/)
  })

  it('writes nothing when the confirm is cancelled', async () => {
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: /^Overwrite$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/i }))

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some(([, init]) => (init as RequestInit)?.method === 'PUT')).toBe(
      false
    )
  })

  it('PUTs the ordered ids to the chosen collection', async () => {
    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: /^Overwrite$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Replace its products/i }))

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const put = calls.find(([, init]) => (init as RequestInit)?.method === 'PUT')
      expect(put).toBeTruthy()
      expect(String(put![0])).toContain('/api/admin/collections/c-manual/products')
      expect(JSON.parse((put![1] as RequestInit).body as string).productIds).toEqual(
        IDS
      )
    })
  })

  it('surfaces a failure rather than reporting success', async () => {
    vi.stubGlobal('fetch', mockFetch({ membersOk: false }))

    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: /^Overwrite$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Replace its products/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})

describe('creating a new collection', () => {
  it('still posts a manual collection and lands on its edit form', async () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Save as collection/i }))
    fireEvent.click(await screen.findByRole('button', { name: /New collection/i }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/admin/collections/$id' })
      )
    )
  })
})

describe('an empty wishlist', () => {
  it('offers no save at all', () => {
    renderBar([])
    expect(screen.getByRole('button', { name: /Save as collection/i })).toBeDisabled()
  })
})
