import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { seedNoteFromList, type NoteDetail } from '../useNote';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

const THREAD_CONTEXT = {
  id: 'thread_1',
  title: 'Romans',
  color: null,
  backgroundGradient: '',
};

/** Minimal detail-cache entry as GET /api/notes/:id/details would leave it. */
function detailCacheEntry(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: 'note_1',
    title: 'Romans 8 study',
    content: '<p>The full body, much longer than the list preview.</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    isOwnNote: true,
    userId: 'user_author',
    authorUserId: 'user_author',
    spaceId: 'space_home',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    threads: [{ id: 'thread_1', title: 'Romans', color: null }],
    tags: [],
    linkedFromNotes: [],
    linkedToNotes: [],
    studyThreads: [],
    coEditEnabled: true,
    canEdit: true,
    contributors: [{ userId: 'user_author', displayName: 'Derek', color: 'purple' }],
    spaces: [
      { id: 'space_romans', title: 'Romans Group', coEditEnabled: true, spaceType: 'shared' },
    ],
    ...overrides,
  };
}

/** List payload shape — deliberately omits every shared/co-edit field. */
const LIST_NOTE = {
  id: 'note_1',
  title: 'Romans 8 study',
  content: '<p>The full body,…</p>',
  threadId: 'thread_1',
  spaceId: 'space_home',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

describe('seedNoteFromList', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    sessionStorage.clear();
  });

  it('preserves shared-space membership through a list refresh', () => {
    queryClient.setQueryData(['note', 'note_1'], detailCacheEntry());

    seedNoteFromList(queryClient, LIST_NOTE, THREAD_CONTEXT);

    const seeded = queryClient.getQueryData<NoteDetail>(['note', 'note_1']);
    expect(seeded?.spaces).toEqual([
      { id: 'space_romans', title: 'Romans Group', coEditEnabled: true, spaceType: 'shared' },
    ]);
  });

  it('preserves co-edit authority fields the list payload cannot carry', () => {
    queryClient.setQueryData(['note', 'note_1'], detailCacheEntry());

    seedNoteFromList(queryClient, LIST_NOTE, THREAD_CONTEXT);

    const seeded = queryClient.getQueryData<NoteDetail>(['note', 'note_1']);
    // The offline-queue bypass in useUpdateNote reads coEditEnabled off this cache;
    // losing it would silently re-enable offline queueing for a co-edited note.
    expect(seeded?.coEditEnabled).toBe(true);
    expect(seeded?.canEdit).toBe(true);
    expect(seeded?.contributors).toHaveLength(1);
    expect(seeded?.authorUserId).toBe('user_author');
  });

  it('leaves spaces undefined when detail has never loaded, so "unknown" stays distinct from "none"', () => {
    seedNoteFromList(queryClient, LIST_NOTE, THREAD_CONTEXT);

    const seeded = queryClient.getQueryData<NoteDetail>(['note', 'note_1']);
    // `undefined` means membership is unknown — callers must not treat it as an
    // empty audience, and must not close the note on a space switch.
    expect(seeded?.spaces).toBeUndefined();
  });

  it('keeps an empty association list as empty rather than resurrecting it', () => {
    queryClient.setQueryData(['note', 'note_1'], detailCacheEntry({ spaces: [] }));

    seedNoteFromList(queryClient, LIST_NOTE, THREAD_CONTEXT);

    expect(queryClient.getQueryData<NoteDetail>(['note', 'note_1'])?.spaces).toEqual([]);
  });

  it('still lets a list payload win where the list is authoritative', () => {
    queryClient.setQueryData(
      ['note', 'note_1'],
      detailCacheEntry({ updatedAt: '2026-07-02T00:00:00.000Z' })
    );

    seedNoteFromList(
      queryClient,
      { ...LIST_NOTE, updatedAt: '2026-07-09T00:00:00.000Z' },
      THREAD_CONTEXT
    );

    expect(queryClient.getQueryData<NoteDetail>(['note', 'note_1'])?.updatedAt).toBe(
      '2026-07-09T00:00:00.000Z'
    );
  });
});
