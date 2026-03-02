import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { executeRemix } from '../pages/remix.js';
import { executeBlend } from '../pages/blend.js';
import { executeRecut, extendVideo } from '../pages/recut.js';
import { executeLoop } from '../pages/loop.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { waitForGeneration } from '../utils/wait.js';

export function registerEditTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_remix',
    'Create a new video variation by entering a new prompt while viewing an existing video on sora.com. Navigate to a video first using sora_select_video.',
    {
      prompt: z.string().describe('New prompt for the variation'),
      wait_for_completion: z.boolean().optional().default(false).describe('Wait for generation to complete'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await executeRemix(page, params.prompt);

        if (params.wait_for_completion) {
          const result = await waitForGeneration(page, { timeout: browser.getConfig().genTimeout });
          const screenshot_base64 = await captureScreenshot(page);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ success: result === 'completed', message: `Remix ${result}.`, generation_state: result }) },
              { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
            ],
            isError: result !== 'completed',
          };
        }

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'New generation started with modified prompt.' }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        const content: any[] = [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }];
        if (err.screenshot_base64) content.push({ type: 'image' as const, data: err.screenshot_base64, mimeType: 'image/jpeg' as const });
        return { content, isError: true };
      }
    },
  );

  server.tool(
    'sora_blend',
    'Upload a media file and generate a new video incorporating it. Works from the main page — uploads via "Attach media" and generates.',
    {
      media_path: z.string().describe('Absolute path to the image or video file to blend'),
      prompt: z.string().optional().describe('Prompt describing the desired result'),
      wait_for_completion: z.boolean().optional().default(false).describe('Wait for generation to complete'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await executeBlend(page, params.media_path, params.prompt);

        if (params.wait_for_completion) {
          const result = await waitForGeneration(page, { timeout: browser.getConfig().genTimeout });
          const screenshot_base64 = await captureScreenshot(page);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ success: result === 'completed', message: `Generation ${result}.`, generation_state: result }) },
              { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
            ],
            isError: result !== 'completed',
          };
        }

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Media uploaded and generation started.' }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        const content: any[] = [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }];
        if (err.screenshot_base64) content.push({ type: 'image' as const, data: err.screenshot_base64, mimeType: 'image/jpeg' as const });
        return { content, isError: true };
      }
    },
  );

  server.tool(
    'sora_extend',
    'Extend the currently viewed video on sora.com. Must be on a video detail page (use sora_select_video first).',
    {
      wait_for_completion: z.boolean().optional().default(false).describe('Wait for generation to complete'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await extendVideo(page);

        if (params.wait_for_completion) {
          const result = await waitForGeneration(page, { timeout: browser.getConfig().genTimeout });
          const screenshot_base64 = await captureScreenshot(page);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ success: result === 'completed', message: `Extend ${result}.`, generation_state: result }) },
              { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
            ],
            isError: result !== 'completed',
          };
        }

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Video extension started.' }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        const content: any[] = [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }];
        if (err.screenshot_base64) content.push({ type: 'image' as const, data: err.screenshot_base64, mimeType: 'image/jpeg' as const });
        return { content, isError: true };
      }
    },
  );

  server.tool(
    'sora_open_in_storyboard',
    'Open the currently viewed video in storyboard mode for editing. Must be on a video detail page.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await executeRecut(page, { extend: false });

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Video opened in storyboard mode.' }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        const content: any[] = [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }];
        if (err.screenshot_base64) content.push({ type: 'image' as const, data: err.screenshot_base64, mimeType: 'image/jpeg' as const });
        return { content, isError: true };
      }
    },
  );
}
