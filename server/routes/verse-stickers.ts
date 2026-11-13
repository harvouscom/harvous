/**
 * Verse stickers in the Harvous Bible reader. Owner-scoped: every read and write is the signed-in
 * account's own rows, and nothing else ever sees them. See server/utils/verse-stickers.ts for why
 * they are their own table rather than a kind of highlight.
 *
 * GET /api/scripture/stickers?book=&chapter=  — a chapter's stickers, in any translation
 * PUT /api/scripture/stickers                  — { book, chapter, verse, sticker | null }
 */
import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import {
  chapterStickersQuery,
  listChapterStickers,
  setVerseSticker,
  verseStickerInput,
  VerseStickerLimitError,
  VerseStickersUnavailableError,
} from '../utils/verse-stickers';

const route = new Hono();

route.get('/api/scripture/stickers', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const query = chapterStickersQuery.safeParse({
      book: c.req.query('book') ?? '',
      chapter: Number.parseInt(c.req.query('chapter') ?? '', 10),
    });
    if (!query.success) return c.json({ error: 'book and chapter query params are required' }, 400);
    const stickers = await listChapterStickers(auth.userId, query.data.book, query.data.chapter);
    // Same override as /api/scripture/highlights: sticking one on and coming back to this chapter
    // hits this same URL, and app.ts's blanket 30s private cache would show the old page.
    return c.json({ success: true, stickers }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/scripture/stickers', action: 'list_verse_stickers' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

route.put('/api/scripture/stickers', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const input = verseStickerInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'A book, chapter, verse and sticker are required.' }, 400);
    const saved = await setVerseSticker(auth.userId, input.data);
    return c.json({ success: true, ...saved });
  } catch (error: any) {
    if (error instanceof VerseStickerLimitError) return c.json({ error: error.message }, 409);
    if (error instanceof VerseStickersUnavailableError) return c.json({ error: error.message }, 503);
    const e = handleAPIError(error, { endpoint: '/api/scripture/stickers', action: 'set_verse_sticker' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default route;
