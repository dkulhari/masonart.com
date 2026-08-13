---
name: tt-implement-feature
description: Deliver an entire feature by iterating through all tickets. Use when user wants to implement a complete feature automatically.
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
  - AskUserQuestion
  - Skill
---

# /tt-implement-feature - Full Feature Delivery

Delivers an entire feature by implementing all tickets in phase order, with worktree isolation, code review checkpoints between phases, and subagent-isolated ticket implementation — independent tickets in parallel, interdependent ones one at a time.

**Absorbs**: `superpowers:executing-plans`, `superpowers:subagent-driven-development`
**Calls**: `superpowers:using-git-worktrees`, `superpowers:requesting-code-review`, `superpowers:finishing-a-development-branch`
**Delegates to**: `/tt-work-ticket` for per-ticket TDD implementation

## Continuous Execution Mode

**This skill runs autonomously until all tickets are processed.** Do NOT stop or ask the user unless:

1. **Genuine blocker**: Cannot proceed without user input (missing credentials, ambiguous requirements)
2. **Code review feedback**: User review at phase checkpoints
3. **User explicitly interrupts**

**DO NOT stop to:**
- Ask "should I continue?" — YES, always continue
- Confirm before each ticket — just do it
- Show progress and wait — show progress AND continue immediately

## Arguments

```
$ARGUMENTS: <feature-name>
```

- `feature-name`: Name of the feature to implement

**Example**: `/tt-implement-feature user-reviews`

## Workflow

### Step 1: Safety Checks

Before starting:
- Verify current branch (warn if on main/master)
- Check for uncommitted changes (warn if dirty)

If on main/master:
```
⚠️ Currently on branch: main
Consider creating a feature branch first.
```

Use `AskUserQuestion` to confirm: "Create feature branch?" or "Continue on main?"

### Step 2: Set Up Worktree (Optional)

If the user approves worktree isolation:

**Invoke**: `superpowers:using-git-worktrees`

This creates an isolated workspace for the feature work:
1. Detects worktree directory (`.worktrees/`, `worktrees/`, or asks)
2. Verifies directory is gitignored
3. Creates worktree with feature branch
4. Runs project setup (npm install, etc.)
5. Verifies clean test baseline

If worktree is declined or not applicable, continue on current branch.

### Step 3: Fetch Feature and Tickets

```
mcp__ticketrack__listFeatures → find feature
mcp__ticketrack__listTickets → get all tickets for feature
```

Extract:
- Feature description with implementation plan
- All tickets with their status, labels, blocked_by

If no tickets: "Feature has no tickets. Run /tt-plan-feature {name} first."

### Step 4: Determine Execution Order

Parse the implementation plan to determine phase order.

**Ordering Rules**:
1. Group tickets by phase labels (phase-1, phase-2, etc.)
2. Within phases, respect `blocked_by` relationships
3. If no phase labels, order by: priority (high→low), then ticket ID
4. Independent tickets within the same phase can be parallelized

Build execution plan:
```
Phase 1: [ticket-A, ticket-B]  ← independent, can parallel
Phase 2: [ticket-C]            ← depends on Phase 1
Phase 3: [ticket-D, ticket-E]  ← depends on Phase 2
```

### Step 5: Filter to Pending Tickets

Remove tickets that are already `done`. Keep `in-progress` tickets (resume them).

If all done: "All tickets for '{name}' are complete!"

### Step 6: Phase-Based Execution Loop

For each phase:

