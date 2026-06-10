import { describe, expect, it } from 'vitest';
import {
  PROTOTYPE_DRAFT_NOTE_ID,
  isDraftComposeAdoptionTransition,
  prototypeComposeEditorKey,
  shouldKeepEditorDuringPersistedDraftLoad,
  shouldResetComposeSessionOnEpochChange,
} from '../prototype-draft-compose-session';

describe('isDraftComposeAdoptionTransition', () => {
  it('detects /n/new → /n/<id> for the adopted compose session', () => {
    expect(isDraftComposeAdoptionTransition('new', 'abc123', 'note_abc123')).toBe(true);
    expect(isDraftComposeAdoptionTransition('new', 'note_abc123', 'note_abc123')).toBe(true);
  });

  it('returns false for unrelated navigations', () => {
    expect(isDraftComposeAdoptionTransition('new', 'other', 'note_abc123')).toBe(false);
    expect(isDraftComposeAdoptionTransition('abc', 'def', 'note_abc123')).toBe(false);
    expect(isDraftComposeAdoptionTransition('new', 'abc123', null)).toBe(false);
  });
});

describe('prototypeComposeEditorKey', () => {
  it('combines draft note id and compose session epoch', () => {
    expect(prototypeComposeEditorKey(PROTOTYPE_DRAFT_NOTE_ID, 0)).toBe('note_draft-0');
    expect(prototypeComposeEditorKey(PROTOTYPE_DRAFT_NOTE_ID, 3)).toBe('note_draft-3');
  });
});

describe('shouldResetComposeSessionOnEpochChange', () => {
  it('resets only when epoch increases', () => {
    expect(shouldResetComposeSessionOnEpochChange(0, 1)).toBe(true);
    expect(shouldResetComposeSessionOnEpochChange(2, 5)).toBe(true);
    expect(shouldResetComposeSessionOnEpochChange(1, 1)).toBe(false);
    expect(shouldResetComposeSessionOnEpochChange(3, 2)).toBe(false);
  });
});

describe('shouldKeepEditorDuringPersistedDraftLoad', () => {
  it('keeps editor mounted while adopted note loads', () => {
    expect(shouldKeepEditorDuringPersistedDraftLoad(false, 'note_abc123', 'note_abc123')).toBe(true);
  });

  it('does not keep editor for draft route or mismatched ids', () => {
    expect(shouldKeepEditorDuringPersistedDraftLoad(true, 'note_draft', 'note_abc123')).toBe(false);
    expect(shouldKeepEditorDuringPersistedDraftLoad(false, 'note_other', 'note_abc123')).toBe(false);
    expect(shouldKeepEditorDuringPersistedDraftLoad(false, 'note_abc123', null)).toBe(false);
  });
});
