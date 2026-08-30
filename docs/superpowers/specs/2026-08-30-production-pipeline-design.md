# Production pipeline

**Date:** 2026-08-30
**Status:** design approved, pending implementation plan
**Feature:** `production-pipeline`
**Related:** [Vendor management](../../../plan/tracker-data/features/vendor-management.yaml) — sub-project 1, which built the records this workflow runs over. [Logging and auditing](../../plans/2026-08-17-logging-and-auditing.md) — §the audit contract this feature extends.

---

## 1. Problem

An order goes out to a third-party print shop, is framed, and ships. `vendor-management`
built the *records* for that: vendors, capabilities, effective-dated rate cards, a
row-scoped vendor portal, `production_jobs`, `production_job_reviews`, derived payables.

It deliberately stopped short of the *workflow*, and said so in the schema
(`packages/api/src/database/schema/production-jobs.ts:1-12`):

> the status enum here is a vocabulary, not a state machine, and deliberately carries
> no transition guards … production-pipeline defines the WORKFLOW over it

The consequences are live today:

- `PATCH /api/admin/production/:jobId` accepts any of the seven statuses from any
  state. The design comment at `routes/admin/production-jobs.ts:523-525` says this is
  deliberate and names this feature as the thing that fixes it.
- `POST /:jobId/assign` never reads `job.status`, so a **cancelled or already-passed
  job can be assigned**. Its `db.update` is not in a transaction.
- `POST /:jobId/reviews` records a QC verdict and does not move the job, so the queue
  can show `received` for a job that failed inspection an hour ago.
- The vendor portal writes `sent`/`received` through `lib/vendor-scope.ts` with no
  guard at all.
- Nothing anywhere **creates** a job from an order. `OrderProductionPanel.tsx` only
  reports which order items have none.
- `vendor_capabilities.stated_turnaround_days` is stored, displayed, and feeds no
  calculation. `production_jobs.due_at` is only ever copied from a request body.

Above all of it, `orders.status` still collapses the entire production phase into one
value — `processing`, commented *"Order being prepared/printed"*.

### The fulfilment model changed while this was being designed

**Vendors now own the piece from production through despatch. The courier collects
from the vendor's facility. Goods never come back to us.**

That is not a detail; it invalidates three things written into shipped code.

| Was | Now |
|---|---|
| `lib/vendor-scope.ts:15` — *"Second rule, equally absolute: no return value here contains customer data"*, justified by *"dispatch is in-house: the piece comes back to us before it ships"*, and enforced as a blanket property by `packages/api/tests/routes/vendor/isolation.test.ts` and `packages/web/tests/routes/vendor/no-customer-data.test.tsx` | A carrier's shipping label carries the customer's name, address and phone. The absolute is dead and needs a replacement that is **just as mechanically checkable** — see §6. |
| `order-dispatch-tracking` — *"dispatch is MANUAL at launch … No Shiprocket API, no token refresh, no webhooks"* | Vendors printing labels requires the label API. Sub-project 3 is promoted from manual to API-integrated. |
| QC means inspecting the piece when it arrives back at our desk | There is no "back". QC is remote, on photographs, at the vendor — and it happens **before** despatch, not after. |

## 2. What already exists to build on

Reuse is the default; every item here is used rather than reinvented.

| Thing | Where | Used for |
|---|---|---|
| `production_jobs`, `production_job_items`, `production_job_reviews` | `packages/api/src/database/schema/production-jobs.ts` | The job record, the item join that lets a mixed basket split across vendors, and the append-only verdict history |
| Derived payables — `SUM(COALESCE(amount_actual, amount_expected)) WHERE settlement_id IS NULL` | `lib/vendor-payables.ts`, `lib/vendor-scope.ts` | Money. There is no balance column and none is added |
| `FOR UPDATE` + repeated predicate in the UPDATE + rollback on row-count mismatch | `routes/admin/vendor-payables.ts:242-317` | The concurrency pattern this feature copies verbatim |
| Row-scoped data access with `vendorId` as a required first argument | `lib/vendor-scope.ts` | Vendor isolation. `routes/vendor.ts` has zero database imports and keeps it that way |
| Signed, expiring, job-scoped URLs with a fail-closed prefix allow-list | `lib/vendor-scope.ts:190-260` | Artwork today; generalised to three disjoint scopes here |
| presign → complete direct-to-R2 upload, re-validated on complete | `routes/review-media.ts`, `lib/storage.ts` | QC photo upload. Bytes never route through Hono |
| `recordAudit(c, entry, tx?)`, category derived not passed, never throws, claims the request before inserting | `lib/audit.ts:215-276` | Every audited fact here |
| The audit floor over `/api/admin/*` and `/api/vendor/*` | `middleware/audit.ts` | The backstop that catches anything a handler forgets |
| Append-only enforcement by trigger, `SET LOCAL chobii.audit_purge` for the retention job only | `migrations/0021_admin_audit_log.sql:59-77` | Why the audit trail is evidence rather than a log |
| Partial unique index precedent | `schema/gift-cards.ts:154-158`, migrated by `0018` | Live-slot uniqueness on QC photos |
| Inline two-step confirm (never `window.confirm`, which blocks the automation harness) | `ReviewMediaStrip`, and every vendor screen | All new destructive controls |

