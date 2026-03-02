import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { listLibrary, searchLibrary, selectVideo, downloadVideo, deleteVideo } from '../pages/library.js';
import { captureScreenshot } from '../utils/screenshot.js';

export function registerLibraryTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_list_library',
    'Browse your video library on sora.com. Returns a list of videos with a screenshot.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        const result = await listLibrary(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, items: result.items, count: result.items.length }),
            },
            { type: 'image' as const, data: result.screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'sora_search_library',
    'Search your video library on sora.com by query.',
    {
      query: z.string().describe('Search query'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        const result = await searchLibrary(page, params.query);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, items: result.items, count: result.items.length, query: params.query }),
            },
            { type: 'image' as const, data: result.screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'sora_select_video',
    'Select/open a video from the library by its index. Use after sora_list_library to interact with a specific video.',
    {
      index: z.number().int().min(0).describe('Index of the video in the library (0-based)'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        const screenshot_base64 = await selectVideo(page, params.index);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: `Selected video at index ${params.index}.` }) },
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
    'sora_download_video',
    'Download the currently selected/viewed video from sora.com to local disk.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        const downloadPath = await downloadVideo(page);
        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Video downloaded.', path: downloadPath }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'sora_delete_video',
    'Delete the currently selected/viewed video from sora.com. Requires confirm=true as a safety measure.',
    {
      confirm: z.boolean().describe('Must be true to confirm deletion'),
    },
    async (params) => {
      if (!params.confirm) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: 'Deletion cancelled. Set confirm=true to delete.' }) }],
        };
      }

      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        await deleteVideo(page);
        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Video deleted.' }) },
            { type: 'image' as const, data: screenshot_base64, mimeType: 'image/jpeg' as const },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: err.message }) }],
          isError: true,
        };
      }
    },
  );
}
