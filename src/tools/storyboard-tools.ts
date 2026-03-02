import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser/manager.js';
import { ensureAuthenticated } from '../browser/session.js';
import { createStoryboard, addCard } from '../pages/storyboard.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { clickElement } from '../pages/selectors.js';
import { SELECTORS } from '../pages/selectors.js';
import { waitForGeneration } from '../utils/wait.js';

const StoryboardCardSchema = z.object({
  prompt: z.string().describe('Prompt for this storyboard card'),
  image_path: z.string().optional().describe('Optional image path for this card'),
  duration: z.enum(['5s', '10s', '15s', '20s']).optional().describe('Duration for this card'),
});

export function registerStoryboardTools(server: McpServer, browser: BrowserManager) {
  server.tool(
    'sora_create_storyboard',
    'Create a multi-scene storyboard on sora.com with per-card prompts and optional images.',
    {
      cards: z.array(StoryboardCardSchema).min(2).max(5).describe('Array of storyboard cards (2-5 cards)'),
      generate: z.boolean().optional().default(false).describe('Immediately generate after creating storyboard'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await createStoryboard(page, params.cards);

        if (params.generate) {
          // In storyboard mode, generate button is "Create"
          await clickElement(page, SELECTORS.storyboard.create, 5000);
          await page.waitForTimeout(2000);
        }

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Storyboard created with ${params.cards.length} cards.${params.generate ? ' Generation started.' : ''}`,
                card_count: params.cards.length,
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
    'sora_add_storyboard_card',
    'Add a single card to an existing storyboard on sora.com.',
    {
      prompt: z.string().describe('Prompt for the new card'),
      image_path: z.string().optional().describe('Optional image path for the card'),
    },
    async (params) => {
      try {
        const page = await browser.getPage();
        await ensureAuthenticated(page);

        await addCard(page, { prompt: params.prompt, image_path: params.image_path });

        const screenshot_base64 = await captureScreenshot(page);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: 'Card added to storyboard.' }),
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
