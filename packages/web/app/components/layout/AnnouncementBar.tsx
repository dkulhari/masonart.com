/**
 * AnnouncementBar — the beige strip above the header.
 *
 * mesonart runs social icons left, a rotating message centre with prev/next
 * arrows, and a region/currency selector right (analysis §1.1).
 *
 * TWO DELIBERATE OMISSIONS
 *
 * 1. **No region selector.** We price in INR only; a selector with one option
 *    is furniture that implies a choice the customer does not have.
 * 2. **No sale strip and no countdown.** Theirs advertises "SUMMER SALE 40%
 *    OFF" over a live timer. We have no promotion entity — a countdown to a
 *    sale that does not exist is the fabricated-urgency pattern the parity
 *    analysis explicitly forbids. It waits for something real to announce.
 *
 * The messages below are things already stated on the home page trust row, so
 * they are claims we can stand behind.
 */

import { ChevronLeft, ChevronRight, Facebook, Instagram, Twitter } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '~/lib/utils'

export const ANNOUNCEMENTS = [
  'Free shipping on orders over ₹999',
  '30-day returns, no questions asked',
  'Museum-grade archival inks on every print',
] as const

/** Milliseconds each message holds. Long enough to finish reading it. */
const ROTATE_MS = 6000

const SOCIALS = [
  { href: 'https://instagram.com', label: 'Instagram', Icon: Instagram },
  { href: 'https://facebook.com', label: 'Facebook', Icon: Facebook },
  { href: 'https://twitter.com', label: 'Twitter', Icon: Twitter },
]

export function AnnouncementBar({ className }: { className?: string }) {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const step = useCallback((delta: number) => {
    setIndex(
      (current) =>
        (current + delta + ANNOUNCEMENTS.length) % ANNOUNCEMENTS.length
    )
  }, [])

  useEffect(() => {
    // Paused on hover: a message that moves while it is being read is worse
    // than one that never moves.
    if (isPaused) return
    const timer = setInterval(() => step(1), ROTATE_MS)
    return () => clearInterval(timer)
  }, [isPaused, step])

  return (
    <div
      className={cn(
        // NOT sticky. The header is `sticky top-0` and the collection toolbar
        // sits at `top-16` assuming the header alone owns that offset.
        'w-full bg-band text-foreground',
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="container-wide flex h-9 items-center justify-between gap-4 text-xs">
        <div className="hidden items-center gap-3 sm:flex">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground/70 transition-colors hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous announcement"
            className="text-foreground/60 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* polite, not assertive — this is ambient copy and must never
              interrupt whatever a screen reader is currently saying. */}
          <p aria-live="polite" className="text-center">
            {ANNOUNCEMENTS[index]}
          </p>

          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next announcement"
            className="text-foreground/60 transition-colors hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Balances the social cluster so the message stays centred. */}
        <div className="hidden w-[72px] sm:block" aria-hidden="true" />
      </div>
    </div>
  )
}

export default AnnouncementBar
