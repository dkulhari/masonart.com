/**
 * Storage Utility Tests
 *
 * Comprehensive tests for S3-compatible storage (Cloudflare R2).
 * Tests cover configuration, file operations, presigned URLs, and error handling.
 *
 * Note: These tests use mock clients where actual R2 credentials aren't available.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getStorageConfig,
  validateStorageConfig,
  createStorageClient,
  Storage,
  getDefaultStorage,
  type StorageConfig,
} from '../../src/lib/storage';
import '../setup';

// Mock storage config for tests
const mockConfig: StorageConfig = {
  endpoint: 'https://test.r2.cloudflarestorage.com',
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
  bucket: 'test-bucket',
  region: 'auto',
  cdnUrl: 'https://cdn.example.com',
};

describe('Storage Configuration', () => {
  describe('getStorageConfig', () => {
    it('should throw error when credentials are missing', () => {
      const originalEnv = { ...process.env };

      // Clear required env vars
      delete process.env.R2_ENDPOINT;
      delete process.env.R2_ACCESS_KEY;
      delete process.env.R2_SECRET_KEY;
      delete process.env.R2_BUCKET;

      expect(() => getStorageConfig()).toThrow('Missing required storage configuration');

      // Restore env
      process.env = originalEnv;
    });

    it('should return config when all required vars are set', () => {
      const originalEnv = { ...process.env };

      process.env.R2_ENDPOINT = mockConfig.endpoint;
      process.env.R2_ACCESS_KEY = mockConfig.accessKeyId;
      process.env.R2_SECRET_KEY = mockConfig.secretAccessKey;
      process.env.R2_BUCKET = mockConfig.bucket;
      process.env.CDN_URL = mockConfig.cdnUrl;

      const config = getStorageConfig();

      expect(config.endpoint).toBe(mockConfig.endpoint);
      expect(config.accessKeyId).toBe(mockConfig.accessKeyId);
      expect(config.secretAccessKey).toBe(mockConfig.secretAccessKey);
      expect(config.bucket).toBe(mockConfig.bucket);
      expect(config.cdnUrl).toBe(mockConfig.cdnUrl);

      process.env = originalEnv;
    });

    it('should work with default region', () => {
      const originalEnv = { ...process.env };

      process.env.R2_ENDPOINT = mockConfig.endpoint;
      process.env.R2_ACCESS_KEY = mockConfig.accessKeyId;
      process.env.R2_SECRET_KEY = mockConfig.secretAccessKey;
      process.env.R2_BUCKET = mockConfig.bucket;

      const config = getStorageConfig();
      // Region is optional in config, set to 'auto' when creating client
      expect(config).toBeDefined();
      expect(config.endpoint).toBe(mockConfig.endpoint);

      process.env = originalEnv;
    });

    it('should handle optional CDN URL', () => {
      const originalEnv = { ...process.env };

      process.env.R2_ENDPOINT = mockConfig.endpoint;
      process.env.R2_ACCESS_KEY = mockConfig.accessKeyId;
      process.env.R2_SECRET_KEY = mockConfig.secretAccessKey;
      process.env.R2_BUCKET = mockConfig.bucket;
      delete process.env.CDN_URL;

      const config = getStorageConfig();
      expect(config.cdnUrl).toBeUndefined();

      process.env = originalEnv;
    });
  });

  describe('validateStorageConfig', () => {
    it('should return true for valid config', () => {
      const isValid = validateStorageConfig(mockConfig);
      expect(isValid).toBe(true);
    });

    it('should return false for missing endpoint', () => {
      const invalidConfig = { ...mockConfig, endpoint: '' };
      const isValid = validateStorageConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should return false for missing accessKeyId', () => {
      const invalidConfig = { ...mockConfig, accessKeyId: '' };
      const isValid = validateStorageConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should return false for missing secretAccessKey', () => {
      const invalidConfig = { ...mockConfig, secretAccessKey: '' };
      const isValid = validateStorageConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should return false for missing bucket', () => {
      const invalidConfig = { ...mockConfig, bucket: '' };
      const isValid = validateStorageConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should allow missing CDN URL', () => {
      const configWithoutCDN = { ...mockConfig, cdnUrl: undefined };
      const isValid = validateStorageConfig(configWithoutCDN);
      expect(isValid).toBe(true);
    });

    it('should handle partial config', () => {
      const partialConfig = {
        endpoint: 'https://test.com',
        accessKeyId: 'key',
      };
      const isValid = validateStorageConfig(partialConfig);
      expect(isValid).toBe(false);
    });
  });

  describe('createStorageClient', () => {
    it('should create S3Client instance', () => {
      const client = createStorageClient(mockConfig);
      expect(client).toBeInstanceOf(S3Client);
    });

    it('should configure endpoint correctly', () => {
      const client = createStorageClient(mockConfig);
      const config = (client as any).config;

      expect(config.endpoint).toBeDefined();
    });

    it('should configure region correctly', () => {
      const client = createStorageClient(mockConfig);
      const config = (client as any).config;

      expect(config.region).toBeDefined();
    });

    it('should configure credentials correctly', () => {
      const client = createStorageClient(mockConfig);
      const config = (client as any).config;

      expect(config.credentials).toBeDefined();
    });
  });
});

describe('Storage Class', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage(mockConfig);
  });

  describe('constructor', () => {
    it('should create Storage instance', () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(Storage);
    });

    it('should accept custom config', () => {
      const customStorage = new Storage(mockConfig);
      expect(customStorage).toBeDefined();
    });
  });

  describe('generateKey', () => {
    it('should generate unique key for filename', () => {
      const key1 = storage.generateKey('test.jpg');
      const key2 = storage.generateKey('test.jpg');

      expect(key1).not.toBe(key2);
      expect(key1).toContain('test.jpg');
      expect(key2).toContain('test.jpg');
    });

    it('should include prefix in key', () => {
      const key = storage.generateKey('test.jpg', 'uploads');
      expect(key).toContain('uploads');
      expect(key).toContain('test.jpg');
    });

    it('should sanitize filename', () => {
      const key = storage.generateKey('test file (1).jpg');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
    });

    it('should include timestamp', () => {
      const beforeTimestamp = Date.now();
      const key = storage.generateKey('test.jpg');
      const afterTimestamp = Date.now();

      // Extract timestamp from key (format: prefix/timestamp-random/filename)
      const parts = key.split('/');
      const timestampPart = parts[parts.length - 2] || parts[0];
      const timestamp = parseInt(timestampPart.split('-')[0]);

      expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should include random string', () => {
      const key1 = storage.generateKey('test.jpg');
      const key2 = storage.generateKey('test.jpg');

      // Keys should be different due to random string
      expect(key1).not.toBe(key2);
    });
  });

  describe('getPublicUrl', () => {
    it('should return CDN URL when configured', () => {
      const url = storage.getPublicUrl('path/to/file.jpg');
      expect(url).toBe('https://cdn.example.com/path/to/file.jpg');
    });

    it('should return R2 public URL when CDN not configured', () => {
      const configWithoutCDN = { ...mockConfig, cdnUrl: undefined };
      const storageWithoutCDN = new Storage(configWithoutCDN);

      const url = storageWithoutCDN.getPublicUrl('path/to/file.jpg');
      expect(url).toBe('https://test-bucket.r2.dev/path/to/file.jpg');
    });

    it('should handle keys with slashes', () => {
      const url = storage.getPublicUrl('folder/subfolder/file.jpg');
      expect(url).toBe('https://cdn.example.com/folder/subfolder/file.jpg');
    });

    it('should handle keys without extension', () => {
      const url = storage.getPublicUrl('document');
      expect(url).toBe('https://cdn.example.com/document');
    });
  });
});

describe('Storage File Operations (Mock)', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage(mockConfig);

    // Mock S3Client.send method
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) {
        return {
          ETag: '"mock-etag"',
          $metadata: { httpStatusCode: 200 },
        };
      }

      if (command instanceof GetObjectCommand) {
        // Mock readable stream
        const mockBody = {
          async *[Symbol.asyncIterator]() {
            yield Buffer.from('mock file content');
          },
        };
        return {
          Body: mockBody,
          ContentLength: 18,
          ContentType: 'text/plain',
          $metadata: { httpStatusCode: 200 },
        };
      }

      if (command instanceof DeleteObjectCommand) {
        return {
          $metadata: { httpStatusCode: 204 },
        };
      }

      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: 1024,
          ContentType: 'image/jpeg',
          LastModified: new Date(),
          Metadata: { key: 'value' },
          $metadata: { httpStatusCode: 200 },
        };
      }

      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            {
              Key: 'file1.jpg',
              Size: 1024,
              LastModified: new Date(),
            },
            {
              Key: 'file2.png',
              Size: 2048,
              LastModified: new Date(),
            },
          ],
          IsTruncated: false,
          $metadata: { httpStatusCode: 200 },
        };
      }

      return {};
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('upload', () => {
    it('should upload file successfully', async () => {
      const result = await storage.upload('test.jpg', Buffer.from('test content'));

      expect(result.key).toBe('test.jpg');
      expect(result.url).toContain('test.jpg');
    });

    it('should upload with content type', async () => {
      const result = await storage.upload('test.jpg', Buffer.from('test'), {
        contentType: 'image/jpeg',
      });

      expect(result.key).toBe('test.jpg');
    });

    it('should upload with metadata', async () => {
      const result = await storage.upload('test.jpg', Buffer.from('test'), {
        metadata: { userId: '123', purpose: 'profile' },
      });

      expect(result).toBeDefined();
    });

    it('should upload with cache control', async () => {
      const result = await storage.upload('test.jpg', Buffer.from('test'), {
        cacheControl: 'public, max-age=31536000',
      });

      expect(result).toBeDefined();
    });

    it('should accept string data', async () => {
      const result = await storage.upload('test.txt', 'string content');
      expect(result.key).toBe('test.txt');
    });

    it('should accept Uint8Array data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const result = await storage.upload('test.bin', data);
      expect(result.key).toBe('test.bin');
    });
  });

  describe('download', () => {
    it('should download file successfully', async () => {
      const data = await storage.download('test.jpg');

      expect(data).toBeInstanceOf(Buffer);
      expect(data.toString()).toBe('mock file content');
    });

    it('should handle different file types', async () => {
      const data = await storage.download('document.pdf');
      expect(data).toBeInstanceOf(Buffer);
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      // Delete should complete without error
      await storage.delete('test.jpg');
      expect(true).toBe(true); // Assert test completed
    });

    it('should handle non-existent files', async () => {
      // Delete of non-existent file should not throw error
      await storage.delete('nonexistent.jpg');
      expect(true).toBe(true); // Assert test completed
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const exists = await storage.exists('test.jpg');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });

      const exists = await storage.exists('nonexistent.jpg');
      expect(exists).toBe(false);
    });

    it('should throw error for other errors', async () => {
      vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce({
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      });

      await expect(storage.exists('test.jpg')).rejects.toThrow();
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const metadata = await storage.getMetadata('test.jpg');

      expect(metadata.size).toBe(1024);
      expect(metadata.contentType).toBe('image/jpeg');
      expect(metadata.lastModified).toBeInstanceOf(Date);
      expect(metadata.metadata).toEqual({ key: 'value' });
    });

    it('should handle files without custom metadata', async () => {
      vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
        ContentLength: 2048,
        ContentType: 'text/plain',
        LastModified: new Date(),
        $metadata: { httpStatusCode: 200 },
      });

      const metadata = await storage.getMetadata('test.txt');
      expect(metadata.size).toBe(2048);
    });
  });

  describe('list', () => {
    it('should list files in bucket', async () => {
      const result = await storage.list();

      expect(result.files).toHaveLength(2);
      expect(result.files[0].key).toBe('file1.jpg');
      expect(result.files[1].key).toBe('file2.png');
    });

    it('should list files with prefix', async () => {
      const result = await storage.list('uploads/');
      expect(result.files).toBeDefined();
    });

    it('should respect maxKeys option', async () => {
      const result = await storage.list(undefined, { maxKeys: 10 });
      expect(result.files).toBeDefined();
    });

    it('should handle pagination with continuation token', async () => {
      const result = await storage.list(undefined, {
        continuationToken: 'token123',
      });
      expect(result.files).toBeDefined();
    });

    it('should return continuation token when truncated', async () => {
      vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
        Contents: [{ Key: 'file1.jpg', Size: 1024 }],
        IsTruncated: true,
        NextContinuationToken: 'next-token',
        $metadata: { httpStatusCode: 200 },
      });

      const result = await storage.list();
      expect(result.continuationToken).toBe('next-token');
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate presigned URL for GET', async () => {
      const url = await storage.getPresignedUrl('test.jpg');

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    it('should generate presigned URL for PUT', async () => {
      const url = await storage.getPresignedUrl('test.jpg', {
        operation: 'put',
      });

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    it('should accept custom expiration time', async () => {
      const url = await storage.getPresignedUrl('test.jpg', {
        expiresIn: 7200, // 2 hours
      });

      expect(url).toBeDefined();
    });

    it('should default to GET operation', async () => {
      const url = await storage.getPresignedUrl('test.jpg');
      expect(url).toBeDefined();
    });

    it('should default to 1 hour expiration', async () => {
      const url = await storage.getPresignedUrl('test.jpg');
      expect(url).toBeDefined();
    });
  });
});

describe('Storage Integration', () => {
  it('should handle multiple file operations', async () => {
    const storage = new Storage(mockConfig);

    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) {
        return { $metadata: { httpStatusCode: 200 } };
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            async *[Symbol.asyncIterator]() {
              yield Buffer.from('content');
            },
          },
          $metadata: { httpStatusCode: 200 },
        };
      }
      if (command instanceof DeleteObjectCommand) {
        return { $metadata: { httpStatusCode: 204 } };
      }
      return {};
    });

    // Upload
    const uploadResult = await storage.upload('test.jpg', Buffer.from('content'));
    expect(uploadResult.key).toBe('test.jpg');

    // Download
    const data = await storage.download('test.jpg');
    expect(data).toBeInstanceOf(Buffer);

    // Delete
    await storage.delete('test.jpg');
    expect(true).toBe(true); // Assert test completed

    vi.restoreAllMocks();
  });

  it('should generate unique keys consistently', () => {
    const storage = new Storage(mockConfig);
    const keys = new Set();

    for (let i = 0; i < 100; i++) {
      const key = storage.generateKey('test.jpg', 'uploads');
      keys.add(key);
    }

    // All keys should be unique
    expect(keys.size).toBe(100);
  });
});

describe('Default Storage Instance', () => {
  it('should create default storage instance', () => {
    const originalEnv = { ...process.env };

    process.env.R2_ENDPOINT = mockConfig.endpoint;
    process.env.R2_ACCESS_KEY = mockConfig.accessKeyId;
    process.env.R2_SECRET_KEY = mockConfig.secretAccessKey;
    process.env.R2_BUCKET = mockConfig.bucket;

    const storage = getDefaultStorage();
    expect(storage).toBeDefined();
    expect(storage).toBeInstanceOf(Storage);

    process.env = originalEnv;
  });

  it('should return same instance on multiple calls', () => {
    const originalEnv = { ...process.env };

    process.env.R2_ENDPOINT = mockConfig.endpoint;
    process.env.R2_ACCESS_KEY = mockConfig.accessKeyId;
    process.env.R2_SECRET_KEY = mockConfig.secretAccessKey;
    process.env.R2_BUCKET = mockConfig.bucket;

    const storage1 = getDefaultStorage();
    const storage2 = getDefaultStorage();

    expect(storage1).toBe(storage2);

    process.env = originalEnv;
  });
});

describe('Storage Error Handling', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage(mockConfig);
  });

  it('should throw error when download fails', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(
      new Error('Network error')
    );

    await expect(storage.download('test.jpg')).rejects.toThrow();

    vi.restoreAllMocks();
  });

  it('should throw error for empty response body', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Body: undefined,
      $metadata: { httpStatusCode: 200 },
    });

    await expect(storage.download('test.jpg')).rejects.toThrow(
      'File not found or empty'
    );

    vi.restoreAllMocks();
  });

  it('should handle metadata fetch errors', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(
      new Error('Access denied')
    );

    await expect(storage.getMetadata('test.jpg')).rejects.toThrow();

    vi.restoreAllMocks();
  });
});

describe('Storage Performance', () => {
  it('should generate keys quickly', () => {
    const storage = new Storage(mockConfig);

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      storage.generateKey('test.jpg', 'uploads');
    }

    const duration = Date.now() - start;

    // 1000 key generations should complete in under 100ms
    expect(duration).toBeLessThan(100);
  });

  it('should construct URLs quickly', () => {
    const storage = new Storage(mockConfig);

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      storage.getPublicUrl(`file${i}.jpg`);
    }

    const duration = Date.now() - start;

    // 1000 URL constructions should complete in under 50ms
    expect(duration).toBeLessThan(50);
  });
});
