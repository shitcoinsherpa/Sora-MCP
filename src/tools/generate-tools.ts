import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { configureAndGenerate } from '../pages/generate.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { waitForGeneration, detectGenerationState } from '../utils/wait.js';

export function registerGenerateTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_generate_video',
    'Generate a video on sora.com. Enter a prompt, configure settings, and click generate.',
    {
      prompt: z.string().describe('The text prompt describing the video to generate'),
      aspect_ratio: z.enum(['16:9', '9:16', '1:1', 'landscape', 'portrait', 'square']).optional().describe('Orientation/aspect ratio: landscape (16:9), portrait (9:16), or square (1:1)'),
      duration: z.enum(['5s', '10s', '15s', '20s']).optional().describe('Video duration'),
      variations: z.number().min(1).max(4).optional().describe('Number of variations to generate'),
      style_preset: z.enum(['none', 'cinematic', 'anime', 'claymation', 'comic_book', 'digital_art', 'film_noir', 'hand_drawn', 'impressionist', 'ink_wash', 'oil_painting', 'origami', 'paper_craft', 'pixel_art', 'pop_art', 'stop_motion', 'watercolor']).optional().describe('Visual style preset'),
      wait_for_completion: z.boolean().optional().default(false).describe('If true, wait for generation to complete (up to 5 min)'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await configureAndGenerate(page, {
          prompt: params.prompt,
          aspect_ratio: params.aspect_ratio,
          duration: params.duration,
          variations: params.variations,
          style_preset: params.style_preset,
        });

        if (params.wait_for_completion) {
          const result = await waitForGeneration(page, {
            timeout: browser.getConfig().genTimeout,
          });

          const screenshot_base64 = await captureScreenshot(page);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: result === 'completed',
                  message: result === 'completed'
                    ? 'Video generation completed!'
                    : result === 'failed'
                    ? 'Generation failed. Check screenshot for details.'
                    : 'Generation timed out. Use sora_get_status to check progress.',
                  generation_state: result,
                }),
              },
              { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
            ],
            isError: result !== 'completed',
          };
        }

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: 'Generation started. Use sora_get_status to check progress.',
              }),
            },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        const content: any[] = [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }];
        if (err.screenshot_base64) {
          content.push({ type: 'image' as const, data: err.screenshot_base64, mimeType: 'image/jpeg' as const });
        }
        return { content, isError: true };
      }
    },
  );

  server.tool(
    'sora_get_status',
    'Check the current generation status on sora.com. Returns the state and a screenshot.',
    {
      take_screenshot: z.boolean().optional().default(true).describe('Include a screenshot of current state'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        const state = await detectGenerationState(page);
        const content: any[] = [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, state, message: `Current state: ${state}` }),
          },
        ];

        if (params.take_screenshot) {
          const screenshot_base64 = await captureScreenshot(page);
          content.push({ type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const });
        }

        return { content };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }],
          isError: true,
        };
      }
    },
  );
}
