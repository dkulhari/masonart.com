---
name: tt-fix-tests
description: Run tests in a loop, creating tickets for failures and fixing via tt-work-ticket until all pass.
allowed-tools:
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - Skill
---

# /tt-fix-tests - Automated Test Fix Loop

Orchestrates test execution in a continuous loop, creating bug tickets for failures and delegating fixes to `tt-work-ticket` until all tests pass.

## ⚠️ CRITICAL: Continuous Execution Mode

**This skill runs autonomously until all tests pass or all failures are marked as stuck.** Do NOT stop or ask the user unless:

1. **Genuine blocker**: Cannot determine which feature a test belongs to
2. **User explicitly interrupts**: User sends a message or cancels

**DO NOT stop to:**
- Ask "should I continue?" - YES, always continue
- Ask "is this approach okay?" - Make the decision and proceed
- Confirm before fixing each test - Just do it
- Show progress and wait - Show progress AND continue immediately

### Handling Stuck Tests

**After 5 failed attempts to fix a test:**
1. Leave the bug ticket in `in-progress` status
2. Add comment documenting all 5 attempts
3. Track this test as "stuck" - allow it to fail in subsequent runs
4. **Continue to the next failing test** - never stop the session

**The goal is to fix as many tests as possible, not to achieve 100% success on first try.**

## Arguments

```
$ARGUMENTS: [--max-iterations=30] [--max-tickets=20]
```

- `--max-iterations`: Maximum total fix iterations across all tests (default: 30)
- `--max-tickets`: Maximum bug tickets to create (default: 20)

**Example**: `/tt-fix-tests` or `/tt-fix-tests --max-iterations=50`

## Test Entry Point (check this before the loop starts)

This skill is written around `./scripts/run-tests.sh` — the entry point
convention documented in `/tt-work-ticket` ("The project test entry point").
Every `./scripts/run-tests.sh` below assumes it.

**Before the first iteration, confirm it exists.**

```bash
test -x ./scripts/run-tests.sh && echo present || echo absent
```

If absent, substitute the project's own commands from its `CLAUDE.md` for every
invocation below, keeping the two properties this loop depends on:

- **a failure cap** — the loop's `--max-failures=N` is what stops it grinding
  through an entire red suite on every iteration. If the runner has no
  equivalent flag, run one target at a time instead.
- **a file filter** — needed to re-run a single failing test after a fix.

Do not run `./scripts/run-tests.sh` unchecked. A missing script produces a shell
error that reads like a test failure, and this loop will happily open a bug
ticket for it and start "fixing" a test that never ran.

## Core Loop

```
┌─────────────────────────────────────────────────────────┐
│  1. Run ./scripts/run-tests.sh e2e --max-failures=N       │
│     where N = 1 + count(stuck_tests)                    │
│     (stops on first NEW failure, allows stuck to fail)  │
└──────────────────────┬──────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
    ┌───────────────┐     ┌───────────────────────────────┐
    │ ALL PASS      │     │ NEW FAILURE DETECTED          │
    │ (or only      │     │                               │
    │  stuck tests) │     │  2. Parse the failure         │
    │ → Done!       │     │  3. Create/find ticket        │
    └───────────────┘     │  4. tt-work-ticket to fix     │
                          │  5. If 5 fails → mark stuck   │
                          │     (increment allowed fails) │
                          │  6. GOTO Step 1               │
                          └───────────────────────────────┘
```

### --max-failures Strategy

The test runner uses `--max-failures=N` to stop early on the first **new** failure while allowing **stuck** tests to fail:

| Stuck Tests | --max-failures | Behavior |
|-------------|----------------|----------|
| 0 | 1 | Stop on first failure |
| 1 | 2 | Allow 1 stuck to fail, stop on next new failure |
| 2 | 3 | Allow 2 stuck to fail, stop on next new failure |
| N | N+1 | Allow N stuck to fail, stop on next new failure |

This ensures we:
1. Focus on one failure at a time (efficient)
2. Don't re-fail already-stuck tests (wasteful)
3. Continue discovering new failures after marking tests as stuck

## Session State

Track progress throughout the session:

