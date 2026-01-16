/**
 * Storage Utility Library
 *
 * Provides S3-compatible storage utilities for Cloudflare R2:
 * - File upload/download
 * - Presigned URLs
 * - File management
 * - CDN integration
 *
 * Uses AWS SDK v3 for S3-compatible operations.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type DeleteObjectCommandInput,
  type HeadObjectCommandInput,
  type ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Storage configuration
 */
export interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
  cdnUrl?: string;
}

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;
  const bucket = process.env.R2_BUCKET;
  const cdnUrl = process.env.CDN_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing required storage configuration. Ensure R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET are set.');
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: 'auto', // Cloudflare R2 uses 'auto' region
    cdnUrl,
  };
}

/**
 * Validate storage configuration
 */
export function validateStorageConfig(config: Partial<StorageConfig>): boolean {
  return !!(
    config.endpoint &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucket
  );
}

/**
 * Create S3 client for R2
 */
export function createStorageClient(config?: StorageConfig): S3Client {
  const storageConfig = config || getStorageConfig();

  return new S3Client({
    endpoint: storageConfig.endpoint,
    region: storageConfig.region || 'auto',
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey,
    },
  });
}

/**
 * Storage class for file operations
 */
export class Storage {
  private client: S3Client;
  private bucket: string;
  private cdnUrl?: string;

  constructor(config?: StorageConfig) {
    const storageConfig = config || getStorageConfig();
    this.client = createStorageClient(storageConfig);
    this.bucket = storageConfig.bucket;
    this.cdnUrl = storageConfig.cdnUrl;
  }

  /**
   * Upload file to storage
   */
  async upload(
    key: string,
    data: Buffer | Uint8Array | string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      cacheControl?: string;
    }
  ): Promise<{ key: string; url: string }> {
    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: options?.contentType || 'application/octet-stream',
      Metadata: options?.metadata,
      CacheControl: options?.cacheControl,
    };

    const command = new PutObjectCommand(input);
    await this.client.send(command);

    return {
      key,
      url: this.getPublicUrl(key),
    };
  }

  /**
   * Download file from storage
   */
  async download(key: string): Promise<Buffer> {
    const input: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    const command = new GetObjectCommand(input);
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error('File not found or empty');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Delete file from storage
   */
  async delete(key: string): Promise<void> {
    const input: DeleteObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    const command = new DeleteObjectCommand(input);
    await this.client.send(command);
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const input: HeadObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
      };

      const command = new HeadObjectCommand(input);
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<{
    size: number;
    contentType?: string;
    lastModified?: Date;
    metadata?: Record<string, string>;
  }> {
    const input: HeadObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    const command = new HeadObjectCommand(input);
    const response = await this.client.send(command);

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  }

  /**
   * List files with optional prefix
   */
  async list(
    prefix?: string,
    options?: {
      maxKeys?: number;
      continuationToken?: string;
    }
  ): Promise<{
    files: Array<{ key: string; size: number; lastModified?: Date }>;
    continuationToken?: string;
  }> {
    const input: ListObjectsV2CommandInput = {
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: options?.maxKeys || 1000,
      ContinuationToken: options?.continuationToken,
    };

    const command = new ListObjectsV2Command(input);
    const response = await this.client.send(command);

    const files = (response.Contents || []).map((item) => ({
      key: item.Key!,
      size: item.Size || 0,
      lastModified: item.LastModified,
    }));

    return {
      files,
      continuationToken: response.NextContinuationToken,
    };
  }

  /**
   * Generate presigned URL for temporary access
   */
  async getPresignedUrl(
    key: string,
    options?: {
      expiresIn?: number; // seconds
      operation?: 'get' | 'put';
    }
  ): Promise<string> {
    const operation = options?.operation || 'get';
    const expiresIn = options?.expiresIn || 3600; // 1 hour default

    const command =
      operation === 'get'
        ? new GetObjectCommand({ Bucket: this.bucket, Key: key })
        : new PutObjectCommand({ Bucket: this.bucket, Key: key });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${key}`;
    }

    // Fallback to R2 public URL format
    return `https://${this.bucket}.r2.dev/${key}`;
  }

  /**
   * Generate unique file key with timestamp
   */
  generateKey(filename: string, prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const parts = [prefix, `${timestamp}-${random}`, sanitized].filter(Boolean);
    return parts.join('/');
  }
}

// Create default storage instance (singleton)
let defaultStorage: Storage | null = null;

export function getDefaultStorage(): Storage {
  if (!defaultStorage) {
    defaultStorage = new Storage();
  }
  return defaultStorage;
}
