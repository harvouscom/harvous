/**
 * Reader verse stickers against a real Postgres. Same guard as the notebook move test: runs only
 * with MOVE_TEST_DATABASE_URL pointing at a local, disposable database with the schema pushed,
 * and refuses any other host.
 */
import { describe, expect, it, vi } from 'vitest';

const LOCAL = vi.hoisted(() => {
  const url = process.env.MOVE_TEST_DATABASE_URL;
  const local = Boolean(url && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url));
  if (local) {
    process.env.SUPABASE_DATABASE_URL = url;
    process.env.SUPABASE_DIRECT_URL = url;
  }
  return local;
});

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { VerseStickers } from '../../db/schema';
import { listChapterStickers, setVerseSticker, verseStickerInput, VerseStickersUnavailableError } from '../verse-stickers';

const run = LOCAL ? describe : describe.skip;
const RUN = Date.now().toString(36);
let seq = 0;
const user = () => `user_stickers_${RUN}_${++seq}`;

run('reader verse stickers', () => {
  it('sticks one on, replaces it, and takes it off, one per verse', async () => {
    const me = user();
    await setVerseSticker(me, { book: 'Psalms', chapter: 23, verse: 1, sticker: 'star' });
    await setVerseSticker(me, { book: 'Psalms', chapter: 23, verse: 4, sticker: 'anchor' });
    await setVerseSticker(me, { book: 'Psalms', chapter: 23, verse: 1, sticker: 'dove' });
    expect(await listChapterStickers(me, 'Psalms', 23)).toEqual([{ verse: 1, sticker: 'dove' }, { verse: 4, sticker: 'anchor' }]);
    expect(await db.select().from(VerseStickers).where(eq(VerseStickers.userId, me))).toHaveLength(2);

    await setVerseSticker(me, { book: 'Psalms', chapter: 23, verse: 1, sticker: null });
    expect(await listChapterStickers(me, 'Psalms', 23)).toEqual([{ verse: 4, sticker: 'anchor' }]);
  });

  it('is owner-scoped: nobody else sees or changes your stickers', async () => {
    const me = user();
    const them = user();
    await setVerseSticker(me, { book: 'John', chapter: 3, verse: 16, sticker: 'heart' });
    expect(await listChapterStickers(them, 'John', 3)).toEqual([]);
    await setVerseSticker(them, { book: 'John', chapter: 3, verse: 16, sticker: null });
    expect(await listChapterStickers(me, 'John', 3)).toEqual([{ verse: 16, sticker: 'heart' }]);
  });

  it('does not draw a sticker retired from the set', async () => {
    const me = user();
    const now = new Date();
    await db.insert(VerseStickers).values({ userId: me, book: 'Mark', chapter: 1, verse: 1, sticker: 'retired-thing', createdAt: now, updatedAt: now });
    expect(await listChapterStickers(me, 'Mark', 1)).toEqual([]);
  });

  it('reads none, and refuses to save, before the table exists', async () => {
    const me = user();
    await db.execute(sql`ALTER TABLE "VerseStickers" RENAME TO "VerseStickers_hidden"`);
    try {
      expect(await listChapterStickers(me, 'Psalms', 23)).toEqual([]);
      await expect(setVerseSticker(me, { book: 'Psalms', chapter: 23, verse: 1, sticker: 'star' }))
        .rejects.toBeInstanceOf(VerseStickersUnavailableError);
    } finally {
      await db.execute(sql`ALTER TABLE "VerseStickers_hidden" RENAME TO "VerseStickers"`);
    }
  });
});

describe('verse sticker input', () => {
  it('takes a known sticker on a real verse, or null to take it off', () => {
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 119, verse: 176, sticker: 'star' }).success).toBe(true);
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 23, verse: 1, sticker: null }).success).toBe(true);
  });
  it('refuses the initial, unknown stickers, unknown chapters and extra fields', () => {
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 23, verse: 1, sticker: 'initial' }).success).toBe(false);
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 23, verse: 1, sticker: 'skull' }).success).toBe(false);
    expect(verseStickerInput.safeParse({ book: 'Jude', chapter: 2, verse: 1, sticker: 'star' }).success).toBe(false);
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 23, verse: 177, sticker: 'star' }).success).toBe(false);
    expect(verseStickerInput.safeParse({ book: 'Psalms', chapter: 23, verse: 1, sticker: 'star', userId: 'x' }).success).toBe(false);
  });
});
