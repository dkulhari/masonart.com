/**
 * Review media transcode queue (#480).
 *
 * The exported processor is called directly — no BullMQ Worker is constructed
 * against live redis, because a real worker would keep polling and hang the
 * suite. `bullmq` itself is mocked so the module-level Queue never opens a
 * connection; the Worker mock doubles as the assertion surface for the one
 * setting this box genuinely cares about: concurrency stays at 1.
 *
 * ffmpeg and storage are mocked, but the filesystem is NOT: the processor
 * really writes its scratch files, so "temp files are cleaned up" is asserted
 * against the real directory rather than a spy on `rm`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import '../setup'

const mocks = vi.hoisted(() => {
  const whereMock = vi.fn(async () => undefined)
  const setMock = vi.fn(() => ({ where: whereMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))

  // The Queue is constructed once at module import, i.e. before any
  // beforeEach — keep a handle that vi.clearAllMocks() cannot take away.
  const queueInstances: Array<{ add: ReturnType<typeof vi.fn> }> = []

  return {
    queueInstances,
    whereMock,
    setMock,
    updateMock,
    getFileMock: vi.fn(async () => Buffer.from('source-video-bytes')),
    uploadFileMock: vi.fn(async (_buffer: Buffer, key: string) => ({
      url: `https://cdn.test.example.com/${key}`,
      key,
      bucket: 'poster-app-test',
    })),
    probeVideoMock: vi.fn(async (_input: string) => ({
      durationSeconds: 12.4,
      width: 1920,
      height: 1080,
      videoCodec: 'hevc',
      audioCodec: 'aac',
      hasAudio: true,
      sizeBytes: 5_000_000,
      bitRate: 4_000_000,
    })),
    transcodeToMp4Mock: vi.fn(async (_input: string, output: string) => {
      await writeFile(output, 'transcoded-mp4-bytes')
    }),
    extractPosterFrameMock: vi.fn(async (_input: string, output: string) => {
      await writeFile(output, 'poster-jpeg-bytes')
    }),
    WorkerMock: vi.fn(function (this: Record<string, unknown>, name: string) {
      this.name = name
      this.on = vi.fn()
      this.close = vi.fn(async () => undefined)
    }),
    QueueMock: vi.fn(function (this: Record<string, unknown>, name: string) {
      this.name = name
      this.add = vi.fn(async () => ({ id: 'job-1' }))
      this.close = vi.fn(async () => undefined)
      queueInstances.push(this as unknown as { add: ReturnType<typeof vi.fn> })
    }),
  }
})

vi.mock('bullmq', () => ({
  Queue: mocks.QueueMock,
  Worker: mocks.WorkerMock,
}))

vi.mock('../../src/lib/redis', () => ({
  redis: { __fake: 'shared-redis' },
  createRedisConnection: () => ({ __fake: 'worker-redis' }),
}))

vi.mock('../../src/database', () => ({
  db: { update: mocks.updateMock },
}))

vi.mock('../../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/storage')>()
  return {
    ...actual,
    getFile: mocks.getFileMock,
    uploadFile: mocks.uploadFileMock,
  }
})

vi.mock('../../src/lib/video-processing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/video-processing')>()
  return {
    ...actual,
    probeVideo: mocks.probeVideoMock,
    transcodeToMp4: mocks.transcodeToMp4Mock,
    extractPosterFrame: mocks.extractPosterFrameMock,
    isFfmpegAvailable: vi.fn(async () => true),
  }
})

import {
  processReviewMediaJob,
  startReviewMediaWorker,
  enqueueReviewMediaJob,
  REVIEW_MEDIA_QUEUE_NAME,
  type ReviewMediaJobData,
} from '../../src/queues/review-media'
import { VideoProcessingError } from '../../src/lib/video-processing'
import { REVIEW_MEDIA_LIMITS } from '../../src/lib/storage'
import { reviewMedia, reviews } from '../../src/database/schema'

const MEDIA_ID = '11111111-1111-1111-1111-111111111111'
const SOURCE_KEY = 'reviews/22222222/media/clip.mov'

function fakeJob(overrides: Partial<ReviewMediaJobData> = {}) {
  return {
    id: 'job-1',
    data: { mediaId: MEDIA_ID, sourceKey: SOURCE_KEY, ...overrides },
  } as never
}

/** The scratch directory the processor created, read off the probe call. */
function tempDirUsed(): string {
  const call = mocks.probeVideoMock.mock.calls[0]
  expect(call, 'probeVideo was never called, so no temp dir exists').toBeTruthy()
  return dirname(call![0] as string)
}

/** Every `db.update(...).set(...)` payload, in order. */
function updatePayloads(): Record<string, unknown>[] {
  return mocks.setMock.mock.calls.map(
    (call) => call[0] as Record<string, unknown>
  )
}

