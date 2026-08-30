/**
 * `/vendor/jobs/$id` — one job.
 *
 * Its items, its artwork, its QC history, and the two status changes a vendor
 * is allowed to make. Everything on this page comes from
 * `GET /api/vendor/jobs/:id`, which is scoped by `vendorId` in the WHERE — a
 * job belonging to someone else is a 404 here, not a 403, and this screen shows
 * that 404 as plainly "not found" rather than "not yours". Confirming the job
 * exists is the one fact the API deliberately withholds; the UI must not put it
 * back.
 *
 * ## Artwork URLs are requested AT CLICK TIME
 *
 * `GET /api/vendor/jobs/:id/artwork/:itemId` returns a signed URL that lives
 * five minutes. This screen therefore holds no URL at all: the click calls the
 * endpoint, and the URL it gets back is used immediately and dropped.
 *
 * Fetching them at page load would mean a page left open over lunch has a
 * grid of dead links — and the fix that suggests itself, a longer expiry, is
 * precisely the incident signing exists to prevent. A vendor's artwork link is
 * a customer's commissioned image; a long-lived one stays readable by anyone
 * who ever saw the URL, in a chat log or a proxy log, forever.
 * `tests/routes/vendor/no-customer-data.test.tsx` asserts nothing is fetched
 * from the artwork endpoint on render.
 *
 * ## The actions come from the matrix, not from this file
 *
 * This screen used to hold two hardcoded buttons — "Mark received" and "Mark
 * ready & sent back" — over a `'sent' | 'received'` literal. Both halves of that
 * were wrong by Phase 5: `PATCH /api/vendor/jobs/:id` narrows its body with
 * `z.enum(VENDOR_SETTABLE_STATUSES)`, which is derived from the transition
 * matrix and reads `['received', 'qc_submitted', 'dispatched']`, so the second
 * button could only ever produce a 400 while the two statuses a vendor actually
 * produces had no control at all.
 *
 * `VendorJobActions` renders `nextVendorActions(status, guards)` from
 * `lib/vendor-nav`, which is `nextStatuses(status, 'vendor')` over the same
 * `@chobii/shared` table the API imports. So the buttons cannot disagree with
 * what the API will accept, and three rules need no code here because the
 * matrix already states them: `qc_passed` and `qc_failed` are ours to record
 * (a verdict with no review row is a verdict with no evidence), `cancelled` is
 * ours, and `sent` is retired with no edges in either direction.
 *
 * A status where the matrix gives a vendor no move renders a sentence rather
 * than an empty strip — an action bar that simply vanishes is indistinguishable
 * from one that failed to render.
 *
 * Every action is still the two-step inline confirm from
 * `routes/admin/vendors/$id.tsx`: no `window.confirm`, which blocks the browser
 * automation harness and is why nine admin files have no E2E coverage on their
 * destructive paths.
 *
 * ## The shot list is the shared list; only the photographs are the API's
 *
 * `VendorQcShotList` renders `QC_SHOT_LIST` from `@chobii/shared` — the exact
 * list `assertShotListComplete` validates against — and hangs whatever
 * `GET /api/vendor/jobs/:id/photos` returns off it. The split is why the panel
 * still says what to shoot while the photographs are loading, and after a
 * failed read: an empty panel would tell a print shop nothing is asked of them.
 *
 * "Send for approval" is disabled until every required slot is live, and the
 * evidence for that comes from the photographs actually on screen rather than
 * from a second count. When they have not been read the guard is left ABSENT,
 * which `nextVendorActions` treats as unknown and leaves the move live — the
 * API evaluates the guard either way, and greying out a legal move because a
 * request has not come back is worse than spending a round trip. When the API
 * refuses anyway, its 422 names the missing slots and `VendorJobWriteError`
 * carries them through so the screen can name them back. A refusal a vendor
 * cannot act on is a support ticket.
 *
 * Uploads go presign -> PUT straight to R2 -> complete, `review-media.ts`'s
 * pattern. The bytes never route through our API; a 25MB raking-light shot
 * through Hono holds a request open on the box that also serves the storefront.
 * A re-upload SUPERSEDES: the row is not deleted, `superseded_at` plus a partial
 * unique index keeps one live photo per slot, and the screen says so rather than
 * silently swapping the thumbnail.
 *
 * ## A photograph is shown; its signature is not
 *
 * `QcPhotoImage` fetches the bytes and renders them from a local `blob:` URL
 * instead of putting the presigned URL in `src`. §6 of the design (R2) says
 * customer data reaches a vendor only as opaque bytes behind a short-lived
 * signature and NEVER as something rendered into the portal's own DOM;
 * `tests/routes/vendor/no-customer-data.test.tsx` enforces the mechanical half
 * of that on this whole screen — no `iframe`, `embed` or `object`, and no
 * `X-Amz-Signature` anywhere in the markup. These photographs are the vendor's
 * own work and showing them is the point of the panel, so the rule that bites
 * is the second one: a signed URL in the DOM is a capability sitting in every
 * screenshot and bug report the vendor ever files.
 *
 * ## The carrier label is a BUTTON, and the bytes go to the operating system
 *
 * `VendorLabelHandoverCard` is the only place on this whole boundary where a
 * customer's name, address and phone reach a vendor — and they reach them
 * INSIDE A PDF, never as data. §6 (R2) allows that on three conditions: opaque
 * rendered bytes, a short-lived signature, and the file handed to the OS. So the
 * control is a button, `GET /api/vendor/jobs/:id/label` is called in the click
 * handler, the bytes are fetched from the signature and saved through a local
 * `blob:` URL, and nothing carrying the signature ever touches this document.
 *
 * **Never an `<iframe>`, `<embed>` or `<object>`.** An inline viewer would put
 * the customer's address into the vendor portal's own markup, which is exactly
 * what R2 forbids. `tests/routes/vendor/no-customer-data.test.tsx` asserts it
 * twice over: on the rendered screen, and — because a rendered-state assertion
 * can be reopened by a branch no test happens to enter — on the SOURCE of all
 * five files in this tree.
 *
 * The card renders where `nextVendorActions` says the matrix gates that edge on
 * `open-transfer-or-order-label`, not where this file remembers `qc_passed`.
 * The API's own `LABEL_ACCESS_STATUSES` is derived the same way from the same
 * shared table, so the card cannot appear on a job whose label the route would
 * refuse. That route answers **503 `LABEL_NOT_AVAILABLE`** in every environment
 * today, because `order_shipments.label_object_token` is a declared seam owned
 * by `order-dispatch-tracking` and does not exist yet. The card says so
 * honestly, in ITS OWN words rather than the body's, so our schema cannot be
 * narrated to a supplier through it.
 *
 * ## Parcels are a fact about the VENDOR, not about this job
 *
 * A frame job cannot start until the printed sheet reaches the bench, so this
 * screen says when something is still in transit. It says the vendor is
 * waiting, not that THIS job's parcel is coming, because the link is genuinely
 * unavailable here: `production_transfers.order_id` is withheld from every
 * vendor-facing projection under R1, and `GET /transfers/:id` scopes `jobIds` to
 * the caller's own jobs. The strip itself, and the arrival confirmation, live on
 * `/vendor` — reconstructing the join here would mean asking the API to widen
 * exactly what it narrows.
 *
 * "Still in transit" means despatched and not yet confirmed, never merely
 * unconfirmed: a parcel with `dispatched_at IS NULL` is on the SENDER's bench,
 * and announcing it here sent a vendor looking for a courier nobody called. And
 * the read is made only on a FRAME job, because that is the only job the
 * sentence can appear on — nothing is couriered to a print shop, so on a print
 * job the request bought a result the render throws away.
 *
 * ## A failed write does not blank a good read
 *
 * `actionError` is separate from the page error and renders beside the buttons.
 * Routing a 409 into the page error would destroy a job that loaded perfectly —
 * summary, items, artwork and QC history all at once — which is #684 on the
 * admin side of the same workflow.
 *
 * ## Nothing here invents a number
 *
 * A failed load renders the error and stops: no ₹0, no dash standing in for an
 * amount, no empty item list for a job that simply failed to fetch.
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Download } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import {
  QC_PHOTO_CONTENT_TYPES,
  QC_PHOTO_MAX_BYTES,
  qcShotsForStage,
  type ProductionJobStatus,
  type QcStage,
} from '@chobii/shared'
import {
  VENDOR_JOBS_SEARCH,
  formatVendorAmount,
  formatVendorDate,
  nextVendorActions,
  vendorJobIsOpen,
  vendorMayUploadPhotos,
  vendorNoActionReason,
  type VendorGuardState,
  type VendorJobStage,
  type VendorJobStatus,
} from '~/lib/vendor-nav'
import {
  DueCell,
  InlineConfirm,
  VendorJobStatusPill,
  fetchInboundAwaitingArrival,
  inboundAwaitingArrival,
  vendorJobPayableAmount,
  type VendorTransfer,
} from '~/routes/vendor/index'

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute('/vendor/jobs/$id')({
  head: () => ({
    meta: [
      { title: 'Job | Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorJobDetailPage,
})

// ============================================================================
// Types — the GET /api/vendor/jobs/:id payload, verbatim
// ============================================================================

export interface VendorJob {
  id: string
  stage: VendorJobStage
  /** The pgEnum's type, not the filter's — rows still carry the retired value. */
  status: ProductionJobStatus
  dueAt: string | null
  /**
   * Still selected by `lib/vendor-scope.ts`, and deliberately not rendered.
   *
   * It is the timestamp of the retired `sent`, and the line that used to print
   * it said "Sent back to us" — a sentence about goods returning to our
   * building, which is a workflow that stopped existing at §4. The column keeps
   * its history; the portal stops narrating it.
   */
  sentAt: string | null
  receivedAt: string | null
  amountExpected: string | null
  amountActual: string | null
}

