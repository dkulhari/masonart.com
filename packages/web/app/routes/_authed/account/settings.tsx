/**
 * Account Settings Page - chobii.art E-commerce Platform
 *
 * v1 settings hub: read-only profile summary plus links to the editable
 * preference areas (addresses, notifications). Created to fix the 404 the
 * account header/quick-action settings links pointed at.
 *
 * Following patterns from addresses.tsx / index.tsx
 */

import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react'
import { formatDate } from '~/lib/utils'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/_authed/account/settings')({
  head: () => ({
    meta: [
      { title: 'Account Settings | chobii.art' },
      { name: 'description', content: 'View your profile and manage account preferences.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SettingsPage,
})

// ============================================================================
// Main Component
// ============================================================================

function SettingsPage() {
  const { user } = Route.useRouteContext()

  const preferenceLinks = [
    {
      title: 'Saved Addresses',
      description: 'Manage shipping and billing addresses',
      icon: MapPin,
      href: '/account/addresses',
    },
    {
      title: 'Notification Preferences',
      description: 'Choose which email and SMS updates you receive',
      icon: Bell,
      href: '/account/notifications',
    },
  ]

  return (
    <div className="container-wide py-8">
      <a
        href="/account"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Account
      </a>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Settings className="h-5 w-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
          <p className="text-sm text-muted-foreground">
            Your profile details and account preferences
          </p>
        </div>
      </div>

      {/* Profile */}
      <section className="mb-8 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Profile</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium text-foreground">{user.name || '—'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="text-sm font-medium text-foreground">{user.email}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Phone</dt>
              <dd className="text-sm font-medium text-foreground">
                {(user as { phone?: string }).phone || 'Not added'}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Member since
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {user.createdAt
                  ? formatDate(user.createdAt, { month: 'long', year: 'numeric' })
                  : '—'}
              </dd>
            </div>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Need to change your name or email? Contact us at support@chobii.art and we&apos;ll help
          you out.
        </p>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Preferences</h2>
        <div className="divide-y divide-border">
          {preferenceLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-4 py-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <link.icon className="h-4 w-4 text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{link.title}</p>
                <p className="text-xs text-muted-foreground">{link.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
