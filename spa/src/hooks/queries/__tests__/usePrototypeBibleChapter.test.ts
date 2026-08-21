import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Guards where a chapter's text is allowed to come from.
 *
 * Two rules, and they are easy to get backwards. Disk wins when it has the chapter, because a
 * reader holding the translation should never wait on a round trip to see it. The server wins
 * when disk does not, including when the server's answer is that the chapter does not exist —
 * a 404 there is information, not a blip, and must not be retried into a spinner.
 *
 * Worth testing rather than commenting because both halves are invisible until someone is
 * offline or on a bad connection, which is exactly when nobody can report it.
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

describe('a chapter that is already on disk', () => {
  it('is served without asking the server at all', async () => {
    await expect(run()).resolves.toMatchObject({
      book: 'Nahum',
      chapter: 2,
      verses: [{ number: 1, text: 'Nineveh' }],
    });
    // The point of the change: not merely that the right text arrives, but that no request
    // was made to get it. A round trip here is what put "Loading Nahum 2…" on screen for
    // text that was already local.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('is served even when the server is failing', async () => {
    for (const status of [500, 502, 503]) {
      apiGet.mockReset();
      apiGet.mockRejectedValue(err(status));
      await expect(run()).resolves.toMatchObject({ verses: [{ number: 1, text: 'Nineveh' }] });
    }
  });

  it('derives prev/next from the canon, having never asked', async () => {
    // Nahum has 3 chapters, so 2 has neighbours on both sides with no server to ask.
    await expect(run()).resolves.toMatchObject({
      chapterCount: 3,
      hasPrevChapter: true,
      hasNextChapter: true,
    });
  });
});

describe('a chapter that is not on disk', () => {
  beforeEach(() => {
    packed.clear();
  });

  it('comes from the server', async () => {
    apiGet.mockResolvedValue({
      book: 'Nahum',
      chapter: 2,
      translation: 'NLT',
      chapterCount: 3,
      hasPrevChapter: true,
      hasNextChapter: true,
      verses: [{ number: 1, text: 'From the wire' }],
    });
    await expect(run()).resolves.toMatchObject({ verses: [{ number: 1, text: 'From the wire' }] });
    expect(apiGet).toHaveBeenCalledOnce();
  });

  it('surfaces the server saying the chapter does not exist', async () => {
    // With nothing stored there is no stale copy to hide the gap behind, and an honest empty
    // state is the right answer. This is the only situation the rule can arise in now: a
    // packed chapter cannot be one the translation lacks, because the pack was written from
    // this same endpoint's book payload.
    for (const status of [400, 401, 403, 404]) {
      apiGet.mockReset();
      apiGet.mockRejectedValue(err(status));
      await expect(run()).rejects.toThrow();
    }
  });

  it('rethrows when the server is down', async () => {
    apiGet.mockRejectedValue(err(502));
    await expect(run()).rejects.toThrow();
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
