import type { Page } from 'playwright';
import { SELECTORS, clickElement } from './selectors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { uploadFile } from './upload.js';

/**
 * Blend in Sora's current UI:
 * There is no dedicated "Blend" button. The closest workflow is:
 * 1. Upload an image/video via "Attach media" on the prompt bar
 * 2. Enter a prompt describing the desired blend
 * 3. Generate
 *
 * This effectively creates a new generation that references the uploaded media.
 */
export async function executeBlend(page: Page, secondVideoPath: string, prompt?: string): Promise<void> {
  // Upload the second media
  await uploadFile(page, secondVideoPath);
  await page.waitForTimeout(1000);

  // Enter prompt if provided
  if (prompt) {
    const input = await page.$('textarea');
    if (input) {
      await input.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await input.fill(prompt);
    }
  }

  // Click generate
  await clickElement(page, SELECTORS.prompt.generateButton, 5000);
  await page.waitForTimeout(2000);
}
