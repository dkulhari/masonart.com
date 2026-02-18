---
name: tt-plan-feature
description: Generate an implementation plan for an existing feature. Use when a feature exists but needs a detailed plan.
allowed-tools:
  - mcp__ticketrack__listFeatures
  - mcp__ticketrack__editFeature
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

# /tt-plan-feature - Implementation Plan Generation

Generates a detailed implementation plan for an existing ticketrack feature and stores it in the feature description. Works with any project structure.

## Arguments

```
$ARGUMENTS: <feature-name>
```

- `feature-name`: Name of the existing feature to plan

**Example**: `/tt-plan-feature user-reviews`

## Workflow

### Step 1: Fetch Feature

1. Use `mcp__ticketrack__listFeatures` to find the feature
2. Verify the feature exists
3. Check if it already has an implementation plan (look for "## Implementation Plan" in description)

If feature has a plan, ask user: "Feature already has a plan. Do you want to regenerate it?"

### Step 2: Analyze Feature Requirements

Parse the feature description to understand:
- Core functionality needed
- User-facing features
- Data requirements
- Integration points

### Step 3: Discover Project Structure

Dynamically detect the project's architecture. Do NOT assume specific paths.

**Step 3a: Detect Project Type**

Use Glob to find key indicators:
```
- package.json, pnpm-workspace.yaml, lerna.json → monorepo?
- Cargo.toml, go.mod, requirements.txt → language/framework
- next.config.*, vite.config.*, angular.json → frontend framework
- prisma/, drizzle/, migrations/ → database layer
- src/, lib/, app/ → source structure
```

**Step 3b: Find Database Layer**

Search for database-related files:
```
- Glob: **/schema.{ts,js,prisma}, **/models/*.{ts,js,py}
- Glob: **/migrations/**, **/drizzle/**, **/prisma/**
- Grep: "createTable", "Schema", "model", "@Entity"
```

**Step 3c: Find API/Backend Layer**

Search for API patterns:
```
- Glob: **/routes/**/*.{ts,js}, **/api/**/*.{ts,js}
- Glob: **/controllers/**/*.{ts,js}, **/handlers/**/*.{ts,js}
- Grep: "router", "endpoint", "handler", "@Controller"
```

**Step 3d: Find Frontend Layer**

Search for UI components:
```
- Glob: **/components/**/*.{tsx,jsx,vue,svelte}
- Glob: **/pages/**/*.{tsx,jsx}, **/app/**/*.{tsx,jsx}
- Grep: "React", "Vue", "Svelte", "Component"
```

**Step 3e: Find Test Patterns**

Search for test files:
```
- Glob: **/*.test.{ts,js}, **/*.spec.{ts,js}
- Glob: **/tests/**/*.{ts,js}, **/__tests__/**/*.{ts,js}
```

**Step 3f: Read Representative Files**

Read 1-2 files from each discovered layer to understand:
- Naming conventions
- Code patterns
- Framework-specific idioms

### Step 4: Generate Implementation Plan

Create a phased plan based on feature requirements AND the discovered project structure.

**Adapt Phases to Project**:
- Only include phases relevant to the project (e.g., skip "Frontend" for backend-only projects)
- Use actual paths discovered in Step 3
- Reference actual patterns found in the codebase

**Plan Template** (adapt based on project):

```markdown
## Overview
{Feature description - preserve original}

## Testing Strategy

| Level | Scope | What to Test | Tool |
|-------|-------|--------------|------|
| Unit | Per ticket | Schema validation, service functions, hooks, stores | Vitest |
| Integration | Per ticket | API routes, middleware, database operations | Vitest + supertest |
| Component | Per ticket | Complex React components (if applicable) | Testing Library |
| E2E | Per feature | Full pages, user flows (after all tickets complete) | Playwright |

## Implementation Plan

**Note**: Each task includes unit/integration tests. E2E tests are added at feature completion.

### Phase 1: {Layer Name - e.g., "Database Schema", "Data Models"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ unit tests)
- [ ] {Specific task 2} (+ unit tests)

### Phase 2: {Layer Name - e.g., "Backend API", "Services"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ route tests)
- [ ] {Specific task 2} (+ route tests)

### Phase 3: {Layer Name - e.g., "Frontend", "UI Components"}
Location: {actual path discovered}
Pattern: {pattern observed in codebase}
- [ ] {Specific task 1} (+ component tests if complex)
- [ ] {Specific task 2} (+ component tests if complex)

### Final Phase: E2E Tests
Location: {e2e test path, e.g., tests/e2e/}
Pattern: {e2e test pattern observed}
- [ ] Page-level E2E tests for new pages
- [ ] Flow tests for user journeys
- [ ] Manual test documentation

## Technical Notes
- Project type: {detected type}
- Key frameworks: {detected frameworks}
- Patterns to follow: {observed patterns}
- Unit test location: {actual test path discovered}
- E2E test location: {e2e test path discovered}

## Dependencies
{External dependencies, other features this builds on}
```

**Guidelines for Plan Generation**:
- Be specific: "Create reviews table with userId, productId, rating, comment" not "Create database tables"
- Follow existing patterns: Use the patterns discovered in Step 3
- Use actual paths: Reference real directories from the project
- Consider scale: Break large phases into sub-phases if needed
- Note dependencies: Mark which tasks depend on others
- Include tests: Each task should include writing tests - no separate testing phase

### Step 5: Review Plan with User

Present the generated plan and ask if it looks correct:
- Use `AskUserQuestion` with options: "Looks good", "Needs adjustments"
- If adjustments needed, ask what to change and regenerate

### Step 6: Update Feature

Store the plan in the feature description:

```
mcp__ticketrack__editFeature:
  featureName: {feature-name}
  description: {original description + implementation plan}
```

### Step 7: Display Summary

Show the generated plan to the user with:
- Summary of phases
- Detected project structure
- Estimated ticket count
- Next step suggestion

## Output Format

```
Implementation Plan for '{feature-name}'

Project Structure Detected:
  - Type: {monorepo/single-app/etc}
  - Database: {path or "none detected"}
  - Backend: {path or "none detected"}
  - Frontend: {path or "none detected"}
  - Tests: {path or "none detected"}

{Display the full plan}

Plan Summary:
  - {Phase 1 name}: {X} tasks (each includes tests)
  - {Phase 2 name}: {X} tasks (each includes tests)
  - ...
  - Total: {X} tasks

Plan saved to feature description

Next Step:
  - Create tickets: /tt-create-tickets {feature-name}
```

## Error Handling

- **Feature not found**: "Feature '{name}' not found. Create it first with /tt-new-feature."
- **No structure detected**: Ask user to describe their project structure, then generate plan based on their input.
- **Analysis failure**: Proceed with generic plan template, note which areas couldn't be analyzed.
