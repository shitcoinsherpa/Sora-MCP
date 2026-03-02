import type { Page } from 'playwright';
import { SELECTORS, findElement, clickElement } from './selectors.js';
import { SelectorNotFoundError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';
import { existsSync } from 'fs';

export async function uploadFile(page: Page, filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Try to find an existing file input
  let fileInput = await findElement(page, SELECTORS.upload.fileInput, 2000);

  if (!fileInput) {
    // Click the add/upload button to reveal the file input
    const clicked = await clickElement(page, SELECTORS.upload.addButton, 3000);
    if (!clicked) {
      const screenshot = await captureScreenshot(page);
      throw new SelectorNotFoundError('upload button', screenshot);
    }
    await page.waitForTimeout(1000);
    fileInput = await findElement(page, SELECTORS.upload.fileInput, 3000);
  }

  if (!fileInput) {
    // Fallback: use page-level file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      clickElement(page, SELECTORS.upload.addButton, 3000),
    ]);
    await fileChooser.setFiles(filePath);
    return;
  }

  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(1500);
}
