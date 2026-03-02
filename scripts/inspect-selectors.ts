/**
 * Dev utility: Launch a headed browser pointing at sora.com
 * for manual selector verification and discovery.
 *
 * Usage: npm run inspect
 */
import { chromium } from 'playwright';
import { resolve } from 'path';

async function main() {
  const profileDir = resolve(process.cwd(), '.browser-profile');

  console.log('Launching headed browser...');
  console.log(`Profile dir: ${profileDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://sora.com');

  console.log('Browser open at sora.com');
  console.log('Use DevTools (F12) to inspect selectors.');
  console.log('Press Ctrl+C to close.');

  // Keep alive
  await new Promise(() => {});
}

main().catch(console.error);
