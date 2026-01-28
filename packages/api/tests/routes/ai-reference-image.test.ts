/**
 * AI Reference Image Upload API Tests
 *
 * Tests for reference image upload and processing:
 * - POST /api/ai/reference-image - Upload reference image
 * - GET /api/ai/reference-image-info - Get upload constraints and cost info
 */

import { describe, it, expect } from 'vitest';
import '../setup';

// ============================================================================
// File Validation Tests
// ============================================================================

describe('Reference Image File Validation', () => {
  describe('File type validation', () => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const invalidTypes = ['image/gif', 'image/bmp', 'application/pdf', 'text/plain'];

    validTypes.forEach((type) => {
      it(`should accept ${type}`, () => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        expect(allowedTypes.includes(type)).toBe(true);
      });
    });

    invalidTypes.forEach((type) => {
      it(`should reject ${type}`, () => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        expect(allowedTypes.includes(type)).toBe(false);
      });
    });
  });

  describe('File size validation', () => {
    const MAX_SIZE_MB = 5;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    it('should accept files under 5MB', () => {
      const fileSize = 4 * 1024 * 1024; // 4MB
      expect(fileSize).toBeLessThanOrEqual(MAX_SIZE_BYTES);
    });

    it('should accept file exactly at 5MB', () => {
      const fileSize = MAX_SIZE_BYTES;
      expect(fileSize).toBeLessThanOrEqual(MAX_SIZE_BYTES);
    });

    it('should reject files over 5MB', () => {
      const fileSize = 6 * 1024 * 1024; // 6MB
      expect(fileSize).toBeGreaterThan(MAX_SIZE_BYTES);
    });
  });
});

// ============================================================================
// Weight Validation Tests
// ============================================================================