**Deliberately not reused: `photo-approval-workflow`** (`schema/approvals.ts`,
`services/approval.ts`, 21 tickets, complete). That is the *customer* approving
production photos: different actor, token-gated, deadline-driven, email-reminded — and
`approval_photos.url` stores a URL rather than an object key, which violates R3 in §6
outright. Stated here so a third photo system does not get built by someone who finds
neither. Feeding a QC-approved shot into a customer approval is a plausible future, not
this feature.

## 3. Decisions taken

1. **Hold and combine, at the last vendor.** A mixed basket (rolled poster at print
   vendor A, framed piece at frame vendor B) is couriered A→B; B packs both and one
   label is issued. One box, one tracking number, one delivery estimate. Rejected:
   each vendor ships its own parcel — that needs multi-shipment orders, two AWBs,
   partial-delivery mail and split returns, and roughly doubles sub-project 3.

2. **No batch entity.** The queue multi-selects and assigns many jobs to one vendor in
   one action; each job stays independent with its own status, dates and payable.
   Rejected: a `production_batches` table. Revisit only when a vendor invoices per
   batch rather than per job.

3. **`orders.status` is untouched.** Not one value is added. Production state lives on
   `production_jobs` and is derived upward. Rejected: extending the enum — every
   switch, status filter, mail template and the public tracking page would have to
   handle new values or silently break, and there are already five-plus divergent
   copies of that enum across `shared/` and `web/`.

4. **Photo QC gates the label.** The vendor uploads a fixed shot list; an admin
   approves remotely; only then does the label unlock. Rejected: vendor
   self-certification — you learn about defects from the customer and hold no evidence
   in a vendor dispute, which is the opposite of the point.

5. **Our server calls Shiprocket.** We create the shipment and AWB and hand the vendor
   a signed, expiring label PDF. We keep the AWB, the pickup location, the rate and the
   tracking. Rejected: the vendor using their own Shiprocket login and pasting an AWB
   back — it surrenders pickup control and rate control, makes the AWB depend on
   someone typing correctly, and hands our shipping-cost data to a supplier.

6. **Scope split at one function.** This feature owns the state machine, the QC gate,
   the audit trail and `isOrderReadyToLabel`. `order-dispatch-tracking` owns the label,
   the AWB and pickup. Rejected: one feature covering production through despatch —
   nothing to coordinate, but too large to ship incrementally or review.

7. **`dispatched` is one status, not two.** Parcel-to-next-vendor and
   parcel-to-courier are the same fact *about the job*: custody ended, payable owed.
   The destination already lives on `production_transfers.to_vendor_id` or on
   `order_shipments`. Two values would encode one job fact twice, distinguished only by
   a foreign row. And `shipped` on a job is a category error — the order ships; a job
   never does.

8. **Rework happens in place**, `qc_failed → received`. Because QC now catches the
   defect *before* the goods leave the vendor, there is no second freight leg and no
   second counterparty in the ordinary case. The trade-off is real and stated: one job
   holds one `amount_expected` and one `amount_actual`, so a *chargeable* rework is
   expressed by overriding `amount_actual`, not by a second row. Rework that must go
   elsewhere is `qc_failed → assigned`, which re-prices against the new vendor.

9. **`sent` is retired in code, kept in the Postgres type.** It is removed from the
   transition matrix, from `VENDOR_SETTABLE_STATUSES` and from `VENDOR_JOB_STATUSES`,
   with a test asserting no path can produce it. Rejected: dropping the value — that
   requires recreating the type and rewriting every dependent column, which is
   disproportionate to deleting a word.

10. **No CHECK constraints, and no new trigger.** Zero CHECKs exist anywhere in this
    repo today, and `tests/database/raw-sql-objects.test.ts` scans only for
    `FUNCTION|TRIGGER|POLICY` — so a CHECK would be silently absent from every
    `db:push`-built database and invisible to the #663 guard. A trigger cannot express
    the interesting half anyway: the stage and consolidation rules read *other* rows,
    and a trigger doing that under `READ COMMITTED` is a race dressed as enforcement.
    The one database object that genuinely serialises concurrent writers — a unique
    index — is used where it is needed.

11. **The inter-vendor transfer is its own entity.** Not expressible as "A's job
    dispatched, B's job received", for four reasons, the first of which is fatal: in
    the consolidation case the rolled poster has `frame_id NULL`, so **vendor B has no
    job for it at all**. Also: one parcel carries several jobs; there is freight money
    with nowhere to sit; and "lost" is a *gap* in the record with no docket to chase.

