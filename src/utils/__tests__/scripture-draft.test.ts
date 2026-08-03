import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/profile-cache', () => ({
  getEffectiveDefaultTranslation: () => 'ESV',
}));

import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  draftTextToReference,
  confirmScriptureDraftView,
  computeScriptureDraftGrowth,
  makeScriptureDraftGrowPlugin,
  unifyScriptureDraftAtCursor,
  editScripturePillAsDraft,
  getScriptureDraftValidity,
  restoreScripturePillFromDraft,
  cancelScriptureDraftView,
} from '@/components/react/TiptapScriptureDraft';
import { collectScripturePillRanges } from '@/utils/scripture-pill-spacing';

describe('draftTextToReference', () => {
  it('normalizes a complete reference', () => {
    expect(draftTextToReference('Exodus 5:1-2')).toBe('Exodus 5:1-2');
  });

  it('trims surrounding/trailing whitespace', () => {
    expect(draftTextToReference('  Exodus 5:1-2 ')).toBe('Exodus 5:1-2');
    expect(draftTextToReference('Exodus 5 ')).toBe('Exodus 5');
  });

  it('canonicalizes a clean verse range', () => {
    expect(draftTextToReference('Exodus 4:18-20')).toBe('Exodus 4:18-20');
  });

  it('canonicalizes a cross-chapter range to one reference', () => {
    expect(draftTextToReference('Exodus 6:28-7:7')).toBe('Exodus 6:28-7:7');
  });

  it('keeps a chapter-only reference chapter-only (no auto-expand)', () => {
    expect(draftTextToReference('Exodus 5')).toBe('Exodus 5');
  });

  it('returns null for a book name only (not yet a reference)', () => {
    expect(draftTextToReference('Exodus')).toBeNull();
  });

  it('returns null for non-references / empty input', () => {
    expect(draftTextToReference('')).toBeNull();
    expect(draftTextToReference('   ')).toBeNull();
    expect(draftTextToReference('hello world')).toBeNull();
  });
});

// ── confirmScriptureDraftView (commit absorbs a trailing range tail) ─────────────

const draftSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    bold: {
      toDOM: () => ['strong', 0],
    },
    scriptureDraft: {
      attrs: {
        translation: { default: null },
        pillAccent: { default: null },
        // Set when the draft came from a committed pill (Backspace-to-edit).
        originalReference: { default: null },
        noteId: { default: null },
      },
      inclusive: false,
      parseDOM: [],
      toDOM: () => ['span', 0],
    },
    scripturePill: {
      attrs: {
        reference: { default: '' },
        noteId: { default: null },
        translation: { default: null },
        pillAccent: { default: null },
      },
      inclusive: false,
      toDOM: () => ['span', 0],
    },
  },
});

/** The scripturePill mark instance on the first pilled text node, or null. */
function pillMark(state: any): any | null {
  let found: any = null;
  state.doc.descendants((node: any) => {
    if (found) return false;
    if (node.isText) {
      const m = node.marks?.find((mk: any) => mk.type.name === 'scripturePill');
      if (m) found = m;
    }
    return undefined;
  });
  return found;
}

/** Build a fake EditorView over a paragraph: [draftText](draft mark) + trailingText (plain). */
function draftView(draftText: string, trailingText = '') {
  const draftMark = draftSchema.marks.scriptureDraft.create();
  const inline = [draftSchema.text(draftText, [draftMark])];
  if (trailingText) inline.push(draftSchema.text(trailingText));
  const doc = draftSchema.node('doc', null, [draftSchema.node('paragraph', null, inline)]);
  let state = EditorState.create({ doc });
  // Caret after the trailing text (where it lands on iOS when the mark was dropped).
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)));
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
    dom: { dispatchEvent: () => true },
    focus: () => {},
  };
  return { view, draftEnd: 1 + draftText.length, getState: () => state };
}

function pillText(state: any): string | null {
  let found: string | null = null;
  state.doc.descendants((node: any) => {
    if (node.isText && node.marks?.some((m: any) => m.type.name === 'scripturePill')) {
      found = node.text;
      return false;
    }
    return undefined;
  });
  return found;
}

