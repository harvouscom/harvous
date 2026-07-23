import { describe, expect, it } from 'vitest';
import { prototypeToolbarNoteDetailsAvailable } from '../prototype-toolbar-note-details';

describe('prototypeToolbarNoteDetailsAvailable', () => {
  it('is true on a draft note route so Templates are reachable in the inspector', () => {
    expect(
      prototypeToolbarNoteDetailsAvailable({
        isOnNotePage: true,
        toolbarNoteId: null,
        toolbarNoteLoading: false,
        hasToolbarNote: false,
        isDraftNoteRoute: true,
      }),
    ).toBe(true);
  });

  it('is true once a persisted note is loaded', () => {
    expect(
      prototypeToolbarNoteDetailsAvailable({
        isOnNotePage: true,
        toolbarNoteId: 'note_abc',
        toolbarNoteLoading: false,
        hasToolbarNote: true,
        isDraftNoteRoute: false,
      }),
    ).toBe(true);
  });

  it('is false off the note page', () => {
    expect(
      prototypeToolbarNoteDetailsAvailable({
        isOnNotePage: false,
        toolbarNoteId: 'note_abc',
        toolbarNoteLoading: false,
        hasToolbarNote: true,
        isDraftNoteRoute: false,
      }),
    ).toBe(false);
  });
});
