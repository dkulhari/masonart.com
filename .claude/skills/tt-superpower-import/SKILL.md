---
name: tt-superpower-import
description: Use when migrating completed Superpowers feature implementations to TickeTrack. Triggers include completed plan files in docs/plans/, wanting historical tracking, or bridging Superpowers workflow with TickeTrack.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - ToolSearch
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__updateTicketStatus
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-superpower-import - Import Superpowers Features to TickeTrack

Migrates completed Superpowers implementations to TickeTrack retroactively. Uses claude-mem observations to find commits, file changes, and decisions.

## ⚠️ CRITICAL: MCP-Only Operations

**NEVER write directly to plan/tracker-data/ files.** All ticket and feature operations MUST use TickeTrack MCP tools. If MCP is unavailable, the skill MUST fail - do not fall back to file operations.

## Arguments

```
$ARGUMENTS: <plan-file> [--feature-name=<name>]
```

- `plan-file`: Path to Superpowers plan (e.g., `docs/plans/2026-02-01-gemini-provider-plan.md`)
- `--feature-name`: Optional override for TT feature name (defaults to extracted from plan title)

**Example**: `/tt-superpower-import docs/plans/2026-02-01-gemini-provider-plan.md`

## Workflow

### Step 0: Verify TickeTrack MCP Availability (MUST BE FIRST)

**Before any other operation**, verify TickeTrack MCP is available:

```
ToolSearch: "+ticketrack list"
```

Then call:

```
mcp__ticketrack__listFeatures
```

**If ToolSearch returns no ticketrack tools OR listFeatures fails:**

```
❌ TickeTrack MCP Not Available

The TickeTrack MCP server is not connected. This skill requires TickeTrack MCP for all operations.

To fix:
1. Run: /mcp (to check MCP server status)
2. Ensure ticketrack server is running
3. Retry: /tt-superpower-import <plan-file>
```

**DO NOT PROCEED if TickeTrack MCP is unavailable.**

### Step 1: Parse Plan File

Read the plan file and extract:

1. **Metadata from header:**
   - Goal (after `**Goal:**`)
   - Architecture (after `**Architecture:**`)
   - Tech Stack (after `**Tech Stack:**`)

2. **Tasks:** Look for `## Task N:` sections, extract:
   - Task number and title
   - File paths from `**Files:**` section (Create/Modify/Test)
   - Brief description of what the task does

**Feature name derivation:**

- From `--feature-name` arg if provided
- Otherwise from plan title: `# Google Gemini Direct Provider` → `gemini-direct-provider`

### Step 2: Check Feature Doesn't Exist

```
mcp__ticketrack__listFeatures
```

If feature name already exists: "Feature '{name}' already exists. Use --feature-name to specify different name."

### Step 3: Query claude-mem for Work Context

For each task, search claude-mem for relevant observations:

```
mcp__plugin_claude-mem_mcp-search__search
  query: "<file paths from task>"
```

**Search priority:**

1. File paths mentioned in task (most specific)
2. Task title keywords
3. Feature name + date range

**After finding observations, fetch full content:**

```
mcp__plugin_claude-mem_mcp-search__get_observations
  ids: [<observation-id-1>, <observation-id-2>]
```

**Extract from observations:**

- Commit hashes and messages
- Files changed
- Work summaries
- Type indicators (feature, bugfix, refactor)

### Step 3b: Extract Commit Hashes (CRITICAL)

**Commit hashes MUST be included in completion comments.** Follow this extraction strategy:

**1. From claude-mem observations:**
Look for commit patterns in observation `facts` and `narrative` fields:

- 7-8 character hex hashes (e.g., `b2cab8de`, `cc7b27c3`)
- Conventional commit messages (e.g., `feat(ai): implement gemini...`)
- Patterns like "committed", "commit hash", "git commit"

**2. From git log (fallback):**
If claude-mem doesn't have commit info, use git log with file paths from the task:

```bash
git log --oneline --all -- <file-path-1> <file-path-2>
```

This returns commits that touched those specific files. Match by:

- Date range (around when superpowers plan was executed)
- Commit message keywords matching task description
- Author (if known)

**3. Example extraction:**

```
# From observation narrative:
"Committed changes with cc7b27c3 - feat(ai): implement gemini image generation"

# Extract:
hash: cc7b27c3
message: feat(ai): implement gemini image generation
```

**If no commit found:** Note in comment as "Commit: not found (manual review needed)"

### Step 4: Create TT Feature (via MCP)

```yaml
mcp__ticketrack__createFeature:
  name: <feature-name>
  description: |
    ## Goal
    {goal from plan}

    ## Architecture
    {architecture from plan}

    ## Tech Stack
    {tech stack from plan}

    ## Source
    Imported from Superpowers: {plan-file-path}
  priority: medium
```

### Step 5: Create Tickets via MCP (All as Done)

For each task in the plan:

**5a. Create ticket:**

```yaml
mcp__ticketrack__createTicket:
  featureName: <feature-name>
  title: "Task N - <task title>"
  type: task
  labels: [<inferred from file paths>]
  priority: <high for task 1-2, medium for 3+>
  description: |
    ## Task
    {task description from plan}

    ## Files
    {file paths from plan}
```

**5b. Mark as done:**

```yaml
mcp__ticketrack__updateTicketStatus:
  ticketId: <id>
  newStatus: done
```

**5c. Add completion comment with claude-mem context:**

```yaml
mcp__ticketrack__addComment:
  ticketId: <id>
  comment: |
    ✅ **Imported from Superpowers**

    **Commit**: `{hash}` - {message}

    **Files Changed**:
    - `{file1}` - {description}
    - `{file2}` - {description}

    **Summary**:
    {work summary from observation}

    **Observation IDs**: #{obs-id-1}, #{obs-id-2}
```

If no claude-mem observations found for a task, create ticket without commit info and note in summary.

### Step 6: Summary Output

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
  Tasks without commits: J (need manual review)

Next Steps:
  - View feature: /tt-feature-status {name}
```

## Label Inference

Infer labels from file paths in tasks:

| File Path Pattern                           | Labels               |
| ------------------------------------------- | -------------------- |
| `*/database/*`, `*/schema/*`, `*.sql`       | `database`, `schema` |
| `*/routes/*`, `*/services/*`, `*/api/*`     | `backend`, `api`     |
| `*/components/*`, `*/app/routes/*`, `*.tsx` | `frontend`, `ui`     |
| `*/tests/*`, `*.test.ts`, `*.spec.ts`       | `testing`            |
| `docs/*`, `*.md`                            | `docs`               |
| `package.json`, `*.config.*`                | `config`             |

## Error Handling

| Error                      | Response                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| TickeTrack MCP unavailable | **STOP** - Display connection error, do not proceed                              |
| Plan file not found        | "Plan file not found: {path}"                                                    |
| Feature already exists     | "Feature '{name}' already exists. Use --feature-name to specify different name." |
| No tasks found in plan     | "No tasks found in plan. Expected '## Task N:' format."                          |
| No claude-mem observations | Create ticket without commit info, note in summary                               |
| MCP tool failure           | Report error, continue with remaining tasks                                      |
