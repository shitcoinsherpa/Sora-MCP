import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { browseExplore } from '../pages/explore.js';

export function registerExploreTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_browse_explore',
    'Browse the community explore feed on sora.com. Returns a screenshot of the current feed.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);
        const result = await browseExplore(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: `Explore feed loaded. ${result.itemCount} items visible.`, item_count: result.itemCount }),
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
}
