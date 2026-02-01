---
name: tt-enrich-ticket
description: Use when tickets need additional context from past work. Triggers include missing decision rationale, wanting to add historical context, or enriching tickets with claude-mem observations.
allowed-tools:
  - Read
  - Glob
  - Grep
  - ToolSearch
  - AskUserQuestion
  - mcp__ticketrack__getTicket
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-enrich-ticket - Enrich Tickets with Decision Context

Enriches TickeTrack tickets with decision observations from claude-mem. Searches for `⚖️` decision observations related to ticket files/topics and adds them as comments with user approval.

## ⚠️ CRITICAL: MCP-Only Operations

**NEVER write directly to plan/tracker-data/ files.** All ticket operations MUST use TickeTrack MCP tools. If MCP is unavailable, the skill MUST fail.

## Arguments

```
$ARGUMENTS: <ticket-id | feature-name> [--query=<specific-query>]
```

- `ticket-id`: Single ticket (e.g., `159`, `#159`)
- `feature-name`: All tickets in feature (e.g., `gemini-direct-provider`)
- `--query`: Optional specific query to search for (e.g., `--query="why gemini over openai"`)

**Examples:**
```bash
/tt-enrich-ticket 159                           # Single ticket
/tt-enrich-ticket gemini-direct-provider        # All tickets in feature
/tt-enrich-ticket 159 --query="SDK choice"      # Specific query for ticket
```

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
3. Retry: /tt-enrich-ticket <args>
```

**DO NOT PROCEED if TickeTrack MCP is unavailable.**

### Step 1: Resolve Target Tickets

**If ticket ID provided:**
```yaml
mcp__ticketrack__getTicket:
  ticketId: <id>
```

**If feature name provided:**
```yaml
mcp__ticketrack__listTickets:
  featureName: <feature-name>
```

Collect all ticket IDs for processing.

### Step 2: For Each Ticket (Interactive Loop)

**2a. Display ticket context:**
```
┌─────────────────────────────────────────┐
│ Ticket #159 - Add Google Generative AI  │
│ Files: packages/api/package.json        │
│ Current comments: 2                     │
└─────────────────────────────────────────┘
```

**2b. Build search query:**
- Extract file paths from ticket description
- Extract keywords from ticket title
- If `--query` provided, use that as primary search
- Search for decision observations (`⚖️` type)

```yaml
mcp__plugin_claude-mem_mcp-search__search:
  query: "<file paths> OR <title keywords> decision"
```

**2c. Filter for decisions:**
Look for observations with:
- Type indicator `⚖️` (decision)
- Keywords: "decided", "decision", "chose", "rationale", "why", "trade-off"

**2d. Fetch full observation content:**
```yaml
mcp__plugin_claude-mem_mcp-search__get_observations:
  ids: [<observation-ids>]
```

**2e. Present findings to user:**
```
Searching claude-mem for decisions...

Found 1 decision observation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ #2379 - Require TickeTrack MCP for Ticket Creation
"Decided to enforce MCP-only operations rather than
allowing file fallback, ensuring data integrity..."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**2f. Ask user for action:**

Use AskUserQuestion with options:
- **Add** - Add this decision as comment
- **Skip** - Skip this observation, continue to next
- **Skip All** - Skip remaining tickets
- **Query More** - Search with different query

### Step 3: Add Comment via MCP

If user approves, add structured comment:

```yaml
mcp__ticketrack__addComment:
  ticketId: <id>
  comment: |
    📋 **Decision Context** (from claude-mem #<obs-id>)

    {decision title}

    **Summary**: {decision summary - 2-3 sentences}

    **Rationale**: {key reasoning points}
```

### Step 4: Continue or Complete

After each ticket:
- If more tickets remain and user didn't "Skip All", continue to next
- Track statistics: tickets processed, decisions added, skipped

### Step 5: Summary Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Ticket Enrichment Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target: gemini-direct-provider (10 tickets)

Processed: 10 tickets
  Decisions found: 4
  Decisions added: 3
  Skipped: 1

Tickets enriched:
  #159 - Added 1 decision
  #162 - Added 1 decision
  #165 - Added 1 decision
```

## Search Strategy

**Primary search (decisions):**
1. File paths from ticket → search claude-mem
2. Filter for `⚖️` type observations
3. Look for decision keywords in title/narrative

**With --query flag:**
1. Use provided query directly
2. Combine with ticket file paths for relevance
3. Still filter for decision-type observations

**Relevance scoring:**
- Direct file path match: highest priority
- Feature name match: high priority
- Keyword match in title: medium priority
- Date proximity to ticket creation: lower priority

## Comment Format

```markdown
📋 **Decision Context** (from claude-mem #2379)

Require TickeTrack MCP for Ticket Creation

**Summary**: Decided to enforce MCP-only operations rather than
allowing file fallback, ensuring data integrity across all ticket
operations.

**Rationale**:
- Prevents data corruption from concurrent writes
- Ensures proper validation via MCP layer
- Maintains audit trail through MCP logging
```

## Error Handling

| Error | Response |
|-------|----------|
| TickeTrack MCP unavailable | **STOP** - Display connection error, do not proceed |
| Ticket not found | "Ticket #{id} not found" |
| Feature not found | "Feature '{name}' not found" |
| No decisions found | "No decision observations found for this ticket" (continue to next) |
| claude-mem search fails | Report error, continue to next ticket |
| User aborts (Skip All) | Complete with partial summary |

## Multiple Invocations

This skill is **idempotent-safe**:
- Before adding a comment, check if observation ID already referenced in existing comments
- Skip already-added observations with note: "Already added: #2379"
- User can run multiple times to add more context as it becomes available
