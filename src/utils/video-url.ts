/**
 * Extract video URLs directly from Sora's DOM and download via Azure SAS URLs.
 * The video detail page (/d/gen_...) renders <video src="..."> elements with
 * full Azure Blob SAS URLs that are self-contained (no cookies needed).
 */
import type { Page } from 'playwright';
import { get } from 'https';
import { createWriteStream } from 'fs';

export interface VideoUrlInfo {
  genId: string;
  videoUrl: string | null;
  promptText: string | null;
}

/**
 * Extract full video SAS URL from a video detail page.
 * Must already be on a /d/gen_... page.
 */
export async function extractVideoUrl(page: Page): Promise<VideoUrlInfo> {
  const url = page.url();
  const genIdMatch = url.match(/\/d\/(gen_[^/?]+)/);
  const genId = genIdMatch ? genIdMatch[1] : '';

  const data: { videoUrl: string | null; promptText: string | null } = await page.evaluate(`
    (function() {
      var videos = document.querySelectorAll('video[src]');
      var videoUrl = null;
      for (var i = 0; i < videos.length; i++) {
        var src = videos[i].getAttribute('src') || '';
        // Full SAS URLs contain %2Fraw or /raw and query params
        if (src.includes('%2Fraw') || (src.includes('/raw') && src.includes('?'))) {
          videoUrl = src;
          break;
        }
      }
      // Fallback: just get the last video src (detail page main player)
      if (!videoUrl && videos.length > 0) {
        videoUrl = videos[videos.length - 1].getAttribute('src');
      }

      // Extract prompt text
      var ta = document.querySelector('textarea[placeholder="Add caption..."]');
      var promptText = ta ? (ta.value || ta.textContent) : null;

      return { videoUrl: videoUrl, promptText: promptText };
    })()
  `);

  return { genId, ...data };
}

/**
 * Extract video URLs from the drafts grid (truncated, for identification only).
 */
export async function extractDraftVideoUrls(page: Page): Promise<Array<{
  genId: string;
  href: string;
  previewUrl: string | null;
}>> {
  return page.evaluate(`
    (function() {
      var results = [];
      var links = document.querySelectorAll('a[href^="/d/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        var genId = href.replace('/d/', '');
        var video = links[i].querySelector('video');
        var previewUrl = video ? video.getAttribute('src') : null;
        results.push({ genId: genId, href: href, previewUrl: previewUrl });
      }
      return results;
    })()
  `);
}

/**
 * Download a video directly from its SAS URL (no browser/cookies needed).
 */
export function downloadFromUrl(videoUrl: string, destPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    get(videoUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirect = response.headers.location;
        if (redirect) {
          file.close();
          return downloadFromUrl(redirect, destPath).then(resolve).catch(reject);
        }
      }
      if (response.statusCode && response.statusCode >= 400) {
        file.close();
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Set up response interception to capture API calls during navigation.
 * Returns captured JSON responses from Sora's backend.
 */
export async function interceptApiResponses(
  page: Page,
  navigateTo: string,
): Promise<Array<{ url: string; status: number; body: unknown }>> {
  const captured: Array<{ url: string; status: number; body: unknown }> = [];

  const handler = async (response: import('playwright').Response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json') && !url.includes('analytics') && !url.includes('telemetry')) {
      try {
        const body = await response.json();
        captured.push({ url, status: response.status(), body });
      } catch { /* ignore binary/non-json */ }
    }
  };

  page.on('response', handler);
  try {
    await page.goto(navigateTo, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  } finally {
    page.off('response', handler);
  }

  return captured;
}
