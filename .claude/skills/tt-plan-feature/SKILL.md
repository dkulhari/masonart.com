---
name: tt-plan-feature
description: Generate an implementation plan for an existing feature and create tickets. Use when a feature exists but needs a detailed plan.
allowed-tools:
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__editFeature
  - mcp__ticketrack__showTicketDetails
  - mcp__ticketrack__bulkCreateTickets
  - mcp__ticketrack__manageTicketDependencies
  - mcp__ticketrack__updateFeaturePlan
  - mcp__ticketrack__updateFeatureReview
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-plan-feature - Implementation Plan + Ticket Creation

Generates a detailed implementation plan with bite-sized TDD steps and creates tickets in one flow. Replaces the separate tt-plan-feature + tt-create-tickets workflow.

**Absorbs**: `superpowers:writing-plans`, `tt-create-tickets`

## Arguments

```
$ARGUMENTS: <feature-name>
```

- `feature-name`: Name of the existing feature to plan

**Example**: `/tt-plan-feature user-reviews`

## Core Principles

### Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

### DRY, YAGNI, TDD, Frequent Commits

Write plans assuming the implementer has zero context for the codebase. Document everything: which files to touch, exact code, exact test commands, expected output. Give them the whole plan as bite-sized tasks.

## Workflow

### Step 1: Fetch Feature

1. Use `mcp__ticketrack__listFeatures` to find the feature
2. Verify the feature exists
3. Read the feature description (which contains the approved design from tt-new-feature)
4. Check if it already has an implementation plan (look for "## Implementation Plan" in description)

If feature has a plan, ask: "Feature already has a plan. Do you want to regenerate it?"
If no plan and no design section, warn: "No design found. Consider running /tt-new-feature first."

### Step 2: Analyze Feature Requirements

Parse the feature description to understand:
- Core functionality needed
- Design decisions already made
- Scope boundaries (in scope / out of scope)
- Technical considerations

### Step 3: Discover Project Structure

Dynamically detect the project's architecture. Do NOT assume specific paths.

**Step 3a: Detect Project Type**
```
Glob: package.json, pnpm-workspace.yaml, Cargo.toml, go.mod, requirements.txt
Glob: next.config.*, vite.config.*, angular.json
```

**Step 3b: Find Database Layer**
```
Glob: **/schema.{ts,js,prisma}, **/models/*.{ts,js,py}
Glob: **/migrations/**, **/drizzle/**, **/prisma/**
Grep: "createTable", "Schema", "model", "@Entity"
```

**Step 3c: Find API/Backend Layer**
```
Glob: **/routes/**/*.{ts,js}, **/api/**/*.{ts,js}
Glob: **/controllers/**/*.{ts,js}, **/handlers/**/*.{ts,js}
```

**Step 3d: Find Frontend Layer**
```
Glob: **/components/**/*.{tsx,jsx,vue,svelte}
Glob: **/pages/**/*.{tsx,jsx}, **/app/**/*.{tsx,jsx}
```

**Step 3e: Find Test Patterns**
```
Glob: **/*.test.{ts,js}, **/*.spec.{ts,js}
Glob: **/tests/**/*.{ts,js}, **/__tests__/**/*.{ts,js}
```

**Step 3f: Read Representative Files**

Read 1-2 files from each discovered layer to understand:
- Naming conventions
- Code patterns
- Framework-specific idioms
- Test runner and assertion library

### Step 4: Generate Implementation Plan

Create a phased plan based on feature requirements AND the discovered project structure.

**Adapt phases to the project** — only include relevant phases (skip "Frontend" for backend-only, etc.).

**Plan Template** (adapt based on project):

