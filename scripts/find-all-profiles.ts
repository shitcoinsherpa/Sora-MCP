/**
 * Check both profiles AND drafts for instruction-probing / purple-team videos.
 * Click into each post to get full (non-truncated) prompts.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

async function extractFullPrompt(page: any): Promise<string> {
  // Try clicking "more" / "… more" to expand
  await page.evaluate(`
    (function() {
      var els = document.querySelectorAll('button, span, a');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').trim();
        if (t === 'more' || t === '… more' || t === '...more' || t === 'show more' || t === '… more') {
          els[i].click();
          break;
        }
      }
    })()
  `);
  await page.waitForTimeout(500);

  return page.evaluate(`
    (function() {
      // textarea first
      var textareas = document.querySelectorAll('textarea');
      for (var i = 0; i < textareas.length; i++) {
        var val = textareas[i].value || textareas[i].textContent || '';
        if (val.trim().length > 5) return val.trim();
      }

      // Walk text nodes, collect all meaningful text
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var uiWords = /^(Explore|Library|Search|Home|Create|Settings|Extend|Post|Download|Share|Like|Comment|Follow|Sign|Log|Profile|Edit|Cancel|Save|Delete|Report|Block|Mute|Copy|Open|Close|Back|Next|Previous|Undo|Redo|Select|Attach|Storyboard|Create video|sora|more|less|\\d+|\\d+ views?|\\d+ likes?)$/i;
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
      if (candidates.length > 0) {
        candidates.sort(function(a, b) { return b.length - a.length; });
        return candidates[0];
      }
      return '(no prompt found)';
    })()
  `);
}

async function collectProfileLinks(page: any, url: string): Promise<string[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Scroll to load all
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
      if (stableRounds >= 3) break;
    } else {
      stableRounds = 0;
    }
    prevCount = count;
    if (i % 5 === 0) console.log('  scroll ' + i + ': ' + count + ' videos');
  }

  return page.evaluate(`
    (function() {
      var results = [];
      var seen = {};
      document.querySelectorAll('a[href^="/p/"], a[href^="/d/"]').forEach(function(a) {
        var h = a.getAttribute('href');
        if (!seen[h]) { seen[h] = true; results.push(h); }
      });
      return results;
    })()
  `);
}

async function main() {
  const browser = new BrowserManager();
  const page = await browser.getPage();
  await ensureAuthenticated(page);

  const allResults: Array<{ source: string; href: string; prompt: string }> = [];

  // 1. Check main profile
  console.log('=== Profile: /profile ===');
  const profile1Links = await collectProfileLinks(page, 'https://sora.chatgpt.com/profile');
  console.log('Found ' + profile1Links.length + ' videos\n');

  for (let i = 0; i < profile1Links.length; i++) {
    process.stdout.write('[' + (i + 1) + '/' + profile1Links.length + '] ');
    await page.goto('https://sora.chatgpt.com' + profile1Links[i], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const prompt = await extractFullPrompt(page);
    console.log(profile1Links[i] + ': ' + prompt.substring(0, 150) + (prompt.length > 150 ? '...' : ''));
    allResults.push({ source: 'profile-main', href: profile1Links[i], prompt });
  }

  // 2. Check sherpaiscool profile
  console.log('\n=== Profile: /profile/sherpaiscool ===');
  const profile2Links = await collectProfileLinks(page, 'https://sora.chatgpt.com/profile/sherpaiscool');
  console.log('Found ' + profile2Links.length + ' videos\n');

  for (let i = 0; i < profile2Links.length; i++) {
    process.stdout.write('[' + (i + 1) + '/' + profile2Links.length + '] ');
    await page.goto('https://sora.chatgpt.com' + profile2Links[i], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const prompt = await extractFullPrompt(page);
    console.log(profile2Links[i] + ': ' + prompt.substring(0, 150) + (prompt.length > 150 ? '...' : ''));
    allResults.push({ source: 'profile-sherpaiscool', href: profile2Links[i], prompt });
  }

  // 3. Check drafts library
  console.log('\n=== Drafts Library ===');
  const draftLinks = await collectProfileLinks(page, 'https://sora.chatgpt.com/library');
  console.log('Found ' + draftLinks.length + ' drafts\n');

  for (let i = 0; i < draftLinks.length; i++) {
    process.stdout.write('[' + (i + 1) + '/' + draftLinks.length + '] ');
    await page.goto('https://sora.chatgpt.com' + draftLinks[i], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const prompt = await extractFullPrompt(page);
    console.log(draftLinks[i] + ': ' + prompt.substring(0, 150) + (prompt.length > 150 ? '...' : ''));
    allResults.push({ source: 'drafts', href: draftLinks[i], prompt });
  }

  // Categorize
  console.log('\n\n========================================');
  console.log('CATEGORIZED RESULTS');
  console.log('========================================\n');

  const categories = {
    instruction_probing: [] as typeof allResults,
    ip_purple_team: [] as typeof allResults,
    real_persons: [] as typeof allResults,
    creative: [] as typeof allResults,
    other: [] as typeof allResults,
  };

  for (const r of allResults) {
    const pl = r.prompt.toLowerCase();
    if (pl.includes('whiteboard') || pl.includes('rules') || pl.includes('you are') ||
        pl.includes('instruction') || pl.includes('diversity') || pl.includes('verbatim') ||
        pl.includes('system') || (pl.includes('write') && pl.includes('starting'))) {
      categories.instruction_probing.push(r);
    } else if (pl.includes('bob\'s burgers') || pl.includes('bobs burgers') ||
               pl.includes('yo gabba') || pl.includes('freddy krueger') ||
               pl.includes('jason voorhees') || pl.includes('brobie') ||
               pl.includes('tv show') || pl.includes('deleted scene')) {
      categories.ip_purple_team.push(r);
    } else if (pl.includes('@sama') || pl.includes('sam altman') ||
               pl.includes('boston accent') || pl.includes('true crime')) {
      categories.real_persons.push(r);
    } else if (pl.includes('lyrics') || pl.includes('visual experience') ||
               pl.includes('cinematic') || pl.includes('balloon')) {
      categories.creative.push(r);
    } else {
      categories.other.push(r);
    }
  }

  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    console.log('--- ' + cat.toUpperCase() + ' (' + items.length + ') ---');
    for (const r of items) {
      console.log('  [' + r.source + '] ' + r.href);
      console.log('  Prompt: ' + r.prompt);
      console.log('');
    }
  }

  console.log('\nTotal videos found: ' + allResults.length);
  console.log('(Browser left open)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
