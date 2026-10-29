import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { isResolvableScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { Mapping } from '@tiptap/pm/transform';

/**
 * A saved pill span is only honored if BOTH its `data-scripture-reference` attribute and its
 * visible text are actual scripture references. This rejects corrupted/over-broad pills (e.g. a
 * whole list item "1. Obedience flows from a relationship with God" wrapped as a pill) at parse
 * time so they load as plain text instead of re-hydrating the corruption.
 *
 * The check is *resolvability*, not just shape. Detection is deliberately permissive — it
 * accepts unbounded digit runs — so `Exodus 16:1620` (an iOS-eaten hyphen in 16:16-20) used
 * to pass every gate and persist forever as a pill the server can never resolve, surfacing
 * as "Could not load this passage". Failing here unwraps it to plain text, which shows the
 * user their own words and lets them fix it.
 */
export function pillSpanIsValidReference(reference: string | null, text: string | null): boolean {
  if (!reference) return false;
  if (!isResolvableScriptureReference(reference)) return false;
  const t = (text || '').trim();
  if (t && !isResolvableScriptureReference(t)) return false;
  return true;
}

/**
 * Pills never break: a pill whose text stops being a real reference is unwrapped to plain text.
 *
 * Every path the editor owns keeps a pill's text valid — Backspace turns the pill into a draft,
 * Delete confirms first, a continuation key only grows the pill when the result resolves. iOS
 * goes around all of them: autocorrect and predictive text replace a word in place, and a held
 * Backspace deletes by word, none of which arrive as a keydown. They used to leave a pill
 * reading "Exod 32:1-" that still pointed at Exodus 32:1-35 and looked like one — or, worse,
 * "Exodus 32:1", a real reference that opened a different passage from the one it named.
 *
 * So after the fact, for the pills a transaction touched: a pill whose text no longer resolves
 * loses its mark, and so does one whose text *this transaction changed* to a different
 * reference than the one it carries. The words stay where the reader left them, and detection
 * re-pills them as what they now say. A pill whose text did not change is never judged on
 * agreement, so an old pill that happens to sit next to a keystroke is left as it was.
 */
export const scripturePillIntegrityKey = new PluginKey('scripturePillIntegrity');

function changedRangesInNewDoc(transactions: readonly Transaction[]): Array<[number, number]> {
  let ranges: Array<[number, number]> = [];
  for (const tr of transactions) {
    if (!tr.docChanged) continue;
    ranges = ranges.map(([a, b]) => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)]);
    tr.mapping.maps.forEach((map, index) => {
      const rest = tr.mapping.slice(index + 1);
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
      });
    });
  }
  return ranges;
}

function sameReference(a: string, b: string): boolean {
  const na = normalizeScriptureReference(a) ?? a.trim();
  const nb = normalizeScriptureReference(b) ?? b.trim();
  return na.toLowerCase() === nb.toLowerCase();
}

/**
 * Pill runs in `doc`, among those touching `ranges`, that no longer stand for what they show.
 * With `previous`, a run whose text differs from what it read before is also checked for
 * agreement with its `reference`.
 */
export function brokenScripturePillRuns(
  doc: ProseMirrorNode,
  ranges: Array<[number, number]>,
  previous?: { doc: ProseMirrorNode; map: (pos: number, assoc: number) => number },
): Array<{ from: number; to: number; mark: ProseMirrorMark }> {
  const markType = doc.type.schema.marks.scripturePill;
  if (!markType) return [];
  const seen = new Set<string>();
  const out: Array<{ from: number; to: number; mark: ProseMirrorMark }> = [];
  const size = doc.content.size;
  for (const [a, b] of ranges) {
    const from = Math.max(0, Math.min(a, b) - 1);
    const to = Math.min(size, Math.max(a, b) + 1);
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const mark = node.marks.find((m) => m.type === markType);
      if (!mark) return;
      const range = getMarkRange(doc.resolve(pos), markType, mark.attrs);
      if (!range) return;
      const key = `${range.from}:${range.to}`;
      if (seen.has(key)) return;
      seen.add(key);
      const text = doc.textBetween(range.from, range.to);
      const reference = mark.attrs.reference as string | null;
      if (!pillSpanIsValidReference(reference, text)) {
        out.push({ from: range.from, to: range.to, mark });
        return;
      }
      if (!previous || !reference) return;
      const oldFrom = previous.map(range.from, -1);
      const oldTo = previous.map(range.to, 1);
      const oldText = oldFrom < oldTo ? previous.doc.textBetween(oldFrom, oldTo) : '';
      if (oldText !== text && !sameReference(text, reference)) {
        out.push({ from: range.from, to: range.to, mark });
      }
    });
  }
  return out;
}

