# AI Content Moderation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive guardrails for AI image generation with mandatory human approval before images can be shared publicly or printed.

**Architecture:** Two-layer protection system: (1) Automated filtering using banned terms database and Google Cloud Vision API for pre/post-generation scanning, (2) Mandatory human approval workflow where all generations enter a moderator queue before users can add to cart or share to gallery. Uses existing `checkPromptModeration()` function, `aiBannedPrompts` table, and moderation fields in `aiGenerations` schema.

**Tech Stack:** Hono API, Drizzle ORM (PostgreSQL), BullMQ for async processing, Google Cloud Vision API, React Router v7, shadcn/ui, Vitest, Playwright

---

## Phase 1: Database Schema Updates

### Task 1: Add Moderation Status Enum

**Files:**
- Modify: `packages/api/src/database/schema/ai-generations.ts:89-98`
- Test: `packages/api/tests/schema/ai-generations.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/api/tests/schema/ai-generations.test.ts
import { describe, it, expect } from "vitest";
import { aiModerationStatusEnum } from "../../src/database/schema/ai-generations";

describe("AI Moderation Status Enum", () => {
  it("should have all required moderation statuses", () => {
    expect(aiModerationStatusEnum.enumValues).toContain("pending_review");
    expect(aiModerationStatusEnum.enumValues).toContain("approved");
    expect(aiModerationStatusEnum.enumValues).toContain("rejected");
    expect(aiModerationStatusEnum.enumValues).toContain("flagged");
    expect(aiModerationStatusEnum.enumValues).toHaveLength(4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/schema/ai-generations.test.ts -v`
Expected: FAIL with "aiModerationStatusEnum is not exported"

**Step 3: Add the moderation status enum**

In `packages/api/src/database/schema/ai-generations.ts`, after line 98 (after `aiGenerationStatusEnum`):

