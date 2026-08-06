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

## Decisions deferred to the user (#510)

`orders.subtotal` semantics under a promotion, and which figure the free-shipping threshold reads. **Do not implement #510.** #430 proceeds under a stated interim assumption recorded as a comment on that ticket: subtotal stays gross, `total` subtracts the discount exactly once, threshold behaviour unchanged. Zero change to anything that already exists; if the decision lands elsewhere, the totals block in `routes/orders.ts` is the single place that changes.

## Current state

Verified complete:

| # | Commit | Evidence |
|---|---|---|
| #423 | `4b8edcd5` | 9 tests; migration 0007 applied — `promotion`, `promotion_product`, `promotion_exclusion` live |
| #424 | `4603dc25` | 8 tests |
| #425 | `2d448578` | 7 tests; migration 0008 applied — `promotion_id`, `promotion_discount` on `orders` |
| #426 | `cf2b852b` | 8 tests |

In flight: #427, #439, #432.

## After both features

Start a separate sub-session for the `gift-cards` feature being created in another session. Gift cards are **tender, not a discount** — the constraint is recorded in `plan/tracker-data/features/gift-cards.yaml` and in design doc §5's layering order. A gift card must never reach `resolveSalePrice` and must never be written to a discount column.
