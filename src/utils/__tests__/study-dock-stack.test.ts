import { describe, expect, it } from 'vitest';
import {
  closeDockEntry,
  collapseActiveScriptureIfActive,
  clearStudyDockStackLocalCache,
  deserializeStudyDockStack,
  emptyStudyDockStack,
  highlightDockStableKey,
  isPersistableStudyDockNoteId,
  openOrFocusHighlight,
  openOrFocusReference,
  openOrFocusScripture,
  pruneStudyDockStack,
  scriptureDockStableKey,
  serializeStudyDockStack,
  STUDY_DOCK_STACK_MAX_ENTRIES,
  studyDockStackStorageKey,
  updateDockEntry,
} from '../study-dock-stack';

const scriptureSession = {
  boundaries: { from: 1, to: 10 },
  reference: 'John 3:16',
  translation: 'NET',
  noteId: null,
  pillAccent: null,
};

const highlightSession = {
  studyThreadEntryId: 'st_1',
  accent: 'warmAmber',
  excerpt: 'For God so loved',
  range: { from: 20, to: 40 },
};

describe('study-dock-stack', () => {
  it('openOrFocusScripture appends and dedupes by stable key', () => {
    let stack = emptyStudyDockStack();
    stack = openOrFocusScripture(stack, scriptureSession);
    expect(stack.entries).toHaveLength(1);
    expect(stack.activeId).toBe(stack.entries[0].id);

    const other = { ...scriptureSession, translation: 'ESV' };
    stack = openOrFocusScripture(stack, other);
    expect(stack.entries).toHaveLength(1);
    const first = stack.entries[0];
    expect(first.kind === 'scripture' ? first.session.translation : null).toBe('ESV');
  });

  it('reuses the entry after a verse-range rewrite updates its stableKey + boundaries', () => {
    // Open the dock for John 3:16 at boundaries {1,10}.
    let stack = openOrFocusScripture(emptyStudyDockStack(), scriptureSession);
    const originalId = stack.activeId!;

    // Verse-range edit rewrites the pill (e.g. John 3:16 → John 3:16-18): onApply updates the
    // entry's stableKey + boundaries to the new live range so they don't drift out of sync.
    const rewrittenRef = 'John 3:16-18';
    const rewrittenBoundaries = { from: 1, to: 13 };
    stack = updateDockEntry(stack, originalId, (e) =>
      e.kind === 'scripture'
        ? {
            ...e,
            stableKey: scriptureDockStableKey(rewrittenRef, rewrittenBoundaries),
            session: { ...e.session, reference: rewrittenRef, boundaries: rewrittenBoundaries },
          }
        : e,
    );

    // Re-clicking the pill resolves the new reference + live boundaries → must focus the SAME
    // entry, not spawn a duplicate (regression: stale stableKey created a second dock).
    stack = openOrFocusScripture(stack, {
      ...scriptureSession,
      reference: rewrittenRef,
      boundaries: rewrittenBoundaries,
    });
    expect(stack.entries).toHaveLength(1);
    expect(stack.activeId).toBe(originalId);
    expect(stack.entries[0].expanded).toBe(true);
  });

  it('openOrFocusHighlight keeps scripture and adds highlight', () => {
    let stack = openOrFocusScripture(emptyStudyDockStack(), scriptureSession);
    stack = openOrFocusHighlight(stack, highlightSession);
    expect(stack.entries).toHaveLength(2);
    expect(stack.activeId).toBe(stack.entries[1].id);
  });

  it('openOrFocusReference adds a reference dock and transitions pending → saved in place', () => {
    let stack = openOrFocusReference(emptyStudyDockStack(), {
      query: 'Bethlehem',
      pendingSuggestion: { from: 5, to: 14 },
    });
    expect(stack.entries).toHaveLength(1);
    expect(stack.entries[0].kind).toBe('reference');

    // Saving keeps the same note range → same stable key → updates in place (no duplicate).
    stack = openOrFocusReference(stack, {
      query: 'Bethlehem',
      noteHighlightRange: { from: 5, to: 14 },
      noteHighlightAccent: 'warmAmber',
      studyThreadEntryId: 'st_ref_1',
    });
    expect(stack.entries).toHaveLength(1);
    const e = stack.entries[0];
    expect(e.kind === 'reference' ? e.session.noteHighlightRange : null).toEqual({ from: 5, to: 14 });
  });

  it('closeDockEntry activates most recently opened remaining entry', () => {
    let stack = openOrFocusScripture(emptyStudyDockStack(), scriptureSession);
    stack = openOrFocusHighlight(stack, highlightSession);
    const highlightId = stack.activeId!;
    stack = closeDockEntry(stack, highlightId);
    expect(stack.entries).toHaveLength(1);
    expect(stack.activeId).toBe(stack.entries[0].id);
    expect(stack.entries[0].expanded).toBe(true);
  });

  it('collapseActiveScriptureIfActive only collapses active scripture', () => {
    let stack = openOrFocusScripture(emptyStudyDockStack(), scriptureSession);
    stack = openOrFocusHighlight(stack, highlightSession);
    stack = collapseActiveScriptureIfActive(stack);
    const highlight = stack.entries.find((e) => e.kind === 'highlight');
    expect(highlight?.expanded).toBe(true);
  });

  it('pruneStudyDockStack removes invalid entries', () => {
    let stack = openOrFocusHighlight(emptyStudyDockStack(), highlightSession);
    stack = pruneStudyDockStack(stack, () => false);
    expect(stack.entries).toHaveLength(0);
    expect(stack.activeId).toBeNull();

    stack = openOrFocusHighlight(emptyStudyDockStack(), highlightSession);
    const id = stack.entries[0].id;
    stack = pruneStudyDockStack(stack, (e) => e.id === id);
    expect(stack.entries).toHaveLength(1);
  });

  it('stable keys are deterministic', () => {
    expect(scriptureDockStableKey('John 3:16', { from: 1, to: 5 })).toContain('scripture:');
    expect(highlightDockStableKey('st_1', null)).toBe('highlight:st_1');
  });

  it('drops oldest when exceeding max entries', () => {
    let stack = emptyStudyDockStack();
    for (let i = 0; i < STUDY_DOCK_STACK_MAX_ENTRIES + 2; i++) {
      stack = openOrFocusScripture(stack, {
        ...scriptureSession,
        boundaries: { from: i, to: i + 5 },
        reference: `Ref ${i}`,
      });
    }
    expect(stack.entries.length).toBe(STUDY_DOCK_STACK_MAX_ENTRIES);
  });

  it('isPersistableStudyDockNoteId accepts note_ ids only', () => {
    expect(isPersistableStudyDockNoteId('note_x')).toBe(true);
    expect(isPersistableStudyDockNoteId('new-note')).toBe(false);
    expect(isPersistableStudyDockNoteId('')).toBe(false);
    expect(isPersistableStudyDockNoteId(undefined)).toBe(false);
    expect(isPersistableStudyDockNoteId('space_x')).toBe(false);
  });

  it('studyDockStackStorageKey uses harvous-study-dock- prefix', () => {
    expect(studyDockStackStorageKey('note_x')).toBe('harvous-study-dock-note_x');
  });

  it('serialize and deserialize round-trip entries, activeId, and expanded', () => {
    let stack = openOrFocusScripture(emptyStudyDockStack(), scriptureSession);
    stack = openOrFocusHighlight(stack, highlightSession);
    const activeId = stack.activeId;
    const serialized = serializeStudyDockStack(stack);
    const restored = deserializeStudyDockStack(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.entries).toHaveLength(2);
    expect(restored!.activeId).toBe(activeId);
    expect(restored!.entries.find((e) => e.id === activeId)?.expanded).toBe(true);
    expect(restored!.entries.find((e) => e.id !== activeId)?.expanded).toBe(false);
  });

  it('deserialize returns null for missing, malformed, or wrong-version data', () => {
    expect(deserializeStudyDockStack(null)).toBeNull();
    expect(deserializeStudyDockStack('not json')).toBeNull();
    expect(deserializeStudyDockStack(JSON.stringify({ v: 2, stack: { entries: [], activeId: null } }))).toBeNull();
    expect(deserializeStudyDockStack(JSON.stringify({ v: 1, stack: { entries: 'bad', activeId: null } }))).toBeNull();
  });

  it('deserialize clamps over-cap blobs to STUDY_DOCK_STACK_MAX_ENTRIES', () => {
    const entries = Array.from({ length: STUDY_DOCK_STACK_MAX_ENTRIES + 3 }, (_, i) => ({
      id: `dock-${i}`,
      kind: 'scripture' as const,
      stableKey: `scripture:Ref ${i}:0-5`,
      openedAt: i,
      expanded: false,
      session: {
        boundaries: { from: i, to: i + 5 },
        reference: `Ref ${i}`,
        translation: 'NET',
        noteId: null,
        pillAccent: null,
      },
    }));
    const raw = JSON.stringify({ v: 1, stack: { entries, activeId: entries[entries.length - 1].id } });
    const restored = deserializeStudyDockStack(raw);
    expect(restored).not.toBeNull();
    expect(restored!.entries).toHaveLength(STUDY_DOCK_STACK_MAX_ENTRIES);
    expect(restored!.entries[0].session.reference).toBe('Ref 3');
  });

  it('clearStudyDockStackLocalCache removes persisted stack for note_ ids only', () => {
    localStorage.setItem('harvous-study-dock-note_x', '{"v":1,"stack":{"entries":[],"activeId":null}}');
    localStorage.setItem('harvous-study-dock-new-note', '{"v":1,"stack":{"entries":[],"activeId":null}}');
    clearStudyDockStackLocalCache('note_x');
    expect(localStorage.getItem('harvous-study-dock-note_x')).toBeNull();
    expect(localStorage.getItem('harvous-study-dock-new-note')).not.toBeNull();
    localStorage.removeItem('harvous-study-dock-new-note');
  });
});
