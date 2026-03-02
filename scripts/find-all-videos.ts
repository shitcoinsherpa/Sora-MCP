/**
 * Find ALL videos - drafts, posted, and any other sections.
 * Look for the whiteboard/instruction chain videos.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

async function main() {
  const browser = new BrowserManager();

  try {
    const page = await browser.getPage();
    await ensureAuthenticated(page);

    // Go to library root
    await page.goto('https://sora.com/library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check what sections/tabs exist on the library page
    const pageInfo: any = await page.evaluate(`
      (function() {
        var buttons = [];
        document.querySelectorAll('button').forEach(function(b) {
          buttons.push(b.textContent.trim());
        });
        var tabs = [];
        document.querySelectorAll('[role="tab"], [role="tablist"] *').forEach(function(t) {
          tabs.push(t.textContent.trim());
        });
        var links = [];
        document.querySelectorAll('a').forEach(function(a) {
          var href = a.getAttribute('href') || '';
          var text = a.textContent.trim().substring(0, 100);
          if (href.includes('library') || href.includes('draft') || href.includes('post') || href.includes('published')) {
            links.push({ href: href, text: text });
          }
        });
        var navItems = [];
        document.querySelectorAll('nav a, [role="navigation"] a, aside a').forEach(function(a) {
          navItems.push({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 60) });
        });
        return { buttons: buttons, tabs: tabs, links: links, navItems: navItems };
      })()
    `);

    console.log('Buttons:', JSON.stringify(pageInfo.buttons));
    console.log('Tabs:', JSON.stringify(pageInfo.tabs));
    console.log('Library-related links:', JSON.stringify(pageInfo.links));
    console.log('Nav items:', JSON.stringify(pageInfo.navItems));

    // Now try the main feed/home which might have "Featured" or "Recent"
    // Also check if there are filter buttons like "All", "Drafts", "Posted"
    const filters: string[] = await page.evaluate(`
      (function() {
        var results = [];
        // Look for anything that looks like a filter/tab
        document.querySelectorAll('button, [role="tab"]').forEach(function(el) {
          var t = el.textContent.trim();
          if (t && t.length < 30) results.push(t);
        });
        return results;
      })()
    `);
    console.log('\nAll short button/tab texts:', JSON.stringify(filters));

    // Scroll the entire page and collect ALL video links (not just /d/)
    console.log('\n--- Scrolling to find all video links ---');
    for (let i = 0; i < 15; i++) {
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await page.waitForTimeout(1500);
    }

    const allVideoLinks: any[] = await page.evaluate(`
      (function() {
        var results = [];
        var seen = {};
        document.querySelectorAll('a[href^="/d/"], a[href^="/p/"]').forEach(function(a) {
          var h = a.getAttribute('href');
          if (!seen[h]) {
            seen[h] = true;
            results.push(h);
          }
        });
        return results;
      })()
    `);

    console.log('Total unique video links after scroll: ' + allVideoLinks.length);
    console.log('Links:', JSON.stringify(allVideoLinks));

    // Now visit the whiteboard videos we found earlier
    const whiteboard_ids = [
      'gen_01kbpct677fjmvs0v660d1gw85',
      'gen_01kbpcrp45fpe8tanfzzyfxpqe',
      'gen_01kbpcj327fz4rd6dr03a6kywr',
      'gen_01kbpchj5ef7j9g0dtgxncs4bw',
      'gen_01kbpc7xj7esf94me81zrqpnc2',
    ];

    console.log('\n--- Checking whiteboard videos directly ---');
    for (const genId of whiteboard_ids) {
      await page.goto('https://sora.com/d/' + genId, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const prompt: string = await page.evaluate(`
        (function() {
          var textareas = document.querySelectorAll('textarea');
          for (var i = 0; i < textareas.length; i++) {
            var val = textareas[i].value || '';
            if (val.trim().length > 0) return val.trim();
          }
          // Look for text after username
          var allText = document.body.innerText || '';
          var match = allText.match(/llmsherpa\\n([\\s\\S]*?)\\n(?:Extend|Post)/);
          if (match) return match[1].trim();
          return '(not found)';
        })()
      `);
      console.log('\n' + genId + ':');
      console.log(prompt);
    }

    // Try to find the full chain - look at the user's profile or search
    console.log('\n--- Checking profile page ---');
    await page.goto('https://sora.com/@llmsherpa', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Scroll profile
    for (let i = 0; i < 20; i++) {
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await page.waitForTimeout(1500);
      const count: number = await page.evaluate(`document.querySelectorAll('a[href^="/p/"], a[href^="/d/"]').length`);
      console.log('Profile scroll ' + i + ': ' + count + ' links');
      if (i > 3) {
        const prevCount: number = await page.evaluate(`document.querySelectorAll('a[href^="/p/"], a[href^="/d/"]').length`);
        if (count === prevCount) break;
      }
    }

    const profileLinks: string[] = await page.evaluate(`
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

    console.log('\nProfile video links: ' + profileLinks.length);

    // Visit each profile link and get prompt
    for (let i = 0; i < profileLinks.length; i++) {
      const href = profileLinks[i];
      process.stdout.write('[' + (i + 1) + '/' + profileLinks.length + '] ' + href + ' ... ');
      await page.goto('https://sora.com' + href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const prompt: string = await page.evaluate(`
        (function() {
          var textareas = document.querySelectorAll('textarea');
          for (var i = 0; i < textareas.length; i++) {
            var val = textareas[i].value || '';
            if (val.trim().length > 0) return val.trim();
          }
          // On post pages, prompt might be displayed differently
          var allText = document.body.innerText || '';
          // Try to find the prompt text - it's usually after the username
          var lines = allText.split('\\n').filter(function(l) { return l.trim().length > 0; });
          for (var j = 0; j < lines.length; j++) {
            var line = lines[j].trim();
            if (line.length > 30 && line.length < 3000 &&
                !line.match(/^(Explore|Library|Search|Home|Create|Settings|Extend|Post|Download|llmsherpa)$/)) {
              return line;
            }
          }
          return '(not found)';
        })()
      `);

      const isRelevant = prompt.toLowerCase().includes('whiteboard') ||
                         prompt.toLowerCase().includes('rules') ||
                         prompt.toLowerCase().includes('you are') ||
                         prompt.toLowerCase().includes('instruction') ||
                         prompt.toLowerCase().includes('diversity') ||
                         prompt.toLowerCase().includes('narrator') ||
                         prompt.toLowerCase().includes('continue') ||
                         prompt.toLowerCase().includes('verbatim');

      const marker = isRelevant ? ' *** MATCH ***' : '';
      console.log(prompt.substring(0, 120) + (prompt.length > 120 ? '...' : '') + marker);
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
