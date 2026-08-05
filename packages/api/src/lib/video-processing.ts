/**
 * Video Processing Module (ffmpeg / ffprobe)
 *
 * Customer review uploads arrive straight off phones, which means HEVC `.mov`
 * from iPhones — a container/codec pair no desktop browser will play. Every
 * accepted video is therefore probed, normalised to H.264/AAC MP4, and given a
 * poster frame before it is servable.
 *
 * `sharp` (see image-processing.ts) cannot touch video, so this shells out to
 * the ffmpeg binaries via node:child_process rather than adding a wrapper
 * dependency.
 *
 * Requires ffmpeg on PATH:
 *   - production: installed in the api stage of the Dockerfile
 *   - local dev on macOS: `brew install ffmpeg`
 */

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Keep only the tail of stderr — ffmpeg is verbose and this gets persisted. */
const STDERR_TAIL_CHARS = 2000;

/** ffprobe JSON is small; guard against a runaway anyway. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Resolved at call time, not module load, so tests (and deployments with an
 * unusual layout) can point at a specific binary.
 */
function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function ffprobeBin(): string {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

/**
 * Error carrying the tail of ffmpeg's stderr.
 *
 * The transcode worker persists `stderr` onto `reviewMedia.processingError`,
 * so an operator can see why a customer's upload failed without re-running it.
 */
export class VideoProcessingError extends Error {
  readonly stderr: string;
  readonly command: string;

  constructor(message: string, command: string, stderr: string) {
    super(message);
    this.name = 'VideoProcessingError';
    this.command = command;
    this.stderr = stderr;
  }
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  sizeBytes: number;
  bitRate: number | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
}

function tail(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  return text.length > STDERR_TAIL_CHARS
    ? text.slice(-STDERR_TAIL_CHARS)
    : text;
}

/**
 * Run a binary, normalising every failure into VideoProcessingError.
 *
 * A missing binary is called out explicitly rather than surfacing a raw
 * ENOENT spawn stack trace.
 */
async function run(
  binary: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const command = `${binary} ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      maxBuffer: MAX_BUFFER_BYTES,
      encoding: 'utf8',
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };

    if (err.code === 'ENOENT') {
      throw new VideoProcessingError(
        `${binary} not found. Install ffmpeg to process review videos ` +
          '(macOS: `brew install ffmpeg`; the API image installs it via apt).',
        command,
        ''
      );
    }

    throw new VideoProcessingError(
      `${binary} failed: ${err.message}`,
      command,
      tail(err.stderr)
    );
  }
}

/**
 * Whether the ffmpeg binary is callable.
 *
 * Used at worker startup to fail loudly with an actionable message instead of
 * letting the first customer upload blow up mid-job.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(ffmpegBin(), ['-version'], {
      maxBuffer: MAX_BUFFER_BYTES,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Throw a readable startup error when ffmpeg is missing.
 */
export async function assertFfmpegAvailable(): Promise<void> {
  if (!(await isFfmpegAvailable())) {
    throw new VideoProcessingError(
      'ffmpeg is not installed or not on PATH. Review video processing is ' +
        'unavailable (macOS: `brew install ffmpeg`).',
      `${ffmpegBin()} -version`,
      ''
    );
  }
}

/**
 * Probe a video file for the metadata the upload path gates on: duration
 * (capped at REVIEW_MEDIA_LIMITS.video.maxDurationSeconds), dimensions, and
 * codecs.
 */
export async function probeVideo(inputPath: string): Promise<VideoMetadata> {
  const args = [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ];

  const { stdout } = await run(ffprobeBin(), args);

  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new VideoProcessingError(
      'ffprobe returned output that could not be parsed as JSON',
      `${ffprobeBin()} ${args.join(' ')}`,
      tail(stdout)
    );
  }

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new VideoProcessingError(
      'File contains no video stream',
      `${ffprobeBin()} ${args.join(' ')}`,
      ''
    );
  }

  const durationSeconds = Number(
    parsed.format?.duration ?? videoStream.duration ?? 0
  );
  const sizeBytes = Number(parsed.format?.size ?? 0);
  const bitRate = parsed.format?.bit_rate
    ? Number(parsed.format.bit_rate)
    : null;

  return {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    videoCodec: videoStream.codec_name ?? 'unknown',
    audioCodec: audioStream?.codec_name ?? null,
    hasAudio: Boolean(audioStream),
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    bitRate: bitRate !== null && Number.isFinite(bitRate) ? bitRate : null,
  };
}

/**
 * Normalise any accepted upload to a web-playable H.264/AAC MP4.
 *
 * - `scale='min(1280,iw)':-2` caps the long edge at 1280 without upscaling
 *   smaller clips; `-2` keeps the height even, which H.264 requires.
 * - `-pix_fmt yuv420p` is what browsers actually decode — phone footage is
 *   sometimes 4:2:2 or 10-bit, which Chrome will not play.
 * - `-movflags +faststart` moves the moov atom to the front so playback can
 *   begin before the whole file has downloaded.
 */
export async function transcodeToMp4(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await run(ffmpegBin(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-vf',
    "scale='min(1280,iw)':-2",
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ]);
}

/**
 * Extract a poster frame one second in — far enough past the black/blurry
 * first frames of handheld footage to be a usable thumbnail.
 */
export async function extractPosterFrame(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-ss',
    '00:00:01',
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-y',
    outputPath,
  ];

  await run(ffmpegBin(), args);

  // ffmpeg exits 0 while writing nothing when the seek lands past the end of
  // a very short clip, so an empty poster has to be caught here.
  try {
    const stats = await stat(outputPath);
    if (stats.size === 0) {
      throw new Error('empty file');
    }
  } catch {
    throw new VideoProcessingError(
      'Poster frame extraction produced no output (clip shorter than the seek point?)',
      `${ffmpegBin()} ${args.join(' ')}`,
      ''
    );
  }
}
