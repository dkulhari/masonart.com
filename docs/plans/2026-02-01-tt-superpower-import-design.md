# tt-superpower-import Design

## Overview

A skill to migrate completed Superpowers feature implementations to TickeTrack retroactively. Uses claude-mem observations to find work context (commits, file changes, decisions) and creates a complete TickeTrack record.

## Goals

- Import completed Superpowers work into TickeTrack for tracking/history
- Link commits and file changes to tickets via claude-mem observations
- Keep Superpowers and TickeTrack loosely coupled

## Scope

- **In scope**: Parsing Superpowers plan files, querying claude-mem, creating TT features/tickets
- **Out of scope**: Real-time tracking during execution (future enhancement)

## Architecture

```
docs/plans/YYYY-MM-DD-feature-plan.md  (Superpowers format)
              ↓
       tt-superpower-import
              ↓
    ┌─────────────────────────────────────────┐
    │  claude-mem observations                │
    │  (commits, files, decisions)            │
    └─────────────────────────────────────────┘
              ↓
    ┌─────────────────────────────────────────┐
    │  TickeTrack Feature                     │
    │  ├─ Ticket 1 (done) + commit comments   │
    │  ├─ Ticket 2 (done) + commit comments   │
    │  └─ Ticket N (done) + commit comments   │
    └─────────────────────────────────────────┘
```

## Arguments

```
/tt-superpower-import <plan-file> [--feature-name=<name>]
```

- `plan-file`: Path to Superpowers plan (e.g., `docs/plans/2026-02-01-gemini-provider-plan.md`)
- `--feature-name`: Optional override for TT feature name (defaults to extracted from plan)

## Workflow

### Step 1: Parse Plan File

1. Read the plan file from `docs/plans/`
2. Extract metadata:
   - Goal (from header)
   - Architecture (from header)
   - Tech Stack (from header)
3. Extract all tasks:
   - Task number and title
   - File paths mentioned (Create/Modify/Test)
   - Steps within each task

### Step 2: Query claude-mem for Each Task

For each task, search claude-mem for relevant observations:

```
mcp__plugin_claude-mem_mcp-search__search
  query: "<task description> <file paths>"
```

**Search Strategy:**

| Search By | When | Example |
|-----------|------|---------|
| File path | Task mentions specific files | `packages/api/src/ai/generator.ts` |
| Feature keyword | General task | `gemini provider implementation` |
| Date range | Fallback | Observations from plan date onwards |

**Expected observation data:**
- Commit hashes and messages
- Files changed
- Work summaries
- Design decisions

### Step 3: Create TT Feature

```yaml
mcp__ticketrack__createFeature:
  name: <feature-name>  # from plan or --feature-name arg
  description: |
    ## Goal
    {goal from plan}

    ## Architecture
    {architecture from plan}

    ## Tech Stack
    {tech stack from plan}

    ## Source
    Imported from: {plan-file-path}
  priority: medium
```

### Step 4: Create Tickets with Context

For each task in the plan:

**4a. Create ticket:**
```yaml
mcp__ticketrack__createTicket:
  feature: <feature-name>
  title: "Task N - <task title>"
  type: task
  labels: [<inferred from file paths: database, api, ui, etc>]
  priority: <based on task order: high for 1-2, medium for 3+>
  description: |
    ## Task
    {task description from plan}

    ## Files
    {file paths from plan}
```

**4b. Mark as done:**
```yaml
mcp__ticketrack__updateTicketStatus:
  ticketId: <id>
  status: done
```

**4c. Add completion comment with claude-mem context:**
```yaml
mcp__ticketrack__addComment:
  ticketId: <id>
  comment: |
    ✅ **Imported from Superpowers**

    **Commit**: `{hash}` - {message}

    **Files Changed**:
    - `{file1}` - {description from observation}
    - `{file2}` - {description from observation}

    **Summary**:
    {work summary from observation}

    **Observations**: #{obs-id-1}, #{obs-id-2}
```

### Step 5: Summary Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Superpowers Feature Imported
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Feature: {name}
Source: {plan-file}

Tickets Created: N (all done)
  #101 - Task 1: {title}
  #102 - Task 2: {title}
  ...

Observations Linked: M
  Tasks with commits: K
  Tasks without commits: J (manual review needed)

Next Steps:
  - View feature: /tt-feature-status {name}
```

## Label Inference

Infer labels from file paths mentioned in tasks:

| File Path Pattern | Labels |
|-------------------|--------|
| `*/database/*`, `*/schema/*`, `*.sql` | `database`, `schema` |
| `*/routes/*`, `*/services/*`, `*/api/*` | `backend`, `api` |
| `*/components/*`, `*/app/routes/*`, `*.tsx` | `frontend`, `ui` |
| `*/tests/*`, `*.test.ts`, `*.spec.ts` | `testing` |
| `docs/*`, `*.md` | `docs` |

## Error Handling

| Error | Response |
|-------|----------|
| Plan file not found | "Plan file not found: {path}" |
| Feature already exists | "Feature '{name}' already exists. Use --feature-name to specify different name." |
| No claude-mem observations found | Create ticket without commit info, note in summary |
| MCP tool failure | Report error, continue with remaining tasks |

## Allowed Tools

```yaml
allowed-tools:
  - Read
  - Glob
  - Grep
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__get_observations
```

## Future Enhancements

1. **tt-superpower-prepare**: Pre-execution skill that creates TT tickets before running `superpowers:executing-plans`
2. **tt-superpower-sync**: Post-execution sync that updates TT from recent commits
3. **Real-time hooks**: Intercept Superpowers execution events for live tracking
