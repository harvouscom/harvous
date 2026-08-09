import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import {
  canonicalizeScriptureReferenceDisplay,
  checkScriptureReferenceValidity,
  detectScriptureReferences,
  matchAnchoredTrailingTranslationAbbreviation,
  type ScriptureReferenceValidity,
} from '@/utils/scripture-detector';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { collectScripturePillRanges, ensureScripturePillSpacing } from '@/utils/scripture-pill-spacing';
import { hasBlockGapAfter } from '@/utils/scripture-pill-block-gaps';
import { isMobileDevice } from '@/utils/pwa-prompt';

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

/**
 * The draft is TEXT BEING EDITED, not an atomic chip — so unlike the committed pill it must be a
 * valid caret host: `display: inline` with selectable text.
 *
 * An `inline-flex` box with `user-select: none` (what the committed `.scripture-pill` is, and what
 * the draft used to inherit) gives iOS nowhere legitimate to paint a caret, which is the root of
 * the "caret jumps to the far right of the line" reports and the reason the whole
 * `resyncMobileCaret` / `setNativeSelectionAfterInlinePill` machinery exists.
 *
 * `box-decoration-break: clone` keeps the dashed border closed on both fragments if the reference
 * wraps. Vertical padding is 0 because padding on an inline box paints without contributing to
 * line height, so it would overlap adjacent lines.
 */
const DRAFT_STYLE =
  'border-radius: 12px; padding: 0 6px; display: inline; -webkit-box-decoration-break: clone; box-decoration-break: clone; -webkit-user-select: text; user-select: text; font-weight: 500; font-style: normal; font-size: inherit; vertical-align: baseline; line-height: inherit; white-space: normal;';

export const ScriptureDraft = Mark.create<ScriptureDraftOptions>({
  name: 'scriptureDraft',

  // Non-inclusive: typed characters at the edge do NOT join the draft. On iOS, growing an
  // inclusive mark mid-type splits into multiple draft pills (e.g. "Exodus 5:1" + "-2"); instead
  // the draft stays fixed to the detected reference, range tails stay plain text, and confirm
  // (extendRangeOverTrailingContinuation) absorbs them into one clean committed pill.
  inclusive: false,
  excludes: 'bold italic',

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
      // Set only when this draft came from an existing committed pill (Backspace-to-edit). It lets
      // an abandoned or invalidated edit RESTORE the pill instead of degrading it to plain prose —
      // otherwise backspacing into a pill and tapping away would silently destroy it.
      originalReference: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      // Carried so a round-trip through the draft doesn't reset a persisted pill to 'pending'.
      noteId: {
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
    return [makeScriptureDraftGrowPlugin(), makeScriptureDraftInvalidInputGuard()];
  },
});

/**
 * Build the single `addMark` that grows/merges the draft to cover the full reference-in-progress
 * (re-derived from the text), or null when nothing needs changing. `computeScriptureDraftGrowth`
 * already merges split fragments into one run anchored at the first fragment, so one `addMark` over
 * that span (covering the `-`/gap between fragments) collapses them into a single pill — no
 * `removeMark` needed, which keeps the DOM mutation minimal.
 */
/**
 * An edit-draft whose digits are all gone is an intentional un-pill, not an edit in
 * progress. `restoreScripturePillFromDraft` already treats *emptied* text as deliberate
 * deletion; this extends the same reading to "book name left, numbers deleted" — the case
 * where users reported being unable to fully delete a pill, because tapping away restored
 * it. From-scratch drafts (no originalReference) are exempt: "Exodus" with no digits yet
 * is just someone mid-typing a reference.
 */
export function draftShouldDissolveOnDigitsRemoved(
  text: string,
  hasOriginalReference: boolean,
): boolean {
  return hasOriginalReference && !/\d/.test(text);
}

/** Dissolve tr for a draft that should stop being a draft: plain text, no formatting. */
function buildDraftDissolveTr(state: any, from: number, to: number): any {
  const draftType = state.schema.marks.scriptureDraft;
  const tr = state.tr;
  tr.removeMark(from, to, draftType);
  stripProseFormattingFromDraftSpan(tr, state, from, to);
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  return tr;
}

/** First draft in the doc that qualifies for the digits-removed dissolve, or null. */
function findDigitsRemovedDissolveTarget(state: any): { from: number; to: number } | null {
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return null;
  const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
  for (const r of ranges) {
    const mark = getMarkInstanceAt(state.doc, r.start, draftType);
    const text = state.doc.textBetween(r.start, r.end);
    if (draftShouldDissolveOnDigitsRemoved(text, Boolean(mark?.attrs?.originalReference))) {
      return { from: r.start, to: r.end };
    }
  }
  return null;
}

