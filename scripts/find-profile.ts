/**
 * Find the user's profile link and navigate to their published videos.
 */
import { BrowserManager } from '../src/browser/manager.js';
import { ensureAuthenticated } from '../src/browser/session.js';

async function main() {
  const browser = new BrowserManager();

  const page = await browser.getPage();
  await ensureAuthenticated(page);

  // Go to sora.com home
  await page.goto('https://sora.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Look for profile link, avatar, or user menu
  const profileInfo: any = await page.evaluate(`
    (function() {
      var results = { links: [], buttons: [], avatars: [], allHrefs: [] };

      // Find any link with @ or profile
      document.querySelectorAll('a').forEach(function(a) {
        var href = a.getAttribute('href') || '';
        var text = a.textContent.trim();
        if (href.includes('@') || href.includes('profile') || href.includes('user') || href.includes('account')) {
          results.links.push({ href: href, text: text.substring(0, 60) });
        }
        // Collect all hrefs for analysis
        if (href.startsWith('/')) {
          results.allHrefs.push(href);
        }
      });

      // Look for user avatar/menu
      document.querySelectorAll('img[alt*="avatar"], img[alt*="profile"], [class*="avatar"], [class*="profile"]').forEach(function(el) {
        results.avatars.push({
          tag: el.tagName,
          alt: el.getAttribute('alt') || '',
          class: el.className.substring(0, 60)
        });
      });

      // Look for sidebar/nav items
      document.querySelectorAll('nav a, aside a').forEach(function(a) {
        var href = a.getAttribute('href') || '';
        var text = a.textContent.trim();
        results.buttons.push({ href: href, text: text.substring(0, 40) });
      });

      return results;
    })()
  `);

  console.log('Profile links:', JSON.stringify(profileInfo.links, null, 2));
  console.log('Nav items:', JSON.stringify(profileInfo.buttons, null, 2));
  console.log('Avatars:', JSON.stringify(profileInfo.avatars, null, 2));

  // Get all unique hrefs for analysis
  const uniqueHrefs = [...new Set(profileInfo.allHrefs as string[])].sort();
  console.log('\nAll unique internal hrefs:');
  for (const h of uniqueHrefs) {
    console.log('  ' + h);
  }

  // Try clicking on profile/avatar area
  // Look for menu or settings that might reveal username
  const userInfo: string = await page.evaluate(`
    (function() {
      // Check localStorage or cookies for user info
      var keys = Object.keys(localStorage);
      var userKeys = keys.filter(function(k) {
        return k.toLowerCase().includes('user') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('session');
      });
      var results = {};
      userKeys.forEach(function(k) {
        try {
          var val = localStorage.getItem(k);
          if (val && val.length < 500) results[k] = val;
        } catch(e) {}
      });
      return JSON.stringify(results, null, 2);
    })()
  `);
  console.log('\nUser-related localStorage:', userInfo);

  console.log('\n(Browser left open)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
