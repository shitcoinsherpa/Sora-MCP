import type { Page } from 'playwright';
import { SELECTORS, findElement, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { uploadFile } from './upload.js';
import { ensureOnSora } from './navigation.js';
import type { StoryboardCard } from '../types/sora.js';

export async function enableStoryboard(page: Page): Promise<void> {
  await ensureOnSora(page);

  const clicked = await clickElement(page, SELECTORS.storyboard.toggle, 5000);
  if (!clicked) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('storyboard toggle', screenshot);
  }
  await page.waitForTimeout(1500);
}

/**
 * Fill a scene card's prompt text.
 * Storyboard mode shows "Scene 1", "Scene 2" etc. with textarea placeholders.
 */
async function fillScenePrompt(page: Page, sceneIndex: number, prompt: string): Promise<void> {
  // Find all scene textareas (excluding the bottom "Describe your video..." bar)
  const sceneTextareas = await page.$$('textarea[placeholder*="Describe this scene"]');
  if (sceneTextareas.length > sceneIndex) {
    await sceneTextareas[sceneIndex].click();
    await page.waitForTimeout(200);
    await sceneTextareas[sceneIndex].fill(prompt);
  }
}

/**
 * Add a new scene card by clicking the "+" button.
 */
async function addScene(page: Page): Promise<void> {
  // The "+" button is at the bottom-left of storyboard mode
  const clicked = await clickElement(page, SELECTORS.storyboard.addScene, 3000);
  if (!clicked) {
    // Fallback: try pressing the "+" button by position
    const btns: boolean = await page.evaluate(`
      (function() {
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          var text = (btns[i].textContent || '').trim();
          if (text === '+') { btns[i].click(); return true; }
        }
        return false;
      })()
    `);
    if (!btns) {
      const screenshot = await captureScreenshot(page);
      throw new SelectorNotFoundError('add scene button', screenshot);
    }
  }
  await page.waitForTimeout(500);
}

export async function createStoryboard(page: Page, cards: StoryboardCard[]): Promise<void> {
  await enableStoryboard(page);

  // Storyboard starts with 2 scenes. Fill them, then add more if needed.
  for (let i = 0; i < cards.length; i++) {
    // Add more scenes if needed (already have 2 by default)
    if (i >= 2) {
      await addScene(page);
    }

    await fillScenePrompt(page, i, cards[i].prompt);

    if (cards[i].image_path) {
      await uploadFile(page, cards[i].image_path!);
    }

    await page.waitForTimeout(300);
  }
}

/**
 * Add a single card to existing storyboard.
 */
export async function addCard(page: Page, card: StoryboardCard): Promise<void> {
  await addScene(page);

  // Fill the last scene
  const sceneTextareas = await page.$$('textarea[placeholder*="Describe this scene"]');
  if (sceneTextareas.length > 0) {
    const lastIdx = sceneTextareas.length - 1;
    await sceneTextareas[lastIdx].click();
    await sceneTextareas[lastIdx].fill(card.prompt);
  }

  if (card.image_path) {
    await uploadFile(page, card.image_path);
  }
}