function scripturePillIntegrityPlugin(): Plugin {
  return new Plugin({
    key: scripturePillIntegrityKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const toOld = new Mapping();
      for (let i = transactions.length - 1; i >= 0; i--) toOld.appendMapping(transactions[i]!.mapping.invert());
      const broken = brokenScripturePillRuns(newState.doc, changedRangesInNewDoc(transactions), {
        doc: oldState.doc,
        map: (pos, assoc) => toOld.map(pos, assoc),
      });
      if (broken.length === 0) return null;
      const tr = newState.tr;
      for (const run of broken) tr.removeMark(run.from, run.to, run.mark);
      return tr.setMeta(scripturePillIntegrityKey, true);
    },
  });
}

/**
 * The keystroke a delete-type `beforeinput` stands for, when iOS sends one without a usable
 * keydown (soft-keyboard Backspace can arrive as `Unidentified`, a held Backspace deletes by
 * word). Null for everything else.
 */
export function pillDeleteKeyForInputType(inputType: string): 'Backspace' | 'Delete' | null {
  switch (inputType) {
    case 'deleteContentBackward':
    case 'deleteWordBackward':
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return 'Backspace';
    case 'deleteContentForward':
    case 'deleteWordForward':
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return 'Delete';
    default:
      return null;
  }
}

/**
 * Helper function to detect the current thread context from the page
 * Checks multiple sources: note element, navigation element, and URL pathname
 */
function getCurrentThreadContext(): string | null {
  if (typeof window === 'undefined') return null;
  
  const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
  if (noteElement?.dataset.parentThreadId) {
    return noteElement.dataset.parentThreadId;
  }
  
  const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
  if (navigationElement?.dataset.parentThreadId) {
    return navigationElement.dataset.parentThreadId;
  }
  
  const pathname = window.location.pathname;
  if (pathname && pathname !== '/' && !pathname.includes('/dashboard') &&
      !pathname.includes('/sign-in') && !pathname.includes('/sign-up')) {
    const itemId = extractIdFromPath(pathname);
    if (itemId && itemId !== 'dashboard' &&
        !itemId.startsWith('note_') && !itemId.startsWith('space_')) {
      return itemId;
    }
  }
  
  return null;
}

export interface ScripturePillOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scripturePill: {
      /**
       * Set a scripture pill mark
       */
      setScripturePill: (attributes: { reference: string; noteId: string | null; translation?: string | null }) => ReturnType;
      /**
       * Toggle a scripture pill mark
       */
      toggleScripturePill: (attributes: { reference: string; noteId: string | null; translation?: string | null }) => ReturnType;
      /**
       * Unset a scripture pill mark
       */
      unsetScripturePill: () => ReturnType;
    };
  }
}

