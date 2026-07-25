/**
 * Privacy Policy Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy | chobii.art' },
      { name: 'description', content: 'How chobii.art collects, uses, and protects your data.' },
    ],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy" updated="July 2026">
      <InfoSection heading="What we collect">
        <p>
          Account details you give us (name, email, phone number), your saved addresses, order
          history, notification preferences, and the prompts and images you create with the AI
          generator. Basic technical logs (IP address, browser) are kept for security and
          debugging.
        </p>
      </InfoSection>

      <InfoSection heading="How we use it">
        <p>
          To run your account, print and deliver your orders, send transactional email and SMS you
          have opted into, prevent fraud, and improve the product. We do not sell your personal
          data.
        </p>
      </InfoSection>

      <InfoSection heading="Payments">
        <p>
          Payments are processed by Razorpay. Your card, UPI, and banking details go directly to
          Razorpay over their secure infrastructure — they never touch our servers.
        </p>
      </InfoSection>

      <InfoSection heading="Service providers">
        <p>
          We use a small set of processors to operate: Cloudflare (hosting, image storage and
          delivery), Razorpay (payments), Resend (email), 2Factor (SMS), and error-monitoring
          tooling. Each receives only what it needs to do its job.
        </p>
      </InfoSection>

      <InfoSection heading="Your choices">
        <p>
          You can update notification preferences in your account, and request a copy or deletion
          of your data by emailing{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>
          . We retain order records as required for tax and accounting compliance.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
