import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Guards the rule that decides whether a failed chapter request may be answered from the
 * offline pack. It is worth a test rather than a comment because the two halves look alike
 * from the call site — both are thrown errors — and getting the line wrong is invisible until
 * someone is offline, which is exactly when nobody can report it.
 */

const packed = new Map<string, { number: number; text: string }[]>();

vi.mock('@/utils/bible-pack-store', () => ({
  readPackedChapter: async (translation: string, book: string, chapter: number) =>
    packed.get(`${translation}:${book}:${chapter}`) ?? null,
  readPackedBook: async () => null,
  writePackedBook: async () => true,
}));

const apiGet = vi.fn();
vi.mock('../../../lib/api', () => ({ api: { get: (...args: unknown[]) => apiGet(...args) } }));

const { bibleChapterQueryOptions } = await import('../usePrototypeBibleChapter');

function err(status?: number) {
  return Object.assign(new Error(status ? `HTTP ${status}` : 'Failed to fetch'), { status });
}

function run() {
  return (bibleChapterQueryOptions('Nahum', 2, 'NLT').queryFn as () => Promise<unknown>)();
}

beforeEach(() => {
  packed.clear();
  apiGet.mockReset();
  packed.set('NLT:Nahum:2', [{ number: 1, text: 'Nineveh' }]);
});

describe('chapter fetch falling back to the offline pack', () => {
  it('serves the pack when the server cannot answer', async () => {
    // 5xx is not an answer about this chapter — it is the server saying it has none.
    for (const status of [500, 502, 503]) {
      apiGet.mockReset();
      apiGet.mockRejectedValue(err(status));
      await expect(run()).resolves.toMatchObject({
        book: 'Nahum',
        chapter: 2,
        verses: [{ number: 1, text: 'Nineveh' }],
      });
    }
  });

  it('serves the pack when there was no response at all', async () => {
    apiGet.mockRejectedValue(err(undefined));
    await expect(run()).resolves.toMatchObject({ verses: [{ number: 1, text: 'Nineveh' }] });
  });

  it('does NOT serve the pack when the server answered about the chapter', async () => {
    // A 404 means this translation genuinely lacks it. Answering from a stale pack would hide
    // a real gap behind old text, which is worse than an honest empty state.
    for (const status of [400, 401, 403, 404]) {
      apiGet.mockReset();
      apiGet.mockRejectedValue(err(status));
      await expect(run()).rejects.toThrow();
    }
  });

  it('rethrows when the server is down and nothing is stored', async () => {
    packed.clear();
    apiGet.mockRejectedValue(err(502));
    await expect(run()).rejects.toThrow();
  });

  it('derives prev/next from the canon when answering offline', async () => {
    apiGet.mockRejectedValue(err(502));
    // Nahum has 3 chapters, so 2 has neighbours on both sides even with no server to ask.
    await expect(run()).resolves.toMatchObject({
      chapterCount: 3,
      hasPrevChapter: true,
      hasNextChapter: true,
    });
  });
});

describe('retry policy', () => {
  const retry = bibleChapterQueryOptions('Nahum', 2, 'NLT').retry as (
    n: number,
    e: unknown,
  ) => boolean;

  it('does not retry an answer', () => {
    expect(retry(0, err(404))).toBe(false);
    expect(retry(0, err(400))).toBe(false);
  });

  it('retries a transient failure, but not forever', () => {
    expect(retry(0, err(502))).toBe(true);
    expect(retry(1, err(502))).toBe(true);
    expect(retry(2, err(502))).toBe(false);
  });
});
