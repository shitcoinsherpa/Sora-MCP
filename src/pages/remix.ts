import type { Page } from 'playwright';
import { SELECTORS, findElement, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';

/**
 * Remix in Sora's current UI is not a labeled button — it's one of the
 * unlabeled SVG icon buttons on the video detail page (the leftmost of
 * the 3 top-right icons). Since it has no aria-label, we locate it by
 * position relative to other known elements.
 *
 * If remix is not available, we fall back to editing via the prompt textarea
 * on the detail page and re-generating.
 */

async function clickRemixIcon(page: Page): Promise<boolean> {
  // Find the leftmost of the 3 small SVG icon buttons in the top-right
  const clicked: boolean = await page.evaluate(`
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
      // Sort by x position, leftmost = remix icon
      candidates.sort(function(a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
      if (candidates.length >= 1) {
        candidates[0].click();
        return true;
      }
      return false;
    })()
  `);
  return clicked;
}

/**
 * Execute a "remix" by modifying the prompt on the video detail page.
 * The real workflow: navigate to video detail → edit caption → re-enter with new prompt → generate.
 */
export async function executeRemix(page: Page, prompt: string): Promise<void> {
  // We're on the video detail page. Enter the new prompt in the prompt bar and generate.
  const input = await findElement(page, SELECTORS.prompt.textInput, 5000);
  if (!input) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('prompt input for remix', screenshot);
  }

  await input.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await input.fill(prompt);

  // Click generate
  await clickElement(page, SELECTORS.prompt.generateButton, 5000);
  await page.waitForTimeout(2000);
}

// Legacy exports for compatibility
export async function openRemixPanel(page: Page): Promise<void> {
  const clicked = await clickRemixIcon(page);
  if (!clicked) {
    // Not a critical failure — remix icon may not be present
  }
  await page.waitForTimeout(1000);
}

export async function setRemixIntensity(_page: Page, _intensity: string, _customValue?: number): Promise<void> {
  // Sora's current UI doesn't have intensity presets
  // This is a no-op for compatibility
}

export async function enterRemixPrompt(page: Page, prompt: string): Promise<void> {
  const input = await findElement(page, ['textarea'], 3000);
  if (input) {
    await input.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await input.fill(prompt);
  }
}
