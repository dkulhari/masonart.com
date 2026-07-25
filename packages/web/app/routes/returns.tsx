/**
 * Returns Policy Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/returns')({
  head: () => ({
    meta: [
      { title: 'Returns & Refunds | chobii.art' },
      { name: 'description', content: '30-day returns on chobii.art orders — how returns and refunds work.' },
    ],
  }),
  component: ReturnsPage,
})

function ReturnsPage() {
  return (
    <InfoPage title="Returns & Refunds" subtitle="Not feeling it on the wall? You have 30 days.">
      <InfoSection heading="The policy">
        <p>
          Return any order within <strong>30 days of delivery</strong> for a full refund. Start a
          return from{' '}
          <a href="/account/orders" className="text-primary hover:underline">
            your order history
          </a>{' '}
          (each delivered order has a &quot;Request Return&quot; option) or email{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>
          .
        </p>
      </InfoSection>

      <InfoSection heading="Conditions">
        <p>
          Items should come back in their original packaging and unused condition. Custom
          AI-generated prints are printed just for you, but they&apos;re covered by the same 30-day
          policy — if it doesn&apos;t look right in your space, send it back.
        </p>
      </InfoSection>

      <InfoSection heading="Damaged or wrong items">
        <p>
          Damaged in transit or received the wrong item? Skip the return flow — email us a photo
          within 48 hours of delivery and we&apos;ll ship a replacement or refund you immediately,
          no return required in most cases.
        </p>
      </InfoSection>

      <InfoSection heading="Refund timing">
        <p>
          Once your return is received and checked, refunds are issued to the original payment
          method within 5–7 business days. Wallet payments are refunded to your chobii.art wallet
          instantly.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
