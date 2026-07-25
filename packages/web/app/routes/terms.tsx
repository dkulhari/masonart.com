/**
 * Terms of Service Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service | chobii.art' },
      { name: 'description', content: 'The terms that govern your use of chobii.art.' },
    ],
  }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <InfoPage title="Terms of Service" updated="July 2026">
      <InfoSection heading="Using chobii.art">
        <p>
          By creating an account or placing an order you agree to these terms. You must provide
          accurate account and delivery information and keep your credentials secure.
        </p>
      </InfoSection>

      <InfoSection heading="Orders & pricing">
        <p>
          All prices are in INR and include applicable taxes unless stated otherwise at checkout.
          An order is confirmed when payment succeeds; we may cancel and fully refund orders we
          cannot fulfil (e.g., stock or print issues).
        </p>
      </InfoSection>

      <InfoSection heading="AI-generated content">
        <p>
          You may not use the AI generator to create unlawful, infringing, or harmful content;
          prompts are filtered and generations may be moderated. You&apos;re responsible for the
          prompts you submit. Generations you share publicly may be displayed in the community
          gallery with attribution to your display name.
        </p>
      </InfoSection>

      <InfoSection heading="Intellectual property">
        <p>
          Catalog artwork, the chobii.art brand, and the site itself remain our (or our
          licensors&apos;) property. Prints you purchase are for personal, non-commercial use.
        </p>
      </InfoSection>

      <InfoSection heading="Returns, liability & disputes">
        <p>
          Returns are governed by our{' '}
          <a href="/returns" className="text-primary hover:underline">
            returns policy
          </a>
          . To the extent permitted by law, our liability for any claim is limited to the amount
          you paid for the order concerned. These terms are governed by the laws of India.
        </p>
      </InfoSection>

      <InfoSection heading="Contact">
        <p>
          Questions about these terms:{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>
          .
        </p>
      </InfoSection>
    </InfoPage>
  )
}
