/**
 * Quick test: launch headed browser with stealth, navigate to sora.com,
 * take screenshots at intervals so we can see what's happening.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { captureScreenshot } from '../src/utils/screenshot.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve('test-screenshots');
mkdirSync(DIR, { recursive: true });

function save(name: string, b64: string) {
  writeFileSync(resolve(DIR, `${name}.jpg`), Buffer.from(b64, 'base64'));
  console.log(`  Screenshot: ${name}.jpg`);
}

async function main() {
  console.log('Launching headed browser with stealth...');
  const browser = new BrowserManager();
  await browser.launchHeaded();
  const page = await browser.getPage();

  // Check webdriver flag
  const wd = await page.evaluate(() => (navigator as any).webdriver);
  console.log(`navigator.webdriver = ${wd}`);

  console.log('Navigating to sora.com...');
  await page.goto('https://sora.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`[${i * 5}s] URL: ${url}`);
    const ss = await captureScreenshot(page);
    save(`stealth-${i * 5}s`, ss);

    // Check if we got past cloudflare
    const title = await page.title();
    console.log(`  Title: ${title}`);
    if (url.includes('sora.com') && !title.toLowerCase().includes('just a moment') && !title.toLowerCase().includes('verify')) {
      console.log('  ✓ Appears to have passed bot check!');
      break;
    }
  }

  // Dump page content
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
  console.log(`\nPage body (first 500 chars):\n${bodyText}`);

  console.log('\nKeeping browser open for 10 more seconds...');
  await page.waitForTimeout(10000);
  const finalSs = await captureScreenshot(page);
  save('stealth-final', finalSs);
  console.log(`Final URL: ${page.url()}`);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
