/**
 * BrandStorySection — mesonart's home section 11, the sage band that carries
 * the brand copy: heading, a one-line lead, the story, a "Read More" pill, and
 * a media panel on the right that stacks under the copy on mobile.
 *
 * ## The copy is ours, and it is not a rewrite of theirs
 *
 * Their band tells a founder story about a named person and his friend. That
 * is another company's history; paraphrasing it would put a fabricated origin
 * on our home page, which is worse than having none. Every sentence below is
 * lifted from what chobii.art already says about itself in
 * `app/routes/about.tsx` — the "great walls make great rooms" line, the
 * curated-styles sentence and the AI-generator sentence are that page's own
 * words, compressed. The Footer blurb says the same thing in one line.
 *
 * That is also why "Read More" points at `/about`: the band is a précis of a
 * page that exists, so the link goes to the longer version rather than to a
 * `/our-story` route we have never built.
 *
 * ## The media panel: a placeholder photograph, and no play button
 *
 * Theirs is a video still with a play triangle over it. We have no brand video
 * and no interior photography of our own — `/images/categories/*.jpg` and
 * `/og-*.jpg` are flat generated graphics, and every catalogue `room-mockup`
 * is seeded from the third-party reference set that
 * docs/design/mesonart/mesonart-parity-analysis.md §3.2 calls
 * "fine to develop against, not fine to launch on", watermarked across the
 * artwork.
 *
 * So the slot holds a development placeholder from
 * `public/dev-reference/`, which is git-ignored precisely because these are
 * not our photographs. **#544 blocks go-live on replacing it.** It is routed
 * through the single BRAND_STORY_MEDIA constant below so that replacement is
 * one line rather than a hunt through JSX.
 *
 * `story/portrait.png`, not `story/still.jpg`: the two are frames of the same
 * clip, and `still.jpg` is the cover frame, with a competitor's wordmark and
 * tagline burned into the pixels. Putting that in our band would ship someone
 * else's logo on our home page — the placeholder allowance covers borrowing a
 * photograph, not displaying their branding.
 *
 * There is no play affordance over it. A play triangle on a still promises a
 * video we do not have; the rest of the band is under the same rule as the
 * copy.
 *
 * ## Geometry
 *
 * Measured off the bar at 1440 and 390 (2× captures, halved):
 *
 * | | bar | here |
 * |---|---|---|
 * | band inset from viewport | ~7px | 8px / 16px ≥sm |
 * | band corner radius | ~22px | 24px |
 * | band padding | 20px mobile, 40px desktop | same |
 * | media column | 394×364 | 25rem, row-spanned to full height |
 * | heading | ~32px mobile, ~48px desktop | text-3xl → text-5xl |
 *
 * The band uses `SectionBand bleed` rather than a bare `<section>`. #538
 * originally opted out of SectionBand entirely, because SectionBand nested
 * `container-wide` inside its full-bleed section — that inset the panel by the
 * page gutter and then the panel's own padding indented the copy by roughly
 * the gutter again, so at 390 the copy sat at ~40px against the bar's 20px.
 * #540 gave SectionBand a `bleed` variant for exactly this shape, so the band
 * is back inside the abstraction and keeps its vertical rhythm from it. The
 * `px-2 py-8 sm:px-4 sm:py-12` override is what displaces SectionBand's
 * default `py-16 sm:py-24` — the panel's own inset is ~7px on the bar, much
 * tighter than the page gutter, which is why it does not want a container.
 */

import { ArrowRight } from 'lucide-react'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { buttonVariants } from '~/components/ui/Button'
import { SectionBand } from '~/components/ui/SectionBand'
import { cn } from '~/lib/utils'

/**
 * THE ONE PLACE THE BAND'S MEDIA IS NAMED.
 *
 * Swapping in chobii.art's own photography is an edit to this object and
 * nothing else. Until that happens the band is showing borrowed reference
 * imagery out of the git-ignored `public/dev-reference/` tree, and #544 holds
 * go-live until it is replaced.
 *
 * `width`/`height` are the file's intrinsic pixels, declared so the browser
 * reserves the box and the band does not reflow around a late image.
 */
export const BRAND_STORY_MEDIA = {
  src: '/dev-reference/story/portrait.png',
  alt: 'A large framed piece being hung against a sunlit wall',
  width: 407,
  height: 543,
} as const