```yaml
session:
  iteration: 0
  max_iterations: 30
  max_tickets: 20

  # Dynamic --max-failures value (1 + stuck_count)
  stuck_count: 0  # Incremented when a test is marked stuck

  # Tickets created this session
  tickets:
    - id: 142
      test_key: "approval.test.ts:should create approval"
      feature: photo-approval-workflow
      attempts: 3
      status: done  # or in-progress

  # Tests we've given up on (5 failed attempts)
  stuck_tests:
    - test_key: "complex.spec.ts:race condition test"
      ticket_id: 145
      attempts: 5
      last_error: "timeout waiting for element"

  # Track attempts per test
  attempts:
    "approval.test.ts:should create approval": 2
    "complex.spec.ts:race condition test": 5
```

## Workflow

### Step 1: Initialize Session

```yaml
session:
  iteration: 0
  stuck_count: 0
  tickets: []
  stuck_tests: []
  attempts: {}
```

### Step 2: Run Tests with --max-failures

```bash
# Calculate max-failures: 1 (for new failure) + stuck_count (allow stuck to fail)
MAX_FAILURES=$((1 + stuck_count))

./scripts/run-tests.sh e2e --max-failures=$MAX_FAILURES 2>&1
```

This command:
- Stops on the **first new failure** (the +1)
- Allows all **stuck tests** to fail without stopping (the stuck_count)

**If exit code 0** → All tests pass → Check if we have stuck tests:
- If no stuck tests: **Done! All tests passing!**
- If stuck tests exist: **Done! All fixable tests passing!**

**If exit code non-zero** → Parse the failure and continue

### Step 3: Parse ALL Test Failures

Extract every failure from test output, not just the first one.

**Playwright (E2E) failure pattern**:
```
✘  1 [chromium] › tests/e2e/approval.spec.ts:45:5 › Approval › should display photos (15s)
    Error: expect(received).toBeVisible()
```

Extract:
- `test_file`: `tests/e2e/approval.spec.ts`
- `test_name`: `Approval › should display photos`
- `line`: 45
- `error`: `expect(received).toBeVisible()`
- `test_key`: `approval.spec.ts:Approval › should display photos`

**Vitest (unit) failure pattern**:
```
 FAIL  packages/api/tests/services/approval.test.ts > ApprovalService > create > should create
AssertionError: expected { success: false } to equal { success: true }
```

Extract:
- `test_file`: `packages/api/tests/services/approval.test.ts`
- `test_name`: `ApprovalService > create > should create`
- `error`: `expected { success: false } to equal { success: true }`
- `test_key`: `approval.test.ts:ApprovalService > create > should create`

### Step 4: Filter Out Stuck Tests

```python
new_failures = []
for failure in all_failures:
    if failure.test_key not in stuck_tests:
        new_failures.append(failure)
```

**If no new failures** (all failures are stuck tests):
- Report completion with stuck test summary
- **Done!**

### Step 5: Process Each New Failure

For each failure in `new_failures`:

#### 5a. Check/Increment Attempts

```python
attempts[test_key] = attempts.get(test_key, 0) + 1

if attempts[test_key] > 5:
    # Mark as stuck and skip
    mark_test_as_stuck(test_key, ticket_id)
    continue  # Move to next failure
```

#### 5b. Find or Create Ticket

Check if we already have a ticket for this test:
```python
existing_ticket = find_ticket_by_test_key(test_key)
if existing_ticket:
    ticket_id = existing_ticket.id
else:
    ticket_id = create_bug_ticket(failure)
```

#### 5c. Detect Feature

Map test file to feature using path patterns:

| Test Path Contains | Feature |
|--------------------|---------|
| `approval` | `photo-approval-workflow` |
| `tracking`, `notification` | `order-tracking-notifications` |
| `cart`, `checkout`, `order` | `cart-checkout` |
| `auth`, `login`, `signup` | `authentication` |
| `product`, `catalog` | `product-catalog` |
| `admin` | `admin-panel` |
| `review`, `rating` | `user-reviews` |
| `ai`, `generation` | `ai-generation` |
| `wallet` | `wallet-system` |
| `shipping`, `return` | `shipping-returns` |

If no match, use the most recently active feature or ask user (only genuine blocker).

