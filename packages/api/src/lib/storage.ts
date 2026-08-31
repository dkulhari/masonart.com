/**
 * Storage Module (S3/R2 Compatible)
 *
 * Provides utilities for storing and retrieving files from S3-compatible storage.
 * Works with AWS S3, Cloudflare R2, or MinIO (local development).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { processImage, type ProcessedImage } from './image-processing';

// ============================================================================
// S3 Client Configuration
// ============================================================================

/**
 * S3-compatible storage client
 * Works with AWS S3, Cloudflare R2, and MinIO
 */
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
  forcePathStyle: true, // Required for MinIO and some S3-compatible services
});

const BUCKET = process.env.R2_BUCKET || 'poster-app-dev';
const CDN_URL = process.env.CDN_URL || '';

// ============================================================================
// Storage Paths
// ============================================================================

/**
 * Sanitize a single object-key segment.
 *
 * Customer-supplied filenames reach this from review uploads, so the result
 * must never be able to escape its prefix: unsafe characters collapse to `_`,
 * dot runs collapse to a single dot (killing `..` traversal), and leading
 * dots/dashes are stripped.
 */
function sanitizeKeySegment(segment: string, fallback: string): string {
  const cleaned = segment
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '');

  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Storage path prefixes for different content types
 *
 * String members are bare prefixes ending in `/`. `reviewMedia` and
 * `productionQcPhoto` are key builders rather than prefixes because their
 * objects are partitioned per entity id — a review, and a production job.
 */
export const StoragePaths = {
  PRODUCTS: 'products/',
  AI_GENERATIONS: 'ai-generations/',
  AI_REFERENCE_IMAGES: 'ai-reference-images/',
  USER_UPLOADS: 'user-uploads/',
  AVATARS: 'avatars/',
  FRAMES: 'frames/',
  REVIEW_MEDIA: 'reviews/',
  TEMP: 'temp/',

  /**
   * Build a stable object key for one review's media.
   *
   * Stable on purpose: the transcode worker writes derivatives (normalised
   * mp4, poster frame) beside the original and has to be able to recompute
   * the key from `(reviewId, filename)` alone.
   */
  reviewMedia(reviewId: string, filename: string): string {
    const safeReviewId = sanitizeKeySegment(reviewId, 'unknown');
    const safeFilename = sanitizeKeySegment(filename, 'file');
    return `reviews/${safeReviewId}/media/${safeFilename}`;
  },

  /**
   * Build the object key for one production QC photograph (#674).
   *
   * `production-qc/<jobId>/<slot>/<filename>` — the same shape as
   * `reviewMedia` above, with one more level because a job's shots are
   * partitioned by slot as well as by job.
   *
   * **Identity-free.** A job id is a production handle: nothing in this path
   * names the customer, the order or the vendor's staff.
   *
   * **Recomputable.** `production_job_photos.object_key` stores this key and
   * never a URL — `approval_photos.url` is the counter-example, and a stored
   * URL cannot be re-signed. The complete step runs minutes after presign and
   * rebuilds the key from the same `(jobId, slot, filename)`, so nothing
   * time-varying may enter it.
   *
   * **The slot is sanitised even though it comes from a vocabulary.** `slot` is
   * a `text` column; the database checks nothing, so a value that skipped
   * `qcSlotSchema` can reach here and must still not escape its job's prefix.
   * Every slot in `QC_SHOT_SLOTS` is `[a-z0-9_]` and passes through unchanged,
   * which is what lets the retention sweep delete a job by prefix and lets a
   * key be read back as a slot.
   */
  productionQcPhoto(jobId: string, slot: string, filename: string): string {
    const safeJobId = sanitizeKeySegment(jobId, 'unknown');
    const safeSlot = sanitizeKeySegment(slot, 'unknown');
    const safeFilename = sanitizeKeySegment(filename, 'file');
    return `production-qc/${safeJobId}/${safeSlot}/${safeFilename}`;
  },

  /**
   * The prefix covering every QC photograph of one job, across every slot.
   *
   * Exists so the 400-day retention sweep (#697) deletes under exactly the
   * same segment `productionQcPhoto` wrote under. Reimplementing the prefix
   * at the call site would pass its own tests and then silently miss objects
   * the moment `sanitizeKeySegment` changed on one side only — and a missed
   * object is permanent, because the sweep drops the row that named it.
   */
  productionQcJobPrefix(jobId: string): string {
    return `production-qc/${sanitizeKeySegment(jobId, 'unknown')}/`;
  },
} as const;

