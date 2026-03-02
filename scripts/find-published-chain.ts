/**
 * Deep-scroll the user's profile at sora.chatgpt.com/profile to find ALL published videos,
 * then visit each to extract prompts. Looking for the whiteboard/instruction chain.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

async function main() {
  const browser = new BrowserManager();

  const page = await browser.getPage();
  await ensureAuthenticated(page);

  // Go to profile page
  console.log('Navigating to profile...');
  await page.goto('https://sora.chatgpt.com/profile/sherpaiscool', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Deep scroll to load ALL published videos
  console.log('Deep scrolling to load all published videos...');
  let prevCount = 0;
  let stableRounds = 0;
  for (let i = 0; i < 60; i++) {
    await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await page.waitForTimeout(2000);
    const count: number = await page.evaluate(`
      (function() {
        var seen = {};
        document.querySelectorAll('a[href^="/p/"], a[href^="/d/"]').forEach(function(a) {
          seen[a.getAttribute('href')] = true;
        });
        return Object.keys(seen).length;
      })()
    `);
    if (count === prevCount) {
      stableRounds++;
      if (stableRounds >= 4) {
        console.log('Scroll ' + i + ': ' + count + ' videos (stable, done)');
        break;
      }
    } else {
      stableRounds = 0;
    }
    prevCount = count;
    if (i % 3 === 0) console.log('Scroll ' + i + ': ' + count + ' videos loaded');
  }

  // Collect all unique video links
  const videoLinks: string[] = await page.evaluate(`
    (function() {
      var results = [];
      var seen = {};
      document.querySelectorAll('a[href^="/p/"], a[href^="/d/"]').forEach(function(a) {
        var h = a.getAttribute('href');
        if (!seen[h]) {
          seen[h] = true;
          results.push(h);
        }
      });
      return results;
    })()
  `);

  console.log('\nTotal published videos found: ' + videoLinks.length);

  // Visit each and extract prompt
  const results: Array<{ href: string; prompt: string; relevant: boolean }> = [];

  for (let i = 0; i < videoLinks.length; i++) {
    const href = videoLinks[i];
    process.stdout.write('[' + (i + 1) + '/' + videoLinks.length + '] ');

    await page.goto('https://sora.chatgpt.com' + href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Try to click "more" to expand truncated prompt
    await page.evaluate(`
      (function() {
        var links = document.querySelectorAll('button, span, a');
        for (var i = 0; i < links.length; i++) {
          var t = (links[i].textContent || '').trim().toLowerCase();
          if (t === 'more' || t === '… more' || t === '...more' || t === 'show more') {
            links[i].click();
            break;
          }
        }
      })()
    `);
    await page.waitForTimeout(500);

    const prompt: string = await page.evaluate(`
      (function() {
        // Method 1: textarea
        var textareas = document.querySelectorAll('textarea');
        for (var i = 0; i < textareas.length; i++) {
          var val = textareas[i].value || textareas[i].textContent || '';
          if (val.trim().length > 5) return val.trim();
        }

        // Method 2: Walk text nodes looking for prompt-like content
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        var uiWords = /^(Explore|Library|Search|Home|Create|Settings|Extend|Post|Download|Share|Like|Comment|Follow|Sign|Log|Profile|Edit|Cancel|Save|Delete|Report|Block|Mute|Copy|Open|Close|Back|Next|Previous|Undo|Redo|Select|Attach|Storyboard|Create video|llmsherpa|sherpaiscool|sora|more|less|\\.\\.\\.)$/i;
        var candidates = [];
        while (walker.nextNode()) {
          var text = walker.currentNode.textContent.trim();
          var parent = walker.currentNode.parentElement;
          if (!parent) continue;
          var tag = parent.tagName.toLowerCase();
          if (tag === 'button' || tag === 'script' || tag === 'style' || tag === 'nav') continue;
          if (text.length > 15 && text.length < 5000 && !uiWords.test(text)) {
            candidates.push(text);
          }
        }
        // Return the longest candidate (likely the prompt)
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b.length - a.length; });
          return candidates[0];
        }

        return '(no prompt found)';
      })()
    `);

    const pl = prompt.toLowerCase();
    const isRelevant = pl.includes('whiteboard') || pl.includes('rules') ||
                       pl.includes('you are') || pl.includes('instruction') ||
                       pl.includes('diversity') || pl.includes('narrator') ||
                       pl.includes('verbatim') || pl.includes('system') ||
                       (pl.includes('write') && pl.includes('starting')) ||
                       pl.includes('continue where');

    const marker = isRelevant ? ' <<< MATCH' : '';
    const preview = prompt.substring(0, 150) + (prompt.length > 150 ? '...' : '');
    console.log(href + ': ' + preview + marker);

    results.push({ href, prompt, relevant: isRelevant });
  }

  // Summary of matches
  const matches = results.filter(r => r.relevant);
  console.log('\n\n========== INSTRUCTION-RELATED MATCHES (' + matches.length + '/' + results.length + ') ==========\n');
  for (const m of matches) {
    console.log('--- ' + m.href + ' ---');
    console.log(m.prompt);
    console.log('');
  }

  // Also print ALL prompts for completeness
  console.log('\n========== ALL PROMPTS ==========\n');
  for (const r of results) {
    console.log('--- ' + r.href + (r.relevant ? ' [MATCH]' : '') + ' ---');
    console.log(r.prompt);
    console.log('');
  }

  console.log('\n(Browser left open)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
