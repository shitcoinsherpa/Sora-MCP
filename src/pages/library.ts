import type { Page } from 'playwright';
import { SELECTORS, findElement, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { navigateTo } from './navigation.js';
import type { LibraryItem } from '../types/sora.js';

export async function listLibrary(page: Page): Promise<{ items: LibraryItem[]; screenshot_base64: string }> {
  await navigateTo(page, 'library');
  await page.waitForTimeout(2000);

  const screenshot_base64 = await captureScreenshot(page);

  // Draft items are a[href^="/d/"] links
  const elements = await page.$$('a[href^="/d/"]');
  const items: LibraryItem[] = await Promise.all(
    elements.map(async (el, i) => {
      const href = await el.getAttribute('href') || '';
      const aria = await el.getAttribute('aria-label') || undefined;
      return {
        index: i,
        title: aria,
        href,
      };
    }),
  );

  return { items, screenshot_base64 };
}

export async function searchLibrary(page: Page, query: string): Promise<{ items: LibraryItem[]; screenshot_base64: string }> {
  await navigateTo(page, 'search');

  const searchInput = await findElement(page, SELECTORS.library.searchInput, 5000);
  if (searchInput) {
    await searchInput.click();
    await page.keyboard.press('Control+A');
    await searchInput.fill(query);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  return listLibrary(page);
}

export async function selectVideo(page: Page, index: number): Promise<string> {
  await navigateTo(page, 'library');
  await page.waitForTimeout(2000);

  const elements = await page.$$('a[href^="/d/"]');
  if (elements.length <= index) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError(`library item at index ${index} (only ${elements.length} items)`, screenshot);
  }

  await elements[index].click();
  await page.waitForTimeout(3000);
  return captureScreenshot(page);
}

/**
 * Open the "..." menu on the video detail page and click an item.
 * Must be on a video detail page (/d/gen_...) first.
 */
async function openVideoMenu(page: Page): Promise<void> {
  // The "..." button is the rightmost of 3 unlabeled SVG icon buttons
  // in the top-right of the video detail info panel.
  // We find it by clicking the last small SVG button in the top-right area.
  const clicked = await page.evaluate(`
    (function() {
      var btns = document.querySelectorAll('button');
      var candidates = [];
      for (var i = 0; i < btns.length; i++) {
        var rect = btns[i].getBoundingClientRect();
        var hasSvg = btns[i].querySelector('svg');
        var text = (btns[i].textContent || '').trim();
        // Small icon button in top-right, no text
        if (hasSvg && !text && rect.left > 800 && rect.top < 200 && rect.width < 50 && rect.width > 0) {
          candidates.push(btns[i]);
        }
      }
      // The rightmost one is the "..." menu
      if (candidates.length > 0) {
        candidates.sort(function(a, b) { return b.getBoundingClientRect().left - a.getBoundingClientRect().left; });
        candidates[0].click();
        return true;
      }
      return false;
    })()
  `);

  if (!clicked) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('video detail "..." menu button', screenshot);
  }
  await page.waitForTimeout(1000);
}

export async function downloadVideo(page: Page): Promise<string> {
  await openVideoMenu(page);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    clickElement(page, SELECTORS.videoMenu.download, 3000),
  ]);

  const path = await download.path();
  return path || 'Download started';
}

export async function deleteVideo(page: Page): Promise<void> {
  await openVideoMenu(page);
  await clickElement(page, SELECTORS.videoMenu.delete, 3000);
  await page.waitForTimeout(500);

  // Confirm deletion (dialog may appear)
  const confirmBtn = await findElement(page, [
    'button:has-text("Confirm")',
    'button:has-text("Yes")',
    'button:has-text("Delete")',
  ], 3000);
  if (confirmBtn) {
    await confirmBtn.click();
  }
  await page.waitForTimeout(1000);
}

export async function openInStoryboard(page: Page): Promise<void> {
  await openVideoMenu(page);
  await clickElement(page, SELECTORS.videoMenu.openInStoryboard, 3000);
  await page.waitForTimeout(2000);
}
