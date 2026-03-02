/**
 * Visit specific post URLs and extract full prompts.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

const URLS = [
  'https://sora.chatgpt.com/p/s_68dfc5890a208191a4f8d587e885381b',
  'https://sora.chatgpt.com/p/s_68dfc6871b488191bb2caafe6e599e47',
  'https://sora.chatgpt.com/p/s_68dfcd77fe548191b3295647b3e9e611',
];

async function main() {
  const browser = new BrowserManager();
  const page = await browser.getPage();
  await ensureAuthenticated(page);

  for (const url of URLS) {
    console.log('\n========================================');
    console.log('URL: ' + url);
    console.log('========================================');

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Try clicking "more" to expand
    await page.evaluate(`
      (function() {
        var els = document.querySelectorAll('button, span, a');
        for (var i = 0; i < els.length; i++) {
          var t = (els[i].textContent || '').trim();
          if (t === 'more' || t === '… more' || t === '...more' || t === 'show more') {
            els[i].click();
          }
        }
      })()
    `);
    await page.waitForTimeout(1000);

    // Get ALL text content from the page, structured
    const pageData: any = await page.evaluate(`
      (function() {
        var result = { allText: '', textBlocks: [], textareas: [], username: '' };

        // Textareas
        document.querySelectorAll('textarea').forEach(function(ta) {
          var val = ta.value || ta.textContent || '';
          if (val.trim()) result.textareas.push(val.trim());
        });

        // Find all text blocks > 10 chars, with their parent info
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          var text = walker.currentNode.textContent.trim();
          if (text.length > 10) {
            var parent = walker.currentNode.parentElement;
            var tag = parent ? parent.tagName.toLowerCase() : 'unknown';
            var cls = parent ? (parent.className || '').toString().substring(0, 80) : '';
            if (tag !== 'script' && tag !== 'style') {
              result.textBlocks.push({
                text: text,
                tag: tag,
                class: cls,
                len: text.length
              });
            }
          }
        }

        // Full body text
        result.allText = document.body.innerText || '';

        return result;
      })()
    `);

    // Print textareas
    if (pageData.textareas.length > 0) {
      console.log('\n--- Textareas ---');
      for (const ta of pageData.textareas) {
        console.log(ta);
      }
    }

    // Print all meaningful text blocks sorted by length (longest first = likely prompt)
    console.log('\n--- Text blocks (sorted by length, top 15) ---');
    const blocks = pageData.textBlocks
      .filter((b: any) => b.len > 15)
      .sort((a: any, b: any) => b.len - a.len)
      .slice(0, 15);

    for (const b of blocks) {
      console.log(`[${b.tag}] (${b.len} chars): ${b.text.substring(0, 300)}${b.text.length > 300 ? '...' : ''}`);
    }

    // Also dump the full body text between clear markers
    console.log('\n--- FULL PAGE TEXT ---');
    // Extract just the relevant portion (skip nav/sidebar)
    const lines = pageData.allText.split('\n').filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      console.log(line.trim());
    }
    console.log('--- END PAGE TEXT ---');
  }

  console.log('\n(Browser left open)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
