import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import {
  findSpaceNoteRowInCache,
  prependSpaceNoteToCache,
  removeSpaceNoteFromCache,
  restoreSpaceNotesCaches,
  snapshotSpaceNotesCaches,
  spaceNoteRowFromCopy,
  spaceNotesQueryKey,
  updateSpaceNoteInCache,
  type SpaceNotesPage,
} from '../space-notes-cache';
import type { NoteDetail } from '../../hooks/queries/useNote';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

const SPACE = 'space_home';

function note(id: string): SpaceNoteRow {
  return { id, title: `Note ${id}`, content: '<p>hi</p>', isPinned: false };
}

/**
 * The key `useSpaceNotes` actually registers. It appends `unseenSince ?? ''` to
 * spaceNotesQueryKey(), so the real cache entry has SIX elements, not five.
 *
 * Seeding through `spaceNotesQueryKey()` — as this suite used to — made every test
 * pass trivially: it wrote and read the same (nonexistent-in-production) key, so a
 * mismatch between the helper and the hook was invisible. Always seed with these.
 */
function liveQueryKey(spaceId: string, unseenSince = '') {
  return [...spaceNotesQueryKey(spaceId), unseenSince] as const;
}

function page(total: number, notes: SpaceNoteRow[]): InfiniteData<SpaceNotesPage, number> {
  return {
    pages: [{ notes, hasMore: false, offset: 0, limit: 20, total }],
    pageParams: [0],
  };
}

function seededClient(total: number, notes: SpaceNoteRow[]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(liveQueryKey(SPACE), page(total, notes));
  return qc;
}

/** Two live variants of the same space list — what you get with a shared-space unseenSince. */
function seededClientWithVariants(total: number, notes: SpaceNoteRow[]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(liveQueryKey(SPACE), page(total, notes));
  qc.setQueryData(liveQueryKey(SPACE, '2026-01-01T00:00:00.000Z'), page(total, notes));
  return qc;
}

function readLive(qc: QueryClient, unseenSince = '') {
  return qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(liveQueryKey(SPACE, unseenSince));
}