describe('confirmScriptureDraftView', () => {
  it('absorbs a trailing range tail left as plain text after the draft', () => {
    // iOS dropped the inclusive draft mark, so "-3" sits just past the "Psalm 27:1" draft.
    const { view, draftEnd, getState } = draftView('Psalm 27:1', '-3');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalms 27:1-3');
    expect(pillText(getState())).toBe('Psalms 27:1-3');
  });

  it('commits a plain chapter:verse draft unchanged', () => {
    const { view, draftEnd, getState } = draftView('Psalm 27:1');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalms 27:1');
    expect(pillText(getState())).toBe('Psalms 27:1');
  });

  it('does not absorb following prose (space stops the scan)', () => {
    const { view, draftEnd, getState } = draftView('Psalm 27:1', ' and');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalms 27:1');
    expect(pillText(getState())).toBe('Psalms 27:1');
  });

  it('consumes a trailing translation abbreviation typed after the reference', () => {
    const { view, draftEnd, getState } = draftView('Exodus 5:1', ' ESV');
    confirmScriptureDraftView(view, draftEnd);
    expect(pillText(getState())).toBe('Exodus 5:1');
    expect(pillMark(getState())?.attrs.translation).toBe('ESV');
    // The " ESV" was consumed, not left as prose.
    expect(getState().doc.textContent.replace(/\s+/g, '')).toBe('Exodus5:1');
  });

  it('applies the profile default translation when none is carried or typed', () => {
    const { view, draftEnd, getState } = draftView('John 3:16');
    confirmScriptureDraftView(view, draftEnd);
    expect(pillMark(getState())?.attrs.translation).toBe('ESV');
  });

  it('does not bleed an active bold mark onto the trailing spacer or stored marks', () => {
    // User typed the reference with bold active: the draft text carries draft+bold and bold is in
    // storedMarks. After commit, neither the inserted spacer nor stored marks should keep bold.
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const boldMark = draftSchema.marks.bold.create();
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [
        draftSchema.text('John 3:16', [draftMark, boldMark]),
        draftSchema.text('x'), // following prose forces a trailing spacer between pill and "x"
      ]),
    ]);
    let state = EditorState.create({ doc });
    state = state.apply(state.tr.setStoredMarks([boldMark]));
    const view = {
      get state() {
        return state;
      },
      dispatch(tr: any) {
        state = state.apply(tr);
      },
      dom: { dispatchEvent: () => true },
      focus: () => {},
    };
    const draftEnd = 1 + 'John 3:16'.length;
    confirmScriptureDraftView(view, draftEnd);

    // Stored marks cleared so newly typed text after the pill isn't bold.
    expect(state.storedMarks ?? []).toHaveLength(0);

    // The spacer inserted between the pill and "x" carries no bold mark.
    const pillEnd = 1 + 'John 3:16'.length;
    expect(state.doc.textBetween(pillEnd, pillEnd + 1)).toBe(' ');
    let spacerMarks: any[] = [];
    state.doc.nodesBetween(pillEnd, pillEnd + 1, (node: any) => {
      if (node.isText && node.text === ' ') spacerMarks = node.marks;
    });
    expect(spacerMarks.some((m: any) => m.type.name === 'bold')).toBe(false);
  });
});

describe('computeScriptureDraftGrowth', () => {
  it('grows the draft over a trailing range tail typed as plain text', () => {
    // "Exodus 5:1"[draft] + "-2"[plain] — the plugin should mark them as one pill.
    const { view } = draftView('Exodus 5:1', '-2');
    const growth = computeScriptureDraftGrowth(view.state.doc, view.state.selection.from);
    expect(growth).not.toBeNull();
    expect(growth!.from).toBe(1);
    expect(view.state.doc.textBetween(growth!.from, growth!.to)).toBe('Exodus 5:1-2');
  });

  it('returns null when the draft already covers the full reference', () => {
    const { view } = draftView('Exodus 5:1');
    expect(computeScriptureDraftGrowth(view.state.doc, view.state.selection.from)).toBeNull();
  });

  it('stops at non-continuation text (does not swallow following prose)', () => {
    const { view } = draftView('Exodus 5:1', ' and more');
    expect(computeScriptureDraftGrowth(view.state.doc, view.state.selection.from)).toBeNull();
  });

  it('unifies split draft fragments from the FIRST fragment, even with the caret near the last', () => {
    // iOS split: "John 3:16"[draft] + "-"[plain] + "17"[draft]. Growth must cover the whole
    // reference starting at the first fragment, not just the fragment nearest the caret.
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [
        draftSchema.text('John 3:16', [draftMark]),
        draftSchema.text('-'),
        draftSchema.text('17', [draftMark]),
      ]),
    ]);
    const state = EditorState.create({ doc });
    const caret = state.doc.content.size - 1; // right after "17"
    const growth = computeScriptureDraftGrowth(state.doc, caret);
    expect(growth).not.toBeNull();
    expect(growth!.from).toBe(1);
    expect(state.doc.textBetween(growth!.from, growth!.to)).toBe('John 3:16-17');
  });
});

