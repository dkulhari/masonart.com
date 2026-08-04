import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  AnnouncementBar,
  ANNOUNCEMENTS,
} from '~/components/layout/AnnouncementBar'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('messages', () => {
  it('shows the first announcement', () => {
    render(<AnnouncementBar />)
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeTruthy()
  })

  it('only claims things that are true of us', () => {
    // The analysis' real-data-only constraint. Their bar advertises a 40% sale
    // that does not exist here; ours says what our own trust row already says.
    const text = ANNOUNCEMENTS.join(' ').toLowerCase()
    expect(text).not.toMatch(/\d+% off|sale ends|hurry/)
  })

  it('rotates on a timer', () => {
    render(<AnnouncementBar />)
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(screen.getByText(ANNOUNCEMENTS[1]!)).toBeTruthy()
  })

  it('wraps around at the end', () => {
    render(<AnnouncementBar />)
    act(() => {
      vi.advanceTimersByTime(6000 * ANNOUNCEMENTS.length)
    })
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeTruthy()
  })
})

describe('controls', () => {
  it('arrows are real buttons with accessible names', () => {
    render(<AnnouncementBar />)
    expect(screen.getByRole('button', { name: /previous announcement/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /next announcement/i })).toBeTruthy()
  })

  it('next advances', () => {
    render(<AnnouncementBar />)
    fireEvent.click(screen.getByRole('button', { name: /next announcement/i }))
    expect(screen.getByText(ANNOUNCEMENTS[1]!)).toBeTruthy()
  })

  it('previous wraps backwards from the first', () => {
    render(<AnnouncementBar />)
    fireEvent.click(screen.getByRole('button', { name: /previous announcement/i }))
    expect(screen.getByText(ANNOUNCEMENTS.at(-1)!)).toBeTruthy()
  })
})

describe('placement and styling', () => {
  it('uses the measured beige band, not a new colour', () => {
    const { container } = render(<AnnouncementBar />)
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'bg-band'
    )
  })

  it('is NOT sticky', () => {
    // The header is `sticky top-0` and the collection toolbar sits at
    // `top-16` assuming the header alone occupies that space. A sticky
    // announcement bar would fight both for the same offset.
    const { container } = render(<AnnouncementBar />)
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      'sticky'
    )
  })

  it('announces politely rather than interrupting a screen reader', () => {
    const { container } = render(<AnnouncementBar />)
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  })
})
