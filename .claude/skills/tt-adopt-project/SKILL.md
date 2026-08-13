---
name: tt-adopt-project
description: Reverse-engineer an existing codebase into the ticketrack workflow — adopted docs (SRS, TECH-STACK, PHASES-AND-FEATURES, PLAN-OF-ACTION), historical tickets from git history, and the tt-* loop. Use after the adopt-project script has run in a repo that predates ticketrack.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Skill
  - AskUserQuestion
  - ToolSearch
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__bulkCreateTickets
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - mcp__ticketrack__listTickets
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-adopt-project — Bring an existing project on par with a bootstrapped one

The adoption counterpart of `/tt-new-project`: instead of a dialogue that
creates requirements from an idea, this skill **reverse-engineers** them from
evidence — the code, the git history, the README, existing docs — and imports
the project's past work into its tracker as done tickets.

**Run order (ticketrack-first):** the ticketrack container, `.mcp.json`
binding, and tt-* skills already exist before this skill runs — the served
adopt-project script (`cd <project> && curl -s <TRACKER>/api/adopt-project |
bash`) did that. This skill runs in a **fresh session whose cwd IS the
adopted project**, with the project's own tracker bound via `.mcp.json`. All
doc templates are fetched from that tracker's `/api/reference` endpoints —
this skill never reads another repo's checkout.

## ⚠️ CRITICAL: MCP-Only Operations

**NEVER write directly to plan/tracker-data/ files.** All ticket and feature
operations MUST use ticketrack MCP tools. If MCP is unavailable, the skill
MUST fail — do not fall back to file operations.

<LIGHT-REVIEW>
Unlike /tt-new-project there are NO hard approval gates. The docs describe
what the code already is — the code is the ground truth, the user corrects
rather than approves. One correction pass over all four docs (step 4), then
every doc header gets `Status: ADOPTED (<date>)`. Claims that are guesses
must be marked `(inferred)`; genuine unknowns go to SRS §8 Open Items instead
of being invented.
</LIGHT-REVIEW>

## Arguments

```
[--skip-history] [--max-features=<n>]
```

- `--skip-history`: generate the four docs only; skip the git-history import
  (step 5).
- `--max-features`: cap on historical cluster features (default 10).

## Tracker URL

Every reference fetch below uses `TRACKER_URL`, derived once in step 1: read
the published port from `./docker-compose.ticketrack.yml`'s `ports:` binding
(`"<port>:3002"`) → `TRACKER_URL=http://localhost:<port>`.

## Workflow

### Step 1: Verify the adoption (verification, NOT creation)

The adopt script must already have run. Confirm, in order:

1. **cwd is the adopted project**: `./docker-compose.ticketrack.yml` and
   `./.mcp.json` exist here, and the directory is a git repo. Missing → stop:
   "run the adopt script first — `cd <project> && curl -s
   http://localhost:3333/api/adopt-project | bash`."
2. **Tracker healthy**: derive `TRACKER_URL` (above), then
   `curl -sf ${TRACKER_URL}/api/health` returns ok. Unreachable → stop:
   "`docker compose -f docker-compose.ticketrack.yml up -d`, then re-run."
3. **MCP bound**: `ToolSearch "+ticketrack list"`, then
   `mcp__ticketrack__listFeatures` succeeds. Failing → STOP (see MCP-only
   rule); usually means the session predates `.mcp.json` — open a fresh one.
4. **Reference served**: `curl -sf ${TRACKER_URL}/api/reference` lists the
   four doc templates. Missing → stop (tracker image predates reference
   serving — rebuild it from the ticketrack repo).
5. **Existing docs**: any of the four docs already present with
   `Status: ADOPTED|APPROVED` → resume-from-that-step (Error Handling);
   never silently overwrite.

### Step 2: Evidence gathering (read-only)

Build the evidence base before writing anything:

1. **Written intent**: `README.md`, everything under `docs/`, `ROADMAP*`,
   `CHANGELOG*`, `TODO*`, package.json `description`.
2. **Live config** (the TECH-STACK ground truth): `package.json` (+ workspace
   manifests), lockfile → package manager, `tsconfig*`, bundler/framework
   configs, docker/compose files, CI workflows, `.env.example`, migration/ORM
   configs.
3. **Structure**: top-level layout and `src`/`packages`/`apps` trees via Glob;
   entry points; test layout.
4. **History** (the PHASES + import ground truth):
   - `git log --oneline --reverse` (full arc, first commit → HEAD)
   - `git shortlog -sn` (authors), `git log --format=%ad --date=short`
     first/last (project age)
   - `git log --numstat` sampling for dominant path prefixes per era
5. **claude-mem** (optional, degrade silently if tools absent): `timeline`
   + `search` on the project name for decisions/discoveries worth citing in
   the docs and ticket comments.

### Step 3: Generate the four docs

Fetch each template from `${TRACKER_URL}/api/reference/<name>` and fill from
evidence. Headers: `Status: ADOPTED (<date>)` plus
`Derived by: tt-adopt-project` and the evidence basis.

1. **`docs/SRS.md`** (`srs-template.md`): §1 Vision and §3 Product features
   from README/docs/routes/UI surfaces; §2 Users & roles from auth code if
   any; §4 "None — free/internal tool" unless billing code is evidenced;
   §5 invariants only where enforcement is visible in code (validators,
   tests) — else thin + `(inferred)`; §6 from observed configs (real numbers
   where measurable); §7 from explicit non-goals found in docs; §8 Open Items
   collects every unknown this process surfaced.
2. **`docs/TECH-STACK.md`** (`tech-stack-template.md`): **transcribed
   verbatim from the project's own live config** — the tt-stack-from-project
   procedure with source = self. Name exact packages and versions from the
   lockfile/manifests. Nothing here is a choice; it is a record.
