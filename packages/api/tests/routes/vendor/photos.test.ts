/**
 * Vendor portal API — QC photographs.
 *
 * `GET /jobs/:id/photos`, `POST /jobs/:id/photos/presign`,
 * `POST /jobs/:id/photos/complete`, `DELETE /jobs/:id/photos/:photoId`, and the
 * audit row the finished shot list produces on `received -> qc_submitted`.
 *
 * Five things are asserted here that a "does it upload" test would not:
 *
 * 1. **The bytes never route through Hono.** The browser PUTs straight to R2
 *    against a short-lived signed URL, exactly as `routes/review-media.ts` does,
 *    which is why `complete` exists at all — and why it RE-VALIDATES everything
 *    `presign` checked. The two calls are minutes apart and nothing guarantees
 *    the second came from the same page, or that the job has not been cancelled,
 *    settled or moved in between. Every refusal `presign` can answer is asserted
 *    again against `complete`.
 *
 * 2. **A re-upload SUPERSEDES; nothing is ever deleted.** `production_job_photos`
 *    carries a partial unique index on `(job_id, slot) WHERE superseded_at IS
 *    NULL`, so the write order is load-bearing: stamp the old row first, insert
 *    second, both inside one transaction. Insert-then-supersede would violate
 *    the index, and delete-then-insert would throw away the history the append
 *    -only design exists for. The order is asserted, not assumed.
 *
 * 3. **The presigner is never CALLED on a refusal.** Not "the response was a
 *    404": a signed URL that is generated and then withheld has still been
 *    generated, and lives in whatever log, trace or crash dump saw it.
 *
 * 4. **Photos sign under the `qcPhoto` scope and nothing else.** A stored key
 *    that somehow reads `products/…` or `fulfilment/labels/…` is refused rather
 *    than signed — R3, and the reason the label exception cannot widen. The
 *    pairwise disjointness itself lives in `isolation.test.ts`; what is asserted
 *    here is that THESE routes go through the allow-list at all.
 *
 * 5. **An incomplete shot list is a 422 that NAMES the missing slots.** A
 *    refusal the vendor cannot act on is a support ticket. The gate itself is
 *    covered in `jobs.test.ts` (it is a PATCH refusal); what is new here is the
 *    `production_job.photos_submitted` row the successful edge writes, which
 *    records the slots and the keys it accepted and shares the transaction —
 *    a row saying "these shots were submitted" beside a job that never moved is
 *    worse than no row.
 *
 * Harness: the recording query builder from `jobs.test.ts`. `src/database`
 * records the WHERE that actually reached the driver, `src/auth` is mocked so
 * each test picks the caller, and the REAL `requireVendor` / `lib/vendor-scope`
 * run on top. Only the presigners and `recordAudit` are spies.
 *
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/src/lib/vendor-scope.ts
 * @see packages/api/src/routes/review-media.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRouteApp } from '../../helpers/route-app'
import { vendorSessionFor } from '../../helpers/vendor-session'
import '../../setup'

import { productionJobs, productionJobPhotos } from '../../../src/database/schema/production-jobs'

// ============================================================================
// Recording database mock
// ============================================================================

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder({ rows: 'repeatLast' })
)

vi.mock('../../../src/database', () => ({ db: recorder.db }))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

const UPLOAD_URL = 'https://r2.example.com/bucket/put?X-Amz-Signature=deadbeef'
const DOWNLOAD_URL = 'https://r2.example.com/bucket/get?X-Amz-Signature=cafef00d'

const mockUploadPresign = vi.hoisted(() =>
  vi.fn(
    async (_key: string, _contentType?: string, _expiresIn?: number) =>
      'https://r2.example.com/bucket/put?X-Amz-Signature=deadbeef'
  )
)
const mockDownloadPresign = vi.hoisted(() =>
  vi.fn(
    async (_key: string, _expiresIn?: number) =>
      'https://r2.example.com/bucket/get?X-Amz-Signature=cafef00d'
  )
)
const mockPublicUrl = vi.hoisted(() => vi.fn((key: string) => `https://cdn.example.com/${key}`))

/**
 * `StoragePaths` is the REAL one. The whole point of `complete`'s key check is
 * that the route rebuilds the key the same way `presign` built it; a stubbed
 * builder would make that agreement true by construction and prove nothing.
 */
