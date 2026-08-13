---
name: tt-new-ticket
description: Create a single ticket with exploration and TDD steps. Use when user wants to report a bug, add a task, or create any individual ticket.
allowed-tools:
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__bulkCreateTickets
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__showTicketDetails
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-new-ticket - Single Ticket Creation with Context

Creates a single ticket through collaborative exploration — understands the problem, explores relevant code, asks clarifying questions, and generates a ticket with structured TDD steps that tt-work-ticket can execute.

**Use for**: Bug reports, ad-hoc tasks, feature additions, refactoring requests — any single piece of work.

## Arguments

```
$ARGUMENTS: "<short-description>"
```

- `short-description`: Brief description of what needs to be done

**Examples**:
- `/tt-new-ticket "login page crashes on empty email"`
- `/tt-new-ticket "add dark mode toggle to settings"`
- `/tt-new-ticket "refactor auth middleware to use JWT"`

## Workflow

### Step 1: Parse and Understand

Parse `$ARGUMENTS` to extract the short description.

Determine initial ticket properties from the description:
- **Type inference**: Does it sound like a `bug`, `task`, `feature`, or `refactor`?
- **Feature inference**: Does it relate to an existing feature?

### Step 2: Explore Relevant Code

Before asking questions, investigate the codebase to understand context:

1. **Search for related code**: Grep for keywords from the description
2. **Find relevant files**: Glob for files in the affected area
3. **Read key files**: Understand current behavior and patterns
4. **Check existing tickets**: Look for duplicates or related work

```
Grep: {keywords from description}
Glob: **/relevant-area/**/*.{ts,js,tsx}
Read: Discovered files
mcp__ticketrack__listTickets: Check for duplicates
```

**Search claude-mem for past context**:
```
mcp__plugin_claude-mem_mcp-search__search:
  query: "{keywords from description}"
  types: ["bugfix", "decision", "discovery"]
```

This surfaces past bugs, fixes, and decisions related to the same area. Use findings to:
- Detect duplicates that ticket search might miss (different wording, same root cause)
- Include relevant context from past work in the ticket description
- Identify root causes if this is a recurring issue

**Report findings**: "Here's what I found related to this..."

### Step 3: Ask Clarifying Questions (One at a Time)

Ask questions to fully understand the ticket. **One question per message.**

**For bugs**:
- "What's the expected behavior vs actual behavior?"
- "Can you reproduce it consistently?"
- "Which page/component is affected?"

**For tasks/features**:
- "Should this integrate with {existing system}?"
- "What's the scope — just {X} or also {Y}?"
- "Any specific constraints or requirements?"

**Rules**:
- Ask ONE question at a time
- Prefer multiple-choice when possible (use `AskUserQuestion`)
- Stop when you have enough to write the ticket (usually 1-3 questions)
- If the description is already clear and detailed, skip to Step 4

### Step 4: Determine Ticket Properties

Based on exploration and answers, determine:

```
Feature:  {existing feature or "standalone"}
Type:     {bug | task | feature | refactor}
Priority: {critical | high | medium | low}
Labels:   {relevant labels from codebase area}
```

Use `AskUserQuestion` to confirm:
- "I'll create this as a **{type}** ticket under **{feature}** with **{priority}** priority. Sound right?"
- Options: "Looks good", "Change type", "Change feature", "Change priority"

### Step 5: Generate Structured TDD Steps

Based on the ticket type and codebase exploration, generate a structured `implementation_steps` JSON array. These are stored as YAML in the ticket and rendered by the UI with progress badges and action indicators.

**Valid actions**: `write-test`, `verify-fail`, `implement`, `verify-pass`, `refactor`, `commit`
**All statuses**: Set to `"pending"` at creation time

**For Bug Tickets**:

```json
[
  {
    "id": 1, "action": "write-test",
    "description": "Write test reproducing the bug",
    "file": "{test file path}",
    "command": "{test command}",
    "expected_result": "FAIL - {describes the bug behavior}",
    "status": "pending",
    "code": "{test code that demonstrates the bug}"
  },
  {
    "id": 2, "action": "verify-fail",
    "description": "Confirm the bug is reproducible in tests",
    "command": "{test command}",
    "expected_result": "FAIL",
    "status": "pending"
  },
  {
    "id": 3, "action": "implement",
    "description": "Fix the root cause",
    "file": "{source file path}",
    "status": "pending",
    "code": "{fix code}"
  },
  {
    "id": 4, "action": "verify-pass",
    "description": "Confirm the fix works",
    "command": "{test command}",
    "expected_result": "PASS",
    "status": "pending"
  },
  {
    "id": 5, "action": "commit",
    "description": "Commit the fix",
    "command": "git add {files} && git commit -m \"fix: {description} (#{ticket-number})\"",
    "status": "pending"
  }
]
```

**For Task/Feature Tickets**:

```json
[
  {
    "id": 1, "action": "write-test",
    "description": "Write failing test for {first behavior}",
    "file": "{test file path}",
    "command": "{test command}",
    "expected_result": "FAIL",
    "status": "pending",
    "code": "{test code}"
  },
  {
    "id": 2, "action": "verify-fail",
    "description": "Confirm test fails",
    "command": "{test command}",
    "expected_result": "FAIL",
    "status": "pending"
  },
  {
    "id": 3, "action": "implement",
    "description": "Implement {behavior}",
    "file": "{source file path}",
    "status": "pending",
    "code": "{implementation code}"
  },
  {
    "id": 4, "action": "verify-pass",
    "description": "Confirm test passes",
    "command": "{test command}",
    "expected_result": "PASS",
    "status": "pending"
  },
  {
    "id": 5, "action": "commit",
    "description": "Commit changes",
    "command": "git add {files} && git commit -m \"feat: {description} (#{ticket-number})\"",
    "status": "pending"
  }
]
```

**For Refactoring Tickets**:

```json
[
  {
    "id": 1, "action": "write-test",
    "description": "Verify existing behavior with tests (if not covered)",
    "file": "{test file path}",
    "command": "{test command}",
    "expected_result": "PASS - existing behavior preserved",
    "status": "pending"
  },
  {
    "id": 2, "action": "implement",
    "description": "Refactor {component}",
    "file": "{source file path}",
    "status": "pending",
    "code": "{refactored code}"
  },
  {
    "id": 3, "action": "verify-pass",
    "description": "Confirm all existing tests still pass",
    "command": "{test command}",
    "expected_result": "PASS - no regression",
    "status": "pending"
  },
  {
    "id": 4, "action": "commit",
    "description": "Commit the refactor",
    "command": "git add {files} && git commit -m \"refactor: {description} (#{ticket-number})\"",
    "status": "pending"
  }
]
```

**Guidelines**:
- **Exact file paths** from codebase exploration — always
- **Complete code** in `code` field — not "add validation" but actual code
- **Exact test commands** from project's test runner
- **One TDD cycle per behavior** — red/green/refactor/commit
- Keep it minimal — only what's needed for this ticket

**When TDD steps aren't possible** (e.g., config changes, documentation, skill file edits):
- Use `implement` and `verify-pass` actions without `write-test`
- Verification can be manual (document what to check in `expected_result`)
- Set `expected_result` to: "Manual verification — no automated test applicable"

### Step 6: Create the Ticket

Assemble a **concise description** (task context only, NO implementation steps markdown) and create with structured steps:

#### Ticket Description (task context only)

````markdown
## Task
{Task description — what needs to be done and why}

## Context
{Any additional context: relevant files, patterns to follow, constraints}
````

**Do NOT include `## Implementation Steps` markdown in the description.** The structured `implementation_steps` field replaces it.

#### Create via `bulkCreateTickets` (supports `implementation_steps`)

Use `bulkCreateTickets` with a single-ticket array to get structured step support:

```
mcp__ticketrack__bulkCreateTickets:
  tickets:
    - title: "{concise title}"
      description: "{task context only — NO steps markdown}"
      featureName: "{feature-name}"
      labels: ["{relevant labels}"]
      priority: "{priority}"
      implementation_steps: [{structured steps array from Step 5}]
```

**Why `bulkCreateTickets`?** The single `createTicket` tool does not support `implementation_steps`. `bulkCreateTickets` creates the ticket via CLI, then augments the YAML with structured steps and sets `current_step: 1` for progress tracking.

#### Fallback: CLI + manual YAML update

If `bulkCreateTickets` is unavailable, create via CLI then update the YAML:

```
node packages/scripts/dist/create-ticket.js \
  --feature {feature-name} \
  --title "{concise title}" \
  --description "{task context only}" \
  --type {type} \
  --priority {priority} \
  --data-dir plan/tracker-data
```

Then read the created YAML file and add the `implementation_steps` array and `current_step: 1` field.

### Step 7: Display Summary

```
🎫 Created Ticket #{id}: {title}

Type: {type}
Priority: {priority}
Feature: {feature-name}
Labels: [{labels}]

📝 Description:
{description summary}

🔧 Implementation Steps: {count} structured steps (viewable in UI with progress badges)

🚀 Next Steps:
  - Start working: /tt-work-ticket {id}
  - View details: show-ticket.js --ticket {id}
```

## Key Principles

- **Explore before asking** — check the codebase first, then ask informed questions
- **Minimal questions** — only ask what's needed (1-3 questions usually)
- **Structured TDD steps always** — every ticket gets `implementation_steps` JSON array that the UI renders with progress badges
- **Exact code** — complete code in steps, not placeholders
- **One question at a time** — don't overwhelm

## Error Handling

- **Duplicate found**: "Found existing ticket #{id}: {title}. Is this the same issue?"
- **No matching feature**: Offer to create standalone or pick a feature
- **MCP tool failure**: Fall back to CLI scripts