/**
 * An item is an ID and nothing else.
 *
 * `getVendorJobItems` selects `{ id }` alone — `orderItemId` was removed by the
 * isolation suite in #617 because it joins straight to `order_items.order_id`
 * and from there to the buyer. The artwork route keys on this id, so nothing is
 * missing.
 */
export interface VendorJobItem {
  id: string
}

export interface VendorJobReview {
  id: string
  verdict: 'pass' | 'fail'
  defects: string[] | null
  notes: string | null
  createdAt: string
}

export interface VendorJobDetailResponse {
  job: VendorJob
  items: VendorJobItem[]
  reviews: VendorJobReview[]
}

export interface VendorArtworkResponse {
  itemId: string
  url: string
  expiresInSeconds: number
  expiresAt: string
}

// ============================================================================
// Fetchers
// ============================================================================

export async function fetchVendorJob(id: string): Promise<VendorJobDetailResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${id}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    // 404 is passed through as written. The API refuses to distinguish "no such
    // job" from "not your job", and repeating that here is the point.
    throw new Error(body.error ?? 'Failed to load this job')
  }

  return (await response.json()) as VendorJobDetailResponse
}

/**
 * The signed artwork URL, requested for ONE item, at the moment it is wanted.
 *
 * Exported so a test can assert both halves of the rule: that a click calls it,
 * and that a render does not.
 */
