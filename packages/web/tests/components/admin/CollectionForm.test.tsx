/**
 * The collection form.
 *
 * Two behaviours here are the difference between a working feature and a
 * plausible-looking one:
 *
 * 1. **The facet options come from `@chobii/shared`.** A hardcoded list would
 *    let an admin build a rule the API rejects, and would restart the drift
 *    #395 ended.
 * 2. **The slug is suggested, never imposed.** It is the URL. Rewriting it when
 *    somebody edits the title of a published collection breaks every link.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FACET_GROUPS, STYLE_OPTIONS } from '@chobii/shared'
import {
  CollectionForm,
  slugify,
  EMPTY_COLLECTION,
} from '~/components/admin/CollectionForm'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total: 12, collection: { id: 'new-id' } }),
    })
  )
})

describe('slugify', () => {
  it('makes a url-safe slug from a title', () => {
    expect(slugify('Wabi-Sabi Art')).toBe('wabi-sabi-art')
    expect(slugify('  Best  Sellers!  ')).toBe('best-sellers')
  })

  it('never leaves leading or trailing separators', () => {
    expect(slugify('— Pop Art —')).toBe('pop-art')
  })
})

describe('the slug field', () => {
  it('follows the title until the admin edits it', () => {
    render(<CollectionForm onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^Title$/), {
      target: { value: 'Pop Art' },
    })
    expect((screen.getByLabelText(/^Slug$/) as HTMLInputElement).value).toBe('pop-art')
  })

  it('stops following once the admin has typed one', () => {
    // The slug is the URL. Silently rewriting it breaks every existing link.
    render(<CollectionForm onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^Slug$/), {
      target: { value: 'my-own-slug' },
    })
    fireEvent.change(screen.getByLabelText(/^Title$/), {
      target: { value: 'Something Else' },
    })

    expect((screen.getByLabelText(/^Slug$/) as HTMLInputElement).value).toBe(
      'my-own-slug'
    )
  })

  it('treats a loaded collection as already having its slug', () => {
    render(
      <CollectionForm
        collectionId="c1"
        initial={{ ...EMPTY_COLLECTION, slug: 'existing', title: 'Existing' }}
        onSaved={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText(/^Title$/), {
      target: { value: 'Renamed' },
    })
    expect((screen.getByLabelText(/^Slug$/) as HTMLInputElement).value).toBe(
      'existing'
    )
  })
})

describe('the rule builder', () => {
  it('renders every facet group from the shared vocabulary', () => {
    render(<CollectionForm onSaved={() => {}} />)
    for (const group of FACET_GROUPS) {
      expect(screen.getByText(group.label)).toBeTruthy()
    }
  })

  it('offers the shared style options, not a local copy', () => {
    render(<CollectionForm onSaved={() => {}} />)
    for (const style of STYLE_OPTIONS.slice(0, 3)) {
      // getAllBy, not getBy: `Colorful Art` is deliberately in BOTH the Style
      // and Subject vocabularies — mesonart's taxonomy overlaps there and
      // facets.ts keeps the overlap on purpose.
      expect(screen.getAllByRole('button', { name: style.label }).length)
        .toBeGreaterThan(0)
    }
  })

  it('marks a chosen facet pressed', () => {
    render(<CollectionForm onSaved={() => {}} />)
    const chip = screen.getByRole('button', { name: STYLE_OPTIONS[0].label })

    expect(chip.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })

  it('offers a default sort — the thing that makes Best Sellers possible', () => {
    render(<CollectionForm onSaved={() => {}} />)
    expect(screen.getByLabelText(/Default sort/)).toBeTruthy()
  })

  it('is hidden when the collection is hand-picked', () => {
    render(
      <CollectionForm
        initial={{ ...EMPTY_COLLECTION, kind: 'manual' }}
        onSaved={() => {}}
      />
    )
    expect(screen.queryByLabelText(/Default sort/)).toBeNull()
    expect(screen.getByLabelText(/Product IDs/)).toBeTruthy()
  })
})

describe('the count preview', () => {
  it('reports what the rule currently matches', async () => {
    render(<CollectionForm onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Matches/)).toBeTruthy())
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('calls out a rule that matches nothing', async () => {
    // The failure worth catching at authoring time: on the storefront it shows
    // up as a chip that quietly disappears.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 0 }),
      })
    )

    render(<CollectionForm onSaved={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/matches no products/i)).toBeTruthy()
    )
  })
})

describe('switching membership kind', () => {
  it('warns before discarding a rule that was built', () => {
    render(
      <CollectionForm
        initial={{ ...EMPTY_COLLECTION, rule: { styles: ['pop-art'] } }}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByLabelText(/Hand-picked/))
    expect(screen.getByText(/will discard the filter/i)).toBeTruthy()
  })

  it('does not discard until the admin confirms', () => {
    render(
      <CollectionForm
        initial={{ ...EMPTY_COLLECTION, rule: { styles: ['pop-art'] } }}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByLabelText(/Hand-picked/))
    fireEvent.click(screen.getByRole('button', { name: /Keep it/ }))

    // Still the rule builder, still the chosen facet.
    expect(screen.getByLabelText(/Default sort/)).toBeTruthy()
  })
})

describe('saving', () => {
  it('surfaces a slug collision as the slug, not a generic error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'exists', slug: 'pop-art' }),
      })
    )

    render(
      <CollectionForm
        initial={{ ...EMPTY_COLLECTION, slug: 'pop-art', title: 'Pop Art' }}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create collection/ }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/pop-art/)
    )
  })
})
