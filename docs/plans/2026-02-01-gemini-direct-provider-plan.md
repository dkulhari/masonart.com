# Google Gemini Direct Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google AI Studio (Gemini 2.0 Flash) as a direct image generation provider for easy local testing.

**Architecture:** Add `"gemini"` to existing provider enum, implement `generateWithGemini()` function in generator.ts using Google's `@google/generative-ai` SDK. No changes to queue, routes, or frontend needed - fits into existing abstraction.

**Tech Stack:** TypeScript, Google Generative AI SDK (`@google/generative-ai`), Drizzle ORM (PostgreSQL enum migration)

---

## Task 1: Add Google Generative AI SDK

**Files:**
- Modify: `packages/api/package.json`

**Step 1: Install the dependency**

Run:
```bash
cd packages/api && bun add @google/generative-ai
```

Expected: Package added to dependencies

**Step 2: Verify installation**

Run:
```bash
cd packages/api && bun run typecheck
```

Expected: No type errors (package installed correctly)

**Step 3: Commit**

```bash
git add packages/api/package.json packages/api/bun.lockb
git commit -m "chore(api): add @google/generative-ai SDK"
```

---

## Task 2: Create Database Migration for Gemini Provider

**Files:**
- Create: `packages/api/src/database/migrations/XXXX_add_gemini_provider.sql`

**Step 1: Create the migration file**

Create file `packages/api/src/database/migrations/0025_add_gemini_provider.sql`:

```sql
-- Add 'gemini' to ai_model_provider enum
ALTER TYPE ai_model_provider ADD VALUE IF NOT EXISTS 'gemini';
```

Note: Check the actual migration number by looking at existing migrations in the folder and use the next sequential number.

**Step 2: Run the migration**

Run:
```bash
cd packages/api && bun run db:push
```

Expected: Migration applied successfully

**Step 3: Verify enum updated**

Run:
```bash
docker exec poster-app-postgres psql -U poster_app -d poster_app_dev -c "SELECT enum_range(NULL::ai_model_provider);"
```

Expected: Output includes `gemini` in the enum values

**Step 4: Commit**

```bash
git add packages/api/src/database/migrations/
git commit -m "feat(db): add gemini to ai_model_provider enum"
```

---

## Task 3: Update Schema Type Definition

**Files:**
- Modify: `packages/api/src/database/schema/ai-generations.ts:103-108`

**Step 1: Add gemini to the pgEnum**

Find this code (around line 103):
```typescript
export const aiModelProviderEnum = pgEnum("ai_model_provider", [
  "stable-diffusion", // Stable Diffusion via Replicate
  "dall-e-3", // OpenAI DALL-E 3
  "midjourney", // Midjourney (if supported)
  "fal-ai", // FAL.ai
]);
```

Replace with:
```typescript
export const aiModelProviderEnum = pgEnum("ai_model_provider", [
  "stable-diffusion", // Stable Diffusion via Replicate
  "dall-e-3", // OpenAI DALL-E 3
  "midjourney", // Midjourney (if supported)
  "fal-ai", // FAL.ai
  "gemini", // Google AI Studio (Gemini)
]);
```

**Step 2: Verify types compile**

Run:
```bash
cd packages/api && bun run typecheck
```

Expected: No type errors

**Step 3: Commit**

```bash
git add packages/api/src/database/schema/ai-generations.ts
git commit -m "feat(schema): add gemini to AIModelProvider type"
```

---

## Task 4: Write Failing Test for Gemini Provider Detection

**Files:**
- Create: `packages/api/tests/ai/generator.test.ts`

**Step 1: Create test file with failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isProviderAvailable,
  getAvailableProvider,
} from "../../src/ai/generator";

