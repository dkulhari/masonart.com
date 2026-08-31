/**
 * Audit log contracts.
 *
 * The audit table is deliberately generic — one append-only row shape for every
 * admin and vendor action, with `before`/`after` as jsonb. That is what makes it
 * impossible to forget: a route added next month is captured by middleware
 * without its author doing anything. The cost is that the database cannot check
 * the shape of anything, so the guard rails live here instead.
 *
 * `AUDIT_ACTIONS` is that guard rail. It is a closed tuple, so an action name
 * that is not in it fails typecheck at the call site — the alternative is two
 * spellings of the same action and a filter that silently misses half the
 * history.
 *
 * Every filter arrives as a string: router.tsx overrides TanStack's search
 * serialisation, so `?limit=25&category=money,privilege` reaches the route as
 * text. `auditLogQuerySchema` coerces and splits accordingly.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.2
 */

import { z } from 'zod'

/**
 * What a row can be filed under. `money` and `privilege` are the launch gate:
 * history cannot be backfilled, so an unrecorded refund or promotion is
 * unanswerable forever.
 *
 * `fulfilment` is the production-pipeline tier — a job moving through print, QC
 * and despatch. Spelled the British way, matching the `audit_category` value;
 * `fulfillment` here would refuse every row the database accepts. What we OWE a
 * supplier stays `money` even when the row is about a production job: the split
 * is by what the row is about, not by table.
 */
export const auditCategorySchema = z.enum([
  'money',
  'privilege',
  'catalogue',
  'config',
  'content',
  'fulfilment',
])

/**
 * A refused action is evidence too — a rejected privilege change is exactly
 * what an investigation wants to see. Refusals are recorded, not dropped.
 */
export const auditOutcomeSchema = z.enum(['success', 'failure'])

/**
 * Every auditable action, `entity.verb_past_tense`.
 *
 * `admin.request` is the middleware floor: it lands when a mutating admin or
 * vendor request completes without a handler having written a precise row. It
 * is coarse on purpose — its job is that nothing escapes, not that everything
 * is legible.
 *
 * **An action is declared in the same phase as its emitter, or not at all.**
 * That is enforced, not advisory: `packages/api/tests/lib/audit-action-coverage.test.ts`
 * (#671) scans every file under `packages/api/src` for each name in this tuple
 * and fails on the ones nothing writes, naming them. Adding an action here for
 * a later phase to fill in breaks that test the moment it is committed.
 *
 * The way out is to wire the emitter. The other way out — for an action naming
 * something the API genuinely cannot do yet — is a reasoned entry in
 * `DEAD_AUDIT_ACTION_WAIVERS` in `packages/api/tests/lib/audit-action-waivers.ts`,
 * which currently holds exactly two: `wallet.adjusted` and `user.status_changed`,
 * both write routes that do not exist. A waiver without a one-line reason is
 * rejected, and so is one for an action that has since been wired.
 *
 * The guard proves each action is *written* somewhere, not that the write is
 * reachable — a string literal on a dead branch still counts. The production
 * actions below were the one deliberate declare-ahead window, declared by #679
 * and emitted by #680/#681/#684 before the guard existed; nothing but a note in
 * a prompt held that window open, which is why it is a test now.
 */
export const AUDIT_ACTIONS = [
  // Floor
  'admin.request',
  'vendor.request',

  // Money — returns
  'return.status_changed',
  'return.approved',
  'return.rejected',
  'return.refund_processed',
  'return.store_credit_issued',

  // Money — orders
  'order.status_changed',
  'order.cancelled',
  'order.refunded',
  'order.shipment_marked_delivered',

  // Money — tender and balances
  'gift_card.issued',
  'gift_card.disabled',
  'gift_card.enabled',
  'gift_card.adjusted',
  'wallet.adjusted',
  'vendor.payable_settled',

  // Money — what we owe a supplier. These live on production tables but they
  // commit or change a payable, so they file under money, not fulfilment.
  'production_job.assigned',
  'production_job.reassigned',
  'production_job.amount_overridden',
  'production_transfer.declared_lost',

  // Privilege
  'user.role_changed',
  'user.status_changed',
  'vendor.invited',
  'vendor.user_created',

  // Catalogue
  'product.created',
  'product.updated',
  'product.deleted',
  'product_variant.updated',
  'product_variant.deleted',
  'frame.created',
  'frame.updated',
  'frame.archived',
  'promotion.created',
  'promotion.enabled',
  'promotion.disabled',
  'promotion.deleted',
  'collection.updated',
  'collection.deleted',

  // Config
  'shipping_option.deleted',
  'shipping_config.updated',
  'wallet_config.updated',
  'vendor_rate.updated',
  /**
   * The supplier directory. `config`, not `money` — the rate card is what we
   * PAY and it has its own action above; this pair is the record of who we buy
   * from at all, and a vendor's `status` is what stops work being routed to
   * them.
   *
   * There is deliberately NO `vendor.archived`. `vendor_status` is
   * `active | inactive | suspended` (database/schema/vendors.ts) — nothing
   * archives, and an action naming a state the column cannot hold would be
   * dead the day it was declared. Suspending a supplier IS an update, and the
   * delta is what says which way it went.
   */
  'vendor.created',
  'vendor.updated',

  // Content
  'review.deleted',
  'review_media.deleted',
  'ai_generation.moderated',

  // Fulfilment — a job or a transfer moving through print, QC and despatch.
  // There is deliberately no `production_job.cancelled`: a cancellation is a
  // transition, and splitting it out would put two rows on one state move and
  // break the "one row per transition" property the timeline is read through.
  // Its money consequence, when there is one, is `production_job.amount_overridden`.
  'production_job.created',
  'production_job.transitioned',
  'production_job.transition_refused',
  'production_job.photos_submitted',
  'production_job.qc_approved',
  'production_job.qc_rejected',
  'production_job.label_issued',
  'production_transfer.dispatched',
  'production_transfer.received',
  'order.consolidator_set',

  // Fulfilment — the courier leg (order-dispatch-tracking). A parcel changing
  // hands is not a money event; what we PAID a carrier is, and that action
  // arrives in the Shiprocket pass alongside the code that writes the cost.
  // `shipment.label_issued` and `shipment.voided` belong to that pass too, and
  // are deliberately NOT declared here ahead of their emitters.
  'shipment.created',
  'shipment.tracking_updated',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]
