---
name: tt-feature-status
description: Check progress and status of features. Use when user wants to see feature progress, blockers, or next actions.
allowed-tools:
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__showTicketDetails
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-feature-status - Feature Progress Tracking

Shows progress, blockers, and next actions for ticketrack features.

## Arguments

```
$ARGUMENTS: [feature-name]
```

- `feature-name` (optional): Specific feature to check. If omitted, shows all in-progress features.

**Examples**:

- `/tt-feature-status` - Show all active features
- `/tt-feature-status user-reviews` - Show specific feature

## Workflow

### Mode 1: All Features (no argument)

#### Step 1: Fetch All Features

```
mcp__ticketrack__listFeatures
```

#### Step 2: For Each In-Progress Feature

Get ticket counts and status breakdown:

```
mcp__ticketrack__listTickets:
  featureName: {feature}
```

Calculate:

- Total tickets
- Done tickets
- In-progress tickets
- Blocked tickets
- Completion percentage

#### Step 3: Display Overview

Show summary table of all features with progress.

### Mode 2: Specific Feature (with argument)

#### Step 1: Fetch Feature Details

```
mcp__ticketrack__listFeatures
```

Find the specified feature. If not found, report error.

#### Step 2: Fetch All Tickets

```
mcp__ticketrack__listTickets:
  featureName: {feature-name}
```

#### Step 3: Analyze Tickets

Group tickets by status:

- **Done**: Completed tickets
- **In Progress**: Currently being worked on
- **Ready**: Not blocked, can be started
- **Blocked**: Waiting on dependencies

For blocked tickets, identify what they're blocked by.

#### Step 4: Identify Next Actions

Determine recommended next actions:

1. If in-progress tickets exist: "Continue working on #{id}"
2. If ready tickets exist: "Start #{id} - {title}"
3. If only blocked tickets: "Unblock by completing #{blocking-id}"

#### Step 5: Check Implementation Plan

Look for "## Implementation Plan" in feature description.
If present, show current phase based on completed tickets.

## Output Format

### All Features View

```
📊 Feature Status Overview

| Feature | Progress | Tickets | Next Action |
|---------|----------|---------|-------------|
| {name}  | ████░░ 67% | 4/6 done | #{id} ready |
| {name}  | ██░░░░ 33% | 2/6 done | Blocked on #{id} |
| {name}  | ░░░░░░ 0%  | 0/4 done | #{id} ready |

📈 Summary:
  - Active features: {count}
  - Total tickets: {count}
  - Completed: {count}
  - In progress: {count}
  - Blocked: {count}
```

### Single Feature View

```
📊 Status: {feature-name}

Progress: ████████░░ 80% (8/10 tickets)

📋 Implementation Plan Progress:
  ✅ Phase 1: Database Schema (3/3 complete)
  ✅ Phase 2: Backend API (3/3 complete)
  🔄 Phase 3: Frontend (2/3 complete)
  ⏳ Phase 4: Testing (0/1 complete)

🎫 Tickets:

✅ Done (8):
  #{id} - {title}
  #{id} - {title}
  ...

🔄 In Progress (1):
  #{id} - {title}

📋 Ready (1):
  #{id} - {title}

🚫 Blocked (0):
  (none)

🚀 Next Actions:
  1. Continue: /tt-work-ticket {in-progress-id}
  2. Or start: /tt-work-ticket {ready-id}

💡 Tip: Use /tt-implement-feature {feature-name} to auto-complete remaining tickets
```

## Progress Bar Generation

Use block characters to show progress:

- `█` = 10% complete
- `░` = 10% remaining

Example: 67% = `███████░░░`

## Status Indicators

| Symbol | Meaning             |
| ------ | ------------------- |
| ✅     | Done                |
| 🔄     | In Progress         |
| 📋     | Ready (not blocked) |
| 🚫     | Blocked             |
| ⏳     | Pending             |

## Error Handling

- **Feature not found**: "Feature '{name}' not found. Available features: {list}"
- **No tickets**: "Feature '{name}' has no tickets. Create them with /tt-create-tickets {name}"
- **No features**: "No features found. Create one with /tt-new-feature"
