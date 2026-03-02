import type { Page } from 'playwright';
import { SELECTORS } from '../pages/selectors.js';

export interface PollOptions {
  timeout: number;
  interval?: number;
  onProgress?: (message: string) => void;
}

export async function waitForGeneration(page: Page, opts: PollOptions): Promise<'completed' | 'failed' | 'timeout'> {
  const { timeout, interval = 10000, onProgress } = opts;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await detectGenerationState(page);

    if (state === 'completed') return 'completed';
    if (state === 'failed') return 'failed';

    onProgress?.(`Generation in progress... (${Math.round((deadline - Date.now()) / 1000)}s remaining)`);
    await page.waitForTimeout(interval);
  }

  return 'timeout';
}

export async function detectGenerationState(page: Page): Promise<'idle' | 'generating' | 'completed' | 'failed' | 'unknown'> {
  // Check for progress indicators
  for (const sel of SELECTORS.generation.progress) {
    const el = await page.$(sel);
    if (el) return 'generating';
  }

  // Check for completion indicators
  for (const sel of SELECTORS.generation.completed) {
    const el = await page.$(sel);
    if (el) return 'completed';
  }

  // Check for error indicators
  for (const sel of SELECTORS.generation.failed) {
    const el = await page.$(sel);
    if (el) return 'failed';
  }

  return 'unknown';
}
