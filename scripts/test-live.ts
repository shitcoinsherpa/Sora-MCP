/**
 * Live end-to-end test against real sora.chatgpt.com.
 * Browser stays headed (required to pass Cloudflare).
 */
import { BrowserManager } from '../src/browser/manager.js';
import { checkSession, waitForLogin } from '../src/browser/session.js';
import { captureScreenshot } from '../src/utils/screenshot.js';
import { ensureOnSora, navigateTo } from '../src/pages/navigation.js';
import { enterPrompt } from '../src/pages/generate.js';
import { listLibrary, selectVideo } from '../src/pages/library.js';
import { browseExplore } from '../src/pages/explore.js';
import { findElement, clickElement, SELECTORS } from '../src/pages/selectors.js';
import { detectGenerationState } from '../src/utils/wait.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve('test-screenshots');
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

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SORA-MCP LIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════\n');

  const browser = new BrowserManager();
  await browser.launch();
  let page = await browser.getPage();

  // ═══════════════════════════════════════════
  // PHASE 1: AUTH
  // ═══════════════════════════════════════════
  console.log('▶ PHASE 1: Authentication\n');

  let session = await checkSession(page);
  save('session-check', session.screenshot_base64);
  console.log(`  Authenticated: ${session.authenticated}\n`);

  if (!session.authenticated) {
    console.log('  ⏳ Waiting for login (up to 5 min)...\n');
    const loggedIn = await waitForLogin(page, 300000);
    save('after-login', await captureScreenshot(page));
    assert(loggedIn, 'Login failed or timed out');
    console.log('  ✅ Login successful!\n');

    session = await checkSession(page);
    save('session-verify', session.screenshot_base64);
    assert(session.authenticated, 'Session verify failed after login');
    console.log('  ✅ Session verified\n');

    // Persistence test
    console.log('  Testing session persistence (browser restart)...');
    await browser.relaunch();
    page = await browser.getPage();
    session = await checkSession(page);
    save('session-persist', session.screenshot_base64);
    assert(session.authenticated, 'SESSION DID NOT PERSIST!');
    console.log('  ✅ Session persists across restarts!\n');
  } else {
    console.log('  ✅ Already authenticated\n');
  }

  // ═══════════════════════════════════════════
  // PHASE 2: DOM DISCOVERY
  // ═══════════════════════════════════════════
  console.log('▶ PHASE 2: DOM Discovery (main page)\n');

  await ensureOnSora(page);
  await page.waitForTimeout(4000);

  await test('Dump ALL interactive elements', async () => {
    const ss = await captureScreenshot(page);
    save('main-page', ss);

    const dump = await page.evaluate(() => {
      const r: string[] = [];
      // All focusable/interactive elements
      document.querySelectorAll('button, [role="button"], a, input, textarea, [contenteditable], select, [role="textbox"], [role="tab"], [role="slider"], [role="combobox"], [role="menuitem"]').forEach(el => {
        const tag = el.tagName;
        const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
        const a = el.getAttribute('aria-label') || '';
        const d = el.getAttribute('data-testid') || '';
        const ph = el.getAttribute('placeholder') || '';
        const role = el.getAttribute('role') || '';
        const type = el.getAttribute('type') || '';
        const href = el.getAttribute('href') || '';
        const ce = el.getAttribute('contenteditable') || '';
        const parts: string[] = [`${tag}`];
        if (t) parts.push(`text="${t}"`);
        if (a) parts.push(`aria="${a}"`);
        if (d) parts.push(`testid="${d}"`);
        if (ph) parts.push(`ph="${ph}"`);
        if (role) parts.push(`role="${role}"`);
        if (type) parts.push(`type="${type}"`);
        if (href) parts.push(`href="${href}"`);
        if (ce) parts.push(`contenteditable="${ce}"`);
        r.push(parts.join(' '));
      });
      return r;
    });

    saveTxt('main-page-elements.txt', dump.join('\n'));
    console.log(`\n    ${dump.length} interactive elements:`);
    for (const line of dump) console.log(`      ${line}`);
  });

  // ═══════════════════════════════════════════
  // PHASE 3: PROMPT & GENERATE
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 3: Prompt Input & Generation\n');

  await test('Find prompt input', async () => {
    const el = await findElement(page, SELECTORS.prompt.textInput, 10000);
    if (el) {
      const ph = await el.getAttribute('placeholder');
      console.log(`\n    ✅ Found! placeholder="${ph}"`);
    } else {
      throw new Error('Prompt input not found');
    }
  });

  await test('Enter prompt text', async () => {
    await enterPrompt(page, 'A single red balloon floating slowly upward against a clear blue sky, golden hour, cinematic');
    await page.waitForTimeout(1000);
    save('prompt-entered', await captureScreenshot(page));
  });

  await test('Find generate/send button', async () => {
    const el = await findElement(page, SELECTORS.prompt.generateButton, 5000);
    if (el) {
      const a = await el.getAttribute('aria-label');
      console.log(`\n    ✅ Found! aria-label="${a}"`);
    } else {
      // Dump what buttons are near the prompt
      const btns = await page.evaluate(() => {
        const r: string[] = [];
        document.querySelectorAll('button').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 100) { // Bottom of page
            const t = el.textContent?.trim().slice(0, 40) || '';
            const a = el.getAttribute('aria-label') || '';
            r.push(`BTN y=${Math.round(rect.top)} text="${t}" aria="${a}"`);
          }
        });
        return r;
      });
      console.log('\n    ⚠ Not found. Bottom buttons:');
      for (const b of btns) console.log(`      ${b}`);
      throw new Error('Generate button not found');
    }
  });

  await test('Click generate', async () => {
    const clicked = await clickElement(page, SELECTORS.prompt.generateButton, 8000);
    await page.waitForTimeout(3000);
    save('after-generate', await captureScreenshot(page));
    assert(clicked, 'Could not click generate');
  });

  await test('Detect generation state', async () => {
    await page.waitForTimeout(5000);
    const state = await detectGenerationState(page);
    save('gen-state', await captureScreenshot(page));
    console.log(`\n    State: ${state}`);
  });

  // Wait for generation
  console.log('\n  ⏳ Waiting for generation (up to 3 min)...');
  const deadline = Date.now() + 180000;
  let genResult = 'timeout';
  while (Date.now() < deadline) {
    const state = await detectGenerationState(page);
    if (state === 'completed') { genResult = 'completed'; break; }
    if (state === 'failed') { genResult = 'failed'; break; }
    process.stdout.write(`\r  ⏳ ${Math.round((deadline - Date.now()) / 1000)}s left (${state})   `);
    await page.waitForTimeout(10000);
  }
  console.log(`\n  Generation: ${genResult}`);
  save('gen-final', await captureScreenshot(page));

  // ═══════════════════════════════════════════
  // PHASE 4: LIBRARY
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 4: Library\n');

  await test('Navigate to library (sidebar)', async () => {
    await navigateTo(page, 'library');
    await page.waitForTimeout(2000);
    save('library', await captureScreenshot(page));
  });

  await test('Dump library page elements', async () => {
    const dump = await page.evaluate(() => {
      const r: string[] = [];
      document.querySelectorAll('button, a, [role="button"], article, [role="gridcell"], [role="listitem"], video, img[src]').forEach(el => {
        const tag = el.tagName;
        const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
        const a = el.getAttribute('aria-label') || '';
        const d = el.getAttribute('data-testid') || '';
        if (t || a || d) r.push(`${tag} text="${t}" aria="${a}" testid="${d}"`);
      });
      return r;
    });
    saveTxt('library-elements.txt', dump.join('\n'));
    console.log(`\n    ${dump.length} elements`);
    for (const l of dump.slice(0, 20)) console.log(`      ${l}`);
  });

  // ═══════════════════════════════════════════
  // PHASE 5: EXPLORE
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 5: Explore\n');

  await test('Browse explore (main feed)', async () => {
    const r = await browseExplore(page);
    save('explore', r.screenshot_base64);
    console.log(`\n    ${r.itemCount} items`);
  });

  // ═══════════════════════════════════════════
  // PHASE 6: STORYBOARD & SETTINGS
  // ═══════════════════════════════════════════
  console.log('\n▶ PHASE 6: Storyboard & Settings\n');

  await test('Find Storyboard button', async () => {
    await ensureOnSora(page);
    await page.waitForTimeout(2000);
    const el = await findElement(page, SELECTORS.storyboard.toggle, 5000);
    save('storyboard-check', await captureScreenshot(page));
    console.log(`\n    Storyboard: ${el ? 'FOUND ✅' : 'NOT FOUND ⚠'}`);
    assert(el !== null, 'Storyboard button not found');
  });

  await test('Find Settings button', async () => {
    const el = await findElement(page, SELECTORS.settings.trigger, 5000);
    console.log(`\n    Settings: ${el ? 'FOUND ✅' : 'NOT FOUND ⚠'}`);
  });

  await test('Find Upload (+) button', async () => {
    const el = await findElement(page, SELECTORS.upload.addButton, 5000);
    console.log(`\n    Upload: ${el ? 'FOUND ✅' : 'NOT FOUND ⚠'}`);
  });

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
  console.log('═══════════════════════════════════════════════\n');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => { console.error('\nFATAL:', err); process.exit(2); });
