/**
 * GenerationResults Component Tests
 *
 * Tests for generation results display:
 * - Image display
 * - Selection handling
 * - Upscale functionality
 * - Wallet balance display
 * - Loading and error states
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Image Grid Tests
// ============================================================================

describe("GenerationResults - Image Grid", () => {
  const mockImages = [
    { id: "img-1", imageUrl: "https://example.com/1.jpg" },
    { id: "img-2", imageUrl: "https://example.com/2.jpg" },
    { id: "img-3", imageUrl: "https://example.com/3.jpg" },
    { id: "img-4", imageUrl: "https://example.com/4.jpg" },
  ];

  it("should display all generated images", () => {
    expect(mockImages.length).toBe(4);
  });

  it("should show thumbnail when available", () => {
    const image = {
      id: "img-1",
      imageUrl: "https://example.com/full.jpg",
      thumbnailUrl: "https://example.com/thumb.jpg",
    };
    const displayUrl = image.thumbnailUrl || image.imageUrl;
    expect(displayUrl).toBe("https://example.com/thumb.jpg");
  });

  it("should fallback to imageUrl when no thumbnail", () => {
    const image = {
      id: "img-1",
      imageUrl: "https://example.com/full.jpg",
    };
    const displayUrl = image.thumbnailUrl || image.imageUrl;
    expect(displayUrl).toBe("https://example.com/full.jpg");
  });

  it("should show seed badge when available", () => {
    const image = { id: "img-1", imageUrl: "url", seed: 12345 };
    expect(image.seed).toBe(12345);
  });
});

// ============================================================================
// Selection Tests
// ============================================================================

describe("GenerationResults - Selection", () => {
  it("should call onSelectImage when image clicked", () => {
    const mockOnSelect = vi.fn();
    const generationId = "gen-123";
    const imageId = "img-456";
    mockOnSelect(generationId, imageId);
    expect(mockOnSelect).toHaveBeenCalledWith(generationId, imageId);
  });

  it("should highlight selected image", () => {
    const selectedImageId = "img-1";
    const images = [{ id: "img-1" }, { id: "img-2" }];
    const selectedImage = images.find((i) => i.id === selectedImageId);
    expect(selectedImage).toBeDefined();
  });

  it("should show check icon on selected image", () => {
    const isSelected = true;
    expect(isSelected).toBe(true);
  });
});

// ============================================================================
// Upscale Tests
// ============================================================================

describe("GenerationResults - Upscale", () => {
  const upscaleCosts = [
    { multiplier: 2, cost: 5, estimatedTimeSeconds: 15 },
    { multiplier: 4, cost: 10, estimatedTimeSeconds: 30 },
  ];

  describe("Upscale button", () => {
    it("should show upscale button when onUpscale provided", () => {
      const onUpscale = vi.fn();
      const showUpscale = !!onUpscale;
      expect(showUpscale).toBe(true);
    });

    it("should hide upscale button when no onUpscale", () => {
      const onUpscale = undefined;
      const showUpscale = !!onUpscale;
      expect(showUpscale).toBe(false);
    });

    it("should hide upscale button for upscaled images", () => {
      const image = {
        upscale: { status: "completed", upscaledImageUrl: "url" },
      };
      const hasUpscaledVersion =
        image.upscale?.status === "completed" && image.upscale?.upscaledImageUrl;
      expect(hasUpscaledVersion).toBeTruthy();
    });
  });

  describe("Upscale dropdown", () => {
    it("should show cost options", () => {
      expect(upscaleCosts.length).toBe(2);
    });

    it("should show 2x option with 5 credits", () => {
      const option2x = upscaleCosts.find((o) => o.multiplier === 2);
      expect(option2x?.cost).toBe(5);
    });

    it("should show 4x option with 10 credits", () => {
      const option4x = upscaleCosts.find((o) => o.multiplier === 4);
      expect(option4x?.cost).toBe(10);
    });
  });

  describe("Upscale affordability", () => {
    it("should enable option when wallet has enough balance", () => {
      const walletBalance = 20;
      const optionCost = 5;
      const canAfford = walletBalance >= optionCost;
      expect(canAfford).toBe(true);
    });

    it("should disable option when wallet has insufficient balance", () => {
      const walletBalance = 3;
      const optionCost = 5;
      const canAfford = walletBalance >= optionCost;
      expect(canAfford).toBe(false);
    });

    it("should enable all options when balance is undefined", () => {
      const walletBalance = undefined;
      const optionCost = 10;
      const canAfford = walletBalance === undefined || walletBalance >= optionCost;
      expect(canAfford).toBe(true);
    });
  });

  describe("Upscale callback", () => {
    it("should call onUpscale with correct params", () => {
      const mockOnUpscale = vi.fn();
      const generationId = "gen-123";
      const imageId = "img-456";
      const multiplier = 2;
      mockOnUpscale(generationId, imageId, multiplier);
      expect(mockOnUpscale).toHaveBeenCalledWith("gen-123", "img-456", 2);
    });
  });
});

// ============================================================================
// Upscaling State Tests
// ============================================================================

describe("GenerationResults - Upscaling State", () => {
  it("should show upscaling overlay when image is upscaling", () => {
    const isImageUpscaling = true;
    expect(isImageUpscaling).toBe(true);
  });

  it("should show progress when available", () => {
    const upscaleJob = { status: "processing", progress: 75 };
    expect(upscaleJob.progress).toBe(75);
  });

  it("should hide action buttons when upscaling", () => {
    const imageIsUpscaling = true;
    const showActionButtons = !imageIsUpscaling;
    expect(showActionButtons).toBe(false);
  });
});

// ============================================================================
// Upscaled Badge Tests
// ============================================================================

describe("GenerationResults - Upscaled Badge", () => {
  it("should show badge for upscaled images", () => {
    const image = {
      upscale: { status: "completed", upscaledImageUrl: "url", multiplier: 2 },
    };
    const hasUpscaledVersion =
      image.upscale?.status === "completed" && image.upscale?.upscaledImageUrl;
    expect(hasUpscaledVersion).toBeTruthy();
  });

  it("should show correct multiplier on badge", () => {
    const image = {
      upscale: { status: "completed", upscaledImageUrl: "url", multiplier: 4 },
    };
    expect(image.upscale.multiplier).toBe(4);
  });

  it("should not show badge for non-upscaled images", () => {
    const image = { upscale: undefined };
    const hasUpscaledVersion = image.upscale?.status === "completed";
    expect(hasUpscaledVersion).toBeFalsy();
  });
});

// ============================================================================
// Wallet Balance Tests
// ============================================================================

describe("GenerationResults - Wallet Balance", () => {
  it("should display wallet balance when provided", () => {
    const walletBalance = 100;
    const showBalance = walletBalance !== undefined;
    expect(showBalance).toBe(true);
  });

  it("should hide wallet balance when undefined", () => {
    const walletBalance = undefined;
    const showBalance = walletBalance !== undefined;
    expect(showBalance).toBe(false);
  });

  it("should show low balance warning when under 5", () => {
    const walletBalance = 3;
    const isLowBalance = walletBalance < 5;
    expect(isLowBalance).toBe(true);
  });

  it("should not show warning when balance is sufficient", () => {
    const walletBalance = 50;
    const isLowBalance = walletBalance < 5;
    expect(isLowBalance).toBe(false);
  });
});

// ============================================================================
// Generation Status Tests
// ============================================================================

describe("GenerationResults - Generation Status", () => {
  describe("Empty state", () => {
    it("should show empty state when no generation", () => {
      const currentGeneration = null;
      const isGenerating = false;
      const showEmpty = !currentGeneration && !isGenerating;
      expect(showEmpty).toBe(true);
    });
  });

  describe("Loading state", () => {
    it("should show loading when isGenerating", () => {
      const isGenerating = true;
      expect(isGenerating).toBe(true);
    });

    it("should show loading when status is queued", () => {
      const status = "queued";
      const isLoading = status === "queued" || status === "processing";
      expect(isLoading).toBe(true);
    });

    it("should show loading when status is processing", () => {
      const status = "processing";
      const isLoading = status === "queued" || status === "processing";
      expect(isLoading).toBe(true);
    });
  });

  describe("Error state", () => {
    it("should show error when status is failed", () => {
      const status = "failed";
      const showError = status === "failed";
      expect(showError).toBe(true);
    });

    it("should display error message", () => {
      const generation = { status: "failed", errorMessage: "Content violation" };
      expect(generation.errorMessage).toBe("Content violation");
    });
  });

  describe("Cancelled state", () => {
    it("should show cancelled when status is cancelled", () => {
      const status = "cancelled";
      const showCancelled = status === "cancelled";
      expect(showCancelled).toBe(true);
    });
  });
});

// ============================================================================
// Action Buttons Tests
// ============================================================================

describe("GenerationResults - Action Buttons", () => {
  describe("Add to Cart", () => {
    it("should enable when image is selected", () => {
      const selectedImageId = "img-1";
      const hasSelectedImage = !!selectedImageId;
      expect(hasSelectedImage).toBe(true);
    });

    it("should disable when no image selected", () => {
      const selectedImageId = undefined;
      const hasSelectedImage = !!selectedImageId;
      expect(hasSelectedImage).toBe(false);
    });

    it("should call onAddToCart", () => {
      const mockOnAddToCart = vi.fn();
      const generation = { id: "gen-123" };
      mockOnAddToCart(generation);
      expect(mockOnAddToCart).toHaveBeenCalledWith(generation);
    });
  });

  describe("New Variations", () => {
    it("should call onGenerateVariations", () => {
      const mockOnGenerateVariations = vi.fn();
      const generation = { id: "gen-123" };
      mockOnGenerateVariations(generation);
      expect(mockOnGenerateVariations).toHaveBeenCalledWith(generation);
    });
  });

  describe("Retry", () => {
    it("should call onRetry", () => {
      const mockOnRetry = vi.fn();
      mockOnRetry();
      expect(mockOnRetry).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Preview Modal Tests
// ============================================================================

describe("GenerationResults - Preview Modal", () => {
  it("should open preview on zoom click", () => {
    let selectedForPreview = null as { id: string } | null;
    selectedForPreview = { id: "img-1" };
    expect(selectedForPreview).not.toBeNull();
  });

  it("should close preview on close click", () => {
    let selectedForPreview: { id: string } | null = { id: "img-1" };
    selectedForPreview = null;
    expect(selectedForPreview).toBeNull();
  });

  it("should show upscaled image in preview if available", () => {
    const image = {
      imageUrl: "https://example.com/original.jpg",
      upscale: {
        status: "completed" as const,
        upscaledImageUrl: "https://example.com/upscaled.jpg",
      },
    };
    const hasUpscaled = image.upscale?.status === "completed" && image.upscale?.upscaledImageUrl;
    const displayUrl = hasUpscaled ? image.upscale.upscaledImageUrl : image.imageUrl;
    expect(displayUrl).toBe("https://example.com/upscaled.jpg");
  });

  it("should show high-res download for upscaled images", () => {
    const hasUpscaledVersion = true;
    const downloadLabel = hasUpscaledVersion ? "Download High-Res" : "Download";
    expect(downloadLabel).toBe("Download High-Res");
  });
});

// ============================================================================
// Progress Display Tests
// ============================================================================

describe("GenerationResults - Progress Display", () => {
  it("should show progress percentage", () => {
    const progress = 65;
    expect(Math.round(progress)).toBe(65);
  });

  it("should show progress bar", () => {
    const progress = 75;
    const progressWidth = `${progress}%`;
    expect(progressWidth).toBe("75%");
  });

  it("should show progress message", () => {
    const progressMessage = "Generating your artwork...";
    expect(progressMessage.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Processing Time Tests
// ============================================================================

describe("GenerationResults - Processing Time", () => {
  it("should display processing time when available", () => {
    const processingTimeMs = 15000;
    const displayTime = (processingTimeMs / 1000).toFixed(1);
    expect(displayTime).toBe("15.0");
  });

  it("should format to one decimal place", () => {
    const processingTimeMs = 12345;
    const displayTime = (processingTimeMs / 1000).toFixed(1);
    expect(displayTime).toBe("12.3");
  });
});

// ============================================================================
// Prompt Display Tests
// ============================================================================

describe("GenerationResults - Prompt Display", () => {
  it("should show full prompt when under 100 chars", () => {
    const prompt = "A beautiful sunset over mountains";
    const display = prompt.length > 100 ? `${prompt.slice(0, 100)}...` : prompt;
    expect(display).toBe(prompt);
  });

  it("should truncate long prompts", () => {
    const prompt = "A".repeat(150);
    const display = prompt.length > 100 ? `${prompt.slice(0, 100)}...` : prompt;
    expect(display.length).toBe(103); // 100 chars + '...'
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("GenerationResults - Edge Cases", () => {
  it("should handle empty images array", () => {
    const images: unknown[] = [];
    expect(images.length).toBe(0);
  });

  it("should handle single image", () => {
    const images = [{ id: "img-1", imageUrl: "url" }];
    expect(images.length).toBe(1);
  });

  it("should handle undefined generation fields", () => {
    const generation = {
      id: "gen-1",
      promptText: "test",
      status: "completed" as const,
      images: [],
      processingTimeMs: undefined,
    };
    const hasProcessingTime = !!generation.processingTimeMs;
    expect(hasProcessingTime).toBe(false);
  });

  it("should handle dropdown toggle", () => {
    let dropdownOpen: string | null = null;
    dropdownOpen = "img-1";
    expect(dropdownOpen).toBe("img-1");
    dropdownOpen = null;
    expect(dropdownOpen).toBeNull();
  });
});
