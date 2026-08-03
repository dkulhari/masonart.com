/**
 * InfoPage - shared layout for static content pages (about, FAQ, policies).
 * Keeps the footer-linked pages visually consistent: centered column,
 * page header, and prose-styled sections.
 */

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { DisplayHeading } from '~/components/ui/DisplayHeading'

interface InfoPageProps {
  title: string
  subtitle?: string
  updated?: string
  children: ReactNode
}

export function InfoPage({ title, subtitle, updated, children }: InfoPageProps) {
  return (
    <div className="container-wide py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        {/* One edit, seven pages: about, faq, shipping, returns, terms,
            privacy, cookies all render through here. */}
        <DisplayHeading className="text-foreground">{title}</DisplayHeading>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        {updated && (
          <p className="mt-1 text-xs text-muted-foreground">Last updated: {updated}</p>
        )}

        <div className="mt-8 space-y-8">{children}</div>
      </div>
    </div>
  )
}

interface InfoSectionProps {
  heading: string
  children: ReactNode
}

export function InfoSection({ heading, children }: InfoSectionProps) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-foreground">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}
