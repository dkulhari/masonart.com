# tt-enrich-ticket Design

**Date:** 2026-02-01
**Status:** Implemented

## Overview

A skill to enrich TickeTrack tickets with decision context from claude-mem observations. Focuses on `⚖️` decision observations to capture rationale and trade-offs that informed implementation choices.

## Design Decisions

### Focus: Decisions Only
- **Chose:** Primarily search for decision observations (`⚖️` type)
- **Rationale:** Commits and file changes are already captured by `tt-superpower-import`. Decisions are the hardest context to reconstruct later and provide the most value for understanding "why" something was done.

### Interaction: Per-Ticket Approval
- **Chose:** Interactive loop with user approval per ticket
- **Alternatives considered:**
  - Batch preview (rejected: overwhelming for many tickets)
  - Auto-add (rejected: user loses control over relevance)
- **Rationale:** Per-ticket approval allows incremental review, quick skipping of irrelevant findings, and early abort if nothing useful is found.

## Arguments

```
$ARGUMENTS: <ticket-id | feature-name> [--query=<specific-query>]
```

- Single ticket: `159` or `#159`
- All tickets in feature: `gemini-direct-provider`
- Specific query: `--query="SDK choice"`

## Workflow

1. **Step 0:** Verify TickeTrack MCP availability
2. **Step 1:** Resolve target tickets (single or feature)
3. **Step 2:** For each ticket:
   - Display ticket context
   - Search claude-mem for decision observations
   - Present findings with observation preview
   - Ask user: Add / Skip / Skip All / Query More
4. **Step 3:** Add approved decisions as structured comments
5. **Step 4:** Output summary with statistics

## Comment Format

```markdown
📋 **Decision Context** (from claude-mem #2379)

Require TickeTrack MCP for Ticket Creation

**Summary**: Decided to enforce MCP-only operations...

**Rationale**:
- Prevents data corruption
- Ensures validation via MCP
```

## Idempotency

The skill checks if an observation ID is already referenced in existing ticket comments before adding, preventing duplicates on multiple invocations.

## Related Skills

- `tt-superpower-import` - Imports completed superpowers features (captures commits/files)
- `tt-enrich-ticket` - Enriches tickets with decision context (captures rationale)

These skills complement each other:
1. Use `tt-superpower-import` to import completed features
2. Use `tt-enrich-ticket` to add decision context afterward
