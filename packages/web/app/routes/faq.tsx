/**
 * FAQ Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'
import { useFreeShippingThresholdLabel } from '~/lib/free-shipping'

export const Route = createFileRoute('/faq')({
  head: () => ({
    meta: [
      { title: 'FAQ | chobii.art' },
      { name: 'description', content: 'Frequently asked questions about chobii.art orders, shipping, returns, and the AI generator.' },
    ],
  }),
  component: FaqPage,
})

/**
 * The answers, given the free-shipping threshold in force. A function rather
 * than a constant because the threshold is an admin setting (#569/#570) and an
 * FAQ that keeps quoting the old figure is a false promise with a URL.
 */
function faqsFor(
  freeShippingThresholdLabel: string
): { q: string; a: string }[] {
  return [
    {
      q: 'How long does delivery take?',
      a: 'Orders are printed and dispatched within 2–4 business days. Delivery typically takes another 3–7 business days depending on your location. You get email (and optional SMS) updates at every step, plus a tracking link.',
    },
    {
      q: 'Is shipping free?',
      a: `Shipping is free on orders over ${freeShippingThresholdLabel}. Below that, the exact shipping cost is shown at checkout before you pay.`,
    },
    {
      q: 'What if my poster arrives damaged?',
      a: 'We repack or refund damaged orders — email support@chobii.art with a photo within 48 hours of delivery and we’ll sort it out quickly.',
    },
    {
      q: 'Can I return a poster I just don’t like?',
      a: 'Yes — returns are accepted within 30 days of delivery for a full refund. See the Returns page for the simple conditions.',
    },
    {
      q: 'How does the AI generator work?',
      a: 'Describe the artwork you want, pick a style preset and aspect ratio, and the generator creates variations for you. You can refine with new prompts, then order your favorite as a print in any frame.',
    },
    {
      q: 'Who owns the AI art I create?',
      a: 'You can order prints of anything you generate for personal use. Generations you choose to share may appear in the community gallery.',
    },
    {
      q: 'What payment methods do you accept?',
      a: 'Cards, UPI, netbanking, and wallets via Razorpay. Payment details never touch our servers.',
    },
    {
      q: 'Can I change or cancel an order?',
      a: 'If it hasn’t entered printing yet, usually yes — email support@chobii.art with your order number as soon as possible.',
    },
  ]
}

function FaqPage() {
  const faqs = faqsFor(useFreeShippingThresholdLabel())

  return (
    <InfoPage title="Frequently Asked Questions" subtitle="Quick answers to the most common questions.">
      {faqs.map((f) => (
        <InfoSection key={f.q} heading={f.q}>
          <p>{f.a}</p>
        </InfoSection>
      ))}
    </InfoPage>
  )
}
