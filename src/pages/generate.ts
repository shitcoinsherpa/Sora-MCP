import type { Page } from 'playwright';
import { SELECTORS, findElement, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { ensureOnSora } from './navigation.js';
import type { VideoSettings } from '../types/sora.js';

export async function enterPrompt(page: Page, prompt: string): Promise<void> {
  await ensureOnSora(page);

  const input = await findElement(page, SELECTORS.prompt.textInput, 10000);
  if (!input) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('prompt input', screenshot);
  }

  await input.click();
  await page.waitForTimeout(300);
  // Clear existing text
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await input.fill(prompt);
}

/**
 * Open the settings popup (sliders icon near prompt bar) and select an option.
 * Settings uses [role="menuitem"] items for Orientation and Duration.
 */
export async function selectSetting(
  page: Page,
  settingType: 'orientation' | 'duration',
  value: string,
): Promise<boolean> {
  // First try: settings might already be open, or the option might be directly visible
  const config = SELECTORS.settings[settingType];
  if (!config || !('options' in config)) return false;

  const options = config.options as Record<string, readonly string[]>;
  const valueSelectors = options[value];
  if (!valueSelectors) return false;

  // Try clicking the option directly first (may already be visible)
  if (await clickElement(page, valueSelectors, 2000)) return true;

  // Open settings popup
  if (await clickElement(page, SELECTORS.settings.trigger, 2000)) {
    await page.waitForTimeout(500);

    // Click the setting category (e.g., "Orientation" or "Duration")
    if (await clickElement(page, config.trigger, 2000)) {
      await page.waitForTimeout(500);
      // Now click the specific value
      if (await clickElement(page, valueSelectors, 3000)) return true;
    }

    // Try direct click in the popup
    if (await clickElement(page, valueSelectors, 2000)) return true;
  }

  return false;
}

export async function selectStylePreset(page: Page, preset: string): Promise<boolean> {
  if (preset === 'none') return true;

  const selectors = SELECTORS.settings.stylePreset.options(preset);

  // Try clicking directly
  if (await clickElement(page, selectors, 2000)) return true;

  // Open style menu first
  if (await clickElement(page, SELECTORS.settings.stylePreset.trigger, 2000)) {
    await page.waitForTimeout(500);
    return clickElement(page, selectors, 3000);
  }

  return false;
}

export async function configureAndGenerate(page: Page, settings: VideoSettings): Promise<void> {
  await enterPrompt(page, settings.prompt);

  // Map aspect ratio to orientation
  if (settings.aspect_ratio) {
    await selectSetting(page, 'orientation', settings.aspect_ratio);
  }
  if (settings.duration) {
    await selectSetting(page, 'duration', settings.duration);
  }
  if (settings.style_preset && settings.style_preset !== 'none') {
    await selectStylePreset(page, settings.style_preset);
  }

  // Close any open settings popup
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Click generate
  const clicked = await clickElement(page, SELECTORS.prompt.generateButton, 5000);
  if (!clicked) {
    const screenshot = await captureScreenshot(page);
    throw new SelectorNotFoundError('generate button', screenshot);
  }

  // Wait a moment for generation to start
  await page.waitForTimeout(2000);
}
