import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { findCachedNoteAcrossContexts } from '../useSwitchToSpace';
import { resolveNoteSpaceSwitch } from '../../lib/note-audience';
import type { NoteDetail } from '../queries/useNote';

/**
 * Regression coverage for the bug where switching to My Home left a foreign,
 * read-only note open and editable. `resolveNoteSpaceSwitch` itself was
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

/**
 * The lookup and the decision together — which is where the reported bug lived.
 *
 * Neither half was wrong on its own: the cache genuinely did not know the note's
 * spaces yet, and "do not close" was the right call on unknown. What went wrong is
 * that the caller had only a boolean, so "we know it belongs here" and "we have no
 * idea" both took the branch that re-stamps `?space=` — and re-reading the note
 * under an unconfirmed space cleared the folder chip, because folders are per-space.
 *
 * Reproduces the sequence Derek reported: the first switch after opening a note
 * appeared to erase its folders, and switching again behaved correctly, because by
 * then the detail read had populated `spaces`.
 */
describe('what a switch decides from what is cached', () => {
  const home = 'space_home';

  function outcomeFor(queryClient: QueryClient, destinationSpaceId: string | null) {
    const note = findCachedNoteAcrossContexts(queryClient, 'note_1');
    return resolveNoteSpaceSwitch({
      destinationSpaceId,
      homeSpaceId: home,
      noteSpaceIds: note?.spaces?.map((s) => s.id),
      isOwnNote: note?.isOwnNote !== false,
      isDraft: false,
    });
  }

  it('touches nothing on the first switch, when only a list seed is cached', () => {
    const queryClient = new QueryClient();
    // Exactly what seedNoteFromList leaves behind: content to paint with, and
    // `spaces` left undefined to mean "not loaded" rather than "none".
    queryClient.setQueryData(['note', 'note_1'], detail({ isOwnNote: true, spaces: undefined }));

    expect(outcomeFor(queryClient, 'space_b')).toBe('leave');
  });

  it('closes on the next switch, once detail has said the note is not in that space', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['note', 'note_1'],
      detail({ isOwnNote: true, spaces: [{ id: 'space_a', title: 'A', coEditEnabled: false }] }),
    );

    expect(outcomeFor(queryClient, 'space_b')).toBe('close');
  });

  it('re-reads under the destination once detail confirms the note is in it', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['note', 'note_1'],
      detail({ isOwnNote: true, spaces: [{ id: 'space_b', title: 'B', coEditEnabled: false }] }),
    );

    expect(outcomeFor(queryClient, 'space_b')).toBe('retarget');
  });
});