describe('editScripturePillAsDraft', () => {
  it('converts a committed pill back into a draft over the same text', () => {
    const pillMark = draftSchema.marks.scripturePill.create({ reference: 'Exodus 5:1', noteId: 'note_1' });
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [draftSchema.text('Exodus 5:1', [pillMark])]),
    ]);
    let state = EditorState.create({ doc });
    const view = {
      get state() {
        return state;
      },
      dispatch(tr: any) {
        state = state.apply(tr);
      },
      focus: () => {},
    };
    const from = 1;
    const to = 1 + 'Exodus 5:1'.length;
    expect(editScripturePillAsDraft(view, from, to)).toBe(true);
    expect(collectScripturePillRanges(state.doc, 'scripturePill')).toHaveLength(0);
    const draftRanges = collectScripturePillRanges(state.doc, 'scriptureDraft');
    expect(draftRanges).toHaveLength(1);
    expect(state.doc.textBetween(draftRanges[0].start, draftRanges[0].end)).toBe('Exodus 5:1');
  });

  it('carries the pill translation through edit → re-confirm', () => {
    const pillM = draftSchema.marks.scripturePill.create({
      reference: 'Exodus 5:1',
      noteId: 'note_1',
      translation: 'NLT',
    });
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [draftSchema.text('Exodus 5:1', [pillM])]),
    ]);
    let state = EditorState.create({ doc });
    const view = {
      get state() {
        return state;
      },
      dispatch(tr: any) {
        state = state.apply(tr);
      },
      dom: { dispatchEvent: () => true },
      focus: () => {},
    };
    const to = 1 + 'Exodus 5:1'.length;
    editScripturePillAsDraft(view, 1, to);
    // Draft carries the translation...
    expect(collectScripturePillRanges(state.doc, 'scriptureDraft')).toHaveLength(1);
    confirmScriptureDraftView(view, to);
    // ...and the re-confirmed pill keeps it.
    expect(pillMark(state)?.attrs.translation).toBe('NLT');
    expect(pillText(state)).toBe('Exodus 5:1');
  });
});

describe('makeScriptureDraftGrowPlugin (end-to-end)', () => {
  it('grows the draft mark over a plain range tail inserted after it, as one pill', () => {
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [draftSchema.text('Exodus 5:1', [draftMark])]),
    ]);
    let state = EditorState.create({ doc, plugins: [makeScriptureDraftGrowPlugin()] });
    const draftEnd = 1 + 'Exodus 5:1'.length; // position right after the draft
    // Insert "-2" as a plain (unmarked) text node — simulates iOS dropping the mark on input.
    state = state.apply(state.tr.insert(draftEnd, draftSchema.text('-2')));
    // The plugin's appendTransaction should have extended the mark to cover the whole range.
    const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
    expect(ranges).toHaveLength(1);
    expect(state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('Exodus 5:1-2');
  });

  it('collapses a split into two draft fragments into one pill on the next edit (addMark-only)', () => {
    const draftMark = draftSchema.marks.scriptureDraft.create();
    // Pre-split state: "John 3:1"[draft] + "-"[plain] + "2"[draft] — two separate draft fragments.
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [
        draftSchema.text('John 3:1', [draftMark]),
        draftSchema.text('-'),
        draftSchema.text('2', [draftMark]),
      ]),
    ]);
    let state = EditorState.create({ doc, plugins: [makeScriptureDraftGrowPlugin()] });
    expect(collectScripturePillRanges(state.doc, 'scriptureDraft')).toHaveLength(2);
    // Type "0" after "2" (plain, as on iOS). The plugin (desktop path in jsdom) should unify
    // everything into one draft via a single addMark over the merged span — no removeMark.
    const end = state.doc.content.size - 1;
    state = state.apply(state.tr.insertText('0', end));
    const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
    expect(ranges).toHaveLength(1);
    expect(state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('John 3:1-20');
  });
});