12. **We pay the transfer leg**, and it is deliberately **not** a payable. We chose the
    routing, so a vendor cannot be asked to price a distance we decided, and asking A
    to absorb it is how rate cards get padded. `cost_amount` never enters `sumPayable`,
    so `amount_expected` versus `amount_actual` keeps meaning "negotiation on the work".

13. **A new `fulfilment` audit category.** Rejected: filing production traffic under
    `config`. Roughly five rows per job would drown the request floor, shipping config
    and wallet config in a filter that is a primary navigation control in the viewer.
    `ALTER TYPE … ADD VALUE` is DDL, touches no rows, and does not involve the
    immutability trigger.

14. **`recordAudit` reads `vendorId` itself**, rather than every call site passing it.
    The module's entire design is that a caller cannot get a context fact wrong —
    category is derived, and ip, user-agent, request id, method and path are captured.
    `requireVendor` already sets `c.set("vendorId")` and nothing has ever read it.
    Doing this per call site means the first vendor route added next year forgets.

15. **Refusal audit rows never share the business transaction.** This is the sharpest
    trap in the design and the instinct is wrong. A refusal row records that a
    transaction was **rolled back**; writing it inside that transaction erases the very
    evidence it exists to preserve.

## 4. The state machine

Reused unchanged: `draft`, `assigned`, `qc_passed`, `qc_failed`, `cancelled`.

Re-meant: **`received`** — was "the vendor received the physical piece from us"; now
"**the vendor has everything needed to start**". For a print job that is the artwork;
for a frame job it is the printed sheet that arrived by transfer. Same actor, same
moment in the vendor's day. Only the label changes.

Added, each justified because an enum value costs a migration:

- **`qc_submitted`** — work finished, shot list uploaded, **blocked on us**. It is the
  only state meaning the ball is in our court, it is the entire content of the admin QC
  queue, and it is the precondition the label gate reads.
- **`dispatched`** — this vendor's custody has ended. See decision 7.

### The matrix

`sent` has zero in-edges and zero out-edges. `dispatched` and `cancelled` are terminal.

| From | To | Actor | Guard |
|---|---|---|---|
| — | `draft` | admin, system | job + items created in one transaction |
| `draft` | `assigned` | admin | priced from the rate card live at that instant |
| `draft` | `cancelled` | admin | — |
| `assigned` | `assigned` | admin | reassignment before work starts; **re-prices** |
| `assigned` | `received` | **vendor** | — |
| `assigned` | `cancelled` | admin | — |
| `received` | `qc_submitted` | **vendor** | every `required` shot-list slot has a live photo |
| `received` | `cancelled` | admin | — |
| `qc_submitted` | `qc_passed` | admin | **only** via `POST /:jobId/reviews`, verdict `pass` |
| `qc_submitted` | `qc_failed` | admin | only via reviews, verdict `fail`, **≥1 defect required** |
| `qc_submitted` | `cancelled` | admin | — |
| `qc_failed` | `received` | **vendor** | rework in place |
| `qc_failed` | `assigned` | admin | reassign the rework elsewhere; re-prices |
| `qc_failed` | `cancelled` | admin | — |
| `qc_passed` | `qc_failed` | admin | a second review may still fail it before despatch |
| `qc_passed` | `dispatched` | **vendor**, admin | on an open transfer, **or** the order has a label |
| `qc_passed` | `cancelled` | admin | — |
| `dispatched` | — | — | terminal. A lost transfer creates a **new** job; it never resurrects this one |
| `cancelled` | — | — | terminal |

`VENDOR_SETTABLE_STATUSES` becomes `['received', 'qc_submitted', 'dispatched']`.

`qc_passed` and `qc_failed` are removed from `PATCH /:jobId`'s accepted targets
entirely: **a verdict with no review row is a verdict with no evidence.**

A self-edge is a 200 no-op and writes **no** audit row — one row per *transition*.

### Where it lives

`packages/api/src/lib/production-transitions.ts`, as a pure
`assertTransition(from, to, actor)` over a total `Record`, plus `nextStatuses(from,
actor)` so the admin and vendor UIs render actions **from the matrix** rather than
from a hardcoded list that can drift. A code chokepoint, per decision 10.

Illegal transitions are **409**, not 422. In this router 422 already means "your
payload names things that do not line up" (`missingOrderItemIds`, `unpriced`) — fixable
by editing the body. A transition conflict is not. The body carries `{ error, code,
from, to, allowed }` so the UI renders the remedy without a second round trip, and
every refusal lands an audit row with `outcome: 'failure'`.

### Concurrency

Copy `routes/admin/vendor-payables.ts:242-317` exactly: `FOR UPDATE` on the read, the
predicate **repeated** in the UPDATE's WHERE (`eq(status, from)`, `isNull(settlementId)`),
and a row-count mismatch that throws and rolls back rather than returning.

- Two admins on one job serialise; the second reads the new `from` and the matrix
  refuses whatever no longer applies.
- A vendor marking `received` while an admin cancels: `cancelled` is terminal with zero
  out-edges, so cancellation always wins. The vendor is told **"this job was
  cancelled"** — a deliberate exception to the portal's 404-not-403 rule, because they
  already know the job exists (it is theirs, it is in their queue), so nothing leaks,
  and withholding it means they keep working on something nobody will pay for.
