---
name: tt-stack-from-project
description: Generate a new project's docs/TECH-STACK.md by transcribing an existing project's live stack verbatim. Use when the user says "same stack as <project>" or names a reference project.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# /tt-stack-from-project — Stack decision, mode 1: clone a source project

Writes `docs/TECH-STACK.md` into the target project by reading a **source
project's real, live config files** — never the cached stack baseline. This
is the "replicate connecting-sounds" path that bootstrapped customs-copilot.

Reference material comes from the target project's own tracker: derive
`TRACKER_URL` from the `ports:` binding in
`<target>/docker-compose.ticketrack.yml` (`"<port>:3002"` →
`http://localhost:<port>`), then fetch templates from
`${TRACKER_URL}/api/reference/<name>`.

## Arguments

```
<target-project-path> [<source-project>]
```

- `target-project-path`: absolute path to the project receiving the doc.
- `source-project`: sibling directory name in `/Users/dhruv/work/` (default:
  `connecting-sounds`).

## Workflow

### Step 1: Validate

1. Target path exists and has no `docs/TECH-STACK.md` yet (if one exists →
   Error Handling).
2. Source project exists and looks like a real project (`package.json`
   present).
3. The target's tracker serves the template:
   `curl -sf ${TRACKER_URL}/api/reference/tech-stack-template.md` succeeds.

### Step 2: Read the source's LIVE configuration

Transcribe from reality, not memory — read at minimum:

- root + per-package `package.json` (names, workspaces, version pins)
- `docker-compose*.yml`, `Dockerfile` (images, ports, profiles, stages)
- `.env.example` (the env contract)
- `turbo.json`, `tsconfig.json`
- `drizzle.config.*` / migration layout if present

Record exact version pins as written (`^4.6.12`, not "latest Hono").

### Step 3: Applicability gates (from the SOURCE's real deps)

- §3 AI engine: include only if the source has AI deps (`openai`, provider
  SDKs) **or** the target's SRS describes LLM features.
- §6 Payments: include only if the source has a payments SDK **or** the
  target's SRS describes monetization.
- Omitted sections are left out entirely — no heading, no "N/A" — and the
  remaining sections are **not** renumbered (§3 always means AI engine).

### Step 4: SRS conflict scan

If `{target}/docs/SRS.md` exists, read it and list conflicts where the SRS
needs something the source stack lacks (billing described but no payments
SDK; realtime described but no websocket story; vector search but plain
postgres). Ask **one `AskUserQuestion` per conflict** — options: add the
capability (becomes a **⚠ deviation**) / defer it / the SRS is wrong. Never
silently invent additions.

### Step 5: Write section-by-section with individual approval

Fill the fetched `tech-stack-template.md`'s shape. Present each section and
get approval before the next (the `tt-new-feature` cadence). Everything taken
from the source is stated as fact with its pin; anything NOT from the source
is marked `**⚠ deviation:**` with a one-line reason.

### Step 6: Finalize

On last-section approval, set the header `Status:` to `APPROVED (<date>)`,
`Derived by: tt-stack-from-project (<source>)`, and confirm completion so an
orchestrating skill can verify the gate.

## Error Handling

- **Target missing** → "Target `<path>` does not exist — run tt-new-project,
  or mkdir first."
- **TECH-STACK.md already exists** → show its `Status:`; offer resume
  (approved: nothing to do) / overwrite (explicit confirmation) / abort.
- **Source unreadable / not a project** → name what's missing; suggest the
  default source or `/tt-stack-default`.
- **Reference template unreachable** → the target's tracker is down (bring it
  up and retry) or its image predates reference serving (rebuild
  tracker-unified:latest from /Users/dhruv/work/ticketrack); name which.
