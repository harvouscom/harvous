import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateReadingSurfaces,
  patchReadingHistoryLastRead,
  readingHistoryQueryKey,
  type ReadingHistoryResponse,
} from '../useReadingHistory';

function history(overrides: Partial<ReadingHistoryResponse> = {}): ReadingHistoryResponse {
  return {
    success: true,
    lastRead: {
      book: 'John',
      bookOrder: 42,
      chapter: 1,
      translation: 'ESV',
      readAt: '2026-09-15T10:00:00.000Z',
    },
    chapters: [
      {
        book: 'John',
        bookOrder: 42,
        chapter: 1,
        dwellBucket: 'read',
        createdAt: '2026-09-15T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('patchReadingHistoryLastRead', () => {
  it('moves lastRead to the chapter just opened and keeps existing chapters', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(readingHistoryQueryKey, history());

    patchReadingHistoryLastRead(queryClient, {
      book: 'John',
      bookOrder: 42,
      chapter: 4,
      translation: 'ESV',
      verse: 11,
      readAt: '2026-09-15T10:12:00.000Z',
    });

    const next = queryClient.getQueryData<ReadingHistoryResponse>(readingHistoryQueryKey);
    expect(next?.lastRead).toMatchObject({ book: 'John', chapter: 4, verse: 11 });
    expect(next?.chapters).toHaveLength(1);
    expect(next?.chapters[0]?.chapter).toBe(1);
  });

  it('seeds a cache when Home has not loaded history yet', () => {
    const queryClient = new QueryClient();
    patchReadingHistoryLastRead(queryClient, {
      book: 'Romans',
      bookOrder: 44,
      chapter: 8,
      translation: 'NIV',
      readAt: '2026-09-15T10:12:00.000Z',
    });

    const next = queryClient.getQueryData<ReadingHistoryResponse>(readingHistoryQueryKey);
    expect(next?.lastRead?.book).toBe('Romans');
    expect(next?.chapters).toEqual([]);
  });
});

describe('invalidateReadingSurfaces', () => {
  it('marks reading history and the study feed stale', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(readingHistoryQueryKey, history());
    queryClient.setQueryData(['study-feed', 'all'], { items: [] });

    invalidateReadingSurfaces(queryClient);

    const readingState = queryClient.getQueryState(readingHistoryQueryKey);
    const feedState = queryClient.getQueryState(['study-feed', 'all']);
    expect(readingState?.isInvalidated).toBe(true);
    expect(feedState?.isInvalidated).toBe(true);
  });
});