- Reassignment carries a compare-and-swap `expectedVendorId` and answers a mismatch
  with 409 plus the *actual* current state, so the losing screen can say who took it
  rather than "version mismatch".
- A settled job (`settlement_id IS NOT NULL`) refuses every transition and every amount
  edit. Today `PATCH /:jobId` will happily change `amountActual` on a settled job, and
  because payables are derived with no stored total, the settlement's `amount` would
  then disagree with the sum of its jobs **silently**.

## 5. Transfers and consolidation

### `production_transfers`

`order_id`, `from_vendor_id`, `to_vendor_id`, `carrier`, `reference` (the A→B docket),
`piece_count`, `cost_amount` decimal(10,2) INR, `dispatched_at`, `expected_by`,
`received_at`, `lost_at`, `lost_note`, `created_by`, timestamps — plus a
`production_transfer_jobs` join with a unique index putting a job on **at most one
transfer, ever**.

**No transfer status enum.** State derives from the three timestamps by a pure
function, mirroring `production_jobs`' own date-driven shape. Given this repo's enum
hazard (below), a fourth transfer state later costs a nullable timestamp rather than a
migration.

**What vendor B is told**: `{ id, reference, carrier, pieceCount, dispatchedAt,
expectedBy, receivedAt }`. No vendor names, no order id, no customer anything. B does
not learn the parcel came from A — surfacing another vendor's row through
`vendor-scope.ts` would break the isolation suite's first property, which is a hard,
already-tested boundary. If B needs to chase, an admin chases; the admin sees both ends.

**Lost in transit**: admin only, because it costs money and a vendor declaring it is a
vendor deciding who eats a cost. `POST /api/admin/transfers/:id/lost` sets `lost_at`
and creates a **replacement `draft` job** per lost job, linked by a new
`replaces_job_id` column (without which two print jobs for one order item look like a
duplicate-entry mistake). The original **stays `dispatched` with its payable intact** —
we owe A for work they genuinely did; the parcel is what vanished. Moving it to
`qc_failed` would slander their QC record and pollute the defect history that future
scorecards read. A transfer with `received_at` set cannot later be declared lost (409).

### `order_consolidation`

`order_id` PK, `vendor_id`, `decided_by`, `decided_at`. A tiny table rather than a
column on `orders`, so a supplier foreign key stays off the customer table and out of
every wholesale `select()` of orders. The primary key enforces exactly one consolidator
per order; absence is meaningful.

The system **proposes**, an admin **confirms**, and `decided_by = NULL` records "system
default":

1. One vendor holds every job on the order → that vendor, written automatically at
   first assignment. The overwhelming majority; no admin action.
2. A frame job exists → propose its vendor. A finished framed piece is bulky, fragile
   and glazed; you never courier it *to* a poster shop.
3. All rolled posters across two print vendors → propose the vendor holding the most
   order items, ties broken by earliest `assigned_at`. Only a proposal, because the
   real criterion (who is nearest the customer, which leg is cheapest) is not modelled
   — making it a *confirmed* proposal keeps an arbitrary choice visible and auditable
   instead of silently arbitrary.

Overridable until the first transfer on the order dispatches; after that, 409 — the
goods are already moving.

### The seam: `isOrderReadyToLabel`

`packages/api/src/lib/production-readiness.ts`:

```ts
export async function getOrderLabelReadiness(orderId, reader?):
  Promise<{ ready: boolean; consolidatorVendorId: string | null; blockers: LabelBlocker[] }>

export async function isOrderReadyToLabel(orderId, reader?): Promise<boolean>
```

The boolean is `blockers.length === 0` — **one implementation, so the gate and the
screen cannot disagree**. Two functions because a "not ready" with no reason is the
class of bug `OrderProductionPanel.tsx` already guards against: a confident answer over
an incomplete read.

With `J` = the order's non-cancelled jobs, ready **iff**: `J` is non-empty; every order
item requiring production is covered by some job in `J`; a consolidator `C` is set;
every job in `J` is `qc_passed` or `dispatched`; every `qc_passed` job is at `C`; and
every `dispatched` job rode a transfer to `C` that is received and not lost.

A property falls out for free: **once the consolidator's own jobs go `dispatched`, the
predicate goes false again** — a `dispatched` job with no inbound transfer to `C` is a
blocker. That structurally prevents a second label.

`reader` is optional so `order-dispatch-tracking` can evaluate it *inside* the
transaction that creates the shipment, having taken `FOR UPDATE` on the order's job
rows. Called without one it uses `db`, which is right for the read-only admin screen.

**Single consumer, mechanically enforced.** A source scan over `packages/api/src` fails
on any caller of `isOrderReadyToLabel(` outside an allow-list, and a reverse scan
asserts no file under `lib/production-*` imports anything named `shiprocket`. Same
manifest-plus-scan shape as `raw-sql-objects.ts`. The seam is one function, one way.

