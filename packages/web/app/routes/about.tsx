/**
 * About Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'
import { useFreeShippingThresholdLabel } from '~/lib/free-shipping'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: 'About Us | chobii.art' },
      {
        name: 'description',
        content:
          'chobii.art is a premium poster and custom framing studio with an AI art generator — wall art made for your space.',
      },
    ],
  }),
  component: AboutPage,
})

function AboutPage() {
  // "Our promise" states the threshold in force — an admin can change it
  // without a deploy (#570), and a promise that cannot follow it is not one.
  const freeShippingThresholdLabel = useFreeShippingThresholdLabel()

  return (
    <InfoPage
      title="About chobii.art"
      subtitle="Premium posters, custom frames, and AI-generated art for your space."
    >
      <InfoSection heading="What we do">
        <p>
          chobii.art is a poster and framing studio built around one idea: great walls make great
          rooms. We offer a curated collection of premium posters across styles — from wabi-sabi
          and botanical to pop art and typography — printed on quality stock and finished with
          frames, mats, and glass options you can mix to suit your space.
        </p>
      </InfoSection>

      <InfoSection heading="Create your own with AI">
        <p>
          Can&apos;t find the exact piece you&apos;re imagining? Our AI generator turns your prompt
          into gallery-ready artwork in a range of styles and aspect ratios. Generate variations,
          pick your favorite, and order it as a print with the frame of your choice.
        </p>
      </InfoSection>

      <InfoSection heading="Our promise">
        <p>
          Free shipping on orders over {freeShippingThresholdLabel}, careful packaging built for
          prints, and 30-day
          returns if a piece doesn&apos;t feel right in your space. Questions? We&apos;re at{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>
          .
        </p>
      </InfoSection>
    </InfoPage>
  )
}
