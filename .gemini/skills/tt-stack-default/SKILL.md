---
name: tt-stack-default
description: Generate a new project's docs/TECH-STACK.md from the maintained current-stack baseline with fast per-category override choices. Use for greenfield projects where the default stack is a fine starting point.
allowed-tools:
  - Read
  - Write
  - Glob
  - AskUserQuestion
---

# /tt-stack-default — Stack decision, mode 2: baseline + fast overrides

Writes `docs/TECH-STACK.md` into the target project from the maintained
stack baseline's defaults, with one quick choice per category. No
justification round-trips — this is the "the default is fine, let's move"
path.

Reference material comes from the target project's own tracker: derive
`TRACKER_URL` from the `ports:` binding in
`<target>/docker-compose.ticketrack.yml` (`"<port>:3002"` →
`http://localhost:<port>`), then fetch `current-stack.md` and
`tech-stack-template.md` from `${TRACKER_URL}/api/reference/<name>`.

## Arguments

```
<target-project-path> [<srs-path>]
```

- `srs-path` optional — used only to pre-fill the two applicability gates.

## Workflow

### Step 1: Validate

Target exists; no approved `docs/TECH-STACK.md` already there; both
`${TRACKER_URL}/api/reference/current-stack.md` and
`${TRACKER_URL}/api/reference/tech-stack-template.md` fetch successfully.

### Step 2: Applicability gates (up front, one AskUserQuestion, two questions)

- **AI engine?** — does this project have LLM-driven features? (pre-answer
  from the SRS if provided, confirm)
- **Payments?** — does it have a monetization model? (same)

"No" omits §3/§6 entirely — no heading, no renumbering of the rest.

### Step 3: One choice per remaining category

For each category of the fetched `current-stack.md`, in order, one
`AskUserQuestion`:

- Option 1: the **Default**, labeled "(Recommended)", description from its
  **Why** line.
- Options 2-3: the category's **Alternatives previously considered**, each
  with a one-line differentiator.
- The user can always free-text Other.

Accepting the default needs no discussion. An override is recorded in the doc
as `**⚠ deviation from baseline:**` with the user's stated reason (one
follow-up question only if they gave none).

### Step 4: Write section-by-section with individual approval

Fill the fetched `tech-stack-template.md`. Copy the Default's exact version
pins from the fetched `current-stack.md`. Present each section for approval
before the next.

### Step 5: Finalize

Set `Status: APPROVED (<date>)`, `Derived by: tt-stack-default`. If any
category was overridden, close with: *"If this override should become the new
baseline for future projects, edit `reference/current-stack.md` in
`/Users/dhruv/work/ticketrack` (section + Change Log row) by hand and rebuild
the tracker image — this skill never writes it."*

## Error Handling

Same shape as `tt-stack-from-project`: target missing / doc already exists
(status-aware resume-overwrite-abort) / reference material unreachable →
tracker down (bring it up) or image predates reference serving (rebuild);
stop with the specific URL named.
