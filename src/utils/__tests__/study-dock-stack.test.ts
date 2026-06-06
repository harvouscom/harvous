import { describe, expect, it } from 'vitest';
import {
  closeDockEntry,
  collapseActiveScriptureIfActive,
  emptyStudyDockStack,
  highlightDockStableKey,
  openOrFocusHighlight,
  openOrFocusReference,
  openOrFocusScripture,
  pruneStudyDockStack,
  scriptureDockStableKey,
  STUDY_DOCK_STACK_MAX_ENTRIES,
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
});
