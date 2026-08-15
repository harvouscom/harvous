import { describe, expect, it } from 'vitest';
import {
  applyOptimisticReaderHighlight,
  OPTIMISTIC_ID_PREFIX,
  type CreateReaderHighlightInput,
} from '../useCreateReaderHighlight';
import type { ReaderChapterResponse } from '../../queries/useReaderChapter';

function chapter(overrides: Partial<ReaderChapterResponse> = {}): ReaderChapterResponse {
  return {
    success: true,
    book: 'John',
    chapter: 3,
    chapterCount: 21,
    translation: 'NET',
    verses: [
      { verse: 16, text: 'For God so loved the world' },
      { verse: 17, text: 'For God did not send his Son to condemn' },
      { verse: 18, text: 'The one who believes in him is not condemned' },
    ],
    study: {},
    counts: { notes: 0, highlights: 0 },
    ...overrides,
  };
}

const input = (over: Partial<CreateReaderHighlightInput> = {}): CreateReaderHighlightInput => ({
  book: 'John',
  chapter: 3,
  verseStart: 16,
  translation: 'NET',
  accent: 'warmAmber',
  ...over,
});

describe('applyOptimisticReaderHighlight', () => {
  it('paints the single verse that was tapped', () => {
    const next = applyOptimisticReaderHighlight(chapter(), input());

    expect(Object.keys(next.study)).toEqual(['16']);
    expect(next.study['16'].highlights).toHaveLength(1);
    expect(next.study['16'].highlights[0].id).toBe(`${OPTIMISTIC_ID_PREFIX}16`);
    expect(next.study['16'].highlights[0].accent).toBe('warmAmber');
    expect(next.study['16'].highlights[0].reference).toBe('John 3:16');
  });

  it('paints every verse of a range', () => {
    const next = applyOptimisticReaderHighlight(chapter(), input({ verseEnd: 18 }));

    expect(Object.keys(next.study).sort()).toEqual(['16', '17', '18']);
    expect(next.study['18'].highlights[0].reference).toBe('John 3:16-18');
  });

  it('treats a range ending where it starts as one verse', () => {
    const next = applyOptimisticReaderHighlight(chapter(), input({ verseEnd: 16 }));

    expect(Object.keys(next.study)).toEqual(['16']);
    expect(next.study['16'].highlights[0].reference).toBe('John 3:16');
  });

  it('ignores a verseEnd that runs backwards rather than painting nothing', () => {
    const next = applyOptimisticReaderHighlight(chapter(), input({ verseStart: 18, verseEnd: 16 }));

    expect(Object.keys(next.study)).toEqual(['18']);
  });

  it('keeps study already on the verse', () => {
    const previous = chapter({
      study: {
        '16': {
          notes: [{ noteId: 'note_1', title: 'Grace', reference: 'John 3:16' }],
          highlights: [
            {
              id: 'study_existing',
              parentNoteId: 'note_1',
              parentNoteTitle: 'Grace',
              accent: 'skyBlue',
              entryKind: 'scriptureLink',
              reference: 'John 3:16',
              excerpt: null,
            },
          ],
        },
      },
      counts: { notes: 1, highlights: 1 },
    });

    const next = applyOptimisticReaderHighlight(previous, input());

    expect(next.study['16'].notes).toHaveLength(1);
    expect(next.study['16'].highlights).toHaveLength(2);
    expect(next.study['16'].highlights[0].id).toBe('study_existing');
    expect(next.counts.highlights).toBe(2);
  });

  it('does not mutate the cached chapter it was handed', () => {
    // React Query hands back the live cache object; mutating it would defeat the rollback.
    const previous = chapter();
    const snapshot = JSON.stringify(previous);

    applyOptimisticReaderHighlight(previous, input({ verseEnd: 18 }));

    expect(JSON.stringify(previous)).toBe(snapshot);
  });

  it('leaves the verse text and chapter identity alone', () => {
    const next = applyOptimisticReaderHighlight(chapter(), input());

    expect(next.verses).toHaveLength(3);
    expect(next.book).toBe('John');
    expect(next.chapter).toBe(3);
    expect(next.translation).toBe('NET');
  });
});
