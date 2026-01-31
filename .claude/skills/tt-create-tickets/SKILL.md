---
name: tt-create-tickets
description: Create tickets from a feature's implementation plan. Use when a feature has a plan but no tickets yet.
allowed-tools:
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__bulkCreateTickets
  - mcp__ticketrack__manageTicketDependencies
  - Read
---

# /tt-create-tickets - Ticket Creation from Plan

Creates ticketrack tickets from a feature's implementation plan.

## Arguments

```
$ARGUMENTS: <feature-name>
```

- `feature-name`: Name of the feature with an implementation plan

**Example**: `/tt-create-tickets user-reviews`

## Workflow

### Step 1: Fetch Feature and Plan

1. Use `mcp__ticketrack__listFeatures` to get the feature
2. Extract the implementation plan from the description
3. Look for "## Implementation Plan" section

If no plan found: "Feature '{name}' has no implementation plan. Run /tt-plan-feature {name} first."

### Step 2: Check Existing Tickets

Use `mcp__ticketrack__listTickets` with feature filter to check for existing tickets.

If tickets exist, ask: "Feature already has {N} tickets. Create additional tickets from plan?"

### Step 3: Parse Implementation Plan

Extract tasks from the plan. Look for:
- Checkbox items: `- [ ] Task description`
- Phase headers: `### Phase N: Name`

Build a structured list:
```
[
  { phase: "Phase 1: Database Schema", tasks: ["Task 1", "Task 2"] },
  { phase: "Phase 2: Backend API", tasks: ["Task 1", "Task 2"] },
  ...
]
```

### Step 4: Map Tasks to Tickets

For each task, create a ticket object:

**Ticket Title Format**: `{Phase Name} - {Task Description}`

**Labels by Phase**:
| Phase Contains | Labels |
|----------------|--------|
| Database/Schema | `database`, `schema` |
| Backend/API | `backend`, `api` |
| Frontend/UI/Component | `frontend`, `ui` |
| Integration | `integration` |
| Documentation | `docs` |

**Note**: Tests are part of each ticket, not separate testing tickets. Do not create separate tickets for testing phases.

**Priority Mapping**:
- Phase 1 tasks: `high` (foundational)
- Phase 2-3 tasks: `medium`
- Phase 4+ tasks: `low`

**Description Template**:
```markdown
## Task
{Task description from plan}

## Context
Part of feature: {feature-name}
Phase: {phase-name}

## Testing Requirements
{Based on phase - see Testing by Phase below}

## Acceptance Criteria
- [ ] Implementation complete
- [ ] Unit/integration tests written (see Testing Requirements)
- [ ] All tests passing
- [ ] Code reviewed
```

**Testing by Phase** (include in ticket description):
| Phase | Tests Required |
|-------|----------------|
| Database/Schema | Schema validation tests, type inference tests |
| Backend/API | Route tests, service unit tests, validation tests |
| Frontend/UI | Component tests (complex only), hook tests |

**Note**: E2E tests are NOT created as tickets. They're added at feature completion by `/tt-implement-feature`.

### Step 5: Set Dependencies

Determine dependencies based on phase order:

```
Phase 1 tickets: No dependencies
Phase 2 tickets: Blocked by Phase 1 tickets
Phase 3 tickets: Blocked by Phase 2 tickets
```

Within phases, tickets are generally independent unless task description indicates otherwise.

**Note**: Since tests are now part of each ticket (not separate testing tickets), there's no separate testing phase to manage dependencies for.

### Step 6: Create Tickets

**IMPORTANT**: Create tickets in batches of **maximum 5 tickets per API call** to avoid connection timeouts with long payloads.

Use `mcp__ticketrack__bulkCreateTickets` in batches:

```
# Batch 1: First 5 tickets
mcp__ticketrack__bulkCreateTickets:
  tickets:
    - title: "Database Schema - Create reviews table"
      description: "..."
      featureName: "{feature-name}"
      labels: ["database", "schema"]
      priority: "high"
    # ... up to 5 tickets max

# Batch 2: Next 5 tickets
mcp__ticketrack__bulkCreateTickets:
  tickets:
    - title: "Backend API - Review service functions"
      description: "..."
      featureName: "{feature-name}"
      labels: ["backend", "api"]
      priority: "medium"
    # ... up to 5 tickets max

# Continue with additional batches as needed...
```

**Batching Strategy**:
- Split all tickets into groups of 5 or fewer
- Process each batch sequentially (wait for one to complete before starting next)
- Keep ticket descriptions concise to minimize payload size
- If a batch fails, retry that batch before continuing

### Step 7: Display Results

Show created tickets with their relationships.

## Output Format

```
🎫 Tickets Created for '{feature-name}'

Phase 1: Database Schema
  #{id} - {title} [database, schema] (includes tests)

Phase 2: Backend API
  #{id} - {title} [backend, api] ← blocked by #{phase1-ids} (includes tests)

Phase 3: Frontend
  #{id} - {title} [frontend, ui] ← blocked by #{phase2-ids} (includes tests)

📊 Summary:
  - Total tickets: {count}
  - Ready to start: {count} (Phase 1 tickets)
  - Blocked: {count}
  - Note: Each ticket includes writing tests

🚀 Next Steps:
  - View status: /tt-feature-status {feature-name}
  - Start first ticket: /tt-work-ticket {first-ticket-id}
  - Auto-implement all: /tt-implement-feature {feature-name}
```

## Error Handling

- **No plan**: "Feature has no implementation plan. Use /tt-plan-feature first."
- **Parse failure**: "Could not parse implementation plan. Ensure it uses '- [ ] task' format."
- **Bulk create failure**: Report which tickets failed and why.
- **Connection timeout**: If MCP connection closes during bulk create, tickets may have been created despite no response. Check `mcp__ticketrack__listTickets` before retrying to avoid duplicates. Delete any duplicates by removing their YAML files from `plan/tracker-data/todo/feature-{name}/`.