vi.mock('../../../src/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/storage')>()),
  getPresignedUploadUrl: (...args: unknown[]) =>
    mockUploadPresign(...(args as [string, string?, number?])),
  getPresignedDownloadUrl: (...args: unknown[]) =>
    mockDownloadPresign(...(args as [string, number?])),
  getPublicUrl: (...args: unknown[]) => mockPublicUrl(...(args as [string])),
}))

const auditSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => auditSpy(...args),
}))

import { vendorApp } from '../../../src/routes/vendor'
import { readJson } from '../../helpers/json'
import { QC_PHOTO_CONTENT_TYPES, QC_PHOTO_MAX_BYTES } from '@chobii/shared'

// ============================================================================
// Fixtures
// ============================================================================

const { params, render, queueRows, ops, queries } = recorder

const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
/** A real job id — another vendor's. The interesting attack, not a fake uuid. */
const OTHER_JOB_ID = '2222222b-2222-4222-8222-222222222222'
const PHOTO_ID = '66666666-6666-4666-8666-666666666666'
const OLD_PHOTO_ID = '6666666a-6666-4666-8666-666666666666'

const PAST = new Date('2026-01-01T00:00:00Z')

const buildApp = () => buildRouteApp('/api/vendor', vendorApp)

/** A job row as `getVendorJob`'s column list returns it. `received` accepts photos. */
function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    stage: 'print',
    status: 'received',
    dueAt: PAST,
    sentAt: null,
    receivedAt: PAST,
    amountExpected: '100.00',
    amountActual: null,
    createdAt: PAST,
    ...over,
  }
}

/** The row the LOCKED read inside `updateVendorJob`'s transaction returns. */
function lockRow(over: Record<string, unknown> = {}) {
  return { id: JOB_ID, stage: 'print', status: 'received', settlementId: null, ...over }
}

