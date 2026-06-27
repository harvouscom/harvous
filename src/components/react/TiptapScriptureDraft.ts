import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import {
  detectScriptureReferences,
  matchAnchoredTrailingTranslationAbbreviation,
} from '@/utils/scripture-detector';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { collectScripturePillRanges, ensureScripturePillSpacing } from '@/utils/scripture-pill-spacing';

/**
 * Inline "edit-mode" scripture reference. Unlike the committed `scripturePill` mark
 * (inclusive:false, excludes:'_'), the draft is **inclusive** so characters typed at its
 * right edge join it — the user types the whole reference (e.g. `Exodus 5:1-2`) inside one
 * contiguous, editable region, then confirms. Confirming rebuilds the text into a clean
 * normalized committed pill, so no stray-space can appear.
 *
 * The ✓ confirm affordance is rendered OUTSIDE the editor as a floating button (see the
 * scripture-draft floating button in TiptapEditor.tsx) — never as an inline
 * `contentEditable=false` widget, which iOS Safari refuses to type next to.
 *
 * Drafts are ephemeral: `parseHTML` matches nothing, so a draft that happens to get
 * serialized (e.g. an unconfirmed draft at autosave) re-hydrates as plain text, never as a
 * draft or a pill.
 */

/** Custom DOM event fired on the editor view after a draft commits to a pill. */
export const SCRIPTURE_DRAFT_CONFIRMED_EVENT = 'scriptureDraftConfirmed';

export interface ScriptureDraftOptions {
  HTMLAttributes: Record<string, any>;
}

const DRAFT_STYLE =
  'border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; font-style: normal; font-size: inherit; vertical-align: baseline; line-height: inherit; white-space: normal;';

export const ScriptureDraft = Mark.create<ScriptureDraftOptions>({
  name: 'scriptureDraft',

  // Non-inclusive: typed characters at the edge do NOT join the draft. On iOS, growing an
  // inclusive mark mid-type splits into multiple draft pills (e.g. "Exodus 5:1" + "-2"); instead
  // the draft stays fixed to the detected reference, range tails stay plain text, and confirm
  // (extendRangeOverTrailingContinuation) absorbs them into one clean committed pill.
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  // Carried from the pill being edited (backspace → Edit) so a re-confirm preserves them.
  // Ephemeral like the mark itself — never parsed from saved HTML. `translation` also renders
  // the NLT/ESV label so it stays visible while editing.
  addAttributes() {
    return {
      translation: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attrs: any) =>
          attrs.translation
            ? {
                'data-scripture-translation': attrs.translation,
                'data-scripture-translation-label': getTranslationAbbreviationDisplay(attrs.translation),
              }
            : {},
      },
      pillAccent: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  // Ephemeral: never re-hydrate a draft from saved HTML — load its text as plain text.
  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: 'scripture-pill scripture-pill-draft',
        style: DRAFT_STYLE,
      },
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [makeScriptureDraftGrowPlugin()];
  },
});

/**
 * Plugin that keeps the draft mark covering the full reference-in-progress: after each edit it
 * extends the mark over any trailing reference-continuation chars (e.g. the "-2" of a range) that
 * landed as plain text. Re-derives the span from the text every transaction, so it never relies on
 * iOS preserving an inclusive mark across keystrokes (which split into multiple draft pills) — the
 * mark is non-inclusive and one `addMark` over the whole span keeps it a single pill.
 */
export function makeScriptureDraftGrowPlugin() {
  return new Plugin({
    key: new PluginKey('scriptureDraftGrow'),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null;
      const draftType = newState.schema.marks.scriptureDraft;
      if (!draftType) return null;
      const growth = computeScriptureDraftGrowth(newState.doc, newState.selection.from);
      if (!growth) return null;
      // Reuse the existing draft's attrs (e.g. a carried translation) so the regrown span has
      // identical marks and merges into one pill instead of splitting.
      const existing = getMarkInstanceAt(newState.doc, growth.from, draftType);
      const tr = newState.tr;
      tr.addMark(growth.from, growth.to, draftType.create(existing ? { ...existing.attrs } : {}));
      tr.setMeta('addToHistory', false);
      return tr;
    },
  });
}