function buildScriptureDraftGrowthTr(state: any): any | null {
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return null;
  const growth = computeScriptureDraftGrowth(state.doc, state.selection.from);
  if (!growth) return null;
  // Reuse the anchor draft's attrs (e.g. a carried translation) so the regrown span keeps them.
  const existing = getMarkInstanceAt(state.doc, growth.from, draftType);
  const tr = state.tr;
  tr.addMark(growth.from, growth.to, draftType.create(existing ? { ...existing.attrs } : {}));
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', false);
  return tr;
}

/**
 * Plugin that keeps the draft mark covering the full reference-in-progress: after each edit it
 * extends the mark over any trailing reference-continuation chars (e.g. the "-2" of a range) that
 * landed as plain text.
 *
 * DESKTOP ONLY. On iOS, mutating the draft mark on every keystroke desyncs the contenteditable —
 * the just-typed char paints detached (under the floating ✓ / far right) and the caret jumps. So on
 * mobile this returns null and the draft is grown on a debounced idle pass instead
 * (`unifyScriptureDraftAtCursor`, driven by the editor's mobile onUpdate timer), keeping the range
 * tail as plain text mid-type and snapping it into the pill once the user pauses.
 */
export function makeScriptureDraftGrowPlugin() {
  return new Plugin({
    key: new PluginKey('scriptureDraftGrow'),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null;
      // Dissolve runs on BOTH platforms (unlike growth): it fires once per deletion
      // gesture rather than per keystroke, so the iOS every-keystroke desync that keeps
      // growth desktop-only doesn't apply.
      const dissolve = findDigitsRemovedDissolveTarget(newState);
      if (dissolve) return buildDraftDissolveTr(newState, dissolve.from, dissolve.to);
      if (isMobileDevice()) return null;
      return buildScriptureDraftGrowthTr(newState);
    },
  });
}

/**
 * Mobile (debounced) equivalent of the grow plugin: grow/merge the draft into one contiguous span
 * NOW, as a single dispatch. Called from the editor's mobile onUpdate idle timer so the draft snaps
 * to include a range tail once the user pauses, instead of mutating on every keystroke (which iOS
 * can't keep in sync). Returns true if it changed the doc.
 */