## 6. The customer-data rule that replaces the dead absolute

The old rule (`lib/vendor-scope.ts:14-20`) was assertable *only* because dispatch was
in-house. Its replacement is three clauses, each mechanically checkable:

> **R1 — The JSON stays clean, absolutely.** No JSON body on any `/api/vendor/*` route
> contains a customer name, address, phone, email, or person-linked order reference, at
> any depth, in any casing. **No exception, ever.** The existing forbidden-key
> vocabulary, the recursive body walker, the wholesale-`select()` ban and the
> SELECT-projection assertion are unchanged and now cover every new route.
>
> **R2 — Customer data reaches a vendor only as opaque rendered bytes, behind a
> short-lived signature.** Only as a rendered document fetched from a signed, expiring
> URL, and only by handing that file to the operating system. Never as fields, never
> composed by our API, never rendered into the vendor portal's own DOM. Exactly one
> such document exists: the carrier's label PDF.
>
> **R3 — The allow-list is the enforcement, and the scopes are disjoint.** Every
> vendor-facing signature is produced through one named scope, and a route may sign
> only within its own.

`VENDOR_ARTWORK_PREFIXES` generalises, keeping its fail-closed logic:

```ts
export const VENDOR_SIGNING_SCOPES = {
  artwork: ['products/'],            // catalogue print files (unchanged)
  qcPhoto: ['production-qc/'],       // photos the vendor uploaded themselves
  label:   ['fulfilment/labels/'],   // the carrier PDF — the ONLY PII carrier
} as const
```

**The label key is identity-free by construction.** Not
`fulfilment/labels/<orderId>/…` — an order id in a URL path is a stable person-linked
handle, exactly the sin the existing suite punishes elsewhere, and it lives where no
assertion about JSON *keys* can see it. Instead a dedicated random token, following the
`production_approvals.approval_token` precedent: `fulfilment/labels/<token>.pdf`.

`getVendorJobLabelKey(vendorId, jobId)` puts all three conditions in the WHERE — the
job is this vendor's, the order's consolidator is this vendor, a label token exists —
so a non-consolidator gets `null` → 404 **and the presigner is never called**. A signed
URL that is generated and then withheld has still been generated.

`GET /api/vendor/jobs/:id/label` returns `{ jobId, url, expiresInSeconds, expiresAt }`
— the same shape as artwork, TTL 300s, so the existing "expires in minutes, not days"
property extends unchanged.

