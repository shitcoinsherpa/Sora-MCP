/**
 * Visit each draft in the library and extract its prompt text.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';
import { navigateTo } from '../src/pages/navigation.js';

async function main() {
  const browser = new BrowserManager();

  try {
    const page = await browser.getPage();
    await ensureAuthenticated(page);
    await navigateTo(page, 'library');
    await page.waitForTimeout(3000);

    // Get all draft links
    const hrefs: string[] = await page.evaluate(`
      (function() {
        var links = document.querySelectorAll('a[href^="/d/"]');
        var results = [];
        for (var i = 0; i < links.length; i++) {
          results.push(links[i].getAttribute('href'));
        }
        return results;
      })()
    `);

    console.log('Found ' + hrefs.length + ' drafts\n');

    // Visit each and extract prompt
    const results: Array<{ href: string; prompt: string }> = [];

    for (const href of hrefs) {
      await page.goto('https://sora.com' + href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const data: { prompt: string; source: string } = await page.evaluate(`
        (function() {
          // Try textareas
          var textareas = document.querySelectorAll('textarea');
          for (var i = 0; i < textareas.length; i++) {
            var val = textareas[i].value || textareas[i].textContent || '';
            if (val.trim().length > 0) {
              return { prompt: val.trim(), source: 'textarea' };
            }
          }
          // Try placeholder
          var ta = document.querySelector('textarea[placeholder*="caption"]');
          if (ta) {
            return { prompt: ta.value || ta.textContent || '(empty)', source: 'caption-textarea' };
          }
          // Try spans/divs with prompt-like content
          var spans = document.querySelectorAll('span, p, div');
          for (var j = 0; j < spans.length; j++) {
            var text = spans[j].textContent || '';
            if (text.length > 50 && text.length < 2000) {
              return { prompt: text.trim(), source: 'text-element' };
            }
          }
          return { prompt: '(no prompt found)', source: 'none' };
        })()
      `);

      const genId = href.replace('/d/', '');
      console.log('=== ' + genId + ' ===');
      console.log('Prompt: ' + data.prompt);
      console.log('Source: ' + data.source);
      console.log('');

      results.push({ href, prompt: data.prompt });
    }

    console.log('\n\n========== SUMMARY ==========');
    for (const r of results) {
      const genId = r.href.replace('/d/', '');
      const preview = r.prompt.length > 120 ? r.prompt.substring(0, 120) + '...' : r.prompt;
      console.log(genId + ': ' + preview);
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
