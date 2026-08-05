/**
 * Review Media Transcode Queue and Worker
 *
 * Submitting a review is never blocked on ffmpeg. The review row saves
 * immediately at `pending` with its video media at `processing`; this worker
 * normalises the clip to H.264/AAC MP4, extracts a poster frame, uploads both,
 * and flips the media row to `ready`.
 *
 * A failure marks that one media row `failed` (which drops it from every read
 * surface, since reads filter on `processingStatus = 'ready'`) and is
 * deliberately swallowed — a customer's review must never disappear because
 * their phone produced a file ffmpeg could not read.
 *
 * Images never reach this queue: `uploadOptimizedImage` (lib/storage.ts)
 * already handles them synchronously on the request path.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { Queue, Worker, type Job } from 'bullmq'
import { eq } from 'drizzle-orm'

import { db } from '../database'
import { reviewMedia } from '../database/schema'
import { logger } from '../lib/logger'
import { createRedisConnection, redis } from '../lib/redis'
import { getFile, uploadFile, REVIEW_MEDIA_LIMITS } from '../lib/storage'
import {
  extractPosterFrame,
  isFfmpegAvailable,
  probeVideo,
  transcodeToMp4,
  VideoProcessingError,
} from '../lib/video-processing'

// ============================================================================
// Types and constants
// ============================================================================

export interface ReviewMediaJobData {
  /** `review_media.id` of the row to fill in */
  mediaId: string
  /** Object key of the original upload as it landed in storage */
  sourceKey: string
}

export const REVIEW_MEDIA_QUEUE_NAME = 'review-media'

/**
 * `processingError` is shown to operators in the admin moderation queue, so it
 * is truncated to something readable rather than a full ffmpeg log.
 */
const MAX_PROCESSING_ERROR_CHARS = 500

/**
 * One attempt, no retry.
 *
 * Transcode failures are overwhelmingly bad input — an unreadable container, a
 * truncated upload — and re-running ffmpeg on the same bytes only burns CPU on
 * a box that is already shared. The failure is recorded on the row, which is
 * the durable record an operator acts on.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
  },
}

/**
 * Review media queue — the request path adds jobs here and returns.
 */
export const reviewMediaQueue = new Queue<ReviewMediaJobData>(
  REVIEW_MEDIA_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  }
)

let reviewMediaWorker: Worker<ReviewMediaJobData> | null = null

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive the keys for the derivatives of an upload.
 *
 * `-web` rather than overwriting `sourceKey`: an .mp4 upload is still
 * re-encoded (phone MP4s are routinely 4:2:2 / 10-bit, which browsers refuse),
 * and clobbering the original would destroy the only copy if the encode is bad.
 */
function derivativeKeys(sourceKey: string): {
  videoKey: string
  posterKey: string
} {
  const base = sourceKey.replace(/\.[^./]+$/, '')
  return {
    videoKey: `${base}-web.mp4`,
    posterKey: `${base}-poster.jpg`,
  }
}

/**
 * Collapse any thrown value into a short, human-readable line.
 *
 * ffmpeg's stderr tail is preferred when present — "moov atom not found" tells
 * an operator what happened; "Command failed with exit code 1" does not.
 */
function toProcessingError(error: unknown): string {
  let text: string

  if (error instanceof VideoProcessingError) {
    text = error.stderr
      ? `${error.message}: ${error.stderr}`
      : error.message
  } else if (error instanceof Error) {
    text = error.message
  } else {
    text = String(error)
  }

  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_PROCESSING_ERROR_CHARS
    ? `${collapsed.slice(0, MAX_PROCESSING_ERROR_CHARS - 1)}…`
    : collapsed
}

async function markFailed(mediaId: string, error: unknown): Promise<void> {
  await db
    .update(reviewMedia)
    .set({
      processingStatus: 'failed',
      processingError: toProcessingError(error),
    })
    .where(eq(reviewMedia.id, mediaId))
}

/**
 * Worker concurrency, defaulting to 1.
 *
 * This is not a throughput knob to open up casually: the dev box runs many
 * concurrent agent sessions on 8 cores and libx264 will happily eat all of
 * them. Anything unparseable, zero or negative falls back to 1.
 */
export function resolveConcurrency(): number {
  const raw = process.env.REVIEW_MEDIA_CONCURRENCY
  if (!raw) return 1

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) return 1

  return Math.floor(parsed)
}

// ============================================================================
// Processor
// ============================================================================

/**
 * Normalise one uploaded review video.
 *
 * Exported so it can be tested directly — spinning up a real Worker against
 * redis in a unit test just hangs the suite.
 */
