import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { APIError } from '../../../lib/api';
import { rollbackFailedNoteUpdate } from '../useUpdateNote';
import type { NoteDetail } from '../../queries/useNote';

vi.mock('@/utils/note-draft-store', () => ({ saveNoteDraft: vi.fn() }));

/**
 * A 409 used to restore the onMutate snapshot before doing anything else. That snapshot
 * predates the save, so when a concurrent save had already succeeded and written the
 * newer version into the same cache, the restore overwrote it with a stale one. The next
 * save then sent the stale number and conflicted again — self-perpetuating.
 *
 * Observed live as three identical
 *   `version conflict { expectedVersion: 2, currentVersion: 3 }`
 * entries on a note only one person was editing.
 */
function note(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: 'note_1',
    title: 'T',
    content: '<p>body</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    threads: [],
    tags: [],
    ...overrides,
  } as NoteDetail;
}

describe('rollbackFailedNoteUpdate on a version conflict', () => {
  it('never writes the stale snapshot back over a newer version', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => note({ currentVersion: 3 }), retry: false } },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ currentVersion: 3 }));
    const context = { previousNotes: [[['note', 'note_1'], note({ currentVersion: 2 })]] as any };

    // Assert on the write, not the end state: the 409 path also invalidates and refetches,
    // which would mask a stale write by landing on the right value a moment later.
    const written: unknown[] = [];
    const setQueryData = qc.setQueryData.bind(qc);
    vi.spyOn(qc, 'setQueryData').mockImplementation(((key: any, data: any, ...rest: any[]) => {
      if (Array.isArray(key) && key[0] === 'note' && key[1] === 'note_1') written.push(data);
      return setQueryData(key, data, ...rest);
    }) as typeof qc.setQueryData);

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'Expected note version 2, but current version is 3', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      context,
      { title: 'T', content: '<p>typed</p>' },
    );

    const staleWrites = written.filter(
      (d) => (d as NoteDetail | undefined)?.currentVersion === 2,
    );
    expect(staleWrites).toEqual([]);
  });

  it('still restores the snapshot for non-conflict failures', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => note(), retry: false } },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ title: 'optimistic' }));
    const context = { previousNotes: [[['note', 'note_1'], note({ title: 'original' })]] as any };

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(500, 'boom'),
      'note_1',
      context,
      { title: 'optimistic', content: '<p>x</p>' },
    );

    expect(qc.getQueryData<NoteDetail>(['note', 'note_1'])?.title).toBe('original');
  });
});
