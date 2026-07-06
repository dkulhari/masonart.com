---
name: tt-new-feature
description: Create a new feature with a description. Use when user wants to start a new feature from scratch.
allowed-tools:
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__editFeature
  - mcp__ticketrack__listFeatures
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-new-feature - Feature Creation

Creates a new ticketrack feature with a well-crafted description. Does NOT create tickets - use `/tt-plan-feature` and `/tt-create-tickets` for that.

## Arguments

```
$ARGUMENTS: <feature-name> "<feature-description>"
```

- `feature-name`: kebab-case name for the feature (e.g., `user-reviews`)
- `feature-description`: Brief description of what the feature does

**Example**: `/tt-new-feature user-reviews "User review and rating system for products"`

## Workflow

### Step 1: Validate Input

1. Parse `$ARGUMENTS` to extract feature name and description
2. Validate feature name is kebab-case (lowercase, hyphens only)
3. Check feature doesn't already exist via `mcp__ticketrack__listFeatures`

If validation fails, report the error and stop.

### Step 2: Analyze Codebase (Optional)

If the feature description is brief, analyze the codebase to enrich it:

1. **Existing patterns**: Look for similar features or related code
2. **Integration points**: Identify where this feature might connect
3. **Dependencies**: Note any existing systems this feature would interact with

Use Glob, Grep, and Read tools to gather relevant context.

### Step 3: Draft Feature Description

Create an expanded description based on user input and codebase analysis:

**Description Template**:

```markdown
## Overview

{Expanded description of what the feature does and why}

## Goals

- {Primary goal}
- {Secondary goals}

## Scope

- **In scope**: {What this feature includes}
- **Out of scope**: {What this feature does NOT include}

## Technical Considerations

- {Key integration points}
- {Potential challenges}
- {Dependencies on existing systems}
```

Adapt the template based on the feature - not all sections are required for simple features.

### Step 4: Create Feature

Create the feature in ticketrack with the drafted description:

```
mcp__ticketrack__createFeature:
  name: {feature-name}
  description: {drafted-description}
  priority: medium
```

### Step 5: Review & Refine

Present the created feature description to the user and ask if they want to refine it:

Use `AskUserQuestion` to ask:

- "Does this description capture your intent?"
- Options: "Looks good", "Needs changes"

**If user wants changes**:

1. Ask what they want to modify
2. Update the description via `mcp__ticketrack__editFeature`
3. Show the updated version
4. Repeat until satisfied

### Step 6: Display Summary

Output a summary showing:

- Feature name
- Final description
- Next steps

## Output Format

```
Feature '{feature-name}' created!

Description:
{final-description}

Next Steps:
  - Create implementation plan: /tt-plan-feature {feature-name}
  - Check status: /tt-feature-status {feature-name}
```

## Error Handling

- **Feature exists**: "Feature '{name}' already exists. Use /tt-feature-status to check it or choose a different name."
- **Invalid name**: "Feature name must be kebab-case (lowercase letters and hyphens only)."
- **MCP tool failure**: Report the specific error and suggest manual steps.
