import type { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { ensureOnSora } from './navigation.js';

export async function browseExplore(page: Page): Promise<{ screenshot_base64: string; itemCount: number }> {
  // The explore/feed IS the main page
  await ensureOnSora(page);
  await page.waitForTimeout(2000);

  const screenshot_base64 = await captureScreenshot(page);

  let itemCount = 0;
  for (const sel of SELECTORS.explore.items) {
    const elements = await page.$$(sel);
    if (elements.length > 0) {
      itemCount = elements.length;
      break;
    }
  }

  return { screenshot_base64, itemCount };
}
