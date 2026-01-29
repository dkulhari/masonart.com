---
name: tt-edit-feature
description: Edit an existing feature's description. Use when user wants to update or refine a feature description.
allowed-tools:
  - mcp__ticketrack__editFeature
  - mcp__ticketrack__listFeatures
  - AskUserQuestion
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-edit-feature - Edit Feature Description

Edit the description of an existing ticketrack feature with interactive refinement.

## Arguments

```
$ARGUMENTS: <feature-name> [optional: "<new-description>"]
```

- `feature-name`: Name of the existing feature to edit
- `new-description` (optional): If provided, replace description with this. If omitted, shows current description for editing.

**Examples**:
- `/tt-edit-feature user-reviews` - View and edit interactively
- `/tt-edit-feature user-reviews "Updated description here"` - Direct replacement

## Workflow

### Step 1: Fetch Feature

1. Use `mcp__ticketrack__listFeatures` to find the feature
2. If feature doesn't exist, report error and stop

### Step 2: Display Current Description

Show the user the current feature description clearly formatted.

### Step 3: Determine Edit Mode

**If new description was provided in arguments**:
- Update directly via `mcp__ticketrack__editFeature`
- Show the updated description
- Ask if further changes needed

**If no new description provided**:
- Use `AskUserQuestion` to ask what they want to change:
  - "Rewrite completely"
  - "Add to existing"
  - "Remove section"
  - "Other" (free text)

### Step 4: Interactive Refinement Loop

1. Based on user's choice, draft the updated description
2. Show the proposed changes
3. Use `AskUserQuestion`: "Does this look good?"
   - Options: "Looks good", "Needs more changes"
4. If needs changes, ask what to modify and repeat
5. When satisfied, apply via `mcp__ticketrack__editFeature`

### Step 5: Display Summary

Output showing:
- Feature name
- Updated description
- What changed (brief diff summary)
- Next steps

## Output Format

```
Feature '{feature-name}' updated!

Previous description:
{truncated-previous}

New description:
{new-description}

Next Steps:
  - Create/update plan: /tt-plan-feature {feature-name}
  - Check status: /tt-feature-status {feature-name}
```

## Error Handling

- **Feature not found**: "Feature '{name}' not found. Use /tt-feature-status to list existing features."
- **MCP tool failure**: Report the specific error and suggest manual steps.
