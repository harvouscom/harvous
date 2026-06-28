import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  detectScriptureReferences,
  matchAnchoredTrailingTranslationAbbreviation,
} from '@/utils/scripture-detector';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { collectScripturePillRanges, ensureScripturePillSpacing } from '@/utils/scripture-pill-spacing';
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
    const plugins = [makeScriptureDraftGrowPlugin()];
    if (isMobileDevice()) {
      plugins.push(makeScriptureDraftDecorationPlugin());
    }
    return plugins;
  },
});

/** Mobile-only in-progress draft tracked as inline decorations (no mark mutations while typing). */
export type ScriptureDraftDecorationState = {
  from: number;
  to: number;
  attrs: { translation?: string | null; pillAccent?: string | null };
} | null;

export const scriptureDraftDecorationKey = new PluginKey<ScriptureDraftDecorationState>(
  'scriptureDraftDecoration',
);

/** Plugin state + inline decoration styling for the mobile draft path. */
export function makeScriptureDraftDecorationPlugin() {
  return new Plugin({
    key: scriptureDraftDecorationKey,
    state: {
      init(): ScriptureDraftDecorationState {
        return null;
      },
      apply(tr, value): ScriptureDraftDecorationState {
        const meta = tr.getMeta(scriptureDraftDecorationKey);
        if (meta !== undefined) return meta;
        if (value && tr.docChanged) {
          const from = tr.mapping.map(value.from, 1);
          // Non-inclusive end (matches the scriptureDraft mark): chars typed AT `to` land as plain
          // text outside the decoration until unify extends the range via plugin meta.
          const to = tr.mapping.map(value.to, -1);
          if (from >= to) return null;
          return { ...value, from, to };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const draft = scriptureDraftDecorationKey.getState(state);
        if (!draft) return DecorationSet.empty;
        const decoAttrs: Record<string, string> = {
          class: 'scripture-pill scripture-pill-draft',
          style: DRAFT_STYLE,
        };
        if (draft.attrs.translation) {
          decoAttrs['data-scripture-translation'] = draft.attrs.translation;
          decoAttrs['data-scripture-translation-label'] = getTranslationAbbreviationDisplay(
            draft.attrs.translation,
          );
        }
        return DecorationSet.create(state.doc, [
          Decoration.inline(draft.from, draft.to, decoAttrs),
        ]);
      },
    },
  });
}

function getDecorationDraftState(state: any): ScriptureDraftDecorationState {
  if (!isMobileDevice()) return null;
  return scriptureDraftDecorationKey.getState(state) ?? null;
}

function usesMobileDraftDecoration(state: any): boolean {
  return getDecorationDraftState(state) != null;
}

/**
 * Build the single `addMark` that grows/merges the draft to cover the full reference-in-progress
 * (re-derived from the text), or null when nothing needs changing. `computeScriptureDraftGrowth`
 * already merges split fragments into one run anchored at the first fragment, so one `addMark` over
 * that span (covering the `-`/gap between fragments) collapses them into a single pill — no
 * `removeMark` needed, which keeps the DOM mutation minimal.
 */
function buildScriptureDraftGrowthTr(state: any): any | null {
  const growth = computeScriptureDraftGrowth(state.doc, state.selection.from, state);
  if (!growth) return null;
  if (isMobileDevice()) {
    const current = getDecorationDraftState(state);
    if (!current) return null;
    const tr = state.tr;
    tr.setMeta(scriptureDraftDecorationKey, { ...current, from: growth.from, to: growth.to });
    tr.setMeta('addToHistory', false);
    return tr;
  }
  const draftType = state.schema.marks.scriptureDraft;
  if (!draftType) return null;
  // Reuse the anchor draft's attrs (e.g. a carried translation) so the regrown span keeps them.
  const existing = getMarkInstanceAt(state.doc, growth.from, draftType);
  const tr = state.tr;
  tr.addMark(growth.from, growth.to, draftType.create(existing ? { ...existing.attrs } : {}));
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
  const tr = buildScriptureDraftGrowthTr(view.state);
  if (!tr) return false;
  view.dispatch(tr);
  // iOS mark path: the addMark restructures the DOM — re-place the visible caret.
  if (!usesMobileDraftDecoration(view.state)) {
    resyncMobileCaret(view);
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

/** Resolve the draft range covering (or ending at) `pos`. */
function findDraftRange(state: any, pos: number): { from: number; to: number } | null {
  const deco = getDecorationDraftState(state);
  if (deco) return { from: deco.from, to: deco.to };

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
  const deco = getDecorationDraftState(state);
  if (deco) {
    return extendRangeOverTrailingContinuation(state.doc, deco.to);
  }

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
  const deco = getDecorationDraftState(state);
  if (deco) {
    if (isCaretAttachedToScriptureDraft(state, deco.from, deco.to)) return null;
    return { from: deco.from, to: deco.to };
  }

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
 */
export function draftTextToReference(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const refs = detectScriptureReferences(trimmed);
  if (refs.length === 0) return null;
  return refs.reduce((a, b) => (b.reference.length > a.reference.length ? b : a)).reference;
}

// ── Mutations ───────────────────────────────────────────────────────────────────

/** Last text node under `root` (depth-first), for native caret placement inside pills. */
function getLastTextNodeIn(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  let last: Text | null = null;
  for (let i = 0; i < root.childNodes.length; i++) {
    const found = getLastTextNodeIn(root.childNodes[i]);
    if (found) last = found;
  }
  return last;
}

/** Committed pill span (not draft) nearest `pos`, or null. */
function findCommittedPillElement(view: any, pos: number): HTMLElement | null {
  try {
    const { node } = view.domAtPos(Math.max(pos - 1, 0));
    let el: Node | null = node;
    while (el && el !== view.dom) {
      if (
        el instanceof HTMLElement &&
        el.classList?.contains('scripture-pill') &&
        !el.classList?.contains('scripture-pill-draft')
      ) {
        return el;
      }
      el = el.parentNode;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Set the browser Selection to `pos`, preferring the last text node inside a draft/pill span
 * (same anchor strategy as the floating ✓) before falling back to `view.domAtPos`.
 */
function applyNativeCaret(view: any, pos: number): void {
  if (!view || view.isDestroyed) return;
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel) return;

  const pmPos = Math.min(pos, view.state.doc.content.size);

  const draftEl = getScriptureDraftAnchorElement(view, pmPos);
  if (draftEl) {
    const textNode = getLastTextNodeIn(draftEl);
    if (textNode) {
      const range = document.createRange();
      range.setStart(textNode, textNode.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }

  const pillEl = findCommittedPillElement(view, pmPos);
  if (pillEl) {
    let next: Node | null = pillEl.nextSibling;
    while (next) {
      if (next.nodeType === Node.TEXT_NODE) {
        const textNode = next as Text;
        const dom = view.domAtPos(pmPos);
        const offset =
          dom?.node === textNode
            ? dom.offset
            : Math.min(pmPos > 0 ? 1 : 0, textNode.length);
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      next = next.nextSibling;
    }
  }

  try {
    const dom = view.domAtPos(pmPos);
    if (!dom?.node) return;
    const range = document.createRange();
    range.setStart(dom.node, dom.offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
}

/**
 * iOS only: force the native caret to ProseMirror's selection position after PM's DOM patch lands.
 *
 * A programmatic mark change (adding/growing the draft) restructures the contenteditable, and iOS
 * leaves the *visible* caret stuck at the line end even though ProseMirror's selection is correct.
 * Re-dispatching a ProseMirror selection does NOT help — PM recorded that it already synced the DOM
 * selection (iOS moved the painted caret without telling PM), so the comparison is a no-op. We set
 * the DOM `Selection` directly instead, which is what typing a real character effectively does.
 * Skipped on the mobile decoration draft path (no doc mutation while typing).
 */
export function resyncMobileCaret(view: any, opts?: { focus?: boolean }): void {
  if (!isMobileDevice() || !view) return;
  if (usesMobileDraftDecoration(view.state)) return;

  requestAnimationFrame(() => {
    try {
      if (!view || view.isDestroyed) return;
      if (opts?.focus) {
        try {
          view.focus();
        } catch {
          /* ignore */
        }
      }
      requestAnimationFrame(() => {
        try {
          if (!view || view.isDestroyed) return;
          applyNativeCaret(view, view.state.selection.from);
          setTimeout(() => {
            if (!view || view.isDestroyed) return;
            applyNativeCaret(view, view.state.selection.from);
          }, 16);
        } catch {
          /* ignore */
        }
      });
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

  if (isMobileDevice()) {
    if (getDecorationDraftState(state)) return false;
    const tr = state.tr;
    if (caretInside) {
      tr.setSelection(TextSelection.create(tr.doc, to));
      tr.setStoredMarks([]);
    }
    tr.setMeta(scriptureDraftDecorationKey, { from, to, attrs: {} });
    tr.setMeta('addToHistory', true);
    view.dispatch(tr);
    return true;
  }

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
  // iOS mark path: wrapping the reference restructures the DOM and strands the visible caret.
  resyncMobileCaret(view);
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
  state?: any,
): { from: number; to: number } | null {
  const deco = state ? getDecorationDraftState(state) : null;
  if (deco) {
    const to = extendRangeOverTrailingContinuation(doc, deco.to);
    if (to === deco.to) return null;
    return { from: deco.from, to };
  }

  const ranges = collectScripturePillRanges(doc, 'scriptureDraft');
  if (ranges.length === 0) return null;
  // Merge draft fragments separated only by reference-continuation chars in the same block into one
  // run: on iOS a growing draft can split into several fragments (e.g. "John 3:16" + "17") that all
  // belong to the same reference-in-progress and must collapse back into a single pill — anchored at
  // the FIRST fragment's start so the earlier text is never dropped.
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
  // Already a single contiguous range with nothing more to absorb.
  if (ranges.length === 1 && run.start === ranges[0].start && to === ranges[0].end) return null;
  return { from: run.start, to };
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

  const decoDraft = getDecorationDraftState(state);

  // Absorb any range tail that ended up as plain text just after the draft (iOS).
  const effectiveTo = Math.max(range.to, extendRangeOverTrailingContinuation(state.doc, range.to));
  const rawText = state.doc.textBetween(range.from, effectiveTo);
  const reference = draftTextToReference(rawText);
  const tr = state.tr;

  if (!reference) {
    // Not a valid reference — strip the draft styling, keep the typed text as prose.
    if (decoDraft) {
      tr.setMeta(scriptureDraftDecorationKey, null);
    } else {
      tr.removeMark(range.from, range.to, draftType);
    }
    tr.setStoredMarks([]);
    tr.setMeta('addToHistory', true);
    view.dispatch(tr);
    return null;
  }

  // Preserve the translation/accent carried in from the pill being edited (backspace → Edit).
  const carried = decoDraft
    ? { attrs: decoDraft.attrs }
    : getMarkInstanceAt(state.doc, range.from, draftType);
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
  // Clear stored marks BEFORE the trailing spacer is inserted: ensureScripturePillSpacing →
  // tr.insertText reads tr.storedMarks, so an active bold/italic mark (from typing the reference
  // while a formatting button was on) would otherwise land on the inserted space and keep the
  // formatting "on" for everything typed after the committed pill.
  tr.setStoredMarks([]);
  // One trailing spacer so prose after the pill is editable (shared pill-spacing rule).
  ensureScripturePillSpacing(tr);

  let caret = pillEnd;
  const charAfter = tr.doc.textBetween(pillEnd, Math.min(pillEnd + 1, tr.doc.content.size));
  if (charAfter === ' ') caret = pillEnd + 1;
  const caretPos = Math.min(caret, tr.doc.content.size);
  tr.setSelection(TextSelection.create(tr.doc, caretPos));
  tr.setStoredMarks([]);
  tr.scrollIntoView();
  tr.setMeta('addToHistory', true);
  if (decoDraft) {
    tr.setMeta(scriptureDraftDecorationKey, null);
  }
  view.dispatch(tr);

  // iOS mark path: after commit the visible caret can stick at the line end. Decoration path skips
  // resync (no mid-type doc mutation). Focus is applied on the first rAF inside resyncMobileCaret.
  resyncMobileCaret(view, { focus: opts?.focus });

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
  const deco = getDecorationDraftState(view.state);
  if (deco) {
    return confirmScriptureDraftView(view, deco.to, { focus: true });
  }
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
  if (getDecorationDraftState(state)) {
    tr.setMeta(scriptureDraftDecorationKey, null);
  } else {
    tr.removeMark(range.from, range.to, draftType);
  }
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  return true;
}
