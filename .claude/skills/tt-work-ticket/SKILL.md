---
name: tt-work-ticket
description: Work on a single ticket with full context. Use when user wants to start or continue work on a specific ticket.
allowed-tools:
  - mcp__ticketrack__showTicketDetails
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-work-ticket - Single Ticket Implementation

Loads full context for a ticket and prepares for implementation.

## Arguments

```
$ARGUMENTS: <ticket-number>
```

- `ticket-number`: The ticket ID to work on (just the number, without #)

**Example**: `/tt-work-ticket 45`

## Workflow

### Step 1: Fetch Ticket Details

```
mcp__ticketrack__showTicketDetails:
  ticketId: {ticket-number}
```

Extract:
- Title
- Description
- Labels
- Status
- Feature name
- blocked_by (dependencies)
- blocks (dependents)

### Step 2: Check Dependencies

If ticket has `blocked_by` entries:

1. Fetch each blocking ticket's status
2. If any are not done, warn the user

```
⚠️ Ticket #{id} is blocked by:
  - #{blocking-id}: {title} (status: {status})

Consider completing blockers first, or proceed if you understand the dependency.
```

If all blockers are done, proceed normally.

### Step 3: Fetch Parent Feature

Get the feature this ticket belongs to:

```
mcp__ticketrack__listFeatures
```

Find the feature and extract:
- Feature description
- Implementation plan (if present)
- Related context

### Step 4: Gather Relevant File Context

Based on ticket labels, dynamically discover relevant files. Do NOT assume specific paths.

**For `database` / `schema` labels**:
```
Glob: **/schema/*.{ts,js,prisma}, **/models/*.{ts,js,py}
Grep: "createTable", "Schema", "@Entity", "model"
Read: Discovered schema files
```

**For `backend` / `api` labels**:
```
Glob: **/routes/**/*.{ts,js}, **/api/**/*.{ts,js}
Glob: **/services/**/*.{ts,js}, **/controllers/**/*.{ts,js}
Read: Discovered route and service files
```

**For `frontend` / `ui` labels**:
```
Glob: **/components/**/*.{tsx,jsx,vue,svelte}
Glob: **/pages/**/*.{tsx,jsx}, **/app/**/*.{tsx,jsx}
Read: Discovered component files
```

**For `tests` labels**:
```
Glob: **/*.test.{ts,js}, **/*.spec.{ts,js}
Glob: **/__tests__/**/*.{ts,js}
Read: Related test files
```

Use Task tool with Explore agent for deeper analysis if needed.

### Step 5: Update Ticket Status

If ticket is in `todo` status, update to `in-progress`:

```
mcp__ticketrack__updateTicketStatus:
  ticketId: {ticket-number}
  status: "in-progress"
```

### Step 6: Display Implementation Context

Present all gathered information in a structured format for implementation.

## Output Format

```
🎫 Working on Ticket #{id}

📋 {title}

Status: {status} → in-progress
Feature: {feature-name}
Labels: [{labels}]

📝 Description:
{ticket description}

✅ Acceptance Criteria:
- [ ] {criterion 1}
- [ ] {criterion 2}
- [ ] {criterion 3}

🔗 Dependencies:
  Blocked by: {list or "None"}
  Blocks: {list or "None"}

📁 Relevant Files:
  {list of files identified for this ticket}

📖 Feature Context:
{Brief summary of feature and where this ticket fits}

🧭 Implementation Approach:
{Based on ticket type and codebase patterns, suggest approach}

---

Ready to implement. What would you like to do?
1. Start implementing (I'll guide you through)
2. See more file context
3. Check related tickets
```

## Implementation Guidance by Label

**Note**: Paths are discovered dynamically from the project structure. The examples below are generic patterns.

### Testing Strategy (Per Ticket)

| Ticket Type | Test Types | Location | Tool |
|-------------|------------|----------|------|
| Database/Schema | Schema validation, type inference | Discover from project | Project's test runner |
| Backend/API | Route tests, service unit tests | Discover from project | Project's test runner |
| Frontend/UI | Component tests (if complex), hook tests | Discover from project | Project's test runner |

**E2E tests are NOT per-ticket** - they're created at feature completion by `/tt-implement-feature`.

### Database/Schema Tickets

```
Implementation:
1. Find existing schema location (discovered in Step 4)
2. Create/modify schema following project patterns
3. Update any index/barrel exports
4. Run migrations if applicable (check project for migration commands)

Tests to write:
- Schema table existence tests
- Column type validation tests
- Relation/foreign key tests
- Type inference tests

Test location: Discover from project's existing test structure
```

### Backend/API Tickets

```
Implementation:
1. Find existing service/route location (discovered in Step 4)
2. Create service functions following project patterns
3. Add routes following existing route patterns
4. Add validation using project's validation approach

Tests to write:
- Service function unit tests (mock database)
- Route integration tests (HTTP request/response)
- Validation tests (valid/invalid inputs)
- Auth/permission tests (if protected route)

Test location: Discover from project's existing test structure
```

### Frontend/UI Tickets

```
Implementation:
1. Find existing component location (discovered in Step 4)
2. Create components following project patterns
3. Add pages/routes as needed
4. Integrate with API using project's data fetching approach

Tests to write (for complex components only):
- Component render tests
- User interaction tests
- State management hook tests

Test location: Discover from project's existing test structure

Note: Simple presentational components don't need tests.
E2E tests will cover page-level testing at feature completion.
```

**Important**: Unit/integration tests are per-ticket. E2E tests are per-feature.

## During Implementation: Document Design Decisions

As you implement, add ticket comments for significant decisions:

```
mcp__ticketrack__addComment:
  ticketId: {ticket-number}
  comment: |
    **Design Decision**: {decision title}

    Options considered:
    - Option A: {description} - {pros/cons}
    - Option B: {description} - {pros/cons}

    Chosen: Option {X} because {reasoning}
```

### For Bug Tickets

When working on bug tickets, document the root cause:

```
mcp__ticketrack__addComment:
  ticketId: {ticket-number}
  comment: |
    **Root Cause Analysis**:

    The bug was caused by: {explanation}

    Location: `{file:line}`

    What happened:
    - {sequence of events leading to bug}

    Fix approach:
    - {how the fix addresses the root cause}
```

## After Implementation: Commit Per-Ticket

**IMPORTANT**: Every ticket gets its own commit. This ensures clean git history and easy rollbacks.

### Step 7: Verify and Test

```
1. Discover project's test command (from package.json, Makefile, etc.)
2. Run relevant tests for changed files
3. Run build/type-check command to verify compilation
4. Fix any issues before committing
```

### Step 8: Commit the Ticket Work

Create a focused commit for this ticket's changes only:

```bash
# Stage only files related to THIS ticket
git add {specific-files}

# Commit with ticket reference
git commit -m "feat({scope}): {brief description}

{Detailed explanation of what was done}

Implements #{ticket-number}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Commit Message Guidelines**:
- Use conventional commits: `feat`, `fix`, `refactor`, `test`, `docs`
- Scope should match the ticket area (schema, api, ui, etc.)
- Reference the ticket number with `Implements #XX` or `Fixes #XX`
- Keep first line under 72 characters

### Step 9: Update Ticket with Completion Info

**⚠️ CRITICAL: This step has TWO required actions. Do NOT skip the completion comment.**

After committing, you MUST complete this checklist:

```
┌─────────────────────────────────────────────────────────────┐
│  POST-COMMIT CHECKLIST (both required!)                     │
├─────────────────────────────────────────────────────────────┤
│  [ ] 1. Update ticket status to "done"                      │
│  [ ] 2. Add completion comment with commit info             │
└─────────────────────────────────────────────────────────────┘
```

**Action 1: Update Status**
```
mcp__ticketrack__updateTicketStatus:
  ticketNumber: {ticket-number}
  newStatus: "done"
```

**Action 2: Add Completion Comment** (DO NOT SKIP!)
```
mcp__ticketrack__addComment:
  ticketNumber: {ticket-number}
  comment: |
    ✅ **Completed**

    **Commit**: `{commit-hash}` - {commit-subject}

    **Files Changed**:
    - `{file1}` - {brief description}
    - `{file2}` - {brief description}

    **Summary**:
    {What was implemented and how it satisfies the acceptance criteria}

    **Tests Added**:
    - {test-file}: {what it tests}
```

**Why both are required**: The status update tracks progress, but the completion comment provides audit trail, links commits to tickets, and documents what was actually done. Without the comment, tickets lose traceability.

## Complete Ticket Workflow Summary

```
1. Fetch ticket details → understand scope
2. Check dependencies → ensure no blockers
3. Fetch feature context → understand the bigger picture
4. Gather file context → know what exists
5. Update status to in-progress
6. IMPLEMENT with documentation:
   - Add design decision comments as you go
   - For bugs: document root cause
7. VERIFY:
   - Run tests
   - Check build
8. COMMIT (per-ticket!):
   - Stage relevant files only
   - Write descriptive commit message
   - Reference ticket number
9. UPDATE ticket (⚠️ BOTH required!):
   - [ ] Mark as done (updateTicketStatus)
   - [ ] Add completion comment with commit info (addComment)
```

## Error Handling

- **Ticket not found**: "Ticket #{id} not found. Use /tt-feature-status to see available tickets."
- **Blocked ticket**: Show warning but allow proceeding
- **No feature**: "Ticket #{id} is not associated with a feature. Showing ticket details only."