export async function requestArtworkUrl(
  jobId: string,
  itemId: string
): Promise<VendorArtworkResponse> {
  const response = await fetch(
    `${getApiUrl()}/api/vendor/jobs/${jobId}/artwork/${itemId}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to get the artwork link')
  }

  return (await response.json()) as VendorArtworkResponse
}

/**
 * The one write a vendor gets, and it names a TRANSITION rather than a patch.
 *
 * The parameter is no longer a `'sent' | 'received'` literal. That literal was
 * the second copy of a vocabulary the matrix already owns, and it had gone
 * stale in both directions — it offered a retired status the API answers with a
 * 400, and it could not name `qc_submitted` or `dispatched`. The only caller is
 * `VendorJobActions`, whose targets come from `nextVendorActions`, so the set
 * this can be handed is the matrix's vendor edges by construction.
 *
 * The body is ONE field. `receivedAt` and `sentAt` used to be sent from the
 * browser's clock; `updateJobSchema` has no date field to receive them any
 * more, and the server stamps `receivedAt`, `qcSubmittedAt` and `dispatchedAt`
 * itself. A vendor back-dating "I had it three days ago" is not a data-entry
 * convenience, it is a lie about an SLA clock. No amount field either: amounts
 * are what we owe, priced from the rate card at assignment.
 */
export async function patchVendorJobStatus(
  id: string,
  status: VendorJobStatus
): Promise<VendorJob> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

  if (!response.ok) {
    // The BODY is kept, not flattened into a sentence. A 422 carries
    // `missingSlots`, and that list is the only thing on this screen a vendor
    // can act on — see `VendorJobWriteError`.
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
      code?: string
      missingSlots?: string[]
    }
    throw new VendorJobWriteError(body.error ?? 'Failed to update this job', {
      status: response.status,
      code: body.code,
      missingSlots: Array.isArray(body.missingSlots) ? body.missingSlots : undefined,
    })
  }

  const body = (await response.json()) as { job: VendorJob }
  return body.job
}

// ============================================================================
// Two-step confirm — no native dialogs anywhere in this tree
// ============================================================================

/**
 * Re-exported, not defined here.
 *
 * `InlineConfirm` moved to `routes/vendor/index.tsx` when the parcel strip
 * (#693) needed the same two-step on the queue screen. It could not stay here:
 * this file already imports from that one, so hosting it here and importing it
 * there would make the two route files import each other, and the portal is
 * asserted to be EXACTLY four screens under one layout — there is no fifth file
 * to put it in. The re-export keeps every existing importer, including
 * `tests/routes/vendor/vendor-screens.test.tsx`, pointing at this path.
 *
 * The rule it exists for is unchanged: a native `confirm()` blocks the browser
 * automation harness, so any path guarded by one can never be covered end to
 * end.
 */
export { InlineConfirm } from '~/routes/vendor/index'

// ============================================================================
// Artwork
// ============================================================================

/** Hand the browser a URL that is already expiring. Nothing is stored. */
function openSignedUrl(url: string) {
  if (typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/**
 * One item's download control.
 *
 * The signed URL is fetched in the click handler and used in the same tick. It
 * is not put in state, not put in an `href`, and not prefetched — see the file
 * header.
 */
export function ArtworkDownloadButton({
  jobId,
  itemId,
  onError,
}: {
  jobId: string
  itemId: string
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      data-testid={`vendor-artwork-download-${itemId}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const artwork = await requestArtworkUrl(jobId, itemId)
          openSignedUrl(artwork.url)
        } catch (error) {
          onError?.((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
      {busy ? 'Getting link…' : 'Download artwork'}
    </Button>
  )
}

// ============================================================================
// QC photographs — the shot list, and the bytes that never touch our API
// ============================================================================

/**
 * One live photograph, as `GET /api/vendor/jobs/:id/photos` answers it.
 *
 * `url` is a presigned DOWNLOAD url with a five-minute life. The object key
 * never leaves the API, so this is the only handle the screen has — and it is
 * null when the stored key falls outside the `qcPhoto` signing scope, which is
 * R3 failing closed. Such a photograph is still LISTED: one that exists and
 * cannot be shown is worth seeing on the screen.
 */
export interface VendorQcPhoto {
  id: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  /** The first review that judged this shot, once one has. */
  reviewId: string | null
  url: string | null
}

/** One slot of the shot list, with whatever is live in it. */
export interface VendorQcShot {
  slot: string
  label: string
  required: boolean
  /** False for a photo in a slot this stage's shot list does not ask for. */
  onShotList: boolean
  photo: VendorQcPhoto | null
}

export interface VendorQcPhotoSet {
  jobId: string
  stage: VendorJobStage
  status: ProductionJobStatus
  shots: VendorQcShot[]
  missingRequiredSlots: string[]
  expiresInSeconds: number
  expiresAt: string
}

/** What `POST .../photos/presign` hands back. Nothing here is stored. */
export interface VendorQcPresign {
  /** Short-lived, signed, and pointing at R2 — NOT at our API. */
  uploadUrl: string
  key: string
  slot: string
  contentType: string
  maxBytes: number
  expiresInSeconds: number
}

export interface VendorQcUploadResult {
  photo: {
    id: string
    slot: string
    contentType: string
    sizeBytes: number
    uploadedAt: string
  }
  /**
   * The shot this one replaced, or null when the slot was empty.
   *
   * Surfaced rather than swallowed: a re-upload SUPERSEDES, and a UI that
   * silently swapped the thumbnail would hide the fact that the earlier
   * photograph is still on file and still discoverable in a dispute.
   */
  supersededPhotoId: string | null
}

/**
 * Everything the photo panel needs, in one prop.
 *
 * One object rather than nine flat props because #693 adds a card to this same
 * screen and every prop on `VendorJobDetailBody` is a thing the next ticket has
 * to read past.
 */
export interface VendorQcPanelState {
  data: VendorQcPhotoSet | null
  isLoading: boolean
  /** A failed READ of the photographs. It never blanks the job. */
  error: string | null
  onRetry: () => void
  onUpload?: (slot: string, file: File) => void | Promise<void>
  onWithdraw?: (photoId: string, slot: string) => void | Promise<void>
  /** The slot with a write in flight. Locks that slot's controls, not the page. */
  busySlot?: string | null
  /** A failed WRITE, keyed by the slot that caused it. */
  slotErrors?: Record<string, string>
  /** slot -> the photo id the last upload into it superseded. */
  supersededSlots?: Record<string, string | null>
}

/**
 * A refused write, with the API's own body intact.
 *
 * `patchVendorJobStatus` used to throw a bare `Error(body.error)`, which threw
 * away `missingSlots` — so the one refusal a vendor can actually act on arrived
 * as a sentence with slot keys buried in it and nothing the screen could
 * render. A 422 naming the missing shots and a screen that cannot name them
 * back is still a phone call.
 */
export class VendorJobWriteError extends Error {
  readonly status: number
  readonly code?: string
  readonly missingSlots?: string[]

  constructor(
    message: string,
    init: { status: number; code?: string; missingSlots?: string[] }
  ) {
    super(message)
    this.name = 'VendorJobWriteError'
    this.status = init.status
    this.code = init.code
    this.missingSlots = init.missingSlots
    // Keeps `instanceof` honest whatever the build target lowers this class to.
    Object.setPrototypeOf(this, VendorJobWriteError.prototype)
  }
}

/** Pull the API's `{ error }` out of a response, falling back to `fallback`. */
async function readVendorError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return body.error ?? fallback
}

/**
 * The shot list, laid out slot by slot, with each live photograph in its place.
 *
 * The STRUCTURE is `QC_SHOT_LIST` from `@chobii/shared` — the same list the API
 * validates against — and only the PHOTOGRAPHS come from the response. That
 * split is deliberate: a vendor has to know what to shoot while we are still
 * finding out what they already shot, and an empty panel during the load (or
 * after a failed one) reads as "nothing is asked of you".
 *
 * A live photo in a slot this stage does not ask for is APPENDED rather than
 * dropped, mirroring `qcShotEntries` in `routes/vendor.ts`. `slot` is a `text`
 * column with no enum under it, so a photograph nobody can find is a real
 * failure mode and hiding it here is how it stays invisible.
 */
export function mergeQcShots(
  stage: VendorJobStage,
  shots: VendorQcShot[] | null | undefined
): VendorQcShot[] {
  const listed = qcShotsForStage(stage as QcStage) ?? []
  const bySlot = new Map((shots ?? []).map((shot) => [shot.slot, shot]))
  const listedSlots = new Set(listed.map((shot) => shot.slot))

  const entries: VendorQcShot[] = listed.map((shot) => ({
    slot: shot.slot,
    label: shot.label,
    required: shot.required,
    onShotList: true,
    photo: bySlot.get(shot.slot)?.photo ?? null,
  }))

  for (const shot of shots ?? []) {
    if (listedSlots.has(shot.slot)) continue
    entries.push({ ...shot, onShotList: false })
  }

  return entries
}

/**
 * The required slots with nothing live in them.
 *
 * Computed from the entries this screen is RENDERING rather than read off the
 * response's `missingRequiredSlots`, so the button and the tiles cannot
 * disagree — a submit greyed out beside a shot list that looks complete is the
 * refusal a vendor cannot act on, one layer up. The API computes the same set
 * from the same `QC_SHOT_LIST` over the same rows, which is what makes the two
 * answers equal by construction rather than by luck.
 */
export function missingRequiredQcSlots(
  stage: VendorJobStage,
  entries: VendorQcShot[]
): string[] {
  const live = new Set(entries.filter((entry) => entry.photo).map((entry) => entry.slot))
  return (qcShotsForStage(stage as QcStage) ?? [])
    .filter((shot) => shot.required && !live.has(shot.slot))
    .map((shot) => shot.slot)
}

/**
 * A slot in the vendor's words, or null when this stage's shot list has none.
 *
 * Null rather than the key, and the difference is the whole of `missingShotsFor`
 * below: `slot` is a `text` column with no enum under it, so the string in it
 * came from somewhere, and "somewhere" is not a vocabulary this screen is
 * willing to read out. A caller that wants to print it has to decide to.
 */
export function qcSlotLabel(stage: VendorJobStage, slot: string): string | null {
  return (
    (qcShotsForStage(stage as QcStage) ?? []).find((shot) => shot.slot === slot)?.label ?? null
  )
}

export interface VendorMissingShot {
  slot: string
  label: string
}

/**
 * The slots a refusal named, split into the ones we can say out loud and a
 * count of the ones we cannot.
 *
 * The API answers an incomplete shot list with `missingSlots`, and that list is
 * the only part of the refusal a vendor can act on — so it has to reach them.
 * But it reaches them **through our shot list**, not verbatim. Every entry is
 * matched against `QC_SHOT_LIST` from `@chobii/shared` and rendered as the
 * sentence the uploader already showed for it; anything the list does not know
 * is counted, never printed.
 *
 * That is not paranoia about today's response, which is generated from the same
 * shared constant and can only contain slots we named first. It is that the
 * protection then lives entirely in the API, and this boundary's whole position
 * is the inverse — a supplier's screen renders our words about our schema, so
 * that a regression on the other side of the wire cannot narrate it to them.
 * The same reason the label card's two refusals are phrased here.
 */
export function missingShotsFor(
  stage: VendorJobStage,
  slots: readonly string[]
): { named: VendorMissingShot[]; unnamed: number } {
  const named: VendorMissingShot[] = []
  let unnamed = 0

  for (const slot of slots) {
    const label = qcSlotLabel(stage, slot)
    if (label === null) unnamed++
    else named.push({ slot, label })
  }

  return { named, unnamed }
}

/**
 * Why this file cannot be photographed evidence, or null.
 *
 * Checked here so the browser refuses at the door instead of spending a presign
 * round trip and a 25MB PUT on something the API was always going to refuse.
 * The wording matches `routes/vendor.ts` verbatim so a vendor sees one sentence
 * whichever side catches it — and HEIC lands here deliberately: it is what a
 * phone shoots by default and what no reviewer's browser displays.
 */
export function qcPhotoRejection(file: File): string | null {
  const contentType = (file.type ?? '').toLowerCase().trim()
  if (!QC_PHOTO_CONTENT_TYPES[contentType]) {
    return 'That file type cannot be reviewed. Send a JPEG, PNG or WebP.'
  }
  if (file.size > QC_PHOTO_MAX_BYTES) {
    return `That photograph is too large. The limit is ${Math.round(
      QC_PHOTO_MAX_BYTES / (1024 * 1024)
    )}MB.`
  }
  return null
}

// ============================================================================
// Fetchers — photos
// ============================================================================

/** The shot list with its live photographs and their short-lived signatures. */
export async function fetchVendorJobPhotos(jobId: string): Promise<VendorQcPhotoSet> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${jobId}/photos`, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readVendorError(response, 'Failed to load the photographs'))
  }

  return (await response.json()) as VendorQcPhotoSet
}

/**
 * Put one photograph in a slot: presign, PUT straight to R2, then say so.
 *
 * **The bytes do not come through our API.** A 25MB raking-light shot routed
 * through Hono means buffering it in the Node process and holding a request
 * open for the whole transfer, on the box that also serves the storefront. This
 * is `routes/review-media.ts`'s pattern and `useReviews.uploadReviewMedia`'s
 * shape, reused rather than re-derived.
 *
 * The PUT carries no credentials and no header but `Content-Type`. The
 * signature IS the auth; a cookie ride-along or an extra header changes what R2
 * hashes and the upload comes back 403.
 *
 * `complete` runs only after a successful PUT. A row written for an object that
 * never landed is QC evidence of nothing, and the API answers that case with a
 * 422 of its own — but the browser knows first and must not ask.
 */
export async function uploadVendorQcPhoto(
  jobId: string,
  slot: string,
  file: File
): Promise<VendorQcUploadResult> {
  const rejection = qcPhotoRejection(file)
  if (rejection) throw new Error(rejection)

  const presignResponse = await fetch(
    `${getApiUrl()}/api/vendor/jobs/${jobId}/photos/presign`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, contentType: file.type, sizeBytes: file.size }),
    }
  )

  if (!presignResponse.ok) {
    throw new Error(await readVendorError(presignResponse, 'Could not prepare the upload'))
  }

  const presign = (await presignResponse.json()) as VendorQcPresign

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': presign.contentType },
    body: file,
  })

  if (!uploadResponse.ok) {
    // R2 answers in XML, so there is no `{ error }` to read here.
    throw new Error(`Upload failed (${uploadResponse.status})`)
  }

  const completeResponse = await fetch(
    `${getApiUrl()}/api/vendor/jobs/${jobId}/photos/complete`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot,
        key: presign.key,
        contentType: presign.contentType,
        sizeBytes: file.size,
      }),
    }
  )

  if (!completeResponse.ok) {
    throw new Error(await readVendorError(completeResponse, 'Could not record the upload'))
  }

  return (await completeResponse.json()) as VendorQcUploadResult
}

/**
 * Take a shot off the LIVE list.
 *
 * The row is superseded, not deleted, and the R2 object is left alone — the
 * collection this removes the photograph from is "the live shot list", which is
 * what `superseded_at IS NULL` means. So the verb the vendor reads is
 * "withdraw" rather than "delete", because the history survives.
 */
export async function withdrawVendorQcPhoto(jobId: string, photoId: string): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/vendor/jobs/${jobId}/photos/${photoId}`,
    { method: 'DELETE', credentials: 'include' }
  )

  if (!response.ok) {
    throw new Error(await readVendorError(response, 'Could not withdraw that photograph'))
  }
}