#### 6a. Announce Phase

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Phase {N}: {Phase Name}
Tickets: {count} ({list of #ids})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 6b. Execute Tickets in Phase

**Default: dispatch every ticket to a subagent — sequential ones too.**

*Whether* to dispatch is a **residency** decision. A ticket read inline is
pinned for the session and re-sent every turn; the same read in a subagent is
discarded when it returns. Ten tickets inline ≈ 15,000 resident tokens; ten in
subagents ≈ ten summary lines.

*How many at once* is a **machine** decision, and it is the one that bites.

- **Independent** → parallel, max 3 at once.
- **Interdependent** → one at a time in dependency order. Still a subagent —
  sequencing is correctness, isolation is context.

**Why 3 and not 10.** Every one of those agents runs `/tt-work-ticket`, and
every one of them is told to verify by running tests. N agents are therefore N
concurrent test runs on one machine — and a test runner is not one process. It
forks per core by default, so a single unscoped run can already saturate the
box on its own. Three of them is not three times the throughput; it is three
runs each taking three times as long, plus a laptop that stops responding.

Measured on an 8-core laptop: **load average 58** — one pathless unit run
(~7 forks), one browser spec against every configured browser project, a
second concurrent browser run, and a whole-workspace run leaked from a session
killed the day before.

Two consequences for this loop:

1. **Scale the cap to the machine, not to the ticket count.** 3 assumes a
   typical multi-core dev laptop and *scoped* test commands. On a smaller box,
   or when the phase's tickets each touch a heavy suite, drop to 2 or 1. More
   than 3 needs a reason beyond "there were more tickets".
2. **A phase where agents run unscoped suites is worse than sequential.**
   Before dispatching, confirm the tickets carry scoped test commands. If they
   do not, the parallelism you are buying is negative.

**When not to.** Each subagent re-pays the full fixed cost (tool schemas + skill
chain), so dispatch only amortises on a long enough run:

| Tickets remaining | Do |
|---|---|
| 3+ | Dispatch |
| 1–2 | Run inline — dispatch costs more than it saves |

**If `Task` is unavailable, run inline and say so — never silently:**

```
⚠️  Subagent dispatch unavailable — running inline.
    Ticket reads will stay resident in this context.
```

Otherwise the failure shows up only as unexplained context growth. The
mcp-local-runtime feature ran all 21 tickets inline for exactly this reason.

**For each ticket** (dispatched or inline):

##### Announce Ticket
```
🎫 Implementing Ticket #{id}: {title}
Progress: {current}/{total} ({percentage}%)
```

##### Delegate to tt-work-ticket

Follow `/tt-work-ticket` workflow for each ticket:
1. Fetch ticket details and context
2. Move to in-progress, start work session
3. Execute TDD steps (structured or freeform)
4. **Mark each implementation step done IMMEDIATELY after completing it** — call `mcp__ticketrack__updateImplementationStep(ticketNumber, stepId, "done")` after every step, not at the end
5. Verify with hard gate (must show test evidence)
6. Commit per-ticket
7. End work session, mark done, add completion comment

Note on sessions: a work session brackets **one reply**, not one ticket (see
tt-work-ticket's Session Semantics). When this skill runs many tickets inside
a single reply, each ticket still opens and closes its own session — and a
ticket spanning several replies accumulates several sessions, which is the
rework signal, not a bug to tidy up.

##### Handle Failures

If implementation fails after 7 attempts:
1. Check if ticket is in critical path (blocks other tickets)
2. If NOT critical: Skip ticket, leave as `in-progress`, add comment:
   ```
   ⚠️ **Implementation Incomplete**
   **Attempts**: 7
   **Blocking Issue**: {description}
   **Error**: {error message}
   Left in-progress for manual review.
   ```
3. If critical: Add comment, continue to next non-blocked ticket
4. **Never stop the session** — always continue to next ticket

##### Progress Update
```
✅ Ticket #{id} complete
   Commit: {short-hash} - {commit-message}
   Files: +{additions} -{deletions}
```

#### 6c. Code Review Checkpoint (After Each Phase)

After all tickets in a phase are complete:

**Invoke**: `superpowers:requesting-code-review`

1. Get git SHAs for the phase's commits
2. Dispatch code-reviewer subagent with:
   - What was implemented (phase summary)
   - Plan/requirements (from feature description)
   - Base and head SHAs
3. Present review results to user
4. Fix Critical/Important issues before proceeding to next phase
5. User approves → proceed to next phase

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Phase {N} Review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{Review results}

Proceed to Phase {N+1}? (Waiting for review feedback)
```

### Step 7: E2E Tests (Feature Level)

After all phases complete, create E2E tests if applicable:

1. Identify E2E test needs based on feature (new pages, user flows)
2. Create test files following project's E2E test patterns
3. Run E2E tests
4. Commit E2E tests separately

```bash
git add tests/e2e/
git commit -m "test(e2e): add E2E tests for {feature-name}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Step 8: Feature Completion

After all tickets and E2E tests:

**Invoke**: `superpowers:finishing-a-development-branch`

This presents 4 options:
1. Merge back to base branch locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

The skill handles verification, merge, PR creation, and worktree cleanup.

### Step 9: Display Summary

**If all done**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 FEATURE COMPLETE: {name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Implementation Summary:
  - Tickets completed: {count}
  - Total commits: {count}
  - Files created: {count}
  - Files modified: {count}

📋 Commit Log:
  {hash} - {message}
  {hash} - {message}
  ...

🧪 Tests:
  - Unit/Integration tests: Added per ticket (TDD)
  - E2E tests: {test file path}

✅ All tests passing
```

**If some skipped**:
```
⚠️ Feature '{name}' partially implemented

Completed: {count} tickets
Skipped (stuck): {count} tickets

Skipped tickets:
  #{id} - {title} (reason: {failure description})

These tickets are left in-progress for manual review.
```

## Interruption Handling

If interrupted (user cancels, error occurs):

1. Current ticket stays `in-progress`
2. Progress is preserved (completed tickets stay done)
3. Resume by running `/tt-implement-feature {name}` again
   - Will skip completed tickets
   - Will resume in-progress tickets
   - Will continue from next pending ticket

## Dispatch Details

```
Task tool (subagent_type: general-purpose):
  prompt: |
    Implement ticket #{id} for feature {name} by following /tt-work-ticket.

    Read the ticket yourself — do not expect it in this prompt. Your context
    is discarded when you return, which is the point: the read costs nothing
    beyond your own run.

    After EACH implementation step, call
    mcp__ticketrack__updateImplementationStep(#{id}, stepId, "done")
    immediately — not batched at the end. Step status is the audit trail and
    is what makes an interrupted run resumable from disk rather than context.

    You are one of up to 3 agents working this machine right now. Every test
    command you run must name what it runs — the path of the test the ticket
    touched, one spec, one target. No pathless runner, no watch mode, no
    workspace-wide script, no full E2E suite. The project's CLAUDE.md has the
    commands. If you believe you need the whole suite, say so in your result
    line instead of running it.

    Return ONLY the one-line result described below. Nothing else.
```

**Say the scoping rule in the prompt; do not assume it is inherited.** The
subagent reads `/tt-work-ticket`, which carries the rule — but it also reads the
ticket, the feature, and whatever the codebase suggests, and a rule stated once
three files away loses to a habit. It costs five lines here and prevents the
failure mode this whole cap exists for.

**Pass the ticket number, not the ticket.** Pasting the description in means the
orchestrator read it first — the exact cost this avoids.

### What comes back

The saving is entirely in what does *not* return. The final message is the
summary alone — no transcript, no ticket body, no diff:

```
✅ #279 done — commit f17be24, 11 tests passing
⚠️  #279 incomplete after 7 attempts — {blocker}, left in-progress
```

A chatty subagent turns a 1,500-token saving into a 1,500-token cost. That one
line is also all the phase banner and commit log need.

### Rules

- Max 3 parallel agents; one ticket each, never two in the same files. 3 is a
  machine budget, not a target — see "Why 3 and not 10" above.
- Wait for all agents in a phase before the review checkpoint.
- Failures follow the protocol above; **never stop the run**.
- Each subagent brackets its own work session, so tokens land on the right
  ticket. Unverified: whether token attribution can distinguish a subagent —
  if per-ticket tokens start vanishing, that is the cause (see #257).

## Key Differences from Old tt-implement-feature

| Old | New |
|-----|-----|
| Sequential only | Phase-based with parallel dispatch |
| No isolation | Git worktree at feature start |
| No code review | Review checkpoint after each phase |
| No merge/PR flow | Branch finishing at completion |
| Mentions TDD, doesn't enforce | Delegates to tt-work-ticket which enforces TDD |
| No E2E tests | E2E tests at feature completion |