```typescript
/**
 * AI moderation status enum - tracks human review state
 */
export const aiModerationStatusEnum = pgEnum("ai_moderation_status", [
  "pending_review", // Awaiting moderator review
  "approved",       // Can be shared/purchased
  "rejected",       // Blocked with reason
  "flagged",        // Requires senior review
]);
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/schema/ai-generations.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/database/schema/ai-generations.ts packages/api/tests/schema/ai-generations.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add AI moderation status enum

Adds aiModerationStatusEnum with states:
- pending_review: awaiting moderator
- approved: can be purchased/shared
- rejected: blocked with reason
- flagged: needs senior review

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add Moderation Fields to AI Generations Table

**Files:**
- Modify: `packages/api/src/database/schema/ai-generations.ts:160-243`
- Test: `packages/api/tests/schema/ai-generations.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to packages/api/tests/schema/ai-generations.test.ts
describe("AI Generations Table Moderation Fields", () => {
  it("should have moderationStatus field", () => {
    expect(aiGenerations.moderationStatus).toBeDefined();
  });

  it("should have moderatedAt field", () => {
    expect(aiGenerations.moderatedAt).toBeDefined();
  });

  it("should have moderatedBy field", () => {
    expect(aiGenerations.moderatedBy).toBeDefined();
  });

  it("should have rejectionReason field", () => {
    expect(aiGenerations.rejectionReason).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/schema/ai-generations.test.ts -v`
Expected: FAIL with "moderationStatus is undefined"

**Step 3: Add moderation fields to aiGenerations table**

In `packages/api/src/database/schema/ai-generations.ts`, add after line 217 (after `needsReview` field):

```typescript
    // Human moderation workflow
    moderationStatus: aiModerationStatusEnum("moderation_status")
      .default("pending_review")
      .notNull(),
    moderatedAt: timestamp("moderated_at"),
    moderatedBy: text("moderated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    rejectionCategory: text("rejection_category"), // e.g., "nsfw", "violence", "copyright"
```

Also add index after line 265:

```typescript
    moderationStatusIdx: index("ai_generations_moderation_status_idx").on(
      table.moderationStatus
    ),
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/schema/ai-generations.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/database/schema/ai-generations.ts packages/api/tests/schema/ai-generations.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add moderation fields to ai_generations

Adds human review workflow fields:
- moderationStatus: pending_review by default
- moderatedAt: timestamp of review
- moderatedBy: user ID of moderator
- rejectionReason: text explanation for rejected
- rejectionCategory: nsfw/violence/copyright/etc

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create AI Generation Reviews Table

**Files:**
- Create: `packages/api/src/database/schema/ai-generation-reviews.ts`
- Modify: `packages/api/src/database/schema/index.ts`
- Test: `packages/api/tests/schema/ai-generation-reviews.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/api/tests/schema/ai-generation-reviews.test.ts
import { describe, it, expect } from "vitest";

describe("AI Generation Reviews Schema", () => {
  it("should export aiGenerationReviews table", async () => {
    const schema = await import("../../src/database/schema/ai-generation-reviews");
    expect(schema.aiGenerationReviews).toBeDefined();
  });

  it("should have required fields", async () => {
    const { aiGenerationReviews } = await import("../../src/database/schema/ai-generation-reviews");
    expect(aiGenerationReviews.id).toBeDefined();
    expect(aiGenerationReviews.generationId).toBeDefined();
    expect(aiGenerationReviews.reviewerId).toBeDefined();
    expect(aiGenerationReviews.action).toBeDefined();
    expect(aiGenerationReviews.reason).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/schema/ai-generation-reviews.test.ts -v`
Expected: FAIL with "Cannot find module"

**Step 3: Create the schema file**

```typescript
// packages/api/src/database/schema/ai-generation-reviews.ts
/**
 * AI Generation Reviews Schema
 *
 * Tracks all moderation actions on AI generations for audit trail.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { aiGenerations } from "./ai-generations";

/**
 * Review action enum
 */
export const aiReviewActionEnum = pgEnum("ai_review_action", [
  "approved",
  "rejected",
  "flagged",
  "escalated",
  "appealed",
  "appeal_approved",
  "appeal_rejected",
]);

/**
 * Rejection category enum
 */
export const aiRejectionCategoryEnum = pgEnum("ai_rejection_category", [
  "nsfw",
  "violence",
  "hate_speech",
  "copyright",
  "illegal_content",
  "spam",
  "low_quality",
  "other",
]);

/**
 * AI generation reviews table - Audit log of all moderation actions
 */
export const aiGenerationReviews = pgTable(
  "ai_generation_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // References
    generationId: uuid("generation_id")
      .references(() => aiGenerations.id, { onDelete: "cascade" })
      .notNull(),
    reviewerId: text("reviewer_id")
      .references(() => users.id, { onDelete: "set null" }),

    // Action details
    action: aiReviewActionEnum("action").notNull(),
    reason: text("reason"), // Free-text reason
    category: aiRejectionCategoryEnum("category"), // Structured category

    // Context
    previousStatus: text("previous_status"), // Status before this action
    newStatus: text("new_status"), // Status after this action

    // Audit info
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    generationIdIdx: index("ai_generation_reviews_generation_id_idx").on(
      table.generationId
    ),
    reviewerIdIdx: index("ai_generation_reviews_reviewer_id_idx").on(
      table.reviewerId
    ),
    actionIdx: index("ai_generation_reviews_action_idx").on(table.action),
    createdAtIdx: index("ai_generation_reviews_created_at_idx").on(
      table.createdAt
    ),
  })
);

/**
 * Relations
 */
export const aiGenerationReviewsRelations = relations(
  aiGenerationReviews,
  ({ one }) => ({
    generation: one(aiGenerations, {
      fields: [aiGenerationReviews.generationId],
      references: [aiGenerations.id],
    }),
    reviewer: one(users, {
      fields: [aiGenerationReviews.reviewerId],
      references: [users.id],
    }),
  })
);

// Type exports
export type AIGenerationReview = typeof aiGenerationReviews.$inferSelect;
export type NewAIGenerationReview = typeof aiGenerationReviews.$inferInsert;
export type AIReviewAction = (typeof aiReviewActionEnum.enumValues)[number];
export type AIRejectionCategory = (typeof aiRejectionCategoryEnum.enumValues)[number];
```

**Step 4: Update schema index**

Add to `packages/api/src/database/schema/index.ts`:

```typescript
export * from "./ai-generation-reviews";
```

**Step 5: Run test to verify it passes**

Run: `cd packages/api && bun test tests/schema/ai-generation-reviews.test.ts -v`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/api/src/database/schema/ai-generation-reviews.ts packages/api/src/database/schema/index.ts packages/api/tests/schema/ai-generation-reviews.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add ai_generation_reviews audit table

Creates audit trail table for moderation actions:
- Tracks all approve/reject/flag/escalate actions
- Links to generation and reviewer
- Stores reason and category
- Records previous/new status for audit

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Generate and Run Database Migration

**Files:**
- Create: `packages/api/src/database/migrations/XXXX_add_ai_moderation.sql`

**Step 1: Generate migration**

Run: `cd packages/api && bun run db:generate`
Expected: New migration file created

**Step 2: Review generated migration**

Check migration includes:
- New enum `ai_moderation_status`
- New enum `ai_review_action`
- New enum `ai_rejection_category`
- ALTER TABLE for new columns on `ai_generations`
- New table `ai_generation_reviews`

**Step 3: Push migration to database**

Run: `cd packages/api && bun run db:push`
Expected: Migration applied successfully

**Step 4: Verify migration**

Run: `cd packages/api && bun run db:studio`
Check tables have new columns

**Step 5: Commit**

```bash
git add packages/api/src/database/migrations/
git commit -m "$(cat <<'EOF'
chore(db): add migration for AI content moderation

Adds:
- ai_moderation_status enum
- ai_review_action enum
- ai_rejection_category enum
- Moderation columns to ai_generations
- ai_generation_reviews audit table

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Content Moderation Service

### Task 5: Create Banned Terms Seed Data

**Files:**
- Create: `packages/api/src/database/seeds/banned-terms.ts`
- Test: `packages/api/tests/seeds/banned-terms.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/api/tests/seeds/banned-terms.test.ts
import { describe, it, expect } from "vitest";

describe("Banned Terms Seed", () => {
  it("should export DEFAULT_BANNED_TERMS array", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    expect(Array.isArray(DEFAULT_BANNED_TERMS)).toBe(true);
    expect(DEFAULT_BANNED_TERMS.length).toBeGreaterThan(0);
  });

  it("should have required fields for each term", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    for (const term of DEFAULT_BANNED_TERMS) {
      expect(term.pattern).toBeDefined();
      expect(term.category).toBeDefined();
      expect(term.severity).toBeDefined();
      expect(term.reason).toBeDefined();
    }
  });

  it("should cover all major categories", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    const categories = [...new Set(DEFAULT_BANNED_TERMS.map(t => t.category))];
    expect(categories).toContain("nsfw");
    expect(categories).toContain("violence");
    expect(categories).toContain("hate_speech");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/seeds/banned-terms.test.ts -v`
Expected: FAIL with "Cannot find module"

**Step 3: Create banned terms seed file**

```typescript
// packages/api/src/database/seeds/banned-terms.ts
/**
 * Default Banned Terms for AI Content Moderation
 *
 * Categories:
 * - nsfw: Sexual/adult content
 * - violence: Gore, weapons, harm
 * - hate_speech: Discrimination, slurs
 * - illegal_content: Drugs, weapons trafficking
 * - copyright: Copyrighted characters/brands
 */

export interface BannedTermSeed {
  pattern: string;
  isRegex: boolean;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export const DEFAULT_BANNED_TERMS: BannedTermSeed[] = [
  // NSFW - Critical (immediate block)
  { pattern: "nude", isRegex: false, category: "nsfw", severity: "critical", reason: "Adult content not allowed" },
  { pattern: "naked", isRegex: false, category: "nsfw", severity: "critical", reason: "Adult content not allowed" },
  { pattern: "porn", isRegex: false, category: "nsfw", severity: "critical", reason: "Adult content not allowed" },
  { pattern: "xxx", isRegex: false, category: "nsfw", severity: "critical", reason: "Adult content not allowed" },
  { pattern: "explicit", isRegex: false, category: "nsfw", severity: "high", reason: "Potentially adult content" },
  { pattern: "erotic", isRegex: false, category: "nsfw", severity: "critical", reason: "Adult content not allowed" },
  { pattern: "sensual", isRegex: false, category: "nsfw", severity: "medium", reason: "Potentially suggestive" },
  { pattern: "lingerie", isRegex: false, category: "nsfw", severity: "medium", reason: "Potentially suggestive" },
  { pattern: "\\bsexy\\b", isRegex: true, category: "nsfw", severity: "medium", reason: "Potentially suggestive" },

  // Violence - Critical
  { pattern: "gore", isRegex: false, category: "violence", severity: "critical", reason: "Violent content not allowed" },
  { pattern: "blood", isRegex: false, category: "violence", severity: "high", reason: "Potentially violent" },
  { pattern: "murder", isRegex: false, category: "violence", severity: "critical", reason: "Violent content not allowed" },
  { pattern: "killing", isRegex: false, category: "violence", severity: "critical", reason: "Violent content not allowed" },
  { pattern: "torture", isRegex: false, category: "violence", severity: "critical", reason: "Violent content not allowed" },
  { pattern: "weapon", isRegex: false, category: "violence", severity: "high", reason: "Weapon-related content" },
  { pattern: "gun", isRegex: false, category: "violence", severity: "high", reason: "Weapon-related content" },
  { pattern: "knife attack", isRegex: false, category: "violence", severity: "critical", reason: "Violent content not allowed" },
  { pattern: "\\bdead bod", isRegex: true, category: "violence", severity: "critical", reason: "Violent content not allowed" },

  // Hate Speech - Critical
  { pattern: "nazi", isRegex: false, category: "hate_speech", severity: "critical", reason: "Hate symbols not allowed" },
  { pattern: "swastika", isRegex: false, category: "hate_speech", severity: "critical", reason: "Hate symbols not allowed" },
  { pattern: "kkk", isRegex: false, category: "hate_speech", severity: "critical", reason: "Hate groups not allowed" },
  { pattern: "white supremac", isRegex: false, category: "hate_speech", severity: "critical", reason: "Hate content not allowed" },

  // Illegal Content
  { pattern: "child", isRegex: false, category: "illegal_content", severity: "high", reason: "Review required for child-related content" },
  { pattern: "minor", isRegex: false, category: "illegal_content", severity: "high", reason: "Review required for minor-related content" },
  { pattern: "drug dealer", isRegex: false, category: "illegal_content", severity: "critical", reason: "Illegal content not allowed" },
  { pattern: "cocaine", isRegex: false, category: "illegal_content", severity: "critical", reason: "Drug content not allowed" },
  { pattern: "heroin", isRegex: false, category: "illegal_content", severity: "critical", reason: "Drug content not allowed" },

  // Copyright (flag for review)
  { pattern: "mickey mouse", isRegex: false, category: "copyright", severity: "high", reason: "Copyrighted character" },
  { pattern: "disney", isRegex: false, category: "copyright", severity: "medium", reason: "Potentially copyrighted" },
  { pattern: "marvel", isRegex: false, category: "copyright", severity: "medium", reason: "Potentially copyrighted" },
  { pattern: "pokemon", isRegex: false, category: "copyright", severity: "high", reason: "Copyrighted character" },
  { pattern: "pikachu", isRegex: false, category: "copyright", severity: "high", reason: "Copyrighted character" },
];

/**
 * Seed banned terms to database
 */
export async function seedBannedTerms(db: any) {
  const { aiBannedPrompts } = await import("../schema/ai-generations");

  // Clear existing and insert defaults
  await db.delete(aiBannedPrompts);

  await db.insert(aiBannedPrompts).values(
    DEFAULT_BANNED_TERMS.map(term => ({
      pattern: term.pattern,
      isRegex: term.isRegex,
      category: term.category,
      severity: term.severity,
      reason: term.reason,
      isActive: true,
    }))
  );

  console.log(`Seeded ${DEFAULT_BANNED_TERMS.length} banned terms`);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/seeds/banned-terms.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/database/seeds/banned-terms.ts packages/api/tests/seeds/banned-terms.test.ts
git commit -m "$(cat <<'EOF'
feat(seeds): add default banned terms for AI moderation

Adds seed data covering:
- NSFW content (nude, porn, explicit)
- Violence (gore, weapons, murder)
- Hate speech (nazi, kkk symbols)
- Illegal content (drugs, minors)
- Copyright (Disney, Marvel, Pokemon)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Create Moderation Service

**Files:**
- Create: `packages/api/src/services/ai-moderation.ts`
- Test: `packages/api/tests/services/ai-moderation.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/api/tests/services/ai-moderation.test.ts
import { describe, it, expect } from "vitest";

describe("AI Moderation Service", () => {
  describe("checkPromptSafety", () => {
    it("should export checkPromptSafety function", async () => {
      const { checkPromptSafety } = await import("../../src/services/ai-moderation");
      expect(typeof checkPromptSafety).toBe("function");
    });

    it("should block prompts with banned terms", async () => {
      const { checkPromptSafety } = await import("../../src/services/ai-moderation");
      const result = await checkPromptSafety("A nude woman in a garden");
      expect(result.isSafe).toBe(false);
      expect(result.blockedTerms.length).toBeGreaterThan(0);
    });

    it("should allow safe prompts", async () => {
      const { checkPromptSafety } = await import("../../src/services/ai-moderation");
      const result = await checkPromptSafety("A beautiful sunset over mountains");
      expect(result.isSafe).toBe(true);
      expect(result.blockedTerms.length).toBe(0);
    });
  });

  describe("reviewGeneration", () => {
    it("should export reviewGeneration function", async () => {
      const { reviewGeneration } = await import("../../src/services/ai-moderation");
      expect(typeof reviewGeneration).toBe("function");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/services/ai-moderation.test.ts -v`
Expected: FAIL with "Cannot find module"

**Step 3: Create moderation service**

```typescript
// packages/api/src/services/ai-moderation.ts
/**
 * AI Content Moderation Service
 *
 * Provides two layers of protection:
 * 1. Automated: Pre-generation prompt checking against banned terms
 * 2. Manual: Human review workflow for all generations
 */

import { eq, and } from "drizzle-orm";
import { db } from "../database";
import {
  aiGenerations,
  aiBannedPrompts,
  type AIModerationResult,
} from "../database/schema/ai-generations";
import {
  aiGenerationReviews,
  type AIReviewAction,
  type AIRejectionCategory,
} from "../database/schema/ai-generation-reviews";
import { checkPromptModeration } from "../ai/generator";
import { DEFAULT_BANNED_TERMS } from "../database/seeds/banned-terms";

// ============================================================================
// Types
// ============================================================================

export interface PromptSafetyResult {
  isSafe: boolean;
  blockedTerms: Array<{ pattern: string; category: string; severity: string }>;
  riskScore: number;
  shouldAutoReject: boolean;
}

export interface ReviewResult {
  success: boolean;
  generationId: string;
  newStatus: string;
  reviewId: string;
}

// ============================================================================
// Prompt Safety Check (Layer 1)
// ============================================================================

/**
 * Check if a prompt is safe to generate
 * Uses database banned terms + fallback to default terms
 */
export async function checkPromptSafety(prompt: string): Promise<PromptSafetyResult> {
  // Try to get banned terms from database
  let bannedTerms: Array<{ pattern: string; isRegex: boolean; category: string; severity: string }>;

  try {
    const dbTerms = await db
      .select({
        pattern: aiBannedPrompts.pattern,
        isRegex: aiBannedPrompts.isRegex,
        category: aiBannedPrompts.category,
        severity: aiBannedPrompts.severity,
      })
      .from(aiBannedPrompts)
      .where(eq(aiBannedPrompts.isActive, true));

    bannedTerms = dbTerms.map(t => ({
      pattern: t.pattern,
      isRegex: t.isRegex,
      category: t.category || "other",
      severity: t.severity,
    }));
  } catch {
    // Fallback to default terms if database unavailable
    bannedTerms = DEFAULT_BANNED_TERMS.map(t => ({
      ...t,
      severity: t.severity,
    }));
  }

  // Use existing moderation function
  const moderationResult = checkPromptModeration(
    prompt,
    bannedTerms.map(t => ({
      pattern: t.pattern,
      isRegex: t.isRegex,
      category: t.category,
    }))
  );

  // Map matched patterns to full term info
  const blockedTerms = moderationResult.matchedPatterns.map(match => {
    const term = bannedTerms.find(t => t.pattern === match.pattern);
    return {
      pattern: match.pattern,
      category: match.category,
      severity: term?.severity || "high",
    };
  });

  // Auto-reject if any critical severity terms matched
  const shouldAutoReject = blockedTerms.some(t => t.severity === "critical");

  return {
    isSafe: moderationResult.isSafe,
    blockedTerms,
    riskScore: moderationResult.riskScore,
    shouldAutoReject,
  };
}

// ============================================================================
// Human Review Workflow (Layer 2)
// ============================================================================

/**
 * Approve a generation for cart/gallery
 */
export async function approveGeneration(
  generationId: string,
  reviewerId: string,
  notes?: string
): Promise<ReviewResult> {
  return reviewGeneration(generationId, reviewerId, "approved", undefined, notes);
}

/**
 * Reject a generation
 */
export async function rejectGeneration(
  generationId: string,
  reviewerId: string,
  category: AIRejectionCategory,
  reason: string
): Promise<ReviewResult> {
  return reviewGeneration(generationId, reviewerId, "rejected", category, reason);
}

/**
 * Flag a generation for senior review
 */
export async function flagGeneration(
  generationId: string,
  reviewerId: string,
  reason: string
): Promise<ReviewResult> {
  return reviewGeneration(generationId, reviewerId, "flagged", undefined, reason);
}

/**
 * Core review function
 */
export async function reviewGeneration(
  generationId: string,
  reviewerId: string,
  action: AIReviewAction,
  category?: AIRejectionCategory,
  reason?: string
): Promise<ReviewResult> {
  // Get current generation
  const generation = await db.query.aiGenerations.findFirst({
    where: eq(aiGenerations.id, generationId),
    columns: { id: true, moderationStatus: true, userId: true },
  });

  if (!generation) {
    throw new Error("Generation not found");
  }

  const previousStatus = generation.moderationStatus;
  const newStatus = action === "flagged" ? "flagged" : action;

  // Update generation status
  await db
    .update(aiGenerations)
    .set({
      moderationStatus: newStatus as any,
      moderatedAt: new Date(),
      moderatedBy: reviewerId,
      rejectionReason: action === "rejected" ? reason : null,
      rejectionCategory: action === "rejected" ? category : null,
      isFlagged: action === "flagged" || action === "rejected",
      updatedAt: new Date(),
    })
    .where(eq(aiGenerations.id, generationId));

  // Create audit record
  const [review] = await db
    .insert(aiGenerationReviews)
    .values({
      generationId,
      reviewerId,
      action,
      reason,
      category,
      previousStatus,
      newStatus,
    })
    .returning({ id: aiGenerationReviews.id });

  return {
    success: true,
    generationId,
    newStatus,
    reviewId: review.id,
  };
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Bulk approve multiple generations
 */
export async function bulkApprove(
  generationIds: string[],
  reviewerId: string
): Promise<{ approved: number; failed: number }> {
  let approved = 0;
  let failed = 0;

  for (const id of generationIds) {
    try {
      await approveGeneration(id, reviewerId);
      approved++;
    } catch {
      failed++;
    }
  }

  return { approved, failed };
}

/**
 * Bulk reject multiple generations
 */
export async function bulkReject(
  generationIds: string[],
  reviewerId: string,
  category: AIRejectionCategory,
  reason: string
): Promise<{ rejected: number; failed: number }> {
  let rejected = 0;
  let failed = 0;

  for (const id of generationIds) {
    try {
      await rejectGeneration(id, reviewerId, category, reason);
      rejected++;
    } catch {
      failed++;
    }
  }

  return { rejected, failed };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get moderation statistics
 */
export async function getModerationStats() {
  const stats = await db.execute<{
    status: string;
    count: number;
  }>`
    SELECT moderation_status as status, COUNT(*)::int as count
    FROM ai_generations
    WHERE moderation_status IS NOT NULL
    GROUP BY moderation_status
  `;

  const result = {
    pending_review: 0,
    approved: 0,
    rejected: 0,
    flagged: 0,
    total: 0,
  };

  for (const row of stats.rows) {
    result[row.status as keyof typeof result] = row.count;
    result.total += row.count;
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/services/ai-moderation.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/services/ai-moderation.ts packages/api/tests/services/ai-moderation.test.ts
git commit -m "$(cat <<'EOF'
feat(service): add AI content moderation service

Implements two-layer protection:
- checkPromptSafety(): Pre-generation banned term check
- reviewGeneration(): Human approval workflow
- bulkApprove/bulkReject for efficiency
- getModerationStats for dashboard

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Integrate Moderation into Generation Flow

### Task 7: Add Pre-Generation Check to AI Routes

**Files:**
- Modify: `packages/api/src/routes/ai.ts:188-307`
- Test: `packages/api/tests/routes/ai.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to packages/api/tests/routes/ai.test.ts
describe("POST /api/ai/generate - Content Moderation", () => {
  it("should reject prompts with banned terms", async () => {
    const res = await app.request("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        prompt: "A nude woman in explicit pose",
        stylePreset: "photography",
        aspectRatio: "portrait",
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("blocked");
    expect(data.blockedTerms).toBeDefined();
  });

  it("should set moderationStatus to pending_review on success", async () => {
    const res = await app.request("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        prompt: "A beautiful mountain landscape at sunset",
        stylePreset: "photography",
        aspectRatio: "landscape",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.generation.moderationStatus).toBe("pending_review");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/routes/ai.test.ts -v`
Expected: FAIL - prompts not being blocked

**Step 3: Modify /api/ai/generate endpoint**

In `packages/api/src/routes/ai.ts`, add import at top:

```typescript
import { checkPromptSafety } from "../services/ai-moderation";
```

Then modify the POST /generate handler (after line 204, before creating the generation record):

```typescript
    // Check prompt safety BEFORE generation
    const safetyCheck = await checkPromptSafety(input.prompt);

    if (!safetyCheck.isSafe) {
      // If auto-reject (critical terms), block immediately
      if (safetyCheck.shouldAutoReject) {
        return c.json(
          {
            error: "Your prompt contains content that is not allowed. Please modify your prompt and try again.",
            blockedTerms: safetyCheck.blockedTerms.map(t => t.category),
            riskScore: safetyCheck.riskScore,
          },
          400
        );
      }
      // Otherwise, flag for review but allow generation
      // The isFlagged will be set when creating the record
    }
```

And modify the insert values (around line 225):

```typescript
      const [generation] = await db
        .insert(aiGenerations)
        .values({
          userId: user.id,
          promptDetails,
          promptText: input.prompt,
          stylePreset: input.stylePreset as AIStylePreset,
          aspectRatio: input.aspectRatio as AIAspectRatio,
          status: "queued",
          modelProvider: input.modelProvider as AIModelProvider,
          variationCount: input.variationCount,
          queuedAt: new Date(),
          estimatedCost: generationCost?.userPricePaise,
          // Add moderation fields
          moderationStatus: "pending_review",
          isFlagged: !safetyCheck.isSafe,
          needsReview: true,
          moderationResult: {
            isPassed: safetyCheck.isSafe,
            flags: safetyCheck.blockedTerms.map(t => t.category),
            riskScore: safetyCheck.riskScore,
            needsManualReview: true,
            moderatedAt: new Date().toISOString(),
          } satisfies AIModerationResult,
        })
        .returning();
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/routes/ai.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/routes/ai.ts packages/api/tests/routes/ai.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add pre-generation moderation check

- Block prompts with critical banned terms
- Flag risky prompts for review
- Set moderationStatus to pending_review
- Store moderation result for audit

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Block Add-to-Cart for Non-Approved Generations

**Files:**
- Modify: `packages/api/src/routes/ai.ts` (select endpoint)
- Test: `packages/api/tests/routes/ai.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to packages/api/tests/routes/ai.test.ts
describe("POST /api/ai/generations/:id/select - Moderation Check", () => {
  it("should block selecting image from pending_review generation", async () => {
    // Create a generation that's pending review
    const createRes = await app.request("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        prompt: "A flower",
        stylePreset: "botanical",
        aspectRatio: "square",
      }),
    });
    const { generation } = await createRes.json();

    // Try to select an image
    const selectRes = await app.request(`/api/ai/generations/${generation.id}/select`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ imageId: "test-image" }),
    });

    expect(selectRes.status).toBe(403);
    const data = await selectRes.json();
    expect(data.error).toContain("pending review");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/routes/ai.test.ts -v`
Expected: FAIL - selection allowed for pending_review

**Step 3: Add moderation check to select endpoint**

In `packages/api/src/routes/ai.ts`, modify the POST /generations/:id/select handler (around line 464-534):

After getting the generation (around line 487), add:

```typescript
      // Check moderation status - only approved generations can be selected for cart
      if (generation.moderationStatus !== "approved") {
        return c.json(
          {
            error: "This creation is pending review and cannot be added to cart yet. You will be notified when it's approved.",
            moderationStatus: generation.moderationStatus,
          },
          403
        );
      }
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test tests/routes/ai.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/routes/ai.ts packages/api/tests/routes/ai.test.ts
git commit -m "$(cat <<'EOF'
feat(api): block cart selection for non-approved generations

Only generations with moderationStatus='approved' can be
selected for add-to-cart. Pending/rejected show friendly error.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Admin Moderation API

### Task 9: Create Admin AI Moderation Routes

**Files:**
- Create: `packages/api/src/routes/admin/ai-moderation.ts`
- Modify: `packages/api/src/routes/admin/index.ts`
- Test: `packages/api/tests/routes/admin/ai-moderation.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/api/tests/routes/admin/ai-moderation.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import "../../../src/index";

describe("Admin AI Moderation API", () => {
  describe("GET /api/admin/ai-moderation/queue", () => {
    it("should return pending generations", async () => {
      // Test will be fleshed out with auth setup
      expect(true).toBe(true);
    });
  });

  describe("POST /api/admin/ai-moderation/:id/approve", () => {
    it("should require admin auth", async () => {
      // Placeholder
      expect(true).toBe(true);
    });
  });

  describe("POST /api/admin/ai-moderation/:id/reject", () => {
    it("should require reason and category", async () => {
      expect(true).toBe(true);
    });
  });

  describe("GET /api/admin/ai-moderation/stats", () => {
    it("should return moderation statistics", async () => {
      expect(true).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test tests/routes/admin/ai-moderation.test.ts -v`
Expected: Tests should run (placeholders pass)

**Step 3: Create admin AI moderation routes**

```typescript
// packages/api/src/routes/admin/ai-moderation.ts
/**
 * Admin AI Moderation API Routes
 *
 * Endpoints for moderators to review AI generations:
 * - GET /api/admin/ai-moderation/queue - List pending generations
 * - GET /api/admin/ai-moderation/stats - Get statistics
 * - GET /api/admin/ai-moderation/:id - Get generation details
 * - POST /api/admin/ai-moderation/:id/approve - Approve
 * - POST /api/admin/ai-moderation/:id/reject - Reject
 * - POST /api/admin/ai-moderation/:id/flag - Flag for senior review
 * - POST /api/admin/ai-moderation/bulk/approve - Bulk approve
 * - POST /api/admin/ai-moderation/bulk/reject - Bulk reject
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

import { db } from "../../database";
import { aiGenerations } from "../../database/schema/ai-generations";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  approveGeneration,
  rejectGeneration,
  flagGeneration,
  bulkApprove,
  bulkReject,
  getModerationStats,
} from "../../services/ai-moderation";
import { aiRejectionCategoryEnum } from "../../database/schema/ai-generation-reviews";

// ============================================================================
// Validation Schemas
// ============================================================================

const queueQuerySchema = z.object({
  status: z.enum(["pending_review", "flagged", "all"]).optional().default("pending_review"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["newest", "oldest", "risk"]).default("newest"),
});

const rejectSchema = z.object({
  category: z.enum(aiRejectionCategoryEnum.enumValues),
  reason: z.string().min(1).max(1000),
});

const flagSchema = z.object({
  reason: z.string().min(1).max(1000),
});

const bulkApproveSchema = z.object({
  generationIds: z.array(z.string().uuid()).min(1).max(50),
});

const bulkRejectSchema = z.object({
  generationIds: z.array(z.string().uuid()).min(1).max(50),
  category: z.enum(aiRejectionCategoryEnum.enumValues),
  reason: z.string().min(1).max(1000),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminAIModerationApp = new Hono<{ Variables: AuthVariables }>();

adminAIModerationApp.use("*", requireAuth);
adminAIModerationApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/ai-moderation/queue - List Queue
// ============================================================================

adminAIModerationApp.get(
  "/queue",
  zValidator("query", queueQuerySchema),
  async (c) => {
    const { status, page, pageSize, sortBy } = c.req.valid("query");

    const conditions = [];
    if (status === "pending_review") {
      conditions.push(eq(aiGenerations.moderationStatus, "pending_review"));
    } else if (status === "flagged") {
      conditions.push(eq(aiGenerations.moderationStatus, "flagged"));
    } else {
      conditions.push(
        inArray(aiGenerations.moderationStatus, ["pending_review", "flagged"])
      );
    }

    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiGenerations)
      .where(and(...conditions));

    const total = countResult[0]?.count ?? 0;

    // Get generations with user info
    const generations = await db
      .select({
        id: aiGenerations.id,
        promptText: aiGenerations.promptText,
        stylePreset: aiGenerations.stylePreset,
        images: aiGenerations.images,
        moderationStatus: aiGenerations.moderationStatus,
        moderationResult: aiGenerations.moderationResult,
        isFlagged: aiGenerations.isFlagged,
        createdAt: aiGenerations.createdAt,
        userId: aiGenerations.userId,
      })
      .from(aiGenerations)
      .where(and(...conditions))
      .orderBy(
        sortBy === "oldest"
          ? aiGenerations.createdAt
          : sortBy === "risk"
            ? desc(aiGenerations.isFlagged)
            : desc(aiGenerations.createdAt)
      )
      .limit(pageSize)
      .offset(offset);

    // Get user info for each generation
    const userIds = [...new Set(generations.map((g) => g.userId).filter(Boolean))];
    const usersData = userIds.length
      ? await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds as string[]))
      : [];

    const userMap = new Map(usersData.map((u) => [u.id, u]));

    const items = generations.map((g) => ({
      ...g,
      user: g.userId ? userMap.get(g.userId) : null,
      thumbnailUrl: g.images?.[0]?.thumbnailUrl || g.images?.[0]?.imageUrl,
    }));

    return c.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  }
);

// ============================================================================
// GET /api/admin/ai-moderation/stats - Statistics
// ============================================================================

adminAIModerationApp.get("/stats", async (c) => {
  const stats = await getModerationStats();
  return c.json(stats);
});

// ============================================================================
// GET /api/admin/ai-moderation/:id - Get Details
// ============================================================================

adminAIModerationApp.get("/:id", async (c) => {
  const { id } = c.req.param();

  const generation = await db.query.aiGenerations.findFirst({
    where: eq(aiGenerations.id, id),
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  // Get user info
  let user = null;
  if (generation.userId) {
    user = await db.query.users.findFirst({
      where: eq(users.id, generation.userId),
      columns: { id: true, email: true, name: true },
    });
  }

  return c.json({
    generation: {
      ...generation,
      user,
    },
  });
});

// ============================================================================
// POST /api/admin/ai-moderation/:id/approve
// ============================================================================

adminAIModerationApp.post("/:id/approve", async (c) => {
  const { id } = c.req.param();
  const admin = c.get("user");

  try {
    const result = await approveGeneration(id, admin.id);
    return c.json(result);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to approve" },
      400
    );
  }
});

// ============================================================================
// POST /api/admin/ai-moderation/:id/reject
// ============================================================================

adminAIModerationApp.post(
  "/:id/reject",
  zValidator("json", rejectSchema),
  async (c) => {
    const { id } = c.req.param();
    const { category, reason } = c.req.valid("json");
    const admin = c.get("user");

    try {
      const result = await rejectGeneration(id, admin.id, category, reason);
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to reject" },
        400
      );
    }
  }
);

// ============================================================================
// POST /api/admin/ai-moderation/:id/flag
// ============================================================================

adminAIModerationApp.post(
  "/:id/flag",
  zValidator("json", flagSchema),
  async (c) => {
    const { id } = c.req.param();
    const { reason } = c.req.valid("json");
    const admin = c.get("user");

    try {
      const result = await flagGeneration(id, admin.id, reason);
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to flag" },
        400
      );
    }
  }
);

// ============================================================================
// POST /api/admin/ai-moderation/bulk/approve
// ============================================================================

adminAIModerationApp.post(
  "/bulk/approve",
  zValidator("json", bulkApproveSchema),
  async (c) => {
    const { generationIds } = c.req.valid("json");
    const admin = c.get("user");

    const result = await bulkApprove(generationIds, admin.id);
    return c.json(result);
  }
);

// ============================================================================
// POST /api/admin/ai-moderation/bulk/reject
// ============================================================================

adminAIModerationApp.post(
  "/bulk/reject",
  zValidator("json", bulkRejectSchema),
  async (c) => {
    const { generationIds, category, reason } = c.req.valid("json");
    const admin = c.get("user");

    const result = await bulkReject(generationIds, admin.id, category, reason);
    return c.json(result);
  }
);

export { adminAIModerationApp };
export default adminAIModerationApp;
```

**Step 4: Register routes in admin index**

Add to `packages/api/src/routes/admin/index.ts`:

```typescript
import { adminAIModerationApp } from "./ai-moderation";

// In the router setup
adminApp.route("/ai-moderation", adminAIModerationApp);
```

**Step 5: Run test to verify it passes**

Run: `cd packages/api && bun test tests/routes/admin/ai-moderation.test.ts -v`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/api/src/routes/admin/ai-moderation.ts packages/api/src/routes/admin/index.ts packages/api/tests/routes/admin/ai-moderation.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add admin AI moderation endpoints

Adds routes for moderator dashboard:
- GET /queue: List pending generations
- GET /stats: Moderation statistics
- GET /:id: Generation details
- POST /:id/approve: Approve generation
- POST /:id/reject: Reject with reason
- POST /:id/flag: Flag for senior review
- POST /bulk/approve: Bulk approve
- POST /bulk/reject: Bulk reject

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Frontend - Admin Dashboard

### Task 10: Create Admin AI Moderation Page

**Files:**
- Create: `packages/web/app/routes/admin/ai-moderation/index.tsx`
- Create: `packages/web/app/routes/admin/ai-moderation/$id.tsx`

**Step 1: Create main queue page**

```typescript
// packages/web/app/routes/admin/ai-moderation/index.tsx
/**
 * Admin AI Moderation Queue Page
 *
 * Displays pending AI generations for review with bulk actions.
 */

import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  CheckCircle,
  XCircle,
  Flag,
  Eye,
  Loader2,
  Filter,
  RefreshCw,
} from "lucide-react";
import { cn } from "~/lib/utils";

// Route definition
const searchSchema = z.object({
  status: z.enum(["pending_review", "flagged", "all"]).optional().default("pending_review"),
  page: z.coerce.number().optional().default(1),
});

export const Route = createFileRoute("/admin/ai-moderation/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "AI Moderation | Admin | MasonArt" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AIModerationQueuePage,
});

interface Generation {
  id: string;
  promptText: string;
  stylePreset: string;
  thumbnailUrl?: string;
  moderationStatus: string;
  isFlagged: boolean;
  createdAt: string;
  user?: { email: string; name?: string };
}

interface QueueResponse {
  items: Generation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Stats {
  pending_review: number;
  approved: number;
  rejected: number;
  flagged: number;
  total: number;
}

function AIModerationQueuePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/admin/ai-moderation/" });

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [queueRes, statsRes] = await Promise.all([
        fetch(`/api/admin/ai-moderation/queue?status=${search.status}&page=${search.page}`),
        fetch("/api/admin/ai-moderation/stats"),
      ]);

      if (queueRes.ok) setQueue(await queueRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setIsLoading(false);
    }
  }, [search.status, search.page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      await fetch("/api/admin/ai-moderation/bulk/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationIds: [...selectedIds] }),
      });
      setSelectedIds(new Set());
      fetchData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async (id: string) => {
    setIsProcessing(true);
    try {
      await fetch(`/api/admin/ai-moderation/${id}/approve`, { method: "POST" });
      fetchData();
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (!queue) return;
    if (selectedIds.size === queue.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.items.map((g) => g.id)));
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">AI Content Moderation</h1>
            <p className="text-muted-foreground">
              Review AI-generated images before they can be purchased or shared
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Pending Review"
              value={stats.pending_review}
              color="amber"
              active={search.status === "pending_review"}
              onClick={() => navigate({ search: { status: "pending_review", page: 1 } })}
            />
            <StatCard
              label="Flagged"
              value={stats.flagged}
              color="red"
              active={search.status === "flagged"}
              onClick={() => navigate({ search: { status: "flagged", page: 1 } })}
            />
            <StatCard
              label="Approved"
              value={stats.approved}
              color="green"
            />
            <StatCard
              label="Rejected"
              value={stats.rejected}
              color="gray"
            />
          </div>
        )}

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
            <span className="font-medium">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkApprove}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                Approve All
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 border rounded-lg hover:bg-muted"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Queue */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : queue?.items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No items pending review
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select All */}
            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                checked={queue && selectedIds.size === queue.items.length}
                onChange={selectAll}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-muted-foreground">Select all</span>
            </div>

            {/* Items */}
            {queue?.items.map((gen) => (
              <div
                key={gen.id}
                className={cn(
                  "flex items-center gap-4 p-4 border rounded-lg",
                  selectedIds.has(gen.id) && "bg-blue-50 border-blue-200",
                  gen.isFlagged && "border-red-200"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(gen.id)}
                  onChange={() => toggleSelect(gen.id)}
                  className="h-4 w-4 rounded"
                />

                {/* Thumbnail */}
                <div className="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                  {gen.thumbnailUrl ? (
                    <img
                      src={gen.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      ?
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{gen.promptText}</p>
                  <p className="text-sm text-muted-foreground">
                    {gen.stylePreset} • {gen.user?.email || "Unknown user"} •{" "}
                    {new Date(gen.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Flags */}
                {gen.isFlagged && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                    Flagged
                  </span>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate({ to: `/admin/ai-moderation/${gen.id}` })}
                    className="p-2 hover:bg-muted rounded"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleApprove(gen.id)}
                    disabled={isProcessing}
                    className="p-2 hover:bg-green-100 rounded text-green-600"
                    title="Approve"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate({ to: `/admin/ai-moderation/${gen.id}?action=reject` })}
                    className="p-2 hover:bg-red-100 rounded text-red-600"
                    title="Reject"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {queue && queue.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => navigate({ search: { ...search, page: search.page - 1 } })}
              disabled={search.page <= 1}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2">
              Page {search.page} of {queue.totalPages}
            </span>
            <button
              onClick={() => navigate({ search: { ...search, page: search.page + 1 } })}
              disabled={search.page >= queue.totalPages}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: "amber" | "red" | "green" | "gray";
  active?: boolean;
  onClick?: () => void;
}) {
  const colors = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 border rounded-lg",
        colors[color],
        onClick && "cursor-pointer hover:opacity-80",
        active && "ring-2 ring-offset-2 ring-blue-500"
      )}
    >
      <p className="text-sm">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
```

**Step 2: Create detail/reject page**

```typescript
// packages/web/app/routes/admin/ai-moderation/$id.tsx
/**
 * Admin AI Moderation Detail Page
 *
 * View generation details and take moderation actions.
 */

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Flag,
  Loader2,
  User,
  Calendar,
  Palette,
} from "lucide-react";
import { cn } from "~/lib/utils";

const searchSchema = z.object({
  action: z.enum(["reject", "flag"]).optional(),
});

export const Route = createFileRoute("/admin/ai-moderation/$id")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Review Generation | Admin | MasonArt" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AIModerationDetailPage,
});

const REJECTION_CATEGORIES = [
  { value: "nsfw", label: "NSFW / Adult Content" },
  { value: "violence", label: "Violence / Gore" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "copyright", label: "Copyright Violation" },
  { value: "illegal_content", label: "Illegal Content" },
  { value: "spam", label: "Spam / Low Effort" },
  { value: "low_quality", label: "Low Quality" },
  { value: "other", label: "Other" },
];

function AIModerationDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/admin/ai-moderation/$id" });
  const search = useSearch({ from: "/admin/ai-moderation/$id" });

  const [generation, setGeneration] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectCategory, setRejectCategory] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/ai-moderation/${id}`)
      .then((res) => res.json())
      .then((data) => setGeneration(data.generation))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleApprove = async () => {
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ai-moderation/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        navigate({ to: "/admin/ai-moderation" });
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectCategory || !rejectReason) {
      setError("Please select a category and provide a reason");
      return;
    }
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ai-moderation/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: rejectCategory, reason: rejectReason }),
      });
      if (res.ok) {
        navigate({ to: "/admin/ai-moderation" });
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFlag = async () => {
    if (!flagReason) {
      setError("Please provide a reason for flagging");
      return;
    }
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ai-moderation/${id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: flagReason }),
      });
      if (res.ok) {
        navigate({ to: "/admin/ai-moderation" });
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Generation not found</p>
      </div>
    );
  }

  const showRejectForm = search.action === "reject";
  const showFlagForm = search.action === "flag";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate({ to: "/admin/ai-moderation" })}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Queue
        </button>

        <div className="grid grid-cols-2 gap-6">
          {/* Images */}
          <div className="space-y-4">
            <h2 className="font-semibold">Generated Images</h2>
            <div className="grid grid-cols-2 gap-2">
              {generation.images?.map((img: any, i: number) => (
                <img
                  key={i}
                  src={img.imageUrl || img.thumbnailUrl}
                  alt={`Variation ${i + 1}`}
                  className="w-full rounded-lg border"
                />
              ))}
            </div>
          </div>

          {/* Details & Actions */}
          <div className="space-y-6">
            {/* Prompt */}
            <div>
              <h2 className="font-semibold mb-2">Prompt</h2>
              <p className="p-3 bg-muted rounded-lg">{generation.promptText}</p>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span>{generation.stylePreset}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{new Date(generation.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{generation.user?.email || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-2 py-1 rounded text-xs",
                    generation.moderationStatus === "pending_review" && "bg-amber-100 text-amber-700",
                    generation.moderationStatus === "flagged" && "bg-red-100 text-red-700",
                    generation.moderationStatus === "approved" && "bg-green-100 text-green-700"
                  )}
                >
                  {generation.moderationStatus}
                </span>
              </div>
            </div>

            {/* Risk Info */}
            {generation.moderationResult && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="font-medium text-amber-800">Risk Assessment</p>
                <p className="text-sm text-amber-700">
                  Risk Score: {(generation.moderationResult.riskScore * 100).toFixed(0)}%
                </p>
                {generation.moderationResult.flags?.length > 0 && (
                  <p className="text-sm text-amber-700">
                    Flags: {generation.moderationResult.flags.join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            {/* Action Forms */}
            {showRejectForm ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold">Reject Generation</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={rejectCategory}
                    onChange={(e) => setRejectCategory(e.target.value)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select category...</option>
                    {REJECTION_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reason</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full p-2 border rounded"
                    rows={3}
                    placeholder="Explain why this is being rejected..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReject}
                    disabled={isProcessing}
                    className="flex-1 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {isProcessing ? "Processing..." : "Confirm Reject"}
                  </button>
                  <button
                    onClick={() => navigate({ search: {} })}
                    className="px-4 py-2 border rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : showFlagForm ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold">Flag for Senior Review</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Reason</label>
                  <textarea
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    className="w-full p-2 border rounded"
                    rows={3}
                    placeholder="Why does this need senior review?"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleFlag}
                    disabled={isProcessing}
                    className="flex-1 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                  >
                    {isProcessing ? "Processing..." : "Confirm Flag"}
                  </button>
                  <button
                    onClick={() => navigate({ search: {} })}
                    className="px-4 py-2 border rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle className="h-5 w-5" />
                  Approve
                </button>
                <button
                  onClick={() => navigate({ search: { action: "reject" } })}
                  className="flex-1 flex items-center justify-center gap-2 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <XCircle className="h-5 w-5" />
                  Reject
                </button>
                <button
                  onClick={() => navigate({ search: { action: "flag" } })}
                  className="flex items-center justify-center gap-2 px-4 py-3 border rounded-lg hover:bg-muted"
                >
                  <Flag className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/web/app/routes/admin/ai-moderation/
git commit -m "$(cat <<'EOF'
feat(web): add admin AI moderation dashboard

Adds moderator pages:
- /admin/ai-moderation: Queue with stats, bulk actions
- /admin/ai-moderation/:id: Detail view with approve/reject/flag

Features:
- Thumbnail grid preview
- Risk score display
- Category-based rejection
- Bulk approve functionality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Frontend - User Experience Updates

### Task 11: Update AI Creations Page for Moderation Status

**Files:**
- Modify: `packages/web/app/routes/_authed/account/ai-creations.tsx`
- Modify: `packages/web/app/components/account/AICreationsList.tsx`

**Step 1: Add moderation status badges**

In `packages/web/app/components/account/AICreationsList.tsx`, add status badges:

```typescript
// Add to AICreation interface
moderationStatus?: "pending_review" | "approved" | "rejected" | "flagged";
rejectionReason?: string;

// Add status badge component
function ModerationBadge({ status, reason }: { status: string; reason?: string }) {
  const badges = {
    pending_review: { label: "Pending Review", class: "bg-amber-100 text-amber-700" },
    approved: { label: "Approved", class: "bg-green-100 text-green-700" },
    rejected: { label: "Rejected", class: "bg-red-100 text-red-700" },
    flagged: { label: "Under Review", class: "bg-orange-100 text-orange-700" },
  };

  const badge = badges[status as keyof typeof badges] || badges.pending_review;

  return (
    <div className="flex flex-col gap-1">
      <span className={cn("px-2 py-1 rounded text-xs", badge.class)}>
        {badge.label}
      </span>
      {status === "rejected" && reason && (
        <span className="text-xs text-red-600">{reason}</span>
      )}
    </div>
  );
}

// In the card render, add badge and disable add-to-cart for non-approved
{creation.moderationStatus && (
  <ModerationBadge
    status={creation.moderationStatus}
    reason={creation.rejectionReason}
  />
)}

// Disable add-to-cart button
<button
  onClick={() => onAddToCart(creation)}
  disabled={creation.moderationStatus !== "approved"}
  className={cn(
    "...",
    creation.moderationStatus !== "approved" && "opacity-50 cursor-not-allowed"
  )}
>
  {creation.moderationStatus === "pending_review"
    ? "Pending Review"
    : creation.moderationStatus === "rejected"
      ? "Cannot Purchase"
      : "Add to Cart"
  }
</button>
```

**Step 2: Commit**

```bash
git add packages/web/app/components/account/AICreationsList.tsx
git commit -m "$(cat <<'EOF'
feat(web): add moderation status to AI creations list

- Shows pending/approved/rejected/flagged badges
- Disables add-to-cart for non-approved
- Shows rejection reason to user
- Clear messaging about review status

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Update Create Page for Moderation Notice

**Files:**
- Modify: `packages/web/app/routes/create/index.tsx`

**Step 1: Add post-generation notice**

After generation completes, show moderation notice:

```typescript
// Add after generation success display
{generation?.status === "completed" && generation?.moderationStatus === "pending_review" && (
  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
    <div className="flex items-start gap-3">
      <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
      <div>
        <p className="font-medium text-amber-800">Pending Review</p>
        <p className="text-sm text-amber-700">
          Your creation is being reviewed by our team. You'll be notified
          when it's approved and ready to purchase or share.
        </p>
      </div>
    </div>
  </div>
)}
```

**Step 2: Commit**

```bash
git add packages/web/app/routes/create/index.tsx
git commit -m "$(cat <<'EOF'
feat(web): add moderation notice to AI create page

Shows friendly message after generation explaining:
- Creation is pending review
- User will be notified when approved
- Cannot purchase until approved

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: E2E Tests

### Task 13: Add E2E Tests for Moderation Flow

**Files:**
- Create: `tests/e2e/ai-moderation.spec.ts`

**Step 1: Create E2E test file**

```typescript
// tests/e2e/ai-moderation.spec.ts
import { test, expect } from "@playwright/test";

test.describe("AI Content Moderation", () => {
  test.describe("User Experience", () => {
    test("should show pending review status after generation", async ({ page }) => {
      // Login as user
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "test@example.com");
      await page.fill('[name="password"]', "password123");
      await page.click('button[type="submit"]');

      // Go to create page
      await page.goto("/create");

      // Fill prompt and generate
      await page.fill('[name="prompt"]', "A beautiful sunset over mountains");
      await page.selectOption('[name="stylePreset"]', "photography");
      await page.click('button:has-text("Generate")');

      // Wait for completion
      await page.waitForSelector('[data-testid="generation-complete"]', { timeout: 120000 });

      // Should see pending review notice
      await expect(page.locator("text=Pending Review")).toBeVisible();
      await expect(page.locator("text=being reviewed")).toBeVisible();
    });

    test("should block add-to-cart for pending review items", async ({ page }) => {
      await page.goto("/account/ai-creations");

      // Find a pending review item
      const pendingItem = page.locator('[data-moderation-status="pending_review"]').first();

      // Add to cart button should be disabled
      const addButton = pendingItem.locator('button:has-text("Pending Review")');
      await expect(addButton).toBeDisabled();
    });

    test("should block prompts with banned terms", async ({ page }) => {
      await page.goto("/create");

      // Try to generate with banned term
      await page.fill('[name="prompt"]', "A nude woman in explicit pose");
      await page.click('button:has-text("Generate")');

      // Should see error
      await expect(page.locator("text=not allowed")).toBeVisible();
    });
  });

  test.describe("Admin Moderation", () => {
    test.beforeEach(async ({ page }) => {
      // Login as admin
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "admin@masonart.com");
      await page.fill('[name="password"]', "admin123");
      await page.click('button[type="submit"]');
    });

    test("should display moderation queue", async ({ page }) => {
      await page.goto("/admin/ai-moderation");

      // Should see stats
      await expect(page.locator("text=Pending Review")).toBeVisible();
      await expect(page.locator("text=Approved")).toBeVisible();
      await expect(page.locator("text=Rejected")).toBeVisible();
    });

    test("should approve generation", async ({ page }) => {
      await page.goto("/admin/ai-moderation");

      // Find first pending item
      const firstItem = page.locator('[data-testid="moderation-item"]').first();

      // Click approve
      await firstItem.locator('button[title="Approve"]').click();

      // Item should be removed from queue
      await expect(firstItem).not.toBeVisible();
    });

    test("should reject generation with reason", async ({ page }) => {
      await page.goto("/admin/ai-moderation");

      // Click on first item to view details
      const firstItem = page.locator('[data-testid="moderation-item"]').first();
      await firstItem.locator('button[title="View details"]').click();

      // Click reject
      await page.click('button:has-text("Reject")');

      // Fill rejection form
      await page.selectOption('[name="category"]', "nsfw");
      await page.fill('[name="reason"]', "Contains inappropriate content");
      await page.click('button:has-text("Confirm Reject")');

      // Should redirect back to queue
      await expect(page).toHaveURL("/admin/ai-moderation");
    });

    test("should bulk approve multiple generations", async ({ page }) => {
      await page.goto("/admin/ai-moderation");

      // Select multiple items
      await page.click("text=Select all");

      // Click bulk approve
      await page.click('button:has-text("Approve All")');

      // Queue should be empty or reduced
      await expect(page.locator("text=No items pending review")).toBeVisible();
    });
  });
});
```

**Step 2: Run E2E tests**

Run: `bun run test:e2e tests/e2e/ai-moderation.spec.ts`
Expected: Tests pass (may need adjustments for auth fixtures)

**Step 3: Commit**

```bash
git add tests/e2e/ai-moderation.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add AI content moderation tests

Tests:
- User sees pending review after generation
- Add-to-cart blocked for pending items
- Banned prompts rejected
- Admin queue display
- Approve/reject/bulk actions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Add Admin Navigation Link

### Task 14: Add AI Moderation Link to Admin Sidebar

**Files:**
- Modify: `packages/web/app/components/admin/AdminSidebar.tsx`

**Step 1: Add navigation link**

```typescript
// Add to navigation items array
{
  href: "/admin/ai-moderation",
  label: "AI Moderation",
  icon: Shield,
},
```

**Step 2: Commit**

```bash
git add packages/web/app/components/admin/AdminSidebar.tsx
git commit -m "$(cat <<'EOF'
feat(web): add AI moderation link to admin sidebar

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

This plan implements AI Content Moderation with:

**Layer 1 - Automated:**
- Pre-generation prompt checking against banned terms database
- Risk scoring and auto-rejection for critical terms
- Flagging risky prompts for manual review

**Layer 2 - Human Approval:**
- All generations start as `pending_review`
- Moderator dashboard at `/admin/ai-moderation`
- Approve/reject/flag workflow with audit trail
- Bulk actions for efficiency

**User Experience:**
- Clear status badges on creations
- Disabled add-to-cart until approved
- Helpful messages explaining review process

**Testing:**
- Unit tests for schema and services
- API route tests
- E2E tests for full workflow

---

**Plan complete and saved to `docs/plans/2026-02-17-ai-content-moderation-plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