// ============================================================================
// Showing a photograph without parking its signature in the DOM
// ============================================================================

/** Bytes as a print shop reads them. A raking-light shot of a whole print is big. */
function formatPhotoBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * One photograph, fetched as bytes and rendered from a local `blob:` URL.
 *
 * **Not `<img src={photo.url}>`.** `tests/routes/vendor/no-customer-data.test.tsx`
 * bans `X-Amz-Signature` from this screen's `innerHTML`, and it is right to: a
 * signed URL in the markup is a capability sitting in every screenshot, bug
 * report and session replay the vendor ever makes, readable by anyone who sees
 * it for as long as it lives. The admin QC panel can put the URL in `src`
 * because that screen is ours; this one is a third party's.
 *
 * So the signature stays in a variable, the request goes straight to R2, and
 * what lands in the DOM is an object URL that means nothing outside this tab.
 * The vendor sees the shot they took, which is the whole point of the panel —
 * R2's rule is about customer data reaching a vendor, and these photographs are
 * the vendor's own work.
 *
 * A failure here — R2 CORS, an expired signature, a dropped connection, a
 * scope-refused key that arrived with `url: null` — says so in words. It is
 * never answered with a link carrying the signature, which would put back
 * exactly what this component exists to keep out.
 */
export function QcPhotoImage({
  slot,
  label,
  url,
}: {
  slot: string
  label: string
  url: string | null
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setObjectUrl(null)

    if (!url) {
      setFailed(true)
      return
    }

    setFailed(false)
    let cancelled = false
    let created: string | null = null

    void (async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Photo fetch failed (${response.status})`)
        const blob = await response.blob()
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      // The blob is held in memory until it is revoked, and a vendor working
      // through a frame job's eight slots would otherwise accumulate every one.
      if (created) URL.revokeObjectURL(created)
    }
  }, [url])

  if (objectUrl) {
    return (
      <img
        data-testid={`vendor-qc-photo-${slot}`}
        src={objectUrl}
        alt={label}
        className="w-full rounded border border-border object-cover"
      />
    )
  }

  if (failed) {
    return (
      <p
        data-testid={`vendor-qc-photo-unavailable-${slot}`}
        className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
      >
        This photograph could not be shown. It is still on file and we can still
        see it — reload the page to try again.
      </p>
    )
  }

  return (
    <div
      data-testid={`vendor-qc-photo-loading-${slot}`}
      className="h-32 animate-pulse rounded bg-muted"
      aria-hidden="true"
    />
  )
}

// ============================================================================
// The shot list panel
// ============================================================================

export interface VendorQcShotListProps {
  stage: VendorJobStage
  qc: VendorQcPanelState
  /** Whether the matrix still lets this vendor change the shot list. */
  canUpload: boolean
}

/**
 * What this job has to be photographed with, and what is in each slot.
 *
 * Skeleton, error and empty are all here, and the first two render ALONGSIDE
 * the slots rather than instead of them: the list of shots is knowable without
 * the request, and replacing it with a spinner or an error box would tell a
 * vendor nothing is asked of them. Only a stage whose shot list is genuinely
 * empty gets the empty state, and that is a real condition — `stage` is checked
 * against `QC_SHOT_LIST`, which a stage added to the API and not to shared
 * would miss.
 */
export function VendorQcShotList({ stage, qc, canUpload }: VendorQcShotListProps) {
  const entries = mergeQcShots(stage, qc.data?.shots)
  const missing = new Set(missingRequiredQcSlots(stage, entries))
  const superseded = qc.supersededSlots ?? {}
  const slotErrors = qc.slotErrors ?? {}

  if (entries.length === 0) {
    return (
      <div
        data-testid="vendor-qc-shots-empty"
        className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground"
      >
        This job asks for no photographs, and none has been uploaded outside a
        shot list either. There is nothing to do here.
      </div>
    )
  }

  return (
    <div data-testid="vendor-qc-shots" className="space-y-3">
      {qc.error && (
        <div
          data-testid="vendor-qc-shots-error"
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="mb-1 font-medium">{qc.error}</p>
          <p className="mb-4 text-muted-foreground">
            The shots below are what this job asks for. What you have already
            uploaded is not shown, because we could not read it — which is not
            the same as you not having taken it.
          </p>
          <Button
            type="button"
            variant="outline"
            data-testid="vendor-qc-shots-retry"
            onClick={qc.onRetry}
          >
            Try again
          </Button>
        </div>
      )}

      {qc.isLoading && (
        <div
          data-testid="vendor-qc-shots-skeleton"
          className="h-8 animate-pulse rounded bg-muted"
          aria-busy="true"
          aria-label="Loading your photographs"
        />
      )}

      {!canUpload && (
        <p
          data-testid="vendor-qc-shots-locked"
          className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          Photographs can be added, replaced or withdrawn only while a job is in
          production. This one is not, so the shot list is read-only.
        </p>
      )}

      {!qc.error && !qc.isLoading && missing.size > 0 && (
        <p data-testid="vendor-qc-missing" className="text-xs text-muted-foreground">
          {missing.size} required shot(s) still to take. We cannot start the
          approval until each one is here.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <li
            key={entry.slot}
            data-testid={`vendor-qc-shot-${entry.slot}`}
            className={cn(
              'space-y-2 rounded-lg border p-3 text-sm',
              !entry.onShotList
                ? 'border-amber-200 bg-amber-50/40'
                : entry.photo
                  ? 'border-border'
                  : missing.has(entry.slot)
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-dashed border-border'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{entry.label}</span>
              {entry.onShotList && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {entry.required ? 'Required' : 'Optional'}
                </span>
              )}
              {!entry.onShotList && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  Not on this job&rsquo;s shot list
                </span>
              )}
            </div>

            <p className="font-mono text-xs text-muted-foreground">{entry.slot}</p>

            {entry.photo ? (
              <>
                <QcPhotoImage slot={entry.slot} label={entry.label} url={entry.photo.url} />
                <p className="text-xs text-muted-foreground">
                  {formatVendorDate(entry.photo.uploadedAt)} ·{' '}
                  {formatPhotoBytes(entry.photo.sizeBytes)} · {entry.photo.contentType}
                </p>
                {superseded[entry.slot] && (
                  <p
                    data-testid={`vendor-qc-superseded-${entry.slot}`}
                    className="text-xs text-muted-foreground"
                  >
                    This replaced an earlier shot. The earlier one is still on
                    file and we can still see it — nothing was deleted.
                  </p>
                )}
              </>
            ) : (
              <p
                className={cn(
                  'text-xs',
                  missing.has(entry.slot) ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                Not yet photographed
                {missing.has(entry.slot)
                  ? ' — the approval cannot start without it.'
                  : '. This one is up to you.'}
              </p>
            )}

            {canUpload && (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="cursor-pointer rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  htmlFor={`vendor-qc-upload-${entry.slot}`}
                >
                  {entry.photo ? 'Replace this shot' : 'Add a photograph'}
                </label>
                <input
                  id={`vendor-qc-upload-${entry.slot}`}
                  data-testid={`vendor-qc-upload-${entry.slot}`}
                  type="file"
                  className="sr-only"
                  accept={Object.keys(QC_PHOTO_CONTENT_TYPES).join(',')}
                  disabled={qc.busySlot === entry.slot}
                  onChange={(event) => {
                    const picked = event.target.files?.[0]
                    // Cleared so picking the SAME file again still fires a
                    // change — a vendor retrying a failed upload otherwise gets
                    // nothing at all.
                    event.target.value = ''
                    if (picked) void qc.onUpload?.(entry.slot, picked)
                  }}
                />
                {qc.busySlot === entry.slot && (
                  <span
                    data-testid={`vendor-qc-busy-${entry.slot}`}
                    className="text-xs text-muted-foreground"
                  >
                    Uploading…
                  </span>
                )}
                {entry.photo && (
                  <InlineConfirm
                    testId={`vendor-qc-withdraw-${entry.slot}`}
                    label="Withdraw"
                    question="Take this shot off the list?"
                    busy={qc.busySlot === entry.slot}
                    onConfirm={() =>
                      qc.onWithdraw?.(entry.photo?.id as string, entry.slot)
                    }
                  />
                )}
              </div>
            )}

            {slotErrors[entry.slot] && (
              <p
                data-testid={`vendor-qc-error-${entry.slot}`}
                role="alert"
                className="text-xs text-destructive"
              >
                {slotErrors[entry.slot]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// The verdict banner
// ============================================================================

/**
 * The most recent verdict, whatever order the reviews arrived in.
 *
 * `getVendorJobReviews` already orders by `created_at DESC`, so this is usually
 * `reviews[0]` — but the banner is the one place on this screen where showing
 * the wrong row means telling a vendor to redo work that was already approved,
 * or that a failed piece passed. Sorting costs nothing and does not depend on
 * a promise made in a different package.
 */
export function latestVendorReview(reviews: VendorJobReview[]): VendorJobReview | null {
  let latest: VendorJobReview | null = null

  for (const review of reviews) {
    if (!latest) {
      latest = review
      continue
    }
    const candidate = new Date(review.createdAt).getTime()
    const incumbent = new Date(latest.createdAt).getTime()
    if (Number.isNaN(incumbent) || (!Number.isNaN(candidate) && candidate > incumbent)) {
      latest = review
    }
  }

  return latest
}

/**
 * Our verdict, at the top of the job, with the defects spelled out.
 *
 * A fail that does not say what to redo is a phone call, which is precisely
 * what this feature exists to remove — so the defects render as chips rather
 * than as a comma-joined sentence, one per thing to fix. The API refuses to
 * record a fail with no defect at all (§7), so an empty chip row would mean a
 * regression upstream; it gets a sentence rather than a blank space, because a
 * defect list rendering as nothing reads as "we found nothing wrong", which is
 * the opposite of the verdict it sits under.
 *
 * Nothing renders before the first verdict. The "Quality checks" list below
 * already says none has been recorded, and a banner announcing the absence of
 * news would sit at the top of every job a vendor ever opens.
 */
export function QcVerdictBanner({ reviews }: { reviews: VendorJobReview[] }) {
  const latest = latestVendorReview(reviews)
  if (!latest) return null

  const failed = latest.verdict === 'fail'
  const defects = latest.defects ?? []

  return (
    <div
      data-testid="vendor-job-verdict"
      role="status"
      className={cn(
        'space-y-2 rounded-lg border p-4',
        failed
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-green-200 bg-green-50 text-green-900'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {failed ? 'Changes needed on this job' : 'We approved this job'}
        </span>
        <span className="text-xs opacity-80">{formatVendorDate(latest.createdAt)}</span>
      </div>

      {failed &&
        (defects.length > 0 ? (
          <ul
            data-testid="vendor-job-verdict-defects"
            className="flex flex-wrap gap-2"
            aria-label="What has to be put right"
          >
            {defects.map((defect) => (
              <li
                key={defect}
                data-testid="vendor-job-verdict-defect"
                className="rounded-full border border-red-300 bg-white px-2 py-0.5 text-xs"
              >
                {defect}
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="vendor-job-verdict-no-defects" className="text-sm">
            We did not record what was wrong, which should not happen. Ask us
            before you redo anything.
          </p>
        ))}

      {latest.notes && <p className="text-sm opacity-90">{latest.notes}</p>}
    </div>
  )
}

// ============================================================================
// The carrier label — the one document on this boundary that carries a customer
// ============================================================================

/** `GET /api/vendor/jobs/:id/label`. The same shape as artwork, TTL 300s. */
export interface VendorLabelResponse {
  jobId: string
  url: string
  expiresInSeconds: number
  expiresAt: string
}

/**
 * A refused label request, with the status and the API's `code` intact.
 *
 * The code matters more than the message here: `LABEL_NOT_AVAILABLE` is the
 * deliberate 503 for a seam that has not landed, and it needs different words
 * from a 404. The message is carried but, on both of those paths, deliberately
 * not shown — see `VendorLabelHandoverCard`.
 */
export class VendorLabelError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, init: { status: number; code?: string }) {
    super(message)
    this.name = 'VendorLabelError'
    this.status = init.status
    this.code = init.code
    Object.setPrototypeOf(this, VendorLabelError.prototype)
  }
}

/**
 * The signed label URL, requested at the moment it is wanted and never before.
 *
 * Exported so a test can assert both halves of the rule, exactly as
 * `requestArtworkUrl` is: a click calls it, a render does not. The difference
 * is what it signs — this is the ONLY object on the whole vendor boundary that
 * contains a customer's name, address and phone, and the API writes a
 * `production_job.label_issued` audit row every time it succeeds. Probing it on
 * render would therefore both spend a signature and log a disclosure that never
 * happened.
 */
export async function requestJobLabel(jobId: string): Promise<VendorLabelResponse> {
  const response = await fetch(`${getApiUrl()}/api/vendor/jobs/${jobId}/label`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
      code?: string
    }
    throw new VendorLabelError(body.error ?? 'Failed to get the carrier label', {
      status: response.status,
      code: body.code,
    })
  }

  return (await response.json()) as VendorLabelResponse
}

/**
 * How long the object URL outlives the click that used it.
 *
 * Not zero, which is what this was. Revoking on the next macrotask is a known
 * way to abort an `<a download>` save — Safari consistently, Chrome once the
 * blob is large enough that the write has not started by the time the task
 * queue drains — and a carrier label is a PDF, not a line of text. A second is
 * the usual mitigation and costs nothing: the tab holds the bytes for that long
 * and then does not, and every path through this function revokes.
 *
 * Unobservable today, because the route 503s in every environment. It surfaces
 * the day the dispatch seam lands, which is precisely when nobody will be
 * looking at this function.
 */
const LABEL_BLOB_REVOKE_DELAY_MS = 1_000

/**
 * Fetch the bytes and hand the FILE to the operating system.
 *
 * Not `window.open(url)`, not an `<a href={url}>`, and above all not an
 * `<iframe src={url}>`. §6 (R2) allows customer data to reach a vendor only as
 * opaque rendered bytes behind a short-lived signature, handed to the OS —
 * never composed by our API and never rendered into the portal's own DOM. An
 * inline viewer would put the customer's name, address and phone straight into
 * this page's markup, and a plain link would leave the signature sitting in an
 * `href` where every screenshot, bug report and session replay picks it up.
 *
 * So: the signature stays in a local variable, the request goes straight to R2,
 * and what touches the document is a `blob:` URL that means nothing outside
 * this tab. Same technique as `QcPhotoImage` (#692), applied to a download
 * rather than to an `<img>`.
 */
async function handLabelToOs(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Label fetch failed (${response.status})`)
  const blob = await response.blob()

  if (typeof document === 'undefined') return
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked LATER rather than synchronously or on the next tick: revoking
  // while the browser is still reading the blob for the save aborts the
  // download. See the constant.
  setTimeout(() => URL.revokeObjectURL(objectUrl), LABEL_BLOB_REVOKE_DELAY_MS)
}

/**
 * The handover card: a BUTTON, fetched at click, used in the same tick.
 *
 * ## Why the copy on the two refusals is ours and not the API's
 *
 * A **503 `LABEL_NOT_AVAILABLE`** is the seam:
 * `order_shipments.label_object_token` belongs to `order-dispatch-tracking` and
 * does not exist yet, so this route answers 503 in every environment today.
 * That is deliberate, and the card says so honestly — the label is not
 * available here yet, nothing is wrong with the job, ask the office. The
 * sentence is OURS rather than the body's, so a future regression that put a
 * driver's message in the body cannot narrate our schema to a supplier through
 * this card. `packages/api/tests/lib/vendor-label-seam.test.ts` goes red the day
 * the column lands, and this card starts working with no change here.
 *
 * A **404** covers "no such job", "not your job", "you are not the
 * consolidator" and "no label bought yet" all at once, and the API refuses to
 * distinguish them on purpose. The card must not put the distinction back, so
 * it says there is no label for this job and stops.
 *
 * ## And on every OTHER path too
 *
 * Those two used to be the only ones. Everything else — a 500, a 503 that lost
 * its `code` crossing a proxy, a byte fetch that 403s on an expired signature —
 * rendered `body.error` verbatim on a supplier's screen. Nothing leaked, but
 * only because `failed()` happens to return a fixed string: the protection sat
 * in the API, which is precisely the inversion this component was built to
 * correct. Now all four paths are our sentences, split where the REMEDY splits
 * — ask the office, there is no label, try again shortly, press again for a
 * fresh link — and none of them is the response's.
 *
 * ## What is never rendered
 *
 * No `iframe`, `embed` or `object`, and no signed URL in any attribute — not
 * even as a "here is the link instead" fallback when the byte fetch fails,
 * which is the one tempting way to reopen the hole this component exists to
 * close. `tests/routes/vendor/no-customer-data.test.tsx` asserts both over the
 * whole job screen.
 */
export function VendorLabelHandoverCard({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)

  return (
    <div
      data-testid="vendor-job-label-card"
      className="space-y-2 rounded-lg border border-border p-4"
    >
      <div>
        <h3 className="font-medium">Carrier label</h3>
        <p className="text-sm text-muted-foreground">
          The courier's label for this parcel. It downloads as a file to print
          and stick on the box — nothing about it is kept on this page.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        data-testid="vendor-job-label"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          setUnavailable(null)
          try {
            const label = await requestJobLabel(jobId)
            // Same tick, and the URL is never stored in state or in an href.
            await handLabelToOs(label.url, `label-${jobId.slice(0, 8)}.pdf`)
          } catch (labelError) {
            if (
              labelError instanceof VendorLabelError &&
              labelError.code === 'LABEL_NOT_AVAILABLE'
            ) {
              setUnavailable(
                'Carrier labels are not available in the portal yet. Nothing is ' +
                  'wrong with this job — ask the office for the label.'
              )
            } else if (labelError instanceof VendorLabelError && labelError.status === 404) {
              setError(
                'There is no courier label for you on this job. If you are ' +
                  'holding the finished piece, tell us and we will sort it out.'
              )
            } else if (labelError instanceof VendorLabelError) {
              // OUR words on this path too, and that is the fix rather than a
              // flourish. A 500 from `failed()` is a fixed string today, and a
              // 503 that lost its `code` in a proxy is one line of config away
              // — but the protection then lives in the API, which is the exact
              // inversion this boundary exists to correct. What reaches a
              // supplier's screen is decided here.
              setError(
                'We could not get you a label for this job just now. Nothing is ' +
                  'wrong with the work — try again in a moment, and tell us if ' +
                  'it keeps happening.'
              )
            } else {
              // The signature was fine; the bytes or the save were not. A fresh
              // press signs again, which is the whole remedy — and the reason
              // this is a separate sentence rather than the one above.
              setError(
                'The label did not save. The link we get for it only lasts a few ' +
                  'minutes, so press the button again for a fresh one.'
              )
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {busy ? 'Getting the label…' : 'Get the carrier label'}
      </Button>

      {unavailable && (
        <p
          data-testid="vendor-job-label-unavailable"
          role="status"
          className="text-sm text-muted-foreground"
        >
          {unavailable}
        </p>
      )}

      {error && (
        <p data-testid="vendor-job-label-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// The action strip — the matrix, rendered
// ============================================================================

export interface VendorJobActionsProps {
  status: ProductionJobStatus
  onStatus?: (status: VendorJobStatus) => void | Promise<void>
  /** A write is in flight. Locks every confirm rather than only the pressed one. */
  busy?: boolean
  /**
   * What this screen has managed to find out about the matrix's guards.
   *
   * One entry, ever: `shot-list-complete`, answered from the photographs the
   * panel below has already read. `open-transfer-or-order-label` is left absent
   * on purpose and permanently — the edge is satisfied by an open transfer OR a
   * label on the order and a browser can see neither, so the honest answer is
   * "unknown", which leaves the move live and the API deciding. Greying out a
   * legal move because the evidence is unreachable would strand a vendor
   * holding a finished piece.
   */
  guards?: VendorGuardState
  /**
   * A write that failed. It belongs HERE, beside the button that caused it, and
   * never in the page error: the job below was read successfully, and blanking
   * a good read because a write failed hides the summary, the items, the
   * artwork and the QC history all at once (#684).
   */
  error?: string | null
  /**
   * The shots the API's 422 named, already in the vendor's words.
   *
   * A refusal you cannot act on is a support ticket. The API answers an
   * incomplete shot list with `missingSlots`, and this is where that list turns
   * back into the sentences the uploader shows — matched against `QC_SHOT_LIST`
   * rather than printed as it arrived, with anything unmatched counted instead.
   * See `missingShotsFor`.
   */
  missingShots?: { named: VendorMissingShot[]; unnamed: number }
}

/**
 * Every move a vendor may make on this job, and nothing else.
 *
 * `nextVendorActions(status, guards)` is `nextStatuses(status, 'vendor')` over
 * the shared matrix, so this component holds no vocabulary of its own — which
 * is the point of the whole ticket. Adding an edge to the matrix adds a button
 * here; nobody edits this file.
 */
export function VendorJobActions({
  status,
  onStatus,
  busy = false,
  guards,
  error,
  missingShots,
}: VendorJobActionsProps) {
  const actions = nextVendorActions(status, guards)

  return (
    <div
      data-testid="vendor-job-actions"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      {actions.length === 0 ? (
        <p
          data-testid="vendor-job-actions-none"
          className="text-sm text-muted-foreground"
        >
          {vendorNoActionReason(status)}
        </p>
      ) : (
        <ul className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {actions.map((action) =>
            action.blockedReason ? (
              // Shown but not pressable. Hiding the move would make the
              // workflow unguessable; pressing it would spend a round trip on
              // a refusal this screen can already predict.
              <li key={action.to} className="space-y-1">
                <Button type="button" variant="outline" data-testid={action.testId} disabled>
                  {action.label}
                </Button>
                <p
                  data-testid={`vendor-job-guard-${action.to}`}
                  className="max-w-xs text-xs text-muted-foreground"
                >
                  {action.blockedReason}
                </p>
              </li>
            ) : (
              <li key={action.to}>
                <InlineConfirm
                  testId={action.testId}
                  label={action.label}
                  question={action.question}
                  busy={busy}
                  onConfirm={() => onStatus?.(action.to)}
                />
              </li>
            )
          )}
        </ul>
      )}

      {error && (
        <div className="space-y-2">
          <p
            data-testid="vendor-job-action-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>

          {missingShots && missingShots.named.length > 0 && (
            <ul
              data-testid="vendor-job-action-missing-slots"
              className="flex flex-wrap gap-2"
              aria-label="The shots still to take"
            >
              {missingShots.named.map((shot) => (
                <li
                  key={shot.slot}
                  data-testid="vendor-job-action-missing-slot"
                  className="rounded-full border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-xs"
                >
                  {/* The LABEL only. The slot key is the response's string, and
                      printing it is how a schema — ours today, whoever's
                      tomorrow — gets read out on a supplier's screen. It is
                      still the React key, where nothing renders it. */}
                  {shot.label}
                </li>
              ))}
            </ul>
          )}

          {missingShots && missingShots.unnamed > 0 && (
            // Counted, not quoted. The refusal named something this stage's
            // shot list has no words for, and guessing at it out loud would be
            // worse than admitting we cannot.
            <p data-testid="vendor-job-action-missing-unnamed" className="text-xs text-muted-foreground">
              {missingShots.unnamed === 1
                ? 'One more check was named that we do not have a name for here. Tell us and we will sort it out.'
                : `${missingShots.unnamed} more checks were named that we do not have names for here. Tell us and we will sort it out.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// The three states
// ============================================================================

function JobSkeleton() {
  return (
    <div
      data-testid="vendor-job-skeleton"
      className="space-y-3 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading job"
    >
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

function JobError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="vendor-job-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is shown below because nothing was loaded.
      </p>
      <Button type="button" variant="outline" data-testid="vendor-job-retry" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function ItemsEmpty() {
  return (
    <div
      data-testid="vendor-job-items-empty"
      className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground"
    >
      This job has no items on it yet.
    </div>
  )
}

// ============================================================================
// Body
// ============================================================================

export interface VendorJobDetailBodyProps {
  data: VendorJobDetailResponse | null
  isLoading: boolean
  /** A failed READ. It replaces the whole body, because there is no body. */
  error: string | null
  onRetry: () => void
  onStatus?: (status: VendorJobStatus) => void | Promise<void>
  busyStatus?: boolean
  guards?: VendorGuardState
  /** A failed WRITE. It renders beside the buttons and keeps the job on screen. */
  actionError?: string | null
  /** The slots a 422 named. Turned into words against the job's own stage. */
  actionMissingSlots?: string[]
  /**
   * The shot list and its photographs.
   *
   * Optional: the panel still renders what the stage ASKS for without it, which
   * is what every existing caller that passes nothing gets.
   */
  qc?: VendorQcPanelState
  /**
   * This vendor's parcels, used here for ONE sentence.
   *
   * A plain list rather than the strip's panel state, which is what this used
   * to take: the loading flag, the read error and the retry went in and nothing
   * on this screen could render any of them, so three of the four fields were
   * dead the moment they were passed. The strip itself lives on `/vendor` — a
   * parcel is a fact about the vendor, not about this job, and the API withholds
   * the link on purpose (see the note on the waiting sentence below). All this
   * screen takes from it is whether something is genuinely on its way.
   *
   * `null` is "not read, or not read yet", and it is deliberately the same as
   * "none": announcing a parcel because a request has not come back invents one.
   */
  inboundInTransit?: VendorTransfer[] | null
}

/**
 * Exactly one of skeleton / error / job. Split from the page so every state can
 * be asserted without a router or a fetch mock.
 */
export function VendorJobDetailBody({
  data,
  isLoading,
  error,
  onRetry,
  onStatus,
  busyStatus = false,
  guards,
  actionError = null,
  actionMissingSlots,
  qc,
  inboundInTransit,
}: VendorJobDetailBodyProps) {
  if (error) return <JobError message={error} onRetry={onRetry} />
  if (isLoading) return <JobSkeleton />
  if (!data) return <JobError message="This job could not be loaded." onRetry={onRetry} />

  const { job, items, reviews } = data
  // `vendorJobPayableAmount` rather than `job.amountExpected` directly: on a
  // cancelled job the rate-card expectation is not a bill, and this screen and
  // the list have to say the same thing about the same row (#695).
  const agreed = formatVendorAmount(vendorJobPayableAmount(job))
  const final = formatVendorAmount(job.amountActual)

  const qcPanel: VendorQcPanelState = qc ?? {
    data: null,
    isLoading: false,
    error: null,
    onRetry: () => {},
  }

  /**
   * The evidence for the ONE guard this screen can answer itself.
   *
   * Only supplied once the photographs have actually been read: absent means
   * UNKNOWN, and `nextVendorActions` deliberately treats unknown as "leave the
   * move live and let the API decide". Greying out a legal submit because a
   * request has not come back yet is worse than spending a round trip on it.
   *
   * An explicit `guards` prop still wins, so a caller testing the strip in
   * isolation is not fighting the panel.
   */
  const shotListGuard: VendorGuardState = qcPanel.data
    ? {
        'shot-list-complete':
          missingRequiredQcSlots(job.stage, mergeQcShots(job.stage, qcPanel.data.shots))
            .length === 0,
      }
    : {}

  /**
   * The handover card renders exactly where the MATRIX gates that edge on a
   * label, and nowhere else.
   *
   * Derived rather than written as `status === 'qc_passed'`, which is the same
   * second copy of the state machine #691 deleted from this file. The API's own
   * `LABEL_ACCESS_STATUSES` is computed the same way over the same shared table
   * — the statuses a vendor can take the `open-transfer-or-order-label` edge
   * from — so the card cannot appear on a job whose label request the route
   * would refuse, and it follows the matrix if that edge ever moves.
   */
  const handoverAction = nextVendorActions(job.status).find(
    (action) => action.guard === 'open-transfer-or-order-label'
  )

  /**
   * A parcel is still on its way to this bench.
   *
   * Frame jobs only, because nothing is couriered TO a print shop: the printed
   * sheet travels print -> frame, and a frame job that has not had its sheet
   * cannot start.
   *
   * **It says the vendor is waiting, not that THIS job's parcel is coming**, and
   * the difference is the API's, not a hedge. `production_transfers.order_id` is
   * withheld from every vendor-facing projection under R1, and
   * `GET /transfers/:id` scopes `jobIds` to the caller's OWN jobs so a receiving
   * vendor gets an empty list rather than a handle on the sender's work. There
   * is therefore no join from this job to that parcel on this side of the
   * boundary, and reconstructing one would mean asking the API to widen exactly
   * what it narrows. So the sentence names no docket, no carrier and no other
   * end, and points at the queue, where the parcel can actually be confirmed.
   *
   * Not shown while the parcels are merely unread: `inboundAwaitingArrival`
   * answers empty for a null read, so "we have not looked" never renders as "a
   * parcel is coming".
   *
   * Nor is it shown for a parcel nobody has despatched. `dispatched_at IS NULL`
   * is a real state of the row — the admin screens call it `pending` — and this
   * sentence used to fire on one, telling a vendor something was in transit
   * about a box still on the sender's bench and sending them to confirm an
   * arrival the API answers 409. `transferAwaitsArrival` is the single predicate
   * behind both the sentence and that control, so they cannot disagree.
   */
  const awaitingInbound =
    job.stage === 'frame' && inboundAwaitingArrival(inboundInTransit).length > 0

  /**
   * When production started, or nothing at all.
   *
   * Three conditions, and each removes a sentence that was being printed
   * untrue: the job has actually been received, the date parses (a `—` under a
   * label is a broken field, not a fact), and the job is still in play —
   * "in production since" is present tense, and a handed-over or cancelled job
   * is not in production. `vendorJobIsOpen` reads the shared matrix rather than
   * naming statuses here.
   */
  const inProductionSince = (() => {
    if (!job.receivedAt || !vendorJobIsOpen(job.status)) return null
    const formatted = formatVendorDate(job.receivedAt)
    return formatted === '—' ? null : formatted
  })()

  return (
    <div className="space-y-6" data-testid="vendor-job-detail">
      {/* Summary */}
      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Work</div>
          <div className="mt-1 capitalize">{job.stage}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <div className="mt-1">
            <VendorJobStatusPill status={job.status} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Due</div>
          <div className="mt-1">
            <DueCell dueAt={job.dueAt} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">You are paid</div>
          <div className="mt-1 tabular-nums" data-testid="vendor-job-amount">
            {/* Never a fallback zero: an unreadable amount says so. */}
            {final ?? agreed ?? <span className="text-destructive">Unavailable</span>}
            {final && agreed && final !== agreed && (
              <span className="ml-2 text-xs text-muted-foreground">agreed {agreed}</span>
            )}
          </div>
        </div>
      </div>

      {/* Our verdict, before anything a vendor might act on. A failed job has
          to lead with what to redo. */}
      <QcVerdictBanner reviews={reviews} />

      {/* Why this job cannot start yet, before the controls that cannot help */}
      {awaitingInbound && (
        <p
          data-testid="vendor-job-awaiting-inbound"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
        >
          Waiting on an inbound parcel. Something is in transit to you and has
          not been confirmed as arrived — confirm it on your job list when it
          reaches your bench.
        </p>
      )}

      {/* What this vendor can do next, straight off the transition matrix */}
      <div className="space-y-2">
        {/* Only where the sentence is TRUE. It is present tense, so a job that
            has been handed over or cancelled makes it false rather than stale,
            and one that was never received has nothing to print — it rendered
            "In production since: —", which reads as a broken field. `receivedAt`
            answers the second; `vendorJobIsOpen`, off the shared matrix,
            answers the first without this file listing statuses. */}
        {inProductionSince && (
          <p data-testid="vendor-job-in-production-since" className="text-sm text-muted-foreground">
            In production since: {inProductionSince}
          </p>
        )}
        <VendorJobActions
          status={job.status}
          onStatus={onStatus}
          busy={busyStatus}
          guards={{ ...shotListGuard, ...guards }}
          error={actionError}
          missingShots={
            actionMissingSlots ? missingShotsFor(job.stage, actionMissingSlots) : undefined
          }
        />

        {/* The evidence for the button directly above it, and the only place a
            customer's details ever reach a vendor — as a file, never as data. */}
        {handoverAction && <VendorLabelHandoverCard jobId={job.id} />}
      </div>

      {/* The shot list — what we judge the work on */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Photographs</h2>
        <VendorQcShotList
          stage={job.stage}
          qc={qcPanel}
          canUpload={vendorMayUploadPhotos(job.status)}
        />
      </section>

      {/* Items and their artwork */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Items</h2>
        {items.length === 0 ? (
          <ItemsEmpty />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item, index) => (
              <li
                key={item.id}
                data-testid={`vendor-job-item-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-medium">Item {index + 1}</div>
                  <div className="font-mono text-xs text-muted-foreground">{item.id}</div>
                </div>
                <ArtworkDownloadButton jobId={job.id} itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* QC history — our verdict on their work, so they can see it */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Quality checks</h2>
        {reviews.length === 0 ? (
          <div
            data-testid="vendor-job-reviews-empty"
            className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground"
          >
            No quality check has been recorded on this job.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {reviews.map((review) => (
              <li key={review.id} className="px-4 py-3" data-testid={`vendor-job-review-${review.id}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                      review.verdict === 'pass'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    )}
                  >
                    {review.verdict === 'pass' ? 'Passed' : 'Failed'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatVendorDate(review.createdAt)}
                  </span>
                </div>
                {review.defects && review.defects.length > 0 && (
                  <div className="mt-1 text-sm">Defects: {review.defects.join(', ')}</div>
                )}
                {review.notes && (
                  <p className="mt-1 text-sm text-muted-foreground">{review.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function VendorJobDetailPage() {
  const { id } = Route.useParams()

  const [data, setData] = useState<VendorJobDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyStatus, setBusyStatus] = useState(false)
  // Kept apart from `error` on purpose — see the file header. A refused
  // transition must not blank a job that loaded fine.
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMissingSlots, setActionMissingSlots] = useState<string[] | undefined>(undefined)

  // The photographs are read SEPARATELY from the job, and their failures stay
  // separate too: signed URLs expire on their own five-minute schedule, so a
  // refresh of the shot list must not re-fetch (or be able to blank) the job.
  const [photos, setPhotos] = useState<VendorQcPhotoSet | null>(null)
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({})
  const [supersededSlots, setSupersededSlots] = useState<Record<string, string | null>>({})

  // The parcels genuinely on their way TO this vendor, and nothing else: the
  // outbound legs belong on `/vendor`, where they can be acted on.
  const [inbound, setInbound] = useState<VendorTransfer[] | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setData(await fetchVendorJob(id))
      setError(null)
    } catch (loadError) {
      setData(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      setPhotos(await fetchVendorJobPhotos(id))
      setPhotosError(null)
    } catch (photosLoadError) {
      // The shot list itself still renders from `QC_SHOT_LIST`; only what is
      // IN the slots is unknown, and the panel says which of the two it is.
      setPhotos(null)
      setPhotosError((photosLoadError as Error).message)
    } finally {
      setPhotosLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    void loadPhotos()
  }, [load, loadPhotos])

  const stage = data?.job.stage ?? null

  /**
   * The parcels, read only when they can change what this screen says.
   *
   * Gated on the job's own stage, which is why it waits for the job rather than
   * running beside it. The waiting sentence is FRAME-ONLY by construction —
   * nothing is couriered TO a print shop, the sheet travels print → frame — so
   * on a print job this request was spent on a result the render could not use.
   * Every job open paid for it.
   *
   * A failure is not stored, because nothing on this screen could render it:
   * there is no strip here and no retry (the strip and the confirm both live on
   * `/vendor`, where a parcel can actually be acted on), so the loading flag,
   * the error string and the retry were three dead props. What a failed read
   * means here is that we do not know, and `inboundAwaitingArrival` already
   * treats not knowing as saying nothing.
   *
   * `fetchInboundAwaitingArrival` rather than a single page, and for the same
   * reason `/vendor` uses it: the parcel a frame job is waiting on is the OLD
   * one, and a page of the twenty newest inbound legs is exactly where an old
   * one is not.
   */
  useEffect(() => {
    if (stage !== 'frame') {
      setInbound(null)
      return
    }

    let abandoned = false
    void (async () => {
      try {
        const { items } = await fetchInboundAwaitingArrival()
        if (!abandoned) setInbound(items)
      } catch {
        // Unknown, which this screen renders as silence rather than as news.
        if (!abandoned) setInbound(null)
      }
    })()

    return () => {
      abandoned = true
    }
  }, [stage, id])

  const uploadPhoto = async (slot: string, file: File) => {
    setBusySlot(slot)
    setSlotErrors((current) => {
      const next = { ...current }
      delete next[slot]
      return next
    })

    try {
      const result = await uploadVendorQcPhoto(id, slot, file)
      // Named rather than implied: the earlier row is superseded, not deleted,
      // and a silently swapped thumbnail would hide that it is still on file.
      setSupersededSlots((current) => ({ ...current, [slot]: result.supersededPhotoId }))
      await loadPhotos()
      // A slot that just became live may have been the last one the guard was
      // waiting on, so the submit button's evidence changed with it.
      setActionError(null)
      setActionMissingSlots(undefined)
    } catch (uploadError) {
      // Kept on the SLOT. One failed shot must not take the other seven of a
      // frame job's list down with it.
      setSlotErrors((current) => ({ ...current, [slot]: (uploadError as Error).message }))
    } finally {
      setBusySlot(null)
    }
  }

  const withdrawPhoto = async (photoId: string, slot: string) => {
    setBusySlot(slot)
    try {
      await withdrawVendorQcPhoto(id, photoId)
      setSupersededSlots((current) => {
        const next = { ...current }
        delete next[slot]
        return next
      })
      await loadPhotos()
    } catch (withdrawError) {
      setSlotErrors((current) => ({ ...current, [slot]: (withdrawError as Error).message }))
    } finally {
      setBusySlot(null)
    }
  }

  const setStatus = async (status: VendorJobStatus) => {
    setBusyStatus(true)
    try {
      await patchVendorJobStatus(id, status)
      // Re-read rather than patch local state: the server decides what the job
      // now looks like, and an optimistic edit would show one it does not have.
      // A 409 body carries `{ error, code, from, to, allowed }`, so the reload
      // also brings back the status the refusal was measured against.
      await load()
      // The upload window opens and closes with the status, so the panel has to
      // be re-read alongside the job rather than left showing stale pickers.
      await loadPhotos()
      setActionError(null)
      setActionMissingSlots(undefined)
    } catch (patchError) {
      setActionError((patchError as Error).message)
      // A 422 names the shots that are missing. Dropping them here is what
      // leaves a vendor with a refusal and no way to act on it.
      setActionMissingSlots(
        patchError instanceof VendorJobWriteError ? patchError.missingSlots : undefined
      )
    } finally {
      setBusyStatus(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/vendor"
          search={VENDOR_JOBS_SEARCH}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to my jobs
        </Link>
        <h1 className="mt-2 text-2xl font-medium">
          Job <span className="font-mono text-xl">{id.slice(0, 8)}</span>
        </h1>
      </div>

      <VendorJobDetailBody
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
        onStatus={setStatus}
        busyStatus={busyStatus}
        actionError={actionError}
        actionMissingSlots={actionMissingSlots}
        qc={{
          data: photos,
          isLoading: photosLoading,
          error: photosError,
          onRetry: () => void loadPhotos(),
          onUpload: uploadPhoto,
          onWithdraw: withdrawPhoto,
          busySlot,
          slotErrors,
          supersededSlots,
        }}
        // No confirm control travels with this: a parcel is confirmed on the
        // job list, where the strip that shows it lives. Offering it here would
        // imply a link between THIS job and THAT parcel which the API does not
        // make and this screen cannot check.
        inboundInTransit={inbound}
      />
    </div>
  )
}