export function unifyScriptureDraftAtCursor(view: any): boolean {
  if (!view || !view.state) return false;
  const caret = view.state.selection.from;
  const growth = computeScriptureDraftGrowth(view.state.doc, caret);
  if (!growth) return false;
  const tr = buildScriptureDraftGrowthTr(view.state);
  if (!tr) return false;
  view.dispatch(tr);
  if (isMobileDevice()) {
    const pos = Math.min(Math.max(caret, growth.to), view.state.doc.content.size);
    const focusTr = view.state.tr
      .setSelection(TextSelection.create(view.state.doc, pos))
      .setStoredMarks([])
      .setMeta('addToHistory', false);
    view.dispatch(focusTr);
    try {
      view.focus();
    } catch {
      /* ignore */
    }
  }
  return true;
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

/** True when an inline scripture draft is in progress. */
export function hasActiveScriptureDraft(state: any): boolean {
  return getScriptureDraftAnchorPos(state) != null;
}

/**
 * True when reference-continuation chars exist as plain text immediately after the draft end
 * (e.g. `-10` typed after `Numbers 5:5`). Used to avoid blur-confirming a partial reference
 * while the user is switching keyboards to reach the dash key.
 */
export function hasDraftContinuationTailInDoc(state: any, draftTo: number): boolean {
  try {
    const size = state.doc.content.size;
    if (draftTo >= size) return false;
    const $to = state.doc.resolve(Math.min(draftTo, size - 1));
    const blockEnd = $to.end($to.depth);
    if (draftTo >= blockEnd) return false;
    const slice = state.doc.textBetween(draftTo, blockEnd);
    return /^[\d:,\-–—]/.test(slice);
  } catch {
    return false;
  }
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

/** Reference-continuation characters that can trail a draft (verse/range punctuation). */
const DRAFT_CONTINUATION_RE = /[\d:,\-–—]/;

/**
 * True when the caret is inside a draft or typing a reference-continuation tail after it (e.g. the
 * `-18` of a range as plain text). Used so we do not treat the draft as "detached" mid-range.
 */
function isCaretAttachedToScriptureDraft(state: any, from: number, to: number): boolean {
  const caret = state.selection.from;
  if (caret >= from && caret <= to) return true;
  if (caret <= to) return false;
  try {
    const gap = state.doc.textBetween(to, caret);
    const $from = state.doc.resolve(from);
    const $caret = state.doc.resolve(caret);
    if ($from.start($from.depth) !== $caret.start($caret.depth)) return false;
    if (gap === '') return true;
    return /^[\d:,\-–—]+$/.test(gap);
  } catch {
    return false;
  }
}

/** True when the doc contains a draft whose range does NOT contain the caret (or its range tail). */
export function findDetachedScriptureDraft(state: any): { from: number; to: number } | null {
  const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  for (const r of ranges) {
    if (isCaretAttachedToScriptureDraft(state, r.start, r.end)) return null;
  }
  const caret = state.selection.from;
  const dist = (r: { start: number; end: number }) =>
    Math.min(Math.abs(r.end - caret), Math.abs(r.start - caret));
  const target = ranges.reduce((best, r) => (dist(r) < dist(best) ? r : best), ranges[0]);
  return { from: target.start, to: target.end };
}

// ── Text → reference ───────────────────────────────────────────────────────────

/**
 * Resolve raw draft text into a committed reference string, or null if it isn't a valid
 * reference yet. Uses the shared detector so the result matches the rest of the app: a
 * chapter-only reference (e.g. `Exodus 5`) stays chapter-only, and ranges are canonicalized
 * (`Exodus 4:18-20`). Picks the reference that covers the most of the typed text.
 *
 * The detector returns the raw matched text, so the winner is put through
 * `canonicalizeScriptureReferenceDisplay` — that is what turns a typed `exodus 16:13` into the
 * pill text `Exodus 16:13`. Note it canonicalizes the BOOK NAME only; the shape-expanding
 * `normalizeScriptureReference` would turn a chapter-only `Psalms 23` into `Psalms 23:1-6`.
 * Canonicalize after picking the winner — canonicalization changes string length, which would
 * otherwise skew the longest-match comparison.
 */
export function draftTextToReference(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const refs = detectScriptureReferences(trimmed);
  if (refs.length === 0) return null;
  const winner = refs.reduce((a, b) => (b.reference.length > a.reference.length ? b : a)).reference;
  return canonicalizeScriptureReferenceDisplay(winner);
}

/**
 * Whether the draft at `atPos` (or the caret) would commit, and why not when it wouldn't.
 *
 * Mirrors the gate inside `confirmScriptureDraftView` so the floating ✓ can show an invalid state
 * with a reason ("Exodus 16 has 36 verses.") instead of silently doing nothing when tapped.
 * `pending` means the reference is still incomplete — normal mid-typing, not an error to surface.
 */
export type ScriptureDraftCommitState =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'ready'; reference: string }
  | { status: 'invalid'; reason: string };

export function getScriptureDraftValidity(state: any, atPos?: number): ScriptureDraftCommitState {
  const draftType = state?.schema?.marks?.scriptureDraft;
  if (!draftType) return { status: 'none' };
  const range = findDraftRange(state, atPos ?? state.selection.from);
  if (!range) return { status: 'none' };

  const effectiveTo = Math.max(range.to, extendRangeOverTrailingContinuation(state.doc, range.to));
  const reference = draftTextToReference(state.doc.textBetween(range.from, effectiveTo));
  if (!reference) return { status: 'pending' };

  const validity: ScriptureReferenceValidity = checkScriptureReferenceValidity(reference);
  if (validity.ok) return { status: 'ready', reference };
  return { status: 'invalid', reason: validity.reason };
}

// ── Invalid-draft input guard ──────────────────────────────────────────────────

/**
 * Decide whether a character typed into an already-invalid draft should be accepted.
 *
 * Blocking everything would trap the user: inserting the "-" of `16:1-20` into the
 * invalid `16:120` is a repair and must go through. So the rule is simulation, not
 * category: apply the insertion to the draft text and re-validate. Only input that
 * leaves the reference parseable-but-still-invalid is refused — you cannot dig the
 * hole deeper, but any keystroke that fills it works.
 *
 * Whitespace is always allowed, for two reasons: on iOS, intercepting the space key —
 * even by returning false — breaks native double-space-to-period; and a space after an
 * invalid draft is the "I'm moving on" gesture that detaches the caret, which is the
 * moment the abandon path finalizes the draft (restore or plain prose).
 */
export function scriptureDraftInputDecision(
  currentText: string,
  offsetFrom: number,
  offsetTo: number,
  inserted: string,
  opts?: {
    /**
     * 'block' (desktop): a space into an invalid draft shakes like any other refused
     * key — the user asked for the lock to include it; leaving is done by click/arrow.
     * 'allow' (iOS): intercepting space breaks native double-space-to-period, so there
     * the space passes and the detach->finalize path resolves the draft instead.
     */
    whitespace?: 'allow' | 'block';
  },
): 'allow' | 'block' {
  if (/^\s*$/.test(inserted) && (opts?.whitespace ?? 'allow') === 'allow') return 'allow';
  const currentRef = draftTextToReference(currentText);
  if (!currentRef || checkScriptureReferenceValidity(currentRef).ok) return 'allow';
  const clampedFrom = Math.max(0, Math.min(offsetFrom, currentText.length));
  const clampedTo = Math.max(clampedFrom, Math.min(offsetTo, currentText.length));
  const next = currentText.slice(0, clampedFrom) + inserted + currentText.slice(clampedTo);
  const nextRef = draftTextToReference(next);
  if (!nextRef) return 'allow'; // no longer parses -> back to pending, a repair in progress
  return checkScriptureReferenceValidity(nextRef).ok ? 'allow' : 'block';
}

const DRAFT_SHAKE_CLASS = 'scripture-pill-draft--shake';

/** Head-shake the draft element. Re-triggerable: reflow between remove/add restarts it. */
function shakeScriptureDraftElement(view: any, from: number): void {
  try {
    const el = getScriptureDraftAnchorElement(view, from);
    if (!el) return;
    el.classList.remove(DRAFT_SHAKE_CLASS);
    // Force a reflow so a second blocked keystroke restarts the animation.
    void el.offsetWidth;
    el.classList.add(DRAFT_SHAKE_CLASS);
    window.setTimeout(() => el.classList.remove(DRAFT_SHAKE_CLASS), 350);
  } catch {
    /* animation is decoration; never let it break input handling */
  }
}

let lastInvalidDraftToast = { reason: '', at: 0 };

/** Toast the canon reason ("Exodus 16 has 36 verses.") once per episode, not per keystroke. */
function toastInvalidDraftReason(reason: string): void {
  const now = Date.now();
  if (reason === lastInvalidDraftToast.reason && now - lastInvalidDraftToast.at < 5_000) return;
  lastInvalidDraftToast = { reason, at: now };
  try {
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { message: reason, type: 'warning' } }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Plugin blocking input that would keep an invalid draft invalid, with a shake and a
 * throttled reason toast. handleTextInput only sees text insertion, so Backspace/Delete
 * and caret movement are inherently unaffected — the user can always fix or leave.
 */
export function makeScriptureDraftInvalidInputGuard() {
  return new Plugin({
    key: new PluginKey('scriptureDraftInvalidInputGuard'),
    props: {
      handleTextInput(view: any, from: number, to: number, text: string) {
        const state = view.state;
        const range = findDraftRange(state, state.selection.from);
        if (!range) return false;
        const effectiveTo = Math.max(range.to, extendRangeOverTrailingContinuation(state.doc, range.to));
        if (from < range.from || from > effectiveTo) return false;
        const currentText = state.doc.textBetween(range.from, effectiveTo);
        const decision = scriptureDraftInputDecision(
          currentText,
          from - range.from,
          to - range.from,
          text,
          { whitespace: isMobileDevice() ? 'allow' : 'block' },
        );
        if (decision === 'allow') return false;
        const validity = getScriptureDraftValidity(state, range.from);
        if (validity.status === 'invalid') toastInvalidDraftReason(validity.reason);
        shakeScriptureDraftElement(view, range.from);
        return true;
      },
    },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────────

/**
 * True when it is safe to resync the native caret on draft idle (✓ re-show). Skips mid-range tail
 * typing — that path uses `scheduleMobileDraftTailCaretSync` instead.
 */
export function canSafelyResyncMobileDraftIdleCaret(state: any): boolean {
  if (!isMobileDevice()) return false;
  const range = getScriptureDraftRange(state);
  if (!range) return false;
  if (hasDraftContinuationTailInDoc(state, range.to)) return false;
  const anchor = getScriptureDraftAnchorPos(state);
  if (anchor == null) return false;
  return state.selection.from === anchor;
}

function setNativeSelection(node: Node, offset: number): boolean {
  try {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel) return false;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

/** Trailing plain-text offset after a pill/draft mark end — used for native caret placement. */
export function trailingOffsetForPmCaret(markTo: number, targetPos: number): number {
  return targetPos - markTo;
}

function isScripturePillElement(el: HTMLElement, draft: boolean): boolean {
  if (!el.classList.contains('scripture-pill')) return false;
  return draft ? el.classList.contains('scripture-pill-draft') : !el.classList.contains('scripture-pill-draft');
}

/** Resolve pill DOM from inside the marked text — never querySelector (wrong pill on leading marks). */
function findScripturePillElementAtMark(
  view: any,
  markFrom: number,
  markTo: number,
  draft: boolean,
): HTMLElement | null {
  if (markTo <= markFrom) return null;
  try {
    const docSize = view.state.doc.content.size;
    const insidePos = Math.max(markFrom + 1, markTo - 1);
    const probe = Math.min(Math.max(insidePos, 0), Math.max(0, docSize - 1));
    const dom = view.domAtPos(probe);
    if (!dom?.node) return null;
    let el: Node | null = dom.node;
    if (el.nodeType === Node.TEXT_NODE) el = el.parentNode;
    while (el && el !== view.dom) {
      if (el instanceof HTMLElement && isScripturePillElement(el, draft)) return el;
      el = el.parentNode;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function recoveredPosAtDom(view: any, node: Node, offset: number): number | null {
  try {
    return view.posAtDOM(node, offset);
  } catch {
    return null;
  }
}

function placementMeetsMarkEnd(view: any, node: Node, offset: number, markTo: number): boolean {
  const recovered = recoveredPosAtDom(view, node, offset);
  return recovered != null && recovered >= markTo;
}

function setNativeSelectionAtParentChildIndex(parent: Node, childIndex: number): boolean {
  try {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel) return false;
    const range = document.createRange();
    range.setStart(parent, Math.min(childIndex, parent.childNodes.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

/**
 * Place the native caret just after an inline pill span (outside inline-flex), using PM markTo +
 * targetPos for the trailing offset. Validates with posAtDOM so the caret is not before the pill.
 */
function setNativeSelectionAfterInlinePill(
  view: any,
  pillEl: HTMLElement,
  markTo: number,
  targetPos: number,
): boolean {
  const trailingOffset = trailingOffsetForPmCaret(markTo, targetPos);

  const next = pillEl.nextSibling;
  if (
    next?.nodeType === Node.TEXT_NODE &&
    (pillEl.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)
  ) {
    const text = next as Text;
    const offset = Math.min(Math.max(0, trailingOffset), text.length);
    if (setNativeSelection(text, offset) && placementMeetsMarkEnd(view, text, offset, markTo)) {
      return true;
    }
  }

  const parent = pillEl.parentNode;
  if (parent) {
    const childIndex = Array.prototype.indexOf.call(parent.childNodes, pillEl);
    if (childIndex >= 0) {
      const afterIndex = childIndex + 1;
      if (setNativeSelectionAtParentChildIndex(parent, afterIndex)) {
        const sel = typeof window !== 'undefined' ? window.getSelection() : null;
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (placementMeetsMarkEnd(view, r.startContainer, r.startOffset, markTo)) return true;
        }
      }
    }
  }

  try {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel) return false;
    const range = document.createRange();
    range.setStartAfter(pillEl);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return placementMeetsMarkEnd(view, range.startContainer, range.startOffset, markTo);
  } catch {
    return false;
  }
}

type MobileCaretResyncOpts = {
  focus?: boolean;
  pos?: number;
  draftIdle?: boolean;
  markFrom?: number;
  markTo?: number;
};

function runMobileCaretResync(view: any, opts?: MobileCaretResyncOpts): void {
  try {
    if (!view || view.isDestroyed) return;
    if (opts?.focus) {
      try {
        view.focus();
      } catch {
        /* ignore */
      }
    }
    const pos = Math.min(opts?.pos ?? view.state.selection.from, view.state.doc.content.size);

    if (opts?.markFrom != null && opts?.markTo != null) {
      const draft = opts.draftIdle === true;
      if (!draft || canSafelyResyncMobileDraftIdleCaret(view.state)) {
        const pillEl = findScripturePillElementAtMark(view, opts.markFrom, opts.markTo, draft);
        if (pillEl && setNativeSelectionAfterInlinePill(view, pillEl, opts.markTo, pos)) return;
      }
    }

    try {
      const dom = view.domAtPos(pos);
      if (dom?.node) setNativeSelection(dom.node, dom.offset);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

/** Remove bold/italic from the draft span and any plain-text range tail when abandoning a draft. */
function stripProseFormattingFromDraftSpan(tr: any, state: any, from: number, to: number): void {
  const end = extendRangeOverTrailingContinuation(state.doc, to);
  const bold = state.schema.marks.bold;
  const italic = state.schema.marks.italic;
  if (bold) tr.removeMark(from, end, bold);
  if (italic) tr.removeMark(from, end, italic);
}

/**
 * iOS only: force the native caret to ProseMirror's selection position on the next frame.
 *
 * A programmatic mark change (adding/growing the draft) restructures the contenteditable, and iOS
 * leaves the *visible* caret stuck at the line end even though ProseMirror's selection is correct.
 * Re-dispatching a ProseMirror selection does NOT help — PM recorded that it already synced the DOM
 * selection (iOS moved the painted caret without telling PM), so the comparison is a no-op. We set
 * the DOM `Selection` directly instead, which is what typing a real character effectively does.
 */
export function resyncMobileCaret(view: any, opts?: MobileCaretResyncOpts): void {
  if (!isMobileDevice() || !view) return;
  // Post-confirm: wait for PM DOM patch before placing the caret outside the pill span.
  if (opts?.focus) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => runMobileCaretResync(view, opts));
    });
    return;
  }
  requestAnimationFrame(() => runMobileCaretResync(view, opts));
}

let draftTailCaretSyncRaf: number | null = null;

/**
 * iOS: after a range tail char lands as plain text past the draft mark, re-focus and re-place the
 * native caret at PM's position. Skipped on enter/unify/✓ re-show — only while continuation tail exists.
 */
export function scheduleMobileDraftTailCaretSync(view: any): void {
  if (!isMobileDevice() || !view) return;
  if (draftTailCaretSyncRaf != null) {
    cancelAnimationFrame(draftTailCaretSyncRaf);
  }
  draftTailCaretSyncRaf = requestAnimationFrame(() => {
    draftTailCaretSyncRaf = null;
    try {
      if (!view || view.isDestroyed) return;
      const range = getScriptureDraftRange(view.state);
      if (!range || !hasDraftContinuationTailInDoc(view.state, range.to)) return;
      try {
        view.focus();
      } catch {
        /* ignore */
      }
      resyncMobileCaret(view);
    } catch {
      /* ignore */
    }
  });
}

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
  if (caretInside) {
    tr.setSelection(TextSelection.create(tr.doc, to));
  }
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}

/**
 * Convert a committed `scripturePill` over [from, to) back into an inline `scriptureDraft` so the
 * user can fix/extend the reference in place and re-confirm via the floating ✓. This is what
 * Backspace on a pill does: the reference becomes ordinary editable text rather than being deleted.
 *
 * `originalReference` + `noteId` ride along so an abandoned or invalidated edit can put the pill
 * back exactly as it was (see `restoreScripturePillFromDraft`).
 */
export function editScripturePillAsDraft(view: any, from: number, to: number): boolean {
  const { state } = view;
  const pillType = state.schema.marks.scripturePill;
  const draftType = state.schema.marks.scriptureDraft;
  if (!pillType || !draftType || to <= from) return false;
  const pillMark = getMarkInstanceAt(state.doc, from, pillType);
  const carried = pillMark
    ? {
        translation: pillMark.attrs.translation ?? null,
        pillAccent: pillMark.attrs.pillAccent ?? null,
        originalReference:
          pillMark.attrs.reference ?? state.doc.textBetween(from, to),
        noteId: pillMark.attrs.noteId ?? null,
      }
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
  // A bare view.focus() is not enough on iOS after a mark mutation — the painted caret strands at
  // the line end even though PM's selection is right. Same treatment the commit path gets.
  resyncMobileCaret(view, { focus: true, pos: to, markFrom: from, markTo: to });
  return true;
}

/**
 * Put back the committed pill a draft was created from. Used when an edit-draft is abandoned or
 * ends up invalid — without this, backspacing into a pill and then tapping away would silently
 * turn it into plain prose.
 *
 * Returns false when the draft didn't come from a pill, or when the user has emptied the text
 * (deleting the reference character by character MUST be allowed to actually delete the pill).
 */
export function restoreScripturePillFromDraft(view: any, from: number, to: number): boolean {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  const pillType = state.schema.marks.scripturePill;
  if (!draftType || !pillType || to <= from) return false;

  const draftMark = getMarkInstanceAt(state.doc, from, draftType);
  const originalReference = draftMark?.attrs?.originalReference;
  if (!originalReference) return false;
  if (!state.doc.textBetween(from, to).trim()) return false;

  const tr = state.tr;
  tr.replaceWith(
    from,
    to,
    state.schema.text(originalReference, [
      pillType.create({
        reference: originalReference,
        noteId: draftMark.attrs.noteId ?? 'pending',
        translation: draftMark.attrs.translation ?? null,
        pillAccent: draftMark.attrs.pillAccent ?? null,
      }),
    ]),
  );
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}

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
 * reference-in-progress, or null when it already does.
 */
export function computeScriptureDraftGrowth(
  doc: any,
  caret: number,
): { from: number; to: number } | null {
  const ranges = collectScripturePillRanges(doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const runs: Array<{ start: number; end: number }> = [{ start: ranges[0].start, end: ranges[0].end }];
  for (let i = 1; i < ranges.length; i++) {
    const cur = runs[runs.length - 1];
    const next = ranges[i];
    const gap = doc.textBetween(cur.end, next.start);
    let sameBlock = false;
    try {
      const $cur = doc.resolve(cur.end);
      const $next = doc.resolve(next.start);
      sameBlock = $cur.start($cur.depth) === $next.start($next.depth);
    } catch {
      sameBlock = false;
    }
    if (sameBlock && (gap === '' || /^[\d:,\-–—]+$/.test(gap))) {
      cur.end = next.end;
    } else {
      runs.push({ start: next.start, end: next.end });
    }
  }
  const run = runs.reduce(
    (best, r) => (Math.abs(r.end - caret) < Math.abs(best.end - caret) ? r : best),
    runs[0],
  );
  const to = extendRangeOverTrailingContinuation(doc, run.end);
  if (ranges.length === 1 && run.start === ranges[0].start && to === ranges[0].end) return null;
  return { from: run.start, to };
}

/**
 * Confirm the draft at `atPos` (or the caret). Valid → commit a clean `scripturePill` with one
 * trailing space and caret after it; returns the committed reference.
 */
export function confirmScriptureDraftView(
  view: any,
  atPos?: number,
  opts?: {
    focus?: boolean;
    /**
     * What to do when the reference parses but fails canon validation.
     * 'keep' (default) leaves the draft open so the user can fix it in place — right for
     * the ✓ button and Enter, where they are still engaged with it. 'finalize' is for the
     * abandon paths (caret detached, blur): an edit-origin draft restores its original
     * pill, a from-scratch one drops to clean prose. Before 'finalize' existed, an
     * abandoned invalid draft simply kept its mark — a dashed, 500-weight span that
     * even serialized into saved HTML, which users read as stuck bold text.
     */
    onInvalid?: 'keep' | 'finalize';
  },
): string | null {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  const pillType = state.schema.marks.scripturePill;
  if (!draftType || !pillType) return null;

  const range = findDraftRange(state, atPos ?? state.selection.from);
  if (!range) return null;

  const effectiveTo = Math.max(range.to, extendRangeOverTrailingContinuation(state.doc, range.to));
  const rawText = state.doc.textBetween(range.from, effectiveTo);
  const reference = draftTextToReference(rawText);
  const tr = state.tr;

  const hasPlainTail = effectiveTo > range.to;
  const tailText = hasPlainTail ? state.doc.textBetween(range.to, effectiveTo) : '';
  const midRangeEntry =
    hasPlainTail &&
    /^[\d:,\-–—]+$/.test(tailText) &&
    (!reference || reference.length < rawText.trim().length);

  if (!reference || midRangeEntry) {
    if (midRangeEntry) {
      return null;
    }
    // An edit-draft that no longer parses: put the original pill back rather than dropping to
    // prose. (No-op for drafts typed from scratch, and for one the user has emptied on purpose.)
    if (restoreScripturePillFromDraft(view, range.from, range.to)) {
      return null;
    }
    tr.removeMark(range.from, range.to, draftType);
    stripProseFormattingFromDraftSpan(tr, state, range.from, range.to);
    tr.setStoredMarks([]);
    tr.setMeta('addToHistory', true);
    view.dispatch(tr);
    return null;
  }

  // The reference parses but doesn't resolve against the canon — e.g. `Exodus 16:1315`, what you
  // get when iOS swallows the `-` of a range. Committing it produces a pill the server can never
  // resolve ("Could not load this passage."), so keep the draft OPEN instead: the text stays
  // editable in place and the floating ✓ shows why it won't commit (see getScriptureDraftValidity).
  if (!checkScriptureReferenceValidity(reference).ok) {
    if (opts?.onInvalid === 'finalize') {
      if (restoreScripturePillFromDraft(view, range.from, range.to)) {
        return null;
      }
      tr.removeMark(range.from, range.to, draftType);
      stripProseFormattingFromDraftSpan(tr, state, range.from, range.to);
      tr.setStoredMarks([]);
      tr.setMeta('addToHistory', true);
      view.dispatch(tr);
    }
    return null;
  }

  const carried = getMarkInstanceAt(state.doc, range.from, draftType);
  let translation = carried?.attrs?.translation ?? null;
  let consumeTo = effectiveTo;
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
      // An edit-draft carries the note id of the pill it came from; only a genuinely new
      // reference is 'pending'. Without this, backspacing into a saved pill and re-confirming
      // would silently orphan it from its note.
      noteId: carried?.attrs?.noteId ?? 'pending',
      translation,
      pillAccent: carried?.attrs?.pillAccent ?? null,
    }),
  ]);
  tr.replaceWith(range.from, consumeTo, pillNode);

  // `ensureScripturePillSpacing` can insert a LEADING space at `range.from` (when the pill follows
  // a non-whitespace char — e.g. mid-sentence or after prior content in a list item). That shifts
  // every position after it, so map the pill boundaries through the steps it adds instead of
  // trusting the pre-spacing arithmetic. Getting this wrong desyncs `markTo`, which makes Round
  // 14's `posAtDOM >= markTo` validation fail and drops the caret onto the generic `domAtPos`
  // fallback — i.e. the far-right caret paint that Round 13/14 exist to prevent.
  const rawPillStart = range.from;
  const rawPillEnd = range.from + reference.length;
  const stepsBeforeSpacing = tr.steps.length;
  tr.setStoredMarks([]);
  ensureScripturePillSpacing(tr);
  const spacingMapping = tr.mapping.slice(stepsBeforeSpacing);
  const pillStart = spacingMapping.map(rawPillStart, 1);
  const pillEnd = spacingMapping.map(rawPillEnd, 1);

  // `ensureScripturePillSpacing` is gated on `end < blockEnd`, so a pill that ends its block gets
  // no trailing space from it — `snapCursorOutsideScripturePill` inserts one a beat later, in a
  // SEPARATE transaction fired from selectionUpdate. That is too late: `caretPos` below is already
  // captured, so the double-rAF resync then paints the native caret before the spacer while PM
  // sits after it. Own the spacer here instead, so every position the resync uses is settled by
  // the time we dispatch. (Deliberately not relaxing the gate inside `ensureScripturePillSpacing`
  // — it also runs on hydrate, where appending a space to every paragraph-final pill would rewrite
  // saved HTML across the board.)
  try {
    const $pillEnd = tr.doc.resolve(pillEnd);
    if (pillEnd === $pillEnd.end($pillEnd.depth) && !hasBlockGapAfter(tr.doc, pillEnd)) {
      tr.insertText(' ', pillEnd);
    }
  } catch {
    /* leave it to the snap handler */
  }

  let caret = pillEnd;
  const charAfter = tr.doc.textBetween(pillEnd, Math.min(pillEnd + 1, tr.doc.content.size));
  if (charAfter === ' ') caret = pillEnd + 1;
  const caretPos = Math.min(caret, tr.doc.content.size);
  tr.setSelection(TextSelection.create(tr.doc, caretPos));
  tr.setStoredMarks([]);
  tr.scrollIntoView();
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);

  if (opts?.focus) {
    resyncMobileCaret(view, {
      focus: true,
      pos: caretPos,
      markFrom: pillStart,
      markTo: pillEnd,
    });
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

export function confirmAnyScriptureDraftView(view: any): string | null {
  const ranges = collectScripturePillRanges(view.state.doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  const caret = view.state.selection.from;
  const dist = (r: { start: number; end: number }) =>
    Math.min(Math.abs(r.end - caret), Math.abs(r.start - caret));
  const target = ranges.reduce((best, r) => (dist(r) < dist(best) ? r : best), ranges[0]);
  return confirmScriptureDraftView(view, target.end, { focus: true });
}

/**
 * Drop the draft mark at the caret, leaving the text as plain prose (Escape).
 * For an edit-draft (Backspace on a committed pill), Escape restores the pill instead — cancelling
 * an edit should undo the edit, not destroy what was there.
 */
export function cancelScriptureDraftView(view: any): boolean {
  const { state } = view;
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return false;
  const range = getScriptureDraftRange(state);
  if (!range) return false;
  if (restoreScripturePillFromDraft(view, range.from, range.to)) {
    return true;
  }
  const tr = state.tr;
  tr.removeMark(range.from, range.to, draftType);
  stripProseFormattingFromDraftSpan(tr, state, range.from, range.to);
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}
