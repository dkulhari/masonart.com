---
name: tt-implement-feature
description: Deliver an entire feature by iterating through all tickets. Use when user wants to implement a complete feature automatically.
allowed-tools:
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__showTicketDetails
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---

# /tt-implement-feature - Full Feature Delivery

Delivers an entire feature by automatically implementing all tickets in order.

## Relationship to tt-work-ticket

This skill **delegates to tt-work-ticket** for per-ticket operations:

| Operation | Source |
|-----------|--------|
| File context gathering | → tt-work-ticket Step 4 |
| Implementation guidance | → tt-work-ticket "Implementation Guidance by Label" |
| Testing requirements | → tt-work-ticket "Testing Strategy (Per Ticket)" |
| Design decision docs | → tt-work-ticket "During Implementation" |
| Bug root cause docs | → tt-work-ticket "For Bug Tickets" |
| Per-ticket commits | → tt-work-ticket Steps 7-9 |

**tt-work-ticket is the source of truth** for these patterns. This skill adds:
- Automated looping through all tickets
- No user prompts (continuous execution)
- E2E tests at feature completion

## Arguments

```
$ARGUMENTS: <feature-name>
```

- `feature-name`: Name of the feature to implement

**Example**: `/tt-implement-feature user-reviews`

## Workflow Overview

```
┌─────────────────────────────────────────────┐
│  Fetch feature and tickets                  │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  Determine ticket order from plan           │
└──────────────────┬──────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│  FOR EACH pending ticket:                    │
│    ├─ Check dependencies → skip if blocked   │
│    ├─ Load ticket context                    │
│    ├─ Implement (code changes)               │
│    ├─ Run tests                              │
│    ├─ Commit changes                         │
│    └─ Mark ticket done                       │
└──────────────────┬───────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  Feature complete! Display summary          │
└─────────────────────────────────────────────┘
```

## Detailed Workflow

### Step 1: Fetch Feature

```
mcp__ticketrack__listFeatures
```

Find the feature and extract:
- Feature description
- Implementation plan

If feature not found: "Feature '{name}' not found."

### Step 2: Fetch All Tickets

```
mcp__ticketrack__listTickets:
  featureName: {feature-name}
```

Get all tickets for the feature.

If no tickets: "Feature has no tickets. Run /tt-create-tickets {name} first."

### Step 3: Determine Ticket Order

Parse the implementation plan to determine phase order.

**Ordering Rules**:
1. Phase 1 (Database) tickets first
2. Phase 2 (Backend) tickets second
3. Phase 3 (Frontend) tickets third
4. Phase 4 (Testing) tickets last
5. Within phases, respect `blocked_by` relationships
6. If no plan, order by: priority (high→low), then ticket ID

Create ordered list of ticket IDs to process.

### Step 4: Filter to Pending Tickets

Remove tickets that are already `done` or `in-progress`.

If all done: "All tickets for '{name}' are complete! 🎉"

### Step 5: Implementation Loop

For each pending ticket in order:

#### 5a. Check Dependencies

```
If ticket.blocked_by contains any non-done tickets:
  Skip ticket, add to "skipped" list
  Continue to next ticket
```