```markdown
## Implementation Plan

**Note**: Each task uses TDD. Steps include exact code, file paths, and test commands.

### Phase 1: {Layer Name - e.g., "Database Schema"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ tests)
- [ ] {Specific task 2} (+ tests)

### Phase 2: {Layer Name - e.g., "Backend API"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ tests)
- [ ] {Specific task 2} (+ tests)

### Phase 3: {Layer Name - e.g., "Frontend UI"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ component tests if complex)
- [ ] {Specific task 2} (+ component tests if complex)

### Final Phase: E2E Tests
Location: {e2e test path}
- [ ] Page-level E2E tests
- [ ] Flow tests for user journeys

## Technical Notes
- Project type: {detected}
- Key frameworks: {detected}
- Patterns to follow: {observed}
```

### Step 5: Generate Ticket Data with Structured TDD Steps

For each task in the plan, generate TWO things:

1. **A concise ticket description** (task context only, NO implementation steps markdown)
2. **A structured `implementation_steps` array** (JSON objects for the TDD workflow)

#### Ticket Description (simplified)

The description should contain ONLY task context — NOT step-by-step instructions. Steps go in the structured field.

````markdown
## Task
{Task description — what needs to be done and why}

## Context
Part of feature: {feature-name}
Phase: {phase-name}
{Any additional context: relevant files, patterns to follow, constraints}
````

**Do NOT include `## Implementation Steps` markdown in the description.** The structured `implementation_steps` field replaces it.

#### Structured Implementation Steps

Generate a JSON array of step objects following the `ImplementationStep` type:

```json
[
  {
    "id": 1,
    "action": "write-test",
    "description": "Write failing test for {behavior}",
    "file": "{exact/path/to/test.ts}",
    "command": "{exact test command}",
    "expected_result": "FAIL",
    "status": "pending",
    "code": "{complete test code}"
  },
  {
    "id": 2,
    "action": "verify-fail",
    "description": "Confirm test fails",
    "command": "{exact test command}",
    "expected_result": "FAIL - {expected failure reason}",
    "status": "pending"
  },
  {
    "id": 3,
    "action": "implement",
    "description": "{Implementation description}",
    "file": "{exact/path/to/file.ts}",
    "status": "pending",
    "code": "{complete implementation code}"
  },
  {
    "id": 4,
    "action": "verify-pass",
    "description": "Confirm test passes",
    "command": "{exact test command}",
    "expected_result": "PASS",
    "status": "pending"
  },
  {
    "id": 5,
    "action": "refactor",
    "description": "{Optional cleanup if needed}",
    "command": "{test command}",
    "expected_result": "PASS",
    "status": "pending"
  },
  {
    "id": 6,
    "action": "commit",
    "description": "Commit changes",
    "command": "git add {files} && git commit -m \"{message} (#{ticket-number})\"",
    "status": "pending"
  }
]
```

**Valid actions**: `write-test`, `verify-fail`, `implement`, `verify-pass`, `refactor`, `commit`
**All statuses**: Set to `"pending"` at creation time

**Guidelines for step generation**:
- **Exact file paths** — always
- **Complete code** — not "add validation" but the actual validation code
- **Exact commands** — with expected output
- **One behavior per TDD cycle** — red/green/refactor/commit
- **DRY** — don't repeat code that already exists
- **YAGNI** — don't add features not in the design

### Step 6: Review Plan with User

Present the generated plan showing:
- Phase breakdown
- Ticket count per phase
- A sample ticket's TDD steps (so user can see the granularity)

Use `AskUserQuestion`: "Does this plan look right?" — Options: "Looks good", "Needs adjustments"

If adjustments needed, ask what to change and regenerate affected parts.

### Step 7: Update Feature Description

Store the plan in the feature description:

```
mcp__ticketrack__editFeature:
  featureName: {feature-name}
  description: {original description + implementation plan}
```

### Step 7b: Store Structured Plan

After updating the description, also store the plan as structured data using `updateFeaturePlan`. This enables programmatic access to plan phases and ticket mappings.

```
mcp__ticketrack__updateFeaturePlan:
  featureName: {feature-name}
  phases: '[{"name":"Phase 1 Name","location":"path/to/layer","tickets":[...]},{"name":"Phase 2 Name","location":"path/to/layer","tickets":[...]}]'
```

