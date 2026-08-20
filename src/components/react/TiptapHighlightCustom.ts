import Highlight from '@tiptap/extension-highlight';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Strip the `highlight` mark from stored marks whenever the caret isn't inside a highlight, so
 * text typed right after (or on a new line below) a freshly-created highlight isn't highlighted.
 * Mirrors `scripturePillStoredMarks` in TiptapScripturePill.ts. Paired with `inclusive: false`.
 */
export function makeHighlightStoredMarksPlugin() {
  return new Plugin({
    key: new PluginKey('highlightStoredMarks'),
    appendTransaction(_transactions, _oldState, newState) {
      const { selection, storedMarks } = newState;
      if (!storedMarks) return null;
      if (!storedMarks.some((m) => m.type.name === 'highlight')) return null;
      const insideHighlight = selection.$from.marks().some((m) => m.type.name === 'highlight');
      if (insideHighlight) return null;
      return newState.tr.setStoredMarks(storedMarks.filter((m) => m.type.name !== 'highlight'));
    },
  });
}

function blockHighlightAfterPill(state: any, dispatch: any): boolean {
  const { selection } = state;
  const { from } = selection;
  if (from > 0 && from === selection.to) {
    try {
      const $prev = state.doc.resolve(from - 1);
      const hasPill = $prev.marks().some((m: { type: { name: string } }) => m.type.name === 'scripturePill');
      if (hasPill) {
        if (dispatch) {
          const tr = state.tr.setStoredMarks(
            (state.storedMarks || []).filter((m: { type: { name: string } }) => m.type.name !== 'highlight'),
          );
          dispatch(tr);
        }
        return true;
      }
    } catch {
      /* allow */
    }
  }
  return false;
}

/**
 * The attributes this mark actually carries.
 *
 * `@tiptap/extension-highlight` declares `setHighlight` as taking `{ color: string }`, which
 * stopped being true the moment `addAttributes` below grew `studyThreadEntryId`, `reference`
 * and `linkedNoteId`. Callers passing them were correct and the compiler was rejecting them,
 * which is the wrong way round — so re-declare the commands against the real shape rather
 * than leaving real call sites red.
 */
export interface HighlightCustomAttributes {
  color?: string | null;
  /** Server id of the StudyThreadEntry this highlight is stored as, once it has one. */
  studyThreadEntryId?: string | null;
  /** Set when the highlight came from "Look up" — clicking it opens the reference dock. */
  reference?: string | null;
  /** Set when clicking should open a connected-note popup instead of a dock. */
  linkedNoteId?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlightCustom: {
      setHighlight: (attributes?: HighlightCustomAttributes) => ReturnType;
      toggleHighlight: (attributes?: HighlightCustomAttributes) => ReturnType;
    };
  }
}

/**
 * Multicolor highlight + optional server `studyThreadEntryId` on the mark.
 * Rendering avoids inline background fill — prototype CSS draws underline + `data-color`.
 */
export const HighlightCustom = Highlight.extend({
  // Typing at a highlight's edge must NOT extend it (no mark stickiness) — paired with the
  // highlightStoredMarks plugin below. Do NOT set `excludes`: highlights coexist with bold/italic.
  inclusive: false,

  addOptions() {
    const parent = this.parent?.();
    return {
      ...parent,
      // Spelled out rather than left to the spread: `parent` is optional, so spreading it
      // alone leaves `HTMLAttributes` optional while `HighlightOptions` requires it.
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      multicolor: true,
    };
  },

  addProseMirrorPlugins() {
    return [makeHighlightStoredMarksPlugin()];
  },

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-color') || element.style.backgroundColor,
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return { 'data-color': attributes.color as string };
        },
      },
      studyThreadEntryId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-study-thread-id'),
        renderHTML: (attributes) => {
          if (!attributes.studyThreadEntryId) {
            return {};
          }
          return { 'data-study-thread-id': String(attributes.studyThreadEntryId) };
        },
      },
      // Reference word — when set, this highlight was created by "Look up" and clicking it
      // opens the reference dock for that word (instead of the regular highlight dock).
      // Visually identical to a regular highlight (uses the same color attribute).
      reference: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-reference'),
        renderHTML: (attributes) => {
          if (!attributes.reference) {
            return {};
          }
          return { 'data-reference': String(attributes.reference) };
        },
      },
      // When set, clicking this highlight opens a connected-note popup instead of the dock.
      linkedNoteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-linked-note-id'),
        renderHTML: (attributes) => {
          if (!attributes.linkedNoteId) return {};
          return { 'data-linked-note-id': String(attributes.linkedNoteId) };
        },
      },
    };
  },

  addCommands() {
    const parentCommands = this.parent?.() || {};
    return {
      ...parentCommands,
      setHighlight:
        (attributes) =>
        ({ state, dispatch, commands }) => {
          if (blockHighlightAfterPill(state, dispatch)) return false;
          return commands.setMark(this.name, attributes || {});
        },
      toggleHighlight:
        (attributes) =>
        ({ state, dispatch, commands }) => {
          if (blockHighlightAfterPill(state, dispatch)) return false;
          return commands.toggleMark(this.name, attributes || {});
        },
    };
  },
});
