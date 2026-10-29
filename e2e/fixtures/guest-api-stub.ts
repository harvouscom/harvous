import type { Page } from '@playwright/test';

/**
 * Answers `/api/*` in the browser so the WebKit guest specs need no API server and no database.
 *
 * Guest mode keeps notes on the device, so almost nothing a guest does needs the API. The two
 * exceptions that matter for these specs are stubbed here:
 * - `/api/health` — otherwise the dev-only "API unreachable" banner covers the toolbar.
 * - `/api/scripture/chapter` — the reader's only content; without it the page stays on
 *   "Loading Genesis 1…". The text is KJV (public domain), in the endpoint's response shape
 *   (`BibleChapterResponse`, spa/src/hooks/queries/usePrototypeBibleChapter.ts).
 *
 * Every other call gets a 503, so a spec can never reach another worktree's API by accident.
 */
const GENESIS_1_KJV = [
  'In the beginning God created the heaven and the earth.',
  'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
  'And God said, Let there be light: and there was light.',
  'And God saw the light, that it was good: and God divided the light from the darkness.',
  'And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day.',
  'And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters.',
  'And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so.',
  'And God called the firmament Heaven. And the evening and the morning were the second day.',
];

export async function stubGuestApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (url.pathname === '/api/scripture/chapter') {
      const book = url.searchParams.get('book') ?? 'Genesis';
      const chapter = Number(url.searchParams.get('chapter') ?? 1);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          book,
          chapter,
          translation: url.searchParams.get('translation') ?? 'KJV',
          chapterCount: 50,
          hasPrevChapter: chapter > 1,
          hasNextChapter: true,
          verses: GENESIS_1_KJV.map((text, i) => ({ number: i + 1, text })),
        }),
      });
    }
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"stubbed: no API in the WebKit guest harness"}',
    });
  });
}
