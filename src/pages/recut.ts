import type { Page } from 'playwright';
import { SELECTORS, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';

/**
 * Video editing in Sora's current UI:
 * - "Extend" button on video detail page — extends the video
 * - "Open in storyboard" from "..." menu — for advanced editing
 *
 * There are no trim handles or dedicated recut UI elements.
 */

export async function extendVideo(page: Page): Promise<void> {
  const clicked = await clickElement(page, SELECTORS.videoDetail.extendButton, 5000);
  if (!clicked) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('extend button', screenshot);
  }
  await page.waitForTimeout(2000);
}

export async function executeRecut(
  page: Page,
  options: { trim_start?: number; trim_end?: number; extend?: boolean },
): Promise<void> {
  if (options.extend) {
    await extendVideo(page);
    return;
  }

  // For trim operations, open in storyboard mode via "..." menu
  // Click the "..." menu (rightmost icon button on detail page)
  const menuOpened: boolean = await page.evaluate(`
    (function() {
      var btns = document.querySelectorAll('button');
      var candidates = [];
      for (var i = 0; i < btns.length; i++) {
        var rect = btns[i].getBoundingClientRect();
        var hasSvg = btns[i].querySelector('svg');
        var text = (btns[i].textContent || '').trim();
        if (hasSvg && !text && rect.left > 800 && rect.top < 200 && rect.width < 50 && rect.width > 0) {
          candidates.push(btns[i]);
        }
      }
      candidates.sort(function(a, b) { return b.getBoundingClientRect().left - a.getBoundingClientRect().left; });
      if (candidates.length > 0) { candidates[0].click(); return true; }
      return false;
    })()
  `);

  if (menuOpened) {
    await page.waitForTimeout(1000);
    await clickElement(page, SELECTORS.videoMenu.openInStoryboard, 3000);
    await page.waitForTimeout(2000);
  }
}
