import type { Page } from 'playwright';
import { SELECTORS, clickElement } from './selectors.js';

export type SoraPage = 'home' | 'library' | 'search' | 'profile' | 'drafts';

/**
 * Sora is a SPA. Navigate via sidebar links/buttons.
 * home = explore feed, library/drafts = user's videos, profile = user profile.
 */
export async function navigateTo(page: Page, target: SoraPage): Promise<void> {
  await ensureOnSora(page);

  const sidebarMap: Record<string, readonly string[]> = {
    home: SELECTORS.navigation.sidebar.home,
    library: SELECTORS.navigation.sidebar.drafts, // "Library" = Drafts in Sora UI
    drafts: SELECTORS.navigation.sidebar.drafts,
    search: SELECTORS.navigation.sidebar.search,
    profile: SELECTORS.navigation.sidebar.profile,
  };

  const selectors = sidebarMap[target];
  if (selectors) {
    await clickElement(page, selectors, 5000);
    await page.waitForTimeout(2000);
  }
}

export async function ensureOnSora(page: Page): Promise<void> {
  const url = page.url();
  if (!url.includes('sora.com') && !url.includes('sora.chatgpt.com')) {
    await page.goto(SELECTORS.navigation.soraUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }
}
