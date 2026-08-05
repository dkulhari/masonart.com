/**
 * Review Media Storage Tests
 *
 * Video uploads are a sibling of the image path, not a widened image allowlist:
 * different mime allowlist, a much larger size cap, a duration cap, and a
 * separate key prefix that the transcode worker reads back.
 *
 * Covers:
 * 1. isValidVideoType - the video sibling of isValidImageType
 * 2. REVIEW_MEDIA_LIMITS - image/video size caps and video duration cap
 * 3. StoragePaths.reviewMedia - stable, prefixed, sanitised object keys
 */

import { describe, it, expect } from 'vitest';
import '../setup';

import {
  isValidVideoType,
  isValidImageType,
  REVIEW_MEDIA_LIMITS,
  StoragePaths,
} from '../../src/lib/storage';

describe('isValidVideoType', () => {
  it('accepts the browser-playable upload types', () => {
    expect(isValidVideoType('video/mp4')).toBe(true);
    expect(isValidVideoType('video/quicktime')).toBe(true);
    expect(isValidVideoType('video/webm')).toBe(true);
  });

  it('is case-insensitive, mirroring isValidImageType', () => {
    expect(isValidVideoType('VIDEO/MP4')).toBe(true);
    expect(isValidVideoType('Video/QuickTime')).toBe(true);
  });

  it('rejects images, documents and empty content types', () => {
    expect(isValidVideoType('image/png')).toBe(false);
    expect(isValidVideoType('image/jpeg')).toBe(false);
    expect(isValidVideoType('application/pdf')).toBe(false);
    expect(isValidVideoType('')).toBe(false);
  });

  it('rejects mixed-case junk and unplayable containers', () => {
    expect(isValidVideoType('ViDeO/AvI')).toBe(false);
    expect(isValidVideoType('video/x-msvideo')).toBe(false);
    expect(isValidVideoType('VIDEO/')).toBe(false);
    expect(isValidVideoType('not-a-mime-type')).toBe(false);
  });

  it('is a sibling of isValidImageType, not a replacement', () => {
    // A video type must never pass the image check and vice versa
    expect(isValidImageType('video/mp4')).toBe(false);
    expect(isValidVideoType('image/webp')).toBe(false);
  });
});

describe('REVIEW_MEDIA_LIMITS', () => {
  it('caps review images at 10MB', () => {
    expect(REVIEW_MEDIA_LIMITS.image.maxBytes).toBe(10 * 1024 * 1024);
  });

  it('caps review videos at 200MB', () => {
    expect(REVIEW_MEDIA_LIMITS.video.maxBytes).toBe(200 * 1024 * 1024);
  });

  it('caps review video duration at 60 seconds', () => {
    expect(REVIEW_MEDIA_LIMITS.video.maxDurationSeconds).toBe(60);
  });

  it('lists the accepted types for each kind', () => {
    expect(REVIEW_MEDIA_LIMITS.image.types).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(REVIEW_MEDIA_LIMITS.video.types).toEqual([
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);
  });

  it('agrees with isValidVideoType on every listed video type', () => {
    for (const type of REVIEW_MEDIA_LIMITS.video.types) {
      expect(isValidVideoType(type)).toBe(true);
    }
  });
});

describe('StoragePaths.reviewMedia', () => {
  it('yields a key under the review media prefix', () => {
    const key = StoragePaths.reviewMedia('review-123', 'clip.mp4');
    expect(key).toBe('reviews/review-123/media/clip.mp4');
  });

  it('is stable - the same inputs always produce the same key', () => {
    const first = StoragePaths.reviewMedia('review-123', 'clip.mp4');
    const second = StoragePaths.reviewMedia('review-123', 'clip.mp4');
    expect(first).toBe(second);
  });

  it('partitions by review id', () => {
    const a = StoragePaths.reviewMedia('review-a', 'clip.mp4');
    const b = StoragePaths.reviewMedia('review-b', 'clip.mp4');
    expect(a).not.toBe(b);
    expect(a.startsWith('reviews/review-a/media/')).toBe(true);
    expect(b.startsWith('reviews/review-b/media/')).toBe(true);
  });

  it('sanitises path traversal and unsafe characters out of the filename', () => {
    const key = StoragePaths.reviewMedia('review-123', '../../etc/passwd');
    expect(key.includes('..')).toBe(false);
    expect(key.startsWith('reviews/review-123/media/')).toBe(true);

    const spaced = StoragePaths.reviewMedia('review-123', 'my holiday clip!.mov');
    expect(spaced).toBe('reviews/review-123/media/my_holiday_clip_.mov');
  });

  it('sanitises the review id too', () => {
    const key = StoragePaths.reviewMedia('../admin', 'clip.mp4');
    expect(key.includes('..')).toBe(false);
    expect(key.startsWith('reviews/')).toBe(true);
  });
});
