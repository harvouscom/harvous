import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { findCachedNoteAcrossContexts } from '../useSwitchToSpace';
import type { NoteDetail } from '../queries/useNote';

/**
 * Regression coverage for the bug where switching to My Home left a foreign,
 * read-only note open and editable. `shouldCloseNoteOnSpaceSwitch` itself was
 * always correct — this pins the caller, which was feeding it `undefined`
 * because it looked the note up under the wrong cache key.
 */
function detail(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: 'note_1',
    title: 'Someone else’s note',
    content: '<p>hi</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    threads: [],
    tags: [],
    linkedFromNotes: [],
    linkedToNotes: [],
    studyThreads: [],
    ...overrides,
  };
}

describe('findCachedNoteAcrossContexts', () => {
  it('finds a note cached under a context-suffixed key', () => {
    // This is exactly how useNote caches a note opened with `?space=` —
    // getNoteQueryOptions appends the context to the key when present.
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['note', 'note_1', 'space_shared'],
      detail({ isOwnNote: false, spaces: [{ id: 'space_shared', title: 'Team', coEditEnabled: false }] }),
    );

    // Before the fix this was queryClient.getQueryData(['note', 'note_1']) —
    // an exact-key read that misses the entry above entirely.
    const found = findCachedNoteAcrossContexts(queryClient, 'note_1');

    expect(found).toBeDefined();
    expect(found?.isOwnNote).toBe(false);
    expect(found?.spaces).toHaveLength(1);
  });

  it('finds a note cached under the bare (My Home) key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['note', 'note_1'], detail({ isOwnNote: true }));

    const found = findCachedNoteAcrossContexts(queryClient, 'note_1');

    expect(found?.isOwnNote).toBe(true);
  });

  it('prefers the entry with spaces loaded when both a list-seed and a detail read are cached', () => {
    const queryClient = new QueryClient();
    // A list-seed can land under the bare key with spaces never populated
    // (see seedNoteFromList) while the richer detail read sits under the
    // context key — the switch-time check needs the richer one.
    queryClient.setQueryData(['note', 'note_1'], detail({ isOwnNote: false, spaces: undefined }));
    queryClient.setQueryData(
      ['note', 'note_1', 'space_shared'],
      detail({ isOwnNote: false, spaces: [{ id: 'space_shared', title: 'Team', coEditEnabled: false }] }),
    );

    const found = findCachedNoteAcrossContexts(queryClient, 'note_1');

    expect(found?.spaces).toHaveLength(1);
  });

  it('returns undefined when nothing is cached, so the caller fails open rather than on stale data', () => {
    const queryClient = new QueryClient();
    expect(findCachedNoteAcrossContexts(queryClient, 'note_missing')).toBeUndefined();
  });

  it('does not match a different note id under the same prefix', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['note', 'note_2', 'space_shared'], detail({ id: 'note_2' }));

    expect(findCachedNoteAcrossContexts(queryClient, 'note_1')).toBeUndefined();
  });
});
