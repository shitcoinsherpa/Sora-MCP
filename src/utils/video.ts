/**
 * Video analysis utilities: frame extraction, metadata, filmstrip, audio extraction.
 * Uses fluent-ffmpeg with static binaries (no system install needed).
 */
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore — no types available
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import { mkdirSync, readdirSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Wire up static binaries
ffmpeg.setFfmpegPath(ffmpegStatic as string);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  fileSize: number;
  audioCodec: string | null;
  audioSampleRate: number | null;
  hasAudio: boolean;
}

export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      const audioStream = data.streams.find(s => s.codec_type === 'audio');

      if (!videoStream) return reject(new Error('No video stream found'));

      const fpsRaw = videoStream.r_frame_rate ?? videoStream.avg_frame_rate ?? '0/1';
      const [num, den] = fpsRaw.split('/').map(Number);
      const fps = den > 0 ? num / den : 0;

      resolve({
        duration: data.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: Math.round(fps * 100) / 100,
        codec: videoStream.codec_name ?? 'unknown',
        bitrate: Number(data.format.bit_rate ?? 0),
        fileSize: Number(data.format.size ?? 0),
        audioCodec: audioStream?.codec_name ?? null,
        audioSampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
        hasAudio: !!audioStream,
      });
    });
  });
}

/**
 * Extract N evenly-spaced frames from a video as base64 JPEG strings.
 */
export async function extractFrames(
  videoPath: string,
  frameCount: number,
  maxWidth = 640,
  quality = 80,
): Promise<string[]> {
  const meta = await getVideoMetadata(videoPath);
  if (meta.duration <= 0) throw new Error('Could not determine video duration');

  const tmpDir = mkdtempSync(join(tmpdir(), 'sora-frames-'));

  try {
    const interval = meta.duration / frameCount;
    const aspectRatio = meta.height / meta.width;
    const thumbHeight = Math.round(maxWidth * aspectRatio);

    const outputPattern = join(tmpDir, 'frame-%04d.jpg');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=1/${interval},scale=${maxWidth}:${thumbHeight}:flags=lanczos`,
          '-q:v 2',
          `-vframes ${frameCount}`,
        ])
        .output(outputPattern)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const files = readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();

    const frames = await Promise.all(
      files.map(async (file) => {
        const raw = readFileSync(join(tmpDir, file));
        if (quality < 90) {
          const compressed = await sharp(raw).jpeg({ quality, mozjpeg: true }).toBuffer();
          return compressed.toString('base64');
        }
        return raw.toString('base64');
      }),
    );

    return frames;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Create a filmstrip (contact sheet) image from a video.
 * Returns the filmstrip as a base64 JPEG string.
 */
export async function createFilmstrip(
  videoPath: string,
  frameCount = 10,
  thumbWidth = 192,
  columns = 0,
  gap = 4,
  quality = 85,
): Promise<string> {
  const meta = await getVideoMetadata(videoPath);
  if (meta.duration <= 0) throw new Error('Could not determine video duration');

  const aspectRatio = meta.height / meta.width;
  const thumbHeight = Math.round(thumbWidth * aspectRatio);
  const cols = columns > 0 ? columns : frameCount;
  const rows = Math.ceil(frameCount / cols);

  const tmpDir = mkdtempSync(join(tmpdir(), 'sora-filmstrip-'));

  try {
    const interval = meta.duration / frameCount;
    const outputPattern = join(tmpDir, 'frame-%04d.jpg');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=1/${interval},scale=${thumbWidth}:${thumbHeight}:flags=lanczos`,
          '-q:v 2',
          `-vframes ${frameCount}`,
        ])
        .output(outputPattern)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const files = readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();

    const frameBufs = await Promise.all(
      files.map(file =>
        sharp(join(tmpDir, file))
          .resize(thumbWidth, thumbHeight, { fit: 'cover' })
          .jpeg({ quality: 90 })
          .toBuffer(),
      ),
    );

    const canvasWidth = cols * thumbWidth + (cols - 1) * gap;
    const canvasHeight = rows * thumbHeight + (rows - 1) * gap;

    // sharp's NonSharedBuffer type is overly strict with Buffer<ArrayBufferLike>
    const composites = frameBufs.map((input, i) => ({
      input: input as any,
      left: (i % cols) * (thumbWidth + gap),
      top: Math.floor(i / cols) * (thumbHeight + gap),
    }));

    const filmstrip = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: '#000000',
      },
    })
      .composite(composites)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return filmstrip.toString('base64');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Extract audio from a video file.
 * Returns the path to the extracted audio file.
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string,
  format: 'wav' | 'mp3' = 'wav',
): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(videoPath).noVideo();

    if (format === 'wav') {
      cmd = cmd
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1);
    } else {
      cmd = cmd
        .audioCodec('libmp3lame')
        .audioBitrate(192);
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => reject(err))
      .run();
  });
}
