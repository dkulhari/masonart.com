---
name: tt-stack-from-srs
description: Generate a new project's docs/TECH-STACK.md by arguing every stack category from the SRS requirements, with A/B/C comparison docs for the genuinely hard calls. Use when the project's needs may not fit the default stack.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# /tt-stack-from-srs — Stack decision, mode 3: requirements-driven

Writes `docs/TECH-STACK.md` into the target project with every category
decision **grounded in a cited SRS requirement**. The maintained default is
still suggested per category, but genuinely open to being beaten.

Reference material comes from the target project's own tracker: derive
`TRACKER_URL` from the `ports:` binding in
`<target>/docker-compose.ticketrack.yml` (`"<port>:3002"` →
`http://localhost:<port>`), then fetch `current-stack.md` and
`tech-stack-template.md` from `${TRACKER_URL}/api/reference/<name>`.

## Arguments

```
<target-project-path> <srs-path>
```

Both required — without an SRS there is nothing to derive from (use
`/tt-stack-default` instead).

## Workflow

### Step 1: Validate

Target exists; SRS exists and has real content in §1/§3 (a skeleton SRS →
stop: "fill the SRS first — tt-new-project step 4 does this"); both
reference files fetch successfully from `${TRACKER_URL}/api/reference/`.

### Step 2: Requirements extraction (BEFORE any question)

Read the SRS in full. For each stack category, extract the specific
requirement(s) bearing on it, cited by section — e.g. "§6: p95 latency
< 120s on free-tier models", "§4: UPI Autopay mandates", "§5: invented
citations must be mechanically impossible". Categories with no bearing
requirement are noted as unconstrained.

### Step 3: Applicability gates

§3 AI engine from SRS §3's features; §6 Payments from SRS §4's content
("None — free tool" → omit). Standard omission rule: no heading, no
renumbering.

### Step 4: Per-category decision, grounded

For each category, one `AskUserQuestion`:

- **Default satisfies the requirements** → offer it "(Recommended)" with the
  citation that supports it.
- **SRS argues against the default** → flag the conflict explicitly, offer
  the default anyway labeled with its downside, plus 2-3 ranked alternatives
  each tagged with the requirement it serves.
- **Genuinely non-obvious** — no clear winner from the SRS alone, 3+ real
  options with materially different cost/risk profiles, expensive to unwind
  later (data-model or core-pipeline shape, not a swappable library) → spin
  off `docs/<topic>-comparison.md` FIRST (see below), then decide.

### Step 5: Comparison docs (the rag-architecture-comparison.md pattern)

Structure, exactly: problem statement → Option A / B / C (each: worked
example against a real SRS scenario, pros, cons, cost estimate) → summary
table → **Decision** section naming the winner and why. Present
section-by-section for approval like everything else. Cross-reference from
TECH-STACK by section number ("Architecture B per
docs/<topic>-comparison.md — decided after written A/B/C comparison").

### Step 6: Write section-by-section with individual approval

Fill the fetched `tech-stack-template.md`. Every section states its grounding
citation(s). Deviations from the baseline are marked `**⚠ deviation:**` with
the requirement that forced them.

### Step 7: Finalize

`Status: APPROVED (<date>)`, `Derived by: tt-stack-from-srs (<srs-path>)`.
Remind the user that a deviation worth generalizing goes into
`reference/current-stack.md`'s Change Log in `/Users/dhruv/work/ticketrack`
by hand (followed by an image rebuild).

## Error Handling

Same shape as the sibling skills (target missing / doc exists with
status-aware resume / reference unreachable → tracker down or stale image;
stop with the URL named), plus: **SRS is a skeleton** → stop
and point at the SRS dialogue; **comparison doc already exists for a topic**
→ read it and honor its Decision section instead of re-litigating.
