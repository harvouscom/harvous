import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { reconcileNoteId } from '../sync-cache-bridge';
import { spaceNotesQueryKey, type SpaceNotesPage } from '../space-notes-cache';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

const OLD = 'local_123';
const NEW = 'note_999';
const SPACE = 'space_home';

function seededClient(): QueryClient {
  const qc = new QueryClient();
  // Note detail cache under the optimistic local id.
  qc.setQueryData(['note', OLD], { id: OLD, title: 'Draft', content: '<p>hi</p>' });
  // Space-notes infinite cache holding a row with the optimistic id.
  const row: SpaceNoteRow = { id: OLD, title: 'Draft', content: '<p>hi</p>', isPinned: false };
  const page: InfiniteData<SpaceNotesPage, number> = {
    pages: [{ notes: [row], hasMore: false, offset: 0, limit: 20 }],
    pageParams: [0],
  };
  qc.setQueryData(spaceNotesQueryKey(SPACE), page);
  return qc;
}

describe('reconcileNoteId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves the note-detail cache from the local id to the server id', () => {
    const qc = seededClient();
    reconcileNoteId(qc, OLD, NEW);
    expect(qc.getQueryData(['note', OLD])).toBeUndefined();
    expect(qc.getQueryData<{ id: string }>(['note', NEW])?.id).toBe(NEW);
  });

  it('rewrites the row id inside the space-notes infinite cache', () => {
    const qc = seededClient();
    reconcileNoteId(qc, OLD, NEW);
    const data = qc.getQueryData<InfiniteData<SpaceNotesPage, number>>(spaceNotesQueryKey(SPACE));
    const ids = data?.pages.flatMap((p) => p.notes.map((n) => n.id)) ?? [];
    expect(ids).toContain(NEW);
    expect(ids).not.toContain(OLD);
  });

  it('migrates the note→thread localStorage hint', () => {
    const qc = seededClient();
    localStorage.setItem(`harvous-note-thread-${OLD}`, 'thread_42');
    reconcileNoteId(qc, OLD, NEW);
    expect(localStorage.getItem(`harvous-note-thread-${NEW}`)).toBe('thread_42');
    expect(localStorage.getItem(`harvous-note-thread-${OLD}`)).toBeNull();
  });

  it('is a no-op when ids are equal or missing', () => {
    const qc = seededClient();
    reconcileNoteId(qc, OLD, OLD);
    expect(qc.getQueryData<{ id: string }>(['note', OLD])?.id).toBe(OLD);
  });
});
