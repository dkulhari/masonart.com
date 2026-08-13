---
name: tt-new-feature
description: Create a new feature with a description. Use when user wants to start a new feature from scratch.
allowed-tools:
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__editFeature
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__updateFeatureDesign
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Glob
  - Grep
  - Task
---

# /tt-new-feature - Feature Creation with Design Exploration

Creates a new ticketrack feature through collaborative design exploration. Explores the codebase, asks clarifying questions one at a time, proposes approaches with trade-offs, and gets design approval before creating the feature.

**Absorbs**: `superpowers:brainstorming`

<HARD-GATE>
Do NOT create the feature until you have presented a design and the user has approved it. This applies to EVERY feature regardless of perceived simplicity. The design can be short for simple features, but you MUST present it and get approval.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every feature goes through this process. A single utility, a config change, a simple API endpoint — all of them. "Simple" features are where unexamined assumptions cause the most wasted work.

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

### Step 2: Explore Project Context

Before asking any questions, understand what exists:

1. **Check codebase structure**: Find project type, key directories, existing patterns
2. **Look for related code**: Search for code related to the proposed feature
3. **Check recent commits**: Understand recent development direction
4. **Read relevant docs**: Check CLAUDE.md, README, any design docs

```
Glob: package.json, **/routes/**, **/components/**, **/schema/**
Grep: {keywords from feature description}
Read: Key files discovered
```

**Search claude-mem for past context**:
```
mcp__plugin_claude-mem_mcp-search__search:
  query: "{keywords from feature description}"
  types: ["decision", "discovery", "feature"]
```

This surfaces past design decisions, architectural discoveries, and related feature work. Use findings to:
- Build on prior decisions rather than re-debating them
- Understand constraints discovered in past work
- Identify related features or code that may interact

**Report findings**: "Here's what I found in the codebase that's relevant to this feature..."

### Step 3: Ask Clarifying Questions (One at a Time)

Ask questions to understand the feature fully. **One question per message.**

Focus on understanding:
- **Purpose**: What problem does this solve? Who uses it?
- **Constraints**: What must it integrate with? Performance requirements?
- **Success criteria**: How will we know it's done?
- **Scope**: What's explicitly NOT included?

**Rules**:
- Ask ONE question at a time
- Prefer multiple-choice when possible (easier to answer)
- Use `AskUserQuestion` tool for structured questions
- Stop asking when you have enough to propose approaches (usually 2-4 questions)
- Don't ask about implementation details yet — that's for planning

**Example questions**:
- "Should reviews be public or private? Or should users choose per review?"
- "Do you need moderation/approval before reviews are visible?"
- "Should this integrate with the existing notification system?"

### Step 4: Propose 2-3 Approaches

Present approaches with trade-offs and your recommendation.

**Format**:
```
Based on our discussion, here are the approaches I see:

**Approach 1: {name}** (Recommended)
{2-3 sentence description}
- Pros: {benefits}
- Cons: {drawbacks}
- Effort: {relative estimate}

**Approach 2: {name}**
{2-3 sentence description}
- Pros: {benefits}
- Cons: {drawbacks}
- Effort: {relative estimate}

**Approach 3: {name}** (if applicable)
{2-3 sentence description}
- Pros: {benefits}
- Cons: {drawbacks}
- Effort: {relative estimate}

I recommend Approach {N} because {reasoning}.
```

Use `AskUserQuestion` to let the user pick:
- Options: Each approach name
- Description: Key differentiator for each

### Step 5: Present Design Section by Section

Once an approach is chosen, present the design in sections. Get approval after each section before moving to the next.

**Sections** (scale each to its complexity — a few sentences if straightforward, more detail if nuanced):

**Section 1: Overview & Goals**
```
## Overview
{What the feature does and why}

## Goals
- {Primary goal}
- {Secondary goals}
```
→ "Does this capture the intent? Any adjustments?"

**Section 2: Scope**
```
## Scope
- **In scope**: {What this feature includes}
- **Out of scope**: {What this feature does NOT include — YAGNI ruthlessly}
```
→ "Does this scope feel right?"

**Section 3: Design**
```
## Design
- **Approach**: {Chosen approach from Step 4}
- **Key decisions**:
  - {Decision 1 and reasoning}
  - {Decision 2 and reasoning}
```
→ "Any concerns with these design decisions?"

**Section 4: Technical Considerations**
```
## Technical Considerations
- {Key integration points}
- {Potential challenges}
- {Dependencies on existing systems}
```
→ "Anything I'm missing technically?"

**If user requests changes**: Revise that section and re-present it. Don't move forward until approved.

### Step 6: Create Feature

After all sections are approved, assemble the complete description and create the feature:

```
mcp__ticketrack__createFeature:
  name: {feature-name}
  description: {complete description with all approved sections}
  priority: {determined from discussion, default: medium}
```

The feature description stores the approved design — no separate design doc in `docs/plans/`.

### Step 6b: Store Structured Design

After creating the feature, also store the design as structured data using `updateFeatureDesign`. This enables programmatic access to design decisions.

```
mcp__ticketrack__updateFeatureDesign:
  featureName: {feature-name}
  approach: {chosen approach description from Step 4}
  decisions:
    - "{Decision 1 and reasoning}"
    - "{Decision 2 and reasoning}"
  approved: true
```

The structured design field complements the human-readable description. Both are stored on the feature YAML.

### Step 7: Display Summary

```
Feature '{feature-name}' created!

📋 Description:
{final-description}

🚀 Next Steps:
  - Create implementation plan and tickets: /tt-plan-feature {feature-name}
  - Check status: /tt-feature-status {feature-name}
```

## Key Principles

- **One question at a time** — Don't overwhelm with multiple questions
- **Multiple choice preferred** — Easier to answer than open-ended when possible
- **YAGNI ruthlessly** — Remove unnecessary features from all designs
- **Explore before asking** — Check the codebase first, then ask informed questions
- **2-3 approaches always** — Never jump straight to one solution
- **Incremental validation** — Present design section by section, get approval
- **Design in feature description** — No separate docs/plans/ file for design. Store in ticketrack.

## Error Handling

- **Feature exists**: "Feature '{name}' already exists. Use /tt-feature-status to check it or /tt-edit-feature to modify."
- **Invalid name**: "Feature name must be kebab-case (lowercase letters and hyphens only)."
- **MCP tool failure**: Report the specific error and suggest using CLI scripts as fallback.