describe('space-notes-cache total', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('removeSpaceNoteFromCache decrements pages[0].total', () => {
    const qc = seededClient(3, [note('a'), note('b'), note('c')]);
    removeSpaceNoteFromCache(qc, SPACE, 'b');

    const data = readLive(qc);
    expect(data?.pages[0]?.total).toBe(2);
    expect(data?.pages[0]?.notes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('removeSpaceNoteFromCache is a no-op on total when note is not in cache', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    removeSpaceNoteFromCache(qc, SPACE, 'missing');

    const data = readLive(qc);
    expect(data?.pages[0]?.total).toBe(2);
    expect(data?.pages[0]?.notes).toHaveLength(2);
  });

  it('prependSpaceNoteToCache increments total for a new note', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    prependSpaceNoteToCache(qc, SPACE, note('c'));

    const data = readLive(qc);
    expect(data?.pages[0]?.total).toBe(3);
    expect(data?.pages[0]?.notes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('prependSpaceNoteToCache does not increment total when replacing same id', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    prependSpaceNoteToCache(qc, SPACE, { ...note('a'), title: 'Updated' });

    const data = readLive(qc);
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

  it('prependSpaceNoteToCache seeds sessionStorage when snapshot is missing', () => {
    const qc = new QueryClient();
    const copied = note('copied');
    prependSpaceNoteToCache(qc, 'space_shared_1', copied);

    const stored = JSON.parse(
      sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}space_shared_1`)!,
    ) as SpaceNotesPage;
    expect(stored.notes.map((n) => n.id)).toEqual(['copied']);
    expect(stored.total).toBe(1);
  });
});

describe('space-notes-cache key variants', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('patches every registered variant of the space notes list', () => {
    // useSpaceNotes appends `unseenSince` to the key, so one space can have several
    // live cache entries. An exact-key write reaches none of them.
    const qc = seededClientWithVariants(3, [note('a'), note('b'), note('c')]);
    removeSpaceNoteFromCache(qc, SPACE, 'b');

    expect(readLive(qc)?.pages[0]?.notes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(readLive(qc, '2026-01-01T00:00:00.000Z')?.pages[0]?.notes.map((n) => n.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('decrements total once per variant, not once per total variants', () => {
    const qc = seededClientWithVariants(3, [note('a'), note('b'), note('c')]);
    removeSpaceNoteFromCache(qc, SPACE, 'b');

    expect(readLive(qc)?.pages[0]?.total).toBe(2);
    expect(readLive(qc, '2026-01-01T00:00:00.000Z')?.pages[0]?.total).toBe(2);
  });

  it('decrements the sessionStorage total exactly once when two variants match', () => {
    const qc = seededClientWithVariants(3, [note('a'), note('b'), note('c')]);
    sessionStorage.setItem(
      `${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${SPACE}`,
      JSON.stringify({
        notes: [note('a'), note('b'), note('c')],
        hasMore: false,
        offset: 0,
        limit: 20,
        total: 3,
      }),
    );

    removeSpaceNoteFromCache(qc, SPACE, 'b');

    const stored = JSON.parse(
      sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${SPACE}`)!,
    ) as SpaceNotesPage;
    // Two matching variants must not double-decrement the single stored snapshot.
    expect(stored.total).toBe(2);
    expect(stored.notes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('prepends into every registered variant', () => {
    const qc = seededClientWithVariants(2, [note('a'), note('b')]);
    prependSpaceNoteToCache(qc, SPACE, note('c'));

    expect(readLive(qc)?.pages[0]?.notes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
    expect(readLive(qc, '2026-01-01T00:00:00.000Z')?.pages[0]?.notes.map((n) => n.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(readLive(qc)?.pages[0]?.total).toBe(3);
  });

  it('updateSpaceNoteInCache reaches every variant', () => {
    const qc = seededClientWithVariants(2, [note('a'), note('b')]);
    updateSpaceNoteInCache(qc, SPACE, 'a', { isPinned: true });

    expect(readLive(qc)?.pages[0]?.notes[0]?.isPinned).toBe(true);
    expect(readLive(qc, '2026-01-01T00:00:00.000Z')?.pages[0]?.notes[0]?.isPinned).toBe(true);
  });

  it('snapshot/restore round-trips every variant', () => {
    const qc = seededClientWithVariants(2, [note('a'), note('b')]);
    const snapshot = snapshotSpaceNotesCaches(qc, SPACE);

    removeSpaceNoteFromCache(qc, SPACE, 'a');
    expect(readLive(qc)?.pages[0]?.notes).toHaveLength(1);

    restoreSpaceNotesCaches(qc, snapshot);
    expect(readLive(qc)?.pages[0]?.notes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(readLive(qc, '2026-01-01T00:00:00.000Z')?.pages[0]?.notes.map((n) => n.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('normalizes a bare space id to the same variants', () => {
    const qc = seededClient(2, [note('a'), note('b')]);
    // Callers pass ids with and without the `space_` prefix.
    removeSpaceNoteFromCache(qc, 'home', 'a');
    expect(readLive(qc)?.pages[0]?.notes.map((n) => n.id)).toEqual(['b']);
  });
});

describe('findSpaceNoteRowInCache', () => {
  it('finds a note in a space notes infinite cache', () => {
    const qc = seededClient(1, [note('src')]);
    expect(findSpaceNoteRowInCache(qc, 'src')?.title).toBe('Note src');
  });

  it('falls back to note detail cache', () => {
    const qc = new QueryClient();
    const detail: NoteDetail = {
      id: 'detail-note',
      title: 'From detail',
      content: '<p>body</p>',
      noteType: 'default',
      contentEncrypted: false,
      isPublic: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      threads: [],
      tags: [],
    };
    qc.setQueryData(['note', 'detail-note'], detail);
    expect(findSpaceNoteRowInCache(qc, 'detail-note')?.title).toBe('From detail');
  });
});

describe('spaceNoteRowFromCopy', () => {
  it('maps source fields onto a new id and marks as own note', () => {
    const source: SpaceNoteRow = {
      ...note('old'),
      noteType: 'scripture',
      authorUserId: 'user_other',
      authorDisplayName: 'Other',
      isOwnNote: false,
      isPinned: true,
      primaryCollection: 'Source folder',
      secondaryCollections: ['Shared secondary'],
      collectionPinned: true,
      collectionUserOverride: true,
      contentEncrypted: true,
      version: 'source-version',
    };
    const copied = spaceNoteRowFromCopy(source, 'new-id');
    expect(copied.id).toBe('new-id');
    expect(copied.title).toBe(source.title);
    expect(copied.noteType).toBe('scripture');
    expect(copied.isOwnNote).toBe(true);
    expect(copied.isPinned).toBe(false);
    expect(copied.authorUserId).toBeUndefined();
    expect(copied.authorDisplayName).toBeUndefined();
    expect(copied.primaryCollection).toBeNull();
    expect(copied.secondaryCollections).toEqual([]);
    expect(copied.collectionPinned).toBe(false);
    expect(copied.collectionUserOverride).toBe(false);
    expect(copied.contentEncrypted).toBe(false);
    expect(copied.version).toBeUndefined();
  });
});
