/**
 * Production QC contracts — the photo shot list.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7
 *
 * A vendor finishes a piece and photographs it before we will accept the work.
 * This module is the ONE copy of what "photographed" means, and it lives here
 * rather than in the API for a hard reason: `production_job_photos.slot` is a
 * `text` column, not a `pgEnum`. `packages/api/src/database/schema/shipping.ts`
 * records that a *value* import from this ESM-only package inside `schema/`
 * breaks `drizzle-kit generate` outright, so the API's schema layer cannot name
 * these values at all. A text column keeps the vocabulary here, where the
 * vendor portal and the API read the same list.
 *
 * The consequence to hold onto: **the database will accept any string.** There
 * is no enum below this to catch `frame_bak`. `qcSlotSchema` is the only thing
 * standing between a typo and a photo nobody can find, so it belongs at every
 * write.
 *
 * Two shapes here are not arbitrary:
 *
 * - **Slot keys are globally unique across stages, not just within one.**
 *   `(job_id, slot) WHERE superseded_at IS NULL` is the identity of a live
 *   photo; two shots sharing a key would supersede each other silently.
 * - **Each corner is its own slot.** That index allows exactly one live photo
 *   per slot, so a single `frame_corners` entry would be one photograph
 *   asserting four mitre joins are clean. Four slots, four photographs.
 *
 * Slot keys are also a path segment — `production-qc/<jobId>/<slot>/<filename>`
 * — so they are restricted to `[a-z0-9_]`, which `sanitizeKeySegment` passes
 * through unchanged. A slot containing a slash or a space would be rewritten in
 * the key and the round trip from object key back to slot would not close.
 */

import { z } from 'zod'

/**
 * Mirrors `production_job_stage` in the API. Two lists, kept in step by
 * `packages/api/tests/database/production-job-photos.test.ts` — a stage the API
 * knows and this list does not is a job whose shot list is empty, and empty
 * passes completeness vacuously.
 */
export const QC_STAGES = ['print', 'frame'] as const

export type QcStage = (typeof QC_STAGES)[number]

export const qcStageSchema = z.enum(QC_STAGES)

/**
 * One photograph we ask for.
 *
 * `required` is explicit rather than inferred from an `optional` suffix,
 * because the completeness check at `received → qc_submitted` reads it and a
 * naming convention is not a contract.
 */
export interface QcShot {
  /** Stable key. Stored in `production_job_photos.slot` and in the object key. */
  slot: string
  /** Shown to the vendor. Phrased as an instruction, not a noun. */
  label: string
  /** Whether `assertShotListComplete` refuses the submission without it. */
  required: boolean
}

/**
 * What each stage must photograph.
 *
 * Print — the three required shots each answer a different complaint. The flat
 * front-on shot proves what was printed; the colour reference in frame is what
 * makes "the blue is wrong" answerable rather than a claim about someone's
 * monitor; raking light is the only way banding, scuffing and head strikes show
 * up at all.
 *
 * Frame — the front-on shot and the glazing under raking light cover the face;
 * the four corners cover the mitre joins, which is where cheap framing fails;
 * the back covers the hanging fixture, which is the one defect the customer
 * discovers at the wall rather than at the unboxing.
 *
 * The detail shot is optional in both: it is where a vendor volunteers
 * something the fixed list did not ask about.
 */
export const QC_SHOT_LIST: Record<QcStage, readonly QcShot[]> = {
  print: [
    { slot: 'print_full', label: 'The whole print, flat and front-on', required: true },
    {
      slot: 'print_colour_reference',
      label: 'The print beside the colour reference',
      required: true,
    },
    {
      slot: 'print_raking_light',
      label: 'Raking light across the print surface',
      required: true,
    },
    { slot: 'print_detail', label: 'Any detail worth flagging (optional)', required: false },
  ],
  frame: [
    { slot: 'frame_front', label: 'The framed piece, front-on', required: true },
    { slot: 'frame_raking_light', label: 'Raking light across the glazing', required: true },
    { slot: 'frame_corner_top_left', label: 'Top-left corner', required: true },
    { slot: 'frame_corner_top_right', label: 'Top-right corner', required: true },
    { slot: 'frame_corner_bottom_left', label: 'Bottom-left corner', required: true },
    { slot: 'frame_corner_bottom_right', label: 'Bottom-right corner', required: true },
    { slot: 'frame_back', label: 'The back, showing the hanging fixture', required: true },
    { slot: 'frame_detail', label: 'Any detail worth flagging (optional)', required: false },
  ],
}

/** Every slot in the vocabulary, both stages, in shot-list order. */
export const QC_SHOT_SLOTS = QC_STAGES.flatMap((stage) =>
  QC_SHOT_LIST[stage].map((shot) => shot.slot)
) as readonly string[]

export type QcSlot = string

/**
 * The validator the `text` column cannot be. Every write of a slot value —
 * presign, complete, and the portal's own form — goes through this.
 */
export const qcSlotSchema = z.enum(
  QC_SHOT_SLOTS as unknown as [string, ...string[]]
)

/**
 * What a QC photograph may be, and how big.
 *
 * Here rather than in the API's `lib/storage.ts` — where `REVIEW_MEDIA_LIMITS`
 * lives — because the vendor portal has to refuse the file before it uploads
 * it, and `lib/storage.ts` drags an S3 client in with it. This module is
 * already the one copy of what "photographed" means; the accepted formats are
 * part of that.
 *
 * **A map to the extension, not a list.** The key the object lands under is
 * `production-qc/<jobId>/<slot>/<uuid>.<ext>`, and `complete` rebuilds that key
 * from the same three values minutes later. `getExtensionFromContentType` in
 * the API falls back to `'jpg'` for anything it does not know, which would key
 * a PNG as `.jpg` and make the rebuild disagree with the upload.
 *
 * **No HEIC, deliberately.** It is what a phone shoots by default and what no
 * reviewer's browser displays. Nothing here transcodes — the QC screen is an
 * `<img>` — so accepting it would store a photograph nobody can look at, which
 * is worse than refusing it at the door with a message.
 */
export const QC_PHOTO_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * The size cap, checked at presign and again at complete.
 *
 * Generous next to `REVIEW_MEDIA_LIMITS.image` (10MB): a raking-light shot of a
 * whole print is the evidence a colour dispute turns on, and a vendor phone
 * downscaling it to fit a limit is exactly the wrong saving. Still a cap —
 * `sizeBytes` at presign is the browser's DECLARED size, so this is a cheap
 * early reject, and R2 is told the same content type in the signature.
 */
export const QC_PHOTO_MAX_BYTES = 25 * 1024 * 1024

/** The shot list one job is judged against, chosen by its stage. */
export function qcShotsForStage(stage: QcStage): readonly QcShot[] {
  return QC_SHOT_LIST[stage]
}

/**
 * The slots a submission must fill. `assertShotListComplete` (#676) subtracts
 * the live photos from this and names whatever is left in its 422.
 */
export function requiredQcSlots(stage: QcStage): string[] {
  return QC_SHOT_LIST[stage].filter((shot) => shot.required).map((shot) => shot.slot)
}