function photoRow(over: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    slot: 'print_full',
    objectKey: `production-qc/${JOB_ID}/print_full/shot.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    uploadedAt: PAST,
    reviewId: null,
    ...over,
  }
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const photosPath = (jobId = JOB_ID) => `/api/vendor/jobs/${jobId}/photos`

/** Every live shot the `print` list marks required, with the key the guard reads. */
const PRINT_REQUIRED_LIVE = [
  { slot: 'print_full', objectKey: `production-qc/${JOB_ID}/print_full/a.jpg` },
  {
    slot: 'print_colour_reference',
    objectKey: `production-qc/${JOB_ID}/print_colour_reference/b.jpg`,
  },
  {
    slot: 'print_raking_light',
    objectKey: `production-qc/${JOB_ID}/print_raking_light/c.jpg`,
  },
]

const CUSTOMER_FIELDS = [
  'orderId',
  'order_id',
  'orderNumber',
  'customer',
  'customerName',
  'email',
  'phone',
  'address',
  'shippingAddress',
  'userId',
]

function expectNoCustomerData(body: unknown) {
  const serialised = JSON.stringify(body)
  for (const field of CUSTOMER_FIELDS) {
    expect(serialised, `response leaks ${field}`).not.toContain(`"${field}"`)
  }
}

beforeEach(() => {
  recorder.reset()
  auditSpy.mockReset()
  auditSpy.mockResolvedValue(undefined)
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(vendorSessionFor('vendor'))
  mockUploadPresign.mockClear()
  mockUploadPresign.mockResolvedValue(UPLOAD_URL)
  mockDownloadPresign.mockClear()
  mockDownloadPresign.mockResolvedValue(DOWNLOAD_URL)
  mockPublicUrl.mockClear()
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
})

// ============================================================================
// GET /api/vendor/jobs/:id/photos
// ============================================================================

describe('GET /api/vendor/jobs/:id/photos', () => {
  it('answers the whole shot list for the stage, naming what is still missing', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[photoRow()]],
    })

    const res = await buildApp().request(photosPath())
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.jobId).toBe(JOB_ID)
    expect(body.stage).toBe('print')

    // The EMPTY slots are the point of the screen: a vendor has to see what is
    // still owed, not only what they already sent.
    expect(body.shots.map((s: { slot: string }) => s.slot)).toEqual([
      'print_full',
      'print_colour_reference',
      'print_raking_light',
      'print_detail',
    ])
    expect(body.shots[0].photo?.url).toBe(DOWNLOAD_URL)
    expect(body.shots[1].photo).toBeNull()

    // The one actionable field on the whole response.
    expect(body.missingRequiredSlots).toEqual(['print_colour_reference', 'print_raking_light'])

    expectNoCustomerData(body)
  })

  it('never returns the object key — only a signed, expiring URL', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[photoRow()]],
    })

    const body = await readJson(await buildApp().request(photosPath()))

    // `approval_photos.url` is the counter-example: a stored URL cannot be
    // re-signed and becomes the capability itself.
    expect(JSON.stringify(body)).not.toContain('objectKey')
    expect(JSON.stringify(body)).not.toContain(photoRow().objectKey)
    expect(body.expiresInSeconds).toBeGreaterThan(0)
    expect(body.expiresInSeconds).toBeLessThanOrEqual(15 * 60)
    expect(mockDownloadPresign.mock.calls[0][1]).toBe(body.expiresInSeconds)
  })

  it('counts LIVE photos only — a superseded shot is history, not a submission', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[photoRow()]],
    })

    await buildApp().request(photosPath())

    const read = ops('select', productionJobPhotos)[0]
    expect(read, 'the shot list was answered without reading any photo').toBeDefined()
    expect(render(read?.where).sql).toContain('superseded_at')
    expect(params(read?.where)).toContain(JOB_ID)
  })

  it("answers 404 for another vendor's job and signs nothing", async () => {
    // No job rows queued: the scoped read carries VENDOR_ID and finds nothing.
    const res = await buildApp().request(photosPath(OTHER_JOB_ID))
    expect(res.status).toBe(404)

    expect(mockDownloadPresign).not.toHaveBeenCalled()
    // The photo table is not even reached.
    expect(ops('select', productionJobPhotos)).toEqual([])
  })

  it('surfaces a live photo in a slot this stage does not ask for, rather than dropping it', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      // `slot` is `text` with no enum under it, so a photograph nobody can find
      // is a real failure mode. Hiding it here is how it stays invisible.
      'select:production_job_photos': [[photoRow({ slot: 'frame_back' })]],
    })

    const body = await readJson(await buildApp().request(photosPath()))
    const stray = body.shots.find((s: { slot: string }) => s.slot === 'frame_back')
    expect(stray).toBeDefined()
    expect(stray.onShotList).toBe(false)
  })

  it('refuses to sign a stored key from another scope, and answers no URL for it', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [
        [photoRow({ objectKey: 'fulfilment/labels/9f3c1b7a5e2d4c8b.pdf' })],
      ],
    })

    const res = await buildApp().request(photosPath())
    expect(res.status).toBe(200)

    const body = await readJson(res)
    // Fail CLOSED. The label is the one object in this bucket carrying a
    // customer's name and address, and this route performs no consolidator
    // check — so it signs inside its own scope or not at all.
    expect(mockDownloadPresign).not.toHaveBeenCalled()
    expect(body.shots[0].photo.url).toBeNull()
  })
})

// ============================================================================
// POST /api/vendor/jobs/:id/photos/presign
// ============================================================================

describe('POST /api/vendor/jobs/:id/photos/presign', () => {
  const presign = (over: Record<string, unknown> = {}, jobId = JOB_ID) =>
    buildApp().request(
      `${photosPath(jobId)}/presign`,
      json({ slot: 'print_full', contentType: 'image/jpeg', sizeBytes: 2048, ...over })
    )

  it('signs an upload URL under the qcPhoto scope and creates no row', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await presign()
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.uploadUrl).toBe(UPLOAD_URL)
    // `production-qc/<jobId>/<slot>/<filename>` — identity-free by construction.
    expect(body.key).toMatch(new RegExp(`^production-qc/${JOB_ID}/print_full/[^/]+\\.jpg$`))
    expect(mockUploadPresign).toHaveBeenCalledTimes(1)
    expect(mockUploadPresign.mock.calls[0][0]).toBe(body.key)
    expect(mockUploadPresign.mock.calls[0][1]).toBe('image/jpeg')

    // An abandoned upload leaves an unreferenced object and nothing else.
    expect(queries.filter((q) => q.op !== 'select')).toEqual([])
    expectNoCustomerData(body)
  })

  it("answers 404 for another vendor's job and never reaches the presigner", async () => {
    const res = await presign({}, OTHER_JOB_ID)
    expect(res.status).toBe(404)
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })

  it('refuses a job that is past the point of shooting it, and signs nothing', async () => {
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]] })

    const res = await presign()
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body.code).toBe('JOB_NOT_ACCEPTING_PHOTOS')
    // Named, so the vendor knows when they could have.
    expect(body.allowed).toContain('received')
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })

  it("refuses a slot from the other stage's list, naming this stage's slots", async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await presign({ slot: 'frame_back' })
    expect(res.status).toBe(422)

    const body = await readJson(res)
    expect(body.code).toBe('SLOT_NOT_ON_SHOT_LIST')
    expect(body.stage).toBe('print')
    expect(body.slots).toContain('print_full')
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })

  it('refuses a slot outside the vocabulary entirely', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await presign({ slot: 'print_bak' })
    expect(res.status).toBe(400)
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })

  it('refuses a content type nothing can render, listing what is accepted', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    // HEIC is what a phone shoots by default and what no reviewer's browser
    // displays, so it is refused at the door rather than stored unviewable.
    const res = await presign({ contentType: 'image/heic' })
    expect(res.status).toBe(400)

    const body = await readJson(res)
    expect(body.allowed).toEqual(Object.keys(QC_PHOTO_CONTENT_TYPES))
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })

  it('refuses a file over the cap before signing anything', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await presign({ sizeBytes: QC_PHOTO_MAX_BYTES + 1 })
    expect(res.status).toBe(400)
    expect((await readJson(res)).maxBytes).toBe(QC_PHOTO_MAX_BYTES)
    expect(mockUploadPresign).not.toHaveBeenCalled()
  })
})

// ============================================================================
// POST /api/vendor/jobs/:id/photos/complete
// ============================================================================

describe('POST /api/vendor/jobs/:id/photos/complete', () => {
  const KEY = `production-qc/${JOB_ID}/print_full/1a2b3c.jpg`

  const complete = (over: Record<string, unknown> = {}, jobId = JOB_ID) =>
    buildApp().request(
      `${photosPath(jobId)}/complete`,
      json({
        slot: 'print_full',
        key: over.key === undefined ? KEY : over.key,
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        ...over,
      })
    )

  it('records the object, storing the KEY and never a URL', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[]],
      'insert:production_job_photos': [[photoRow({ id: PHOTO_ID, objectKey: KEY })]],
    })

    const res = await complete()
    expect(res.status).toBe(201)

    const inserted = ops('insert', productionJobPhotos)[0]
    expect(inserted).toBeDefined()
    const values = inserted?.values as Record<string, unknown>
    expect(values.objectKey).toBe(KEY)
    expect(values.jobId).toBe(JOB_ID)
    expect(values.slot).toBe('print_full')
    // Recorded at complete, NOT trusted from presign: the two calls are minutes
    // apart and what was promised and what landed can differ.
    expect(values.contentType).toBe('image/jpeg')
    expect(values.sizeBytes).toBe(2048)

    // A stored URL cannot be re-signed and puts the object outside the
    // allow-list. `getPublicUrl` is never reached on this boundary.
    expect(mockPublicUrl).not.toHaveBeenCalled()
    expectNoCustomerData(await readJson(res))
  })

  it('SUPERSEDES the live photo in that slot before inserting, and deletes nothing', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[{ id: OLD_PHOTO_ID }]],
      'update:production_job_photos': [[{ id: OLD_PHOTO_ID }]],
      'insert:production_job_photos': [[photoRow({ objectKey: KEY })]],
    })

    const res = await complete()
    expect(res.status).toBe(201)

    // The partial unique index is on `(job_id, slot) WHERE superseded_at IS
    // NULL`. Insert-then-supersede trips it; this order does not.
    const photoWrites = queries.filter(
      (q) => q.table === 'production_job_photos' && q.op !== 'select'
    )
    expect(photoWrites.map((q) => q.op)).toEqual(['update', 'insert'])

    // The row it stamps is the LIVE one it found in this slot on this job —
    // located by slot, stamped by id, and both predicates repeated in the
    // UPDATE so anybody who superseded it in between wins instead.
    const located = ops('select', productionJobPhotos)[0]
    expect(params(located?.where)).toEqual(expect.arrayContaining([JOB_ID, 'print_full']))
    expect(render(located?.where).sql).toContain('superseded_at')

    const supersede = photoWrites[0]
    expect((supersede.values as Record<string, unknown>).supersededAt).toBeInstanceOf(Date)
    expect(params(supersede.where)).toEqual(expect.arrayContaining([OLD_PHOTO_ID, JOB_ID]))
    expect(render(supersede.where).sql).toContain('superseded_at')

    // Append-only: the previous shot is history, not rubbish.
    expect(queries.filter((q) => q.op === 'delete')).toEqual([])

    // One transaction, so a failed insert cannot leave the slot empty.
    expect(photoWrites.every((q) => q.inTx)).toBe(true)
    expect((await readJson(res)).supersededPhotoId).toBe(OLD_PHOTO_ID)
  })

  it('RE-VALIDATES the job rather than trusting the presign', async () => {
    // Minutes have passed; the job has moved on since the URL was signed.
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]] })

    const res = await complete()
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('JOB_NOT_ACCEPTING_PHOTOS')
    expect(ops('insert', productionJobPhotos)).toEqual([])
  })

  it("answers 404 for another vendor's job and writes nothing", async () => {
    // A well-formed request aimed at somebody else's job — key and all. A key
    // still naming OUR job would be refused by the rebuild check before the
    // scoping ever came into it, which would prove nothing about scoping.
    const res = await complete(
      { key: `production-qc/${OTHER_JOB_ID}/print_full/1a2b3c.jpg` },
      OTHER_JOB_ID
    )
    expect(res.status).toBe(404)
    expect(queries.filter((q) => q.op !== 'select')).toEqual([])

    // The miss happened in the WHERE, not in a check afterwards.
    const read = ops('select', productionJobs)[0]
    expect(params(read?.where)).toContain(VENDOR_ID)
  })

  it.each([
    [`production-qc/${OTHER_JOB_ID}/print_full/x.jpg`, "another job's key"],
    [`production-qc/${JOB_ID}/print_raking_light/x.jpg`, "another slot's key"],
    ['products/originals/abc.jpg', 'an artwork key'],
    ['fulfilment/labels/9f3c1b7a5e2d4c8b.pdf', 'a carrier-label key'],
    [`production-qc/${JOB_ID}/print_full/../../x.jpg`, 'a traversal'],
    [`https://cdn.example.com/production-qc/${JOB_ID}/print_full/x.jpg`, 'a URL'],
  ])('refuses %s (%s) and records nothing', async (key) => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await complete({ key })
    expect(res.status).toBe(400)
    expect(ops('insert', productionJobPhotos)).toEqual([])
  })

  it("refuses a slot from the other stage's list on the second call too", async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await complete({
      slot: 'frame_back',
      key: `production-qc/${JOB_ID}/frame_back/x.jpg`,
    })
    expect(res.status).toBe(422)
    expect(ops('insert', productionJobPhotos)).toEqual([])
  })

  it('re-checks the content type, which presign only ever saw a promise of', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await complete({ contentType: 'video/mp4' })
    expect(res.status).toBe(400)
    expect(ops('insert', productionJobPhotos)).toEqual([])
  })
})