#### 5d. Create Bug Ticket (if new)

```
mcp__ticketrack__createTicket:
  feature: "{detected-feature}"
  title: "Bug: {test-name} failing"
  type: "bug"
  labels: ["bug", "tests", "{layer}"]
  description: |
    ## Failing Test
    **File**: `{test-file}`
    **Test**: {test-name}
    **Line**: {line-number}

    ## Error
    ```
    {error-message}
    ```

    ## Context
    - Created by: tt-fix-tests
    - Attempt: 1 of 5

    ## Acceptance Criteria
    - [ ] Test passes
    - [ ] Root cause documented
    - [ ] No regressions
```

**Layer detection**:
- `tests/e2e/*` → `e2e`
- `packages/api/tests/*` → `api`
- `packages/web/tests/*` → `web`

#### 5e. Invoke tt-work-ticket

```
/tt-work-ticket {ticket-id}
```

This will:
1. Load ticket context
2. Analyze the failing test
3. Implement the fix
4. Run verification
5. Commit with ticket reference
6. Mark ticket done (if successful)

**Wait for completion** before processing next failure.

#### 5f. Check Fix Result

After tt-work-ticket completes:

**If ticket marked done**: Fix succeeded
```
✅ Ticket #{id} fixed
   Test: {test-name}
   Attempt: {n}/5
```

**If ticket still in-progress**: Fix failed, will retry
```
⚠️ Ticket #{id} fix attempt {n} failed
   Test: {test-name}
   Will retry on next iteration
```

### Step 6: Handle Stuck Test (After 5 Attempts)

When a test has failed 5 times:

1. **Add comment to ticket**:
```
mcp__ticketrack__addComment:
  ticketId: {ticket-id}
  comment: |
    ⚠️ **Marking as Stuck**

    This test has failed 5 consecutive fix attempts.
    Leaving ticket in-progress for manual review.

    **Attempt History**:
    1. {commit-1}: {what was tried}
    2. {commit-2}: {what was tried}
    3. {commit-3}: {what was tried}
    4. {commit-4}: {what was tried}
    5. {commit-5}: {what was tried}

    **Last Error**:
    ```
    {error-message}
    ```

    **Recommendation**:
    {analysis of why fixes aren't working}
```

2. **Increment stuck_count** - This is critical for the --max-failures strategy:
```python
stuck_count += 1  # Next run will use --max-failures=(1 + stuck_count)
```

3. **Add to stuck_tests list** and continue to discover next failure.

### Step 7: Loop Back

After processing all new failures:

1. Increment `session.iteration`
2. Check if `iteration >= max_iterations` → Stop with summary
3. Check if `tickets.length >= max_tickets` → Stop with summary
4. Run `./scripts/run-tests.sh e2e` again
5. Parse failures, filter out stuck tests
6. If new failures exist → process them
7. If only stuck failures → **Done!**

## Output Format

### During Execution

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 tt-fix-tests: Starting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Configuration:
  Max iterations: 30
  Max tickets: 20
  Mode: Autonomous (no prompts)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Iteration 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running ./scripts/run-tests.sh e2e...

❌ 3 failures detected:
   1. approval.test.ts: should create approval
   2. tracking.test.ts: should send notification
   3. complex.spec.ts: should handle race condition

📋 Processing failure 1/3: should create approval
   Feature: photo-approval-workflow
   Creating ticket #142...
   Invoking /tt-work-ticket 142...

   [tt-work-ticket output]

   ✅ Fixed! (attempt 1/5)

📋 Processing failure 2/3: should send notification
   Feature: order-tracking-notifications
   Creating ticket #143...
   Invoking /tt-work-ticket 143...

   [tt-work-ticket output]

   ✅ Fixed! (attempt 1/5)

