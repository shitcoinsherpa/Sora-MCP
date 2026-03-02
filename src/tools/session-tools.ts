import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { checkSession, waitForLogin } from '../browser/session.js';
import { captureScreenshot } from '../utils/screenshot.js';

export function registerSessionTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_check_session',
    'Verify authenticated session on sora.com. Returns authentication status and a screenshot.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        const result = await checkSession(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                authenticated: result.authenticated,
                message: result.authenticated
                  ? 'Session is active and authenticated.'
                  : 'Not authenticated. Run sora_login to sign in.',
              }),
            },
            {
              type: 'image' as const,
              data: result.screenshot_base64,
              mimeType: 'image/jpeg' as const,
            },
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
    'sora_login',
    'Open browser to sora.com for login. The browser window will appear for authentication. Session is saved to the persistent browser profile for future use.',
    {},
    async () => {
      try {
        const page = await browser.getPage();
        const loggedIn = await waitForLogin(page);
        const screenshot_base64 = await captureScreenshot(page);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: loggedIn,
                message: loggedIn
                  ? 'Login successful! Session saved. Browser stays open in background for future calls.'
                  : 'Login timed out (5 min). Please try sora_login again.',
              }),
            },
            {
              type: 'image' as const,
              data: screenshot_base64,
              mimeType: 'image/jpeg' as const,
            },
          ],
          isError: !loggedIn,
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