// ============================================================================
// DELETE /api/vendor/jobs/:id/photos/:photoId
// ============================================================================

describe('DELETE /api/vendor/jobs/:id/photos/:photoId', () => {
  const retract = (photoId = PHOTO_ID, jobId = JOB_ID) =>
    buildApp().request(`${photosPath(jobId)}/${photoId}`, { method: 'DELETE' })

  it('supersedes the row rather than deleting it', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[{ id: PHOTO_ID, slot: 'print_full' }]],
      'update:production_job_photos': [[{ id: PHOTO_ID }]],
    })

    const res = await retract()
    expect(res.status).toBe(200)

    const update = ops('update', productionJobPhotos)[0]
    expect(update).toBeDefined()
    expect((update?.values as Record<string, unknown>).supersededAt).toBeInstanceOf(Date)

    // The row and the object both survive — the 400-day sweep owns their end,
    // and a DELETE that orphaned the R2 object would break that pairing.
    expect(queries.filter((q) => q.op === 'delete')).toEqual([])

    const body = await readJson(res)
    expect(body.photoId).toBe(PHOTO_ID)
    expect(body.slot).toBe('print_full')
  })

  it("answers 404 for another vendor's job and writes nothing", async () => {
    const res = await retract(PHOTO_ID, OTHER_JOB_ID)
    expect(res.status).toBe(404)
    expect(queries.filter((q) => q.op !== 'select')).toEqual([])
  })

  it('answers 404 for a photo that is not live on this job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_photos': [[]],
    })

    const res = await retract()
    expect(res.status).toBe(404)
    expect((await readJson(res)).code).toBe('PHOTO_NOT_FOUND')
    expect(ops('update', productionJobPhotos)).toEqual([])
  })

  it('refuses once the job is past the point of reshooting it', async () => {
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]] })

    const res = await retract()
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('JOB_NOT_ACCEPTING_PHOTOS')
    expect(ops('update', productionJobPhotos)).toEqual([])
  })
})

