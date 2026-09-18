import { afterEach, describe, expect, it } from 'vitest';
import { publishShellMode } from '../guest-session';
import { isGuestLocalNote } from '../guest-store';
import { PROTOTYPE_DRAFT_NOTE_ID } from '@/utils/prototype-draft-compose-session';

/**
 * Which notes an editor must never send to the server.
 *
 * `isGuestNoteId` answers for a saved guest note, but a guest's compose never moves to a real
 * id — the note they are writing is `note_draft` the whole time it is open. Every guard built
 * on the id alone let that note's highlights and saved words go out and 401.
 */
describe('isGuestLocalNote', () => {
  afterEach(() => {
    publishShellMode('account');
  });

  it("is true for a saved guest note, whoever's shell is up", () => {
    publishShellMode('account');
    expect(isGuestLocalNote('guest_note_abc123')).toBe(true);
  });

  it("is true for the compose draft a guest is writing", () => {
    publishShellMode('guest');
    expect(isGuestLocalNote(PROTOTYPE_DRAFT_NOTE_ID)).toBe(true);
  });

  it("is false for a member's draft and a member's note", () => {
    publishShellMode('account');
    expect(isGuestLocalNote(PROTOTYPE_DRAFT_NOTE_ID)).toBe(false);
    expect(isGuestLocalNote('note_1789759073080')).toBe(false);
  });
});
