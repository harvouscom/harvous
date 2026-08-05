/**
 * Regression cover for the create→edit folder window.
 *
 * `seedNoteFromCreateResponse` primes the note cache from the create response
 * so the editor can mount before the details fetch lands. It used to carry the
 * folder (`primaryCollection`) but not the *intent* behind it
 * (`collectionUserOverride` / `collectionPinned`).
 *
 * The consequence was invisible in most flows and nasty in the one that
 * matters: a note created with a deliberately chosen folder mounted with the
 * editor believing the placement was auto-assigned, so the first keystroke let
 * the auto-folder pass overwrite it. A later details fetch restored the truth,
 * which is exactly why it was easy to miss — the corruption lived only in the
 * seconds where someone is actually typing.
 *
 * Caught by the church teaching plan (a series becomes the note's folder), but
 * the bug belongs to every caller that creates a note with a folder.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { seedNoteFromCreateResponse, type NoteDetail } from '../useNote';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

/** Shape of the `note` object POST /api/notes/create returns (it spreads the row). */
function createdNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note_1',
    title: 'No Condemnation',
    content: '<p>Romans 8:1-11</p><p></p>',
    noteType: 'default',
    spaceId: 'space_home',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

function seedAndRead(created: Record<string, unknown>): NoteDetail | undefined {
  const queryClient = new QueryClient();
  seedNoteFromCreateResponse(queryClient, created as Record<string, unknown> & { id: string }, 'space_home');
  return queryClient.getQueryData<NoteDetail>(['note', 'note_1']);
}

describe('seedNoteFromCreateResponse — folder intent', () => {
  it('carries collectionUserOverride so auto-folder cannot overwrite a chosen folder', () => {
    const seeded = seedAndRead(
      createdNote({
        primaryCollection: 'Life in the Spirit',
        collectionUserOverride: true,
      }),
    );

    expect(seeded?.primaryCollection).toBe('Life in the Spirit');
    // The flag is the whole point: `freezePrimary = pinned || userOverride`.
    expect(seeded?.collectionUserOverride).toBe(true);
  });

  it('carries collectionPinned', () => {
    const seeded = seedAndRead(
      createdNote({ primaryCollection: 'Romans', collectionPinned: true }),
    );

    expect(seeded?.collectionPinned).toBe(true);
  });

  it('defaults both to false for an ordinary create', () => {
    // An auto-assignable note must stay auto-assignable — this must not become
    // "everything is pinned" in the course of fixing the opposite bug.
    const seeded = seedAndRead(createdNote());

    expect(seeded?.collectionUserOverride).toBe(false);
    expect(seeded?.collectionPinned).toBe(false);
  });

  it('does not treat a missing flag as truthy', () => {
    const seeded = seedAndRead(
      createdNote({ collectionUserOverride: undefined, collectionPinned: null }),
    );

    expect(seeded?.collectionUserOverride).toBe(false);
    expect(seeded?.collectionPinned).toBe(false);
  });
});
