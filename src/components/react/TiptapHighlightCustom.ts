import Highlight from '@tiptap/extension-highlight';

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
 * Multicolor highlight + optional server `studyThreadEntryId` on the mark.
 * Rendering avoids inline background fill — prototype CSS draws underline + `data-color`.
 */
export const HighlightCustom = Highlight.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      multicolor: true,
    };
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
