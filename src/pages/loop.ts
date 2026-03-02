import type { Page } from 'playwright';
import { SELECTORS, clickElement } from './selectors.js';
import { captureScreenshot } from '../utils/screenshot.js';

/**
 * Loop in Sora's current UI:
 * There is no dedicated "Loop" button or mode selector.
 * The closest workflow is to use "Extend" on the video detail page,
 * which extends the video duration. Combined with a prompt hint about
 * looping, this can create loop-like effects.
 */
export async function executeLoop(page: Page): Promise<void> {
  // Try the Extend button as the closest equivalent
  const clicked = await clickElement(page, SELECTORS.videoDetail.extendButton, 5000);
  if (clicked) {
    await page.waitForTimeout(2000);
    return;
  }

  // Fallback: generate with a loop-oriented prompt
  await clickElement(page, SELECTORS.prompt.generateButton, 5000);
  await page.waitForTimeout(2000);
}
