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
 *
 * The vertical rhythm is two numbers, not one. At 390 the bar does not pad its
 * bands symmetrically at all: measured band by band, its content sits 24–45px
 * below the seam and its last element ends ON the seam, so a phone seam costs
 * ~32px in total. Ours spent 64 above AND 64 below every band, which is where
 * #541 found the page reading as whitespace between things to buy rather than
 * a shop. `py-8` is that seam; `sm:py-24` is the desktop band, untouched,
 * because above 640 the bar's own bands open back up.
 *
 * By default the children are wrapped in `container-wide`, so a band is
 * full-bleed in colour and page-width in content. A band that is itself a
 * full-width inset panel wants `bleed` instead — see the prop.
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
  /**
   * Skip the inner `container-wide` and hand the band's own box the full
   * width of the section.
   *
   * Use this — and only this — when the band IS an inset panel: a rounded
   * colour or image plate that spans the page and carries its own padding.
   * The default wrapper would inset that plate by the page gutter and then
   * the plate's own padding would indent the copy by roughly the gutter
   * again, so at 390 the copy sits at ~40px against the bar's 20px and the
   * column visibly narrows. #538's Brand Story band hit exactly that and
   * opted out of SectionBand altogether; this prop is so the next such band
   * keeps the vertical rhythm instead of forking away from it.
   *
   * A bleeding band owns its horizontal geometry completely. If it wants the
   * page gutter it must ask for it — `container-wide`, or
   * `max-w-[var(--page-width)] mx-auto px-[var(--page-padding)]` — rather
   * than inventing a literal, or it will drift out of line with the bands
   * above and below it as the gutter ramps.
   */
  bleed?: boolean
}

export function SectionBand({
  tone = 'plain',
  bleed = false,
  className,
  children,
  ...props
}: SectionBandProps) {
  return (
    <section className={cn('py-8 sm:py-24', TONES[tone], className)} {...props}>
      {bleed ? children : <div className="container-wide">{children}</div>}
    </section>
  )
}

export default SectionBand
