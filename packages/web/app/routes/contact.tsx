/**
 * Contact Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { Mail, MessageCircle, Package } from 'lucide-react'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/contact')({
  head: () => ({
    meta: [
      { title: 'Contact Us | chobii.art' },
      { name: 'description', content: 'Get in touch with the chobii.art team.' },
    ],
  }),
  component: ContactPage,
})

function ContactPage() {
  return (
    <InfoPage title="Contact Us" subtitle="We usually reply within one business day.">
      <InfoSection heading="Support">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-4 w-4" />
          <p>
            Email us anytime at{' '}
            <a href="mailto:support@chobii.art" className="text-primary hover:underline">
              support@chobii.art
            </a>{' '}
            — orders, returns, framing questions, or anything else.
          </p>
        </div>
      </InfoSection>

      <InfoSection heading="Order help">
        <div className="flex items-start gap-3">
          <Package className="mt-0.5 h-4 w-4" />
          <p>
            Tracking a shipment? Use the{' '}
            <a href="/track" className="text-primary hover:underline">
              order tracking page
            </a>{' '}
            with your order number — no account needed.
          </p>
        </div>
      </InfoSection>

      <InfoSection heading="Feedback">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 h-4 w-4" />
          <p>
            Ideas for styles you&apos;d love to see, or feedback on the AI generator? We read
            everything — tell us at the same address.
          </p>
        </div>
      </InfoSection>
    </InfoPage>
  )
}