export async function processReviewMediaJob(
  job: Job<ReviewMediaJobData>
): Promise<void> {
  const { mediaId, sourceKey } = job.data
  let workDir: string | null = null

  try {
    const source = await getFile(sourceKey)
    if (!source) {
      throw new Error(`Source upload not found in storage: ${sourceKey}`)
    }

    workDir = await mkdtemp(join(tmpdir(), 'review-media-'))
    const inputPath = join(workDir, basename(sourceKey) || 'input')
    const outputPath = join(workDir, 'output.mp4')
    const posterPath = join(workDir, 'poster.jpg')

    await writeFile(inputPath, source)

    const metadata = await probeVideo(inputPath)

    const maxDuration = REVIEW_MEDIA_LIMITS.video.maxDurationSeconds
    if (metadata.durationSeconds > maxDuration) {
      throw new Error(
        `Video is ${Math.round(metadata.durationSeconds)} seconds long; ` +
          `the limit is ${maxDuration} seconds.`
      )
    }

    if (metadata.width <= 0 || metadata.height <= 0) {
      throw new Error('Video dimensions could not be read from the upload.')
    }

    await transcodeToMp4(inputPath, outputPath)
    // Poster comes off the normalised copy so it matches what plays back.
    await extractPosterFrame(outputPath, posterPath)

    const [videoBuffer, posterBuffer] = await Promise.all([
      readFile(outputPath),
      readFile(posterPath),
    ])

    const { videoKey, posterKey } = derivativeKeys(sourceKey)

    const videoUpload = await uploadFile(videoBuffer, videoKey, {
      contentType: 'video/mp4',
      metadata: { mediaId },
    })
    const posterUpload = await uploadFile(posterBuffer, posterKey, {
      contentType: 'image/jpeg',
      metadata: { mediaId },
    })

    await db
      .update(reviewMedia)
      .set({
        url: videoUpload.url,
        posterUrl: posterUpload.url,
        thumbnailUrl: posterUpload.url,
        durationSeconds: Math.round(metadata.durationSeconds),
        width: metadata.width,
        height: metadata.height,
        sizeBytes: videoBuffer.length,
        processingStatus: 'ready',
        processingError: null,
      })
      .where(eq(reviewMedia.id, mediaId))
  } catch (error) {
    // Never rethrow: the review itself is already live and must not be
    // affected by a media row that could not be processed.
    logger.error(
      { err: error, mediaId, sourceKey },
      'Review media transcode failed'
    )

    try {
      await markFailed(mediaId, error)
    } catch (updateError) {
      logger.error(
        { err: updateError, mediaId },
        'Could not mark review media row as failed'
      )
    }
  } finally {
    if (workDir) {
      // Best-effort: a leaked scratch dir must not turn a completed job into a
      // failed one.
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

// ============================================================================
// Queue / worker management
// ============================================================================

/**
 * Add a transcode job. Called from the review submission path once the
 * original upload has landed in storage.
 */
export async function enqueueReviewMediaJob(
  data: ReviewMediaJobData
): Promise<void> {
  await reviewMediaQueue.add('transcode', data, DEFAULT_JOB_OPTIONS)
}

/**
 * Start the transcode worker.
 *
 * Explicit rather than module-level so importing this module (routes, tests,
 * scripts) never starts consuming jobs.
 */
export function startReviewMediaWorker(): Worker<ReviewMediaJobData> {
  const concurrency = resolveConcurrency()

  const worker = new Worker<ReviewMediaJobData>(
    REVIEW_MEDIA_QUEUE_NAME,
    processReviewMediaJob,
    {
      connection: createRedisConnection(),
      concurrency,
    }
  )

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, mediaId: job?.data?.mediaId, err: error },
      'Review media job failed'
    )
  })

  // Fail loudly at startup instead of at the first customer upload.
  void isFfmpegAvailable().then((available) => {
    if (!available) {
      logger.error(
        'ffmpeg is not on PATH — review video transcoding will fail ' +
          '(macOS: `brew install ffmpeg`; the API image installs it via apt)'
      )
    }
  })

  logger.info({ concurrency }, 'Review media worker started')
  reviewMediaWorker = worker
  return worker
}

/**
 * Gracefully close the worker and queue.
 */
export async function closeReviewMediaQueue(): Promise<void> {
  if (reviewMediaWorker) {
    await reviewMediaWorker.close()
    reviewMediaWorker = null
  }
  await reviewMediaQueue.close()
}
