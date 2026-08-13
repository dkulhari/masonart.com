---
name: tt-work-ticket
description: Work on a single ticket with full context. Use when user wants to start or continue work on a specific ticket.
allowed-tools:
  - mcp__ticketrack__showTicketDetails
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - mcp__ticketrack__updateImplementationStep
  - mcp__ticketrack__recordVerification
  - mcp__ticketrack__updateChecklist
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-work-ticket - Single Ticket Implementation with TDD

Implements a single ticket using strict TDD (red/green/refactor) and verification-before-completion.

**Absorbs**: `superpowers:test-driven-development`, `superpowers:verification-before-completion`

## Arguments

```
$ARGUMENTS: <ticket-number>
```

- `ticket-number`: The ticket ID to work on (just the number, without #)

**Example**: `/tt-work-ticket 45`

## Core Principles

### The Iron Laws

```
1. NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
2. NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Write code before the test? Delete it. Start over.
Claim "tests pass" without running them? That's dishonesty, not efficiency.

### TDD Cycle (Per Step)

```
RED    → Write failing test. Run it. Confirm it fails for the RIGHT reason.
GREEN  → Write minimal code to pass. Run test. Confirm it passes.
REFACTOR → Clean up if needed. Run tests. Confirm still passing.
VERIFY → Run the tests the ticket touches, by path. Evidence recorded.
COMMIT → Only after verified. Include ticket # in message.
```

### Test Commands — One Machine, Many Agents

You are probably not alone on this machine. `/tt-implement-feature` runs several
tickets at once, each in its own agent, and this skill tells every one of them
to verify by running tests. Three agents each starting a full suite is three
times the machine, not three times the throughput.

Measured on an 8-core laptop: **load average 58**, from one pathless unit run
(~7 forks), one browser spec running against every configured browser project, a
second concurrent browser run, and a whole-workspace run leaked from a session
killed the day before. Every one was an agent following a skill that said
"run the full suite".

**So every test command names what it runs.**

```
Unit / component   the path of the test file the ticket touched
E2E                one spec, one browser target
Whole suite        only when the ticket genuinely touched that much — and
                   then say so out loud with the escape hatch
```

The concrete commands are **the project's, not this skill's**. Read them from
the project's `CLAUDE.md`.

#### The project test entry point (a convention, not a requirement)

Several tt-* skills — `/tt-fix-tests`, `/tt-run-test-suit`, `/tt-debug-browser`
— are written around a single bounded entry point, conventionally
`./scripts/run-tests.sh`. A project that provides one gets those skills working
out of the box. The convention is:

| | |
|---|---|
| **Path** | `./scripts/run-tests.sh` at the repo root |
| **Selector** | `<suite>` as the first argument — `unit`, `e2e`, `setup` |
| **File filter** | `--file=<name>` runs one spec or test file |
| **Failure cap** | `--max-failures=<n>` stops early instead of grinding through a red suite |
| **Workers** | bounded by default — a low fixed worker count, not "one per core" |
| **Matrix** | narrowed by default — one browser, one interpreter, one platform |

The last two rows are the ones that matter here. The point of the entry point
is not convenience; it is that **the safe thing is the default**, so an agent
that forgets to think still runs something bounded.

**A project without one is not broken.** Every skill that calls it must state a
fallback, and the fallback is always the same shape: use the project's
`CLAUDE.md` commands, path-scoped, with whatever worker and matrix flags that
runner needs to stay bounded. What a skill must never do is invoke
`./scripts/run-tests.sh` without checking it exists — a missing script produces
a shell error that reads like a test failure and sends the whole loop chasing
a bug that isn't there.

Never, in ticket work:

- A runner invoked with no path and no filter. That is the whole suite wearing
  a disguise.
- A watch-mode runner. It never exits; it holds workers until the session dies.
- A workspace-wide script (`test`, `run test`, `-r test`, a monorepo task
  runner's `test`). These often rebuild every package before running anything.
- A matrix run without a matrix filter — one spec against every browser,
  interpreter or platform in the config.
- A full E2E suite. That is feature-level work with one owner
  (`/tt-implement-feature` step 7), not per-ticket verification.

Worker caps in a runner's config bound a *single* run. They do nothing about
runs that never needed to happen. Scope first, then run.

**This may be enforced.** If the project has run `/tt-guard-tests`, a
`PreToolUse` hook denies the shapes above, names the scoped command to run
instead, and repairs a matrix run by inserting the missing filter. When the
whole suite genuinely is the task, prefix the escape hatch the guard names
(`ALLOW_FULL_SUITE=1` by default) — deliberately, because it is the difference
between "I need this" and "I forgot the path".

Before starting a long run, check nothing else is already saturating the box:

```bash
uptime    # load average above the core count means wait, do not add to it
ps -Ao pcpu,etime,command | grep -Ei "<this project's runners>" | grep -v grep
```

That `etime` column is the point. **Strays outlive the sessions that spawned
them** — a killed session leaves its test processes running, and the next agent
inherits a machine that is already busy for no reason anyone can see. A run with
an elapsed time longer than your session has existed is not someone else's work
in progress; it is garbage. Reap it.

### Session Semantics

Three different things are called "session". They nest:

```
claude_session   one Claude Code conversation — spans days and many tickets
  └── work_session   ONE REPLY: you start it, work, end it before responding
       └── prompt    one exchange within that reply
```

**A `work_session` brackets one reply, not one ticket.** Root `CLAUDE.md`
requires ending the session before returning *any* response, so a ticket that
takes five replies has five sessions. That is correct and expected — do not
try to hold one session open across replies.

Consequences worth knowing:

- **Sessions-per-ticket is the rework signal.** One session means it landed
  first try; several mean it came back. (Ticket #141 has 11 — four days of
  fighting a Docker build. #235 has 2, the second triggered by review
  feedback.) Don't collapse sessions to make a ticket look tidy.
- **Ending a session ≠ finishing a ticket.** Step 9 Action 1 runs every
  reply; Actions 2-3 run once, only when the work is actually complete.
- **Never leave a session open when you stop replying.** An unclosed session
  keeps accruing until the next `--action end` runs, which is what produced
  the corrupt 61-day records this convention exists to prevent.

## Workflow

### Step 1: Fetch Ticket Details

```
node packages/scripts/dist/show-ticket.js --ticket {ticket-number} --data-dir plan/tracker-data
```

Extract:
- Title and Description
- Labels
- Status
- Feature name
- blocked_by / blocks
- **Implementation Steps** (if present — see "Structured Steps" below)

### Step 2: Check Dependencies

If ticket has `blocked_by` entries:
1. Fetch each blocking ticket's status
2. If any are not done, warn the user

```
⚠️ Ticket #{id} is blocked by:
  - #{blocking-id}: {title} (status: {status})

Consider completing blockers first, or proceed if you understand the dependency.
```

### Step 3: Fetch Parent Feature

Get the feature context to understand the bigger picture:
- Feature description
- Implementation plan (if present)
- Where this ticket fits in the phase order

### Step 4: Gather Relevant File Context

Based on ticket labels, dynamically discover relevant files. Do NOT assume specific paths.

**For `database` / `schema` labels**:
```
Glob: **/schema/*.{ts,js,prisma}, **/models/*.{ts,js,py}
Grep: "createTable", "Schema", "@Entity", "model"
```

**For `backend` / `api` labels**:
```
Glob: **/routes/**/*.{ts,js}, **/api/**/*.{ts,js}
Glob: **/services/**/*.{ts,js}, **/controllers/**/*.{ts,js}
```

**For `frontend` / `ui` labels**:
```
Glob: **/components/**/*.{tsx,jsx,vue,svelte}
Glob: **/pages/**/*.{tsx,jsx}, **/app/**/*.{tsx,jsx}
```

**For `skills` labels**:
```
Glob: .claude/skills/**/*.md
Read: Existing skill files relevant to this ticket
```

**For `tests` labels**:
```
Glob: **/*.test.{ts,js}, **/*.spec.{ts,js}
```

Use Task tool with Explore agent for deeper analysis if needed.

**Search claude-mem for past context** (all tickets):
```
mcp__plugin_claude-mem_mcp-search__search:
  query: "{keywords from ticket title/description}"
  types: ["bugfix", "decision", "discovery"]
```

This surfaces past bugs, design decisions, and discoveries related to the same files or areas. Use findings to:
- Avoid repeating past mistakes
- Understand why code is structured a certain way
- Find related fixes that might inform this ticket's approach

### Step 5: Update Ticket Status

If ticket is in `todo` status, move to `in-progress`:

```bash
node packages/scripts/dist/move-ticket.js --ticket {ticket-number} --status in-progress --data-dir plan/tracker-data
```

Start a work session:

```bash
node packages/scripts/dist/log-work-session.js --ticket {ticket-number} --action start --agent "claude-code" --summary "Starting work" --enable-token-tracking --data-dir plan/tracker-data
```

**A work session brackets one reply, not the whole ticket.** See
[Session Semantics](#session-semantics) below. If this ticket takes several
replies, you open and close a session in *each* of them — Step 5 and Step 9
run once per reply, not once per ticket. Multiple sessions on a ticket are
normal and are how rework is measured; do not try to keep one session open
across replies.

### Step 6: Determine Implementation Mode

Check for implementation steps in **two places** (preference order):

1. **YAML `implementation_steps` field** (structured): Ticket has `implementation_steps` array with typed step objects
2. **Markdown in description** (legacy): Description contains `- [ ] **Step N [action]**:` format
3. **Neither**: Freeform ticket — use TDD cycle based on labels

**If YAML steps exist** → Structured Steps Mode (YAML)
**Else if markdown steps exist** → Structured Steps Mode (Markdown fallback)
**Else** → Freeform Mode (see "Implementation by Label" below)

---

## Structured Steps Mode

### YAML Steps (Preferred)

When the ticket has `implementation_steps` field, each step is a typed object:

```yaml
implementation_steps:
  - id: 1
    action: write-test      # write-test | verify-fail | implement | verify-pass | refactor | commit
    description: "Write failing test for..."
    file: "path/to/test.ts"
    command: "pnpm vitest run path/to/test.ts"
    expected_result: "FAIL"
    status: pending          # pending | done | skipped
    code: |
      test('should...', () => { ... })
  - id: 2
    action: verify-fail
    description: "Confirm test fails"
    command: "pnpm vitest run path/to/test.ts"
    expected_result: "FAIL"
    status: pending
current_step: 1
```

**Reading steps**: Use the `implementation_steps` array directly. `current_step` points to where you are.

**Updating steps**: Use MCP tools (preferred) or CLI scripts to mark steps done:
```
mcp__ticketrack__updateImplementationStep(ticketNumber, stepId, "done")
```
Or via CLI:
```bash
node packages/scripts/dist/update-implementation-step.js --ticket {number} --step {stepId} --status done --data-dir plan/tracker-data
```

**Recording verification**: After test/build verification:
```
mcp__ticketrack__recordVerification(ticketNumber, { testsPassed: true, testCommand: "...", buildPassed: true })
```

### Markdown Steps (Legacy Fallback)

When ticket has no `implementation_steps` field but description contains steps in this format:

```markdown
## Implementation Steps

- [ ] **Step 1 [write-test]**: Description
  - File: `path/to/test.ts`
  - Run: `test command`
  - Expected: FAIL

- [ ] **Step 2 [verify-fail]**: Confirm test fails
  - Run: `test command`
  - Expected: FAIL
```

Parse steps from the markdown description. Track progress by step comments rather than YAML fields.

### Execution Rules (Both Modes)

1. **Find resume point**: YAML mode uses `current_step`. Markdown mode scans for first `- [ ]`.
2. **Execute each step**: Follow the action type:
   - `[write-test]`: Write the test code to the specified file
   - `[verify-fail]`: Run the command. **MUST fail**. If it passes, the test doesn't test anything — fix it.
   - `[implement]`: Write the implementation code to the specified file
   - `[verify-pass]`: Run the command. **MUST pass**. If it fails, fix the implementation (not the test).
   - `[refactor]`: Clean up code. Run tests. Must still pass.
   - `[commit]`: Stage and commit with ticket reference
3. **Mark step done IMMEDIATELY after completing it** — not at the end, not in a batch. Each step gets marked the moment it's done:
   - YAML mode: `mcp__ticketrack__updateImplementationStep(ticketNumber, stepId, "done")` — or `"skipped"` if you took a different approach
   - Markdown mode: add comment noting step completion
   - **This is not optional.** Step status is the audit trail. If you complete a step without marking it, the ticket shows false progress.
4. **Never skip steps**: Steps are ordered for a reason. `[verify-fail]` proves the test works. `[verify-pass]` proves the implementation works.

### Resume Capability

When resuming interrupted work:
1. Read ticket — check for `implementation_steps` field first, then markdown
2. YAML mode: look at `current_step` and find first step with `status: pending`
3. Markdown mode: find first `- [ ]` step
4. Announce: "Resuming from Step {N}: {description}"
5. Continue from that step

---

## Freeform Mode (No Structured Steps)

When ticket has no structured steps, follow the TDD cycle yourself:

### For Each Behavior to Implement:

**RED — Write Failing Test**

Write ONE minimal test showing what should happen.

Requirements:
- One behavior per test
- Clear name describing the behavior
- Real code (mocks only if unavoidable)

Run the test. Confirm:
- Test **fails** (not errors)
- Failure message is **expected** (feature missing, not typos)
- If test passes → you're testing existing behavior. Fix the test.
- If test errors → fix the error, re-run until it fails correctly.

**GREEN — Minimal Code**

Write the simplest code to make the test pass. Nothing more.

Don't add features, refactor other code, or "improve" beyond the test.

Run the test. Confirm:
- Test **passes**
- Other tests still pass
- If test fails → fix the implementation, not the test

**REFACTOR — Clean Up**

After green only:
- Remove duplication, improve names, extract helpers
- Keep tests green throughout
- Don't add behavior

### Implementation Guidance by Label

**Database/Schema Tickets**:
1. Write schema validation tests first
2. Create/modify schema following project patterns
3. Verify tests pass

**Backend/API Tickets**:
1. Write route/service tests first (expected request → response)
2. Implement service functions and routes
3. Verify tests pass

**Frontend/UI Tickets**:
1. For complex components: write component tests first
2. Create components following project patterns
3. Simple presentational components don't need unit tests

**Skills Tickets** (like this feature):
1. Review existing skill to understand current behavior
2. Write the new skill content based on requirements
3. Manual verification (invoke the skill on a test case)

**Bug Tickets**:
1. Write a test that reproduces the bug (must fail)
2. Fix the bug (test must pass)
3. Document root cause in ticket comment:
```
**Root Cause**: {what caused the bug}
**Location**: `{file:line}`
**Fix**: {how it was fixed}
```

---

## Verification Hard Gate

<HARD-GATE>
You CANNOT mark a ticket as done without fresh verification evidence.

Before ANY completion claim:
1. IDENTIFY: What command proves this works?
2. RUN: Execute the command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying.
</HARD-GATE>

### Verification Evidence Format

Record in the completion comment:

```
**Verification**:
- Command: `{test command}`
- Result: {PASS/FAIL} ({N} tests, {N} passing, {N} failing)
- Output: {relevant output snippet}
```

### Red Flags — STOP

- Using "should", "probably", "seems to" about test status
- Expressing satisfaction before verification ("Great!", "Done!")
- About to commit without running tests
- Thinking "just this once" about skipping verification

---

## After Implementation: Commit Per-Ticket

**IMPORTANT**: Every ticket gets its own commit.

### Step 7: Verify and Test

```
1. Run relevant tests for changed files
2. Run build/type-check if applicable
3. Fix any issues before committing
4. Record verification evidence
```

### Step 8: Commit the Ticket Work

```bash
# Stage ONLY files related to THIS ticket
git add {specific-files}

# Commit with ticket reference
git commit -m "{type}({scope}): {brief description}

{Detailed explanation}

Implements #{ticket-number}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**Commit types**: `feat`, `fix`, `refactor`, `test`, `docs`

### Step 9: End Session, and Close the Ticket If It's Finished

These are two different things on two different clocks:

- **Action 1 runs before EVERY reply** — ending the session is per reply, not
  per ticket (see [Session Semantics](#session-semantics)). If the ticket
  needs more work, do Action 1 only, then pick up at Step 5 next reply.
- **Actions 2 and 3 run ONCE, only when the ticket is actually complete.**
  Never mark a ticket done just because a reply is ending.

```
┌─────────────────────────────────────────────────────────────┐
│  EVERY REPLY (while working this ticket)                    │
├─────────────────────────────────────────────────────────────┤
│  [ ] 1. End work session with a summary of THIS reply       │
├─────────────────────────────────────────────────────────────┤
│  ONLY WHEN THE TICKET IS FINISHED (all three)               │
├─────────────────────────────────────────────────────────────┤
│  [ ] 1. End work session with summary                       │
│  [ ] 2. Update ticket status to "done"                      │
│  [ ] 3. Add completion comment with commit + verification   │
└─────────────────────────────────────────────────────────────┘
```

**Action 1: End Work Session** (every reply)
```bash
node packages/scripts/dist/log-work-session.js --ticket {ticket-number} --action end --agent "claude-code" --summary "{summary}" --auto-calculate-tokens --data-dir plan/tracker-data
```

**Action 2: Update Status** (only when the ticket is finished)
```bash
node packages/scripts/dist/move-ticket.js --ticket {ticket-number} --status done --data-dir plan/tracker-data
```

**Action 3: Add Completion Comment** (only when finished — DO NOT SKIP!)
```bash
node packages/scripts/dist/add-comment.js --ticket {ticket-number} --comment "..." --author "claude-code" --data-dir plan/tracker-data
```

Comment format:
```
✅ **Completed**

**Commit**: `{commit-hash}` - {commit-subject}

**Files Changed**:
- `{file1}` - {description}
- `{file2}` - {description}

**Summary**:
{What was implemented}

**Verification**:
- Command: `{test command}`
- Result: PASS ({N} tests passing)
- Output: {snippet}
```

**Why all three are required**: Work session tracks token usage. Status tracks progress. Completion comment links commits to tickets and records verification evidence for audit trail.

---

## Common Rationalizations (Don't Fall For These)

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests should pass now" | RUN the verification. |
| "I'm confident" | Confidence ≠ evidence. |
| "Skill files don't need tests" | Manual verification still required. Document what you tested. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |

## Error Handling

- **Ticket not found**: "Ticket #{id} not found. Use /tt-feature-status to see available tickets."
- **Blocked ticket**: Show warning but allow proceeding
- **No feature**: "Ticket #{id} is not associated with a feature. Showing ticket details only."
- **Tests keep failing**: After 3 attempts, pause and report the specific failure with evidence
