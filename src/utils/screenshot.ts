import type { Page } from 'playwright';

export async function captureScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
  return buffer.toString('base64');
}
