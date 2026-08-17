/**
 * Vendor portal shared bits.
 *
 * Deliberately tiny, and deliberately NOT `admin-nav.ts`. The admin navigation
 * module answers "which staff role may see which admin path"; this one answers
 * nothing about permissions at all — the `/vendor` guard does that, and the API
 * scopes every row. What lives here is the handful of constants and formatters
 * the four vendor screens share, so they cannot drift apart.
 *
 * The one rule worth stating: **no formatter here ever substitutes a zero.**
 * `formatVendorAmount` returns null when a value will not parse and the screens
 * print "Unavailable". A confident `₹0.00` over a failed read is #602/#606, and
 * on this surface it means telling a print shop we owe them nothing.
 */

/** Rows per page in the vendor job queue. The API's own default. */
export const VENDOR_JOBS_PAGE_SIZE = 20

/** The API clamps here; asking beyond it just gets clamped anyway. */
export const VENDOR_JOBS_MAX_PAGE_SIZE = 100

/**
 * Default search params for `/vendor`.
 *
 * Every `Link` to the queue must carry these. `router.tsx` keeps search values
 * as strings, and the route's `validateSearch` coerces them back — but a link
 * with no search at all navigates to a bare `/vendor`, which is a different URL
 * from the one the screen writes and makes the active-nav state flicker.
 */
export const VENDOR_JOBS_SEARCH = {
  page: 1,
  pageSize: VENDOR_JOBS_PAGE_SIZE,
} as const

/**
 * The job statuses a vendor sees, in the order the work moves.
 *
 * `draft` is absent: a draft job has not been assigned to anyone, so it can
 * never appear in a scoped read and offering it as a filter would offer a view
 * that is empty by construction.
 */
export const VENDOR_JOB_STATUSES = [
  'assigned',
  'sent',
  'received',
  'qc_passed',
  'qc_failed',
  'cancelled',
] as const

export type VendorJobStatus = (typeof VENDOR_JOB_STATUSES)[number]

export const VENDOR_JOB_STATUS_LABELS: Record<VendorJobStatus, string> = {
  assigned: 'Assigned to you',
  sent: 'Sent back',
  received: 'Received by you',
  qc_passed: 'Passed QC',
  qc_failed: 'Failed QC',
  cancelled: 'Cancelled',
}

export const VENDOR_JOB_STATUS_STYLES: Record<VendorJobStatus, string> = {
  assigned: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  sent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  qc_passed: 'bg-green-50 text-green-700 border-green-200',
  qc_failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

export const VENDOR_JOB_STAGES = ['print', 'frame'] as const
export type VendorJobStage = (typeof VENDOR_JOB_STAGES)[number]

/**
 * Rupees, or null.
 *
 * Null rather than `₹0.00` when the string will not parse: the caller renders
 * "Unavailable", because a wrong zero beside "we owe you" is worse than a gap.
 */
export function formatVendorAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** A date, or an em dash. Never "Invalid Date", never today's date as a stand-in. */
export function formatVendorDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Whole days until `dueAt`, or null when there is no due date.
 *
 * Negative means overdue. Returned as a number so the caller decides the
 * wording — "2 days late" and "due in 2 days" are the same arithmetic.
 */
export function daysUntil(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return null
  const MS_PER_DAY = 86_400_000
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const startOfNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((startOfDue - startOfNow) / MS_PER_DAY)
}