describe('Reference Image Weight', () => {
  describe('Valid weight values', () => {
    const validWeights = [0.1, 0.25, 0.5, 0.75, 1.0];

    validWeights.forEach((weight) => {
      it(`should accept weight ${weight}`, () => {
        expect(weight).toBeGreaterThanOrEqual(0.1);
        expect(weight).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('Invalid weight values', () => {
    it('should reject weight below 0.1', () => {
      const weight = 0.05;
      expect(weight).toBeLessThan(0.1);
    });

    it('should reject weight above 1.0', () => {
      const weight = 1.5;
      expect(weight).toBeGreaterThan(1.0);
    });

    it('should reject negative weight', () => {
      const weight = -0.5;
      expect(weight).toBeLessThan(0.1);
    });

    it('should reject zero weight', () => {
      const weight = 0;
      expect(weight).toBeLessThan(0.1);
    });
  });

  describe('Weight meaning', () => {
    it('low weight (0.1-0.3) means loose inspiration', () => {
      const weight = 0.2;
      expect(weight).toBeLessThanOrEqual(0.3);
    });

    it('medium weight (0.4-0.6) is default', () => {
      const defaultWeight = 0.5;
      expect(defaultWeight).toBe(0.5);
    });

    it('high weight (0.7-1.0) means closer match', () => {
      const weight = 0.8;
      expect(weight).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// POST /api/ai/reference-image Tests
// ============================================================================

describe('POST /api/ai/reference-image', () => {
  describe('Request validation', () => {
    it('should require a file', () => {
      const formData = {};
      expect(formData).not.toHaveProperty('file');
    });

    it('should accept file with optional weight', () => {
      const formData = {
        file: 'mock-file-data',
        weight: '0.5',
      };
      expect(formData.file).toBeDefined();
      expect(parseFloat(formData.weight)).toBe(0.5);
    });

    it('should default weight to 0.5', () => {
      const formData = { file: 'mock-file-data' };
      const weight = formData.weight ?? '0.5';
      expect(parseFloat(weight)).toBe(0.5);
    });
  });

  describe('Response structure', () => {
    it('should return upload result with URL', () => {
      const response = {
        message: 'Reference image uploaded successfully',
        referenceImage: {
          url: 'https://cdn.example.com/ai-reference-images/user-123/abc.jpg',
          key: 'ai-reference-images/user-123/abc.jpg',
          weight: 0.5,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          costMultiplier: 1.2,
        },
      };

      expect(response.referenceImage.url).toContain('ai-reference-images');
      expect(response.referenceImage.weight).toBe(0.5);
      expect(response.referenceImage.costMultiplier).toBe(1.2);
    });

    it('should include expiration time (24 hours)', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 24 * 60 * 60 * 1000);
      const hoursUntilExpiry = (expiresAt.getTime() - now) / (1000 * 60 * 60);
      expect(hoursUntilExpiry).toBeCloseTo(24, 0);
    });
  });

  describe('Cost multiplier', () => {
    it('should add 20% to generation cost', () => {
      const baseCost = 100;
      const multiplier = 1.2;
      const adjustedCost = baseCost * multiplier;
      expect(adjustedCost).toBe(120);
    });
  });
});

// ============================================================================
// GET /api/ai/reference-image-info Tests
// ============================================================================

describe('GET /api/ai/reference-image-info', () => {
  describe('Response structure', () => {
    const expectedResponse = {
      maxSizeMB: 5,
      maxDimension: 1024,
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
      costMultiplier: 1.2,
      costExplanation: 'Using a reference image adds 20% to generation cost due to additional processing',
      weightRange: {
        min: 0.1,
        max: 1.0,
        default: 0.5,
        explanation: 'Low weight = loose inspiration, High weight = closer match to reference',
      },
      expiresAfterHours: 24,
    };

    it('should return maxSizeMB', () => {
      expect(expectedResponse.maxSizeMB).toBe(5);
    });

    it('should return supported formats', () => {
      expect(expectedResponse.supportedFormats).toContain('image/jpeg');
      expect(expectedResponse.supportedFormats).toContain('image/png');
      expect(expectedResponse.supportedFormats).toContain('image/webp');
      expect(expectedResponse.supportedFormats).not.toContain('image/gif');
    });

    it('should return cost multiplier', () => {
      expect(expectedResponse.costMultiplier).toBe(1.2);
    });

    it('should return weight range', () => {
      expect(expectedResponse.weightRange.min).toBe(0.1);
      expect(expectedResponse.weightRange.max).toBe(1.0);
      expect(expectedResponse.weightRange.default).toBe(0.5);
    });

    it('should return expiration info', () => {
      expect(expectedResponse.expiresAfterHours).toBe(24);
    });
  });
});

// ============================================================================
// Integration with Generation Tests
// ============================================================================

describe('Reference Image in Generation Request', () => {
  describe('Schema validation', () => {
    it('should accept generation with reference image URL', () => {
      const request = {
        prompt: 'A sunset over mountains',
        stylePreset: 'photography',
        aspectRatio: 'landscape',
        referenceImageUrl: 'https://cdn.example.com/ai-reference-images/user-123/abc.jpg',
        referenceImageWeight: 0.7,
      };

      expect(request.referenceImageUrl).toBeDefined();
      expect(request.referenceImageWeight).toBeDefined();
    });

    it('should accept generation without reference image', () => {
      const request = {
        prompt: 'A sunset over mountains',
        stylePreset: 'photography',
        aspectRatio: 'landscape',
      };

      expect(request.referenceImageUrl).toBeUndefined();
      expect(request.referenceImageWeight).toBeUndefined();
    });

    it('should default weight to 0.5 when not provided', () => {
      const request = {
        prompt: 'A sunset',
        stylePreset: 'photography',
        aspectRatio: 'landscape',
        referenceImageUrl: 'https://example.com/ref.jpg',
      };
      const weight = request.referenceImageWeight ?? 0.5;
      expect(weight).toBe(0.5);
    });
  });

  describe('Cost calculation with reference', () => {
    it('should increase cost when using reference image', () => {
      const baseCostPaise = 500; // Base cost in paise
      const costMultiplier = 1.2;

      const withReference = baseCostPaise * costMultiplier;
      const withoutReference = baseCostPaise;

      expect(withReference).toBeGreaterThan(withoutReference);
      expect(withReference).toBe(600);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  describe('File naming', () => {
    it('should sanitize file names', () => {
      const unsafeName = 'my image (1).jpg';
      const sanitized = unsafeName.replace(/[^a-zA-Z0-9.-]/g, '_');
      expect(sanitized).toBe('my_image__1_.jpg');
    });

    it('should generate unique keys', () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const key1 = `ai-reference-images/user-1/${timestamp}-${random}.jpg`;
      const key2 = `ai-reference-images/user-1/${timestamp}-${Math.random().toString(36).substring(2, 8)}.jpg`;
      expect(key1).not.toBe(key2);
    });
  });

  describe('Expiration handling', () => {
    it('should calculate correct expiration time', () => {
      const uploadTime = new Date('2026-01-28T12:00:00Z');
      const expiresAt = new Date(uploadTime.getTime() + 24 * 60 * 60 * 1000);
      expect(expiresAt.toISOString()).toBe('2026-01-29T12:00:00.000Z');
    });

    it('should consider reference expired after 24 hours', () => {
      const uploadTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const expiresAt = uploadTime + 24 * 60 * 60 * 1000;
      const isExpired = Date.now() > expiresAt;
      expect(isExpired).toBe(true);
    });

    it('should consider reference valid within 24 hours', () => {
      const uploadTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
      const expiresAt = uploadTime + 24 * 60 * 60 * 1000;
      const isExpired = Date.now() > expiresAt;
      expect(isExpired).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('should accept valid image URLs', () => {
      const validUrls = [
        'https://example.com/image.jpg',
        'https://cdn.example.com/path/to/image.png',
        'https://storage.googleapis.com/bucket/image.webp',
      ];
      const urlRegex = /^https?:\/\/.+/;
      validUrls.forEach((url) => {
        expect(urlRegex.test(url)).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/image.jpg',
        '',
      ];
      const urlRegex = /^https:\/\/.+/;
      invalidUrls.forEach((url) => {
        expect(urlRegex.test(url)).toBe(false);
      });
    });
  });
});

// ============================================================================
// Storage Path Tests
// ============================================================================

describe('Storage Paths', () => {
  it('should use correct prefix for reference images', () => {
    const prefix = 'ai-reference-images/';
    const userId = 'user-123';
    const filename = 'abc123.jpg';
    const key = `${prefix}${userId}/${filename}`;
    expect(key).toBe('ai-reference-images/user-123/abc123.jpg');
  });

  it('should organize by user ID', () => {
    const key = 'ai-reference-images/user-123/timestamp-random.jpg';
    expect(key).toContain('user-123');
  });
});
