/**
 * Find all instruction-probing videos in the library.
 * Scrolls to load all drafts, then visits each to get the full prompt.
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

    // Scroll down repeatedly to load all drafts
    let prevCount = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const count: number = await page.evaluate(`
        (function() {
          return document.querySelectorAll('a[href^="/d/"]').length;
        })()
      `);
      console.log('Scroll attempt ' + attempt + ': ' + count + ' drafts visible');
      if (count === prevCount && attempt > 2) break;
      prevCount = count;
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await page.waitForTimeout(1500);
    }

    // Get all draft links
    const hrefs: string[] = await page.evaluate(`
      (function() {
        var links = document.querySelectorAll('a[href^="/d/"]');
        var results = [];
        var seen = {};
        for (var i = 0; i < links.length; i++) {
          var h = links[i].getAttribute('href');
          if (!seen[h]) {
            seen[h] = true;
            results.push(h);
          }
        }
        return results;
      })()
    `);

    console.log('\nTotal unique drafts: ' + hrefs.length + '\n');

    // Visit each and extract prompt properly
    const results: Array<{ href: string; genId: string; prompt: string }> = [];

    for (let i = 0; i < hrefs.length; i++) {
      const href = hrefs[i];
      const genId = href.replace('/d/', '');
      process.stdout.write('[' + (i + 1) + '/' + hrefs.length + '] ' + genId + ' ... ');

      await page.goto('https://sora.com' + href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Extract prompt more carefully - avoid picking up UI text
      const prompt: string = await page.evaluate(`
        (function() {
          // Method 1: textarea with caption placeholder
          var textareas = document.querySelectorAll('textarea');
          for (var i = 0; i < textareas.length; i++) {
            var val = textareas[i].value || '';
            if (val.trim().length > 0) return val.trim();
            // Check textContent for React-rendered value
            var tc = textareas[i].textContent || '';
            if (tc.trim().length > 0) return tc.trim();
          }

          // Method 2: Look for the prompt in a specific container
          // On detail pages, the prompt often appears in a div near the video
          var allText = document.body.innerText || '';
          // The prompt appears between the username and "Extend" button
          var match = allText.match(/llmsherpa\\n([\\s\\S]*?)\\n(?:Extend|Post)/);
          if (match) return match[1].trim();

          // Method 3: Look for longer text blocks that aren't UI elements
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          var candidates = [];
          while (walker.nextNode()) {
            var text = walker.currentNode.textContent.trim();
            var parent = walker.currentNode.parentElement;
            if (!parent) continue;
            var tag = parent.tagName.toLowerCase();
            if (tag === 'button' || tag === 'script' || tag === 'style') continue;
            if (text.length > 20 && text.length < 2000) {
              // Skip obvious UI text
              if (/^(Extend|Post|Download|Delete|Copy|Select|Search|Settings|Create|Undo|Redo)$/.test(text)) continue;
              candidates.push(text);
            }
          }
          if (candidates.length > 0) return candidates[0];

          return '(no prompt found)';
        })()
      `);

      console.log(prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
      results.push({ href, genId, prompt });
    }

    // Show all results
    console.log('\n\n========== ALL PROMPTS ==========\n');
    for (const r of results) {
      console.log('--- ' + r.genId + ' ---');
      console.log(r.prompt);
      console.log('');
    }

    // Filter for instruction-related videos
    const instructionVideos = results.filter(r => {
      const p = r.prompt.toLowerCase();
      return p.includes('instruction') || p.includes('whiteboard') ||
             p.includes('rules') || p.includes('you are') ||
             p.includes('diversity') || p.includes('narrator') ||
             p.includes('verbatim') || p.includes('system prompt') ||
             p.includes('continue') || p.includes('cont');
    });

    console.log('\n========== INSTRUCTION-RELATED VIDEOS (' + instructionVideos.length + ') ==========\n');
    for (const r of instructionVideos) {
      console.log('--- ' + r.genId + ' ---');
      console.log(r.prompt);
      console.log('');
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