/**
 * Generate a unique file key
 */
function generateFileKey(
  prefix: string,
  filename: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

  if (userId) {
    return `${prefix}${userId}/${timestamp}-${random}-${sanitizedFilename}`;
  }
  return `${prefix}${timestamp}-${random}-${sanitizedFilename}`;
}

// ============================================================================
// Upload Functions
// ============================================================================

/**
 * Upload options for file uploads
 */
export interface UploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  isPublic?: boolean;
}

/**
 * Upload result with URL and key
 */
export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
}

/**
 * Upload a file buffer to storage
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  options: UploadOptions
): Promise<UploadResult> {
  const command: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: options.contentType,
    Metadata: options.metadata,
    CacheControl: options.cacheControl || 'public, max-age=31536000', // 1 year
  };

  await s3.send(new PutObjectCommand(command));

  return {
    url: getPublicUrl(key),
    key,
    bucket: BUCKET,
  };
}

/**
 * Upload an image with automatic key generation
 */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
  options?: {
    prefix?: string;
    userId?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  const prefix = options?.prefix || StoragePaths.PRODUCTS;
  const key = generateFileKey(prefix, filename, options?.userId);

  return uploadFile(buffer, key, {
    contentType,
    metadata: options?.metadata,
  });
}

/**
 * Upload result with responsive image variants
 */
export interface OptimizedUploadResult extends UploadResult {
  /** WebP URL of the original */
  webpUrl: string;
  /** Responsive variants with URLs */
  variants: Array<{
    name: string;
    width: number;
    url: string;
    key: string;
  }>;
  /** Original image dimensions */
  width: number;
  height: number;
}

/**
 * Upload an image with WebP conversion and responsive variant generation.
 * Stores the original (as WebP) plus thumbnail, card, detail, and full variants.
 */
export async function uploadOptimizedImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
  options?: {
    prefix?: string;
    userId?: string;
    metadata?: Record<string, string>;
  }
): Promise<OptimizedUploadResult> {
  const prefix = options?.prefix || StoragePaths.PRODUCTS;
  const baseKey = generateFileKey(prefix, filename, options?.userId);
  // Remove extension from base key for variant naming
  const keyWithoutExt = baseKey.replace(/\.[^.]+$/, '');

  // Process image: convert to WebP + generate responsive variants
  const processed: ProcessedImage = await processImage(buffer);

  // Upload original as WebP
  const webpKey = `${keyWithoutExt}.webp`;
  await uploadFile(processed.original.buffer, webpKey, {
    contentType: 'image/webp',
    metadata: options?.metadata,
  });

  // Also upload original format as fallback
  const originalResult = await uploadFile(buffer, baseKey, {
    contentType,
    metadata: options?.metadata,
  });

  // Upload responsive variants
  const variants: OptimizedUploadResult['variants'] = [];
  for (const variant of processed.variants) {
    const variantKey = `${keyWithoutExt}${variant.suffix}.webp`;
    await uploadFile(variant.buffer, variantKey, {
      contentType: 'image/webp',
      metadata: options?.metadata,
    });
    variants.push({
      name: variant.name,
      width: variant.width,
      url: getPublicUrl(variantKey),
      key: variantKey,
    });
  }

  return {
    ...originalResult,
    webpUrl: getPublicUrl(webpKey),
    variants,
    width: processed.original.width,
    height: processed.original.height,
  };
}

/**
 * Upload an AI-generated image
 */
export async function uploadAIGeneration(
  buffer: Buffer,
  userId: string,
  generationId: string,
  index: number
): Promise<UploadResult> {
  const key = `${StoragePaths.AI_GENERATIONS}${userId}/${generationId}/${index}.png`;

  return uploadFile(buffer, key, {
    contentType: 'image/png',
    metadata: {
      generationId,
      userId,
      index: String(index),
    },
  });
}

/**
 * Upload user avatar
 */
export async function uploadAvatar(
  buffer: Buffer,
  userId: string,
  contentType: string
): Promise<UploadResult> {
  const extension = contentType.split('/')[1] || 'jpg';
  const key = `${StoragePaths.AVATARS}${userId}/avatar.${extension}`;

  return uploadFile(buffer, key, {
    contentType,
    cacheControl: 'public, max-age=86400', // 1 day (avatars may change)
  });
}

