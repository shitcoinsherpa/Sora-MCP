/**
 * Video analysis MCP tools: frame extraction, filmstrip, metadata, audio,
 * direct download, and API interception.
 *
 * These tools give AI agents the ability to "see" video motion, "hear" audio,
 * and understand video properties — closing the perception gap.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { navigateTo } from '../pages/navigation.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { getVideoMetadata, extractFrames, createFilmstrip, extractAudio } from '../utils/video.js';
import { extractVideoUrl, extractDraftVideoUrls, downloadFromUrl } from '../utils/video-url.js';
import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

export function registerAnalysisTools(server: McpServer, browser: BrowserManager) {

  // ═══════════════════════════════════════════
  // VIDEO FRAMES — "See" the video
  // ═══════════════════════════════════════════

  server.tool(
    'sora_extract_frames',
    'Extract evenly-spaced frames from a video file as images. This lets you "see" the video\'s motion, composition, and progression over time. Returns an array of JPEG images.',
    {
      video_path: z.string().describe('Absolute path to the video file'),
      frame_count: z.number().int().min(1).max(30).optional().default(8).describe('Number of frames to extract (1-30)'),
      max_width: z.number().int().optional().default(640).describe('Max width in pixels (preserves aspect ratio)'),
    },
    async (params) => {
      try {
        if (!existsSync(params.video_path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `File not found: ${params.video_path}` }) }], isError: true };
        }

        const meta = await getVideoMetadata(params.video_path);
        const frames = await extractFrames(params.video_path, params.frame_count, params.max_width);

        const content: any[] = [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Extracted ${frames.length} frames from ${meta.duration.toFixed(1)}s video (${meta.width}x${meta.height} ${meta.fps}fps ${meta.codec})`,
              metadata: meta,
              frame_count: frames.length,
              frame_interval_seconds: meta.duration / frames.length,
            }),
          },
        ];

        // Return each frame as an image
        for (const frame of frames) {
          content.push({ type: 'image' as const, data: frame, mimeType: 'image/jpeg' as const });
        }

        return { content };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    'sora_filmstrip',
    'Create a filmstrip (contact sheet) from a video — a single image showing the video\'s progression as a grid of thumbnails. Ideal for quickly reviewing a video\'s visual arc.',
    {
      video_path: z.string().describe('Absolute path to the video file'),
      frame_count: z.number().int().min(4).max(30).optional().default(10).describe('Number of frames in the filmstrip'),
      columns: z.number().int().min(1).max(10).optional().default(5).describe('Number of columns in the grid'),
      thumb_width: z.number().int().optional().default(256).describe('Width of each thumbnail in pixels'),
    },
    async (params) => {
      try {
        if (!existsSync(params.video_path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `File not found: ${params.video_path}` }) }], isError: true };
        }

        const meta = await getVideoMetadata(params.video_path);
        const filmstrip = await createFilmstrip(
          params.video_path,
          params.frame_count,
          params.thumb_width,
          params.columns,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Filmstrip: ${params.frame_count} frames in ${params.columns}-column grid from ${meta.duration.toFixed(1)}s video`,
                metadata: meta,
              }),
            },
            { type: 'image' as const, data: filmstrip, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════
  // VIDEO METADATA
  // ═══════════════════════════════════════════

  server.tool(
    'sora_video_metadata',
    'Get detailed metadata about a video file: duration, resolution, FPS, codec, bitrate, file size, audio info.',
    {
      video_path: z.string().describe('Absolute path to the video file'),
    },
    async (params) => {
      try {
        if (!existsSync(params.video_path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `File not found: ${params.video_path}` }) }], isError: true };
        }

        const meta = await getVideoMetadata(params.video_path);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, metadata: meta }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════
  // AUDIO EXTRACTION — "Hear" the video
  // ═══════════════════════════════════════════

  server.tool(
    'sora_extract_audio',
    'Extract the audio track from a video file. Saves as WAV (for transcription) or MP3. Use the output with a transcription tool (e.g., Whisper) to "hear" what the video sounds like.',
    {
      video_path: z.string().describe('Absolute path to the video file'),
      output_path: z.string().optional().describe('Output path for audio file (default: same dir as video, .wav)'),
      format: z.enum(['wav', 'mp3']).optional().default('wav').describe('Audio format: wav (for AI transcription) or mp3'),
    },
    async (params) => {
      try {
        if (!existsSync(params.video_path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `File not found: ${params.video_path}` }) }], isError: true };
        }

        const meta = await getVideoMetadata(params.video_path);
        if (!meta.hasAudio) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: 'Video has no audio track.', has_audio: false }) }] };
        }

        const outputPath = params.output_path || params.video_path.replace(/\.[^.]+$/, `.${params.format}`);
        await extractAudio(params.video_path, outputPath, params.format);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Audio extracted to ${outputPath}`,
              output_path: outputPath,
              format: params.format,
              audio_codec: meta.audioCodec,
              sample_rate: meta.audioSampleRate,
            }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════
  // DIRECT VIDEO URL EXTRACTION & DOWNLOAD
  // ═══════════════════════════════════════════

  server.tool(
    'sora_get_video_url',
    'Extract the direct video URL from the currently viewed video on sora.com. Returns an Azure SAS URL that can be downloaded directly without authentication. Must be on a video detail page.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        const info = await extractVideoUrl(page);
        const screenshot_base64 = await captureScreenshot(page);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: !!info.videoUrl,
                gen_id: info.genId,
                video_url: info.videoUrl,
                prompt_text: info.promptText,
                message: info.videoUrl ? 'Video URL extracted. Use sora_direct_download to save it.' : 'No video URL found. Navigate to a video detail page first.',
              }),
            },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
          isError: !info.videoUrl,
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    'sora_direct_download',
    'Download a video directly from its URL (bypasses the Sora UI download menu). Faster and more reliable than clicking through menus. Provide a URL from sora_get_video_url, or navigate to a video and it will extract+download automatically.',
    {
      video_url: z.string().optional().describe('Direct video URL (from sora_get_video_url). If not provided, extracts from current page.'),
      output_dir: z.string().optional().describe('Directory to save the video (default: configured download dir)'),
    },
    async (params) => {
      try {
        let videoUrl = params.video_url;
        let genId = 'unknown';

        if (!videoUrl) {
          const page = await browser.getPage();
          await ensureAuthenticated(page);
          const info = await extractVideoUrl(page);
          videoUrl = info.videoUrl || undefined;
          genId = info.genId;
        }

        if (!videoUrl) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: 'No video URL available. Navigate to a video detail page first.' }) }], isError: true };
        }

        const downloadDir = params.output_dir || browser.getConfig().downloadDir;
        mkdirSync(downloadDir, { recursive: true });
        const destPath = join(downloadDir, `${genId}.mp4`);

        await downloadFromUrl(videoUrl, destPath);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Video downloaded to ${destPath}`,
              path: destPath,
              gen_id: genId,
            }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════
  // LIBRARY WITH FULL INFO
  // ═══════════════════════════════════════════

  server.tool(
    'sora_list_drafts_detailed',
    'List all drafts with generation IDs and preview URLs. More detailed than sora_list_library — includes video URLs for programmatic access.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        await navigateTo(page, 'library');
        await page.waitForTimeout(2000);

        const drafts = await extractDraftVideoUrls(page);
        const screenshot_base64 = await captureScreenshot(page);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: drafts.length,
                drafts,
                message: `Found ${drafts.length} drafts. Use sora_select_video to open one, then sora_get_video_url to get its download URL.`,
              }),
            },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }], isError: true };
      }
    },
  );
}
