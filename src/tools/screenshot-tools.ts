import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { captureScreenshot } from '../utils/screenshot.js';

export function registerScreenshotTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_screenshot',
    'Capture a screenshot of the current browser state. Useful for debugging or seeing what Sora is showing.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ success: true, message: 'Screenshot captured.' }) },
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
