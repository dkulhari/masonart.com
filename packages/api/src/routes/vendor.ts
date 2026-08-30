/**
 * Vendor Portal Routes
 *
 * - GET    /api/vendor/jobs       my queue; what to work on next
 * - GET    /api/vendor/jobs/:id   one job, its items and its QC history
 * - PATCH  /api/vendor/jobs/:id   the transition a vendor may take
 * - GET    /api/vendor/jobs/:id/artwork/:itemId   a short-lived signed download
 * - GET    /api/vendor/jobs/:id/photos            my shot list, signed
 * - POST   /api/vendor/jobs/:id/photos/presign    authorise a direct-to-R2 PUT
 * - POST   /api/vendor/jobs/:id/photos/complete   record what landed
 * - DELETE /api/vendor/jobs/:id/photos/:photoId   withdraw a shot
 * - GET    /api/vendor/rates      my rate card, read-only
 * - GET    /api/vendor/payments   my settlements and what is still owed
 *
 * **This file contains no database access.** There is no `db` import, no table
 * import and no query builder anywhere below — every read and the single write
 * go through `lib/vendor-scope.ts` with the `vendorId` the `requireVendor`
 * middleware resolved into context. That is not a stylistic preference: a
 * vendor sees only their own rows, which `requireRole` cannot express, so the
 * filter lives in one module where it has ONE testable home. A handler that
 * needs data the scoped module does not expose gets a new scoped function
 * there; reaching around the module reintroduces the audit-every-route problem
 * the module exists to delete.
 *
 * Three specifics worth the ink:
 *
 * 1. **A wrong-vendor job is 404, never 403.** The scoped read puts `vendorId`
 *    in the WHERE, so the row simply is not found. 403 would confirm the job
 *    exists, which is exactly the fact a vendor should not learn.
 *
 * 2. **PATCH loads the job FIRST.** `getVendorJob(vendorId, id)` runs before any
 *    write is built, and a miss ends the request. Updating by id and checking
 *    ownership afterwards behaves identically on the happy path and disastrously
 *    the day the check is wrong. The scoped module then re-reads the row under
 *    `FOR UPDATE` inside its transaction, because this answer is a round trip
 *    old by the time the write is built.
 *
 * 3. **The PATCH body is ONE field, and it names a transition.** Not a patch:
 *    `status`, and nothing else. No amount field exists in the schema, so
 *    `amountExpected` and `amountActual` cannot arrive by accident — amounts
 *    come from the rate card at assignment, and a vendor may not price their own
 *    job. No date field exists either, so the SERVER stamps `receivedAt`,
 *    `qcSubmittedAt` and `dispatchedAt`: a vendor back-dating receipt is a lie
 *    about an SLA clock, and the only way to make it unsayable is to give it no
 *    field to say it in.
 *
 *    The status vocabulary is IMPORTED from `lib/production-transitions.ts`,
 *    where it is a `filter` over the transition matrix. It used to be a literal
 *    here — `["sent", "received"]` — which is how the RETIRED `sent` stayed in a
 *    vendor's public vocabulary for two phases after #675 erased it from the
 *    rows, and how `qc_submitted` and `dispatched` stayed out of it long after
 *    the matrix gave a vendor both. Passing QC is still ours to record, not
 *    theirs to claim: `qc_passed` and `qc_failed` have no vendor edge, so they
 *    are not in the derived tuple and cannot be named here.
 *
 * 4. **The photo upload is a presign/complete pair, and the bytes are not ours
 *    to carry.** `routes/review-media.ts`'s pattern, reused rather than
 *    re-derived: the browser PUTs straight to R2 against a short-lived
 *    signature, and `complete` re-validates everything `presign` checked
 *    because the two calls are minutes apart. `complete` also verifies the
 *    returned key by REBUILDING it from `(jobId, slot, filename)` — a key is a
 *    claim, and one naming another job or another slot would file a photograph
 *    under a shot nobody took. Every signature on this file is produced inside
 *    ONE named scope of `VENDOR_SIGNING_SCOPES`: artwork under `artwork`,
 *    photographs under `qcPhoto`, and neither may sign the other's key.
 *
 * Zero customer data crosses this boundary — no name, address, phone, email or
 * person-linked order reference. Every response here is built from the scoped
 * module's explicit column lists, which is what makes that an absolute rather
 * than a habit. The one document that will ever carry customer data is the
 * carrier label (#687), and it arrives as rendered bytes behind a signature,
 * never as fields.
 *
 * `tests/routes/vendor/isolation.test.ts` asserts all of that as PROPERTIES
 * over a route table rather than per handler, so a route added below without a
 * table entry fails that suite instead of quietly going uncovered.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  QC_PHOTO_CONTENT_TYPES,
  QC_PHOTO_MAX_BYTES,
  qcShotsForStage,
  qcSlotSchema,
  requiredQcSlots,
  type QcStage,
} from "@chobii/shared";

import { requireAuth } from "../middleware/auth";
import { requireVendor, type VendorVariables } from "../middleware/vendor";
import { recordAudit } from "../lib/audit";
import { VENDOR_SETTABLE_STATUSES } from "../lib/production-transitions";
import {
  listVendorJobs,
  getVendorJob,
  getVendorJobItems,
  getVendorJobReviews,
  updateVendorJob,
  listVendorRates,
  listVendorSettlements,
  getVendorPayableTotal,
  getVendorJobArtwork,
  listVendorJobPhotos,
  assertVendorMayUploadQcPhoto,
  recordVendorQcPhoto,
  retractVendorQcPhoto,
  type VendorQcPhoto,
} from "../lib/vendor-scope";
import {
  StoragePaths,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "../lib/storage";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * How long an artwork link lives. FIVE MINUTES — long enough to click, far too
 * short to be worth pasting anywhere.
 *
 * This is a customer's commissioned artwork. A permanent public path would work
 * just as well for the vendor and would stay readable by anyone who ever saw it
 * — a chat log, a proxy log, a screenshot — forever. `getPublicUrl` is
 * therefore never used on this route; the presigner is, every time, so a stale
 * link is a dead link rather than an open one.
 */