// ── unifyScriptureDraftAtCursor (mobile debounced grow — single dispatch, no plugin) ─────────────

describe('unifyScriptureDraftAtCursor', () => {
  function viewOver(doc: any) {
    let state = EditorState.create({ doc });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
    );
    return {
      get state() {
        return state;
      },
      dispatch(tr: any) {
        state = state.apply(tr);
      },
    };
  }

  it('merges a split draft into one pill in a single dispatch', () => {
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const view = viewOver(
      draftSchema.node('doc', null, [
        draftSchema.node('paragraph', null, [
          draftSchema.text('John 3:16', [draftMark]),
          draftSchema.text('-'),
          draftSchema.text('17', [draftMark]),
        ]),
      ]),
    );
    expect(collectScripturePillRanges(view.state.doc, 'scriptureDraft')).toHaveLength(2);
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    const ranges = collectScripturePillRanges(view.state.doc, 'scriptureDraft');
    expect(ranges).toHaveLength(1);
    expect(view.state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('John 3:16-17');
  });

  it('returns false when the draft already covers its full reference', () => {
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const view = viewOver(
      draftSchema.node('doc', null, [
        draftSchema.node('paragraph', null, [draftSchema.text('John 3:16', [draftMark])]),
      ]),
    );
    expect(unifyScriptureDraftAtCursor(view)).toBe(false);
  });
});

// ── Canonicalization + canon-validity gate on commit ────────────────────────────

describe('draftTextToReference canonicalization', () => {
  it('capitalizes a lowercase book name (the reported "exodus" bug)', () => {
    expect(draftTextToReference('exodus 16:13')).toBe('Exodus 16:13');
  });

  it('expands an abbreviated book name', () => {
    // Only abbreviations the detector's alternation knows (BIBLE_STUDY_KEYWORDS synonyms) reach
    // this path — "ex" is not a synonym, so it never becomes a draft in the first place.
    expect(draftTextToReference('exo 16:13')).toBe('Exodus 16:13');
    expect(draftTextToReference('1 cor 13:4-7')).toBe('1 Corinthians 13:4-7');
  });

  it('canonicalizes without expanding a chapter-only reference', () => {
    expect(draftTextToReference('exodus 5')).toBe('Exodus 5');
  });
});

describe('confirmScriptureDraftView canonical + validity', () => {
  it('commits canonical pill text for a lowercase draft', () => {
    const { view, draftEnd, getState } = draftView('exodus 16:13');
    expect(confirmScriptureDraftView(view, draftEnd)).toBe('Exodus 16:13');
    expect(pillText(getState())).toBe('Exodus 16:13');
  });

  it('places the caret correctly when canonicalization LENGTHENS the text', () => {
    // "exo 16:13" (9 chars) commits as "Exodus 16:13" (12) — pillEnd is derived from the
    // committed reference, so the caret must land after the pill + spacer, not mid-pill.
    const { view, draftEnd, getState } = draftView('exo 16:13');
    expect(confirmScriptureDraftView(view, draftEnd)).toBe('Exodus 16:13');
    const state = getState();
    expect(pillText(state)).toBe('Exodus 16:13');
    const ranges = collectScripturePillRanges(state.doc, 'scripturePill');
    expect(ranges).toHaveLength(1);
    // Caret sits at or past the pill end (after the trailing spacer).
    expect(state.selection.from).toBeGreaterThanOrEqual(ranges[0].end);
    expect(state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('Exodus 16:13');
  });

  it('refuses to commit an out-of-canon verse and keeps the draft open', () => {
    // "Exodus 16:1315" is the dropped-dash typo; Exodus 16 has 36 verses.
    const { view, draftEnd, getState } = draftView('Exodus 16:1315');
    expect(confirmScriptureDraftView(view, draftEnd)).toBeNull();
    const state = getState();
    expect(pillText(state)).toBeNull();
    // Draft mark survives, so the text stays editable in place rather than degrading to prose.
    expect(collectScripturePillRanges(state.doc, 'scriptureDraft')).toHaveLength(1);
  });

  it('still commits the valid range the typo was meant to be', () => {
    const { view, draftEnd, getState } = draftView('Exodus 16:13-15');
    expect(confirmScriptureDraftView(view, draftEnd)).toBe('Exodus 16:13-15');
    expect(pillText(getState())).toBe('Exodus 16:13-15');
  });
});

describe('getScriptureDraftValidity', () => {
  it('reports none when there is no draft', () => {
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [draftSchema.text('just prose')]),
    ]);
    const state = EditorState.create({ doc });
    expect(getScriptureDraftValidity(state).status).toBe('none');
  });

  it('reports ready with the canonical reference', () => {
    const { view, draftEnd } = draftView('exodus 16:13');
    expect(getScriptureDraftValidity(view.state, draftEnd)).toEqual({
      status: 'ready',
      reference: 'Exodus 16:13',
    });
  });

  it('reports invalid with a human reason for an out-of-canon verse', () => {
    const { view, draftEnd } = draftView('Exodus 16:1315');
    expect(getScriptureDraftValidity(view.state, draftEnd)).toEqual({
      status: 'invalid',
      reason: 'Exodus 16 has 36 verses.',
    });
  });

  it('reports pending (not invalid) while the reference is still incomplete', () => {
    const { view, draftEnd } = draftView('Exodus');
    expect(getScriptureDraftValidity(view.state, draftEnd).status).toBe('pending');
  });
});

