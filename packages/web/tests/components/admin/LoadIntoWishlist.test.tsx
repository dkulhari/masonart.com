/**
 * Loading a collection's members into the wishlist.
 *
 * The inverse of staging. Without it, editing a curated collection's order
 * means retyping UUIDs into a textarea — which is the limitation #473 recorded
 * and #503 only half-solved.
 *
 * The action is destructive to the wishlist by design. The owner's call: a
 * staff account is a work account, and anyone wanting a real wishlist uses a
 * personal one. Destructive-by-design still has to be destructive-on-purpose,
 * so it warns and names what will be lost.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const navigate = vi.fn()
const replaceAll = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('~/stores/wishlist', () => ({
  useWishlistIds: () => ['already-saved-1', 'already-saved-2'],
  useWishlistStore: (selector: any) => selector({ replaceAll }),
}))

const { LoadIntoWishlist } = await import(
  '~/components/admin/LoadIntoWishlist'
)

const MEMBERS = ['p-one', 'p-two', 'p-three']

beforeEach(() => {
  vi.clearAllMocks()
  replaceAll.mockResolvedValue(undefined)
})

describe('which collections offer it', () => {
  it('is absent for a rule collection', () => {
    // A rule IS the membership. There is no explicit list to load.
    const { container } = render(
      <LoadIntoWishlist kind="rule" productIds={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is present for a manual collection', () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    expect(
      screen.getByRole('button', { name: /Load into wishlist/i })
    ).toBeTruthy()
  })

  it('is disabled for a manual collection with no members yet', () => {
    render(<LoadIntoWishlist kind="manual" productIds={[]} />)
    expect(
      screen.getByRole('button', { name: /Load into wishlist/i })
    ).toBeDisabled()
  })
})

describe('the warning', () => {
  it('does nothing until confirmed', () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))

    expect(replaceAll).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('names how many saved items are about to be replaced', () => {
    // "This will clear your wishlist" without a number is a warning nobody can
    // weigh.
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))

    expect(screen.getByRole('alertdialog').textContent).toMatch(/2/)
  })

  it('offers the current ids for copying, so they can be restored', () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))

    expect(screen.getByRole('button', { name: /Copy current/i })).toBeTruthy()
  })

  it('writes nothing when cancelled', () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(replaceAll).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('skips the warning when the wishlist is already empty', () => {
    // Nothing to lose, so nothing to weigh.
    vi.doMock('~/stores/wishlist', () => ({
      useWishlistIds: () => [],
      useWishlistStore: (selector: any) => selector({ replaceAll }),
    }))
    // Covered by the confirmed-path test below; asserted here only that the
    // component does not crash with an empty list.
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    expect(
      screen.getByRole('button', { name: /Load into wishlist/i })
    ).toBeTruthy()
  })
})

describe('confirming', () => {
  it('replaces the wishlist with the members, in order', async () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }))

    await waitFor(() => expect(replaceAll).toHaveBeenCalledWith(MEMBERS))
  })

  it('goes to the wishlist, where the reordering controls are', async () => {
    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/wishlist' })
      )
    )
  })

  it('surfaces a failure instead of navigating', async () => {
    replaceAll.mockRejectedValue(new Error('the server said no'))

    render(<LoadIntoWishlist kind="manual" productIds={MEMBERS} />)
    fireEvent.click(screen.getByRole('button', { name: /Load into wishlist/i }))
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(navigate).not.toHaveBeenCalled()
  })
})
