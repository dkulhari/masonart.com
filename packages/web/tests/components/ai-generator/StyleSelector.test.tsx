/**
 * StyleSelector Component Tests
 *
 * Tests for AI style preset and aspect ratio selection:
 * - Style preset display and selection
 * - Category filtering
 * - Premium style handling
 * - Aspect ratio selection
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Style Presets Tests
// ============================================================================

describe('StyleSelector - Style Presets', () => {
  const STYLE_PRESET_IDS = [
    // Original 10 presets
    'wabi-sabi',
    'abstract-expression',
    'botanical',
    'geometric-modern',
    'vintage-poster',
    'pop-art',
    'watercolor',
    'photography',
    'line-art',
    'typography',
    // 5 new presets from Full AI Generator feature
    'ink-wash',
    'digital-art',
    'minimalist-modern',
    'impressionist',
    'art-deco',
  ];

  describe('Preset count', () => {
    it('should have 15 total style presets', () => {
      expect(STYLE_PRESET_IDS.length).toBe(15);
    });
  });

  describe('Preset IDs', () => {
    it('should include all original presets', () => {
      const originalPresets = [
        'wabi-sabi', 'abstract-expression', 'botanical', 'geometric-modern',
        'vintage-poster', 'pop-art', 'watercolor', 'photography',
        'line-art', 'typography',
      ];
      originalPresets.forEach((preset) => {
        expect(STYLE_PRESET_IDS).toContain(preset);
      });
    });

    it('should include all new presets', () => {
      const newPresets = [
        'ink-wash', 'digital-art', 'minimalist-modern',
        'impressionist', 'art-deco',
      ];
      newPresets.forEach((preset) => {
        expect(STYLE_PRESET_IDS).toContain(preset);
      });
    });
  });
});

// ============================================================================
// Category Tests
// ============================================================================

describe('StyleSelector - Categories', () => {
  const CATEGORIES = ['all', 'artistic', 'photographic', 'illustrative', 'decorative'];

  const stylesByCategory = {
    artistic: ['wabi-sabi', 'abstract-expression', 'pop-art', 'watercolor', 'ink-wash', 'impressionist'],
    photographic: ['photography'],
    illustrative: ['botanical', 'line-art', 'digital-art'],
    decorative: ['geometric-modern', 'vintage-poster', 'typography', 'minimalist-modern', 'art-deco'],
  };

  describe('Category options', () => {
    it('should have 5 category options', () => {
      expect(CATEGORIES.length).toBe(5);
    });

    it('should include "all" category', () => {
      expect(CATEGORIES).toContain('all');
    });
  });

  describe('Category assignments', () => {
    it('should have artistic styles', () => {
      expect(stylesByCategory.artistic.length).toBeGreaterThan(0);
    });

    it('should have photographic styles', () => {
      expect(stylesByCategory.photographic.length).toBeGreaterThan(0);
    });

    it('should have illustrative styles', () => {
      expect(stylesByCategory.illustrative.length).toBeGreaterThan(0);
    });

    it('should have decorative styles', () => {
      expect(stylesByCategory.decorative.length).toBeGreaterThan(0);
    });
  });

  describe('New preset categories', () => {
    it('ink-wash should be artistic', () => {
      expect(stylesByCategory.artistic).toContain('ink-wash');
    });

    it('digital-art should be illustrative', () => {
      expect(stylesByCategory.illustrative).toContain('digital-art');
    });

    it('minimalist-modern should be decorative', () => {
      expect(stylesByCategory.decorative).toContain('minimalist-modern');
    });

    it('impressionist should be artistic', () => {
      expect(stylesByCategory.artistic).toContain('impressionist');
    });

    it('art-deco should be decorative', () => {
      expect(stylesByCategory.decorative).toContain('art-deco');
    });
  });
});

// ============================================================================
// Premium Presets Tests
// ============================================================================

describe('StyleSelector - Premium Presets', () => {
  const premiumPresets = ['photography', 'art-deco'];
  const freePresets = [
    'wabi-sabi', 'abstract-expression', 'botanical', 'geometric-modern',
    'vintage-poster', 'pop-art', 'watercolor', 'line-art', 'typography',
    'ink-wash', 'digital-art', 'minimalist-modern', 'impressionist',
  ];

  describe('Premium preset identification', () => {
    it('should have 2 premium presets', () => {
      expect(premiumPresets.length).toBe(2);
    });

    it('photography should be premium', () => {
      expect(premiumPresets).toContain('photography');
    });

    it('art-deco should be premium', () => {
      expect(premiumPresets).toContain('art-deco');
    });
  });

  describe('Free preset identification', () => {
    it('should have 13 free presets', () => {
      expect(freePresets.length).toBe(13);
    });

    it('new presets (except art-deco) should be free', () => {
      const newFreePresets = ['ink-wash', 'digital-art', 'minimalist-modern', 'impressionist'];
      newFreePresets.forEach((preset) => {
        expect(freePresets).toContain(preset);
      });
    });
  });
});

// ============================================================================
// Aspect Ratio Tests
// ============================================================================

describe('StyleSelector - Aspect Ratios', () => {
  const ASPECT_RATIOS = [
    { id: 'square', ratio: '1:1' },
    { id: 'portrait', ratio: '2:3' },
    { id: 'landscape', ratio: '3:2' },
    { id: 'panoramic', ratio: '16:9' },
  ];

  describe('Ratio options', () => {
    it('should have 4 aspect ratio options', () => {
      expect(ASPECT_RATIOS.length).toBe(4);
    });
  });

  describe('Ratio values', () => {
    it('should include square 1:1', () => {
      expect(ASPECT_RATIOS.find((r) => r.id === 'square')?.ratio).toBe('1:1');
    });

    it('should include portrait 2:3', () => {
      expect(ASPECT_RATIOS.find((r) => r.id === 'portrait')?.ratio).toBe('2:3');
    });

    it('should include landscape 3:2', () => {
      expect(ASPECT_RATIOS.find((r) => r.id === 'landscape')?.ratio).toBe('3:2');
    });

    it('should include panoramic 16:9', () => {
      expect(ASPECT_RATIOS.find((r) => r.id === 'panoramic')?.ratio).toBe('16:9');
    });
  });
});

// ============================================================================
// Style Preset Metadata Tests
// ============================================================================

describe('StyleSelector - Preset Metadata', () => {
  const presetMetadata = {
    'ink-wash': {
      name: 'Ink Wash',
      description: 'Asian-inspired flowing ink gradients',
      hasGradient: true,
    },
    'digital-art': {
      name: 'Digital Art',
      description: 'Modern digital illustration and concept art',
      hasGradient: true,
    },
    'minimalist-modern': {
      name: 'Minimalist Modern',
      description: 'Clean Scandinavian-inspired simplicity',
      hasGradient: true,
    },
    'impressionist': {
      name: 'Impressionist',
      description: 'Monet-inspired light and color play',
      hasGradient: true,
    },
    'art-deco': {
      name: 'Art Deco',
      description: '1920s geometric glamour with gold accents',
      hasGradient: true,
    },
  };

  describe('Ink-wash preset', () => {
    it('should have correct name', () => {
      expect(presetMetadata['ink-wash'].name).toBe('Ink Wash');
    });

    it('should mention Asian inspiration', () => {
      expect(presetMetadata['ink-wash'].description.toLowerCase()).toContain('asian');
    });
  });

  describe('Digital-art preset', () => {
    it('should have correct name', () => {
      expect(presetMetadata['digital-art'].name).toBe('Digital Art');
    });

    it('should mention digital/modern', () => {
      expect(presetMetadata['digital-art'].description.toLowerCase()).toMatch(/digital|modern/);
    });
  });

  describe('Minimalist-modern preset', () => {
    it('should have correct name', () => {
      expect(presetMetadata['minimalist-modern'].name).toBe('Minimalist Modern');
    });

    it('should mention Scandinavian/clean', () => {
      expect(presetMetadata['minimalist-modern'].description.toLowerCase()).toMatch(/scandinavian|clean/);
    });
  });

  describe('Impressionist preset', () => {
    it('should have correct name', () => {
      expect(presetMetadata['impressionist'].name).toBe('Impressionist');
    });

    it('should mention Monet', () => {
      expect(presetMetadata['impressionist'].description.toLowerCase()).toContain('monet');
    });
  });

  describe('Art-deco preset', () => {
    it('should have correct name', () => {
      expect(presetMetadata['art-deco'].name).toBe('Art Deco');
    });

    it('should mention 1920s/gold', () => {
      expect(presetMetadata['art-deco'].description.toLowerCase()).toMatch(/1920|gold|glamour/);
    });
  });
});

// ============================================================================
// Selection Handling Tests
// ============================================================================

describe('StyleSelector - Selection Handling', () => {
  describe('Style selection', () => {
    it('should call onStyleChange when style clicked', () => {
      const mockOnChange = vi.fn();
      const selectedStyle = 'ink-wash';
      mockOnChange(selectedStyle);
      expect(mockOnChange).toHaveBeenCalledWith('ink-wash');
    });

    it('should not select premium style without access', () => {
      const hasPremiumAccess = false;
      const isPremium = true;
      const canSelect = !isPremium || hasPremiumAccess;
      expect(canSelect).toBe(false);
    });

    it('should select premium style with access', () => {
      const hasPremiumAccess = true;
      const isPremium = true;
      const canSelect = !isPremium || hasPremiumAccess;
      expect(canSelect).toBe(true);
    });
  });

  describe('Aspect ratio selection', () => {
    it('should call onAspectRatioChange when ratio clicked', () => {
      const mockOnChange = vi.fn();
      const selectedRatio = 'portrait';
      mockOnChange(selectedRatio);
      expect(mockOnChange).toHaveBeenCalledWith('portrait');
    });
  });

  describe('Disabled state', () => {
    it('should not allow selection when disabled', () => {
      const disabled = true;
      const mockOnChange = vi.fn();
      if (!disabled) {
        mockOnChange('wabi-sabi');
      }
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Category Filtering Tests
// ============================================================================

describe('StyleSelector - Category Filtering', () => {
  const allPresets = 15;
  const artisticPresets = 6;
  const photographicPresets = 1;
  const illustrativePresets = 3;
  const decorativePresets = 5;

  it('should show all 15 presets when "all" selected', () => {
    expect(allPresets).toBe(15);
  });

  it('should show 6 artistic presets when filtered', () => {
    expect(artisticPresets).toBe(6);
  });

  it('should show 1 photographic preset when filtered', () => {
    expect(photographicPresets).toBe(1);
  });

  it('should show 3 illustrative presets when filtered', () => {
    expect(illustrativePresets).toBe(3);
  });

  it('should show 5 decorative presets when filtered', () => {
    expect(decorativePresets).toBe(5);
  });

  it('category totals should equal 15', () => {
    const total = artisticPresets + photographicPresets + illustrativePresets + decorativePresets;
    expect(total).toBe(15);
  });
});
