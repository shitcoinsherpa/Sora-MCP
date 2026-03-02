import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { ensureOnSora } from '../pages/navigation.js';
import { uploadFile } from '../pages/upload.js';
import { enterPrompt, selectSetting, configureAndGenerate } from '../pages/generate.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { waitForGeneration } from '../utils/wait.js';

export function registerImageToVideoTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_image_to_video',
    'Upload an image and generate a video from it on sora.com. Combines image upload with prompt and settings.',
    {
      image_path: z.string().describe('Absolute path to the image file to upload'),
      prompt: z.string().describe('Text prompt to guide the video generation from the image'),
      aspect_ratio: z.enum(['16:9', '9:16', '1:1', 'landscape', 'portrait', 'square']).optional().describe('Orientation: landscape (16:9), portrait (9:16), or square (1:1)'),
      duration: z.enum(['5s', '10s', '15s', '20s']).optional().describe('Duration'),
      wait_for_completion: z.boolean().optional().default(false).describe('Wait for generation to complete'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        await ensureOnSora(page);

        // Upload image first
        await uploadFile(page, params.image_path);

        // Then configure and generate
        await configureAndGenerate(page, {
          prompt: params.prompt,
          aspect_ratio: params.aspect_ratio,
          duration: params.duration,
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
                    ? 'Image-to-video generation completed!'
                    : `Generation ${result}. Use sora_get_status to check.`,
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
              text: JSON.stringify({ success: true, message: 'Image-to-video generation started.' }),
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
}
