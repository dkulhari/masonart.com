/**
 * Shipping Policy Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/shipping')({
  head: () => ({
    meta: [
      { title: 'Shipping Policy | chobii.art' },
      { name: 'description', content: 'Shipping costs, timelines, and tracking for chobii.art orders.' },
    ],
  }),
  component: ShippingPage,
})

function ShippingPage() {
  return (
    <InfoPage title="Shipping" subtitle="How your art gets from our press to your wall.">
      <InfoSection heading="Costs">
        <p>
          Shipping is <strong>free on orders over ₹999</strong>. For smaller orders, the shipping
          cost is calculated and shown at checkout before payment — no surprises.
        </p>
      </InfoSection>

      <InfoSection heading="Timelines">
        <p>
          Every piece is printed to order. Production takes 2–4 business days; delivery adds
          another 3–7 business days depending on your pincode. Framed orders can take a little
          longer than poster-only orders.
        </p>
      </InfoSection>

      <InfoSection heading="Tracking">
        <p>
          You&apos;ll receive a tracking link by email as soon as your order ships, with optional
          SMS updates. You can also check status anytime on the{' '}
          <a href="/track" className="text-primary hover:underline">
            order tracking page
          </a>{' '}
          using just your order number.
        </p>
      </InfoSection>

      <InfoSection heading="Packaging">
        <p>
          Posters ship rolled in rigid tubes; framed pieces ship in corner-protected, double-walled
          boxes. If anything arrives damaged, email{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>{' '}
          with a photo within 48 hours and we&apos;ll replace or refund it.
        </p>
      </InfoSection>

      <InfoSection heading="Coverage">
        <p>
          We currently ship across India. International shipping isn&apos;t available yet — it&apos;s
          on our roadmap.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
