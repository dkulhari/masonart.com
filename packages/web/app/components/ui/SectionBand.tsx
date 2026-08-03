/**
 * SectionBand — a full-bleed page band with the standard vertical rhythm.
 *
 * mesonart's pages are a stack of alternating bands: white, then beige, then
 * white again. Ours reached for a cool blue-gray muted tint, and for brand
 * gradients on the marketing sections. This component exists so the
 * alternation is a `tone` prop rather than a class each section invents for
 * itself.
 *
 * The band colours are measured — see --band / --band-strong / --highlight in
 * globals.css.
 */

import { cn } from '~/lib/utils'

const TONES = {
  /** Page background. The default; most sections are this. */
  plain: '',
  /** Their standard beige band, rgb(229 226 213). */
  beige: 'bg-band',
  /** The warmer sand their collection pages sit on, rgb(219 216 194). */
  sand: 'bg-band-strong',
  /**
   * Inverted. Not a mesonart tone — it is where our AI-generator section
   * lands, which was a brand-orange gradient and needed somewhere to go that
   * still reads as "this one is different" without reintroducing a hue.
   */
  ink: 'bg-foreground text-background',
} as const

export interface SectionBandProps extends React.HTMLAttributes<HTMLElement> {
  tone?: keyof typeof TONES
}

export function SectionBand({
  tone = 'plain',
  className,
  children,
  ...props
}: SectionBandProps) {
  return (
    <section className={cn('py-16 sm:py-24', TONES[tone], className)} {...props}>
      <div className="container-wide">{children}</div>
    </section>
  )
}

export default SectionBand
