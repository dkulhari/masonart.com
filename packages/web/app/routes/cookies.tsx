/**
 * Cookie Policy Page - chobii.art
 */

import { createFileRoute } from '@tanstack/react-router'
import { InfoPage, InfoSection } from '~/components/layout/InfoPage'

export const Route = createFileRoute('/cookies')({
  head: () => ({
    meta: [
      { title: 'Cookie Policy | chobii.art' },
      { name: 'description', content: 'The cookies chobii.art uses and why.' },
    ],
  }),
  component: CookiesPage,
})

function CookiesPage() {
  return (
    <InfoPage title="Cookie Policy" updated="July 2026">
      <InfoSection heading="What we use">
        <p>
          chobii.art uses a deliberately small set of cookies — no third-party advertising or
          cross-site tracking cookies.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Session cookie</strong> — keeps you signed in securely (HttpOnly, expires
            after 7 days).
          </li>
          <li>
            <strong>Cart storage</strong> — your cart lives in your browser&apos;s local storage
            so it survives page reloads, even before you sign in.
          </li>
          <li>
            <strong>Security & performance</strong> — our edge provider (Cloudflare) may set
            cookies needed to protect the site from abuse.
          </li>
        </ul>
      </InfoSection>

      <InfoSection heading="Managing cookies">
        <p>
          You can clear or block cookies in your browser settings at any time — signing in and
          checkout require the session cookie to function.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
