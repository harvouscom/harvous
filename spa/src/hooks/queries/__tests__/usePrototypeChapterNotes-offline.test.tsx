import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { offlineDB } from '@/utils/offline-db';
import { saveScriptureIndexLocal } from '@/utils/offline-scripture-index';

/**
 * The reader's margin bars have to survive a plane. Online they come from
 * `/api/scripture/chapter-notes`; here the network is unavailable, and the bars must come
 * from the scripture index the app already mirrors into IndexedDB — and must NOT come from
 * it once the live answer exists.
 */

vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ userId: 'user-1' }) }));
vi.mock('../../useAuthReady', () => ({ useAuthReady: () => true }));

const ROMANS = 44;
const mirroredIndex = [
  {
    bookOrder: ROMANS,
    title: 'Romans',
    referenceCount: 1,
    noteCount: 1,
    passages: [
      {
        passageKey: '44:8:1:11',
        displayRef: 'Romans 8:1-11',
        bookOrder: ROMANS,
        chapter: 8,
        verseStart: 1,
        verseEnd: 11,
        referenceCount: 1,
        noteCount: 1,
        notes: [{ id: 'note_offline', title: 'No Condemnation', updatedAt: '2026-08-14T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' }],
      },
    ],
  },
];

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('usePrototypeChapterNotes offline', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await offlineDB.scriptureIndexCache.clear();
    await saveScriptureIndexLocal('user-1', 'space_1', mirroredIndex);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('draws the bars from the mirrored index when the network is unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const { usePrototypeChapterNotes } = await import('../usePrototypeChapterNotes');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePrototypeChapterNotes('Romans', 8, 'space_1'), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual([
      expect.objectContaining({ noteId: 'note_offline', reference: 'Romans 8:1-11', verse: 1, verseEnd: 11 }),
    ]);
  });

  it('prefers the live answer once it lands, even when the mirror disagrees', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          anchors: [
            { noteId: 'note_live', reference: 'Romans 8:28', verse: 28, verseEnd: null, chapterEnd: null, title: 'Live', updatedAt: null },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const { usePrototypeChapterNotes } = await import('../usePrototypeChapterNotes');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePrototypeChapterNotes('Romans', 8, 'space_1'), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((a) => a.noteId)).toEqual(['note_live']);
  });

  it('has nothing to fall back to without a space to look the mirror up by', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const { usePrototypeChapterNotes } = await import('../usePrototypeChapterNotes');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePrototypeChapterNotes('Romans', 8), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });
});
