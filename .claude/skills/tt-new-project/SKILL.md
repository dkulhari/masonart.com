---
name: tt-new-project
description: Bootstrap a complete new project — SRS dialogue, tech stack, phased plan, and the tt-* skill loop — inside a project whose ticketrack is already running. Use when starting any new project from an idea, after the create-project script has run.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Skill
  - AskUserQuestion
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-new-project — Bootstrap a new project end-to-end

Automates the process that built customs-copilot (its `docs/BasePlan.md`):
idea → `SRS.md` → `TECH-STACK.md` → `PHASES-AND-FEATURES.md` →
`PLAN-OF-ACTION.md` → hand-off into the per-phase tt-* loop.

**Run order (ticketrack-first):** the project directory, its ticketrack
container, and the tt-* skills already exist before this skill runs — the
served create-project script (`curl -s <TRACKER>/api/create-project | bash`)
did that, then `/api/setup` installed the skills. This skill runs in a
session whose **cwd IS the new project**, with the project's own tracker
bound via `.mcp.json`. All reference material (doc templates, stack
baseline) is fetched from that tracker's `/api/reference` endpoints — this
skill never reads another repo's checkout.

<HARD-GATE>
No PHASES-AND-FEATURES.md and no PLAN-OF-ACTION.md until BOTH docs/SRS.md
and docs/TECH-STACK.md carry an explicit `Status: APPROVED` confirmed in
conversation. The two approval gates are steps 5 and 7 — everything after
them is mechanical.
</HARD-GATE>

## Arguments

```
["<one-line-pitch>"] [--stack-skill <name>]
```

- `pitch`: seeds the SRS dialogue. The project name is the cwd's basename —
  it was fixed when create-project made the directory.
- `--stack-skill`: skip step 6's selection question.

## Tracker URL

Every reference fetch below uses `TRACKER_URL`, derived once in step 1:
read the published port from `./docker-compose.ticketrack.yml`'s
`ports:` binding (`"<port>:3002"`) → `TRACKER_URL=http://localhost:<port>`.

## Workflow

### Step 1: Verify the bootstrap (verification, NOT creation)

The pre-skill steps must already be done. Confirm, in order:

1. **cwd is the new project**: `./docker-compose.ticketrack.yml` and
   `./.mcp.json` exist here, and the directory is a git repo. Missing →
   stop: "run the create-project script first —
   `curl -s http://localhost:3333/api/create-project | bash`."
2. **Tracker healthy**: derive `TRACKER_URL` (above), then
   `curl -sf ${TRACKER_URL}/api/health` returns ok. Unreachable → stop:
   "`docker compose -f docker-compose.ticketrack.yml up -d`, then re-run."
3. **Skills present**: `.claude/skills/` here contains the tt-* skills;
   count matches `curl -s ${TRACKER_URL}/api/skills | jq .count`. Missing
   or short → stop: "run `curl -s ${TRACKER_URL}/api/setup | bash`."
4. **Reference served**: `curl -sf ${TRACKER_URL}/api/reference` lists
   `current-stack.md`, the four doc templates, and the two ticketrack
   templates. Missing any → stop (the tracker image predates reference
   serving — rebuild it from /Users/dhruv/work/ticketrack).
5. `docs/SRS.md` (or later docs) already present → Error Handling:
   resume-from-that-step, never silently overwrite.

### Step 2: Prior art

claude-mem search on the pitch's keywords (types: decision, discovery) +
skim `curl -s ${TRACKER_URL}/api/reference/current-stack.md`. Surface
anything relevant ("a similar scheduling app was designed in March — reuse
its comparison doc?") before asking the user anything.

### Step 3: Project skeleton (fill gaps only)

create-project already did `mkdir` + `git init`. Add what's missing, never
overwrite what exists: minimal `.gitignore` (node_modules, dist, .env,
logs/, token-cache/, .mcp.json, .claude/settings.local.json), stub
`README.md` (name + pitch only). No docs content yet.

### Step 4: SRS-gathering dialogue

Fetch `${TRACKER_URL}/api/reference/srs-template.md`. Follow brainstorming
dialogue discipline — **one question at a time**, multiple-choice
preferred, 2-3 approaches with a recommendation on real forks — but target
the template's 8 sections directly and write to `docs/SRS.md` (not a
separate spec file). Fill and present **section-by-section**, getting
approval for each before moving on:
1. Vision → 2. Users & roles → 3. Product features (one `###` per feature,
with output contracts) → 4. Subscription & usage model ("None — free/internal
tool" is a valid, kept, section) → 5. Accuracy/honesty/legal safety (the
mechanically-enforceable invariants) → 6. Non-functional requirements
(numbers, not adjectives) → 7. Out of scope → 8. Open items.

### Step 5: SRS approval gate (HARD)

Whole-document pass; on explicit user approval flip the header to
`Status: APPROVED (<date>)`. Not approved → iterate; never proceed.

### Step 6: Stack skill selection

Unless `--stack-skill` was given, one `AskUserQuestion`:

- `tt-stack-from-project` — "same stack as an existing project, transcribed
  from its live config" (recommend when step 4 surfaced a named reference).