const ARTWORK_URL_TTL_SECONDS = 300;

/**
 * How long a QC photo's DOWNLOAD link lives. Five minutes, the same as artwork
 * and the same as the admin review screen's, so "expires in minutes, not days"
 * is one number rather than three that drift.
 */
const QC_PHOTO_URL_TTL_SECONDS = 300;

/**
 * How long the UPLOAD signature lives. Fifteen minutes, matching
 * `routes/review-media.ts`: a 25MB photograph on a print shop's wifi is not a
 * five-minute job, and an expired PUT means the vendor reshoots for no reason.
 *
 * This is also exactly why `complete` re-validates: fifteen minutes is long
 * enough for the job to be cancelled, reassigned or moved to QC in between.
 */
const QC_PHOTO_PRESIGN_TTL_SECONDS = 15 * 60;

// ============================================================================
// Validation
// ============================================================================

const listQuerySchema = z.object({
  status: z.string().min(1).max(40).optional(),
  /** Clamped, not rejected: `?limit=100000` is answered with 100 rows. */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  offset: z.coerce.number().int().min(0).default(0),
});

const jobParamSchema = z.object({ id: z.string().uuid() });

const artworkParamSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * ONE field: the status to move to.
 *
 * The vocabulary is `lib/production-transitions.ts`'s, imported — a `filter`
 * over the transition matrix rather than a list anybody maintains. This file
 * used to hold its own `["sent", "received"]` literal, which is how the RETIRED
 * `sent` stayed in a vendor's public vocabulary for two phases after #675
 * erased it from the rows.
 *
 * No amount field exists here, so no amount can reach the update path: amounts
 * are what we owe, priced from the rate card at assignment, and a vendor may
 * not price their own job.
 *
 * **And no date field exists here either.** `sentAt` and `receivedAt` used to
 * be settable; the server now stamps `receivedAt`, `qcSubmittedAt` and
 * `dispatchedAt` from its own clock. A vendor back-dating "I received it three
 * days ago" is not a data-entry convenience, it is a lie about an SLA clock —
 * and the only way to make it unsayable is to give it no field to say it in.
 */
const updateJobSchema = z.object({
  status: z.enum(VENDOR_SETTABLE_STATUSES),
});

const photoParamSchema = z.object({
  id: z.string().uuid(),
  photoId: z.string().uuid(),
});

