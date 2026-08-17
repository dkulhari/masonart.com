/**
 * Admin — add a vendor.
 *
 * Thin over `POST /api/admin/vendors`. Contacts, capabilities and the rate card
 * are all nested resources with their own endpoints, so they are added on the
 * detail page once the vendor row exists — this form asks for the one thing the
 * API requires (a name) and gets out of the way.
 *
 * The failure is shown verbatim. The API's messages name the field that was
 * refused, and paraphrasing them to "Something went wrong" is what leaves an
 * admin retrying the same bad value.
 */

import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { ADMIN_VENDORS_SEARCH } from '~/lib/admin-nav'
import { VendorForm, type vendorPayload } from './VendorForm'

export const Route = createFileRoute('/admin/vendors/new')({
  head: () => ({
    meta: [
      { title: 'New vendor | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewVendorPage,
})

function NewVendorPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const create = async (payload: ReturnType<typeof vendorPayload>) => {
    setIsSaving(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/vendors`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        vendor?: { id: string }
      }
      if (!response.ok || !body.vendor) {
        throw new Error(body.error ?? 'Failed to create the vendor')
      }
      setError(null)
      // Straight to the detail page: contacts, capabilities and rates all need
      // the id, and bouncing back to the list would hide that.
      void navigate({
        to: '/admin/vendors/$id',
        params: { id: body.vendor.id },
      })
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/vendors"
          search={ADMIN_VENDORS_SEARCH}
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Vendors
        </Link>
        <h1 className="text-2xl font-medium">New vendor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contacts, capabilities and the rate card are added on the vendor's page
          once it exists.
        </p>
      </div>

      <VendorForm
        onSubmit={create}
        submitLabel="Create vendor"
        submitError={error}
        isSaving={isSaving}
      />
    </div>
  )
}