/** The mark instance of `markType` on the text node at `pos` (or just after it), or null. */
function getMarkInstanceAt(doc: any, pos: number, markType: any): any | null {
  let found: any = null;
  const to = Math.min(pos + 1, doc.content.size);
  doc.nodesBetween(pos, Math.max(to, pos), (node: any) => {
    if (found) return false;
    if (node.isText) {
      const m = node.marks.find((mk: any) => mk.type === markType);
      if (m) found = m;
    }
    return undefined;
  });
  return found;
}

// ── Range helpers ─────────────────────────────────────────────────────────────

/** Resolve the draft mark range covering (or ending at) `pos`. */
function findDraftRange(state: any, pos: number): { from: number; to: number } | null {
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return null;
  const size = state.doc.content.size;
  const candidates = [pos, pos - 1].filter((p) => p >= 0 && p <= size);
  for (const p of candidates) {
    try {
      const range = getMarkRange(state.doc.resolve(p), draftType);
      if (range && typeof range.from === 'number' && typeof range.to === 'number') {
        return { from: range.from, to: range.to };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Current draft range at the collapsed caret, or null. */
export function getScriptureDraftRange(state: any): { from: number; to: number } | null {
  return findDraftRange(state, state.selection.from);
}

export function isInsideScriptureDraft(state: any): boolean {
  return getScriptureDraftRange(state) != null;
}

/**
 * End position of the draft to anchor the floating ✓ confirm button to (the one nearest the
 * caret), or null when there is no draft. The button is rendered outside the editor.
 */
export function getScriptureDraftAnchorPos(state: any): number | null {
  const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const caret = state.selection.from;
  const target = ranges.reduce(
    (best, r) => (Math.abs(r.end - caret) < Math.abs(best.end - caret) ? r : best),
    ranges[0],
  );
  // Anchor past any range tail typed as plain text after the draft (e.g. the "-2" of a range)
  // so the ✓ sits at the end of the reference-in-progress, not between the pill and the tail.
  return extendRangeOverTrailingContinuation(state.doc, target.end);
}

/**
 * The draft pill's DOM element nearest `pos`, for anchoring the floating ✓ inline beside the pill.
 * Walks up from the DOM node at the position to the enclosing `.scripture-pill-draft` span; falls
 * back to the first draft span in the editor. Returns null when no draft span is in the DOM yet.
 * Used instead of `coordsAtPos` (a thin caret box that renders the ✓ above the taller pill on iOS).
 */
export function getScriptureDraftAnchorElement(view: any, pos: number): HTMLElement | null {
  try {
    const { node } = view.domAtPos(Math.max(pos - 1, 0));
    let el: Node | null = node;
    while (el && el !== view.dom) {
      if (el instanceof HTMLElement && el.classList?.contains('scripture-pill-draft')) {
        return el;
      }
      el = el.parentNode;
    }
  } catch {
    /* fall through to query fallback */
  }
  try {
    const found = view.dom?.querySelector?.('.scripture-pill-draft');
    return found instanceof HTMLElement ? found : null;
  } catch {
    return null;
  }
}

/** True when the doc contains a draft mark whose range does NOT contain the caret. */
export function findDetachedScriptureDraft(state: any): { from: number; to: number } | null {
  const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const caret = state.selection.from;
  for (const r of ranges) {
    if (caret < r.start || caret > r.end) return { from: r.start, to: r.end };
  }
  return null;
}

// ── Text → reference ───────────────────────────────────────────────────────────

/**
 * Resolve raw draft text into a committed reference string, or null if it isn't a valid
 * reference yet. Uses the shared detector so the result matches the rest of the app: a
 * chapter-only reference (e.g. `Exodus 5`) stays chapter-only, and ranges are canonicalized
 * (`Exodus 4:18-20`). Picks the reference that covers the most of the typed text.
 */
export function draftTextToReference(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const refs = detectScriptureReferences(trimmed);
  if (refs.length === 0) return null;
  return refs.reduce((a, b) => (b.reference.length > a.reference.length ? b : a)).reference;
}

// ── Mutations ───────────────────────────────────────────────────────────────────

/** Wrap [from, to) in the draft mark and place the caret at its (inclusive) end. */
export function enterScriptureDraftView(view: any, from: number, to: number): boolean {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType || to <= from) return false;

  let blocked = false;
  state.doc.nodesBetween(from, to, (node: any) => {
    if (
      node.isText &&
      node.marks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'scriptureDraft')
    ) {
      blocked = true;
    }
  });
  if (blocked) return false;

  const sel = state.selection;
  const caretInside = sel.empty && sel.from >= from && sel.from <= to;
  const tr = state.tr;
  tr.addMark(from, to, draftType.create({}));
  // Snap the caret to the draft end when it's still within the detected range, but do NOT
  // store the draft mark — the draft is non-inclusive, so anything typed next (a range tail
  // like "-2") stays plain text and is absorbed at confirm. This avoids the iOS multi-pill split.
  if (caretInside) {
    tr.setSelection(TextSelection.create(tr.doc, to));
    tr.setStoredMarks([]);
  }
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}

/**
 * Convert a committed `scripturePill` over [from, to) back into an inline `scriptureDraft` so the
 * user can fix/extend the reference in place and re-confirm via the floating ✓. Used by the
 * pill's delete floater "Edit" action.
 */
export function editScripturePillAsDraft(view: any, from: number, to: number): boolean {
  const { state } = view;
  const pillType = state.schema.marks.scripturePill;
  const draftType = state.schema.marks.scriptureDraft;
  if (!pillType || !draftType || to <= from) return false;
  // Carry the pill's translation + accent into the draft so a re-confirm preserves them.
  const pillMark = getMarkInstanceAt(state.doc, from, pillType);
  const carried = pillMark
    ? { translation: pillMark.attrs.translation ?? null, pillAccent: pillMark.attrs.pillAccent ?? null }
    : {};
  const tr = state.tr;
  tr.removeMark(from, to, pillType);
  tr.addMark(from, to, draftType.create(carried));
  tr.setSelection(TextSelection.create(tr.doc, to));
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  try {
    view.focus();
  } catch {
    /* ignore */
  }
  return true;
}

/** Reference-continuation characters that can trail a draft (verse/range punctuation). */
const DRAFT_CONTINUATION_RE = /[\d:,\-–—]/;

/**
 * Extend `to` forward over a contiguous run of reference-continuation chars in the same
 * textblock. On iOS the stored draft mark is sometimes dropped, so the range tail (e.g. the
 * `-3` of `Psalm 27:1-3`) lands as plain text just after the draft; this lets confirm absorb
 * it. Capped so it never runs away across the block.
 */
function extendRangeOverTrailingContinuation(doc: any, to: number, maxScan = 12): number {
  let end = to;
  let blockEnd: number;
  try {
    const $to = doc.resolve(to);
    blockEnd = $to.end($to.depth);
  } catch {
    return to;
  }
  let scanned = 0;
  while (end < blockEnd && scanned < maxScan) {
    const ch = doc.textBetween(end, end + 1);
    if (!ch || !DRAFT_CONTINUATION_RE.test(ch)) break;
    end += 1;
    scanned += 1;
  }
  return end;
}

/**
 * The mark range the draft should grow to so the pill visually covers the full
 * reference-in-progress, or null when it already does. Anchors on the draft nearest the caret
 * and extends over any trailing reference-continuation chars typed as plain text. The plugin
 * (addProseMirrorPlugins) applies this as one `addMark`, keeping the draft a single pill
 * regardless of how iOS applied marks to the typed characters.
 */
export function computeScriptureDraftGrowth(
  doc: any,
  caret: number,
): { from: number; to: number } | null {
  const ranges = collectScripturePillRanges(doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const anchor = ranges.reduce(
    (best, r) => (Math.abs(r.end - caret) < Math.abs(best.end - caret) ? r : best),
    ranges[0],
  );
  const to = extendRangeOverTrailingContinuation(doc, anchor.end);
  // Already a single contiguous range with nothing more to absorb.
  if (ranges.length === 1 && anchor.end === to) return null;
  return { from: anchor.start, to };
}

/**
 * Confirm the draft at `atPos` (or the caret). Valid → commit a clean `scripturePill` with one
 * trailing space and caret after it; returns the committed reference. Invalid/empty → drop the
 * draft mark (text stays plain) and return null. Pass `{ focus: true }` for user-initiated
 * confirms (✓ button / typed continuation) so the caret renders immediately on iOS — never
 * from the blur path, which would fight the user leaving the field.
 */
export function confirmScriptureDraftView(
  view: any,
  atPos?: number,
  opts?: { focus?: boolean },
): string | null {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  const pillType = state.schema.marks.scripturePill;
  if (!draftType || !pillType) return null;

  const range = findDraftRange(state, atPos ?? state.selection.from);
  if (!range) return null;

  // Absorb any range tail that ended up as plain text just after the draft (iOS).
  const effectiveTo = Math.max(range.to, extendRangeOverTrailingContinuation(state.doc, range.to));
  const rawText = state.doc.textBetween(range.from, effectiveTo);
  const reference = draftTextToReference(rawText);
  const tr = state.tr;

  if (!reference) {
    // Not a valid reference — strip the draft styling, keep the typed text as prose.
    tr.removeMark(range.from, range.to, draftType);
    tr.setStoredMarks([]);
    tr.setMeta('addToHistory', true);
    view.dispatch(tr);
    return null;
  }

  // Preserve the translation/accent carried in from the pill being edited (backspace → Edit).
  const carried = getMarkInstanceAt(state.doc, range.from, draftType);
  let translation = carried?.attrs?.translation ?? null;
  let consumeTo = effectiveTo;
  // Consume a typed trailing translation abbreviation (e.g. "Exodus 5:6-9 ESV") so typing one
  // sets/overrides the pill translation. (The space-confirm path uses the pending-translation flow.)
  try {
    const $end = state.doc.resolve(effectiveTo);
    const blockEnd = $end.end($end.depth);
    if (effectiveTo < blockEnd) {
      const trailing = matchAnchoredTrailingTranslationAbbreviation(
        state.doc.textBetween(effectiveTo, blockEnd),
      );
      if (trailing) {
        translation = trailing.canonicalId;
        consumeTo = effectiveTo + trailing.consumed.length;
      }
    }
  } catch {
    /* ignore */
  }
  if (!translation) {
    translation = getEffectiveDefaultTranslation();
  }
  const pillNode = state.schema.text(reference, [
    pillType.create({
      reference,
      noteId: 'pending',
      translation,
      pillAccent: carried?.attrs?.pillAccent ?? null,
    }),
  ]);
  tr.replaceWith(range.from, consumeTo, pillNode);

  const pillEnd = range.from + reference.length;
  // One trailing spacer so prose after the pill is editable (shared pill-spacing rule).
  ensureScripturePillSpacing(tr);

  let caret = pillEnd;
  const charAfter = tr.doc.textBetween(pillEnd, Math.min(pillEnd + 1, tr.doc.content.size));
  if (charAfter === ' ') caret = pillEnd + 1;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, tr.doc.content.size)));
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);

  if (opts?.focus) {
    try {
      view.focus();
    } catch {
      /* ignore */
    }
  }

  try {
    view.dom.dispatchEvent(
      new CustomEvent(SCRIPTURE_DRAFT_CONFIRMED_EVENT, { detail: { reference }, bubbles: true }),
    );
  } catch {
    /* ignore */
  }
  return reference;
}

/**
 * Confirm whichever draft currently exists, preferring the one nearest the caret. Robust to
 * a stale widget position (the ✓ button calls this as a fallback) since it locates the draft
 * from the live document rather than a captured offset.
 */
export function confirmAnyScriptureDraftView(view: any): string | null {
  const ranges = collectScripturePillRanges(view.state.doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const caret = view.state.selection.from;
  const dist = (r: { start: number; end: number }) =>
    Math.min(Math.abs(r.end - caret), Math.abs(r.start - caret));
  const target = ranges.reduce((best, r) => (dist(r) < dist(best) ? r : best), ranges[0]);
  return confirmScriptureDraftView(view, target.end, { focus: true });
}

/** Drop the draft mark at the caret, leaving the text as plain prose (Escape). */
export function cancelScriptureDraftView(view: any): boolean {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return false;
  const range = getScriptureDraftRange(state);
  if (!range) return false;
  const tr = state.tr;
  tr.removeMark(range.from, range.to, draftType);
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}
