import type { Page } from 'playwright';
import { SELECTORS, findElement } from '../pages/selectors.js';
import { SessionExpiredError } from '../utils/errors.js';
import { captureScreenshot } from '../utils/screenshot.js';

/** Check if a URL is the Sora app (either sora.com or sora.chatgpt.com) */
function isSoraApp(url: string): boolean {
  // Must be ON sora, not just redirecting through it
  return (
    (url.includes('sora.com') || url.includes('sora.chatgpt.com')) &&
    !isAuthPage(url)
  );
}

/** Check if URL is any kind of auth/login page */
function isAuthPage(url: string): boolean {
  return (
    url.includes('auth.openai.com') ||
    url.includes('login.openai.com') ||
    url.includes('auth0.openai.com') ||
    url.includes('accounts.google.com') ||
    url.includes('login.microsoftonline.com') ||
    url.includes('appleid.apple.com') ||
    url.includes('login.live.com')
  );
}

export async function checkSession(page: Page): Promise<{ authenticated: boolean; screenshot_base64: string }> {
  const url = page.url();

  // If not on sora yet, navigate there
  if (!isSoraApp(url)) {
    try {
      await page.goto(SELECTORS.navigation.soraUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      // May timeout during redirect
    }
    await page.waitForTimeout(4000);
  }

  const currentUrl = page.url();
  const screenshot_base64 = await captureScreenshot(page);

  // If on an auth page → not authenticated
  if (isAuthPage(currentUrl)) {
    return { authenticated: false, screenshot_base64 };
  }

  // If on Cloudflare challenge → not authenticated (or blocked)
  const title = await page.title();
  if (title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('security verification')) {
    return { authenticated: false, screenshot_base64 };
  }

  // If on sora, check for authenticated content
  if (isSoraApp(currentUrl)) {
    // Check for "Activity" button (strong logged-in signal) or prompt textarea
    const userMenu = await findElement(page, SELECTORS.auth.userMenu, 5000);
    if (userMenu) return { authenticated: true, screenshot_base64 };

    const promptInput = await findElement(page, SELECTORS.prompt.textInput, 3000);
    if (promptInput) return { authenticated: true, screenshot_base64 };

    // "Create video" button also indicates logged in
    const createBtn = await findElement(page, SELECTORS.prompt.generateButton, 2000);
    if (createBtn) return { authenticated: true, screenshot_base64 };

    // Check for "Log in" button (means NOT logged in — this is the landing page)
    const loginBtn = await findElement(page, SELECTORS.auth.loginButton, 2000);
    if (loginBtn) return { authenticated: false, screenshot_base64 };
  }

  return { authenticated: false, screenshot_base64 };
}

export async function waitForLogin(page: Page, timeout = 300000): Promise<boolean> {
  // Navigate to sora to start auth flow
  try {
    await page.goto(SELECTORS.navigation.soraUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    // Redirect timeout is OK
  }

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentUrl = page.url();

    // Only check for auth success if we're actually ON sora (not Google, not Apple, not Cloudflare)
    if (isSoraApp(currentUrl)) {
      // Strong signal: user avatar/menu present
      const userMenu = await findElement(page, SELECTORS.auth.userMenu, 2000);
      if (userMenu) return true;

      // Strong signal: prompt textarea visible (create page while logged in)
      const promptInput = await findElement(page, SELECTORS.prompt.textInput, 2000);
      if (promptInput) return true;
    }

    await page.waitForTimeout(3000);
  }

  return false;
}

export async function ensureAuthenticated(page: Page): Promise<void> {
  const { authenticated, screenshot_base64 } = await checkSession(page);
  if (!authenticated) {
    throw new SessionExpiredError(screenshot_base64);
  }
}
