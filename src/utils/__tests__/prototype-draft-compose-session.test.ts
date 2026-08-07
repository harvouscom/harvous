import { describe, expect, it } from 'vitest';
import {
  PROTOTYPE_DRAFT_NOTE_ID,
  isAdoptedComposeSessionActive,
  isDraftComposeAdoptionTransition,
  prototypeComposeEditorKey,
  resolveNoteDraftWriteKey,
  shouldClearStaleComposeDraftOnSessionStart,
  shouldKeepEditorDuringPersistedDraftLoad,
  shouldResetComposeSessionOnEpochChange,
} from '../prototype-draft-compose-session';

describe('isDraftComposeAdoptionTransition', () => {
  // note_1781400844391 base62-encodes to fWdqYzt
  const adoptedId = 'note_1781400844391';
  const adoptedSlug = 'fWdqYzt';

  it('detects /new → /<slug> for the adopted compose session', () => {
    expect(isDraftComposeAdoptionTransition('new', adoptedSlug, adoptedId)).toBe(true);
    // a full id passed through (defensive) still resolves to itself
    expect(isDraftComposeAdoptionTransition('new', adoptedId, adoptedId)).toBe(true);
  });

  it('returns false for unrelated navigations', () => {
    expect(isDraftComposeAdoptionTransition('new', 'other', adoptedId)).toBe(false);
    expect(isDraftComposeAdoptionTransition('abc', 'def', adoptedId)).toBe(false);
    expect(isDraftComposeAdoptionTransition('new', adoptedSlug, null)).toBe(false);
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

describe('shouldClearStaleComposeDraftOnSessionStart', () => {
  it('spares the first compose after a page load — that draft is the crash backstop', () => {
    expect(shouldClearStaleComposeDraftOnSessionStart(0)).toBe(false);
  });

  it('clears for every later compose in the same session', () => {
    // By then the previous compose was live in this tab: its content either reached the
    // server or was abandoned on purpose. Restoring it into a fresh compose is the bug.
    expect(shouldClearStaleComposeDraftOnSessionStart(1)).toBe(true);
    expect(shouldClearStaleComposeDraftOnSessionStart(7)).toBe(true);
  });
});

describe('resolveNoteDraftWriteKey', () => {
  it('sends drafts to the real note once the compose has persisted', () => {
    // The regression: the editor keeps noteId === note_draft until the URL idle-replaces,
    // so post-create keystrokes stranded a draft of already-saved content under that key.
    expect(resolveNoteDraftWriteKey(PROTOTYPE_DRAFT_NOTE_ID, 'note_abc123')).toBe('note_abc123');
  });

  it('stays on the compose key before anything is persisted', () => {
    expect(resolveNoteDraftWriteKey(PROTOTYPE_DRAFT_NOTE_ID, null)).toBe(PROTOTYPE_DRAFT_NOTE_ID);
  });

  it('never redirects an ordinary note away from its own key', () => {
    expect(resolveNoteDraftWriteKey('note_other', 'note_abc123')).toBe('note_other');
  });

  it('is null with no note at all', () => {
    expect(resolveNoteDraftWriteKey(null, 'note_abc123')).toBeNull();
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

describe('isAdoptedComposeSessionActive', () => {
  it('stays active on the draft route and on the note the draft persisted into', () => {
    expect(isAdoptedComposeSessionActive(true, 'note_draft', 'note_abc123')).toBe(true);
    expect(isAdoptedComposeSessionActive(false, 'note_abc123', 'note_abc123')).toBe(true);
  });

  it('goes inactive once the URL moves to a different note', () => {
    // The regression: a stale adoptedComposeId used to pin editorSessionKey to the compose
    // mount for every later note, so switching notes showed the previous body until reload.
    expect(isAdoptedComposeSessionActive(false, 'note_other', 'note_abc123')).toBe(false);
  });

  it('is inactive with no adopted id', () => {
    expect(isAdoptedComposeSessionActive(false, 'note_abc123', null)).toBe(false);
    expect(isAdoptedComposeSessionActive(true, 'note_draft', null)).toBe(false);
  });
});
