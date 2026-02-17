/**
 * AI Content Moderation Service
 *
 * Provides two layers of protection:
 * 1. Automated: Pre-generation prompt checking against banned terms
 * 2. Manual: Human review workflow for all generations
 */

import { checkPromptModeration } from "../ai/generator";
import { DEFAULT_BANNED_TERMS } from "../database/seeds/banned-terms";
import type { AIRejectionCategory } from "../database/schema/ai-generation-reviews";

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
export async function checkPromptSafety(
  prompt: string
): Promise<PromptSafetyResult> {
  // Get default banned terms first (always available)
  let bannedTerms: Array<{
    pattern: string;
    isRegex: boolean;
    category: string;
    severity: string;
  }> = DEFAULT_BANNED_TERMS.map((t) => ({
    pattern: t.pattern,
    isRegex: t.isRegex,
    category: t.category,
    severity: t.severity,
  }));

  // Try to get banned terms from database (dynamic import to avoid initialization error)
  try {
    const { db } = await import("../database");
    const { aiBannedPrompts } = await import(
      "../database/schema/ai-generations"
    );
    const { eq } = await import("drizzle-orm");

    const dbTerms = await db
      .select({
        pattern: aiBannedPrompts.pattern,
        isRegex: aiBannedPrompts.isRegex,
        category: aiBannedPrompts.category,
        severity: aiBannedPrompts.severity,
      })
      .from(aiBannedPrompts)
      .where(eq(aiBannedPrompts.isActive, true));

    if (dbTerms.length > 0) {
      bannedTerms = dbTerms.map((t) => ({
        pattern: t.pattern,
        isRegex: t.isRegex,
        category: t.category || "other",
        severity: t.severity,
      }));
    }
  } catch {
    // Database unavailable, use default terms (already set)
  }

  // Use existing moderation function
  const moderationResult = checkPromptModeration(
    prompt,
    bannedTerms.map((t) => ({
      pattern: t.pattern,
      isRegex: t.isRegex,
      category: t.category,
    }))
  );

  // Map matched patterns to full term info
  const blockedTerms = moderationResult.matchedPatterns.map((match) => {
    const term = bannedTerms.find((t) => t.pattern === match.pattern);
    return {
      pattern: match.pattern,
      category: match.category,
      severity: term?.severity || "high",
    };
  });

  // Auto-reject if any critical severity terms matched
  const shouldAutoReject = blockedTerms.some((t) => t.severity === "critical");

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
  return reviewGeneration(
    generationId,
    reviewerId,
    "approved",
    undefined,
    notes
  );
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
  return reviewGeneration(
    generationId,
    reviewerId,
    "rejected",
    category,
    reason
  );
}

/**
 * Flag a generation for senior review
 */
export async function flagGeneration(
  generationId: string,
  reviewerId: string,
  reason: string
): Promise<ReviewResult> {
  return reviewGeneration(
    generationId,
    reviewerId,
    "flagged",
    undefined,
    reason
  );
}

/**
 * Core review function
 */
export async function reviewGeneration(
  generationId: string,
  reviewerId: string,
  action: "approved" | "rejected" | "flagged" | "escalated",
  category?: AIRejectionCategory,
  reason?: string
): Promise<ReviewResult> {
  // Dynamic imports for database operations
  const { db } = await import("../database");
  const { eq } = await import("drizzle-orm");
  const { aiGenerations } = await import("../database/schema/ai-generations");
  const { aiGenerationReviews } = await import(
    "../database/schema/ai-generation-reviews"
  );

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
      moderationStatus: newStatus as
        | "pending_review"
        | "approved"
        | "rejected"
        | "flagged",
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
  const { db } = await import("../database");

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
