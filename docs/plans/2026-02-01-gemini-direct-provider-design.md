# Google Gemini Direct Provider for AI Image Generation

**Date:** 2026-02-01
**Status:** Approved
**Goal:** Add Google AI Studio (Gemini) as a direct image generation provider for easy local testing

## Overview

Add a new `"gemini"` provider to the existing AI generation system that calls Google's Gemini API directly using a Google AI Studio API key. This bypasses FAL.ai and allows testing with free/personal Google API credits.

## Changes

### 1. Database Schema Update
**File:** `packages/api/src/database/schema/ai-generations.ts`

Add `"gemini"` to the `AIModelProvider` type:
```typescript
export type AIModelProvider = "stable-diffusion" | "dall-e-3" | "midjourney" | "fal-ai" | "gemini";
```

### 2. Generator Module Update
**File:** `packages/api/src/ai/generator.ts`

Add Gemini provider configuration and generation function:

- Add `GOOGLE_AI_STUDIO_KEY` env var check in `getProviderConfig()`
- Add `generateWithGemini()` function using `@google/generative-ai` SDK
- Add case for `"gemini"` in `generateImages()` switch statement
- Use `gemini-2.0-flash-exp` model (or `imagen-3.0-generate-001` if available)

### 3. Environment Configuration
**File:** `.env.example`

Add:
```bash
# Google AI Studio (Gemini) - for AI image generation
GOOGLE_AI_STUDIO_KEY=your_google_ai_studio_key
```

## Implementation Details

### Gemini API for Image Generation

Google AI Studio provides image generation through the Gemini API. The approach:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateWithGemini(
  config: AIProviderConfig,
  prompt: string,
  dimensions: { width: number; height: number },
  variationCount: number,
  baseSeed?: number
): Promise<GeneratedImage[]> {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  // Generate images one at a time (Gemini generates 1 per request)
  const images: GeneratedImage[] = [];

  for (let i = 0; i < variationCount; i++) {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["image", "text"],
      },
    });

    // Extract image from response
    const imageData = extractImageFromResponse(result);
    images.push(imageData);
  }

  return images;
}
```

### Dimension Handling

Gemini 2.0 Flash doesn't support exact dimension control like SDXL. We'll:
1. Include aspect ratio hints in the prompt (e.g., "vertical portrait format")
2. Accept whatever dimensions Gemini returns
3. Store actual dimensions in the result

### Cost Estimate

Google AI Studio free tier: 15 RPM, 1M tokens/month
Gemini 2.0 Flash image generation: ~$0.02-0.04 per image (estimate)

## Testing

After implementation:
```bash
# Set API key
export GOOGLE_AI_STUDIO_KEY=AIza...

# Test via API
curl -X POST http://localhost:3001/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "sunset over mountains", "stylePreset": "photography", "provider": "gemini"}'
```

## Dependencies

Add to `packages/api/package.json`:
```json
"@google/generative-ai": "^0.21.0"
```

## Rollback

If issues arise, simply don't set `GOOGLE_AI_STUDIO_KEY` - the system falls back to other configured providers.
