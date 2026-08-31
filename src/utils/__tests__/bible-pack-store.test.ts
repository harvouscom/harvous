import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Dexie is stubbed rather than run against a fake IndexedDB: what is worth testing here is the
 * pack bookkeeping — how many translations may be kept, what resumes, what a failing book does
 * to the rest — and none of that is a property of the storage engine.
 */
const store = new Map<string, any>();
/* Which translations the reader asked to keep — the fact that separates a pack from books
   that happen to be cached. Keyed by translation, like the real table. */
const requests = new Map<string, any>();

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
    biblePackRequests: {
      put: async (row: any) => {
        requests.set(row.translationId, row);
      },
      bulkPut: async (rows: any[]) => {
        for (const row of rows) requests.set(row.translationId, row);
      },
      delete: async (translationId: string) => {
        requests.delete(translationId);
      },
      toArray: async () => [...requests.values()],
    },
  },
}));

const {
  MAX_OFFLINE_TRANSLATIONS,
  canAddPack,
  downloadPack,
  listPacks,
  readPackedChapter,
  packStorageBytes,
  removePack,
  writePackedBook,
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
  requests.clear();
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
  /*
   * The bug this table exists for.
   *
   * Reading one chapter caches the book it belongs to, so comparing a verse across versions
   * used to create a pack per version — each shown as "Part-saved · 1 of 66" with a button
   * offering to finish a download nobody started, and between them they spent the
   * three-translation limit before the reader had asked for anything.
   */
  it('does not turn incidentally cached books into packs', async () => {
    await writePackedBook(payloadFor('Genesis', 'ESV'));
    await writePackedBook(payloadFor('Romans', 'NET'));

    expect(await listPacks()).toEqual([]);
    /* Still readable offline — the cache is not what changed. */
    expect(await readPackedChapter('ESV', 'Genesis', 1)).not.toBeNull();
  });

  it('counts cached books toward a translation once it is asked for', async () => {
    await writePackedBook(payloadFor('Genesis', 'NLT'));
    await downloadPack('NLT', async (book) =>
      book === 'Exodus' ? payloadFor(book, 'NLT') : Promise.reject(new Error('x')),
    );

    const [pack] = await listPacks();
    expect(pack).toMatchObject({ translationId: 'NLT', booksSaved: 2, complete: false });
  });

  /*
   * Someone who downloaded translations before the request table existed must not open the
   * page and find them gone. Sixty-six books do not accumulate by reading, so a complete pack
   * is unambiguous evidence of intent; a partial one is not, and is left as cache that one
   * press re-adopts and resumes.
   */
  it('adopts pre-existing complete packs the first time it reads an empty request table', async () => {
    for (const book of orderedCanonBooks()) await writePackedBook(payloadFor(book, 'KJV'));
    await writePackedBook(payloadFor('Genesis', 'ESV'));
    requests.clear();

    expect((await listPacks()).map((p) => p.translationId)).toEqual(['KJV']);
  });

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

describe('packStorageBytes', () => {
  it('is zero with nothing stored, and grows with what is', async () => {
    expect(await packStorageBytes()).toBe(0);

    await writePackedBook(payloadFor('Genesis'));
    const one = await packStorageBytes();
    expect(one).toBeGreaterThan(0);

    await writePackedBook(payloadFor('Exodus'));
    expect(await packStorageBytes()).toBeGreaterThan(one);
  });

  /* Counts every book, not every pack: the incidentally cached ones take up room too, and a
     figure the reader is meant to weigh against their own device has to include them. */
  it('counts cached books that belong to no pack', async () => {
    await writePackedBook(payloadFor('Genesis', 'ESV'));

    expect(await listPacks()).toEqual([]);
    expect(await packStorageBytes()).toBeGreaterThan(0);
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
