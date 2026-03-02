/**
 * Focused test: explore video detail page buttons (icon buttons, more menu, etc.)
 * All page.evaluate callbacks use function() to avoid tsx __name compilation issue.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { checkSession } from '../src/browser/session.js';
import { captureScreenshot } from '../src/utils/screenshot.js';
import { navigateTo } from '../src/pages/navigation.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve('test-screenshots/detail');
mkdirSync(DIR, { recursive: true });
let idx = 0;

function save(name: string, b64: string) {
  const f = `${String(++idx).padStart(2, '0')}-${name}.jpg`;
  writeFileSync(resolve(DIR, f), Buffer.from(b64, 'base64'));
  console.log(`  📸 ${f}`);
}
function saveTxt(name: string, content: string) {
  writeFileSync(resolve(DIR, name), content);
}

async function main() {
  console.log('\n═══ VIDEO DETAIL PAGE DEEP INSPECTION ═══\n');

  const browser = new BrowserManager();
  await browser.launch();
  const page = await browser.getPage();

  const session = await checkSession(page);
  if (!session.authenticated) { console.log('NOT AUTHENTICATED'); process.exit(1); }
  console.log('✅ Authenticated\n');

  // Navigate to drafts and click first video
  await navigateTo(page, 'library');
  await page.waitForTimeout(3000);

  // Click first draft video
  const draftLinks = await page.$$('a[href^="/d/"]');
  console.log(`Found ${draftLinks.length} draft links`);
  if (draftLinks.length === 0) { console.log('No drafts found'); process.exit(1); }

  await draftLinks[0].click();
  await page.waitForTimeout(4000);
  save('detail-page', await captureScreenshot(page));
  console.log(`URL: ${page.url()}\n`);

  // Dump ALL visible interactive elements with positions
  console.log('=== ALL ELEMENTS ===\n');
  /* eslint-disable */
  const allElements: string[] = await page.evaluate(`
    (function() {
      var r = [];
      document.querySelectorAll('button, a, input, textarea, [role="button"], [role="menuitem"]').forEach(function(el) {
        var tag = el.tagName;
        var t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
        var a = el.getAttribute('aria-label') || '';
        var role = el.getAttribute('role') || '';
        var type = el.getAttribute('type') || '';
        var href = el.getAttribute('href') || '';
        var hasSvg = el.querySelector('svg') ? 'HAS-SVG' : '';
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          var pos = '(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')';
          var parts = ['<' + tag + '>'];
          if (t) parts.push('text="' + t + '"');
          if (a) parts.push('aria="' + a + '"');
          if (role) parts.push('role="' + role + '"');
          if (type) parts.push('type="' + type + '"');
          if (href) parts.push('href="' + href + '"');
          if (hasSvg) parts.push(hasSvg);
          parts.push(pos);
          r.push(parts.join(' | '));
        }
      });
      return r;
    })()
  `);
  /* eslint-enable */
  for (const line of allElements) console.log(line);
  saveTxt('all-elements-detail.txt', allElements.join('\n'));

  // SVG icon buttons
  console.log('\n=== SVG ICON BUTTONS ===\n');
  const svgButtons: string[] = await page.evaluate(`
    (function() {
      var r = [];
      document.querySelectorAll('button').forEach(function(btn) {
        var svg = btn.querySelector('svg');
        if (svg) {
          var rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            var t = (btn.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
            var a = btn.getAttribute('aria-label') || '';
            var titleEl = svg.querySelector('title');
            var title = titleEl ? titleEl.textContent : '';
            var paths = [];
            svg.querySelectorAll('path').forEach(function(p) {
              paths.push((p.getAttribute('d') || '').slice(0, 30));
            });
            r.push('BTN pos=(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ') size=' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ' text="' + t + '" aria="' + a + '" svg-title="' + title + '"');
          }
        }
      });
      return r;
    })()
  `);
  for (const line of svgButtons) console.log(`  ${line}`);
  saveTxt('svg-buttons-detail.txt', svgButtons.join('\n'));

  // Top-right icon buttons
  console.log('\n=== TOP-RIGHT BUTTONS ===\n');
  const topRightBtns: Array<{left: number; top: number; text: string; aria: string; idx: number}> = await page.evaluate(`
    (function() {
      var r = [];
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var rect = btns[i].getBoundingClientRect();
        if (rect.left > 800 && rect.top < 200 && rect.width > 0 && rect.width < 80) {
          var t = (btns[i].textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
          var a = btns[i].getAttribute('aria-label') || '';
          r.push({ left: Math.round(rect.left), top: Math.round(rect.top), text: t, aria: a, idx: i });
        }
      }
      return r;
    })()
  `);
  for (const b of topRightBtns) console.log(`  (${b.left},${b.top}) text="${b.text}" aria="${b.aria}" idx=${b.idx}`);

  // Click each top-right button and see what happens
  const allBtns = await page.$$('button');
  for (let i = topRightBtns.length - 1; i >= 0; i--) {
    const btn = topRightBtns[i];
    console.log(`\n=== CLICKING TOP-RIGHT BUTTON #${topRightBtns.length - i}: (${btn.left},${btn.top}) text="${btn.text}" ===\n`);

    if (allBtns[btn.idx]) {
      await allBtns[btn.idx].click();
      await page.waitForTimeout(2000);
      save(`click-topright-${topRightBtns.length - i}`, await captureScreenshot(page));

      const afterClick: string[] = await page.evaluate(`
        (function() {
          var r = [];
          var els = document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="slider"], input[type="range"], textarea, [role="dialog"] *, [data-radix-popper-content-wrapper] *');
          els.forEach(function(el) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              var tag = el.tagName;
              var t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
              var a = el.getAttribute('aria-label') || '';
              var role = el.getAttribute('role') || '';
              var ph = el.getAttribute('placeholder') || '';
              if (t || a || role === 'slider' || ph) {
                r.push('(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ') <' + tag + '> text="' + t + '" aria="' + a + '" role="' + role + '" ph="' + ph + '"');
              }
            }
          });
          return r;
        })()
      `);
      for (const e of afterClick) console.log(`  ${e}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }

  // Try the Extend button
  console.log('\n=== EXTEND BUTTON ===\n');
  try {
    await page.click('button:has-text("Extend")', { timeout: 3000 });
    await page.waitForTimeout(2000);
    save('after-extend', await captureScreenshot(page));

    const extendEls: string[] = await page.evaluate(`
      (function() {
        var r = [];
        document.querySelectorAll('button, textarea, input, [role="slider"]').forEach(function(el) {
          var rect = el.getBoundingClientRect();
          if (rect.width > 0) {
            var t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
            var a = el.getAttribute('aria-label') || '';
            var ph = el.getAttribute('placeholder') || '';
            r.push('(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ') text="' + t + '" aria="' + a + '" ph="' + ph + '"');
          }
        });
        return r;
      })()
    `);
    for (const e of extendEls) console.log(`  ${e}`);
    saveTxt('extend-elements.txt', extendEls.join('\n'));
  } catch (e: any) {
    console.log(`  Extend button: ${e.message}`);
  }

  console.log('\n═══ DONE ═══\n');
  await browser.close();
}

main().catch(function(err) { console.error('FATAL:', err); process.exit(2); });
