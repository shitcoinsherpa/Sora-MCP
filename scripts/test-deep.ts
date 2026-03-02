/**
 * Deep test: video detail page, settings panel, storyboard, library grid.
 * Requires an existing authenticated session from a previous test-live run.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { checkSession } from '../src/browser/session.js';
import { captureScreenshot } from '../src/utils/screenshot.js';
import { ensureOnSora, navigateTo } from '../src/pages/navigation.js';
import { findElement, clickElement, SELECTORS } from '../src/pages/selectors.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve('test-screenshots/deep');
mkdirSync(DIR, { recursive: true });
let idx = 0;

function save(name: string, b64: string) {
  const f = `${String(++idx).padStart(2, '0')}-${name}.jpg`;
  writeFileSync(resolve(DIR, f), Buffer.from(b64, 'base64'));
  console.log(`    📸 ${f}`);
}
function saveTxt(name: string, content: string) {
  writeFileSync(resolve(DIR, name), content);
}

let passed = 0, failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  [TEST] ${name} ... `);
  try { await fn(); console.log('PASS'); passed++; }
  catch (err: any) { console.log(`FAIL: ${err.message}`); failed++; failures.push(`${name}: ${err.message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

/** Dump all interactive elements on current page */
async function dumpElements(page: import('playwright').Page, label: string) {
  const dump = await page.evaluate(() => {
    const r: string[] = [];
    document.querySelectorAll('button, [role="button"], a, input, textarea, [contenteditable], select, [role="textbox"], [role="tab"], [role="slider"], [role="combobox"], [role="menuitem"], video, article, [role="gridcell"], [role="listitem"], img[src*="video"], img[src*="sora"], div[class*="video"], div[class*="card"], div[class*="grid"]').forEach(el => {
      const tag = el.tagName;
      const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
      const a = el.getAttribute('aria-label') || '';
      const d = el.getAttribute('data-testid') || '';
      const ph = el.getAttribute('placeholder') || '';
      const role = el.getAttribute('role') || '';
      const type = el.getAttribute('type') || '';
      const href = el.getAttribute('href') || '';
      const cls = el.className?.toString().slice(0, 80) || '';
      const src = el.getAttribute('src')?.slice(0, 80) || '';
      const parts: string[] = [`${tag}`];
      if (t) parts.push(`text="${t}"`);
      if (a) parts.push(`aria="${a}"`);
      if (d) parts.push(`testid="${d}"`);
      if (ph) parts.push(`ph="${ph}"`);
      if (role) parts.push(`role="${role}"`);
      if (type) parts.push(`type="${type}"`);
      if (href) parts.push(`href="${href}"`);
      if (src) parts.push(`src="${src}"`);
      if (cls) parts.push(`class="${cls}"`);
      r.push(parts.join(' | '));
    });
    return r;
  });
  saveTxt(`${label}-elements.txt`, dump.join('\n'));
  console.log(`\n    ${dump.length} elements on ${label}`);
  return dump;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SORA-MCP DEEP TEST SUITE');
  console.log('═══════════════════════════════════════════════\n');

  const browser = new BrowserManager();
  await browser.launch();
  let page = await browser.getPage();

  // Verify auth
  const session = await checkSession(page);
  save('auth-check', session.screenshot_base64);
  assert(session.authenticated, 'Not authenticated — run test-live.ts first');
  console.log('  ✅ Authenticated\n');

  // ═══════════════════════════════════════════
  // PHASE 1: SETTINGS PANEL
  // ═══════════════════════════════════════════
  console.log('▶ PHASE 1: Settings Panel\n');

  await ensureOnSora(page);
  await page.waitForTimeout(3000);

  await test('Open settings panel', async () => {
    // First try the settings button near textarea
    const clicked = await clickElement(page, SELECTORS.settings.trigger, 5000);
    save('settings-panel', await captureScreenshot(page));

    if (!clicked) {
      // Try finding settings by other means
      const btns = await page.evaluate(() => {
        const r: string[] = [];
        document.querySelectorAll('button').forEach(el => {
          const a = el.getAttribute('aria-label') || '';
          const t = el.textContent?.trim().slice(0, 40) || '';
          const rect = el.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 150) {
            r.push(`BTN y=${Math.round(rect.top)} text="${t}" aria="${a}"`);
          }
        });
        return r;
      });
      console.log('\n    ⚠ Settings button not found. Bottom buttons:');
      for (const b of btns) console.log(`      ${b}`);
    }
  });

  await test('Dump settings panel elements', async () => {
    await dumpElements(page, 'settings-panel');
  });

  await test('Find aspect ratio options', async () => {
    // Look for 16:9, 9:16, 1:1 buttons
    const found: string[] = [];
    for (const [label, sels] of Object.entries(SELECTORS.settings.aspectRatio.options)) {
      const el = await findElement(page, sels, 2000);
      if (el) found.push(label);
    }
    console.log(`\n    Aspect ratios found: ${found.join(', ') || 'NONE'}`);
  });

  await test('Find resolution options', async () => {
    const found: string[] = [];
    for (const [label, sels] of Object.entries(SELECTORS.settings.resolution.options)) {
      const el = await findElement(page, sels, 2000);
      if (el) found.push(label);
    }
    console.log(`\n    Resolutions found: ${found.join(', ') || 'NONE'}`);
  });

  await test('Find duration options', async () => {
    const found: string[] = [];
    for (const [label, sels] of Object.entries(SELECTORS.settings.duration.options)) {
      const el = await findElement(page, sels, 2000);
      if (el) found.push(label);
    }
    console.log(`\n    Durations found: ${found.join(', ') || 'NONE'}`);
  });

  // Close settings panel if open (click elsewhere)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ═══════════════════════════════════════════
  // PHASE 2: STORYBOARD UI
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 2: Storyboard UI\n');

  await ensureOnSora(page);
  await page.waitForTimeout(2000);

  await test('Toggle storyboard mode', async () => {
    const clicked = await clickElement(page, SELECTORS.storyboard.toggle, 5000);
    await page.waitForTimeout(1500);
    save('storyboard-open', await captureScreenshot(page));
    assert(clicked, 'Could not click Storyboard button');
  });

  await test('Dump storyboard elements', async () => {
    await dumpElements(page, 'storyboard');
  });

  await test('Find storyboard cards or add button', async () => {
    const cards = await page.$$(SELECTORS.storyboard.cards[0]);
    console.log(`\n    Cards found: ${cards.length}`);

    const addBtn = await findElement(page, SELECTORS.storyboard.addCard, 3000);
    console.log(`    Add card button: ${addBtn ? 'FOUND' : 'NOT FOUND'}`);

    // Also look for any add/plus buttons
    const addBtns = await page.evaluate(() => {
      const r: string[] = [];
      document.querySelectorAll('button').forEach(el => {
        const t = el.textContent?.trim().slice(0, 40) || '';
        const a = el.getAttribute('aria-label') || '';
        if (t.toLowerCase().includes('add') || a.toLowerCase().includes('add') ||
            t === '+' || a.includes('plus') || a.includes('new')) {
          r.push(`text="${t}" aria="${a}"`);
        }
      });
      return r;
    });
    if (addBtns.length > 0) {
      console.log('    Add-like buttons:');
      for (const b of addBtns) console.log(`      ${b}`);
    }
  });

  // Close storyboard (toggle off)
  await clickElement(page, SELECTORS.storyboard.toggle, 3000);
  await page.waitForTimeout(1000);

  // ═══════════════════════════════════════════
  // PHASE 3: LIBRARY / DRAFTS GRID
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 3: Library / Drafts Grid\n');

  await test('Navigate to Drafts', async () => {
    await navigateTo(page, 'library');
    await page.waitForTimeout(3000);
    save('drafts-page', await captureScreenshot(page));
  });

  await test('Deep dump drafts grid', async () => {
    const dump = await dumpElements(page, 'drafts-grid');

    // Extra: dump ALL links with href on the page
    const links = await page.evaluate(() => {
      const r: string[] = [];
      document.querySelectorAll('a[href]').forEach(el => {
        const href = el.getAttribute('href') || '';
        const a = el.getAttribute('aria-label') || '';
        const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
        r.push(`href="${href}" aria="${a}" text="${t}"`);
      });
      return r;
    });
    saveTxt('drafts-links.txt', links.join('\n'));
    console.log(`\n    ${links.length} links found`);
    for (const l of links.slice(0, 15)) console.log(`      ${l}`);
  });

  await test('Find video grid items', async () => {
    // Try many possible selectors for the video grid
    const candidates = [
      'article',
      '[role="gridcell"]',
      '[role="listitem"]',
      'a[href*="/g/"]',
      'a[href*="/v/"]',
      'a[href*="/video"]',
      'a[href*="/draft"]',
      'div[class*="grid"] > *',
      'div[class*="video"]',
      'main a',
      'main article',
      'main > div > div > div > a',
      'main > div > div > div > div > a',
    ];

    for (const sel of candidates) {
      try {
        const elements = await page.$$(sel);
        if (elements.length > 0) {
          console.log(`\n    Selector "${sel}" → ${elements.length} items`);
          // Get details of first item
          const first = elements[0];
          const tag = await first.evaluate(el => el.tagName);
          const href = await first.getAttribute('href') || '';
          const aria = await first.getAttribute('aria-label') || '';
          const cls = await first.evaluate(el => el.className?.toString().slice(0, 60) || '');
          console.log(`      First: <${tag}> href="${href}" aria="${aria}" class="${cls}"`);
        }
      } catch { /* skip */ }
    }
  });

  // ═══════════════════════════════════════════
  // PHASE 4: CLICK INTO A VIDEO (Detail Page)
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 4: Video Detail Page\n');

  await test('Click first video in grid', async () => {
    // Try common patterns for clickable video items
    const candidateSelectors = [
      'a[href*="/g/"]',
      'a[href*="/v/"]',
      'article a',
      'main a[href]:not([href="/explore"]):not([href="/drafts"]):not([href="/profile"])',
    ];

    let clicked = false;
    for (const sel of candidateSelectors) {
      const items = await page.$$(sel);
      // Filter out sidebar links
      for (const item of items) {
        const href = await item.getAttribute('href') || '';
        if (href.startsWith('/g/') || href.startsWith('/v/') || href.includes('video')) {
          await item.click();
          clicked = true;
          break;
        }
      }
      if (clicked) break;
    }

    if (!clicked) {
      // Fallback: try clicking any link in main content area
      const mainLinks = await page.$$('main a[href]');
      for (const link of mainLinks) {
        const href = await link.getAttribute('href') || '';
        // Skip sidebar/nav links
        if (href === '/explore' || href === '/drafts' || href === '/profile' || href === '#') continue;
        await link.click();
        clicked = true;
        break;
      }
    }

    await page.waitForTimeout(3000);
    save('video-detail', await captureScreenshot(page));
    assert(clicked, 'Could not click any video');
    console.log(`\n    Current URL: ${page.url()}`);
  });

  await test('Dump video detail elements', async () => {
    await dumpElements(page, 'video-detail');
  });

  await test('Find edit tool buttons (remix/blend/recut/loop)', async () => {
    const tools = {
      Remix: SELECTORS.remix.button,
      Blend: SELECTORS.blend.button,
      'Re-cut': SELECTORS.recut.button,
      Loop: SELECTORS.loop.button,
    };

    for (const [name, sels] of Object.entries(tools)) {
      const el = await findElement(page, sels, 3000);
      console.log(`\n    ${name}: ${el ? 'FOUND ✅' : 'NOT FOUND ⚠'}`);
    }

    // Also find ALL buttons on this page
    const allBtns = await page.evaluate(() => {
      const r: string[] = [];
      document.querySelectorAll('button, [role="button"]').forEach(el => {
        const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
        const a = el.getAttribute('aria-label') || '';
        if (t || a) r.push(`text="${t}" | aria="${a}"`);
      });
      return r;
    });
    saveTxt('video-detail-buttons.txt', allBtns.join('\n'));
    console.log(`\n    Total buttons on detail page: ${allBtns.length}`);
    for (const b of allBtns) console.log(`      ${b}`);
  });

  await test('Find download button on detail page', async () => {
    // Try more menu first
    const moreBtn = await findElement(page, SELECTORS.library.moreMenu, 3000);
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(1000);
      save('video-more-menu', await captureScreenshot(page));

      // Dump menu items
      const menuItems = await page.evaluate(() => {
        const r: string[] = [];
        document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item]').forEach(el => {
          const t = el.textContent?.trim().slice(0, 60) || '';
          const a = el.getAttribute('aria-label') || '';
          r.push(`text="${t}" aria="${a}"`);
        });
        return r;
      });
      console.log('\n    Menu items:');
      for (const m of menuItems) console.log(`      ${m}`);

      // Close menu
      await page.keyboard.press('Escape');
    } else {
      // Try finding download directly
      const dl = await findElement(page, SELECTORS.library.downloadOption, 2000);
      console.log(`\n    Direct download button: ${dl ? 'FOUND' : 'NOT FOUND'}`);
    }
  });

  // ═══════════════════════════════════════════
  // PHASE 5: TEST REMIX PANEL (if available)
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 5: Remix Panel\n');

  await test('Open remix panel', async () => {
    const remixBtn = await findElement(page, SELECTORS.remix.button, 3000);
    if (!remixBtn) {
      // Check for any button with remix-like text
      const btns = await page.evaluate(() => {
        const r: string[] = [];
        document.querySelectorAll('button').forEach(el => {
          const t = el.textContent?.trim().toLowerCase() || '';
          if (t.includes('remix') || t.includes('edit') || t.includes('modify') ||
              t.includes('variation') || t.includes('redo')) {
            r.push(el.textContent?.trim() || '');
          }
        });
        return r;
      });
      console.log(`\n    No remix button. Similar buttons: ${btns.join(', ') || 'none'}`);
      throw new Error('Remix button not found');
    }

    await remixBtn.click();
    await page.waitForTimeout(2000);
    save('remix-panel', await captureScreenshot(page));
  });

  await test('Dump remix panel elements', async () => {
    await dumpElements(page, 'remix-panel');
  });

  await test('Find remix intensity controls', async () => {
    const slider = await findElement(page, SELECTORS.remix.intensitySlider, 3000);
    console.log(`\n    Slider: ${slider ? 'FOUND' : 'NOT FOUND'}`);

    for (const [name, sels] of Object.entries(SELECTORS.remix.intensityPresets)) {
      const el = await findElement(page, sels, 2000);
      console.log(`    ${name}: ${el ? 'FOUND' : 'NOT FOUND'}`);
    }

    const promptInput = await findElement(page, SELECTORS.remix.promptInput, 3000);
    console.log(`    Prompt input: ${promptInput ? 'FOUND' : 'NOT FOUND'}`);
  });

  // Close remix panel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const f of failures) console.log(`    ✗ ${f}`);
  }
  console.log(`\n  Screenshots: ${DIR}/`);
  console.log('  Element dumps: check .txt files in same dir');
  console.log('═══════════════════════════════════════════════\n');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => { console.error('\nFATAL:', err); process.exit(2); });