export const ScripturePill = Mark.create<ScripturePillOptions>({
  name: 'scripturePill',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      reference: {
        default: null,
        parseHTML: element => element.getAttribute('data-scripture-reference'),
        renderHTML: attributes => {
          if (!attributes.reference) {
            return {};
          }
          return {
            'data-scripture-reference': attributes.reference,
          };
        },
      },
      noteId: {
        default: null,
        parseHTML: element => element.getAttribute('data-note-id'),
        renderHTML: attributes => {
          if (!attributes.noteId) {
            return {};
          }
          return {
            'data-note-id': attributes.noteId,
          };
        },
      },
      translation: {
        default: null,
        parseHTML: element => element.getAttribute('data-scripture-translation'),
        renderHTML: attributes => {
          if (!attributes.translation) {
            return {};
          }
          const id = attributes.translation as string;
          return {
            'data-scripture-translation': id,
            'data-scripture-translation-label': getTranslationAbbreviationDisplay(id),
          };
        },
      },
      pillAccent: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-pill-accent'),
        renderHTML: (attributes) => {
          if (!attributes.pillAccent) {
            return {};
          }
          return { 'data-pill-accent': attributes.pillAccent as string };
        },
      },
    };
  },

  // CRITICAL: Set inclusive to false to prevent mark "stickiness" at boundaries
  inclusive: false,
  
  // Nuclear option: exclude ALL other marks to prevent any "stickiness"
  // or inheritance when typing after a pill
  excludes: '_',

  parseHTML() {
    return [
      {
        tag: 'span[data-scripture-reference]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const reference = el.getAttribute('data-scripture-reference');
          if (!pillSpanIsValidReference(reference, el.textContent)) {
            return false;
          }
          const noteId = el.getAttribute('data-note-id');
          const translation = el.getAttribute('data-scripture-translation');
          const pillAccent = el.getAttribute('data-pill-accent');
          return { reference, noteId: noteId || null, translation: translation || null, pillAccent: pillAccent || null };
        },
      },
      {
        tag: 'span.note-link[data-scripture-reference]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const reference = el.getAttribute('data-scripture-reference');
          if (!pillSpanIsValidReference(reference, el.textContent)) {
            return false;
          }
          const noteId = el.getAttribute('data-note-id');
          const translation = el.getAttribute('data-scripture-translation');
          const pillAccent = el.getAttribute('data-pill-accent');
          return { reference, noteId: noteId || null, translation: translation || null, pillAccent: pillAccent || null };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const noteId = HTMLAttributes['data-note-id'] || null;
    const reference = HTMLAttributes['data-scripture-reference'] || null;

    if (!reference) {
      return ['span', {}, 0];
    }

    // Always use cursor: pointer to indicate interactivity, even for pending pills
    // No min-height — let the pill's height be determined by the same line-height as
    // surrounding text so lines with pills don't have different spacing.
    const baseStyle =
      'border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; font-style: normal; font-size: inherit; color: var(--color-deep-grey); vertical-align: baseline; line-height: inherit; user-select: all; white-space: normal; cursor: pointer;';

    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: 'scripture-pill scripture-pill-clickable',
        style: baseStyle,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setScripturePill: attributes => ({ commands }) => {
        return commands.setMark(this.name, attributes);
      },
      toggleScripturePill: attributes => ({ commands }) => {
        return commands.toggleMark(this.name, attributes);
      },
      unsetScripturePill: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      scripturePillIntegrityPlugin(),
      // Safety net: strip scripturePill from stored marks when cursor is after a pill
      // This prevents the mark from "sticking" to newly typed text
      new Plugin({
        key: new PluginKey('scripturePillStoredMarks'),
        appendTransaction(transactions, oldState, newState) {
          const { selection, storedMarks } = newState;
          if (!storedMarks) return null;

          const hasPillMark = storedMarks.some(m => m.type.name === 'scripturePill');
          if (!hasPillMark) return null;

          // Cursor is about to type with pill mark — check if we're actually inside a pill
          const $from = selection.$from;
          const marksAtCursor = $from.marks();
          const insidePill = marksAtCursor.some(m => m.type.name === 'scripturePill');

          // If cursor is NOT inside a pill, the stored marks shouldn't include pill
          if (!insidePill) {
            const cleaned = storedMarks.filter(m => m.type.name !== 'scripturePill');
            return newState.tr.setStoredMarks(cleaned);
          }

          return null;
        },
      }),
      // After every update, if the collapsed cursor landed inside a scripture pill (common with
      // inclusive:false + last-in-block), move it to the position after the mark. Uses
      // @tiptap/core getMarkRange — same helper as snapCursorOutsideScripturePill in TiptapEditor.
      new Plugin({
        key: new PluginKey('scripturePillSnapCursor'),
        appendTransaction(_transactions, _oldState, newState) {
          const sel = newState.selection;
          if (!(sel instanceof TextSelection)) return null;
          const markType = newState.schema.marks.scripturePill;
          if (!markType) return null;

          const $from = sel.$from;
          const parent = $from.parent;
          const offset = $from.parentOffset;

          const after = parent.childAfter(offset);
          const afterInPill = after.node?.marks.some((m: any) => m.type === markType) ?? false;
          const before = parent.childBefore(offset);
          const beforeInPill = before.node?.marks.some((m: any) => m.type === markType) ?? false;

          if (!afterInPill && !beforeInPill) return null;
          // Collapsed cursor at a pill's LEFT edge (pill is the next node, nothing pill-y before it)
          // is already OUTSIDE the pill — e.g. the start of a note that begins with a pill. Snapping it
          // to the pill end would make the front unreachable by ArrowLeft / Home / click. Leave it.
          if (afterInPill && !beforeInPill && sel.empty) return null;
          // Cursor right after pill with nothing following — visually inside the pill box.
          // Can't fix here (inserting a paragraph would mark the note as changed); handled
          // by CardFullEditable.handleEditorReady and snapCursorOutsideScripturePill instead.
          if (beforeInPill && !afterInPill && sel.empty) return null;

          // Cursor truly inside pill text — snap to end of mark range
          const range = getMarkRange($from, markType) || (beforeInPill ? getMarkRange(newState.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
          if (!range) return null;
          if (sel.empty && sel.from === range.to) return null;
          return newState.tr
            .setSelection(TextSelection.create(newState.doc, range.to))
            .setStoredMarks([])
            .setMeta('addToHistory', false);
        },
      }),
      new Plugin({
        key: new PluginKey('scripturePillActions'),
        props: {
          handleClick: (_view, _pos, event) => {
            // ALL pill clicks (edit and read-only) are handled by a DOM-level
            // click handler in TiptapEditor. user-select:none on pill spans causes
            // ProseMirror to report positions outside the mark boundary, so we
            // bypass ProseMirror's handleClick entirely for pill clicks.
            const target = event.target as HTMLElement;
            if (target?.closest?.('.scripture-pill')) {
              return false; // Let the DOM handler in TiptapEditor handle it
            }
            return false;
          },
        },
      }),
    ];
  },
});