Each phase entry maps to the tickets created in Step 8. After tickets are created, update the plan with actual ticket numbers:

```
mcp__ticketrack__updateFeaturePlan:
  featureName: {feature-name}
  phases: '[{"name":"Database Schema","location":"packages/shared/src","tickets":[101,102]},{"name":"Backend API","location":"packages/api/src","tickets":[103,104]}]'
```

Optionally, set the feature review to `pending` to mark it as ready for review:

```
mcp__ticketrack__updateFeatureReview:
  featureName: {feature-name}
  status: pending
```

### Step 8: Create Tickets

Create tickets from the plan, grouping by phase.

**IMPORTANT**: Create in batches of **maximum 5 tickets per API call** to avoid timeouts.

**Ticket Title Format**: `{Phase Name} - {Task Description}`

**Labels by Phase**:
| Phase Contains | Labels |
|----------------|--------|
| Database/Schema | `database`, `schema` |
| Backend/API | `backend`, `api` |
| Frontend/UI | `frontend`, `ui` |
| Skills | `skills` |
| E2E Tests | `testing`, `e2e` |

**Priority Mapping**:
- Phase 1 tasks: `high` (foundational)
- Phase 2-3 tasks: `medium`
- Phase 4+ tasks: `low`

```
mcp__ticketrack__bulkCreateTickets:
  tickets:
    - id: "{short-slug}"
      title: "{Phase} - {Task}"
      description: "{Concise task context from Step 5 — NO implementation steps markdown}"
      feature: "{feature-name}"
      labels: ["{phase-labels}"]
      priority: "{phase-priority}"
      implementation_steps: [{structured steps array from Step 5}]
```

**The key is `feature`, not `featureName`** (#332). `createFeature`, `editFeature`
and the `updateFeature*` tools do take `featureName`, which is what makes the wrong
spelling look right here. Unknown keys are dropped silently, so the mistake surfaces
only as `undefined:` in the per-ticket result lines — that prefix is the `id` echo,
which is why `id` is worth passing too.

**IMPORTANT**: The `implementation_steps` field writes structured step data directly into the ticket YAML. This enables the UI to display steps in the dedicated "Implementation Steps" section with progress tracking, action badges, and status indicators. Do NOT duplicate steps as markdown in the description.

### Step 9: Set Dependencies

```
Phase 1 tickets: No dependencies
Phase 2 tickets: Blocked by Phase 1 tickets
Phase 3 tickets: Blocked by Phase 2 tickets
```

Within phases, tickets are generally independent unless task description indicates otherwise.

### Step 10: Display Results

```
📋 Plan and Tickets for '{feature-name}'

Project Structure:
  - Type: {detected}
  - Database: {path or "none"}
  - Backend: {path or "none"}
  - Frontend: {path or "none"}
  - Tests: {path or "none"}

Phase 1: {Name}
  #{id} - {title} [labels] (includes TDD steps)

Phase 2: {Name}
  #{id} - {title} [labels] ← blocked by #{phase1-ids}

Phase 3: {Name}
  #{id} - {title} [labels] ← blocked by #{phase2-ids}

📊 Summary:
  - Total tickets: {count}
  - Ready to start: {count} (Phase 1)
  - Blocked: {count}
  - Each ticket has TDD steps with exact code and commands

🚀 Next Steps:
  - View status: /tt-feature-status {feature-name}
  - Start first ticket: /tt-work-ticket {first-ticket-id}
  - Auto-implement all: /tt-implement-feature {feature-name}
```

## Error Handling

- **Feature not found**: "Feature '{name}' not found. Create it first with /tt-new-feature."
- **No design found**: Warn but proceed — generate plan from description as-is
- **No structure detected**: Ask user to describe their project structure
- **Bulk create failure**: Report which tickets failed. Check for duplicates before retrying.
- **Connection timeout**: Check `mcp__ticketrack__listTickets` before retrying to avoid duplicates.
