import Bold from '@tiptap/extension-bold';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function cursorTouchesScripturePillOrDraft(state: any, from: number): boolean {
  if (from <= 0) return false;
  try {
    const $prev = state.doc.resolve(from - 1);
    const prevMarks = $prev.marks();
    if (prevMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'scriptureDraft')) {
      return true;
    }
    const $from = state.doc.resolve(from);
    const atMarks = $from.marks();
    return atMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'scriptureDraft');
  } catch {
    return false;
  }
}

/**
 * Custom Bold extension that prevents bold from being applied
 * to text right after a scripture pill or while editing a scripture draft.
 */
export const BoldCustom = Bold.extend({
  addCommands() {
    return {
      ...this.parent?.() || {},
      toggleBold: () => ({ state, dispatch, chain }) => {
        const { selection } = state;
        const { from } = selection;

        if (from === selection.to && cursorTouchesScripturePillOrDraft(state, from)) {
          if (dispatch) {
            const tr = state.tr.setStoredMarks(
              (state.storedMarks || []).filter((m: any) => m.type.name !== 'bold'),
            );
            dispatch(tr);
          }
          return false;
        }

        return chain().toggleMark('bold').run();
      },
    };
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() || [])];
  },
});
