import { chromium, webkit } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext, Page } from 'playwright';
import { BrowserConfig, loadConfig } from './config.js';
import { BrowserCrashedError } from '../utils/errors.js';
import { mkdirSync, existsSync } from 'fs';
import { platform } from 'os';

// Apply stealth plugin to Chromium
chromium.use(StealthPlugin());

/** Locate the user's real Chrome/Chromium installation */
function findChromePath(): string | undefined {
  const candidates: string[] = [];

  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  const os = platform();
  if (os === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
    );
  } else if (os === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    );
  }

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

function detectBrowserEngine(): 'chromium' | 'webkit' {
  const engine = process.env.SORA_BROWSER;
  if (engine === 'webkit' || engine === 'safari') return 'webkit';
  if (engine === 'chromium' || engine === 'chrome') return 'chromium';
  if (findChromePath()) return 'chromium';
  if (platform() === 'darwin') return 'webkit';
  return 'chromium';
}

export class BrowserManager {
  private context: BrowserContext | null = null;
  private config: BrowserConfig;
  private launching = false;
  private engine: 'chromium' | 'webkit';

  constructor(config?: BrowserConfig) {
    this.config = config || loadConfig();
    this.engine = detectBrowserEngine();
  }

  getConfig(): BrowserConfig {
    return this.config;
  }

  getEngine(): string {
    return this.engine;
  }

  async getPage(): Promise<Page> {
    await this.ensureAlive();
    const pages = this.context!.pages();
    return pages[0] || await this.context!.newPage();
  }

  /**
   * Launch browser. Always headed — headless Chrome gets blocked by Cloudflare.
   * The browser window will stay open in the background.
   */
  async launch(): Promise<void> {
    if (this.context && await this.isAlive()) return;
    if (this.launching) {
      while (this.launching) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.launching = true;
    try {
      mkdirSync(this.config.profileDir, { recursive: true });
      mkdirSync(this.config.downloadDir, { recursive: true });

      if (this.engine === 'webkit') {
        await this.launchWebKit();
      } else {
        await this.launchChromium();
      }

      this.context!.setDefaultTimeout(this.config.actionTimeout);
      this.context!.setDefaultNavigationTimeout(this.config.navTimeout);
    } finally {
      this.launching = false;
    }
  }

  private async launchChromium(): Promise<void> {
    const chromePath = findChromePath();
    console.error(`[sora-mcp] Engine: Chromium | Executable: ${chromePath || 'bundled'} | Headed (required for Cloudflare)`);

    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless: false,
      executablePath: chromePath,
      channel: chromePath ? undefined : 'chrome',
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
        // Start minimized so it doesn't steal focus
        '--start-minimized',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Remove webdriver flag
    this.context.on('page', async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
    });
    for (const page of this.context.pages()) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
    }
  }

  private async launchWebKit(): Promise<void> {
    console.error('[sora-mcp] Engine: WebKit (Safari) | Headed');

    this.context = await webkit.launchPersistentContext(this.config.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
  }

  /** Re-launch (same headed mode) — used after login to reset state */
  async relaunch(): Promise<void> {
    await this.close();
    await this.launch();
  }

  private async isAlive(): Promise<boolean> {
    if (!this.context) return false;
    try {
      const pages = this.context.pages();
      if (pages.length === 0) return true;
      await pages[0].evaluate(() => true);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureAlive(): Promise<void> {
    if (await this.isAlive()) return;
    this.context = null;
    await this.launch();
    if (!this.context) {
      throw new BrowserCrashedError();
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore close errors
      }
      this.context = null;
    }
  }
}