export type AuditCategory = z.infer<typeof auditCategorySchema>
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>

export const auditActionSchema = z.enum(AUDIT_ACTIONS)

/**
 * The category is derived from the action, not passed alongside it. Two callers
 * filing the same action under different categories would make every
 * category filter a lie.
 */
export const AUDIT_ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  'admin.request': 'config',
  'vendor.request': 'config',

  'return.status_changed': 'money',
  'return.approved': 'money',
  'return.rejected': 'money',
  'return.refund_processed': 'money',
  'return.store_credit_issued': 'money',

  'order.status_changed': 'money',
  'order.cancelled': 'money',
  'order.refunded': 'money',
  'order.shipment_marked_delivered': 'money',

  'gift_card.issued': 'money',
  'gift_card.disabled': 'money',
  'gift_card.enabled': 'money',
  'gift_card.adjusted': 'money',
  'wallet.adjusted': 'money',
  'vendor.payable_settled': 'money',

  'production_job.assigned': 'money',
  'production_job.reassigned': 'money',
  'production_job.amount_overridden': 'money',
  'production_transfer.declared_lost': 'money',

  'user.role_changed': 'privilege',
  'user.status_changed': 'privilege',
  'vendor.invited': 'privilege',
  'vendor.user_created': 'privilege',

  'product.created': 'catalogue',
  'product.updated': 'catalogue',
  'product.deleted': 'catalogue',
  'product_variant.updated': 'catalogue',
  'product_variant.deleted': 'catalogue',
  'frame.created': 'catalogue',
  'frame.updated': 'catalogue',
  'frame.archived': 'catalogue',
  'promotion.created': 'catalogue',
  'promotion.enabled': 'catalogue',
  'promotion.disabled': 'catalogue',
  'promotion.deleted': 'catalogue',
  'collection.updated': 'catalogue',
  'collection.deleted': 'catalogue',

  'shipping_option.deleted': 'config',
  'shipping_config.updated': 'config',
  'wallet_config.updated': 'config',
  'vendor_rate.updated': 'config',
  'vendor.created': 'config',
  'vendor.updated': 'config',

  'review.deleted': 'content',
  'review_media.deleted': 'content',
  'ai_generation.moderated': 'content',

  'production_job.created': 'fulfilment',
  'production_job.transitioned': 'fulfilment',
  'production_job.transition_refused': 'fulfilment',
  'production_job.photos_submitted': 'fulfilment',
  'production_job.qc_approved': 'fulfilment',
  'production_job.qc_rejected': 'fulfilment',
  'production_job.label_issued': 'fulfilment',
  'production_transfer.dispatched': 'fulfilment',
  'production_transfer.received': 'fulfilment',
  'order.consolidator_set': 'fulfilment',
  'shipment.created': 'fulfilment',
  'shipment.tracking_updated': 'fulfilment',
}

/** A filterless page must not be able to dump the whole table. */
export const AUDIT_LOG_PAGE_SIZE = 50
export const AUDIT_LOG_MAX_PAGE_SIZE = 200

/**
 * Accepts either a real array or the comma-joined string the router produces,
 * so the same schema validates an API query string and a route's search params.
 */
const commaSeparated = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(item)
  )

export const auditLogQuerySchema = z.object({
  /** Actor user id. Filtering by email means filtering the snapshot, via `q`. */
  actor: z.string().min(1).optional(),
  action: commaSeparated(auditActionSchema).optional(),
  category: commaSeparated(auditCategorySchema).optional(),
  outcome: auditOutcomeSchema.optional(),
  entityType: z.string().min(1).max(64).optional(),
  entityId: z.string().min(1).max(128).optional(),
  requestId: z.string().min(1).max(128).optional(),
  /** Free text over the summary and the actor email snapshot. */
  q: z.string().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AUDIT_LOG_MAX_PAGE_SIZE)
    .default(AUDIT_LOG_PAGE_SIZE),
  /** Opaque keyset cursor: the createdAt/id pair of the last row seen. */
  cursor: z.string().min(1).max(200).optional(),
})

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  /**
   * Null once the referenced user is deleted. `actorEmail` and `actorRole` are
   * snapshots taken at write time and outlive the account deliberately — a
   * deleted or demoted admin must not be able to erase or rewrite who they
   * were when they acted.
   */
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: auditActionSchema,
  category: auditCategorySchema,
  outcome: auditOutcomeSchema,
  summary: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
})

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>

export const auditLogPageSchema = z.object({
  entries: z.array(auditLogEntrySchema),
  /** Absent when this is the last page. */
  nextCursor: z.string().nullable(),
})

export type AuditLogPage = z.infer<typeof auditLogPageSchema>
