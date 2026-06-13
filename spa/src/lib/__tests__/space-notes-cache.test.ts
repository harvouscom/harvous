import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import {
  prependSpaceNoteToCache,
  removeSpaceNoteFromCache,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../space-notes-cache';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

const SPACE = 'space_home';

function note(id: string): SpaceNoteRow {
  return { id, title: `Note ${id}`, content: '<p>hi</p>', isPinned: false };
}

function seededClient(total: number, notes: SpaceNoteRow[]): QueryClient {
  const qc = new QueryClient();
  const page: InfiniteData<SpaceNotesPage, number> = {
    pages: [{ notes, hasMore: false, offset: 0, limit: 20, total }],
    pageParams: [0],
  };
  qc.setQueryData(spaceNotesQueryKey(SPACE), page);
  return qc;
}

describe('space-notes-cache total', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('removeSpaceNoteFromCache decrements pages[0].total', () => {
    const qc = seededClient(3, [note('a'), note('b'), note('c')]);
    removeSpaceNoteFromCache(qc, SPACE, 'b');

    const data = qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(spaceNotesQueryKey(SPACE));
    expect(data?.pages[0]?.total).toBe(2);
    expect(data?.pages[0]?.notes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('removeSpaceNoteFromCache is a no-op on total when note is not in cache', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    removeSpaceNoteFromCache(qc, SPACE, 'missing');

    const data = qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(spaceNotesQueryKey(SPACE));
    expect(data?.pages[0]?.total).toBe(2);
    expect(data?.pages[0]?.notes).toHaveLength(2);
  });

  it('prependSpaceNoteToCache increments total for a new note', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    prependSpaceNoteToCache(qc, SPACE, note('c'));

    const data = qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(spaceNotesQueryKey(SPACE));
    expect(data?.pages[0]?.total).toBe(3);
    expect(data?.pages[0]?.notes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('prependSpaceNoteToCache does not increment total when replacing same id', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    prependSpaceNoteToCache(qc, SPACE, { ...note('a'), title: 'Updated' });

    const data = qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(spaceNotesQueryKey(SPACE));
    expect(data?.pages[0]?.total).toBe(2);
    expect(data?.pages[0]?.notes).toHaveLength(2);
  });

  it('removeSpaceNoteFromCache decrements sessionStorage total', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    sessionStorage.setItem(
      `${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${SPACE}`,
      JSON.stringify({ notes: [note('a'), note('b')], hasMore: false, offset: 0, limit: 20, total: 2 }),
    );

    removeSpaceNoteFromCache(qc, SPACE, 'a');

    const stored = JSON.parse(sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${SPACE}`)!) as SpaceNotesPage;
    expect(stored.total).toBe(1);
    expect(stored.notes.map((n) => n.id)).toEqual(['b']);
  });
});
