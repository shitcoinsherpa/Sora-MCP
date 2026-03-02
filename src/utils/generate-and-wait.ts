/**
 * Generate a video and wait for it to appear in drafts.
 *
 * Sora's generation flow:
 * 1. Enter prompt + settings on home/feed page → click Generate
 * 2. Toast: "Added to queue" — page stays on the feed
 * 3. Video appears in Drafts as a generating item
 * 4. Once done, the draft becomes a playable video at /d/gen_...
 *
 * Typical timing: ~30-90s for generation to complete.
 *
 * Strategy: wait 20s up front, navigate to drafts, find the new draft,
 * go to its detail page, then poll there every 15s until a playable video appears.
 * No page refreshes — just check the DOM for a video element with a real src.
 */
import type { Page } from 'playwright';
import { navigateTo } from '../pages/navigation.js';

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
  opts: { timeout: number; knownGenIds?: string[] },
): Promise<GenerateAndWaitResult> {
  const { timeout, knownGenIds = [] } = opts;
  const deadline = Date.now() + timeout;
  const knownSet = new Set(knownGenIds);

  // Phase 1: Wait for generation to start (toast appears, item enters queue).
  // Sora takes ~30-90s, so give it 20s before even checking drafts.
  await page.waitForTimeout(20000);

  // Phase 2: Navigate to drafts and find the new item.
  await navigateTo(page, 'drafts');
  await page.waitForTimeout(3000);

  let targetGenId = '';
  let targetHref = '';

  // Look for the new draft (may need a couple checks if queue is slow)
  for (let attempt = 0; attempt < 5 && Date.now() < deadline; attempt++) {
    const drafts: Array<{ href: string; genId: string }> = await page.evaluate(`
      (function() {
        var results = [];
        var links = document.querySelectorAll('a[href^="/d/"]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href') || '';
          results.push({ href: href, genId: href.replace('/d/', '') });
        }
        return results;
      })()
    `);

    const newDraft = drafts.find(d => !knownSet.has(d.genId));
    if (newDraft) {
      targetGenId = newDraft.genId;
      targetHref = newDraft.href;
      break;
    }

    // New draft hasn't appeared yet — wait and soft-reload
    await page.waitForTimeout(10000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  if (!targetGenId) {
    return {
      success: false,
      genId: '',
      detailUrl: '',
      message: 'New draft never appeared in library. Generation may have been rejected.',
    };
  }

  // Phase 3: Navigate to the detail page and wait for the video to become playable.
  await page.click(`a[href="${targetHref}"]`);
  await page.waitForTimeout(3000);

  while (Date.now() < deadline) {
    // Check for a playable video on this detail page
    const videoState: { hasVideo: boolean; hasError: boolean; errorText: string } = await page.evaluate(`
      (function() {
        var result = { hasVideo: false, hasError: false, errorText: '' };

        // Check for playable video
        var videos = document.querySelectorAll('video[src]');
        for (var i = 0; i < videos.length; i++) {
          var src = videos[i].getAttribute('src') || '';
          if (src.includes('blob:') || src.includes('azure') || src.includes('/raw') || src.includes('.mp4')) {
            result.hasVideo = true;
            break;
          }
        }

        // Check for errors
        var text = document.body.innerText || '';
        if (text.includes('unable to generate') || text.includes('content policy') ||
            text.includes('not allowed') || text.includes('violates')) {
          result.hasError = true;
          result.errorText = (text.match(/(unable to generate[^.]*\\.|content policy[^.]*\\.|not allowed[^.]*\\.|violates[^.]*\\.)/i) || [])[0] || 'Generation rejected';
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

    // Still generating — wait 15s then check again (no page reload needed,
    // Sora's SPA updates the DOM when the video is ready)
    await page.waitForTimeout(15000);
  }

  return {
    success: false,
    genId: targetGenId,
    detailUrl: page.url(),
    message: `Timeout waiting for ${targetGenId} to finish generating`,
  };
}

/**
 * Get the current list of draft gen IDs (to know what's "known" before generating).
 */
export async function getKnownDraftIds(page: Page): Promise<string[]> {
  await navigateTo(page, 'drafts');
  await page.waitForTimeout(2000);

  return page.evaluate(`
    (function() {
      var results = [];
      var links = document.querySelectorAll('a[href^="/d/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        results.push(href.replace('/d/', ''));
      }
      return results;
    })()
  `);
}
