import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Dexie is stubbed rather than run against a fake IndexedDB: what is worth testing here is the
 * pack bookkeeping — how many translations may be kept, what resumes, what a failing book does
 * to the rest — and none of that is a property of the storage engine.
 */
const store = new Map<string, any>();

vi.mock('../offline-db', () => ({
  offlineDB: {
    biblePacks: {
      get: async ([translationId, book]: [string, string]) =>
        store.get(`${translationId}:${book}`) ?? undefined,
      put: async (row: any) => {
        store.set(`${row.translationId}:${row.book}`, row);
      },
      toArray: async () => [...store.values()],
      where: () => ({
        equals: (translationId: string) => ({
          delete: async () => {
            for (const key of [...store.keys()]) {
              if (key.startsWith(`${translationId}:`)) store.delete(key);
            }
          },
        }),
      }),
    },
  },
}));

const {
  MAX_OFFLINE_TRANSLATIONS,
  canAddPack,
  downloadPack,
  listPacks,
  readPackedChapter,
  removePack,
} = await import('../bible-pack-store');
const { orderedCanonBooks } = await import('../bible-book-chapters');

const BOOK_COUNT = orderedCanonBooks().length;

function payloadFor(book: string, translation = 'NLT') {
  return {
    book,
    translation,
    version: `${translation}:100`,
    chapters: [{ chapter: 1, verses: [{ number: 1, text: `${book} 1:1` }] }],
  };
}

beforeEach(() => {
  store.clear();
});

describe('downloadPack', () => {
  it('saves every book of the canon and reports progress', async () => {
    const progress: number[] = [];
    const result = await downloadPack('NLT', async (book) => payloadFor(book), {
      onProgress: (p) => progress.push(p.booksSaved),
    });

    expect(result).toEqual({ booksSaved: BOOK_COUNT, booksTotal: BOOK_COUNT, aborted: false });
    expect(progress).toHaveLength(BOOK_COUNT);
    expect(progress.at(-1)).toBe(BOOK_COUNT);
  });

  it('resumes rather than restarting', async () => {
    const controller = new AbortController();
    let fetched = 0;
    await downloadPack(
      'NLT',
      async (book) => {
        fetched += 1;
        if (fetched === 5) controller.abort();
        return payloadFor(book);
      },
      { signal: controller.signal },
    );

    const refetched: string[] = [];
    await downloadPack('NLT', async (book) => {
      refetched.push(book);
      return payloadFor(book);
    });

    // The first five are already stored, so the resumed run never asks for them again.
    expect(refetched).not.toContain('Genesis');
    expect(refetched).toContain('Revelation');
  });

  it('keeps the rest of the pack when one book fails', async () => {
    const result = await downloadPack('NLT', async (book) => {
      if (book === 'Obadiah') throw new Error('network');
      return payloadFor(book);
    });

    expect(result.booksSaved).toBe(BOOK_COUNT - 1);
    expect(await readPackedChapter('NLT', 'Obadiah', 1)).toBeNull();
    expect(await readPackedChapter('NLT', 'Genesis', 1)).toEqual([
      { number: 1, text: 'Genesis 1:1' },
    ]);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await downloadPack('NLT', async (book) => payloadFor(book), {
      signal: controller.signal,
    });
    expect(result).toMatchObject({ booksSaved: 0, aborted: true });
  });
});

describe('listPacks', () => {
  it('reports a partial pack as incomplete', async () => {
    await downloadPack('NLT', async (book) => {
      if (book !== 'Genesis') throw new Error('stop');
      return payloadFor(book);
    });

    const packs = await listPacks();
    expect(packs).toEqual([
      { translationId: 'NLT', booksSaved: 1, booksTotal: BOOK_COUNT, complete: false, savedAt: expect.any(Number) },
    ]);
  });

  it('groups by translation', async () => {
    await downloadPack('NLT', async (book) => (book === 'Genesis' ? payloadFor(book, 'NLT') : Promise.reject(new Error('x'))));
    await downloadPack('KJV', async (book) => (book === 'Genesis' ? payloadFor(book, 'KJV') : Promise.reject(new Error('x'))));

    expect((await listPacks()).map((p) => p.translationId)).toEqual(['KJV', 'NLT']);
  });
});

describe('removePack', () => {
  it('removes only the named translation', async () => {
    await downloadPack('NLT', async (book) => (book === 'Genesis' ? payloadFor(book, 'NLT') : Promise.reject(new Error('x'))));
    await downloadPack('KJV', async (book) => (book === 'Genesis' ? payloadFor(book, 'KJV') : Promise.reject(new Error('x'))));

    await removePack('NLT');

    expect((await listPacks()).map((p) => p.translationId)).toEqual(['KJV']);
    expect(await readPackedChapter('KJV', 'Genesis', 1)).not.toBeNull();
  });
});

describe('canAddPack', () => {
  const pack = (translationId: string) => ({
    translationId,
    booksSaved: BOOK_COUNT,
    booksTotal: BOOK_COUNT,
    complete: true,
    savedAt: 0,
  });

  it('allows up to the limit', () => {
    expect(canAddPack([], 'NLT')).toBe(true);
    expect(canAddPack([pack('KJV'), pack('ESV')], 'NLT')).toBe(true);
  });

  it('refuses a fourth translation', () => {
    const full = [pack('KJV'), pack('ESV'), pack('NIV')];
    expect(full).toHaveLength(MAX_OFFLINE_TRANSLATIONS);
    expect(canAddPack(full, 'NLT')).toBe(false);
  });

  it('still allows one already stored, so a partial pack can be resumed at the limit', () => {
    expect(canAddPack([pack('KJV'), pack('ESV'), pack('NIV')], 'ESV')).toBe(true);
  });
});
