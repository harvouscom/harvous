import { describe, expect, it } from 'vitest';
import { prototypeToolbarNoteDetailsAvailable } from '../prototype-toolbar-note-details';

describe('prototypeToolbarNoteDetailsAvailable', () => {
  it('is false on a draft note route before the note persists', () => {
    expect(
      prototypeToolbarNoteDetailsAvailable({
        isOnNotePage: true,
        toolbarNoteId: null,
        toolbarNoteLoading: false,
        hasToolbarNote: false,
        isDraftNoteRoute: true,
      }),
    ).toBe(false);
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
});