// ============================================================================
// The shot-list gate, and the row it writes
// ============================================================================

/**
 * The 422 itself lives in `jobs.test.ts` — it is a PATCH refusal, and that is
 * where the transition suite is. What is asserted here is the other half: the
 * successful edge writes `production_job.photos_submitted`, inside the
 * transaction, naming the shots it accepted.
 */
describe('production_job.photos_submitted', () => {
  const submit = () =>
    buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'qc_submitted' }, 'PATCH')
    )

  it('records the slots AND the keys it accepted, sharing the transaction', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()], [lockRow()], [jobRow({ status: 'qc_submitted' })]],
      'select:production_job_photos': [PRINT_REQUIRED_LIVE],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    const res = await submit()
    expect(res.status).toBe(200)

    const call = auditSpy.mock.calls.find(
      (c) => (c[1] as { action: string }).action === 'production_job.photos_submitted'
    )
    expect(call, 'the finished shot list wrote no audit row').toBeDefined()

    const entry = call![1] as { after: Record<string, unknown>; entityId: string }
    expect(entry.entityId).toBe(JOB_ID)
    expect(entry.after.slots).toEqual(PRINT_REQUIRED_LIVE.map((p) => p.slot))
    expect(entry.after.keys).toEqual(PRINT_REQUIRED_LIVE.map((p) => p.objectKey))

    // Shares the transaction: a row saying "these shots were submitted" beside
    // a job that never moved is worse than no row.
    expect(call![2], 'photos_submitted did not share the transaction').toBeDefined()
  })

  it('writes no photos_submitted row on an edge that is not the QC submission', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({ status: 'qc_failed' })],
        [lockRow({ status: 'qc_failed' })],
        [jobRow()],
      ],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    const actions = auditSpy.mock.calls.map((c) => (c[1] as { action: string }).action)
    expect(actions).toContain('production_job.transitioned')
    expect(actions).not.toContain('production_job.photos_submitted')
  })

  it('writes no photos_submitted row when the shot list is refused', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()], [lockRow()]],
      'select:production_job_photos': [[{ slot: 'print_full', objectKey: 'production-qc/x' }]],
    })

    const res = await submit()
    expect(res.status).toBe(422)

    const actions = auditSpy.mock.calls.map((c) => (c[1] as { action: string }).action)
    expect(actions).not.toContain('production_job.photos_submitted')
    expect(actions).toContain('production_job.transition_refused')
  })
})