// ── Leading-spacer position mapping (regression guard) ─────────────────────────
//
// `ensureScripturePillSpacing` inserts a LEADING space when the pill follows a non-whitespace
// char. That shifts every position after it, so the pill boundaries must be mapped through those
// steps. Getting it wrong desyncs `markTo`, which breaks the caret-placement validation on iOS.

/** Paragraph of `leadingText` + [draftText](draft mark), i.e. a draft that follows prose. */
function draftViewAfterText(leadingText: string, draftText: string) {
  const draftMark = draftSchema.marks.scriptureDraft.create();
  const doc = draftSchema.node('doc', null, [
    draftSchema.node('paragraph', null, [
      draftSchema.text(leadingText),
      draftSchema.text(draftText, [draftMark]),
    ]),
  ]);
  let state = EditorState.create({ doc });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)));
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
    dom: { dispatchEvent: () => true },
    focus: () => {},
  };
  return { view, draftEnd: 1 + leadingText.length + draftText.length, getState: () => state };
}

describe('confirmScriptureDraftView with an inserted leading spacer', () => {
  it('lands the caret after the pill when a leading space is inserted', () => {
    // "(" before the reference is non-whitespace, so spacing inserts a space BEFORE the pill.
    const { view, draftEnd, getState } = draftViewAfterText('see(', 'Exodus 16:13');
    expect(confirmScriptureDraftView(view, draftEnd)).toBe('Exodus 16:13');

    const state = getState();
    const ranges = collectScripturePillRanges(state.doc, 'scripturePill');
    expect(ranges).toHaveLength(1);
    expect(state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('Exodus 16:13');
    // The caret must sit at/after the real pill end, not one short of it.
    expect(state.selection.from).toBeGreaterThanOrEqual(ranges[0].end);
  });

  it('still lands the caret correctly with no leading spacer', () => {
    const { view, draftEnd, getState } = draftViewAfterText('see ', 'Exodus 16:13');
    expect(confirmScriptureDraftView(view, draftEnd)).toBe('Exodus 16:13');
    const state = getState();
    const ranges = collectScripturePillRanges(state.doc, 'scripturePill');
    expect(ranges).toHaveLength(1);
    expect(state.selection.from).toBeGreaterThanOrEqual(ranges[0].end);
  });
});

// ── Backspace-to-edit: a pill becomes editable text, and is never silently destroyed ──────────

/** Paragraph containing a single committed pill, caret at the pill's trailing edge. */
function pillView(reference: string, attrs: Record<string, unknown> = {}) {
  const pillMark = draftSchema.marks.scripturePill.create({
    reference,
    noteId: 'note_1',
    translation: 'NLT',
    pillAccent: 'skyBlue',
    ...attrs,
  });
  const doc = draftSchema.node('doc', null, [
    draftSchema.node('paragraph', null, [draftSchema.text(reference, [pillMark])]),
  ]);
  let state = EditorState.create({ doc });
  const end = 1 + reference.length;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
    dom: { dispatchEvent: () => true },
    focus: () => {},
  };
  return { view, from: 1, to: end, getState: () => state };
}