#### 5b. Announce Ticket

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 Implementing Ticket #{id}: {title}
Progress: {current}/{total} ({percentage}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 5c. Update Status to In-Progress

```
mcp__ticketrack__updateTicketStatus:
  ticketId: {id}
  status: "in-progress"
```

#### 5d. Load Context

**→ Follow `/tt-work-ticket` Step 4: Gather Relevant File Context**

Use the exact patterns defined in tt-work-ticket's Step 4 based on ticket labels.
Do NOT duplicate those patterns here - refer to tt-work-ticket as the source of truth.

The key difference: tt-implement-feature doesn't pause for user input after gathering context.

#### 5e. Implement

**→ Follow `/tt-work-ticket` Implementation Guidance by Label**

Use the implementation steps and testing requirements defined in tt-work-ticket's
"Implementation Guidance by Label" section for:
- Database/Schema tickets
- Backend/API tickets
- Frontend/UI tickets

Also follow tt-work-ticket's "Testing Strategy (Per Ticket)" table for test requirements.

Do NOT duplicate those patterns here - tt-work-ticket is the source of truth.

**Key differences from tt-work-ticket:**
1. No pause for user input - proceed directly to implementation
2. Continue to next ticket after completion

Use Edit, Write, and other tools to make changes.

#### 5f. Document Design Decisions

**→ Follow `/tt-work-ticket` "During Implementation: Document Design Decisions"**

For significant decisions during implementation:
```
mcp__ticketrack__addComment:
  ticketId: {id}
  comment: |
    **Design Decision**: {title}
    Chose {approach} because {reasoning}
```

**For Bug Tickets** (if ticket type is `bug`):

**→ Follow `/tt-work-ticket` "For Bug Tickets"**

Document the root cause before fixing:
```
mcp__ticketrack__addComment:
  ticketId: {id}
  comment: |
    **Root Cause**: {what caused the bug}
    **Location**: `{file:line}`
    **Fix**: {how it was fixed}
```

#### 5g. Verify

**→ Follow `/tt-work-ticket` Step 7: Verify and Test**

Discover and run the project's build/test commands:

1. **Detect build system** from project files (package.json, Makefile, Cargo.toml, etc.)
2. **Run tests** for changed files using the project's test runner
3. **Run build** to verify compilation/type-checking passes

If tests fail:
- Attempt to fix
- If unable to fix after 2 attempts, pause and report

#### 5h. Commit (Per-Ticket)

**→ Follow `/tt-work-ticket` Step 8: Commit the Ticket Work**

**IMPORTANT**: Stage ONLY files related to THIS ticket, not all changes.

```bash
# Stage specific files (NOT git add .)
git add {specific-files-for-this-ticket}

# Commit with conventional format and ticket reference
git commit -m "{type}({scope}): {brief description}

{Detailed explanation of changes}

Implements #{ticket-id} for {feature-name}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Commit Types**:
- `feat`: New feature/functionality
- `fix`: Bug fix
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `docs`: Documentation changes

**Scope**: Match ticket area (schema, api, ui, service, etc.)

#### 5i. Update Ticket with Completion Info

**→ Follow `/tt-work-ticket` Step 9: Update Ticket**

```
mcp__ticketrack__updateTicketStatus:
  ticketId: {id}
  status: "done"

mcp__ticketrack__addComment:
  ticketId: {id}
  comment: |
    ✅ **Completed**

    **Commit**: `{commit-hash}` - {commit-subject}

    **Files Changed**:
    - `{file1}` - {description}
    - `{file2}` - {description}

    **Summary**:
    {What was implemented and how}

    **Tests**:
    - {test-file}: {what it tests}
```

#### 5j. Progress Update

```
✅ Ticket #{id} complete
   Commit: {short-hash} - {commit-message}
   Files: +{additions} -{deletions}
```

### Step 6: E2E Tests (Feature Level)

After all tickets are implemented, create E2E tests for the feature:

**6a. Identify E2E Test Needs**

Based on the feature, determine what E2E tests are needed:
- **New pages**: Create page-level E2E tests (`tests/e2e/{feature}.spec.ts`)
- **User flows**: Create flow tests (`tests/e2e/flows/{feature}.spec.ts`)
- **Manual test docs**: Create documentation (`docs/manual-tests/{feature}.md`)

**6b. Create E2E Tests**

```typescript
// tests/e2e/{feature}.spec.ts
import { test, expect } from '@playwright/test';

test.describe('{Feature Name}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/{feature-path}', { waitUntil: 'networkidle' });
  });

  test('should display {main element}', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  // Add tests for key user interactions
});
```

**6c. Create Flow Tests (if applicable)**

For features with multi-step user journeys:
```typescript
// tests/e2e/flows/{feature}.spec.ts
test.describe('{Feature} Flow', () => {
  test('should complete {journey name}', async ({ page }) => {
    // Step 1: Start
    // Step 2: Action
    // Step 3: Verify result
  });
});
```

**6d. Run E2E Tests**

```bash
bunx playwright test tests/e2e/{feature}.spec.ts
```

**6e. Commit E2E Tests**

```bash
git add tests/e2e/
git commit -m "test(e2e): Add E2E tests for {feature-name}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Step 7: Handle Completion

After processing all tickets and E2E tests:

**If all done**:
```
🎉 Feature '{name}' fully implemented!

📊 Summary:
  - Tickets completed: {count}
  - Commits made: {count}
  - Files changed: {count}

📋 Commits:
  {hash} - {message}
  {hash} - {message}
  ...

🧪 Tests:
  - Unit/Integration tests: Added per ticket
  - E2E tests: tests/e2e/{feature}.spec.ts

✅ All tests passing
```

**If some skipped**:
```
⚠️ Feature '{name}' partially implemented

Completed: {count} tickets
Skipped (blocked): {count} tickets

Skipped tickets:
  #{id} - {title} (blocked by #{blocker-ids})

These tickets have unmet dependencies.
Either the blocking tickets need to be completed manually,
or there may be a circular dependency issue.
```

## Interruption Handling

If interrupted (user cancels, error occurs):

1. Current ticket stays `in-progress`
2. Progress is preserved (completed tickets stay done)
3. Resume by running `/tt-implement-feature {name}` again
   - Will skip completed tickets
   - Will resume from next pending ticket

## Safety Checks

Before making changes:
- Verify we're on a feature branch (warn if on main)
- Check for uncommitted changes (warn if dirty)
- Confirm with user before starting if there are concerns

```
⚠️ Safety Check:
- Currently on branch: main (consider creating feature branch)
- Uncommitted changes: 3 files

Proceed anyway? (y/n)
```

## Output Format

### During Implementation

```
🚀 Implementing Feature: {name}

📋 Tickets to implement: {count}
   ✅ Already done: {count}
   📋 To do: {count}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 Implementing Ticket #45: Database Schema - Reviews Table
Progress: 1/6 (17%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{Implementation details}

✅ Ticket #45 complete
   Commit: abc123
   Files: {path-to-changed-file} (+45)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 Implementing Ticket #46: Backend API - Review Service
Progress: 2/6 (33%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{... continues for each ticket ...}
```

### Final Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 FEATURE COMPLETE: {name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Implementation Summary:
  - Tickets completed: 6
  - Total commits: 6
  - Files created: 8
  - Files modified: 4
  - Tests added: 12

📋 Commit Log:
  abc123 - Database Schema - Reviews Table
  def456 - Backend API - Review Service
  ghi789 - Backend API - Review Routes
  jkl012 - Frontend - Review Components
  mno345 - Frontend - Product Reviews Page
  pqr678 - Testing - Review Feature Tests

🧪 All tests passing ✅

🚀 Next Steps:
  - Review changes: git log --oneline -6
  - Push to remote: git push
  - Create PR: gh pr create
```

## Error Handling

- **Feature not found**: "Feature '{name}' not found."
- **No tickets**: "Feature has no tickets. Run /tt-create-tickets first."
- **Build failure**: Attempt fix, report if unable
- **Test failure**: Attempt fix, pause if unable after 2 attempts
- **Circular dependency**: Report the cycle and ask for guidance