Vendors need **no** pickup address (the courier collects from their own facility, which
is already in `vendors.address_*` — theirs, not a customer's) and **no** delivery
pincode (we choose the courier). Stated explicitly so nobody adds one.

**Net: the only customer data a vendor ever touches is what the carrier prints on the
label, and they never see it as data.**

### What the five affected tests become

- `isolation.test.ts` — the header justification is replaced by R1/R2/R3. Property 1
  (route-table coverage) is unchanged, so every new route needs a `ROUTE_TABLE` entry
  or the suite fails, which is the point. Property 2 is unchanged in mechanism and
  retitled *"no customer data crosses the vendor boundary as data"*. Property 3
  generalises from "artwork URLs" to all signatures and asserts the scopes **pairwise
  disjoint and non-substitutable** — the artwork route must refuse a
  `fulfilment/labels/…` key and the label route must refuse a `products/…` key. That is
  what stops the label hole widening into a general signer. New Property 4: every
  presign call matches exactly one scope; the label route's JSON passes the walker
  clean; a planted customer name in shipment metadata appears in no JSON; a
  non-consolidator gets 404 with the presigner never called.
- `no-customer-data.test.tsx` — `POLLUTION` and `expectNoCustomerData` stay verbatim,
  extended over the new screens. The one-line mechanical replacement for the dead
  absolute: assert **no `iframe`, `embed` or `object` in the container** and **no
  `X-Amz-Signature` in `innerHTML`**. Rendering the PDF inline would put the customer's
  address into the vendor portal's own DOM, which is exactly what R2 forbids.
- `jobs.test.ts` — `:151-159` filters on `status: 'sent'` (retired) and `:206-228`
  asserts `receivedAt` is written **from the request body** (removed — see §8).
- `vendor-screens.test.tsx` — `:266-309` drives `vendor-job-mark-sent`, a control that
  no longer exists.
- `artwork.test.ts` — extended to the scope-disjointness property.

## 7. Photo QC

Minimum viable and human. The AI stays in `production-qc-inspection`.

`production_job_photos`: `job_id`, `slot`, `object_key` (never a URL), `content_type`,
`size_bytes`, `uploaded_by`, `uploaded_at`, `superseded_at`, `review_id`. A partial
unique index on `(job_id, slot) WHERE superseded_at IS NULL` gives exactly one live
photo per slot with full history — the same append-only philosophy as
`production_job_reviews`, and the index predicate uses no enum literal, so it is safe
under the migration rule in §9.

`slot` is **`text`, not a `pgEnum`**, for a hard reason: `schema/shipping.ts` records
that a *value* import from the ESM-only `@chobii/shared` inside `schema/` breaks
`drizzle-kit generate` outright. A text column keeps the vocabulary in shared, where
the portal and the API read one copy.

`QC_SHOT_LIST` in `packages/shared/src/schemas/production-qc.ts`:

- **print** — whole print flat and front-on; print beside the colour reference; raking
  light across the surface; optional detail shot.
- **frame** — framed piece front-on; raking light across the glazing; all four corners;
  the back showing the hanging fixture; optional detail shot.

Upload reuses `routes/review-media.ts`'s presign → complete pattern verbatim: bytes go
direct to R2, and `complete` re-validates because the two calls are minutes apart.
Keys are `production-qc/<jobId>/<slot>/<filename>` via the existing
`sanitizeKeySegment` — identity-free, since a job id is a production handle.

The `received → qc_submitted` edge calls `assertShotListComplete`; a miss is **422
naming the missing slots**.

`POST /api/admin/production/:jobId/reviews` changes, all in one transaction: guard that
the job is `qc_submitted`; insert the review; move the job (`pass → qc_passed`,
`fail → qc_failed`); **require a non-empty `defects` array on a fail** (today it is
`nullish`, and a fail with no defect is unactionable for the vendor); and stamp
`review_id` onto every live photo it judged, so a dispute can say *which shots* were
approved. If the transition is refused, the review is not inserted either — nothing is
written, so the append-only guarantee is untouched.

Photos are retained **400 days**, matching the audit window: the audit row and the
photograph it refers to must not outlive each other in opposite directions. `ON DELETE
CASCADE` removes rows and leaves R2 objects orphaned forever, so the retention sweep
calls `deleteByPrefix('production-qc/<jobId>/')` and only **then** deletes rows. That
is a real task, not a footnote.

## 8. Audit

### The `fulfilment` category

`ALTER TYPE audit_category ADD VALUE 'fulfilment'` — safe because nothing uses it as a
literal in SQL; the application writes it at runtime, later, in a different
transaction. Three code sites move together: `auditCategorySchema` (shared),
`auditCategoryEnum` (api schema), and `CATEGORIES` in the viewer.

**#667 already specifies `money` for all `production_job.*` and must be reconciled.**
Split by what the row is *about*, not by table:

| Action | Category |
|---|---|
| `production_job.assigned`, `.reassigned`, `.amount_overridden` | **money** — commits or changes what we owe a supplier |
| `production_transfer.declared_lost` | **money** |
| `production_job.created`, `.transitioned`, `.transition_refused` | fulfilment |
| `production_job.photos_submitted`, `.qc_approved`, `.qc_rejected` | fulfilment |
| `production_job.label_issued` | fulfilment |
| `production_transfer.dispatched`, `.received` | fulfilment |
| `order.consolidator_set` | fulfilment |

There is no separate `production_job.cancelled` — a cancellation is a transition, which
keeps "one row per transition" true.

**Nothing is declared for sub-project 3 to fill in later.** #671 adds a build guard
that fails when `AUDIT_ACTIONS` declares an action no source file emits, so declaring
`shipment.*` here breaks the build the day it lands. **Rule: an action is declared in
the same phase as its emitter, or not at all.**

### Actor, and the vendor they act for

`recordAudit` reads only `c.get('user')` and `c.get('requestId')`. `requireVendor` sets
`c.set('vendorId')` and nothing reads it — so a vendor's writes carry their user
identity but not which shop they represent, and two users at one shop are
indistinguishable in a dispute *with that shop*.

Fixed inside `recordAudit`, per decision 14, merged **after** the caller's metadata so
a caller cannot overwrite it. It retro-improves every existing `vendor.request` floor
row. Property test: **every audit row written under `/api/vendor/*` carries
`metadata.vendorId`.**

### The transaction rule

No `recordAudit` call site in the repo passes `tx` — all forty omit it. This feature is
the first to need it, so the rule goes into `lib/audit.ts`'s doc comment:

> **Share the transaction when the audit row would be a lie if the business write
> rolled back.** A row saying "job moved to qc_passed" beside a job still sitting in
> `qc_submitted` is worse than no row.
>
> **Never share the transaction for a refusal.** A refusal row records that a
> transaction was rolled back; writing it inside that transaction erases the very
> evidence it exists to preserve.

Shares `tx`: `created`, `assigned`, `reassigned`, `amount_overridden`, `transitioned`,
`photos_submitted`, `qc_approved`, `qc_rejected`, the transfer actions,
`consolidator_set`. Does **not**: `transition_refused` and every other
`outcome: 'failure'` row, and `label_issued` (no transaction exists).

Property test: run each mutating handler against a `tx` that throws at commit; assert
no success row survives and the refusal row does.

### What this still does not prevent

Named, because `recordAudit` swallows its own failures and the floor is the only
backstop:

1. A transition can commit with **no audit row at all**. `recordAudit` claims the
   request before inserting, precisely so a failed insert cannot produce a *misleading*
   floor row — the price is a *missing* row. `alertCritical` fires, but the table shows
   no hole. Nobody may later conclude "no row means it didn't happen".
2. The chokepoint is enforced by a source-scanning test, not by the database. Anyone
   with a `psql` prompt can move a job to any status.
3. Backdating: the date-order checks stop incoherent sets, not dishonest ones.
4. Audit retention is 400 days; a vendor dispute window is longer. Partly answered by
   `pricing_snapshot`, `cancel_reason` and photo retention living on rows that do not
   expire; not answered for the actor of an ordinary transition.

## 9. Migrations

`packages/api/src/database/migrations/NNNN_snake_case.sql`, hand-written since 0014
because drizzle's meta snapshots stop at 0013 and `db:generate` is unusable.

**The rule that governs every migration in this feature:** no new enum value may appear
as a literal in **any** migration, ever. `0018:6-8` records that drizzle-kit replays
the whole pending batch in one transaction, so splitting `ALTER TYPE … ADD VALUE` and
its first use across two migration files does **not** help a fresh database. The
`sent`-retirement backfill is therefore a **script**, not a migration.

Databases must be built with `db:migrate`, never `db:push` — `push` diffs the drizzle
DSL, which cannot express a function or a trigger, and silently creates neither
(#663). New raw SQL objects go into the `RAW_SQL_OBJECTS` manifest.

## 10. Testing

Cadence: unit + integration per ticket (Vitest), E2E per feature (Playwright).

**The property tests that matter:**

1. **Transition-matrix exhaustiveness** — over every (status, status, actor) triple the
   matrix is total and answers exactly one of allow/deny, and the API agrees on every
   one. Plus: `sent` has zero edges in both directions; `dispatched` and `cancelled`
   have zero out-edges; every non-terminal state can reach `cancelled`; and the
   vendor-allowed edges and `VENDOR_SETTABLE_STATUSES` cannot drift apart.
2. **The label gate cannot open without QC** — enumerate every status assignment over
   two- and three-job orders and assert `isOrderReadyToLabel` is true **iff** §5's
   condition holds. Named negatives: any job outside `{qc_passed, dispatched}`; a
   `dispatched` job whose transfer is un-received; a lost transfer; a `qc_passed` job at
   a non-consolidator; no consolidator row; an uncovered order item; and **the
   already-labelled case (no second label)**. Plus both source scans.
3. **The customer-data boundary** — R1 over every route-table entry; every presign call
   in exactly one scope; scopes pairwise disjoint and non-substitutable; non-consolidator
   404 with the presigner never called; no `iframe`/`embed`/`object` and no
   `X-Amz-Signature` in the DOM. The existing "the walker actually finds a planted key —
   the suite is not vacuous" guard stays.
4. **Transfer-leg integrity** — a job is never on two transfers; every job on a transfer
   belongs to `from_vendor_id`; `received_at` settable only by `to_vendor_id`; `lost_at`
   only by an admin; a received transfer cannot be declared lost; a lost transfer creates
   exactly one replacement per job **and leaves the original payable untouched**.
5. **One audit row per transition** — exactly one `production_job.transitioned` per
   legal edge (not zero, not two: the floor must be suppressed); exactly one
   `transition_refused` per illegal edge, with `outcome: 'failure'`, **surviving a
   rolled-back business transaction**; every `/api/vendor/*` row carries
   `metadata.vendorId`; every action declared here has an emitter, pre-satisfying #671.
6. **Money invariants** — cancelling an assigned-or-later job without an
   `amountActual` is refused; a cancelled job at `'0.00'` contributes zero and still
   renders as a line; reassignment with `amount_actual` set is refused; a settlement's
   amount equals the sum over its jobs.

**E2E** (`tests/e2e/production-pipeline.spec.ts`): admin creates two jobs across two
vendors → sets the consolidator → vendor A marks received, uploads the shot list,
submits → admin passes QC → A dispatches a transfer → B receives it → B marks received,
uploads, submits → admin passes → readiness flips true → the label signs → B confirms
handover. Plus the refusal cases in the same spec: a non-consolidator fetching the
label; a vendor submitting with an incomplete shot list; a vendor attempting
`qc_passed`.

**Repo hazards to write into tickets rather than rediscover:** run E2E against the
correct port — `:5173` is a *different app* and makes suites pass vacuously; do not run
admin suites in parallel with other admin suites; stub `localStorage` in `vi.hoisted`
above imports; build databases with `db:migrate`; and the new one — no enum literal in
any migration.

## 11. Pre-existing defects this feature fixes or makes live

| Defect | Status |
|---|---|
| `POST /:jobId/assign` never reads `job.status` — a cancelled or `qc_passed` job is assignable today; its update is also untransacted | Fixed here |
| **A cancelled job strands a phantom payable** — `vendor-payables.ts:172`, `:308` and `getVendorPayableTotal` filter on `settlement_id IS NULL` alone. Cancellation becomes reachable in this feature, so this goes live here. Fix: `status <> 'cancelled'` in all three | Fixed here, filed as its own bug ticket |
| Pricing ignores `order_items.quantity` — a line with quantity 3 is priced as one. Latent only because nothing creates jobs yet | Fixed here |
| `settlement_id` is `ON DELETE set null` — deleting a settlement silently un-settles every job it paid for | Fixed here (`restrict`) |
| `OrderProductionPanel.tsx` client-side-scans the queue because `GET /api/admin/production` has no `orderId` filter. Its header predicts the fix | Fixed here; the scan and its truncation branch are deleted |
| `vendor-nav.ts:35` claims the status array is "in the order the work moves" while listing `sent` before `received`, contradicting its own labels four lines down | Fixed by construction |
| `production_jobs` dates are bare `timestamp` while `admin_audit_log.created_at` is `timestamptz` | Named debt. All **new** columns are `timestamptz`; converting the existing five is out of scope |

## 12. Out of scope

Each named so it cannot be absorbed.

- **The Shiprocket client** — auth, token refresh, webhooks, AWB creation, pickup
  scheduling, courier rate selection, label retrieval → `order-dispatch-tracking`. This
  feature produces `isOrderReadyToLabel` and consumes an object key. It never speaks to
  a carrier.
- **The customer tracking page and the order-vs-`order_shipments` split-brain** →
  `order-dispatch-tracking`.
- **`order_shipments` schema changes** — RTO/NDR states, external ids, shipped weight
  and dims, what we paid, the label token → `order-dispatch-tracking`. Declared here
  only as the seam.
- **AI defect detection**, the controlled defect vocabulary, live video, artwork-versus-
  photo matching, false-positive tuning → `production-qc-inspection`. Only the shot
  list, the upload path and the human verdict move forward.
- **Per-tier price uplift and margin calibration** from `cost_amount` →
  `shipping-price-baked-in`.
- **Executing vendor payments** → outside the system, permanently.
- **Lead-time calculation and the customer-facing delivery estimate** → *deferred within
  this feature, not dropped*. It depends on the courier leg (sub-project 3) and on
  transfer duration, of which there is no history. Ship the state machine, then
  estimate from data. `vendor_capabilities.stated_turnaround_days` stays unused for now.
- Refused outright: any `orders.status` enum change; a `production_batches` entity;
  multi-parcel orders; CHECK constraints of any kind; dropping `sent` from the Postgres
  type; reusing `photo-approval-workflow`'s tables; vendor-initiated remakes without an
  admin; reconciling the five-plus divergent order-status definitions in `shared/` and
  `web/`; deleting the dead `packages/api/src/db/schema.ts`.
- Auto-routing, vendor capacity, purchase orders, vendor invoices and performance
  scorecards → later, once production history makes the numbers mean anything.

## 13. Ticket map

| Phase | Location | Content |
|---|---|---|
| 1: Database Schema | `packages/api/src/database/{schema,migrations}` | New statuses and the `fulfilment` category (`ALTER TYPE` only, zero literal use); job photos, the shot-list contract and storage paths; transfers, consolidation and lifecycle columns, plus the `sent`-retirement script |
| 2: Access Control | `packages/api/src/lib` | The transition matrix and `assertTransition`; `isOrderReadyToLabel`, its blockers and the single-consumer scan; vendor signing scopes; `recordAudit` vendorId and the refusal-transaction rule |
| 3: Admin API | `packages/api/src/routes/admin` | Guarded transitions with audit; QC review moves the job and requires defects; consolidator, `orderId` filter and readiness; transfer oversight and declaring one lost |
| 4: Vendor Portal API | `packages/api/src/routes/vendor.ts` | The three settable statuses and the guarded PATCH; photo upload by presign and complete; transfer dispatch and receipt; the signed label and the rewritten isolation properties |
| 5: Admin UI | `packages/web/app/routes/admin/production` | The queue reshaped; photo QC review with per-slot verdict and defects; consolidator picker, readiness blockers and transfers on the order panel |
| 6: Vendor Portal UI | `packages/web/app/routes/vendor` | Job actions rebuilt from the matrix; the shot-list uploader and verdict banner; inbound transfers and the label handover card |
| 7: E2E | `tests/e2e` | Two-vendor consolidation happy path and the access-denied cases |
| Bug | `packages/api/src` | A cancelled job strands a phantom payable in the vendor's own portal |

Cross-feature dependencies: **#668/#669/#670** already cover the four
declared-but-unwired vendor audit actions — depend on them, do not re-file. **#671**
(the declared-but-dead guard) constrains phases 3 and 4. **#667** must be reconciled or
marked superseded-in-part. **#663** — `db:migrate`, never `db:push`.

Two neighbouring features need a recorded amendment or their specs keep asserting a
dead premise: `vendor-management` (the zero-customer-data rationale) and
`order-dispatch-tracking` (manual dispatch → Shiprocket API).