describe('processReviewMediaJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REVIEW_MEDIA_CONCURRENCY
  })

  afterEach(() => {
    delete process.env.REVIEW_MEDIA_CONCURRENCY
  })

  it('transcodes, uploads the mp4 and poster, and flips the row to ready', async () => {
    await processReviewMediaJob(fakeJob())

    // probe -> transcode -> poster, all against the downloaded source
    expect(mocks.getFileMock).toHaveBeenCalledWith(SOURCE_KEY)
    expect(mocks.probeVideoMock).toHaveBeenCalledTimes(1)
    expect(mocks.transcodeToMp4Mock).toHaveBeenCalledTimes(1)
    expect(mocks.extractPosterFrameMock).toHaveBeenCalledTimes(1)

    // two uploads: the normalised video and its poster frame
    expect(mocks.uploadFileMock).toHaveBeenCalledTimes(2)
    const [videoUpload, posterUpload] = mocks.uploadFileMock.mock.calls
    expect((videoUpload![1] as string).endsWith('.mp4')).toBe(true)
    expect((videoUpload![2] as { contentType: string }).contentType).toBe(
      'video/mp4'
    )
    expect((posterUpload![2] as { contentType: string }).contentType).toBe(
      'image/jpeg'
    )
    // The transcode must not clobber the customer's original upload
    expect(videoUpload![1]).not.toBe(SOURCE_KEY)

    const [payload] = updatePayloads()
    expect(payload).toMatchObject({
      processingStatus: 'ready',
      durationSeconds: 12,
      width: 1920,
      height: 1080,
      processingError: null,
    })
    expect(String(payload!.url)).toContain('.mp4')
    expect(String(payload!.posterUrl)).toContain('https://')
  })

  it('rejects a clip over the duration cap before spending any transcode time', async () => {
    mocks.probeVideoMock.mockResolvedValueOnce({
      durationSeconds: REVIEW_MEDIA_LIMITS.video.maxDurationSeconds + 5,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      hasAudio: true,
      sizeBytes: 9_000_000,
      bitRate: 4_000_000,
    })

    await processReviewMediaJob(fakeJob())

    expect(mocks.transcodeToMp4Mock).not.toHaveBeenCalled()
    expect(mocks.uploadFileMock).not.toHaveBeenCalled()

    const [payload] = updatePayloads()
    expect(payload).toMatchObject({ processingStatus: 'failed' })
    // Human-readable: an operator (and the customer-facing copy) can act on it
    expect(String(payload!.processingError)).toMatch(
      new RegExp(`${REVIEW_MEDIA_LIMITS.video.maxDurationSeconds}`)
    )
    expect(String(payload!.processingError)).toMatch(/second/i)
  })

  it('marks the row failed when the transcode throws, and never touches the review', async () => {
    mocks.transcodeToMp4Mock.mockRejectedValueOnce(
      new VideoProcessingError(
        'ffmpeg failed: exit 1',
        'ffmpeg -i in.mov out.mp4',
        'moov atom not found'
      )
    )

    // A broken upload must never surface as a thrown job — the review stands.
    await expect(processReviewMediaJob(fakeJob())).resolves.toBeUndefined()

    const [payload] = updatePayloads()
    expect(payload).toMatchObject({ processingStatus: 'failed' })
    expect(String(payload!.processingError)).toContain('moov atom not found')

    // Only the media row is ever written; the reviews table is untouched.
    expect(mocks.updateMock).toHaveBeenCalledTimes(1)
    for (const call of mocks.updateMock.mock.calls) {
      expect(call[0]).toBe(reviewMedia)
      expect(call[0]).not.toBe(reviews)
    }
  })

  it('marks the row failed when the source object is missing', async () => {
    mocks.getFileMock.mockResolvedValueOnce(null as never)

    await processReviewMediaJob(fakeJob())

    expect(mocks.probeVideoMock).not.toHaveBeenCalled()
    const [payload] = updatePayloads()
    expect(payload).toMatchObject({ processingStatus: 'failed' })
    expect(String(payload!.processingError)).toMatch(/not found|missing/i)
  })

  it('cleans up its temp files on the success path', async () => {
    await processReviewMediaJob(fakeJob())

    const dir = tempDirUsed()
    expect(existsSync(dir)).toBe(false)
  })

  it('cleans up its temp files on the failure path', async () => {
    mocks.transcodeToMp4Mock.mockRejectedValueOnce(new Error('ffmpeg exploded'))

    await processReviewMediaJob(fakeJob())

    const dir = tempDirUsed()
    expect(existsSync(dir)).toBe(false)
  })
})

describe('startReviewMediaWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REVIEW_MEDIA_CONCURRENCY
  })

  afterEach(() => {
    delete process.env.REVIEW_MEDIA_CONCURRENCY
  })

  it('runs one transcode at a time by default', () => {
    startReviewMediaWorker()

    const [name, processor, opts] = mocks.WorkerMock.mock.calls[0] as [
      string,
      unknown,
      { concurrency: number },
    ]
    expect(name).toBe(REVIEW_MEDIA_QUEUE_NAME)
    expect(processor).toBe(processReviewMediaJob)
    expect(opts.concurrency).toBe(1)
  })

  it('honours REVIEW_MEDIA_CONCURRENCY when it is a sane number', () => {
    process.env.REVIEW_MEDIA_CONCURRENCY = '3'

    startReviewMediaWorker()

    const opts = (mocks.WorkerMock.mock.calls[0] as unknown[])[2] as {
      concurrency: number
    }
    expect(opts.concurrency).toBe(3)
  })

  it('falls back to 1 rather than 0 or NaN on a garbage value', () => {
    process.env.REVIEW_MEDIA_CONCURRENCY = 'lots'

    startReviewMediaWorker()

    const opts = (mocks.WorkerMock.mock.calls[0] as unknown[])[2] as {
      concurrency: number
    }
    expect(opts.concurrency).toBe(1)
  })
})

describe('enqueueReviewMediaJob', () => {
  it('queues the media id and source key on the review-media queue', async () => {
    await enqueueReviewMediaJob({ mediaId: MEDIA_ID, sourceKey: SOURCE_KEY })

    const queue = mocks.queueInstances[0]!
    expect(queue.add).toHaveBeenCalledWith(
      'transcode',
      { mediaId: MEDIA_ID, sourceKey: SOURCE_KEY },
      expect.anything()
    )
  })
})
