/**
 * DisplayHeading — a display heading whose words reveal in sequence.
 *
 * mesonart wraps every word of their H1s in its own span and staggers a
 * fade-and-rise across them. It is most of what makes their collection headers
 * feel considered rather than typeset.
 *
 * ACCESSIBILITY IS THE WHOLE DIFFICULTY HERE. The naive implementation —
 * `children.split(' ').map(w => <span>{w}</span>)` — drops the separating
 * whitespace, so the accessible name of "Transform Your Space" becomes
 * "TransformYourSpace", screen readers run the words together, and so does
 * copy-paste. The split below keeps the separators as bare text nodes between
 * the spans, which costs nothing and preserves both.
 *
 * Motion is decorative: the text is in the DOM either way, so the
 * prefers-reduced-motion rule in globals.css removes the animation outright
 * rather than shortening it.
 */

import { cn } from '~/lib/utils'

/** Milliseconds between consecutive words. Matches their cadence. */
const STAGGER_MS = 60

export interface DisplayHeadingProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement>, 'children'> {
  as?: 'h1' | 'h2'
  children: string
}

export function DisplayHeading({
  as: Tag = 'h1',
  className,
  children,
  ...props
}: DisplayHeadingProps) {
  // Capturing split: separators are kept as their own entries, so they can be
  // re-emitted verbatim between the word spans.
  const parts = children.split(/(\s+)/).filter((part) => part !== '')
  let wordIndex = 0

  return (
    <Tag
      className={cn('font-heading font-light tracking-tight', className)}
      {...props}
    >
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part
        const delay = wordIndex++ * STAGGER_MS
        return (
          <span
            key={i}
            data-word
            className="inline-block animate-word-reveal"
            style={{ animationDelay: `${delay}ms` }}
          >
            {part}
          </span>
        )
      })}
    </Tag>
  )
}

export default DisplayHeading