3. **`docs/PHASES-AND-FEATURES.md`** (`phases-and-features-template.md`):
   **retrospective phases first** — the step-5 clusters in chronological
   order, each marked complete with `Gate: met historically — <evidence:
   commit range / release tag / deploy record>`; then **forward phases** from
   roadmap/TODO evidence (may be a single "next" phase; empty is valid when
   no forward evidence exists).
4. **`docs/PLAN-OF-ACTION.md`** (`plan-of-action-template.md`): header table,
   the per-phase tt-* loop for the forward phases, constraints copied from
   SRS §5/§6, references to the other three docs.

### Step 4: Light review (single pass)

Present all four docs as compact summaries (5-8 bullets each, flagging every
`(inferred)` claim), then ONE `AskUserQuestion` round: corrections to any
doc, or accept all? Apply corrections, re-show only the changed sections,
move on. No approval ceremony — `Status: ADOPTED` records the date, not a
sign-off.

### Step 5: Import git history as thematic clusters

Skip when `--skip-history` or fewer than 5 commits (note the skip in the
summary). Never `logWorkSession` for imported work — backdated sessions
would attribute this session's token usage to historical work and pollute
analytics; the commit tables in comments are the historical record.

1. **Cluster** the full commit list into 3-10 features (respect
   `--max-features`), by priority: conventional-commit scopes
   (`feat(scope):`) → dominant path prefixes from `--numstat` → feature
   names in existing docs → time-contiguous bursts. One `misc-foundation`
   catch-all is allowed. Kebab-case names.
2. **Check collisions**: `mcp__ticketrack__listFeatures` — an adopted repo's
   tracker is usually empty, but never assume.
3. Per cluster: `mcp__ticketrack__createFeature` (description = what the
   cluster delivered + evidence + "Imported from git history by
   tt-adopt-project").
4. Per **coherent chunk of work** within a cluster (1-6 tickets per feature,
   NOT one per commit): `createTicket` (type task; labels via the inference
   table below; priority medium) → `updateTicketStatus` to `done` →
   `addComment`:

   ```
   ✅ **Imported from git history**

   **Commits**:
   | Hash | Message |
   |------|---------|
   | `abc1234` | feat(auth): add session middleware |

   **Files touched**: {dominant paths}
   **Summary**: {what this chunk delivered}
   **Source**: git log analysis by tt-adopt-project{ + observation IDs if claude-mem contributed}
   ```

5. Verify hashes before citing: `git cat-file -t <hash>` — never invent a
   hash; an unverifiable one becomes "commit: unresolved".

### Step 6: Optional forward seed

If step 2 surfaced real pending work (roadmap entries, TODO/FIXME density,
"planned" README sections), offer to create **one** forward-looking feature
via `createFeature` and hand its ticket breakdown to `/tt-plan-feature` (via
the Skill tool). This skill never creates todo tickets itself. No pending
work → skip silently.

### Step 7: CLAUDE.md, commit, hand-off

1. **CLAUDE.md**: append a "Ticketrack workflow" section to an existing root
   `CLAUDE.md` (NEVER overwrite user content) or create one: what-it-is from
   SRS §1, the ticket-workflow blurb including the
   ticketrack-unavailable-STOP rule, architecture summary from TECH-STACK,
   invariants from SRS §5.
2. **.gitignore**: ensure it covers `.mcp.json`, `logs/`, `token-cache/`,
   `.claude/settings.local.json` (append, don't rewrite).
3. **Commit** (ask first): `docs/`, `CLAUDE.md`, `.gitignore`,
   `docker-compose.ticketrack.yml` — message
   `chore: adopt ticketrack (docs + tracker config)`.
4. Hand off in-session:

   > Adoption complete. `/tt-feature-status` shows the imported history.
   > New work: `/tt-new-feature` → `/tt-plan-feature` → `/tt-work-ticket`
   > per `docs/PLAN-OF-ACTION.md`.

## Label Inference

| File path pattern | Labels |
|-------------------|--------|
| `*/database/*`, `*/schema/*`, `*.sql`, migrations | `database`, `schema` |
| `*/routes/*`, `*/services/*`, `*/api/*` | `backend`, `api` |
| `*/components/*`, `*/pages/*`, `*.tsx`, `*.vue` | `frontend`, `ui` |
| `*/tests/*`, `*.test.*`, `*.spec.*` | `testing` |
| `docs/*`, `*.md` | `docs` |
| `Dockerfile*`, `*compose*`, CI files, `*.config.*` | `infra`, `config` |

## Error Handling

| Situation | Response |
|-----------|----------|
| Adopt script not run (no compose file / no .mcp.json) | Point at `curl -s <url>/api/adopt-project \| bash`; this skill never sets up infra |
| Tracker unreachable | `docker compose -f docker-compose.ticketrack.yml up -d`, poll ≤60s; still down → show logs, stop |
| MCP unavailable | **STOP** — usually a stale session; open a fresh one in this directory |
| `/api/reference` 404s | Tracker image predates reference serving — rebuild tracker-unified:latest, recreate container, re-run |
| Docs already exist | Read `Status:` fields; offer resume-from-that-step vs abort; never silently overwrite |
| Fewer than 5 commits | Skip step 5, note "history too short to import" in summary |
| claude-mem absent | Proceed without it (git + files are sufficient evidence) |
| Feature name collision | Suffix with `-imported` and note it |
| MCP failure mid-import | Report the failed item, continue with remaining clusters, list failures in summary |
| Resuming a partial run | `listFeatures`/`listTickets` + doc `Status:` fields to detect what exists; re-do nothing already done |
