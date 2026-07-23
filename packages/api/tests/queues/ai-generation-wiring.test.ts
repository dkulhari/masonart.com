/**
 * AI Generation Worker Wiring Tests
 *
 * Regression tests for the bug where the BullMQ worker used its own stub
 * pipeline (JSON placeholders) instead of the real provider engine in
 * src/ai/generator.ts. The worker MUST delegate to generateImages() and
 * fail loudly when generation fails — never store placeholder bytes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "../setup";

vi.mock("../../src/ai/generator", () => ({
  generateImages: vi.fn(async () => ({
    success: true,
    images: [
      {
        buffer: Buffer.from("real-png-bytes"),
        width: 832,
        height: 1216,
        seed: 42,
        variationIndex: 0,
        mimeType: "image/png",
      },
    ],
    enhancedPrompt: "enhanced",
    negativePrompt: "",
    provider: "gemini",
    processingTimeMs: 5,
  })),
}));

import { generateImagesWithAI } from "../../src/queues/ai-generation";
import { generateImages } from "../../src/ai/generator";

function fakeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      generationId: "gen-1",
      userId: "user-1",
      prompt: "a serene mountain poster",
      stylePreset: "wabi-sabi",
      aspectRatio: "portrait",
      variationCount: 1,
      modelProvider: "gemini",
      ...overrides,
    },
    updateProgress: vi.fn(async () => undefined),
  } as any;
}

describe("generateImagesWithAI wiring", () => {
  beforeEach(() => {
    vi.mocked(generateImages).mockClear();
  });

  it("delegates to the real ai/generator generateImages with job inputs", async () => {
    const images = await generateImagesWithAI(fakeJob());

    expect(generateImages).toHaveBeenCalledTimes(1);
    const [input, variationCount] = vi.mocked(generateImages).mock.calls[0];
    expect(input.prompt).toBe("a serene mountain poster");
    expect(input.stylePreset).toBe("wabi-sabi");
    expect(input.aspectRatio).toBe("portrait");
    expect(input.provider).toBe("gemini");
    expect(variationCount).toBe(1);

    expect(images).toHaveLength(1);
    expect(images[0].buffer.toString()).toBe("real-png-bytes");
    expect(images[0].seed).toBe(42);
    expect(images[0].width).toBe(832);
    expect(images[0].variationIndex).toBe(0);
  });

  it("throws when generation fails instead of storing placeholders", async () => {
    vi.mocked(generateImages).mockResolvedValueOnce({
      success: false,
      images: [],
      enhancedPrompt: "",
      negativePrompt: "",
      provider: "gemini",
      processingTimeMs: 1,
      error: "provider not configured",
    } as any);

    await expect(generateImagesWithAI(fakeJob())).rejects.toThrow(
      /provider not configured/
    );
  });

  it("throws when generation succeeds but returns zero images", async () => {
    vi.mocked(generateImages).mockResolvedValueOnce({
      success: true,
      images: [],
      enhancedPrompt: "",
      negativePrompt: "",
      provider: "gemini",
      processingTimeMs: 1,
    } as any);

    await expect(generateImagesWithAI(fakeJob())).rejects.toThrow(/no images/i);
  });
});
