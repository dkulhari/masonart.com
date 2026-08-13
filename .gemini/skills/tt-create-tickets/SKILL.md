---
name: tt-create-tickets
description: "DEPRECATED: Use /tt-plan-feature instead, which generates plans AND creates tickets in one flow."
allowed-tools:
  - AskUserQuestion
---

# /tt-create-tickets - DEPRECATED

> **This skill has been retired.** Use `/tt-plan-feature` instead.

## What Changed

The `tt-plan-feature` skill now handles both plan generation AND ticket creation in a single flow. There is no longer a need for a separate ticket creation step.

## Migration

| Old Workflow | New Workflow |
|---|---|
| `/tt-plan-feature {name}` → `/tt-create-tickets {name}` | `/tt-plan-feature {name}` (does both) |

## If This Skill Is Invoked

Redirect the user:

```
⚠️ /tt-create-tickets has been retired.

Use /tt-plan-feature instead — it now generates the implementation plan
AND creates tickets with TDD steps in one flow.

Run: /tt-plan-feature {feature-name}
```
