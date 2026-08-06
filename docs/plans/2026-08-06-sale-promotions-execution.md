# Execution plan — sale-promotions + gallery-membership

**Started:** 2026-08-06 ~02:40 IST, overnight autonomous run
**Branch:** `feat/mesonart-design-parity` (no worktree — shared box, 13+ concurrent sessions)
**Design:** `docs/superpowers/specs/2026-08-05-sale-promotions-design.md`
**Tickets:** #423–#438 (sale-promotions), #439–#447 (gallery-membership), #510 (decision, SKIPPED)

This file exists because the dependency graph lives in the tracker but the *dispatch schedule* did not live anywhere. If this session dies, resume from §Current state.

---

## Rules that constrain scheduling

Beyond `blocked_by`, three constraints decide what may run at the same time:

1. **One migration at a time.** Two concurrent `drizzle-kit generate` runs produce conflicting snapshots in `src/database/migrations/meta/`. Migration-bearing tickets: #423 (0007 ✅), #425 (0008 ✅), #439 (0009). Never overlap them with each other.
2. **No two agents in one file.** Each wave is checked for file overlap before dispatch. The hot files: `lib/promotion-pricing.ts` (#426, #427), `routes/orders.ts` (#425 schema-side, #430 route-side), `schema/orders.ts` (#425), `components/layout/AnnouncementBar.tsx` (#434).
3. **Max 3 agents.** Load was 11.05 on 8 cores with 29 foreign vitest/playwright processes at start. Targeted single-file test runs only — never a full suite.

Every agent gets: no worktree, no branch switching, no prettier (repo has no config; defaults rewrite files away from its style), stage only touched files, one-line return.

## Verification protocol

**Run DB-touching suites with the real `DATABASE_URL` or the verification lies.** `packages/api/tests/setup.ts:15` and `vitest.config.ts` both default to `postgresql://...@localhost:5433/poster_app_dev` — port 5433 is **surveytrack-postgres**, a different application. The chobii database is on **5440**. Without the override the suite's `beforeAll` fails on its cleanup query, vitest reports every test as *skipped* rather than failed, and a green-looking "0 failures" hides a suite that never ran. This cost a false accusation against #431 and #442 tonight; both were fine at 67 passing.

```bash
export $(grep -m1 '^DATABASE_URL=' /Users/dhruv/work/masonart.com/.env)
cd packages/api && bunx vitest run tests/routes/admin/promotions.test.ts
```

Suites that mock `db` (most route tests) pass either way, which is what makes the trap quiet — only the ones hitting a real database go silently skipped.

Subagent self-reports are not evidence. After each returns, the orchestrator independently confirms:

- `git show --stat <hash>` — the commit exists and touches the files it should
- the named test file actually passes when re-run here
- for migrations: `docker exec poster-app-postgres psql -U poster_app -d poster_app_dev -c "\d <table>"` — the DDL reached the database, not just the repo

#423 needed exactly this: its agent died on the final step, having done the work. Verified and closed out by hand.

## Waves

| Wave | Tickets | Gate |
|---|---|---|
| 1 | #423, #424 | independent |
| 2 | #425, #426 | #423 done; #425 owns the migration lane |
| 3 | #427 | #424 + #426 done; owns `promotion-pricing.ts` alone |
| 4 | #439, #432 | migration lane free after #425; #432 imports but never edits `promotion-pricing.ts` |
| 5 | #431, #428, #429 | need #427's `loadPromotionProductSets`; three different route files |
| 6 | #430, #440, #442 | #430 needs #425 + #427; #440/#442 need #439 |
| 7 | #433, #434, #441 | #433 needs #431; #434 needs #432; #441 needs #440 |
| 8 | #443, #435, #436 | #443 needs #439 + #440; #435 needs #428 + #432; #436 needs #429 |
| 9 | #437, #444 | #437 needs #428 + #432; #444 needs #443 + #432 |
| 10 | #445, #446 | sequential: #446 reveals on #445's dismissal |
| 11 | #438, #447 | E2E last; #447 also needs #438's seeding helper |

Waves are a scheduling convenience, not a barrier — a ticket dispatches the moment its own dependencies are verified and its files are free.

## Ticket numbers collided — identify by file, not number

A parallel `gift-cards` session consumed #511–#515 while this run was creating tickets, and the counter handed out **#510 twice**. Both files exist and no work was lost, but the number is ambiguous:

| File | What it is |
|---|---|
| `todo/feature-sale-promotions/ticket-0510-decision-needed-orders-subtota.yaml` | The DECISION ticket — reserved for the user, must not be implemented |
| `in-progress/feature-sale-promotions/ticket-0510-cart-page-mixes-two-cart-sourc.yaml` | The cart-source bug found while verifying #436 |

Consequences to respect:
- **Never write to ticket 510 through the MCP tools** — `updateTicketStatus(510, ...)` or `updateImplementationStep(510, ...)` could land on the decision ticket and mark work the user reserved. Edit the YAML file directly instead.
- The featured-rail bug I first announced as "#511" is actually **#516** (`ticket-0516-api-featured-products-endpoint.yaml`, done, commit `fd38bf0d`). #511 is gift-cards schema and is untouched.
- Any future ticket created during a multi-session night should be looked up by title immediately after creation; the number in the create response is not trustworthy under concurrency.

## Decisions deferred to the user (see file, not number)

`orders.subtotal` semantics under a promotion, and which figure the free-shipping threshold reads. **Do not implement #510.** #430 proceeds under a stated interim assumption recorded as a comment on that ticket: subtotal stays gross, `total` subtracts the discount exactly once, threshold behaviour unchanged. Zero change to anything that already exists; if the decision lands elsewhere, the totals block in `routes/orders.ts` is the single place that changes.

## Defects found in the ticket specs themselves

Both were caught by implementing agents, both would have shipped green:

1. **Product facets are arrays.** `products.styles` / `subjects` / `rooms` are `text[]` (`schema/products.ts:111-114`). Every ticket's `PricedProduct` sketch declared singular `style` / `subject` / `room`. Shipped as written, the `filter` scope matches **zero products in production while every supplied test passes** — the fixtures encoded the same wrong shape as the code. `resolveSalePrice` now normalises both via `facetValues()`. Propagated as comments to #429 and #430; #428 got it in its dispatch prompt.
2. **`@chobii/shared` `dist/` is stale and gitignored.** #424 landed source only, so `tsc` rejects `ResolvedSalePrice` / `PromotionScopeFilter` imports until `cd packages/shared && bunx tsc`. Any ticket importing something new from shared hits this.

The general lesson for the remaining tickets: a test fixture written from the same ticket that wrote the code inherits the ticket's wrong assumptions. Where a ticket asserts a schema shape, check the schema.

## Current state

Verified complete — each independently confirmed here (commit + re-run test + applied DDL), not taken from the agent's self-report:

| # | Commit | Evidence |
|---|---|---|
| #423 | `4b8edcd5` | 9 tests; migration 0007 applied — `promotion`, `promotion_product`, `promotion_exclusion` live |
| #424 | `4603dc25` | 8 tests |
| #425 | `2d448578` | 7 tests; migration 0008 applied — `promotion_id`, `promotion_discount` on `orders` |
| #426 | `cf2b852b` | 8 tests |
| #427 | `4a998e91` | 28 tests; found defect 1 above; added `loadPromotionProductSets` |
| #439 | `820d95e3` | 6 tests; migration 0009 applied — 4 membership columns; `galleryMember` in auth `additionalFields:302` |

In flight: #432, #440, #428.

## Outcome (run complete, 2026-08-06 ~14:30 IST)

All 25 planned tickets landed. **415 tests green** across the feature: 191 in `packages/api` (9 suites), 224 in `packages/web` (9 suites), plus the two Playwright specs. `packages/web` type-checks at 22 errors, all pre-existing and none in files touched tonight (baseline was ~26).

**Bugs found while verifying, and fixed the same night** — none were in the plan, all were found by an agent checking its own work or by driving the real flow:

| What | Why it mattered |
|---|---|
| #516 featured rail unpriced | Home rail showed base prices while the grid showed sale prices — same catalogue, one screen apart |
| #510 cart mixed two sources | Saving row could describe a basket the customer was not looking at |
| #524 mappers dropped `sale` | `/sale` and `/posters` cards printed base prices *during a sale* — the feature's core promise, silently absent |
| #525 stale response cache | A sale switched on in admin would not appear until the TTL lapsed; also fixed `deleteCachedPattern` blocking Redis with `KEYS` |
| #526 stale membership cookie | **The worst one.** better-auth's 5-minute `session.cookieCache` meant a fresh member was still a guest server-side, so `POST /api/orders` charged them base price while the UI showed the discount unlocked. Shown a discount, billed without it — invisible from the browser, and every unit test passed |

**Filed, not fixed** (pre-existing, outside this feature's scope):

- *The web app never writes to the server cart* — every `cartApi` mutation hook has zero call sites, yet `POST /api/orders` builds the order from that cart. Critical, predates the sale work, and the reason both E2E specs assert the cart leg at API level.
- *Admin product writes never bust the list cache* — `deleteCached(CacheKeys.PRODUCT_LIST)` targets a literal key that is never written. A delete matching nothing still succeeds, which is why no test caught it.
- *A scheduled sale does not appear at its start time* — the TTL clamp covers `endsAt` but not an upcoming `startsAt`.
- *Registration-intent joins carry the same session staleness* as #526 — bounded to a stale render, never a wrong charge.
- *`ProductListItem` in `hooks/useProducts.ts` has no `sale` field* — three hooks would silently drop it; all have zero consumers today.
- *`GET /api/collections/:slug` prices nothing* — a real price surface, but `collectionsApp` has no `optionalAuth`, so pricing it as a guest would stamp `locked: true` on members.

**What the ticket specs got wrong**, worth remembering when writing the next batch: five of my own implementation sketches were wrong in ways their own tests would not have caught — singular facet fields against `text[]` columns, `useSession()` that never resolves during SSR, a relative `fetch` with no Vite proxy, `product.basePrice` where a line prices from the variant, and shadcn dialog primitives this repo does not have. A fixture written from the same ticket as the code inherits the ticket's wrong assumptions. Every one was caught by the implementing agent reading the actual code first.

**Incidents in the shared worktree** (13+ concurrent sessions, no isolation): one `git stash` swept 16 files of other agents' uncommitted work (restored intact), one `git commit --amend` rewrote another agent's commit (`4487c24e` → `6eb64913`, contents intact, their recorded hash now stale), and one agent's tracker writes landed on the wrong #510 (fully reverted). Both commands are now prohibited in every dispatch; `git commit --only <paths>` is the only safe commit form here.

## After both features

Start a separate sub-session for the `gift-cards` feature being created in another session. Gift cards are **tender, not a discount** — the constraint is recorded in `plan/tracker-data/features/gift-cards.yaml` and in design doc §5's layering order. A gift card must never reach `resolveSalePrice` and must never be written to a discount column.
