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
| Database/Schema | Schema validation, type inference | `packages/api/tests/database/` | Vitest |
| Backend/API | Route tests, service unit tests | `packages/api/tests/routes/` | Vitest + supertest |
| Frontend/UI | Component tests (if complex), hook tests | `packages/web/tests/` | Vitest + Testing Library |

**E2E tests are NOT per-ticket** - they're created at feature completion by `/tt-implement-feature`.

### Database/Schema Tickets

```
Implementation:
1. Find existing schema location (discovered in Step 4)
2. Create/modify schema following project patterns
3. Update any index/barrel exports
4. Run migrations if applicable (check package.json for migration commands)

Tests to write:
- Schema table existence tests
- Column type validation tests
- Relation/foreign key tests
- Type inference tests ($inferSelect, $inferInsert)

Example test location: packages/api/tests/database/{feature}.test.ts
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

Example test location: packages/api/tests/routes/{feature}.test.ts
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
- Hook tests (TanStack Query, Zustand stores)

Example test location: packages/web/tests/components/{feature}.test.tsx

Note: Simple presentational components don't need tests.
E2E tests will cover page-level testing at feature completion.
```

**Important**: Unit/integration tests are per-ticket. E2E tests are per-feature.

## After Implementation

When implementation is complete, remind the user:

```
✅ Implementation looks complete!

Next steps:
1. Run tests to verify: pnpm test
2. Commit your changes
3. Mark ticket done: The skill will offer to update status

Update status now? (y/n)
```

If yes:
```
mcp__ticketrack__updateTicketStatus:
  ticketId: {ticket-number}
  status: "done"

mcp__ticketrack__addComment:
  ticketId: {ticket-number}
  comment: "Completed. Commit: {commit-hash if available}"
```

## Error Handling

- **Ticket not found**: "Ticket #{id} not found. Use /tt-feature-status to see available tickets."
- **Blocked ticket**: Show warning but allow proceeding
- **No feature**: "Ticket #{id} is not associated with a feature. Showing ticket details only."
