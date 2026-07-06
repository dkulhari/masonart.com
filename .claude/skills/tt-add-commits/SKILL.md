---
name: tt-add-commits
description: Use when tickets are missing commit information. Triggers include imported tickets without commit hashes, wanting to link commits to tickets, or auditing ticket commit coverage.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - ToolSearch
  - mcp__ticketrack__getTicket
  - mcp__ticketrack__listTickets
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__get_observations
---

# /tt-add-commits - Add Missing Commit Info to Tickets

Automatically adds missing commit information to TickeTrack tickets. Non-interactive - processes all tickets and adds commit info where found.

## ⚠️ CRITICAL: MCP-Only Operations

**NEVER write directly to plan/tracker-data/ files.** All ticket operations MUST use TickeTrack MCP tools. If MCP is unavailable, the skill MUST fail.

## Arguments

```
$ARGUMENTS: <ticket-id | feature-name> [--dry-run]
```

- `ticket-id`: Single ticket (e.g., `159`, `#159`)
- `feature-name`: All tickets in feature (e.g., `gemini-direct-provider`)
- `--dry-run`: Show what would be added without actually adding comments

**Examples:**

```bash
/tt-add-commits 159                      # Single ticket
/tt-add-commits gemini-direct-provider   # All tickets in feature
/tt-add-commits gemini-direct-provider --dry-run  # Preview only
```

## Workflow

### Step 0: Verify TickeTrack MCP Availability (MUST BE FIRST)

```
ToolSearch: "+ticketrack list"
```

Then call `mcp__ticketrack__listFeatures`. Fail if unavailable.

### Step 1: Resolve Target Tickets

**If ticket ID:** Fetch single ticket via MCP
**If feature name:** List all tickets in feature

### Step 2: Filter Tickets Needing Commits

For each ticket, check existing comments for commit info:

- Look for patterns: `` `[a-f0-9]{7,8}` `` (commit hash)
- Look for keywords: "Commit:", "commit hash", "committed"

**Skip tickets that already have commit info.**

### Step 3: Find Commits for Each Ticket

**3a. Extract file paths from ticket:**
Parse ticket description for file paths in `## Files` section.

**3b. Search claude-mem:**

```yaml
mcp__plugin_claude-mem_mcp-search__search:
  query: "<file-path-1> <file-path-2> commit"
```

Look for commit patterns in observation facts/narrative:

- 7-8 character hex hashes
- Conventional commit messages (`feat:`, `fix:`, etc.)

**3c. Search git log (fallback):**

```bash
git log --oneline --since="2026-01-01" -- <file-path-1> <file-path-2>
```

Match commits by:

- File paths from ticket
- Date range (ticket created date ± 7 days)
- Commit message keywords matching ticket title

**3d. Deduplicate and validate:**

- Remove duplicate hashes
- Verify hashes exist: `git cat-file -t <hash>`
- Get full commit message: `git log -1 --format="%s" <hash>`

### Step 4: Add Commit Comments

For each ticket with found commits:

```yaml
mcp__ticketrack__addComment:
  ticketId: <id>
  comment: |
    🔗 **Commit Info** (auto-added by tt-add-commits)

    | Hash | Message |
    |------|---------|
    | `abc1234` | feat(ai): add gemini provider |
    | `def5678` | test(ai): add provider tests |

    **Source**: git log + claude-mem
```

### Step 5: Summary Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Commit Info Added
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target: gemini-direct-provider

Tickets processed: 10
  Already had commits: 3
  Commits added: 5
  No commits found: 2

Details:
  #159 - Added 1 commit (abc1234)
  #160 - Added 2 commits (def5678, ghi9012)
  #161 - Already had commits (skipped)
  #162 - No commits found
  ...

Tickets needing manual review:
  #162 - Task 4: Write failing test...
  #166 - Task 8: Update cost estimates...
```

## Commit Detection Strategy

### From claude-mem observations:

Look for patterns in `facts` and `narrative` fields:

```
Patterns:
- "Committed changes with <hash>"
- "commit <hash>"
- "<hash> - <message>"
- "git commit" near 7-8 char hex strings
```

### From git log:

```bash
# Get commits touching specific files
git log --oneline --all --since="<ticket-created - 7d>" --until="<ticket-created + 7d>" -- <file-paths>

# Match by message keywords
git log --oneline --all --grep="<ticket-title-keywords>"
```

### Validation:

Before adding, verify each hash:

```bash
git cat-file -t <hash>  # Should return "commit"
```

## Comment Format

```markdown
🔗 **Commit Info** (auto-added by tt-add-commits)

| Hash       | Message                                     |
| ---------- | ------------------------------------------- |
| `cc7b27c3` | feat(ai): implement gemini image generation |
| `a6125eed` | test(ai): add failing test for gemini       |

**Source**: git log + claude-mem #2327
```

## Dry Run Mode

With `--dry-run`, output shows what would be added:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Dry Run - No Changes Made
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Would add commits to:
  #159 - 1 commit (abc1234 - feat(ai): add SDK)
  #160 - 2 commits (def5678, ghi9012)

Would skip (already has commits):
  #161

Would skip (no commits found):
  #162, #166

Run without --dry-run to apply changes.
```

## Error Handling

| Error                      | Response                                 |
| -------------------------- | ---------------------------------------- |
| TickeTrack MCP unavailable | **STOP** - Display connection error      |
| Ticket not found           | "Ticket #{id} not found"                 |
| Feature not found          | "Feature '{name}' not found"             |
| Git not available          | Fall back to claude-mem only             |
| No commits found           | Note in summary, continue to next ticket |
| Invalid hash               | Skip that hash, log warning              |

## Idempotency

- Checks existing comments for commit hashes before adding
- Won't add duplicate commit info
- Safe to run multiple times
