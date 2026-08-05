import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { WishlistButton } from '~/components/product/WishlistButton'
import { useWishlistStore } from '~/stores/wishlist'

const PRODUCT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

beforeEach(() => {
  useWishlistStore.setState({ ids: [], isLoaded: true, isPending: false })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WishlistButton', () => {
  it('renders unsaved on the server, whatever the store holds', () => {
    // A guest's saves now come back from localStorage before the first render
    // (#477) and the server cannot know them, so a filled heart in the SSR
    // output would be a hydration mismatch. What prevents it is zustand v5
    // serving `getInitialState` as the server snapshot — the store's rehydrated
    // ids are simply not visible to renderToString or to the hydration pass.
    // This pins that guarantee; losing it puts the mismatch on every card.
    useWishlistStore.setState({ ids: [PRODUCT], isLoaded: true })

    const html = renderToString(<WishlistButton productId={PRODUCT} />)

    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('fill-foreground')
  })

  it('renders a toggle button', () => {
    render(<WishlistButton productId={PRODUCT} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('names itself by what pressing it will do', () => {
    render(<WishlistButton productId={PRODUCT} />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Add to wishlist'
    )
  })

  it('flips its accessible name once saved', async () => {
    render(<WishlistButton productId={PRODUCT} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
        'Remove from wishlist'
      )
    })
  })

  it('exposes state as aria-pressed', async () => {
    render(<WishlistButton productId={PRODUCT} />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('toggles the store', async () => {
    render(<WishlistButton productId={PRODUCT} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(useWishlistStore.getState().ids).toContain(PRODUCT)
    })
  })

  it('fills the heart when saved, monochrome — never red', () => {
    // --sale is reserved for sale prices, and
    // tests/styles/storefront-token-compliance.test.ts fails the build on
    // anything reaching outside the palette.
    useWishlistStore.setState({ ids: [PRODUCT], isLoaded: true })
    const { container } = render(<WishlistButton productId={PRODUCT} />)

    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toContain('fill-foreground')
    expect(svg.getAttribute('class')).not.toContain('red')
    expect(svg.getAttribute('class')).not.toContain('sale')
  })

  it('leaves the heart unfilled when not saved', () => {
    const { container } = render(<WishlistButton productId={PRODUCT} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).not.toContain('fill-foreground')
  })

  it('does not submit a surrounding form', () => {
    // The PDP places it beside Add to Cart inside a form.
    render(<WishlistButton productId={PRODUCT} />)
    expect((screen.getByRole('button') as HTMLButtonElement).type).toBe('button')
  })

  it('does not navigate when it sits inside a card link', () => {
    // ProductCard wraps the title in a Link; a heart that bubbles would
    // navigate to the PDP instead of saving.
    const onClick = vi.fn()
    render(
      <div onClick={onClick}>
        <WishlistButton productId={PRODUCT} />
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