/**
 * Upload a reference image for AI generation
 * Reference images expire after 24 hours
 */
export async function uploadReferenceImage(
  buffer: Buffer,
  userId: string,
  contentType: string
): Promise<UploadResult & { expiresAt: Date }> {
  const extension = getExtensionFromContentType(contentType);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const key = `${StoragePaths.AI_REFERENCE_IMAGES}${userId}/${timestamp}-${random}.${extension}`;

  const result = await uploadFile(buffer, key, {
    contentType,
    cacheControl: 'private, max-age=86400', // 24 hours
    metadata: {
      userId,
      uploadedAt: new Date().toISOString(),
    },
  });

  // Reference images expire after 24 hours
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return {
    ...result,
    expiresAt,
  };
}

// ============================================================================
// Download Functions
// ============================================================================

/**
 * Get an object from storage
 */
export async function getFile(key: string): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );

    if (!response.Body) return null;

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Delete Functions
// ============================================================================

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Delete multiple files by prefix
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    if (listResponse.Contents) {
      for (const object of listResponse.Contents) {
        if (object.Key) {
          await deleteFile(object.Key);
          deletedCount++;
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
}

// ============================================================================
// URL Functions
// ============================================================================

/**
 * Get the public URL for a file
 */
export function getPublicUrl(key: string): string {
  if (CDN_URL) {
    return `${CDN_URL}/${key}`;
  }
  // Fallback to direct S3 URL
  return `${process.env.R2_ENDPOINT}/${BUCKET}/${key}`;
}

/**
 * Generate a pre-signed URL for direct upload
 * Useful for client-side uploads
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a pre-signed URL for download
 * Useful for private files or temporary access
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

// ============================================================================
// Copy/Move Functions
// ============================================================================

/**
 * Copy a file to a new location
 */
export async function copyFile(
  sourceKey: string,
  destinationKey: string
): Promise<UploadResult> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${sourceKey}`,
      Key: destinationKey,
    })
  );

  return {
    url: getPublicUrl(destinationKey),
    key: destinationKey,
    bucket: BUCKET,
  };
}

/**
 * Move a file to a new location (copy + delete)
 */
export async function moveFile(
  sourceKey: string,
  destinationKey: string
): Promise<UploadResult> {
  const result = await copyFile(sourceKey, destinationKey);
  await deleteFile(sourceKey);
  return result;
}

// ============================================================================
// List Functions
// ============================================================================

/**
 * List files in a directory
 */
export async function listFiles(
  prefix: string,
  maxKeys: number = 100
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );

  return (
    response.Contents?.map((item) => ({
      key: item.Key!,
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
    })) || []
  );
}

// ============================================================================
// Image Processing Helpers
// ============================================================================

/**
 * Validate image file type
 */
export function isValidImageType(contentType: string): boolean {
  const validTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];
  return validTypes.includes(contentType.toLowerCase());
}

/**
 * Validate video file type
 *
 * Sibling of isValidImageType, deliberately not a widening of it: video has a
 * different size cap, a duration cap, and a transcode step before it is
 * servable. `video/quicktime` is here because iPhone uploads are HEVC .mov,
 * which no desktop browser plays until the worker normalises it.
 */
export function isValidVideoType(contentType: string): boolean {
  const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
  return validTypes.includes(contentType.toLowerCase());
}

/**
 * Upload limits for review media.
 *
 * Videos are capped by duration as well as bytes — a 200MB cap alone still
 * admits a ten-minute clip that costs minutes of transcode time per review.
 */
export const REVIEW_MEDIA_LIMITS = {
  image: {
    maxBytes: 10 * 1024 * 1024,
    types: ['image/jpeg', 'image/png', 'image/webp'],
  },
  video: {
    maxBytes: 200 * 1024 * 1024,
    maxDurationSeconds: 60,
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
} as const;

/**
 * Get file extension from content type
 */
export function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[contentType.toLowerCase()] || 'jpg';
}

/**
 * Validate file size
 */
export function isValidFileSize(
  sizeBytes: number,
  maxSizeMB: number = 10
): boolean {
  return sizeBytes <= maxSizeMB * 1024 * 1024;
}

// Export the S3 client for advanced usage
export { s3 };
