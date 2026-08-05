/**
 * Reordering the saved grid.
 *
 * Drag is the affordance most people will use, and it is the one nobody using
 * a keyboard or a screen reader can use at all. So every card also carries
 * explicit move controls — the same call the admin collections list made
 * (#472), for the same reason.
 *
 * The rendered order must follow the STORE, not the order products arrived in
 * from the network. That distinction is what #500 turned out to have been
 * getting wrong on the server for months.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * ProductCard renders <Link>, which needs a router. Mocked to a plain anchor,
 * following ProductCard.test.tsx — a real memory router here would be testing
 * TanStack rather than the reordering.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { ReorderableWishlistGrid } = await import(
  '~/components/wishlist/ReorderableWishlistGrid'
)
type ProductCardData = import('~/components/product/ProductCard').ProductCardData

const product = (id: string, title: string): ProductCardData => ({
  id,
  title,
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  basePrice: '2500.00',
  images: [],
  orientation: 'square',
})

const THREE = [
  product('a', 'Alpha'),
  product('b', 'Bravo'),
  product('c', 'Charlie'),
]

const onReorder = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

const renderGrid = (products = THREE) =>
  render(<ReorderableWishlistGrid products={products} onReorder={onReorder} />)

describe('keyboard controls', () => {
  it('gives every card a named move-earlier and move-later button', () => {
    // Named after the product: "Move item up" three times over tells a screen
    // reader user nothing about which item.
    renderGrid()

    expect(screen.getByRole('button', { name: /Move Alpha earlier/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Move Alpha later/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Move Charlie earlier/i })).toBeTruthy()
  })

  it('disables move-earlier on the first and move-later on the last', () => {
    renderGrid()

    expect(
      screen.getByRole('button', { name: /Move Alpha earlier/i })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Move Charlie later/i })
    ).toBeDisabled()
    // ...and the middle card can go both ways.
    expect(
      screen.getByRole('button', { name: /Move Bravo earlier/i })
    ).not.toBeDisabled()
  })

  it('moves an item one place earlier', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: /Move Bravo earlier/i }))
    expect(onReorder).toHaveBeenCalledWith(1, 0)
  })

  it('moves an item one place later', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: /Move Bravo later/i }))
    expect(onReorder).toHaveBeenCalledWith(1, 2)
  })
})

describe('drag', () => {
  it('reorders from the dragged index to the dropped one', () => {
    renderGrid()
    const cards = screen.getAllByTestId('wishlist-item')

    fireEvent.dragStart(cards[0])
    fireEvent.dragOver(cards[2])
    fireEvent.drop(cards[2])

    expect(onReorder).toHaveBeenCalledWith(0, 2)
  })

  it('marks the card being dragged, so the drag is visible', () => {
    renderGrid()
    const cards = screen.getAllByTestId('wishlist-item')

    fireEvent.dragStart(cards[1])
    expect(cards[1].getAttribute('data-dragging')).toBe('true')
  })

  it('marks the card being dragged over, so the target is visible', () => {
    // Dragging across thirty cards with no drop indicator is guesswork.
    renderGrid()
    const cards = screen.getAllByTestId('wishlist-item')

    fireEvent.dragStart(cards[0])
    fireEvent.dragOver(cards[2])

    expect(cards[2].getAttribute('data-drop-target')).toBe('true')
  })

  it('clears the drag state when the drag ends without a drop', () => {
    renderGrid()
    const cards = screen.getAllByTestId('wishlist-item')

    fireEvent.dragStart(cards[0])
    fireEvent.dragEnd(cards[0])

    expect(cards[0].getAttribute('data-dragging')).toBe('false')
  })

  it('does not reorder when dropped on itself', () => {
    renderGrid()
    const cards = screen.getAllByTestId('wishlist-item')

    fireEvent.dragStart(cards[1])
    fireEvent.drop(cards[1])

    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('order', () => {
  it('renders in the order given, not sorted', () => {
    renderGrid([THREE[2], THREE[0], THREE[1]])

    // By the move-button label rather than a heading role: ProductCard renders
    // the title without one, and the label is derived from the same title.
    const order = screen
      .getAllByTestId('wishlist-item')
      .map((item) =>
        within(item)
          .getByRole('button', { name: /Move .* later/i })
          .getAttribute('aria-label')
          ?.replace(/^Move /, '')
          .replace(/ later$/, '')
      )

    expect(order).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })
})

describe('a list of one', () => {
  it('shows no reorder affordances at all', () => {
    // Nothing to reorder. Two disabled buttons on a single card is clutter
    // that reads as broken.
    renderGrid([THREE[0]])

    expect(screen.queryByRole('button', { name: /Move .* earlier/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Move .* later/i })).toBeNull()
  })
})