- `tt-stack-default` — "current baseline with quick per-category overrides"
  (recommend when nothing unusual emerged).
- `tt-stack-from-srs` — "every choice argued from the SRS, comparison docs
  for hard calls" (recommend when SRS requirements clearly strain the
  default).

Invoke the chosen skill via the `Skill` tool, passing the project path
(cwd) (+ source project or SRS path as its arguments require).

### Step 7: TECH-STACK approval gate (HARD)

**Verify, don't assume**: read `docs/TECH-STACK.md` and confirm the
header says `Status: APPROVED`. If the stack skill ended without it, resume
that skill's flow — do not proceed.

### Step 8: Generate PHASES-AND-FEATURES.md (mechanical, non-vibes)

Fetch `${TRACKER_URL}/api/reference/phases-and-features-template.md`, then:

1. **Enumerate** candidate features: one per SRS §3 feature; §3's supporting
   features; 2-3 monetization features if SRS §4 describes a paid model;
   foundation features from TECH-STACK §1-2 (base-setup,
   database-foundation, auth-foundation).
2. **Classify** each into exactly one layer:
   *foundation* (infra, no user-visible behavior) · *domain-logic* (core
   engine, reachable without UI) · *user-facing* (UI + the API routes it
   needs) · *monetization* (only exists if SRS §4 does) · *launch-hardening*
   (always present, always last).
3. **Record dependency edges** (UI feature → its API route → its schema),
   usually read straight off TECH-STACK's own breakdown.
4. **Map layer → phase 1:1**: Phase 0 = foundation; Phase 1 = domain-logic
   topologically sorted, ending in a quality/eval-harness feature if SRS §5
   exists; Phase 2 = user-facing (auth-UI first, admin/history last);
   Phase 3 = monetization **only if SRS §4 exists** (otherwise the next
   phase takes its slot, no gap); last phase = launch-hardening.
5. **Derive each Gate mechanically** from the layer's proof-point:
   Phase 0 clean-checkout build+test green · Phase 1 harness passing +
   contract-shaped output with real cost logged · Phase 2 e2e
   signup→core-feature→result on free tier · Phase 3 payment test-mode e2e +
   webhook/idempotency correctness · last phase = its features' conjunction +
   Phase 1's harness still green. Never a freeform paragraph.
6. Present the generated doc as **one sanity-check question** (not a third
   hard gate — its inputs were locked at steps 5/7).

### Step 9: Generate PLAN-OF-ACTION.md

Fetch and fill `${TRACKER_URL}/api/reference/plan-of-action-template.md`
(header table, locked decisions, per-phase tt-* loop, constraints copied
from SRS §5/§6, references). No approval gate — mechanically derived from
approved material.

### Step 10: Verify ticketrack (verification-only)

The tracker was brought up before this skill ran. Re-confirm it is still
healthy (`curl -sf ${TRACKER_URL}/api/health`) and that
`plan/tracker-data/` exists here. Unhealthy → stop and surface
`docker compose -f docker-compose.ticketrack.yml logs --tail 50 tracker`;
ticketrack is mandatory — do not hand off without it.

### Step 11: Verify the tt-* skills (verification-only)

The `/api/setup` installer copied the skills before this skill ran.
Re-verify: local `.claude/skills/tt-*` count == `${TRACKER_URL}/api/skills`
count. Mismatch → re-run `curl -s ${TRACKER_URL}/api/setup | bash` and
re-check; still short → stop (a partial skill set is worse than none).
The `mcp__ticketrack__*` tools ARE available in this session — `.mcp.json`
was materialized before the session opened, binding this project's tracker.

### Step 12: CLAUDE.md, README, hand-off

Write the project's root `CLAUDE.md` (what-it-is from SRS §1,
current-state note pointing at the approval trail, the ticket-workflow blurb
including the ticketrack-unavailable-STOP rule, architecture summary from
TECH-STACK, hard invariants from SRS §5) and a real `README.md`. Commit
everything. Hand off in-session — no new session needed, the tracker is
already bound:

> Bootstrap complete. Run `/tt-new-feature` for each Phase 0 feature per
> `docs/PLAN-OF-ACTION.md`.

## Error Handling

- **Bootstrap not done** (no compose file / no .mcp.json / not a git repo):
  point at the create-project script; this skill never creates the project.
- **Tracker unreachable**: `docker compose -f docker-compose.ticketrack.yml
  up -d`, poll health ≤60s; still down → show logs and stop.
- **Reference endpoint missing** (`/api/reference` 404s): the running image
  predates reference serving — rebuild tracker-unified:latest from
  /Users/dhruv/work/ticketrack, recreate the container, re-run.
- **Docs already exist**: inspect their `Status:` fields; offer
  resume-from-that-step vs abort. Never silently overwrite.
- **Stack skill unavailable or produced no TECH-STACK.md**: report which;
  offer the other two.
- **Gate not actually met** (step 7 check fails): resume the stack skill;
  never proceed on an unapproved doc.
- **Skill-count mismatch after re-running setup**: stop before hand-off.
- **Resuming a partial run**: read `Status:` fields and existing files;
  re-ask nothing already answered.
