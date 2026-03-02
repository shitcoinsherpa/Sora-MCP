/**
 * Generate a video and wait for it to appear in drafts.
 *
 * Sora's generation flow:
 * 1. Enter prompt + settings → click Generate
 * 2. Toast: "Added to queue" — page stays on current page
 * 3. Video appears in Drafts grid (may show a spinner while generating)
 * 4. Once done, the draft becomes a playable video at /d/gen_...
 *
 * Typical timing: ~30-90s for generation to complete.
 *
 * Strategy:
 * - Snapshot existing draft IDs immediately after generation starts
 * - Wait 30s for generation to process
 * - Poll drafts for a new entry not in the snapshot
 * - Click into the new draft and wait for the video to be playable
 */
import type { Page } from 'playwright';
import { SELECTORS, clickElement } from '../pages/selectors.js';

/**
 * Navigate to the Drafts page via sidebar click (not URL — Sora's SPA
 * doesn't have a reliable /library route).
 */
async function goToDrafts(page: Page): Promise<void> {
  // First, close any open dialog/modal by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await clickElement(page, SELECTORS.navigation.sidebar.drafts, 5000);
  await page.waitForTimeout(3000);
}

/** Extract draft links from the current page DOM. */
async function getDraftsFromPage(page: Page): Promise<Array<{ href: string; genId: string }>> {
  return page.evaluate(`
    (function() {
      var results = [];
      var seen = {};
      var links = document.querySelectorAll('a[href^="/d/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        var genId = href.replace('/d/', '');
        if (!seen[genId]) {
          seen[genId] = true;
          results.push({ href: href, genId: genId });
        }
      }
      return results;
    })()
  `);
}

/** Extract just the gen IDs from the current page. */
async function getDraftIdsFromPage(page: Page): Promise<string[]> {
  const drafts = await getDraftsFromPage(page);
  return drafts.map(d => d.genId);
}

export interface GenerateAndWaitResult {
  success: boolean;
  genId: string;
  detailUrl: string;
  message: string;
}

/**
 * After generation has been submitted (configureAndGenerate already called),
 * navigate to drafts and wait for the newest video to finish generating.
 */
export async function waitForNewDraft(
  page: Page,
  opts: { timeout: number },
): Promise<GenerateAndWaitResult> {
  const { timeout } = opts;
  const deadline = Date.now() + timeout;

  // Phase 1: Immediately snapshot existing drafts BEFORE the generation completes.
  // This captures what's already there so we can detect the new one.
  await goToDrafts(page);
  const existingIds = new Set(await getDraftIdsFromPage(page));

  // Phase 2: Wait for generation to process.
  // Sora takes ~30-90s total. Wait 30s, then start checking.
  await page.waitForTimeout(30000);

  // Phase 3: Poll drafts for a NEW entry not in the existing set.
  let targetGenId = '';

  for (let attempt = 0; attempt < 10 && Date.now() < deadline; attempt++) {
    // Re-navigate to refresh the drafts list
    await goToDrafts(page);

    const drafts = await getDraftsFromPage(page);

    // Find a draft that wasn't in our initial snapshot
    const newDraft = drafts.find(d => !existingIds.has(d.genId));
    if (newDraft) {
      targetGenId = newDraft.genId;
      break;
    }

    // Not found yet — wait 15s and try again
    await page.waitForTimeout(15000);
  }

  if (!targetGenId) {
    return {
      success: false,
      genId: '',
      detailUrl: '',
      message: 'No new drafts found. Generation may have been rejected or is still processing.',
    };
  }

  // Phase 4: Navigate to the detail page and wait for a playable video.
  const linkSelector = `a[href="/d/${targetGenId}"]`;
  await page.click(linkSelector);
  await page.waitForTimeout(3000);

  while (Date.now() < deadline) {
    const videoState: { hasVideo: boolean; hasError: boolean; errorText: string } = await page.evaluate(`
      (function() {
        var result = { hasVideo: false, hasError: false, errorText: '' };

        // Check for any video element (src or source child)
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
          var src = videos[i].getAttribute('src') || '';
          if (src) { result.hasVideo = true; break; }
          var sources = videos[i].querySelectorAll('source[src]');
          if (sources.length > 0) { result.hasVideo = true; break; }
        }

        // Also check for Extend/Post buttons — these only appear on completed videos
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var txt = (buttons[i].textContent || '').trim();
          if (txt === 'Extend' || txt === 'Post') {
            result.hasVideo = true;
            break;
          }
        }

        // Only check for errors in specific error containers, not the entire page
        var errorEls = document.querySelectorAll('[role="alert"], [class*="error"], [class*="Error"], [class*="toast"]');
        for (var i = 0; i < errorEls.length; i++) {
          var elText = errorEls[i].innerText || '';
          if (elText.includes('unable to generate') || elText.includes('content policy') || elText.includes('violates')) {
            result.hasError = true;
            result.errorText = elText.substring(0, 200);
            break;
          }
        }

        return result;
      })()
    `);

    if (videoState.hasVideo) {
      return {
        success: true,
        genId: targetGenId,
        detailUrl: page.url(),
        message: `Video ready: ${targetGenId}`,
      };
    }

    if (videoState.hasError) {
      return {
        success: false,
        genId: targetGenId,
        detailUrl: page.url(),
        message: `Generation failed: ${videoState.errorText}`,
      };
    }

    // Still generating — wait 15s, no reload needed on detail page.
    await page.waitForTimeout(15000);
  }

  return {
    success: false,
    genId: targetGenId,
    detailUrl: page.url(),
    message: `Timeout waiting for ${targetGenId} to finish generating`,
  };
}