📋 Processing failure 3/3: should handle race condition
   Feature: photo-approval-workflow
   Creating ticket #144...
   Invoking /tt-work-ticket 144...

   [tt-work-ticket output]

   ⚠️ Still failing (attempt 1/5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Iteration 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running ./scripts/run-tests.sh e2e...

❌ 1 failure detected:
   1. complex.spec.ts: should handle race condition

📋 Processing failure 1/1: should handle race condition
   Ticket #144 exists (attempt 2/5)
   Invoking /tt-work-ticket 144...

   ⚠️ Still failing (attempt 2/5)

[... iterations 3-5 for this test ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Iteration 6
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running ./scripts/run-tests.sh e2e...

❌ 1 failure detected:
   1. complex.spec.ts: should handle race condition

⚠️ Test has reached 5 attempts - marking as STUCK
   Ticket #144 left in-progress
   Adding to allowed failures list

Running ./scripts/run-tests.sh e2e...
(allowing 1 stuck test to fail)

✅ All fixable tests passing!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Session Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Fixed: 2 tests
⚠️ Stuck: 1 test (requires manual review)

📋 Tickets:
  ✅ #142: approval mock setup (photo-approval-workflow) - DONE
  ✅ #143: notification timing (order-tracking-notifications) - DONE
  ⚠️ #144: race condition (photo-approval-workflow) - IN-PROGRESS (5 attempts)

🔗 Commits:
  abc1234 - fix(api): Add mock for approval service
  def5678 - fix(api): Fix notification timing

⚠️ Stuck Tests (require manual investigation):
  - complex.spec.ts: should handle race condition
    Ticket: #144
    Last error: timeout waiting for element
```

### Final Summary Variations

**All tests fixed**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Session Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 All tests passing!

📋 Summary:
   Iterations: 4
   Tickets created: 3
   Tickets fixed: 3

🔗 Commits:
   abc1234 - fix(api): Add mock for approval service
   def5678 - fix(api): Handle null approval token
   ghi9012 - fix(e2e): Increase timeout for approval page
```

**Max iterations reached**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Max Iterations Reached (30)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Progress made but some tests still failing.

📋 Summary:
   Iterations: 30
   Tickets created: 8
   Tickets fixed: 5
   Tickets stuck: 3

⚠️ Remaining failures (in-progress tickets):
   - #145: tests/e2e/complex.spec.ts (5 attempts)
   - #146: packages/api/tests/services/race.test.ts (4 attempts)
   - #147: tests/e2e/timing.spec.ts (3 attempts)

Recommendation:
  Review stuck tickets for common patterns.
  Re-run /tt-fix-tests to continue attempts.
```

**Max tickets reached**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Too Many Failures
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created 20 bug tickets - stopping to prevent overflow.

This may indicate:
  - A fundamental issue affecting many tests
  - Missing test setup or fixtures
  - Environment configuration problem

Recommendation:
  1. Review created tickets for common patterns
  2. Fix any infrastructure issues first
  3. Re-run /tt-fix-tests after addressing root causes
```

## Integration with tt-work-ticket

```
tt-fix-tests (orchestrator)
    │
    ├── Runs: ./scripts/run-tests.sh e2e
    │
    ├── Parses: ALL failures from output
    │
    ├── Tracks: attempts per test, stuck tests
    │
    ├── Creates tickets via: mcp__ticketrack__createTicket
    │
    └── Delegates fixes to: /tt-work-ticket {ticket-id}
                                │
                                ├── Gathers context
                                ├── Analyzes failure
                                ├── Implements fix
                                ├── Runs verification
                                ├── Commits (if fixed)
                                └── Updates ticket status
```

## Key Differences from Original Design

| Aspect | Original | Revised |
|--------|----------|---------|
| Stop on failure | Run all tests | `--max-failures=1+stuck_count` |
| User prompts | Asked for feature if unknown | Only if truly blocked |
| Max attempts | 3 | 5 |
| On stuck test | Skip and stop | Mark stuck, increment allowed failures |
| Test run scope | Run all, parse all | Stop early, fix one at a time |
| Allowed failures | None | Dynamic: 1 + stuck_count |

## Notes

- **Autonomous execution**: Runs continuously like tt-implement-feature
- **One failure at a time**: Uses `--max-failures` for efficient fix loops
- **Stuck tests tracked**: After 5 attempts, allows test to fail via incremented max-failures
- **Feature linking**: Bugs properly associated with features
- **No user prompts**: Only stops for genuine blockers
- **Resumable**: Re-running continues where left off (tickets persist)