function draftMarkAt(state: any, pos: number): any | null {
  let found: any = null;
  state.doc.nodesBetween(pos, pos + 1, (node: any) => {
    if (!found && node.isText) {
      found = node.marks?.find((m: any) => m.type.name === 'scriptureDraft') ?? null;
    }
    return undefined;
  });
  return found;
}

describe('editScripturePillAsDraft carries pill identity', () => {
  it('preserves translation, accent, noteId and the original reference', () => {
    const { view, from, to, getState } = pillView('Exodus 16:13-15');
    expect(editScripturePillAsDraft(view, from, to)).toBe(true);

    const mark = draftMarkAt(getState(), from);
    expect(mark).not.toBeNull();
    expect(mark.attrs.translation).toBe('NLT');
    expect(mark.attrs.pillAccent).toBe('skyBlue');
    // Without noteId the pill would come back as 'pending' and lose its persisted identity.
    expect(mark.attrs.noteId).toBe('note_1');
    expect(mark.attrs.originalReference).toBe('Exodus 16:13-15');
    // The pill mark is gone — the text is now ordinary editable content.
    expect(collectScripturePillRanges(getState().doc, 'scripturePill')).toHaveLength(0);
  });

  it('re-confirming an untouched edit-draft restores the pill with its noteId intact', () => {
    const { view, from, to, getState } = pillView('Exodus 16:13-15');
    editScripturePillAsDraft(view, from, to);
    expect(confirmScriptureDraftView(view, to)).toBe('Exodus 16:13-15');

    const state = getState();
    expect(pillText(state)).toBe('Exodus 16:13-15');
    expect(pillMark(state)?.attrs.noteId).toBe('note_1');
    expect(pillMark(state)?.attrs.translation).toBe('NLT');
    expect(pillMark(state)?.attrs.pillAccent).toBe('skyBlue');
  });
});

describe('abandoning an edit-draft does not destroy the pill', () => {
  it('restores the original pill when the edited text no longer parses', () => {
    const { view, from, to, getState } = pillView('Exodus 16:13-15');
    editScripturePillAsDraft(view, from, to);

    // Chop the reference down to something unparseable, as backspacing would.
    let state = getState();
    view.dispatch(state.tr.delete(from + 6, to));
    const brokenEnd = from + 6;

    expect(confirmScriptureDraftView(view, brokenEnd)).toBeNull();
    // Restored, not degraded to prose.
    expect(pillText(getState())).toBe('Exodus 16:13-15');
    expect(pillMark(getState())?.attrs.noteId).toBe('note_1');
  });

  it('Escape on an edit-draft restores the pill rather than leaving plain text', () => {
    const { view, from, to, getState } = pillView('Exodus 16:13-15');
    editScripturePillAsDraft(view, from, to);
    expect(cancelScriptureDraftView(view)).toBe(true);
    expect(pillText(getState())).toBe('Exodus 16:13-15');
  });

  it('does NOT restore once the user has erased the reference (deletion must still work)', () => {
    const { view, from, to, getState } = pillView('Exodus 16:13-15');
    editScripturePillAsDraft(view, from, to);
    // Erase every character — the friction model says this is how you delete a pill.
    view.dispatch(getState().tr.delete(from, to));
    expect(restoreScripturePillFromDraft(view, from, from)).toBe(false);
    expect(pillText(getState())).toBeNull();
    expect(getState().doc.textContent).toBe('');
  });

  it('leaves a from-scratch draft alone (no pill to restore)', () => {
    const { view, draftEnd, getState } = draftView('not a reference at all');
    expect(confirmScriptureDraftView(view, draftEnd)).toBeNull();
    // Degrades to plain prose, exactly as before.
    expect(pillText(getState())).toBeNull();
    expect(getState().doc.textContent).toContain('not a reference at all');
  });
});
