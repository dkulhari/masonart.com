/**
 * The QC shot list contract.
 *
 * This is the one copy of the photo vocabulary. The API stores
 * `production_job_photos.slot` as **text**, not a pgEnum — `schema/shipping.ts`
 * records that a *value* import from the ESM-only `@chobii/shared` inside
 * `schema/` breaks `drizzle-kit generate` outright — so the database will
 * accept any string at all. Nothing below the route layer can reject a typo.
 *
 * That makes these tests the guard rail rather than a formality:
 *
 * 1. **Slot keys are globally unique.** `(job_id, slot)` is the identity of a
 *    live photo. Two shots sharing a key would collide in the partial unique
 *    index and silently supersede each other.
 * 2. **Each corner is its own slot.** The index gives exactly one live photo
 *    per slot, so "all four corners" cannot be one entry — it would be one
 *    photograph claiming to be four.
 * 3. **The stage keys match `production_job_stage`.** A stage the API knows and
 *    this list does not is a job whose shot list is empty, which passes
 *    completeness vacuously.
 */

import { describe, it, expect } from 'vitest'
import {
  QC_SHOT_LIST,
  QC_SHOT_SLOTS,
  QC_STAGES,
  qcShotsForStage,
  qcSlotSchema,
  qcStageSchema,
  requiredQcSlots,
  type QcShot,
} from '../../src/schemas/production-qc'

describe('QC stages', () => {
  it('carries exactly the two production stages, spelled as production_job_stage spells them', () => {
    expect(QC_STAGES).toEqual(['print', 'frame'])
    expect(Object.keys(QC_SHOT_LIST).sort()).toEqual(['frame', 'print'])
  })

  it('rejects a stage that is not one of them', () => {
    expect(qcStageSchema.safeParse('print').success).toBe(true)
    expect(qcStageSchema.safeParse('frame').success).toBe(true)
    expect(qcStageSchema.safeParse('framing').success).toBe(false)
  })
})

describe('QC_SHOT_LIST — print', () => {
  const slots = QC_SHOT_LIST.print.map((shot) => shot.slot)

  it('asks for the whole print, flat and front-on', () => {
    expect(slots).toContain('print_full')
  })

  it('asks for the print beside the colour reference', () => {
    // The only shot that makes a colour complaint answerable: without the
    // reference in frame, "the blue is wrong" is one person's monitor.
    expect(slots).toContain('print_colour_reference')
  })

  it('asks for raking light across the surface', () => {
    // Scuffs, banding and head strikes are invisible under flat light.
    expect(slots).toContain('print_raking_light')
  })

  it('offers a detail shot, and it is the only optional one', () => {
    const optional = QC_SHOT_LIST.print.filter((shot) => !shot.required).map((s) => s.slot)
    expect(optional).toEqual(['print_detail'])
  })
})

describe('QC_SHOT_LIST — frame', () => {
  const slots = QC_SHOT_LIST.frame.map((shot) => shot.slot)

  it('asks for the framed piece front-on and raking light across the glazing', () => {
    expect(slots).toContain('frame_front')
    expect(slots).toContain('frame_raking_light')
  })

  it('asks for all four corners as four separate slots', () => {
    // One slot holds one live photo, so a single "corners" entry would be one
    // photograph asserting four joins are clean.
    expect(slots).toContain('frame_corner_top_left')
    expect(slots).toContain('frame_corner_top_right')
    expect(slots).toContain('frame_corner_bottom_left')
    expect(slots).toContain('frame_corner_bottom_right')
  })

  it('asks for the back, showing the hanging fixture', () => {
    // The one thing the customer discovers at the wall, not at the unboxing.
    expect(slots).toContain('frame_back')
  })

  it('offers a detail shot, and it is the only optional one', () => {
    const optional = QC_SHOT_LIST.frame.filter((shot) => !shot.required).map((s) => s.slot)
    expect(optional).toEqual(['frame_detail'])
  })
})

describe('shot list shape', () => {
  const everyShot: QcShot[] = QC_STAGES.flatMap((stage) => [...QC_SHOT_LIST[stage]])

  it('gives every shot a slot key, a human label and an explicit required flag', () => {
    for (const shot of everyShot) {
      expect(shot.slot).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(shot.label.length).toBeGreaterThan(0)
      expect(typeof shot.required).toBe('boolean')
    }
  })

  it('keeps slot keys globally unique, so (job_id, slot) is an identity', () => {
    const slots = everyShot.map((shot) => shot.slot)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('publishes every slot in QC_SHOT_SLOTS', () => {
    expect([...QC_SHOT_SLOTS].sort()).toEqual(everyShot.map((s) => s.slot).sort())
  })

  it('validates a slot value against the vocabulary the text column cannot check', () => {
    expect(qcSlotSchema.safeParse('frame_back').success).toBe(true)
    expect(qcSlotSchema.safeParse('frame_bak').success).toBe(false)
    expect(qcSlotSchema.safeParse('').success).toBe(false)
  })

  it('produces slot keys that survive an object key segment unchanged', () => {
    // Slots are a path segment in `production-qc/<jobId>/<slot>/<filename>`.
    // sanitizeKeySegment collapses anything outside [a-zA-Z0-9.-] to `_`; an
    // underscore is already safe, but a slash or a space would rewrite the key
    // and break the round trip from key back to slot.
    for (const slot of QC_SHOT_SLOTS) {
      expect(slot).not.toMatch(/[^a-z0-9_]/)
    }
  })
})

describe('lookups', () => {
  it('returns the shots for one stage and nothing from the other', () => {
    expect(qcShotsForStage('print')).toEqual(QC_SHOT_LIST.print)
    expect(qcShotsForStage('frame').every((s) => s.slot.startsWith('frame_'))).toBe(true)
  })

  it('lists the required slots for a stage, which is what completeness is measured against', () => {
    expect(requiredQcSlots('print')).toEqual([
      'print_full',
      'print_colour_reference',
      'print_raking_light',
    ])
    expect(requiredQcSlots('frame')).not.toContain('frame_detail')
    expect(requiredQcSlots('frame').length).toBe(QC_SHOT_LIST.frame.length - 1)
  })

  it('requires at least one shot per stage, so completeness is never vacuous', () => {
    for (const stage of QC_STAGES) {
      expect(requiredQcSlots(stage).length).toBeGreaterThan(0)
    }
  })
})
