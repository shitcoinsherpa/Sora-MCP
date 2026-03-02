/**
 * Trace the full instruction chain by visiting posts and following remix links.
 * Start from the sherpaiscool profile and find all related posts.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

async function getPostData(page: any, url: string): Promise<{
  prompt: string;
  remixLinks: string[];
  allLinks: string[];
  date: string;
}> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Click "more" if present
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
  await page.waitForTimeout(500);

  return page.evaluate(`
    (function() {
      var result = { prompt: '', remixLinks: [], allLinks: [], date: '' };

      // Get all text blocks
      var blocks = [];
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var text = walker.currentNode.textContent.trim();
        var parent = walker.currentNode.parentElement;
        if (!parent) continue;
        var tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'button' || tag === 'nav') continue;
        if (text.length > 10) blocks.push(text);
      }

      // Find the prompt (longest text that isn't UI)
      var uiTexts = ['Home', 'Explore', 'Search', 'Activity', 'Drafts', 'Profile', 'Settings',
                     'Remixes', 'No comments yet', 'Comments', 'sherpaiscool', 'llmsherpa'];
      var candidates = blocks.filter(function(t) {
        return !uiTexts.includes(t) && t.length > 15;
      });
      candidates.sort(function(a, b) { return b.length - a.length; });
      result.prompt = candidates.length > 0 ? candidates[0] : '(not found)';

      // Find date
      for (var i = 0; i < blocks.length; i++) {
        if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d+/.test(blocks[i])) {
          result.date = blocks[i];
          break;
        }
      }

      // Get all links on the page
      document.querySelectorAll('a').forEach(function(a) {
        var href = a.getAttribute('href') || '';
        if (href.startsWith('/p/')) {
          result.allLinks.push(href);
        }
      });

      // Look specifically for remix section links
      var inRemixes = false;
      var allElements = document.querySelectorAll('*');
      for (var j = 0; j < allElements.length; j++) {
        var el = allElements[j];
        var t = (el.textContent || '').trim();
        if (t === 'Remixes') inRemixes = true;
        if (inRemixes && el.tagName === 'A') {
          var h = el.getAttribute('href') || '';
          if (h.startsWith('/p/')) result.remixLinks.push(h);
        }
      }

      return result;
    })()
  `);
}

async function main() {
  const browser = new BrowserManager();
  const page = await browser.getPage();
  await ensureAuthenticated(page);

  // First, get ALL posts from sherpaiscool profile
  console.log('Loading sherpaiscool profile...');
  await page.goto('https://sora.chatgpt.com/profile/sherpaiscool', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Scroll to load all
  for (let i = 0; i < 30; i++) {
    await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await page.waitForTimeout(1500);
  }

  const profileLinks: string[] = await page.evaluate(`
    (function() {
      var results = [];
      var seen = {};
      document.querySelectorAll('a[href^="/p/"]').forEach(function(a) {
        var h = a.getAttribute('href');
        if (!seen[h]) { seen[h] = true; results.push(h); }
      });
      return results;
    })()
  `);
  console.log('Profile has ' + profileLinks.length + ' posts\n');

  // Visit each and get full data
  const visited = new Set<string>();
  const allPosts: Array<{ url: string; prompt: string; date: string; remixLinks: string[] }> = [];

  // Start with known chain URLs + all profile links
  const toVisit = [
    '/p/s_68dfc5890a208191a4f8d587e885381b',
    '/p/s_68dfc6871b488191bb2caafe6e599e47',
    '/p/s_68dfcd77fe548191b3295647b3e9e611',
    ...profileLinks,
  ];

  // BFS to follow remix links
  while (toVisit.length > 0) {
    const href = toVisit.shift()!;
    if (visited.has(href)) continue;
    visited.add(href);

    const fullUrl = 'https://sora.chatgpt.com' + href;
    process.stdout.write('[' + allPosts.length + '] ' + href + ' ... ');

    const data = await getPostData(page, fullUrl);
    console.log(data.prompt.substring(0, 120) + (data.prompt.length > 120 ? '...' : ''));

    allPosts.push({ url: href, prompt: data.prompt, date: data.date, remixLinks: data.remixLinks });

    // Add any new remix links to visit
    for (const link of data.remixLinks) {
      if (!visited.has(link)) {
        toVisit.push(link);
      }
    }
    // Also check allLinks for related posts
    for (const link of data.allLinks) {
      if (!visited.has(link)) {
        toVisit.push(link);
      }
    }
  }

  // Filter for instruction-related
  console.log('\n\n========================================');
  console.log('ALL POSTS FOUND (' + allPosts.length + ')');
  console.log('========================================\n');

  const instructionChain = allPosts.filter(p => {
    const pl = p.prompt.toLowerCase();
    return pl.includes('continue from') || pl.includes('whiteboard') ||
           pl.includes('rules') || pl.includes('you are') ||
           pl.includes('instruction') || pl.includes('diversity') ||
           pl.includes('verbatim') || pl.includes('starting with');
  });

  console.log('--- INSTRUCTION CHAIN (' + instructionChain.length + ') ---\n');
  for (const p of instructionChain) {
    console.log(p.date + ' | ' + p.url);
    console.log('  ' + p.prompt);
    console.log('');
  }

  console.log('\n--- ALL OTHER POSTS ---\n');
  for (const p of allPosts) {
    if (!instructionChain.includes(p)) {
      console.log(p.date + ' | ' + p.url);
      console.log('  ' + p.prompt);
      console.log('');
    }
  }

  console.log('\n(Browser left open)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