describe("AI Generator - Gemini Provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isProviderAvailable", () => {
    it("returns true for gemini when GOOGLE_AI_STUDIO_KEY is set", () => {
      process.env.GOOGLE_AI_STUDIO_KEY = "test-key";
      // Need to re-import to pick up env change
      expect(isProviderAvailable("gemini")).toBe(true);
    });

    it("returns false for gemini when GOOGLE_AI_STUDIO_KEY is not set", () => {
      delete process.env.GOOGLE_AI_STUDIO_KEY;
      expect(isProviderAvailable("gemini")).toBe(false);
    });
  });

  describe("getAvailableProvider", () => {
    it("returns gemini when it is the only configured provider", () => {
      // Clear all other provider keys
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.OPENAI_API_KEY;
      delete process.env.FAL_API_KEY;
      process.env.GOOGLE_AI_STUDIO_KEY = "test-key";

      expect(getAvailableProvider()).toBe("gemini");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd packages/api && bun run test tests/ai/generator.test.ts
```

Expected: FAIL - gemini provider not implemented yet

**Step 3: Commit failing test**

```bash
git add packages/api/tests/ai/generator.test.ts
git commit -m "test(ai): add failing tests for gemini provider detection"
```

---

## Task 5: Implement Gemini Provider Configuration

**Files:**
- Modify: `packages/api/src/ai/generator.ts`

**Step 1: Add Gemini model constant**

Find the FAL_MODELS constant (around line 139) and add after it:

```typescript
/**
 * Google Gemini model identifiers
 */
export const GEMINI_MODELS = {
  flash: "gemini-2.0-flash-exp", // Gemini 2.0 Flash with image generation
} as const;
```

**Step 2: Add gemini case to getProviderConfig function**

Find the `getProviderConfig` function (around line 155) and add a new case before the `default`:

```typescript
    case "gemini":
      const geminiKey = process.env.GOOGLE_AI_STUDIO_KEY;
      if (!geminiKey) return null;
      return {
        apiKey: geminiKey,
        modelId: GEMINI_MODELS.flash,
        timeout: 60000, // 1 minute
      };
```

**Step 3: Add gemini to providers list in getAvailableProvider**

Find `getAvailableProvider` function (around line 199) and update the providers array:

```typescript
export function getAvailableProvider(): AIModelProvider | null {
  const providers: AIModelProvider[] = ["stable-diffusion", "dall-e-3", "fal-ai", "gemini"];
  for (const provider of providers) {
    if (isProviderAvailable(provider)) {
      return provider;
    }
  }
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/api && bun run test tests/ai/generator.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/ai/generator.ts
git commit -m "feat(ai): add gemini provider configuration"
```

---

## Task 6: Write Failing Test for Gemini Image Generation

**Files:**
- Modify: `packages/api/tests/ai/generator.test.ts`

**Step 1: Add integration test for generateImages**

Add to the test file:

```typescript
import { generateImages, type AIGenerationInput } from "../../src/ai/generator";

describe("generateImages with Gemini", () => {
  beforeEach(() => {
    process.env.GOOGLE_AI_STUDIO_KEY = "test-key";
  });

  it("returns error when API key is invalid", async () => {
    const input: AIGenerationInput = {
      prompt: "a sunset over mountains",
      stylePreset: "photography",
      aspectRatio: "landscape",
      provider: "gemini",
    };

    const result = await generateImages(input, 1);

    // With invalid key, should fail gracefully
    expect(result.provider).toBe("gemini");
    expect(result.enhancedPrompt).toContain("sunset");
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd packages/api && bun run test tests/ai/generator.test.ts
```

Expected: FAIL - gemini case not handled in generateImages

**Step 3: Commit failing test**

```bash
git add packages/api/tests/ai/generator.test.ts
git commit -m "test(ai): add failing test for gemini image generation"
```

---

## Task 7: Implement Gemini Image Generation Function

**Files:**
- Modify: `packages/api/src/ai/generator.ts`

**Step 1: Add import for Google Generative AI**

At the top of the file, add:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
```

**Step 2: Add generateWithGemini function**

Add after the FAL.ai generation function (around line 598):

```typescript
// ============================================================================
// Google Gemini Provider
// ============================================================================

/**
 * Generate images using Google Gemini API (AI Studio)
 * Uses Gemini 2.0 Flash with native image generation capabilities
 */
async function generateWithGemini(
  config: AIProviderConfig,
  prompt: string,
  dimensions: { width: number; height: number },
  variationCount: number,
  baseSeed?: number
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];

  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.modelId,
    generationConfig: {
      responseModalities: ["image", "text"],
    } as any, // Type not yet in SDK
  });

  // Add aspect ratio hint to prompt
  const aspectHint = getAspectRatioHint(dimensions);
  const enhancedPrompt = aspectHint ? `${prompt}, ${aspectHint}` : prompt;

  for (let i = 0; i < variationCount; i++) {
    const seed = baseSeed !== undefined ? baseSeed + i : Math.floor(Math.random() * 2147483647);

    try {
      const result = await model.generateContent(enhancedPrompt);
      const response = result.response;

      // Extract image from response
      const imageData = extractGeminiImage(response);

      if (imageData) {
        images.push({
          buffer: imageData.buffer,
          url: undefined, // Gemini returns base64, not URLs
          width: imageData.width || dimensions.width,
          height: imageData.height || dimensions.height,
          seed,
          variationIndex: i,
          mimeType: imageData.mimeType || "image/png",
        });
      }
    } catch (error) {
      // Log but continue with other variations
      console.error(`Gemini generation ${i + 1} failed:`, error);
    }
  }

  return images;
}

/**
 * Extract image data from Gemini response
 */
function extractGeminiImage(response: any): {
  buffer: Buffer;
  width?: number;
  height?: number;
  mimeType?: string;
} | null {
  try {
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) return null;

    const parts = candidates[0].content?.parts;
    if (!parts) return null;

    for (const part of parts) {
      if (part.inlineData) {
        const { data, mimeType } = part.inlineData;
        return {
          buffer: Buffer.from(data, "base64"),
          mimeType,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get aspect ratio hint for Gemini prompt
 */
function getAspectRatioHint(dimensions: { width: number; height: number }): string {
  const ratio = dimensions.width / dimensions.height;

  if (ratio > 1.5) return "wide landscape format, 16:9 aspect ratio";
  if (ratio > 1.1) return "landscape format, horizontal composition";
  if (ratio > 0.9) return "square format, 1:1 aspect ratio";
  if (ratio > 0.7) return "portrait format, vertical composition";
  return "tall portrait format, 9:16 aspect ratio";
}
```

**Step 3: Add gemini case to generateImages switch**

Find the switch statement in `generateImages` (around line 257) and add before `default`:

```typescript
      case "gemini":
        images = await generateWithGemini(
          config,
          enhancedPrompt,
          dimensions,
          variationCount,
          input.seed
        );
        break;
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/api && bun run test tests/ai/generator.test.ts
```

Expected: PASS (or graceful failure with API error, not code error)

**Step 5: Run full type check**

Run:
```bash
cd packages/api && bun run typecheck
```

Expected: No type errors

**Step 6: Commit**

```bash
git add packages/api/src/ai/generator.ts
git commit -m "feat(ai): implement gemini image generation"
```

---

## Task 8: Update Cost and Time Estimates

**Files:**
- Modify: `packages/api/src/ai/generator.ts`

**Step 1: Add gemini to estimateGenerationCost**

Find `estimateGenerationCost` function (around line 745) and add gemini:

```typescript
export function estimateGenerationCost(
  provider: AIModelProvider,
  variationCount: number,
  falModel?: FalModelType
): number {
  const costPerImage: Record<AIModelProvider, number> = {
    "stable-diffusion": 2,
    "dall-e-3": 8,
    midjourney: 10,
    "fal-ai": 1,
    gemini: 2, // ~$0.02 per image (estimate for Gemini 2.0 Flash)
  };
  // ... rest of function
```

**Step 2: Add gemini to estimateGenerationTime**

Find `estimateGenerationTime` function (around line 776) and add gemini:

```typescript
export function estimateGenerationTime(
  provider: AIModelProvider,
  variationCount: number,
  falModel?: FalModelType
): number {
  const timePerImage: Record<AIModelProvider, number> = {
    "stable-diffusion": 15,
    "dall-e-3": 10,
    midjourney: 30,
    "fal-ai": 5,
    gemini: 8, // ~8s per image
  };
  // ... rest of function
```

**Step 3: Run type check**

Run:
```bash
cd packages/api && bun run typecheck
```

Expected: No type errors

**Step 4: Commit**

```bash
git add packages/api/src/ai/generator.ts
git commit -m "feat(ai): add gemini cost and time estimates"
```

---

## Task 9: Update Environment Example

**Files:**
- Modify: `.env.example`

**Step 1: Add GOOGLE_AI_STUDIO_KEY section**

Find the AI Generation section (around line 46) and update:

```bash
# -----------------------------------------------------------------------------
# AI Generation
# -----------------------------------------------------------------------------
# Replicate API token (for Stable Diffusion)
# Get one at: https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=your-replicate-api-token

# Google AI Studio API key (for Gemini image generation)
# Get one at: https://aistudio.google.com/app/apikey
GOOGLE_AI_STUDIO_KEY=your-google-ai-studio-key

# OpenAI API key (for DALL-E 3) - optional
# OPENAI_API_KEY=your-openai-api-key

# FAL.ai API key (for FLUX models) - optional
# FAL_API_KEY=your-fal-api-key
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add GOOGLE_AI_STUDIO_KEY to env example"
```

---

## Task 10: Manual Integration Test

**Files:** None (manual testing)

**Step 1: Set up environment**

Add to your `.env`:
```bash
GOOGLE_AI_STUDIO_KEY=your-actual-key-here
```

**Step 2: Start the dev server**

Run:
```bash
bun run dev
```

**Step 3: Test via API (if you have an endpoint)**

If there's a test endpoint, verify gemini works:
```bash
curl -X POST http://localhost:3000/api/ai/test-generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat sitting on a windowsill", "provider": "gemini"}'
```

Or verify in code by checking `isProviderAvailable("gemini")` returns true.

**Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "feat(ai): complete gemini direct provider integration

Adds Google AI Studio (Gemini 2.0 Flash) as a direct image generation
provider. Set GOOGLE_AI_STUDIO_KEY env var to enable.

- Add @google/generative-ai SDK
- Add gemini to ai_model_provider enum (with migration)
- Implement generateWithGemini() function
- Add cost/time estimates
- Update .env.example

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Add Google Generative AI SDK | 2 min |
| 2 | Create database migration | 3 min |
| 3 | Update schema type definition | 2 min |
| 4 | Write failing test for provider detection | 3 min |
| 5 | Implement provider configuration | 3 min |
| 6 | Write failing test for image generation | 2 min |
| 7 | Implement image generation function | 5 min |
| 8 | Update cost and time estimates | 2 min |
| 9 | Update environment example | 1 min |
| 10 | Manual integration test | 3 min |

**Total: ~25 minutes**