/**
 * The band.
 *
 * Presentational and prop-free on purpose: every asset it needs is static, so
 * there is no loading state, no empty state and nothing for the home route's
 * loader to pass it. Mounting it is `<BrandStorySection />`.
 */
export function BrandStorySection() {
  return (
    <SectionBand
      bleed
      data-testid="home-brand-story"
      className="px-2 py-4 sm:px-4 sm:py-12"
    >
      <div className="mx-auto max-w-[var(--page-width)] rounded-[24px] bg-band-strong px-5 py-6 sm:py-8 lg:px-10 lg:py-16">
        {/*
          Three blocks, two orders. Stacked on mobile the bar runs
          heading → media → lead → story → pill, which is why the media is its
          own grid child rather than a sibling of the copy: at lg it moves into
          the second column and spans both rows, and the copy keeps its
          reading order in the first.
        */}
        <div className="grid grid-cols-1 gap-y-5 sm:gap-y-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-x-14 lg:gap-y-12">
          {/* 24px on a phone, which is what the bar sets for every one of its
              band headings at 390 — this one was alone at 30 (#541). */}
          <DisplayHeading
            as="h2"
            className="text-2xl text-foreground sm:text-4xl lg:col-start-1 lg:row-start-1 lg:text-5xl"
          >
            Brand Story
          </DisplayHeading>

          {/*
            Media — row 1 on mobile after the heading, right column at lg.

            Absolutely positioned at lg rather than sized with `h-full`: this
            cell's row height comes from the copy beside it, so a percentage
            height would be resolving against a track that is itself sizing to
            content, and the image falls back to its intrinsic height — a
            900px column. Out of flow it simply fills whatever the copy makes
            the row, which is how the bar's still fills its band. `min-h` is
            the floor for the case where the copy is shorter than the photo.

            Square corners and no rounding, as measured on the bar. 3:4 stacked
            (their mobile crop, and this file's native ratio), landscape at sm,
            and whatever the copy dictates at lg.
          */}
          <div className="lg:relative lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-[24rem]">
            <img
              src={BRAND_STORY_MEDIA.src}
              alt={BRAND_STORY_MEDIA.alt}
              width={BRAND_STORY_MEDIA.width}
              height={BRAND_STORY_MEDIA.height}
              loading="lazy"
              decoding="async"
              className="aspect-[3/4] w-full bg-band object-cover sm:aspect-[4/3] lg:absolute lg:inset-0 lg:aspect-auto lg:h-full"
            />
          </div>

          {/* Copy — lead, story, CTA. Row 2 in the first column at lg.
              `max-w` caps the measure at the bar's ~920px story column; without
              it the first column runs the full 1100px the grid gives it and the
              lines get too long to track. */}
          <div className="lg:col-start-1 lg:row-start-2 lg:max-w-[58rem]">
            {/* The lead is the same size as the story on the bar, at both
                widths — it is set apart by standing alone and by the full-ink
                colour, not by a type step. */}
            <p className="text-base text-foreground sm:text-lg lg:text-xl">
              Great walls make great rooms.
            </p>

            {/* 16px on a phone against the bar's 16, and it matters more here
                than anywhere else on the page: at 18px in a panel that is
                already inset twice, this copy ran 14 lines and made Brand
                Story the tallest band we own — 1234px against 963 (#541). */}
            <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/80 sm:mt-8 sm:space-y-6 sm:text-lg lg:text-xl">
              <p>
                chobii.art is a poster and framing studio built around that one
                idea. We curate premium posters across styles — wabi-sabi and
                botanical through pop art and typography — print them on quality
                stock, and finish them with the frames, mats and glass you pick
                to suit the room.
              </p>
              <p>
                And when the piece you are picturing does not exist yet, our AI
                generator makes it: describe it, choose a style, and order it as
                a print in the frame of your choice.
              </p>
            </div>

            {/* Their one CTA in this band, and ours: an outline pill with a
                trailing arrow. Plain anchor, as every other home-page link is. */}
            <a
              href="/about"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'pill' }),
                'mt-6 sm:mt-10'
              )}
            >
              Read More
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </SectionBand>
  )
}

export default BrandStorySection
