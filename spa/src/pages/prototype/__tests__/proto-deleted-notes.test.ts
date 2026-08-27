import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  deletedNoteIds,
  isNoteDeleted,
  markNotesDeleted,
  resetDeletedNotes,
  subscribeDeletedNotes,
  unmarkNotesDeleted,
} from '../proto-deleted-notes';

describe('proto-deleted-notes', () => {
  beforeEach(() => {
    resetDeletedNotes();
  });

  it('remembers a deleted id and forgets it on undo', () => {
    markNotesDeleted(['note_a']);
    expect(isNoteDeleted('note_a')).toBe(true);
    unmarkNotesDeleted(['note_a']);
    expect(isNoteDeleted('note_a')).toBe(false);
  });

  it('treats empty and nullish ids as not deleted', () => {
    expect(isNoteDeleted('')).toBe(false);
    expect(isNoteDeleted(null)).toBe(false);
    expect(isNoteDeleted(undefined)).toBe(false);
  });

  it('ignores blank ids rather than storing them', () => {
    markNotesDeleted(['', 'note_a']);
    expect(deletedNoteIds()).toEqual(['note_a']);
  });

  it('notifies subscribers only when the set actually changes', () => {
    const listener = vi.fn();
    subscribeDeletedNotes(listener);

    markNotesDeleted(['note_a']);
    expect(listener).toHaveBeenCalledTimes(1);

    // Same id again — nothing changed, so nothing to re-render for.
    markNotesDeleted(['note_a']);
    expect(listener).toHaveBeenCalledTimes(1);

    unmarkNotesDeleted(['note_b']);
    expect(listener).toHaveBeenCalledTimes(1);

    unmarkNotesDeleted(['note_a']);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDeletedNotes(listener);
    unsubscribe();
    markNotesDeleted(['note_a']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('picks up a noteDeleted event from any surface that dispatches one', () => {
    window.dispatchEvent(
      new CustomEvent('noteDeleted', { detail: { noteId: 'note_from_classic' } }),
    );
    expect(isNoteDeleted('note_from_classic')).toBe(true);
  });
});