/**
 * `slot` goes through `qcSlotSchema`, which is the ONLY thing standing between
 * a typo and a photograph nobody can find: `production_job_photos.slot` is a
 * `text` column with no enum under it, because a *value* import from the
 * ESM-only `@chobii/shared` inside `schema/` breaks `drizzle-kit generate`
 * outright. A slot the vocabulary does not know is a 400 here; a slot the
 * vocabulary knows but this job's STAGE does not ask for is a 422 from the
 * scoped module, which is a different mistake with a different remedy.
 *
 * `sizeBytes` is the browser's DECLARED size, not a measured one — a cheap
 * early reject, exactly as in `routes/review-media.ts`. R2 is told the same
 * content type in the signature, and `complete` re-checks both.
 */
const photoPresignSchema = z.object({
  slot: qcSlotSchema,
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

/**
 * `complete` takes the KEY back, and every field is re-checked against it.
 *
 * The key is client-supplied and the two calls are minutes apart, so it is
 * treated as a claim rather than as a fact: the handler REBUILDS the key it
 * would have issued for `(jobId, slot, filename)` and refuses anything that
 * does not match exactly. That is stricter than `review-media.ts`'s prefix test
 * because a QC key carries the slot as well, and a key pointing at the right
 * job but the wrong slot would file the photograph under a shot nobody took.
 */
const photoCompleteSchema = z.object({
  slot: qcSlotSchema,
  key: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

// ============================================================================
// Route Handler
// ============================================================================

const vendorApp = new Hono<{ Variables: VendorVariables }>();

// requireVendor resolves the caller into exactly one vendorId, or refuses.
// A vendor role with no link is 403 there, never an unscoped read here.
vendorApp.use("*", requireAuth, requireVendor);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

// ============================================================================
// GET /api/vendor/jobs
// ============================================================================

vendorApp.get("/jobs", zValidator("query", listQuerySchema), async (c) => {
  const vendorId = c.get("vendorId");
  const { status, limit, offset } = c.req.valid("query");

  try {
    const items = await listVendorJobs(vendorId, { status, limit, offset });
    return c.json({ items, limit, offset });
  } catch (error) {
    return c.json(failed("list jobs", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/jobs/:id
// ============================================================================

vendorApp.get("/jobs/:id", zValidator("param", jobParamSchema), async (c) => {
  const vendorId = c.get("vendorId");
  const { id } = c.req.valid("param");

  try {
    const job = await getVendorJob(vendorId, id);
    // Scoped read, so this covers both "no such job" and "not yours" — and
    // deliberately does not distinguish them.
    if (!job) return c.json({ error: "Job not found" }, 404);

    const [items, reviews] = await Promise.all([
      getVendorJobItems(vendorId, id),
      getVendorJobReviews(vendorId, id),
    ]);

    return c.json({ job, items, reviews });
  } catch (error) {
    return c.json(failed("read job", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/jobs/:id/artwork/:itemId
// ============================================================================

/**
 * A short-lived signed download for one item's print file.
 *
 * Job-scoped, not id-scoped: the scoped module resolves the key only when the
 * item sits on a job this vendor owns, so a real item id from someone else's
 * job is NOT FOUND — and, crucially, the presigner is never reached on that
 * path. A signed URL that is generated and then withheld has still been
 * generated, and lives in whatever log or trace saw it.
 *
 * The response carries the signed URL and its expiry, and nothing else. No
 * public path, no key, no order reference.
 */
vendorApp.get(
  "/jobs/:id/artwork/:itemId",
  zValidator("param", artworkParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id, itemId } = c.req.valid("param");

    try {
      const artwork = await getVendorJobArtwork(vendorId, id, itemId);
      // Covers all three of: no such job, not your job, no artwork on file.
      // None of them is worth distinguishing to the caller.
      if (!artwork) return c.json({ error: "Artwork not found" }, 404);

      const url = await getPresignedDownloadUrl(
        artwork.key,
        ARTWORK_URL_TTL_SECONDS
      );

      return c.json({
        itemId: artwork.itemId,
        url,
        expiresInSeconds: ARTWORK_URL_TTL_SECONDS,
        expiresAt: new Date(
          Date.now() + ARTWORK_URL_TTL_SECONDS * 1000
        ).toISOString(),
      });
    } catch (error) {
      return c.json(failed("sign artwork URL", error), 500);
    }
  }
);

// ============================================================================
// QC photographs
// ============================================================================

/**
 * The upload half of this router, and the one place bytes are involved.
 *
 * **They do not come through here.** A 25MB photograph routed through Hono
 * means buffering it in the Node process and holding a request open for the
 * whole transfer, on a box that also serves the storefront. The browser PUTs
 * straight to R2 against a short-lived presigned URL and only tells us the
 * object key afterwards — `routes/review-media.ts`'s pattern, reused rather
 * than re-derived.
 *
 * That split is the entire reason `complete` exists, and the reason it
 * re-validates everything `presign` already checked: the two calls are minutes
 * apart, and nothing guarantees the second one came from the same page, or that
 * the job has not been cancelled, reassigned or moved to QC in between.
 *
 * The key is `production-qc/<jobId>/<slot>/<uuid>.<ext>`, built by
 * `StoragePaths.productionQcPhoto`. It is identity-free by construction — a job
 * id is a production handle and names no customer, no order and no staff — and
 * it is RECOMPUTABLE, which is what lets `complete` verify the returned key by
 * rebuilding it rather than by trusting a prefix.
 */

/** The extension this content type keys under, or null if we do not take it. */
function qcPhotoExtension(contentType: string): string | null {
  return QC_PHOTO_CONTENT_TYPES[contentType.toLowerCase().trim()] ?? null;
}

/**
 * Is this key one WE would have issued for this job and this slot?
 *
 * Rebuilt and compared, not prefix-tested. `review-media.ts` can get away with
 * `startsWith` because its keys carry only the review id; a QC key carries the
 * slot too, and a key pointing at the right job but the wrong slot would file a
 * photograph under a shot nobody took. Equality also disposes of traversal,
 * bucket-qualified paths and full URLs in one move, since none of them rebuild
 * to themselves.
 */
function qcPhotoKeyIsOurs(jobId: string, slot: string, key: string): boolean {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  if (!filename) return false;
  return key === StoragePaths.productionQcPhoto(jobId, slot, filename);
}

/**
 * The shot list laid out slot by slot, with each live photograph in its place.
 *
 * The WHOLE list comes back, not only what was uploaded: an empty slot is the
 * point of the screen. A live photo in a slot this stage does not ask for is
 * appended rather than dropped — `slot` is `text` with no enum under it, so a
 * photograph nobody can find is a real failure mode, and hiding it here is how
 * it stays invisible.
 */
function qcShotEntries(stage: string, photos: VendorQcPhoto[]) {
  const bySlot = new Map(photos.map((photo) => [photo.slot, photo]));
  const listed = qcShotsForStage(stage as QcStage) ?? [];
  const listedSlots = new Set(listed.map((shot) => shot.slot));

  const entries = listed.map((shot) => ({
    slot: shot.slot,
    label: shot.label,
    required: shot.required,
    onShotList: true,
    photo: bySlot.get(shot.slot) ?? null,
  }));

  for (const photo of photos) {
    if (listedSlots.has(photo.slot)) continue;
    entries.push({
      slot: photo.slot,
      label: `Uploaded outside the ${stage} shot list`,
      required: false,
      onShotList: false,
      photo,
    });
  }

  return entries;
}

// ============================================================================
// GET /api/vendor/jobs/:id/photos
// ============================================================================

/**
 * What this job has been photographed with, and what it still owes.
 *
 * `missingRequiredSlots` is the one actionable field on the response: it is
 * exactly what the `received -> qc_submitted` refusal would name, computed from
 * the same `QC_SHOT_LIST`, so the screen and the refusal can never disagree.
 *
 * **The object key never leaves.** Each live photo answers with a presigned
 * download URL and nothing else. `approval_photos.url` is the counter-example
 * this deliberately does not copy: a stored URL cannot be re-signed when it
 * expires, and the URL itself becomes the capability. A key whose stored value
 * falls outside the `qcPhoto` scope is answered with a NULL url rather than
 * signed — R3 fails closed — and is still listed, because a photograph that
 * exists and cannot be shown is worth seeing on the screen.
 */
vendorApp.get(
  "/jobs/:id/photos",
  zValidator("param", jobParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");

    try {
      const found = await listVendorJobPhotos(vendorId, id);
      // Covers "no such job" and "not yours" alike, and does not distinguish
      // them. The photo table is never reached on this path.
      if (!found) return c.json({ error: "Job not found" }, 404);

      const signedAt = Date.now();

      const shots = await Promise.all(
        qcShotEntries(found.stage, found.photos).map(async (entry) => ({
          slot: entry.slot,
          label: entry.label,
          required: entry.required,
          onShotList: entry.onShotList,
          photo: entry.photo
            ? {
                id: entry.photo.id,
                contentType: entry.photo.contentType,
                sizeBytes: entry.photo.sizeBytes,
                uploadedAt: entry.photo.uploadedAt,
                /** The review that judged this shot, once one has. */
                reviewId: entry.photo.reviewId,
                url: entry.photo.key
                  ? await getPresignedDownloadUrl(
                      entry.photo.key,
                      QC_PHOTO_URL_TTL_SECONDS
                    )
                  : null,
              }
            : null,
        }))
      );

      const uploaded = new Set(found.photos.map((photo) => photo.slot));

      return c.json({
        jobId: id,
        stage: found.stage,
        status: found.status,
        shots,
        missingRequiredSlots: requiredQcSlots(found.stage as QcStage).filter(
          (slot) => !uploaded.has(slot)
        ),
        expiresInSeconds: QC_PHOTO_URL_TTL_SECONDS,
        expiresAt: new Date(
          signedAt + QC_PHOTO_URL_TTL_SECONDS * 1000
        ).toISOString(),
      });
    } catch (error) {
      return c.json(failed("list QC photos", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/jobs/:id/photos/presign
// ============================================================================

/**
 * Authorise a direct-to-R2 PUT. Creates NO row — an abandoned upload should
 * leave nothing behind but an unreferenced object, which the retention sweep
 * collects by prefix.
 *
 * Every refusal is answered BEFORE the presigner is reached. A signed URL that
 * is generated and then withheld has still been generated, and lives in
 * whatever log, trace or crash dump saw it.
 */
vendorApp.post(
  "/jobs/:id/photos/presign",
  zValidator("param", jobParamSchema),
  zValidator("json", photoPresignSchema, (result, c) => {
    if (!result.success) {
      // A slot outside the vocabulary lands here: `qcSlotSchema` is the only
      // thing between a typo and a photograph nobody can find.
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");
    const { slot, contentType, sizeBytes } = c.req.valid("json");

    try {
      const allowed = await assertVendorMayUploadQcPhoto(vendorId, id, slot);
      if (!allowed.ok) return c.json(allowed.body, allowed.status);

      const extension = qcPhotoExtension(contentType);
      if (!extension) {
        return c.json(
          {
            error:
              "That file type cannot be reviewed. Send a JPEG, PNG or WebP.",
            allowed: Object.keys(QC_PHOTO_CONTENT_TYPES),
          },
          400
        );
      }

      if (sizeBytes > QC_PHOTO_MAX_BYTES) {
        return c.json(
          {
            error: `That photograph is too large. The limit is ${Math.round(
              QC_PHOTO_MAX_BYTES / (1024 * 1024)
            )}MB.`,
            maxBytes: QC_PHOTO_MAX_BYTES,
          },
          400
        );
      }

      // The client's filename never reaches the key: it is attacker-controlled,
      // and `complete` has to be able to RECOMPUTE this key from the same three
      // values, so nothing time-varying or caller-supplied may enter it.
      const key = StoragePaths.productionQcPhoto(
        id,
        slot,
        `${crypto.randomUUID()}.${extension}`
      );

      const uploadUrl = await getPresignedUploadUrl(
        key,
        contentType,
        QC_PHOTO_PRESIGN_TTL_SECONDS
      );

      return c.json({
        uploadUrl,
        key,
        slot,
        contentType,
        maxBytes: QC_PHOTO_MAX_BYTES,
        expiresInSeconds: QC_PHOTO_PRESIGN_TTL_SECONDS,
      });
    } catch (error) {
      return c.json(failed("prepare photo upload", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/jobs/:id/photos/complete
// ============================================================================

/**
 * Record the object that landed, superseding whatever held the slot.
 *
 * Everything `presign` checked is checked AGAIN — the job is still theirs,
 * still in the window, the slot is still on its shot list, the type is still
 * one we take, the size is still under the cap — and the key is verified by
 * REBUILDING it rather than by trusting it. That is not belt and braces: the
 * two calls are minutes apart, and the second one is the first time we learn
 * what actually got uploaded.
 *
 * The previous live photo is superseded, never deleted, and the stamp happens
 * before the insert so the partial unique index on `(job_id, slot) WHERE
 * superseded_at IS NULL` is never violated. Both are in one transaction.
 */
vendorApp.post(
  "/jobs/:id/photos/complete",
  zValidator("param", jobParamSchema),
  zValidator("json", photoCompleteSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const vendorId = c.get("vendorId");
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const { slot, key, contentType, sizeBytes } = c.req.valid("json");

    try {
      // The key is a CLAIM. Without this a caller can point a photo row at any
      // object in the bucket — another job's shot, a catalogue print file, a
      // carrier label — and have it filed as their own QC evidence.
      //
      // Checked BEFORE the job is loaded, unlike `presign`, and that is not an
      // inconsistency: this answer is computed from the URL's own job id and
      // the body alone, so it says nothing about whether the job exists or
      // whose it is. It costs no round trip and leaks nothing.
      if (!qcPhotoKeyIsOurs(id, slot, key)) {
        return c.json(
          { error: "That upload key does not belong to this job and slot." },
          400
        );
      }

      const extension = qcPhotoExtension(contentType);
      if (!extension) {
        return c.json(
          {
            error:
              "That file type cannot be reviewed. Send a JPEG, PNG or WebP.",
            allowed: Object.keys(QC_PHOTO_CONTENT_TYPES),
          },
          400
        );
      }

      if (sizeBytes > QC_PHOTO_MAX_BYTES) {
        return c.json(
          {
            error: `That photograph is too large. The limit is ${Math.round(
              QC_PHOTO_MAX_BYTES / (1024 * 1024)
            )}MB.`,
            maxBytes: QC_PHOTO_MAX_BYTES,
          },
          400
        );
      }

      const result = await recordVendorQcPhoto(vendorId, id, {
        slot,
        objectKey: key,
        contentType,
        sizeBytes,
        // Their own staff, so it is theirs to keep — and it never comes back
        // out in any response on this boundary.
        uploadedBy: user?.id ?? null,
      });

      if (!result.ok) return c.json(result.body, result.status);

      return c.json(
        {
          photo: {
            id: result.photo.id,
            slot: result.photo.slot,
            contentType: result.photo.contentType,
            sizeBytes: result.photo.sizeBytes,
            uploadedAt: result.photo.uploadedAt,
          },
          /**
           * Named rather than implied: the vendor replaced a shot, and a UI
           * that silently swapped the thumbnail would hide the fact that the
           * earlier one is still on file.
           */
          supersededPhotoId: result.supersededPhotoId,
        },
        201
      );
    } catch (error) {
      return c.json(failed("record photo upload", error), 500);
    }
  }
);

// ============================================================================
// DELETE /api/vendor/jobs/:id/photos/:photoId
// ============================================================================

/**
 * Withdraw a shot from the LIVE list.
 *
 * The row is superseded, not deleted, and the R2 object is left alone. The
 * collection this removes the photograph from is "the live shot list", which is
 * what `superseded_at IS NULL` means — so the verb is honest while the history
 * survives, exactly as `production_job_reviews` does it.
 *
 * Deleting the row would also orphan the object forever: a cascade cannot reach
 * into object storage, which is why the 400-day retention sweep has to call
 * `deleteByPrefix` first and delete rows second.
 */
vendorApp.delete(
  "/jobs/:id/photos/:photoId",
  zValidator("param", photoParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id, photoId } = c.req.valid("param");

    try {
      const result = await retractVendorQcPhoto(vendorId, id, photoId);
      if (!result.ok) return c.json(result.body, result.status);

      return c.json({
        message: "Photograph withdrawn",
        photoId: result.photoId,
        slot: result.slot,
      });
    } catch (error) {
      return c.json(failed("withdraw photo", error), 500);
    }
  }
);

// ============================================================================
// PATCH /api/vendor/jobs/:id
// ============================================================================

/**
 * The one write a vendor gets, and it is a TRANSITION rather than a patch.
 *
 * Three things happen here and nowhere else in this file:
 *
 * 1. **The decision is not taken here.** `updateVendorJob` re-reads under a
 *    lock, asks `lib/production-transitions.ts` whether this actor may take
 *    this edge, evaluates the guard the matrix NAMES on it, stamps the clock
 *    itself and writes with the predicate repeated — all in one transaction.
 *    This handler translates its answer into a status code.
 *
 * 2. **404, 409 and 422 are three different answers.** The scoped module used
 *    to answer `null` for everything, so a vendor whose job was cancelled under
 *    them got the same reply as a vendor guessing at somebody else's id. 409 is
 *    "the world moved" — cancelled, settled, illegal edge, lost race — and 422
 *    is the one refusal the caller can fix, an incomplete QC shot list.
 *
 * 3. **The audit rows go on opposite sides of the transaction.** The success row
 *    SHARES it, because a row saying "the job moved" beside a job that did not
 *    is worse than no row. The refusal row must NOT: a refusal records that a
 *    transaction was rolled back, so writing it inside that transaction rolls
 *    the evidence back too. `updateVendorJob` has already returned by then, so
 *    the refusal below is written outside every transaction by construction.
 *
 * A 404 gets no refusal row at all. There is no entity to refuse, and a row
 * confirming one exists is the fact the 404 is there to withhold; the audit
 * middleware's floor row is the right level of detail.
 */
vendorApp.patch(
  "/jobs/:id",
  zValidator("param", jobParamSchema),
  zValidator("json", updateJobSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      // LOAD FIRST. The 404 below happens before any write exists, which is the
      // whole difference between this and update-then-check. The locked re-read
      // inside the transaction repeats the same scoped predicate, because this
      // answer is a round trip old by the time the write is built.
      const existing = await getVendorJob(vendorId, id);
      if (!existing) return c.json({ error: "Job not found" }, 404);

      const result = await updateVendorJob(
        vendorId,
        id,
        { status: body.status },
        {
          onTransition: async (tx, move) => {
            await recordAudit(
              c,
              {
                action: "production_job.transitioned",
                entityType: "production_job",
                entityId: id,
                summary: `Production job moved from ${move.from} to ${move.to} by the vendor`,
                before: move.before,
                after: move.after,
                metadata: { from: move.from, to: move.to },
              },
              // Shares the transaction. See point 3 above.
              tx
            );

            // The shot list is a SECOND fact about the same move, and it is the
            // one a QC dispute is argued from: which photographs were submitted,
            // and which objects they were. Recorded from the guard's OWN result
            // rather than re-queried — the photo table is not locked, and a
            // re-upload landing between the two reads would produce a row naming
            // a shot the guard never counted.
            //
            // Shares the transaction for the same reason the move does: a row
            // saying "these shots were submitted" beside a job that never left
            // `received` is worse than no row.
            if (!move.evidence) return;

            await recordAudit(
              c,
              {
                action: "production_job.photos_submitted",
                entityType: "production_job",
                entityId: id,
                summary: `Vendor submitted ${move.evidence.slots.length} QC photographs for review`,
                after: {
                  slots: move.evidence.slots,
                  // Identity-free by construction
                  // (`production-qc/<jobId>/<slot>/<file>`), so recording it
                  // costs nothing under R1 and lets a dispute name the object.
                  keys: move.evidence.keys,
                },
                metadata: { from: move.from, to: move.to },
              },
              tx
            );
          },
        }
      );

      if (result.ok) {
        return c.json({ message: "Job updated", job: result.job });
      }

      // No entity, so nothing to refuse.
      if (result.status === 404) return c.json(result.body, 404);

      await recordAudit(c, {
        action: "production_job.transition_refused",
        entityType: "production_job",
        entityId: id,
        summary: result.body.error,
        outcome: "failure",
        metadata: result.body,
        // NO `tx`, deliberately, and there is none to pass: the transaction
        // this row is ABOUT has already rolled back.
      });

      return c.json(result.body, result.status);
    } catch (error) {
      return c.json(failed("update job", error), 500);
    }
  }
);

// ============================================================================
// GET /api/vendor/rates
// ============================================================================

vendorApp.get("/rates", async (c) => {
  const vendorId = c.get("vendorId");

  try {
    // Read-only by omission: there is no POST/PATCH/DELETE beside this route.
    // The rate card is negotiated with us and written on the admin side.
    const items = await listVendorRates(vendorId);
    return c.json({ items });
  } catch (error) {
    return c.json(failed("list rates", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/payments
// ============================================================================

vendorApp.get("/payments", async (c) => {
  const vendorId = c.get("vendorId");

  try {
    const [settlements, payableTotal] = await Promise.all([
      listVendorSettlements(vendorId),
      // Derived from unsettled jobs, never a stored balance — there is no
      // parallel ledger here to disagree with the admin side.
      getVendorPayableTotal(vendorId),
    ]);

    return c.json({ settlements, payableTotal });
  } catch (error) {
    return c.json(failed("read payments", error), 500);
  }
});

export { vendorApp };
export default vendorApp;
